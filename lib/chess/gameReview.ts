import { Chess, type Square } from 'chess.js';
import type { Repertoire, ImportedGame } from '@/types/chess';
import { RepertoireDAG, fenToNodeId, STARTING_FEN } from './dag';
import { evaluateFenWithStockfish, type PositionEngineEval } from './stockfish';

export type MoveClassification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder';

export interface ClassificationMeta {
  label: string;
  short: string;
  badgeBg: string;
  textColor: string;
  dotColor: string;
}

export const CLASSIFICATION_META: Record<MoveClassification, ClassificationMeta> = {
  brilliant: {
    label: 'Brilliant',
    short: '!!',
    badgeBg: 'bg-cyan-500/20 border-cyan-500/40',
    textColor: 'text-cyan-400',
    dotColor: '#06B6D4',
  },
  great: {
    label: 'Great',
    short: '!',
    badgeBg: 'bg-blue-500/20 border-blue-500/40',
    textColor: 'text-blue-400',
    dotColor: '#3B82F6',
  },
  book: {
    label: 'Book',
    short: '📖',
    badgeBg: 'bg-amber-700/20 border-amber-600/40',
    textColor: 'text-amber-500',
    dotColor: '#D97706',
  },
  best: {
    label: 'Best',
    short: '★',
    badgeBg: 'bg-emerald-500/20 border-emerald-500/40',
    textColor: 'text-emerald-400',
    dotColor: '#10B981',
  },
  excellent: {
    label: 'Excellent',
    short: '👍',
    badgeBg: 'bg-green-500/20 border-green-500/40',
    textColor: 'text-green-400',
    dotColor: '#22C55E',
  },
  good: {
    label: 'Good',
    short: '✓',
    badgeBg: 'bg-teal-500/20 border-teal-500/40',
    textColor: 'text-teal-400',
    dotColor: '#14B8A6',
  },
  inaccuracy: {
    label: 'Inaccuracy',
    short: '?!',
    badgeBg: 'bg-yellow-500/20 border-yellow-500/40',
    textColor: 'text-yellow-400',
    dotColor: '#EAB308',
  },
  mistake: {
    label: 'Mistake',
    short: '?',
    badgeBg: 'bg-orange-500/20 border-orange-500/40',
    textColor: 'text-orange-400',
    dotColor: '#F97316',
  },
  miss: {
    label: 'Miss',
    short: '✕',
    badgeBg: 'bg-red-500/20 border-red-500/40',
    textColor: 'text-red-400',
    dotColor: '#EF4444',
  },
  blunder: {
    label: 'Blunder',
    short: '??',
    badgeBg: 'bg-rose-600/25 border-rose-600/50',
    textColor: 'text-rose-400',
    dotColor: '#E11D48',
  },
};

export interface MoveReviewItem {
  ply: number;
  moveNumber: number;
  turn: 'white' | 'black';
  san: string;
  from: string;
  to: string;
  fenBefore: string;
  fenAfter: string;
  evalBeforeCp: number;
  evalAfterCp: number;
  centipawnLoss: number;
  classification: MoveClassification;
  bestMove: { from: string; to: string; san: string; evalCp: number } | null;
  comment: string;
  tacticalExplanation: string;
  engineSource: 'lichess-server' | 'lichess-cloud' | 'local-stockfish';
}

export interface GameReviewResult {
  whiteAccuracy: number;
  blackAccuracy: number;
  moves: MoveReviewItem[];
  positions: string[];
  evalHistory: number[];
  counts: {
    white: Record<MoveClassification, number>;
    black: Record<MoveClassification, number>;
  };
  summaryComment: string;
  isRealStockfish: boolean;
}

/**
 * Calculates win probability from centipawn evaluation (Chess.com/Lichess Sigmoid model)
 */
function centipawnsToWinProb(cp: number): number {
  return 100 / (1 + Math.pow(10, -cp / 400));
}

/**
 * Converts win probability loss into Chess.com-style accuracy (0 - 100%)
 */
function winProbLossToAccuracy(deltaWin: number): number {
  const d = Math.max(0, deltaWin);
  const acc = 103.1668 * Math.exp(-0.04354 * d) - 3.1669;
  return Math.min(100, Math.max(0, acc));
}

const COMMON_BOOK_LINES = new Set([
  'e4', 'd4', 'c4', 'Nf3', 'g3', 'b3', 'f4', 'Nc3',
  'e5', 'c5', 'e6', 'c6', 'Nf6', 'd5', 'g6', 'd6',
  'Nf3 Nc6', 'd4 exd4', 'Nxd4 Nf6', 'Nc3 a6', 'Bg5 e6',
  'Bc4 Bc5', 'c3 Nf6', 'd3 d6', 'O-O O-O',
]);

/**
 * Parse embedded [%eval ...] comments from PGN text
 */
function extractPgnEvals(pgn: string): number[] {
  const evals: number[] = [];
  const regex = /\{\s*\[%eval\s+(-?\d+(?:\.\d+)?|#-?\d+)\]/g;
  let match;
  while ((match = regex.exec(pgn)) !== null) {
    const raw = match[1];
    let cp = 0;
    if (raw.startsWith('#')) {
      const m = parseInt(raw.slice(1), 10);
      cp = m > 0 ? 30000 : -30000;
    } else {
      cp = Math.round(parseFloat(raw) * 100);
    }
    evals.push(cp);
  }
  return evals;
}

/**
 * Generates an insightful, context-aware Chess.com Coach explanation based on actual Stockfish findings
 */
function generateCoachComment(
  san: string,
  turn: 'white' | 'black',
  classification: MoveClassification,
  centipawnLoss: number,
  bestSan: string | null,
  capturedPiece: string | null,
  isCheck: boolean,
  evalAfterCp: number
): { comment: string; explanation: string } {
  const side = turn === 'white' ? 'White' : 'Black';
  const opp = turn === 'white' ? 'Black' : 'White';
  const evalFormatted = evalAfterCp >= 0 ? `+${(evalAfterCp / 100).toFixed(2)}` : `${(evalAfterCp / 100).toFixed(2)}`;

  switch (classification) {
    case 'book':
      return {
        comment: `${san} is standard opening theory.`,
        explanation: 'Follows established grandmaster preparation, staking a claim in the center and facilitating piece development.',
      };

    case 'brilliant':
      return {
        comment: `Incredible move! ${san} is a brilliant tactical breakthrough!`,
        explanation: `A daring sacrifice that shatters ${opp}'s structure and seizes an overwhelming tactical initiative (${evalFormatted}).`,
      };

    case 'great':
      return {
        comment: `${san} is a great move! You found the only continuation to maintain the advantage.`,
        explanation: `A sharp defensive or aggressive resource that neutralizes ${opp}'s threats.`,
      };

    case 'best':
      return {
        comment: `${san} is the top Stockfish engine move. Precision play!`,
        explanation: isCheck
          ? `Delivers a forceful check, pressing the initiative against the enemy king.`
          : capturedPiece
            ? `Calculated capture that wins material and cleans up the position.`
            : `Coordinates pieces purposefully while maximizing square control and activity.`,
      };

    case 'excellent':
      return {
        comment: `${san} is an excellent move, very close to the optimal engine choice.`,
        explanation: 'Keeps high pressure and maintains a strong positional grip on the board.',
      };

    case 'good':
      return {
        comment: `${san} is a solid and natural move.`,
        explanation: 'Safely advances the position without conceding meaningful ground.',
      };

    case 'inaccuracy':
      return {
        comment: `${san} is an inaccuracy (${centipawnLoss > 0 ? `-${(centipawnLoss / 100).toFixed(1)} cp` : ''}).`,
        explanation: bestSan
          ? `Slightly imprecise. Stockfish preferred ${bestSan} to maintain optimal piece placement.`
          : `Slightly slows down the initiative and allows ${opp} room to maneuver.`,
      };

    case 'mistake':
      return {
        comment: `${san} is a mistake! It concedes the advantage to ${opp}.`,
        explanation: bestSan
          ? `This concedes positional control. Stockfish recommended ${bestSan} as significantly stronger.`
          : `Creates vulnerable weaknesses in your position that your opponent can exploit.`,
      };

    case 'miss':
      return {
        comment: `${san} is a missed opportunity.`,
        explanation: bestSan
          ? `You had a chance to punish ${opp}'s previous blunder with ${bestSan}.`
          : `Overlooks an immediate tactical shot to claim material or decisive dominance.`,
      };

    case 'blunder':
      return {
        comment: `${san} is a blunder! This drastically shifts the evaluation to ${evalFormatted}.`,
        explanation: bestSan
          ? `Hangs valuable tactical resources. Playing ${bestSan} was required to stay in the game.`
          : `A decisive error that hands winning chances directly to ${opp}.`,
      };
  }
}

/**
 * Analyzes a game using real Stockfish evaluations:
 * 1. Uses embedded Lichess raw analysis if available
 * 2. Uses embedded PGN [%eval ...] comments if available
 * 3. Falls back to real Lichess Cloud Stockfish (Depth 50-70+) and client-side Stockfish
 */
export async function analyzeFullGameAsync(
  game: ImportedGame,
  userColor: 'white' | 'black' = 'white',
  dag?: RepertoireDAG,
  repertoire?: Repertoire,
  onProgress?: (progressPercent: number, message: string) => void
): Promise<GameReviewResult> {
  const chess = new Chess();
  try {
    chess.loadPgn(game.pgn);
  } catch {
    try {
      const clean = game.pgn.replace(/\[.*?\]\s*/g, '').trim();
      chess.loadPgn(clean);
    } catch {
      // fallback
    }
  }

  const rawMoves = chess.history({ verbose: true });
  const walkChess = new Chess();
  const positions: string[] = [STARTING_FEN];
  const evalHistory: number[] = [20];
  const reviewMoves: MoveReviewItem[] = [];

  const counts = {
    white: {
      brilliant: 0,
      great: 0,
      best: 0,
      excellent: 0,
      good: 0,
      book: 0,
      inaccuracy: 0,
      mistake: 0,
      miss: 0,
      blunder: 0,
    },
    black: {
      brilliant: 0,
      great: 0,
      best: 0,
      excellent: 0,
      good: 0,
      book: 0,
      inaccuracy: 0,
      mistake: 0,
      miss: 0,
      blunder: 0,
    },
  };

  const whiteAccuracyAccum: number[] = [];
  const blackAccuracyAccum: number[] = [];

  // Check if PGN has embedded Stockfish evals
  const pgnEvals = extractPgnEvals(game.pgn);
  const hasRawLichess = Array.isArray(game.rawAnalysis) && game.rawAnalysis.length > 0;
  const hasEmbeddedPgnEvals = pgnEvals.length >= rawMoves.length;

  let prevOpponentBlundered = false;

  for (let ply = 0; ply < rawMoves.length; ply++) {
    const move = rawMoves[ply];
    const turn = walkChess.turn() === 'w' ? 'white' : 'black';
    const moveNumber = Math.floor(ply / 2) + 1;
    const fenBefore = walkChess.fen();

    // Progress update
    if (onProgress && !hasRawLichess && !hasEmbeddedPgnEvals && ply % 4 === 0) {
      const pct = Math.round(((ply + 1) / rawMoves.length) * 100);
      onProgress(pct, `Analyzing position with Stockfish (${ply + 1}/${rawMoves.length})...`);
    }

    let beforeScoreCp = evalHistory[evalHistory.length - 1] ?? 20;
    let afterScoreCp = 20;
    let bestMove: { from: string; to: string; san: string; evalCp: number } | null = null;
    let engineSource: 'lichess-server' | 'lichess-cloud' | 'local-stockfish' = 'local-stockfish';
    let lichessJudgment: string | undefined;

    // 1. Check Lichess raw server analysis
    if (hasRawLichess && game.rawAnalysis![ply]) {
      const serverItem = game.rawAnalysis![ply];
      engineSource = 'lichess-server';
      if (serverItem.eval !== undefined) {
        afterScoreCp = serverItem.eval;
      } else if (serverItem.mate !== undefined) {
        afterScoreCp = serverItem.mate > 0 ? 30000 : -30000;
      }
      if (serverItem.judgment) {
        lichessJudgment = serverItem.judgment.name;
      }
      if (serverItem.best) {
        const uci = serverItem.best;
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        try {
          const testChess = new Chess(fenBefore);
          const m = testChess.move({ from: from as Square, to: to as Square, promotion: (uci[4] as any) || undefined });
          if (m) {
            bestMove = { from, to, san: m.san, evalCp: afterScoreCp };
          }
        } catch {}
      }
    } else if (hasEmbeddedPgnEvals && pgnEvals[ply] !== undefined) {
      // 2. Check embedded PGN evals
      engineSource = 'lichess-server';
      afterScoreCp = pgnEvals[ply];
    } else {
      // 3. Query Real Stockfish (Cloud or Web Worker)
      const sfBefore = await evaluateFenWithStockfish(fenBefore);
      engineSource = sfBefore.source;
      beforeScoreCp = sfBefore.scoreCp;

      if (sfBefore.bestMoveUci && sfBefore.bestMoveSan) {
        bestMove = {
          from: sfBefore.bestMoveUci.slice(0, 2),
          to: sfBefore.bestMoveUci.slice(2, 4),
          san: sfBefore.bestMoveSan,
          evalCp: sfBefore.scoreCp,
        };
      }
    }

    // Play move
    walkChess.move(move);
    const fenAfter = walkChess.fen();
    positions.push(fenAfter);

    if (!hasRawLichess && !hasEmbeddedPgnEvals) {
      const sfAfter = await evaluateFenWithStockfish(fenAfter);
      afterScoreCp = sfAfter.scoreCp;
    }

    evalHistory.push(afterScoreCp);

    // Calculate centipawn loss from moving player's perspective
    let cpLoss = 0;
    if (turn === 'white') {
      cpLoss = Math.max(0, beforeScoreCp - afterScoreCp);
    } else {
      cpLoss = Math.max(0, afterScoreCp - beforeScoreCp);
    }

    // Check opening book
    const nodeIdBefore = fenToNodeId(fenBefore);
    let isBook = false;
    if (dag && repertoire) {
      const repEdges = dag.getEdgesFrom(nodeIdBefore).filter((e) => e.repertoireId === repertoire.id);
      if (repEdges.some((e) => e.san === move.san)) {
        isBook = true;
      }
    }
    if (!isBook && ply < 12 && COMMON_BOOK_LINES.has(move.san)) {
      isBook = true;
    }

    // Classification
    let classification: MoveClassification;
    if (lichessJudgment) {
      if (lichessJudgment === 'Blunder') classification = 'blunder';
      else if (lichessJudgment === 'Mistake') classification = 'mistake';
      else if (lichessJudgment === 'Inaccuracy') classification = 'inaccuracy';
      else classification = isBook ? 'book' : 'good';
    } else if (isBook && cpLoss < 60) {
      classification = 'book';
    } else {
      const isSacrifice =
        (move.piece === 'q' || move.piece === 'r' || move.piece === 'b' || move.piece === 'n') &&
        move.captured !== undefined &&
        ((turn === 'white' && afterScoreCp >= 150) || (turn === 'black' && afterScoreCp <= -150));

      if (isSacrifice && cpLoss <= 15) {
        classification = 'brilliant';
      } else if (cpLoss <= 12) {
        classification = 'best';
      } else if (cpLoss <= 30) {
        classification = 'excellent';
      } else if (cpLoss <= 65) {
        classification = 'good';
      } else if (prevOpponentBlundered && cpLoss > 120) {
        classification = 'miss';
      } else if (cpLoss <= 130) {
        classification = 'inaccuracy';
      } else if (cpLoss <= 250) {
        classification = 'mistake';
      } else {
        classification = 'blunder';
      }
    }

    counts[turn][classification]++;
    prevOpponentBlundered = classification === 'blunder' || classification === 'mistake';

    // Win% delta and Move Accuracy
    const winProbBefore = centipawnsToWinProb(turn === 'white' ? beforeScoreCp : -beforeScoreCp);
    const winProbAfter = centipawnsToWinProb(turn === 'white' ? afterScoreCp : -afterScoreCp);
    const deltaWin = Math.max(0, winProbBefore - winProbAfter);
    const moveAccuracy = winProbLossToAccuracy(deltaWin);

    if (turn === 'white') {
      whiteAccuracyAccum.push(moveAccuracy);
    } else {
      blackAccuracyAccum.push(moveAccuracy);
    }

    const { comment, explanation } = generateCoachComment(
      move.san,
      turn,
      classification,
      cpLoss,
      bestMove?.san ?? null,
      move.captured ?? null,
      walkChess.inCheck(),
      afterScoreCp
    );

    reviewMoves.push({
      ply,
      moveNumber,
      turn,
      san: move.san,
      from: move.from,
      to: move.to,
      fenBefore,
      fenAfter,
      evalBeforeCp: beforeScoreCp,
      evalAfterCp: afterScoreCp,
      centipawnLoss: cpLoss,
      classification,
      bestMove,
      comment,
      tacticalExplanation: explanation,
      engineSource,
    });
  }

  // Use official accuracy from Chess.com or calculate from real moves
  let whiteAccuracy = game.accuracies?.white;
  let blackAccuracy = game.accuracies?.black;

  if (whiteAccuracy === undefined) {
    whiteAccuracy =
      whiteAccuracyAccum.length > 0
        ? Math.round((whiteAccuracyAccum.reduce((a, b) => a + b, 0) / whiteAccuracyAccum.length) * 10) / 10
        : 80.0;
  }
  if (blackAccuracy === undefined) {
    blackAccuracy =
      blackAccuracyAccum.length > 0
        ? Math.round((blackAccuracyAccum.reduce((a, b) => a + b, 0) / blackAccuracyAccum.length) * 10) / 10
        : 75.0;
  }

  let summaryComment = 'A sharp battle with critical turning points.';
  if (whiteAccuracy > 85 && blackAccuracy > 85) {
    summaryComment = 'A masterclass of high accuracy and solid preparation from both sides.';
  } else if (userColor === 'white' && whiteAccuracy > blackAccuracy + 12) {
    summaryComment = 'You dominated the board with superior accuracy, capitalizing on opponent mistakes.';
  } else if (userColor === 'black' && blackAccuracy > whiteAccuracy + 12) {
    summaryComment = 'Black took firm control and executed the tactical conversion cleanly.';
  }

  return {
    whiteAccuracy,
    blackAccuracy,
    moves: reviewMoves,
    positions,
    evalHistory,
    counts,
    summaryComment,
    isRealStockfish: true,
  };
}
