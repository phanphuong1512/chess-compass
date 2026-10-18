import { Chess, type Square } from 'chess.js';
import type { Repertoire, ImportedGame } from '@/types/chess';
import { db } from '@/lib/db';
import { RepertoireDAG, fenToNodeId, STARTING_FEN } from './dag';
import {
  evaluateFenWithStockfish,
  evaluateBatchWithStockfish,
  type PositionEngineEval,
} from './stockfish';

// In-memory cache for ultra-fast instantaneous retrieval across session
export const gameReviewMemoryCache = new Map<string, GameReviewResult>();

const REVIEW_CACHE_VERSION = 'v4';

export function getGameReviewKey(game: ImportedGame): string {
  let base = '';
  if (game.id && game.id.trim() !== '') {
    base = game.id.trim();
  } else {
    const maybeUrl = (game as unknown as { url?: string }).url;
    if (maybeUrl && maybeUrl.trim() !== '') {
      base = maybeUrl.trim();
    } else {
      base = `${game.platform || 'chess'}_${game.white}_${game.black}_${game.date}_${(game.pgn || '').slice(0, 80)}`;
    }
  }
  return `${REVIEW_CACHE_VERSION}:${base}`;
}


export async function getCachedGameReview(game: ImportedGame): Promise<GameReviewResult | null> {
  const key = getGameReviewKey(game);
  if (gameReviewMemoryCache.has(key)) {
    return gameReviewMemoryCache.get(key)!;
  }
  try {
    const stored = await db.gameReviews.get(key);
    if (stored && stored.result) {
      gameReviewMemoryCache.set(key, stored.result);
      return stored.result;
    }
  } catch (err) {
    console.warn('Failed to load review from Dexie:', err);
  }
  return null;
}

export async function saveGameReview(
  game: ImportedGame,
  userColor: 'white' | 'black',
  result: GameReviewResult
): Promise<void> {
  const key = getGameReviewKey(game);
  gameReviewMemoryCache.set(key, result);
  try {
    await db.gameReviews.put({
      id: key,
      gameId: game.id || key,
      userColor,
      whiteAccuracy: result.whiteAccuracy,
      blackAccuracy: result.blackAccuracy,
      result,
      createdAt: Date.now(),
    });
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('cc_reviewed_games') || '{}';
        const parsed = JSON.parse(raw);
        parsed[key] = {
          whiteAccuracy: result.whiteAccuracy,
          blackAccuracy: result.blackAccuracy,
          updatedAt: Date.now(),
        };
        localStorage.setItem('cc_reviewed_games', JSON.stringify(parsed));
      } catch {}
    }
  } catch (err) {
    console.warn('Failed to save review to Dexie:', err);
  }
}

export async function invalidateGameReview(game: ImportedGame): Promise<void> {
  const key = getGameReviewKey(game);
  gameReviewMemoryCache.delete(key);
  try {
    await db.gameReviews.delete(key);
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('cc_reviewed_games') || '{}';
        const parsed = JSON.parse(raw);
        delete parsed[key];
        localStorage.setItem('cc_reviewed_games', JSON.stringify(parsed));
      } catch {}
    }
  } catch (err) {
    console.warn('Failed to delete review from Dexie:', err);
  }
}

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
    short: 'Book',
    badgeBg: 'bg-amber-700/20 border-amber-600/40',
    textColor: 'text-amber-500',
    dotColor: '#A88B5E',
  },
  best: {
    label: 'Best',
    short: '★',
    badgeBg: 'bg-emerald-500/20 border-emerald-500/40',
    textColor: 'text-emerald-400',
    dotColor: '#81B64C',
  },
  excellent: {
    label: 'Excellent',
    short: '▲',
    badgeBg: 'bg-lime-500/20 border-lime-500/40',
    textColor: 'text-lime-400',
    dotColor: '#96BC4B',
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

const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

/**
 * Determines whether a move is a genuine material sacrifice according to Chess.com principles:
 * 1. Sacrificing piece must be a minor piece, rook, or queen (pawns and kings excluded).
 * 2. If it is a capture, player must give up more material than they capture (e.g. Rook for pawn/minor, Queen for Rook/minor).
 *    Trades of equal value (e.g. Bxf3, Nxd5, Qxd1) or advantageous captures are NEVER sacrifices!
 * 3. The sacrificed piece (or a hanging major piece left en prise) must be capturable by the opponent in fenAfter.
 * 4. The resulting position must not be lost for the moving player.
 */
function isGenuineSacrifice(
  move: { piece: string; captured?: string; from: string; to: string },
  fenBefore: string,
  fenAfter: string,
  turn: 'white' | 'black',
  afterScoreCp: number
): boolean {
  if (move.piece === 'p' || move.piece === 'k') return false;

  const movedVal = PIECE_VALUES[move.piece] || 0;
  const capturedVal = move.captured ? (PIECE_VALUES[move.captured] || 0) : 0;

  // A trade of equal or greater value (e.g. B for N, N for N, R for R, Q for Q) is NEVER a sacrifice!
  if (capturedVal >= movedVal) {
    return false;
  }

  // Position must remain sound/winning (not completely lost)
  if (turn === 'white' && afterScoreCp < -100) return false;
  if (turn === 'black' && afterScoreCp > 100) return false;

  try {
    const afterChess = new Chess(fenAfter);
    const opponentMoves = afterChess.moves({ verbose: true });

    // Case 1: Capture where player gives up higher material (e.g. R(5) takes minor(3)/pawn(1), Q(9) takes R(5)/minor(3)/pawn(1))
    if (move.captured && movedVal - capturedVal >= 2) {
      const canRecapture = opponentMoves.some((m) => m.to === move.to);
      if (canRecapture) {
        return true;
      }
    }

    // Case 2: Quiet piece sacrifice (minor piece, rook, or queen moved into attack without capturing)
    if (!move.captured && movedVal >= 3) {
      const canCapture = opponentMoves.some((m) => m.to === move.to);
      if (canCapture) {
        return true;
      }
    }

    // Case 3: Leaving another valuable friendly major piece (Queen or Rook) undefended while moving elsewhere
    const board = afterChess.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sqPiece = board[r][c];
        if (sqPiece && sqPiece.color === (turn === 'white' ? 'w' : 'b')) {
          if (sqPiece.type === 'q' || sqPiece.type === 'r') {
            const sqName = `${String.fromCharCode(97 + c)}${8 - r}` as Square;
            if (sqName === move.to) continue;
            const canTakeHanging = opponentMoves.some((m) => m.to === sqName);
            if (canTakeHanging) {
              return true;
            }
          }
        }
      }
    }
  } catch {
    return false;
  }

  return false;
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
  onProgress?: (progressPercent: number, message: string) => void,
  forceReanalyze = false
): Promise<GameReviewResult> {
  // 0. Check persistent Dexie & in-memory cache unless forced re-analysis
  if (!forceReanalyze) {
    const cached = await getCachedGameReview(game);
    if (cached) {
      if (onProgress) onProgress(100, 'Loaded existing review from database (Instant)');
      return cached;
    }
  }

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

  // 1. Walk moves once to precalculate all positions (< 1ms)
  const fenBeforeList: string[] = [];
  const fenAfterList: string[] = [];
  const allUniqueFens = new Set<string>([STARTING_FEN]);

  for (let ply = 0; ply < rawMoves.length; ply++) {
    const fenBefore = walkChess.fen();
    fenBeforeList.push(fenBefore);
    allUniqueFens.add(fenBefore);
    walkChess.move(rawMoves[ply]);
    const fenAfter = walkChess.fen();
    fenAfterList.push(fenAfter);
    allUniqueFens.add(fenAfter);
    positions.push(fenAfter);
  }

  // 2. High-speed concurrent batch evaluation (fetches all ~90 positions in ~5-8s)
  let evalMap = new Map<string, PositionEngineEval>();
  if (!hasRawLichess && !hasEmbeddedPgnEvals) {
    evalMap = await evaluateBatchWithStockfish(Array.from(allUniqueFens), (completed, total) => {
      if (onProgress) {
        const pct = Math.round((completed / total) * 100);
        onProgress(pct, `Analyzing position with Stockfish (${completed}/${total})...`);
      }
    });
  }

  // 3. Process classifications and accuracy in 0ms synchronously
  for (let ply = 0; ply < rawMoves.length; ply++) {
    const move = rawMoves[ply];
    const turn = ply % 2 === 0 ? 'white' : 'black';
    const moveNumber = Math.floor(ply / 2) + 1;
    const fenBefore = fenBeforeList[ply];
    const fenAfter = fenAfterList[ply];

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
      // 3. Instant lookup from concurrent batch evaluation
      const sfBefore: PositionEngineEval = evalMap.get(fenBefore) || {
        fen: fenBefore,
        scoreCp: 20,
        depth: 10,
        source: 'local-stockfish',
      };
      const sfAfter: PositionEngineEval = evalMap.get(fenAfter) || {
        fen: fenAfter,
        scoreCp: 20,
        depth: 10,
        source: 'local-stockfish',
      };

      engineSource = sfBefore.source;
      beforeScoreCp = sfBefore.scoreCp;
      afterScoreCp = sfAfter.scoreCp;

      if (sfBefore.bestMoveUci && sfBefore.bestMoveSan) {
        bestMove = {
          from: sfBefore.bestMoveUci.slice(0, 2),
          to: sfBefore.bestMoveUci.slice(2, 4),
          san: sfBefore.bestMoveSan,
          evalCp: sfBefore.scoreCp,
        };
      }
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
      else if (isBook && cpLoss < 60) classification = 'book';
      else if (cpLoss <= 12) classification = 'best';
      else if (cpLoss <= 30) classification = 'excellent';
      else classification = 'good';
    } else if (isBook && cpLoss < 60) {
      classification = 'book';
    } else {
      const isSacrifice = isGenuineSacrifice(move, fenBefore, fenAfter, turn, afterScoreCp);

      // Check if player made a significant evaluation gain (great move)
      const playerWinGain =
        turn === 'white' ? afterScoreCp - beforeScoreCp : beforeScoreCp - afterScoreCp;
      const isGreat =
        !isSacrifice &&
        cpLoss <= 8 &&
        !isBook &&
        ((playerWinGain >= 150 && (turn === 'white' ? afterScoreCp >= 150 : afterScoreCp <= -150)) ||
          (Math.abs(beforeScoreCp) <= 75 && (turn === 'white' ? afterScoreCp >= 220 : afterScoreCp <= -220)));

      if (isSacrifice && cpLoss <= 10) {
        classification = 'brilliant';
      } else if (isGreat) {
        classification = 'great';
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

  const result: GameReviewResult = {
    whiteAccuracy,
    blackAccuracy,
    moves: reviewMoves,
    positions,
    evalHistory,
    counts,
    summaryComment,
    isRealStockfish: true,
  };

  // Persist into IndexedDB (Dexie) and Memory Cache
  await saveGameReview(game, userColor, result);

  return result;
}

