export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q';

export interface CapturedGroup {
  type: PieceType;
  count: number;
}

export interface PlayerMaterial {
  captured: CapturedGroup[];
  lead: number; // material point advantage over opponent (e.g. +3)
  totalValue: number;
}

export interface BoardMaterial {
  white: PlayerMaterial;
  black: PlayerMaterial;
}

export const PIECE_VALUES: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
};

const PIECE_ORDER: PieceType[] = ['p', 'n', 'b', 'r', 'q'];
const STARTING_COUNTS: Record<PieceType, number> = {
  p: 8,
  n: 2,
  b: 2,
  r: 2,
  q: 1,
};

/**
 * Calculates captured pieces and material lead from FEN, matching ChessAtlas/Chess.com.
 * White's captured pieces are the Black pieces that have been captured.
 * Black's captured pieces are the White pieces that have been captured.
 */
export function calculateMaterial(fen: string): BoardMaterial {
  const emptyRes: BoardMaterial = {
    white: { captured: [], lead: 0, totalValue: 39 },
    black: { captured: [], lead: 0, totalValue: 39 },
  };

  if (!fen) return emptyRes;
  const placement = fen.split(' ')[0];
  if (!placement || placement.split('/').length !== 8) return emptyRes;

  const currentWhite: Record<PieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  const currentBlack: Record<PieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };

  for (const ch of placement) {
    const lower = ch.toLowerCase() as PieceType;
    if (!(lower in PIECE_VALUES)) continue;
    if (ch === ch.toUpperCase()) {
      currentWhite[lower] += 1;
    } else {
      currentBlack[lower] += 1;
    }
  }

  // Pieces captured BY White = Black pieces missing from board
  const capturedByWhite: CapturedGroup[] = [];
  // Pieces captured BY Black = White pieces missing from board
  const capturedByBlack: CapturedGroup[] = [];

  let whitePoints = 0;
  let blackPoints = 0;

  for (const pt of PIECE_ORDER) {
    whitePoints += currentWhite[pt] * PIECE_VALUES[pt];
    blackPoints += currentBlack[pt] * PIECE_VALUES[pt];

    const blackLost = Math.max(0, STARTING_COUNTS[pt] - currentBlack[pt]);
    if (blackLost > 0) {
      capturedByWhite.push({ type: pt, count: blackLost });
    }

    const whiteLost = Math.max(0, STARTING_COUNTS[pt] - currentWhite[pt]);
    if (whiteLost > 0) {
      capturedByBlack.push({ type: pt, count: whiteLost });
    }
  }

  const whiteLead = Math.max(0, whitePoints - blackPoints);
  const blackLead = Math.max(0, blackPoints - whitePoints);

  return {
    white: {
      captured: capturedByWhite,
      lead: whiteLead,
      totalValue: whitePoints,
    },
    black: {
      captured: capturedByBlack,
      lead: blackLead,
      totalValue: blackPoints,
    },
  };
}
