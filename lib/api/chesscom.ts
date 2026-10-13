import type { ImportedGame } from '@/types/chess';

const CHESSCOM_API_BASE = 'https://api.chess.com/pub/player';
const USER_AGENT = 'GrandmasterAtlas/1.0 (happy-bishop-repertoire; contact@happybishops.com)';

interface ChessComArchive {
  archives: string[];
}

interface ChessComGame {
  url: string;
  pgn: string;
  time_control: string;
  end_time: number;
  rated: boolean;
  white: {
    username: string;
    rating: number;
    result: string;
  };
  black: {
    username: string;
    rating: number;
    result: string;
  };
}

interface ChessComGamesResponse {
  games: ChessComGame[];
}

export interface ChessComProfile {
  avatar?: string;
  player_id: number;
  id: string;
  url: string;
  name?: string;
  username: string;
  title?: string;
  status: string;
  country: string;
}

// Fetch player profile from Chess.com
export async function fetchChessComProfile(username: string): Promise<ChessComProfile | null> {
  try {
    const res = await fetch(`${CHESSCOM_API_BASE}/${encodeURIComponent(username.trim())}`, {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Fetch recent games from Chess.com
export async function fetchChessComGames(
  username: string,
  months: number = 2
): Promise<ImportedGame[]> {
  const cleanUsername = username.trim().toLowerCase();
  // First get archives list
  const archiveRes = await fetch(`${CHESSCOM_API_BASE}/${cleanUsername}/games/archives`, {
    headers: {
      'User-Agent': USER_AGENT,
    },
  });

  if (archiveRes.status === 404) {
    throw new Error(`Chess.com player "${username}" was not found.`);
  }

  if (!archiveRes.ok) {
    throw new Error(`Chess.com API error: HTTP ${archiveRes.status}`);
  }

  const archiveData: ChessComArchive = await archiveRes.json();
  const archives = archiveData.archives || [];
  if (archives.length === 0) {
    return [];
  }

  const recentArchives = archives.slice(-months);
  const allGames: ImportedGame[] = [];

  for (const archiveUrl of recentArchives) {
    try {
      const gamesRes = await fetch(archiveUrl, {
        headers: {
          'User-Agent': USER_AGENT,
        },
      });
      if (!gamesRes.ok) continue;

      const gamesData: ChessComGamesResponse = await gamesRes.json();
      if (!gamesData.games) continue;

      for (const game of gamesData.games) {
        const result =
          game.white.result === 'win'
            ? '1-0'
            : game.black.result === 'win'
              ? '0-1'
              : '1/2-1/2';

        allGames.push({
          id: game.url.split('/').pop() ?? String(game.end_time),
          platform: 'chesscom',
          pgn: game.pgn ?? '',
          white: game.white.username,
          black: game.black.username,
          whiteRating: game.white.rating,
          blackRating: game.black.rating,
          result,
          timeControl: game.time_control,
          date: new Date(game.end_time * 1000).toISOString().split('T')[0],
        });
      }
    } catch {
      // skip failed archives
    }
  }

  // Sort games most recent first
  allGames.reverse();
  return allGames;
}
