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

class ChessCompassDatabase extends Dexie {
  repertoires!: EntityTable<Repertoire, 'id'>;
  nodes!: EntityTable<RepertoireNode, 'id'>;
  edges!: EntityTable<RepertoireEdge, 'id'>;
  cards!: EntityTable<FSRSCard, 'id'>;
  reviewLogs!: EntityTable<ReviewLog, 'id'>;
  deviations!: EntityTable<DeviationReport, 'id'>;
  games!: EntityTable<ImportedGame, 'id'>;

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
  }
}

export const db = new ChessCompassDatabase();
