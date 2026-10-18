import Dexie, { type EntityTable } from 'dexie';
import type {
  Repertoire,
  RepertoireNode,
  RepertoireEdge,
  FSRSCard,
  ReviewLog,
  DeviationReport,
  ImportedGame,
} from '@/types/chess';

export interface StoredGameReview {
  id: string; // cacheKey (gameId or hash)
  gameId: string;
  userColor?: 'white' | 'black';
  whiteAccuracy: number;
  blackAccuracy: number;
  result: any;
  createdAt: number;
}

class ChessCompassDatabase extends Dexie {
  repertoires!: EntityTable<Repertoire, 'id'>;
  nodes!: EntityTable<RepertoireNode, 'id'>;
  edges!: EntityTable<RepertoireEdge, 'id'>;
  cards!: EntityTable<FSRSCard, 'id'>;
  reviewLogs!: EntityTable<ReviewLog, 'id'>;
  deviations!: EntityTable<DeviationReport, 'id'>;
  games!: EntityTable<ImportedGame, 'id'>;
  gameReviews!: EntityTable<StoredGameReview, 'id'>;

  constructor() {
    super('ChessCompass');
    
    this.version(1).stores({
      repertoires: 'id, name, color, createdAt',
      nodes: 'id, fen',
      edges: '++id, fromNodeId, toNodeId, san, repertoireId, [fromNodeId+repertoireId], [toNodeId+repertoireId]',
      cards: 'id, nodeId, state, dueDate, [state+dueDate]',
      reviewLogs: '++id, cardId, reviewedAt',
      deviations: '++id, gameId, platform, playerUsername, repertoireId, createdAt',
      games: 'id, platform, date',
    });

    this.version(2).stores({
      gameReviews: 'id, gameId, createdAt',
    });
  }
}

export const db = new ChessCompassDatabase();

