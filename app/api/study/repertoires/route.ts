import { NextRequest, NextResponse } from 'next/server';
import { getD1Database } from '@/lib/db/d1';
import type { Repertoire } from '@/types/chess';

export async function GET() {
  const db = await getD1Database();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  try {
    const { results } = await db
      .prepare('SELECT * FROM study_repertoires ORDER BY created_at ASC')
      .all<Record<string, unknown>>();

    const repertoires: Repertoire[] = (results || []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      color: String(row.color) as 'white' | 'black',
      description: row.description ? String(row.description) : undefined,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    }));

    return NextResponse.json({ success: true, data: repertoires });
  } catch (err) {
    console.error('D1 study_repertoires GET error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch repertoires from D1', details: String(err) },
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
    const { id, name, color, description } = body;

    if (!id || !name || !color) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const now = Date.now();
    await db
      .prepare(
        `INSERT OR REPLACE INTO study_repertoires (id, name, color, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(id, name, color, description || '', now, now)
      .run();

    // Ensure starting position root node exists in D1
    const rootFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const rootId = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
    await db
      .prepare(
        `INSERT OR IGNORE INTO study_nodes (id, fen, comments, annotations, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(rootId, rootFen, 'Starting Position', '[]', now)
      .run();

    return NextResponse.json({ success: true, data: { id, name, color, description, createdAt: now, updatedAt: now } });
  } catch (err) {
    console.error('D1 study_repertoires POST error:', err);
    return NextResponse.json(
      { error: 'Failed to save repertoire to D1', details: String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const db = await getD1Database();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    await db.prepare('DELETE FROM study_repertoires WHERE id = ?').bind(id).run();
    await db.prepare('DELETE FROM study_edges WHERE repertoire_id = ?').bind(id).run();
    await db.prepare('DELETE FROM study_cards WHERE repertoire_id = ?').bind(id).run();
    await db.prepare('DELETE FROM study_deviations WHERE repertoire_id = ?').bind(id).run();

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err) {
    console.error('D1 study_repertoires DELETE error:', err);
    return NextResponse.json(
      { error: 'Failed to delete repertoire from D1', details: String(err) },
      { status: 500 }
    );
  }
}
