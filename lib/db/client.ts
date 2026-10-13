import type {
  Repertoire,
  RepertoireNode,
  RepertoireEdge,
  FSRSCard,
  ReviewLog,
  DeviationReport,
} from '@/types/chess';
import { db as dexieDb } from './index';

/**
 * Cloudflare D1 Client Service with offline IndexedDB synchronizer.
 * Reads & writes all repertoires, nodes, moves, FSRS cards, and deviations
 * directly to Cloudflare D1 database.
 */

export async function fetchRepertoiresFromD1(): Promise<Repertoire[]> {
  try {
    const res = await fetch('/api/study/repertoires');
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        // Cache to Dexie
        for (const r of json.data) {
          await dexieDb.repertoires.put(r);
        }
        return json.data;
      }
    }
  } catch (err) {
    console.warn('Network fetch from D1 repertoires failed, using local cache:', err);
  }

  // Fallback to local Dexie
  return dexieDb.repertoires.toArray();
}

export async function createRepertoireInD1(repertoire: Repertoire): Promise<void> {
  // Save local first
  await dexieDb.repertoires.put(repertoire);

  try {
    await fetch('/api/study/repertoires', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(repertoire),
    });
  } catch (err) {
    console.warn('Sync repertoire to D1 deferred:', err);
  }
}

export async function deleteRepertoireFromD1(id: string): Promise<void> {
  await dexieDb.repertoires.delete(id);
  await dexieDb.edges.where('repertoireId').equals(id).delete();

  try {
    await fetch(`/api/study/repertoires?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.warn('Delete repertoire from D1 deferred:', err);
  }
}

export async function fetchGraphFromD1(
  repertoireId?: string
): Promise<{ nodes: RepertoireNode[]; edges: RepertoireEdge[]; cards: FSRSCard[] }> {
  try {
    const url = repertoireId
      ? `/api/study/moves?repertoireId=${encodeURIComponent(repertoireId)}`
      : '/api/study/moves';
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        const { nodes, edges, cards } = json.data;

        // Cache into Dexie
        for (const n of nodes) await dexieDb.nodes.put(n);
        for (const e of edges) {
          if (e.id) await dexieDb.edges.put(e);
        }
        for (const c of cards) await dexieDb.cards.put(c);

        return { nodes, edges, cards };
      }
    }
  } catch (err) {
    console.warn('Network fetch from D1 moves failed, using local cache:', err);
  }

  // Fallback to local Dexie
  const nodes = await dexieDb.nodes.toArray();
  const edges = repertoireId
    ? await dexieDb.edges.where('repertoireId').equals(repertoireId).toArray()
    : await dexieDb.edges.toArray();
  const cards = await dexieDb.cards.toArray();

  return { nodes, edges, cards };
}

export async function recordMoveInD1(data: {
  fromFen: string;
  toFen: string;
  san: string;
  uci: string;
  repertoireId: string;
}): Promise<{ node: RepertoireNode; edge: RepertoireEdge | null }> {
  try {
    const res = await fetch('/api/study/moves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        return json.data;
      }
    }
  } catch (err) {
    console.warn('Direct D1 move post failed:', err);
  }

  // Fallback
  return {
    node: { id: data.toFen, fen: data.toFen, comments: '', annotations: [] },
    edge: null,
  };
}

export async function updateCardInD1(card: FSRSCard, log?: ReviewLog): Promise<void> {
  await dexieDb.cards.put(card);
  if (log) await dexieDb.reviewLogs.put(log);

  try {
    await fetch('/api/study/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card, log }),
    });
  } catch (err) {
    console.warn('D1 update card deferred:', err);
  }
}

export async function fetchDeviationsFromD1(repertoireId?: string): Promise<DeviationReport[]> {
  try {
    const url = repertoireId
      ? `/api/study/deviations?repertoireId=${encodeURIComponent(repertoireId)}`
      : '/api/study/deviations';
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        for (const d of json.data) {
          await dexieDb.deviations.put(d);
        }
        return json.data;
      }
    }
  } catch (err) {
    console.warn('D1 deviations fetch deferred:', err);
  }

  return dexieDb.deviations.toArray();
}

export async function recordDeviationsInD1(deviations: DeviationReport[]): Promise<void> {
  for (const d of deviations) {
    await dexieDb.deviations.put(d);
  }

  try {
    await fetch('/api/study/deviations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deviations),
    });
  } catch (err) {
    console.warn('D1 record deviations deferred:', err);
  }
}

export async function markDeviationTrainedInD1(id: number): Promise<void> {
  await dexieDb.deviations.update(id, { addedToTraining: true });

  try {
    await fetch('/api/study/deviations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, addedToTraining: true }),
    });
  } catch (err) {
    console.warn('D1 mark deviation deferred:', err);
  }
}
