import { NextRequest, NextResponse } from 'next/server';
import { getD1Database } from '@/lib/db/d1';
import type { FSRSCard, ReviewLog } from '@/types/chess';

export async function GET(request: NextRequest) {
  const db = await getD1Database();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const repertoireId = searchParams.get('repertoireId');

  try {
    let query = 'SELECT * FROM study_cards ORDER BY due_date ASC';
    let stmt = db.prepare(query);
    if (repertoireId) {
      query = 'SELECT * FROM study_cards WHERE repertoire_id = ? ORDER BY due_date ASC';
      stmt = db.prepare(query).bind(repertoireId);
    }

    const { results } = await stmt.all<Record<string, unknown>>();
    const cards: FSRSCard[] = (results || []).map((row) => ({
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

    return NextResponse.json({ success: true, data: cards });
  } catch (err) {
    console.error('D1 study cards GET error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch cards from D1', details: String(err) },
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
    const { card, log } = body as { card: FSRSCard; log?: ReviewLog };

    if (!card || !card.id) {
      return NextResponse.json({ error: 'Missing card payload' }, { status: 400 });
    }

    // 1. Update FSRS card in D1
    await db
      .prepare(
        `UPDATE study_cards SET
         state = ?,
         stability = ?,
         difficulty = ?,
         elapsed_days = ?,
         scheduled_days = ?,
         reps = ?,
         lapses = ?,
         last_review = ?,
         due_date = ?
         WHERE id = ?`
      )
      .bind(
        card.state,
        card.stability,
        card.difficulty,
        card.elapsedDays,
        card.scheduledDays,
        card.reps,
        card.lapses,
        card.lastReview,
        card.dueDate,
        card.id
      )
      .run();

    // 2. Insert Review Log if provided
    if (log) {
      await db
        .prepare(
          `INSERT INTO study_review_logs
           (card_id, rating, state, stability, difficulty, reviewed_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          card.id,
          log.rating,
          log.state,
          log.stability,
          log.difficulty,
          log.reviewedAt || Date.now()
        )
        .run();
    }

    return NextResponse.json({ success: true, data: card });
  } catch (err) {
    console.error('D1 study cards POST error:', err);
    return NextResponse.json(
      { error: 'Failed to update review card in D1', details: String(err) },
      { status: 500 }
    );
  }
}
