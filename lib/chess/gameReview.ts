import { Chess, type Square } from 'chess.js';
import type { Repertoire } from '@/types/chess';
import { RepertoireDAG, fenToNodeId, STARTING_FEN } from './dag';
import { evaluatePosition } from './eval';

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
}

export interface GameReviewResult {
  whiteAccuracy: number;
  blackAccuracy: number;
  moves: MoveReviewItem[];
  positions: string[]; // FEN for every ply (index 0 is starting FEN)
  evalHistory: number[]; // Evaluation in centipawns from White's perspective for each ply
  counts: {
    white: Record<MoveClassification, number>;
    black: Record<MoveClassification, number>;
  };
  summaryComment: string;
}

/**
 * Calculates win probability from centipawn evaluation (sigmoid model)
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
 * Generates an intelligent, conversational Chess.com Coach explanation
 */
function generateCoachComment(
  san: string,
  turn: 'white' | 'black',
  classification: MoveClassification,
  centipawnLoss: number,
  bestSan: string | null,
  capturedPiece: string | null,
  isCheck: boolean
): { comment: string; explanation: string } {
  const side = turn === 'white' ? 'White' : 'Black';
  const opp = turn === 'white' ? 'Black' : 'White';

  switch (classification) {
    case 'book':
      return {
        comment: `${san} is standard opening theory.`,
        explanation: 'Follows established grandmaster preparation, fighting for control of central squares and activating key pieces.',
      };

    case 'brilliant':
      return {
        comment: `Incredible move! ${san} is a brilliant tactical breakthrough!`,
        explanation: `A daring sacrifice that shatters ${opp}'s structure and seizes an overwhelming tactical initiative.`,
      };

    case 'great':
      return {
        comment: `${san} is a great move! You found the only continuation to maintain the advantage.`,
        explanation: `A sharp defensive or aggressive resource that prevents ${opp}'s counterplay.`,
      };

    case 'best':
      return {
        comment: `${san} is the top engine move. Precision play!`,
        explanation: isCheck
          ? `Delivers a forceful check, pressing the initiative against the opponent king.`
          : capturedPiece
            ? `Calculated capture that wins material and cleans up the position.`
            : `Coordinates pieces purposefully while maximizing square influence.`,
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
        comment: `${san} is an inaccuracy (${centipawnLoss > 0 ? `-${(centipawnLoss / 100).toFixed(1)}` : ''}).`,
        explanation: bestSan
          ? `A bit imprecise. Preparing ${bestSan} would have offered more active piece placement.`
          : `Slightly slows down the initiative and allows ${opp} room to maneuver.`,
      };

    case 'mistake':
      return {
        comment: `${san} is a mistake! It concedes the advantage to ${opp}.`,
        explanation: bestSan
          ? `This concedes positional control. Finding ${bestSan} was much stronger.`
          : `Creates vulnerable weaknesses in your position that your opponent can target.`,
      };

    case 'miss':
      return {
        comment: `${san} is a missed opportunity.`,
        explanation: bestSan
          ? `You had a chance to punish ${opp}'s previous inaccuracy with ${bestSan}.`
          : `Overlooks an immediate tactical tactic to claim material or positional dominance.`,
      };

    case 'blunder':
      return {
        comment: `${san} is a blunder! This drastically shifts the evaluation.`,
        explanation: bestSan
          ? `Hangs valuable tactical resources. Playing ${bestSan} would have kept you in the game.`
          : `Disastrous move that hands decisive winning chances to ${opp}.`,
      };
  }
}

/**
 * Executes a full Chess.com Game Review analysis on a PGN string
 */
export function analyzeFullGame(
  pgn: string,
  userColor: 'white' | 'black' = 'white',
  dag?: RepertoireDAG,
  repertoire?: Repertoire
): GameReviewResult {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch (err) {
    // If PGN has malformed headers or moves, attempt standard load
    try {
      const clean = pgn.replace(/\[.*?\]\s*/g, '').trim();
      chess.loadPgn(clean);
    } catch {
      // fallback empty
    }
  }

  const rawMoves = chess.history({ verbose: true });
  const walkChess = new Chess();
  const positions: string[] = [STARTING_FEN];
  const evalHistory: number[] = [20]; // starting eval ~+0.20 for white
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

  let prevOpponentBlundered = false;

  for (let ply = 0; ply < rawMoves.length; ply++) {
    const move = rawMoves[ply];
    const turn = walkChess.turn() === 'w' ? 'white' : 'black';
    const moveNumber = Math.floor(ply / 2) + 1;
    const fenBefore = walkChess.fen();

    // Evaluate position before move
    const evalBefore = evaluatePosition(fenBefore);
    const beforeScoreCp = evalBefore.multiPv[0]?.score.value ?? 0;

    // Find best legal move in position before move
    const legalMoves = walkChess.moves({ verbose: true });
    let bestLegalMove: { from: string; to: string; san: string; evalCp: number } | null = null;
    let bestEvalCp = turn === 'white' ? -99999 : 99999;

    for (const cand of legalMoves) {
      walkChess.move(cand);
      const candEval = evaluatePosition(walkChess.fen());
      const candScore = candEval.multiPv[0]?.score.value ?? 0;
      walkChess.undo();

      if (turn === 'white') {
        if (candScore > bestEvalCp) {
          bestEvalCp = candScore;
          bestLegalMove = { from: cand.from, to: cand.to, san: cand.san, evalCp: candScore };
        }
      } else {
        if (candScore < bestEvalCp) {
          bestEvalCp = candScore;
          bestLegalMove = { from: cand.from, to: cand.to, san: cand.san, evalCp: candScore };
        }
      }
    }

    // Play the actual move
    walkChess.move(move);
    const fenAfter = walkChess.fen();
    positions.push(fenAfter);

    const evalAfter = evaluatePosition(fenAfter);
    const afterScoreCp = evalAfter.multiPv[0]?.score.value ?? 0;
    evalHistory.push(afterScoreCp);

    // Calculate centipawn loss from the player's perspective
    let cpLoss = 0;
    if (turn === 'white') {
      cpLoss = Math.max(0, (bestLegalMove?.evalCp ?? beforeScoreCp) - afterScoreCp);
    } else {
      cpLoss = Math.max(0, afterScoreCp - (bestLegalMove?.evalCp ?? beforeScoreCp));
    }

    // Check if move was in opening book
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

    // Classify Move
    let classification: MoveClassification;
    if (isBook && cpLoss < 60) {
      classification = 'book';
    } else {
      // Check for brilliant sacrifice
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

    // Calculate Win% delta and Move Accuracy
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
      bestLegalMove?.san ?? null,
      move.captured ?? null,
      walkChess.inCheck()
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
      bestMove: bestLegalMove,
      comment,
      tacticalExplanation: explanation,
    });
  }

  const whiteAccuracy =
    whiteAccuracyAccum.length > 0
      ? Math.round(
          (whiteAccuracyAccum.reduce((a, b) => a + b, 0) / whiteAccuracyAccum.length) * 10
        ) / 10
      : 80.0;

  const blackAccuracy =
    blackAccuracyAccum.length > 0
      ? Math.round(
          (blackAccuracyAccum.reduce((a, b) => a + b, 0) / blackAccuracyAccum.length) * 10
        ) / 10
      : 75.0;

  let summaryComment = 'A closely contested struggle featuring sharp tactical ideas.';
  if (whiteAccuracy > 85 && blackAccuracy > 85) {
    summaryComment = 'A masterclass of high accuracy and solid preparation from both sides.';
  } else if (userColor === 'white' && whiteAccuracy > blackAccuracy + 15) {
    summaryComment = 'You outplayed your opponent with exceptional strategic precision!';
  } else if (userColor === 'black' && blackAccuracy > whiteAccuracy + 15) {
    summaryComment = 'Dominant performance by Black, capitalizing cleanly on White’s mistakes.';
  }

  return {
    whiteAccuracy,
    blackAccuracy,
    moves: reviewMoves,
    positions,
    evalHistory,
    counts,
    summaryComment,
  };
}
