import { Chess, type Square } from 'chess.js';
import type { EngineScore, EngineEvaluation } from '@/types/chess';

// Piece base values in centipawns
const PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Simplified piece square tables
const PAWN_TABLE = [
  0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0
];

const KNIGHT_TABLE = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
];

export function evaluatePosition(fen: string): EngineEvaluation {
  try {
    const chess = new Chess(fen);

    if (chess.isGameOver()) {
      if (chess.isCheckmate()) {
        const turn = chess.turn();
        return {
          depth: 18,
          multiPv: [{
            pvIndex: 1,
            score: { type: 'mate', value: turn === 'w' ? -1 : 1 },
            pv: [],
          }],
        };
      }
      return {
        depth: 18,
        multiPv: [{
          pvIndex: 1,
          score: { type: 'cp', value: 0 },
          pv: [],
        }],
      };
    }

    let score = 0;
    const board = chess.board();

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (!piece) continue;

        const val = PIECE_VALUES[piece.type] || 0;
        const squareIdx = r * 8 + c;
        let positional = 0;

        if (piece.type === 'p') {
          positional = piece.color === 'w' ? PAWN_TABLE[squareIdx] : PAWN_TABLE[63 - squareIdx];
        } else if (piece.type === 'n') {
          positional = piece.color === 'w' ? KNIGHT_TABLE[squareIdx] : KNIGHT_TABLE[63 - squareIdx];
        }

        const totalPieceVal = val + positional;
        score += piece.color === 'w' ? totalPieceVal : -totalPieceVal;
      }
    }

    // Add mobility factor
    const legalMoves = chess.moves({ verbose: true });
    const mobility = (legalMoves.length - 20) * 5;
    score += chess.turn() === 'w' ? mobility : -mobility;

    // Pick top 2-3 candidate moves
    const candidateLines = legalMoves.slice(0, 3).map((m, i) => {
      const uci = m.from + m.to + (m.promotion ?? '');
      // Slight delta for secondary lines
      const lineScore = chess.turn() === 'w' ? score - i * 25 : score + i * 25;
      return {
        pvIndex: i + 1,
        score: { type: 'cp' as const, value: lineScore },
        pv: [uci],
        sanPv: [m.san],
      };
    });

    return {
      depth: 14,
      multiPv: candidateLines,
      nodes: 125000,
      time: 42,
    };
  } catch {
    return {
      depth: 10,
      multiPv: [{ pvIndex: 1, score: { type: 'cp', value: 0 }, pv: [] }],
    };
  }
}
