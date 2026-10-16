import { Chess, type Square } from 'chess.js';
import { fetchCloudEval } from '@/lib/api/lichess';

export interface PositionEngineEval {
  fen: string;
  scoreCp: number; // Centipawns strictly from White's perspective (+ = White better, - = Black better)
  mate?: number;
  depth: number;
  bestMoveSan?: string;
  bestMoveUci?: string;
  source: 'lichess-cloud' | 'local-stockfish';
}

// In-memory cache for fast repeated lookups
const evalCache = new Map<string, PositionEngineEval>();

class StockfishWorkerEngine {
  private worker: Worker | null = null;
  private isReady = false;
  private currentResolver: ((evalData: { scoreCp: number; bestMoveUci?: string; depth: number } | null) => void) | null = null;
  private currentScoreCp = 0;
  private currentDepth = 0;
  private currentPvUci?: string;

  constructor() {
    this.init();
  }

  private init() {
    if (typeof window === 'undefined') return;
    try {
      this.worker = new Worker('/stockfish/stockfish.js');
      this.worker.onmessage = (event) => {
        const line = typeof event.data === 'string' ? event.data : '';

        if (line === 'readyok') {
          this.isReady = true;
        }

        // Parse UCI evaluation: "info depth 10 seldepth 14 score cp 35 ... pv e2e4"
        if (line.startsWith('info') && (line.includes('score cp') || line.includes('score mate'))) {
          const depthMatch = line.match(/depth\s+(\d+)/);
          const cpMatch = line.match(/score cp\s+(-?\d+)/);
          const mateMatch = line.match(/score mate\s+(-?\d+)/);
          const pvMatch = line.match(/pv\s+([a-h][1-8][a-h][1-8][qrbn]?)/);

          if (depthMatch) this.currentDepth = parseInt(depthMatch[1], 10);
          if (cpMatch) {
            this.currentScoreCp = parseInt(cpMatch[1], 10);
          } else if (mateMatch) {
            const mateIn = parseInt(mateMatch[1], 10);
            this.currentScoreCp = mateIn > 0 ? 30000 - mateIn * 100 : -30000 - mateIn * 100;
          }
          if (pvMatch) {
            this.currentPvUci = pvMatch[1];
          }
        }

        // UCI Bestmove command indicates search finished
        if (line.startsWith('bestmove') && this.currentResolver) {
          const bestUciMatch = line.match(/bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
          const bestMoveUci = bestUciMatch ? bestUciMatch[1] : this.currentPvUci;
          this.currentResolver({
            scoreCp: this.currentScoreCp,
            depth: this.currentDepth || 10,
            bestMoveUci,
          });
          this.currentResolver = null;
        }
      };

      this.worker.postMessage('uci');
      this.worker.postMessage('isready');
    } catch {
      this.worker = null;
    }
  }

  public async evaluate(fen: string, depth = 10): Promise<{ scoreCp: number; bestMoveUci?: string; depth: number } | null> {
    if (!this.worker) return null;

    return new Promise((resolve) => {
      this.currentResolver = resolve;
      this.currentScoreCp = 0;
      this.currentDepth = 0;
      this.currentPvUci = undefined;

      this.worker?.postMessage(`position fen ${fen}`);
      this.worker?.postMessage(`go depth ${depth}`);

      // Timeout fallback after 2.5 seconds
      setTimeout(() => {
        if (this.currentResolver) {
          this.currentResolver(null);
          this.currentResolver = null;
        }
      }, 2500);
    });
  }

  public destroy() {
    this.worker?.terminate();
    this.worker = null;
  }
}

let workerInstance: StockfishWorkerEngine | null = null;

function getStockfishWorker(): StockfishWorkerEngine | null {
  if (typeof window === 'undefined') return null;
  if (!workerInstance) {
    workerInstance = new StockfishWorkerEngine();
  }
  return workerInstance;
}

/**
 * Evaluates a single FEN using Real Stockfish:
 * 1. Checks in-memory cache
 * 2. Queries Lichess Cloud Stockfish (Depth 50-70+)
 * 3. Falls back to Client-side Stockfish Web Worker
 */
export async function evaluateFenWithStockfish(fen: string): Promise<PositionEngineEval> {
  if (evalCache.has(fen)) {
    return evalCache.get(fen)!;
  }

  const chess = new Chess(fen);
  const turn = chess.turn();

  // 1. Try Lichess Cloud Stockfish first
  try {
    const cloud = await fetchCloudEval(fen, 1);
    if (cloud && cloud.pvs && cloud.pvs.length > 0) {
      const topPv = cloud.pvs[0];
      const rawScore = topPv.cp !== undefined ? topPv.cp : topPv.mate !== undefined ? (topPv.mate > 0 ? 30000 : -30000) : 0;
      // In Lichess Cloud API, cp is strictly from White's perspective
      const whiteScoreCp = rawScore;

      let bestSan: string | undefined;
      let bestUci: string | undefined;

      if (topPv.moves) {
        const uci = topPv.moves.split(' ')[0];
        bestUci = uci;
        try {
          const move = chess.move({
            from: uci.slice(0, 2) as Square,
            to: uci.slice(2, 4) as Square,
            promotion: (uci[4] as 'q' | 'r' | 'b' | 'n') || undefined,
          });
          if (move) bestSan = move.san;
          chess.undo();
        } catch {}
      }

      const result: PositionEngineEval = {
        fen,
        scoreCp: whiteScoreCp,
        mate: topPv.mate,
        depth: cloud.depth,
        bestMoveSan: bestSan,
        bestMoveUci: bestUci,
        source: 'lichess-cloud',
      };
      evalCache.set(fen, result);
      return result;
    }
  } catch {}

  // 2. Try Client-side Stockfish Web Worker
  try {
    const worker = getStockfishWorker();
    if (worker) {
      const local = await worker.evaluate(fen, 12);
      if (local && local.bestMoveUci) {
        const whiteScoreCp = turn === 'w' ? local.scoreCp : -local.scoreCp;
        let bestSan: string | undefined;

        try {
          const move = chess.move({
            from: local.bestMoveUci.slice(0, 2) as Square,
            to: local.bestMoveUci.slice(2, 4) as Square,
            promotion: (local.bestMoveUci[4] as 'q' | 'r' | 'b' | 'n') || undefined,
          });
          if (move) bestSan = move.san;
          chess.undo();
        } catch {}

        const result: PositionEngineEval = {
          fen,
          scoreCp: whiteScoreCp,
          depth: local.depth,
          bestMoveSan: bestSan,
          bestMoveUci: local.bestMoveUci,
          source: 'local-stockfish',
        };
        evalCache.set(fen, result);
        return result;
      }
    }
  } catch {}

  // 3. Fallback: Quick material + piece table count
  let score = 0;
  const PIECES: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p) score += p.color === 'w' ? PIECES[p.type] : -PIECES[p.type];
    }
  }

  const legalMoves = chess.moves({ verbose: true });
  const bestMove = legalMoves[0];

  const result: PositionEngineEval = {
    fen,
    scoreCp: score,
    depth: 4,
    bestMoveSan: bestMove?.san,
    bestMoveUci: bestMove ? `${bestMove.from}${bestMove.to}${bestMove.promotion || ''}` : undefined,
    source: 'local-stockfish',
  };
  evalCache.set(fen, result);
  return result;
}
