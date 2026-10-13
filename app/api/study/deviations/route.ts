import { NextRequest, NextResponse } from 'next/server';
import { getD1Database } from '@/lib/db/d1';
import type { DeviationReport } from '@/types/chess';

export async function GET(request: NextRequest) {
  const db = await getD1Database();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const repertoireId = searchParams.get('repertoireId');

  try {
    let query = 'SELECT * FROM study_deviations ORDER BY id DESC LIMIT 100';
    let stmt = db.prepare(query);
    if (repertoireId) {
      query = 'SELECT * FROM study_deviations WHERE repertoire_id = ? ORDER BY id DESC LIMIT 100';
      stmt = db.prepare(query).bind(repertoireId);
    }

    const { results } = await stmt.all<Record<string, unknown>>();
    const deviations: DeviationReport[] = (results || []).map((row) => ({
      id: Number(row.id),
      gameId: String(row.game_id),
      platform: String(row.platform) as 'lichess' | 'chesscom',
      playerUsername: String(row.player_username),
      playerColor: String(row.player_color) as 'white' | 'black',
      deviationPly: Number(row.deviation_ply),
      playedMove: String(row.played_move),
      preparedMove: row.prepared_move ? String(row.prepared_move) : null,
      positionFen: String(row.position_fen),
      centipawnLoss: row.centipawn_loss ? Number(row.centipawn_loss) : undefined,
      isOpponentDeviation: Boolean(row.is_opponent_deviation),
      repertoireId: String(row.repertoire_id),
      addedToTraining: Boolean(row.added_to_training),
      createdAt: Number(row.created_at),
    }));

    return NextResponse.json({ success: true, data: deviations });
  } catch (err) {
    console.error('D1 study deviations GET error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch deviations from D1', details: String(err) },
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
    const devs: DeviationReport[] = Array.isArray(body) ? body : [body];

    const inserted: number[] = [];
    for (const dev of devs) {
      const now = dev.createdAt || Date.now();
      await db
        .prepare(
          `INSERT INTO study_deviations
           (game_id, platform, player_username, player_color, deviation_ply, played_move, prepared_move, position_fen, centipawn_loss, is_opponent_deviation, repertoire_id, added_to_training, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          dev.gameId,
          dev.platform,
          dev.playerUsername,
          dev.playerColor,
          dev.deviationPly,
          dev.playedMove,
          dev.preparedMove,
          dev.positionFen,
          dev.centipawnLoss ?? null,
          dev.isOpponentDeviation ? 1 : 0,
          dev.repertoireId,
          dev.addedToTraining ? 1 : 0,
          now
        )
        .run();
    }

    return NextResponse.json({ success: true, count: devs.length });
  } catch (err) {
    console.error('D1 study deviations POST error:', err);
    return NextResponse.json(
      { error: 'Failed to record deviations in D1', details: String(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const db = await getD1Database();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  try {
    const { id, addedToTraining } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'Missing deviation id' }, { status: 400 });
    }

    await db
      .prepare('UPDATE study_deviations SET added_to_training = ? WHERE id = ?')
      .bind(addedToTraining ? 1 : 0, id)
      .run();

    return NextResponse.json({ success: true, id, addedToTraining });
  } catch (err) {
    console.error('D1 study deviations PATCH error:', err);
    return NextResponse.json(
      { error: 'Failed to update deviation in D1', details: String(err) },
      { status: 500 }
    );
  }
}
