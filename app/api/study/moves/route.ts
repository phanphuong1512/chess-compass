import { NextRequest, NextResponse } from 'next/server';
import { getD1Database } from '@/lib/db/d1';
import { fenToNodeId } from '@/lib/chess/dag';
import type { RepertoireNode, RepertoireEdge, FSRSCard } from '@/types/chess';
import { createCard } from '@/lib/fsrs/scheduler';

export async function GET(request: NextRequest) {
  const db = await getD1Database();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const repertoireId = searchParams.get('repertoireId');

  try {
    // 1. Fetch edges
    let edgeQuery = 'SELECT * FROM study_edges ORDER BY sort_order ASC';
    let edgeStmt = db.prepare(edgeQuery);
    if (repertoireId) {
      edgeQuery = 'SELECT * FROM study_edges WHERE repertoire_id = ? ORDER BY sort_order ASC';
      edgeStmt = db.prepare(edgeQuery).bind(repertoireId);
    }
    const { results: rawEdges } = await edgeStmt.all<Record<string, unknown>>();

    const edges: RepertoireEdge[] = (rawEdges || []).map((row) => ({
      id: Number(row.id),
      fromNodeId: String(row.from_node_id),
      toNodeId: String(row.to_node_id),
      san: String(row.san),
      uci: String(row.uci),
      repertoireId: String(row.repertoire_id),
      sortOrder: Number(row.sort_order ?? 0),
      annotation: row.annotation ? JSON.parse(String(row.annotation)) : undefined,
    }));

    // 2. Fetch nodes
    const { results: rawNodes } = await db
      .prepare('SELECT * FROM study_nodes')
      .all<Record<string, unknown>>();

    const nodes: RepertoireNode[] = (rawNodes || []).map((row) => ({
      id: String(row.id),
      fen: String(row.fen),
      comments: String(row.comments ?? ''),
      annotations: row.annotations ? JSON.parse(String(row.annotations)) : [],
      engineEval: row.engine_eval ? JSON.parse(String(row.engine_eval)) : undefined,
      explorerStats: row.explorer_stats ? JSON.parse(String(row.explorer_stats)) : undefined,
    }));

    // 3. Fetch cards
    let cardQuery = 'SELECT * FROM study_cards';
    let cardStmt = db.prepare(cardQuery);
    if (repertoireId) {
      cardQuery = 'SELECT * FROM study_cards WHERE repertoire_id = ?';
      cardStmt = db.prepare(cardQuery).bind(repertoireId);
    }
    const { results: rawCards } = await cardStmt.all<Record<string, unknown>>();

    const cards: FSRSCard[] = (rawCards || []).map((row) => ({
      id: String(row.id),
      nodeId: String(row.node_id),
      state: String(row.state) as FSRSCard['state'],
      stability: Number(row.stability),
      difficulty: Number(row.difficulty),
      elapsedDays: Number(row.elapsed_days),
      scheduledDays: Number(row.scheduled_days),
      reps: Number(row.reps),
      lapses: Number(row.lapses),
      lastReview: Number(row.last_review),
      dueDate: Number(row.due_date),
    }));

    return NextResponse.json({
      success: true,
      data: { nodes, edges, cards },
    });
  } catch (err) {
    console.error('D1 study moves GET error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch graph data from D1', details: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const db = await getD1Database();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  try {
    const body = await request.json();

    // Check if batch moves insertion
    if (Array.isArray(body.moves)) {
      const { moves, repertoireId, initialLearned } = body as {
        moves: Array<{
          fromFen: string;
          toFen: string;
          san: string;
          uci: string;
          sortOrder?: number;
          annotation?: { comment?: string };
        }>;
        repertoireId: string;
        initialLearned?: boolean;
      };

      if (!repertoireId || moves.length === 0) {
        return NextResponse.json({ error: 'Missing repertoireId or moves array' }, { status: 400 });
      }

      const now = Date.now();
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        const fromNodeId = fenToNodeId(m.fromFen);
        const toNodeId = fenToNodeId(m.toFen);

        await db
          .prepare(
            `INSERT OR IGNORE INTO study_nodes (id, fen, comments, annotations, created_at)
             VALUES (?, ?, '', '[]', ?)`
          )
          .bind(fromNodeId, m.fromFen, now)
          .run();

        await db
          .prepare(
            `INSERT OR IGNORE INTO study_nodes (id, fen, comments, annotations, created_at)
             VALUES (?, ?, '', '[]', ?)`
          )
          .bind(toNodeId, m.toFen, now)
          .run();

        const annotationJson = m.annotation ? JSON.stringify(m.annotation) : null;
        await db
          .prepare(
            `INSERT INTO study_edges (from_node_id, to_node_id, san, uci, repertoire_id, annotation, sort_order, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(from_node_id, to_node_id, san, repertoire_id) DO UPDATE SET
             annotation = excluded.annotation`
          )
          .bind(fromNodeId, toNodeId, m.san, m.uci, repertoireId, annotationJson, m.sortOrder ?? i, now)
          .run();

        const cardId = `card_${toNodeId}_${repertoireId}`;
        const initialCard = createCard(toNodeId);
        if (initialLearned) {
          initialCard.state = 'review';
          initialCard.reps = 1;
          initialCard.stability = 2.3;
          initialCard.difficulty = 5.0;
          initialCard.lastReview = now;
          initialCard.dueDate = now + 86400000;
        }

        await db
          .prepare(
            `INSERT OR REPLACE INTO study_cards
             (id, node_id, repertoire_id, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, last_review, due_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            cardId,
            toNodeId,
            repertoireId,
            initialCard.state,
            initialCard.stability,
            initialCard.difficulty,
            initialCard.elapsedDays,
            initialCard.scheduledDays,
            initialCard.reps,
            initialCard.lapses,
            initialCard.lastReview,
            initialCard.dueDate
          )
          .run();
      }

      return NextResponse.json({ success: true, count: moves.length });
    }

    const { fromFen, toFen, san, uci, repertoireId, annotation, initialLearned } = body;

    if (!fromFen || !toFen || !san || !uci || !repertoireId) {
      return NextResponse.json({ error: 'Missing required move fields' }, { status: 400 });
    }

    const fromNodeId = fenToNodeId(fromFen);
    const toNodeId = fenToNodeId(toFen);
    const now = Date.now();

    // 1. Ensure From Node exists in D1
    await db
      .prepare(
        `INSERT OR IGNORE INTO study_nodes (id, fen, comments, annotations, created_at)
         VALUES (?, ?, '', '[]', ?)`
      )
      .bind(fromNodeId, fromFen, now)
      .run();

    // 2. Ensure To Node exists in D1
    await db
      .prepare(
        `INSERT OR IGNORE INTO study_nodes (id, fen, comments, annotations, created_at)
         VALUES (?, ?, '', '[]', ?)`
      )
      .bind(toNodeId, toFen, now)
      .run();

    // 3. Insert or update Edge in D1
    const annotationJson = annotation ? JSON.stringify(annotation) : null;
    await db
      .prepare(
        `INSERT INTO study_edges (from_node_id, to_node_id, san, uci, repertoire_id, annotation, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(from_node_id, to_node_id, san, repertoire_id) DO UPDATE SET
         annotation = excluded.annotation`
      )
      .bind(fromNodeId, toNodeId, san, uci, repertoireId, annotationJson, now)
      .run();

    // 4. Retrieve saved edge
    const savedEdgeRow = await db
      .prepare(
        `SELECT * FROM study_edges WHERE from_node_id = ? AND to_node_id = ? AND san = ? AND repertoire_id = ?`
      )
      .bind(fromNodeId, toNodeId, san, repertoireId)
      .first<Record<string, unknown>>();

    // 5. Ensure FSRS card exists for the target position
    const cardId = `card_${toNodeId}_${repertoireId}`;
    const initialCard = createCard(toNodeId);
    if (initialLearned) {
      initialCard.state = 'review';
      initialCard.reps = 1;
      initialCard.stability = 2.3;
      initialCard.difficulty = 5.0;
      initialCard.lastReview = now;
      initialCard.dueDate = now + 86400000;
    }

    await db
      .prepare(
        `INSERT OR REPLACE INTO study_cards
         (id, node_id, repertoire_id, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, last_review, due_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        cardId,
        toNodeId,
        repertoireId,
        initialCard.state,
        initialCard.stability,
        initialCard.difficulty,
        initialCard.elapsedDays,
        initialCard.scheduledDays,
        initialCard.reps,
        initialCard.lapses,
        initialCard.lastReview,
        initialCard.dueDate
      )
      .run();

    return NextResponse.json({
      success: true,
      data: {
        node: { id: toNodeId, fen: toFen, comments: '', annotations: [] },
        edge: savedEdgeRow
          ? {
              id: Number(savedEdgeRow.id),
              fromNodeId: String(savedEdgeRow.from_node_id),
              toNodeId: String(savedEdgeRow.to_node_id),
              san: String(savedEdgeRow.san),
              uci: String(savedEdgeRow.uci),
              repertoireId: String(savedEdgeRow.repertoire_id),
              sortOrder: Number(savedEdgeRow.sort_order ?? 0),
            }
          : null,
      },
    });
  } catch (err) {
    console.error('D1 study moves POST error:', err);
    return NextResponse.json(
      { error: 'Failed to record move in D1', details: String(err) },
      { status: 500 }
    );
  }
}
