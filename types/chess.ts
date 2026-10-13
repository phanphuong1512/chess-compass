// NAG (Numeric Annotation Glyph) symbols
export type NAGSymbol = '!' | '?' | '!!' | '??' | '!?' | '?!';

// Chess colors
export type ChessColor = 'white' | 'black';

// Move annotation with NAG, text comment, and arrow coordinates
export interface MoveAnnotation {
  nag?: NAGSymbol;
  comment?: string;
  arrows?: ArrowCoordinate[];
}

// Arrow coordinate for board visualization
export interface ArrowCoordinate {
  from: string; // e.g. 'e2'
  to: string;   // e.g. 'e4'
  color: string; // hex color
}

// FSRS-6 Card state
export type FSRSState = 'new' | 'learning' | 'review' | 'relearning';
export type FSRSRating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

// FSRS-6 Card parameters
export interface FSRSCard {
  id: string;
  nodeId: string; // reference to RepertoireNode
  state: FSRSState;
  stability: number; // S parameter
  difficulty: number; // D parameter (0-10)
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  lastReview: number; // timestamp
  dueDate: number; // timestamp
}

// Review log entry
export interface ReviewLog {
  id?: number;
  cardId: string;
  rating: FSRSRating;
  state: FSRSState;
  elapsedDays: number;
  scheduledDays: number;
  stability: number;
  difficulty: number;
  reviewedAt: number; // timestamp
}

// Repertoire Node - keyed by normalized FEN
export interface RepertoireNode {
  id: string; // normalized FEN (without half-move/full-move counters)
  fen: string; // full FEN for position setup
  comments: string;
  annotations: MoveAnnotation[];
  engineEval?: EngineEvaluation;
  explorerStats?: ExplorerStats;
  isBlindSpot?: boolean;
  blindSpotFrequency?: number;
  reviewAccuracy?: number; // historical accuracy 0-1
  totalReviews?: number;
  correctReviews?: number;
}

// Repertoire Edge - a move connecting two nodes
export interface RepertoireEdge {
  id?: number;
  fromNodeId: string;
  toNodeId: string;
  san: string; // Standard Algebraic Notation (e.g., 'e4')
  uci: string; // UCI notation (e.g., 'e2e4')
  annotation?: MoveAnnotation;
  repertoireId: string;
  sortOrder: number;
}

// Repertoire metadata
export interface Repertoire {
  id: string;
  name: string;
  color: ChessColor;
  createdAt: number;
  updatedAt: number;
  description?: string;
}

// Engine evaluation
export interface EngineEvaluation {
  depth: number;
  multiPv: EngineLinePV[];
  nodes?: number;
  time?: number;
}

export interface EngineLinePV {
  pvIndex: number;
  score: EngineScore;
  pv: string[]; // moves in UCI format
  sanPv?: string[]; // moves in SAN format
}

export interface EngineScore {
  type: 'cp' | 'mate';
  value: number; // centipawns or mate-in-N
}

// Lichess Explorer result
export interface ExplorerResult {
  white: number;
  draws: number;
  black: number;
  moves: ExplorerMove[];
  topGames?: ExplorerGame[];
  opening?: { eco: string; name: string };
}

export interface ExplorerMove {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
  averageRating: number;
}

export interface ExplorerGame {
  uci: string;
  id: string;
  winner: 'white' | 'black' | null;
  white: { name: string; rating: number };
  black: { name: string; rating: number };
  year: number;
  month: string;
}

export interface ExplorerStats {
  totalGames: number;
  whiteWinRate: number;
  drawRate: number;
  blackWinRate: number;
  averageRating: number;
}

// Deviation report from real game sync
export interface DeviationReport {
  id?: number;
  gameId: string;
  platform: 'lichess' | 'chesscom';
  playerUsername: string;
  playerColor: ChessColor;
  deviationPly: number;
  playedMove: string; // SAN
  preparedMove: string | null; // SAN or null if opponent deviation
  positionFen: string;
  engineEval?: EngineScore;
  centipawnLoss?: number;
  isOpponentDeviation: boolean;
  repertoireId: string;
  addedToTraining: boolean;
  createdAt: number;
}

// Game from Lichess/Chess.com
export interface ImportedGame {
  id: string;
  platform: 'lichess' | 'chesscom';
  pgn: string;
  white: string;
  black: string;
  whiteRating?: number;
  blackRating?: number;
  result: string;
  timeControl?: string;
  date: string;
  opening?: string;
}

// Training session types
export type TrainingMode = 'srs' | 'line-drill' | 'weak-spot' | 'position-quiz';

export interface TrainingSession {
  id: string;
  mode: TrainingMode;
  repertoireId: string;
  startedAt: number;
  completedAt?: number;
  totalCards: number;
  reviewedCards: number;
  correctCards: number;
  streak: number;
  maxStreak: number;
}

// PGN Import options
export interface PGNImportOptions {
  maxPly: number;
  colorFilter?: ChessColor;
  repertoireId: string;
}

// Blind spot result
export interface BlindSpot {
  nodeId: string;
  fen: string;
  opponentMove: string;
  frequency: number; // percentage
  totalGames: number;
  masterWinRate: number;
}

// Stockfish worker messages
export interface StockfishCommand {
  type: 'init' | 'position' | 'go' | 'stop' | 'quit';
  fen?: string;
  depth?: number;
  multiPv?: number;
}

export interface StockfishResponse {
  type: 'ready' | 'info' | 'bestmove' | 'error';
  evaluation?: EngineEvaluation;
  bestMove?: string;
  error?: string;
}

// Tab types for the study workspace
export type StudyTab = 'repertoire' | 'training' | 'deviations' | 'explorer' | 'import';

// Lichess Cloud Evaluation
export interface LichessCloudEval {
  fen: string;
  knodes: number;
  depth: number;
  pvs: {
    moves: string; // Space-separated UCI moves
    cp?: number;
    mate?: number;
  }[];
}

// Lichess Endgame Tablebase (Syzygy)
export interface LichessTablebase {
  checkmate: boolean;
  stalemate: boolean;
  variant_win: boolean;
  variant_loss: boolean;
  insufficient_material: boolean;
  dtz: number | null;
  precise_dtz: number | null;
  dtm: number | null;
  category: 'win' | 'loss' | 'draw' | 'unknown';
  moves: {
    uci: string;
    san: string;
    category: 'win' | 'loss' | 'draw';
    dtm: number | null;
    dtz: number | null;
    checkmate: boolean;
  }[];
}

// Lichess User Profile
export interface LichessUser {
  id: string;
  username: string;
  title?: string;
  perfs?: {
    blitz?: { rating: number; games: number };
    rapid?: { rating: number; games: number };
    classical?: { rating: number; games: number };
  };
  patron?: boolean;
}

