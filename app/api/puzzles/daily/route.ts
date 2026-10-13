import { NextResponse } from 'next/server';
import { Chess } from 'chess.js';

export async function GET() {
  try {
    const res = await fetch('https://lichess.org/api/puzzle/daily', {
      headers: { Accept: 'application/json' },
      next: { revalidate: 3600 }, // Cache 1 hour
    });

    if (res.ok) {
      const data = await res.json();
      // data format:
      // puzzle: { id, rating, plays, initialPly, solution: ["e2e4", "e7e5"], themes: [...] }
      // game: { id, pgn, clock }
      const pgn = data.game?.pgn;
      const initialPly = data.puzzle?.initialPly ?? 0;
      const solutionUciList = data.puzzle?.solution || [];

      if (pgn && solutionUciList.length > 0) {
        const chess = new Chess();
        chess.loadPgn(pgn);

        // Replay moves up to initialPly
        const history = chess.history({ verbose: true });
        const replayChess = new Chess();
        for (let i = 0; i < initialPly && i < history.length; i++) {
          replayChess.move(history[i].san);
        }

        const fenBeforeOpponentMove = replayChess.fen();
        // The opponent plays move 0 of the puzzle
        const firstUci = solutionUciList[0];
        const oppMove = replayChess.move({
          from: firstUci.slice(0, 2),
          to: firstUci.slice(2, 4),
          promotion: firstUci.slice(4) || undefined,
        });

        // The user must play move 1 of the puzzle
        const puzzleFen = replayChess.fen();
        const userUci = solutionUciList[1];
        let solutionSan = '';
        if (userUci) {
          const testChess = new Chess(puzzleFen);
          const userMove = testChess.move({
            from: userUci.slice(0, 2),
            to: userUci.slice(2, 4),
            promotion: userUci.slice(4) || undefined,
          });
          solutionSan = userMove?.san || '';
        }

        if (solutionSan) {
          const turn = replayChess.turn() === 'w' ? 'white' : 'black';
          return NextResponse.json({
            success: true,
            puzzle: {
              id: data.puzzle.id,
              fen: puzzleFen,
              turn,
              title: `Lichess Daily: ${data.puzzle.themes?.slice(0, 2).join(' & ') || 'Tactics'}`,
              theme: data.puzzle.themes?.join(', ') || 'Tactical motif',
              rating: data.puzzle.rating,
              solutionSan,
              solutionText: `Solution: ${solutionSan} (${data.puzzle.themes?.[0] || 'winning tactic'})`,
            },
          });
        }
      }
    }
  } catch (err) {
    console.warn('Lichess Daily Puzzle fetch failed, using fallback:', err);
  }

  // Fallback puzzle
  return NextResponse.json({
    success: true,
    puzzle: {
      id: 'p_vienna_daily',
      fen: 'r1b1k2r/pppp1ppp/8/4q3/1bP5/2N1P3/PP1B1PPP/R2QKB1R w KQkq - 0 1',
      turn: 'white',
      title: 'Pin & Win Material',
      theme: 'Tactical Discovery & Fork',
      rating: 1720,
      solutionSan: 'Nd5',
      solutionText: '1. Nd5! attacks the bishop on b4 and threatens the deadly c7 fork.',
    },
  });
}
