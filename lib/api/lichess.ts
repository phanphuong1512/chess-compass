import type {
  ExplorerResult,
  ImportedGame,
  LichessCloudEval,
  LichessTablebase,
  LichessUser,
} from '@/types/chess';

const EXPLORER_BASE = 'https://explorer.lichess.ovh';
const LICHESS_API_BASE = 'https://lichess.org/api';
const TABLEBASE_BASE = 'https://tablebase.lichess.ovh';

export class LichessAuthError extends Error {
  constructor(message = 'Lichess requires a Personal Access Token to query the Opening Explorer.') {
    super(message);
    this.name = 'LichessAuthError';
  }
}

export interface ExplorerOptions {
  variant?: string;
  speeds?: string[];
  ratings?: number[];
  moves?: number;
  recentGames?: number;
  token?: string;
}

// Get saved token from browser localStorage
export function getSavedLichessToken(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('hb_lichess_token')?.trim() || '';
  }
  return '';
}

// Query Lichess Opening Explorer (Community Database)
export async function queryExplorer(
  fen: string,
  options: ExplorerOptions = {}
): Promise<ExplorerResult> {
  const token = options.token || getSavedLichessToken();

  const params = new URLSearchParams({
    fen,
    variant: options.variant ?? 'standard',
    speeds: (options.speeds ?? ['rapid', 'classical', 'blitz']).join(','),
    ratings: (options.ratings ?? [1600, 1800, 2000, 2200, 2500]).join(','),
    moves: String(options.moves ?? 12),
    recentGames: String(options.recentGames ?? 4),
    mode: 'lichess',
  });

  // Try Next.js server proxy first to avoid client CORS / header restrictions
  const proxyUrl = `/api/lichess/explorer?${params.toString()}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (token) {
    headers['x-lichess-token'] = token;
  }

  try {
    const res = await fetch(proxyUrl, { headers });
    if (res.status === 401) {
      throw new LichessAuthError();
    }
    if (res.ok) {
      const data: ExplorerResult = await res.json();
      return data;
    }
  } catch (err) {
    if (err instanceof LichessAuthError) throw err;
  }

  // Fallback direct request if proxy is unavailable (e.g. static export)
  const directHeaders: Record<string, string> = {
    Accept: 'application/json',
  };
  if (token) {
    directHeaders.Authorization = `Bearer ${token}`;
  }

  const directParams = new URLSearchParams({
    fen,
    variant: options.variant ?? 'standard',
    speeds: (options.speeds ?? ['rapid', 'classical', 'blitz']).join(','),
    ratings: (options.ratings ?? [1600, 1800, 2000, 2200, 2500]).join(','),
    moves: String(options.moves ?? 12),
    recentGames: String(options.recentGames ?? 4),
  });

  const directRes = await fetch(`${EXPLORER_BASE}/lichess?${directParams.toString()}`, {
    headers: directHeaders,
  });

  if (directRes.status === 401) {
    throw new LichessAuthError();
  }

  if (!directRes.ok) {
    throw new Error(`Lichess Explorer error: HTTP ${directRes.status}`);
  }

  return directRes.json();
}

// Query Lichess Masters Explorer (FIDE 2200+ Master Games from 1952)
export async function queryMastersExplorer(
  fen: string,
  options: ExplorerOptions = {}
): Promise<ExplorerResult> {
  const token = options.token || getSavedLichessToken();

  const params = new URLSearchParams({
    fen,
    moves: String(options.moves ?? 12),
    mode: 'masters',
  });

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (token) {
    headers['x-lichess-token'] = token;
  }

  const res = await fetch(`/api/lichess/explorer?${params.toString()}`, { headers });
  if (res.status === 401) {
    throw new LichessAuthError();
  }
  if (!res.ok) {
    throw new Error(`Masters Explorer error: HTTP ${res.status}`);
  }

  return res.json();
}

// Query Player-Specific Explorer (OpeningTree mode)
export async function queryPlayerExplorer(
  fen: string,
  username: string,
  color: 'white' | 'black',
  options: ExplorerOptions = {}
): Promise<ExplorerResult> {
  const token = options.token || getSavedLichessToken();

  const params = new URLSearchParams({
    fen,
    player: username,
    color,
    variant: options.variant ?? 'standard',
    speeds: (options.speeds ?? ['rapid', 'classical', 'blitz']).join(','),
    modes: 'rated',
    recentGames: String(options.recentGames ?? 4),
    mode: 'player',
  });

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (token) {
    headers['x-lichess-token'] = token;
  }

  const res = await fetch(`/api/lichess/explorer?${params.toString()}`, { headers });
  if (res.status === 401) {
    throw new LichessAuthError();
  }
  if (!res.ok) {
    throw new Error(`Player Explorer error: HTTP ${res.status}`);
  }

  return res.json();
}

// Query Lichess Cloud Engine Evaluation (Depth 50-75+ Stockfish)
// Completely free and open — No authentication required!
export async function fetchCloudEval(
  fen: string,
  multiPv: number = 1
): Promise<LichessCloudEval | null> {
  try {
    const params = new URLSearchParams({
      fen,
      multiPv: String(multiPv),
    });
    const res = await fetch(`${LICHESS_API_BASE}/cloud-eval?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GrandmasterAtlas/1.0',
      },
      next: { revalidate: 3600 },
    });

    if (res.status === 404) {
      return null; // Position not evaluated in cloud cluster yet
    }

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Query Lichess 7-piece Syzygy Endgame Tablebase
// Completely free and open — No authentication required!
export async function fetchTablebase(fen: string): Promise<LichessTablebase | null> {
  // Quick count to ensure <= 7 pieces before calling
  const pieceCount = fen.split(' ')[0].replace(/[\/1-8]/g, '').length;
  if (pieceCount > 7) return null;

  try {
    const res = await fetch(`${TABLEBASE_BASE}/standard?fen=${encodeURIComponent(fen)}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GrandmasterAtlas/1.0',
      },
    });

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Verify a Lichess Personal Access Token
export async function verifyLichessToken(
  token: string
): Promise<{ valid: boolean; user?: LichessUser; error?: string }> {
  if (!token.trim()) {
    return { valid: false, error: 'Token is empty' };
  }

  try {
    const res = await fetch(`${LICHESS_API_BASE}/account`, {
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        'User-Agent': 'GrandmasterAtlas/1.0',
      },
    });

    if (res.status === 401) {
      return { valid: false, error: 'Invalid token or token expired' };
    }

    if (!res.ok) {
      return { valid: false, error: `Lichess error: HTTP ${res.status}` };
    }

    const user: LichessUser = await res.json();
    return { valid: true, user };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

// Fetch user profile from Lichess
export async function fetchLichessUser(username: string): Promise<LichessUser | null> {
  try {
    const res = await fetch(`${LICHESS_API_BASE}/user/${encodeURIComponent(username)}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GrandmasterAtlas/1.0',
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Fetch recent games from Lichess (Real NDJSON stream)
export async function fetchLichessGames(
  username: string,
  max: number = 50
): Promise<ImportedGame[]> {
  const token = getSavedLichessToken();
  const headers: Record<string, string> = {
    Accept: 'application/x-ndjson',
    'User-Agent': 'GrandmasterAtlas/1.0',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(
    `${LICHESS_API_BASE}/games/user/${encodeURIComponent(username.trim())}?max=${max}&pgnInJson=true&opening=true&rated=true`,
    { headers }
  );

  if (response.status === 404) {
    throw new Error(`Lichess user "${username}" was not found.`);
  }

  if (response.status === 429) {
    throw new Error('Lichess rate limit exceeded. Please wait a few moments before trying again.');
  }

  if (!response.ok) {
    throw new Error(`Lichess API error: HTTP ${response.status}`);
  }

  const text = await response.text();
  const lines = text.trim().split('\n').filter(Boolean);
  const games: ImportedGame[] = [];

  for (const line of lines) {
    try {
      const raw = JSON.parse(line) as Record<string, unknown>;
      const players = raw.players as Record<string, Record<string, unknown>> | undefined;
      const whitePlayer = players?.white;
      const blackPlayer = players?.black;
      const opening = raw.opening as Record<string, string> | undefined;

      const whiteName = String((whitePlayer?.user as Record<string, unknown>)?.name ?? 'Anonymous');
      const blackName = String((blackPlayer?.user as Record<string, unknown>)?.name ?? 'Anonymous');

      games.push({
        id: String(raw.id ?? ''),
        platform: 'lichess',
        pgn: String(raw.pgn ?? ''),
        white: whiteName,
        black: blackName,
        whiteRating: Number(whitePlayer?.rating ?? 0),
        blackRating: Number(blackPlayer?.rating ?? 0),
        result: raw.winner === 'white' ? '1-0' : raw.winner === 'black' ? '0-1' : '1/2-1/2',
        timeControl: String(raw.speed ?? ''),
        date: new Date(Number(raw.createdAt ?? Date.now())).toISOString().split('T')[0],
        opening: opening?.name,
      });
    } catch {
      // skip unparseable lines
    }
  }

  return games;
}
