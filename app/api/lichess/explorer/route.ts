import { NextRequest, NextResponse } from 'next/server';

const EXPLORER_BASE = 'https://explorer.lichess.ovh';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fen = searchParams.get('fen');
  const mode = searchParams.get('mode') || 'lichess'; // 'lichess' | 'masters' | 'player'

  if (!fen) {
    return NextResponse.json({ error: 'Missing fen parameter' }, { status: 400 });
  }

  // Token resolution: 1. Request header 'x-lichess-token' 2. Query param 'token' 3. Server env LICHESS_API_TOKEN
  const clientToken = request.headers.get('x-lichess-token') || searchParams.get('token');
  const serverToken = process.env.LICHESS_API_TOKEN;
  const token = clientToken || serverToken || '';

  // Build target URL
  const targetParams = new URLSearchParams();
  for (const [key, value] of searchParams.entries()) {
    if (key !== 'mode' && key !== 'token') {
      targetParams.set(key, value);
    }
  }

  const endpoint = mode === 'masters' ? 'masters' : mode === 'player' ? 'player' : 'lichess';
  const targetUrl = `${EXPLORER_BASE}/${endpoint}?${targetParams.toString()}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'GrandmasterAtlas/1.0 (happy-bishop-repertoire)',
  };

  if (token) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers,
      // Cache for 60 seconds on server if valid
      next: { revalidate: 60 },
    });

    if (upstreamRes.status === 401) {
      return NextResponse.json(
        {
          error: 'unauthorized',
          message: 'Lichess Opening Explorer requires a Personal Access Token.',
          hint: 'Generate a free token at https://lichess.org/account/oauth/token with no special scopes.',
        },
        { status: 401 }
      );
    }

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text().catch(() => '');
      return NextResponse.json(
        {
          error: `Upstream error ${upstreamRes.status}`,
          details: errText.slice(0, 300),
        },
        { status: upstreamRes.status }
      );
    }

    const data = await upstreamRes.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Network error contacting Lichess Explorer',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }
}
