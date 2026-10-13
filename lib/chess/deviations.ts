import { Chess } from 'chess.js';
import type { DeviationReport, ImportedGame, Repertoire, ChessColor } from '@/types/chess';
import { RepertoireDAG, fenToNodeId, STARTING_FEN } from './dag';
import { fetchCloudEval } from '@/lib/api/lichess';
import { evaluatePosition } from './eval';

export interface AnalysisSummary {
  totalAnalyzed: number;
  playerDeviations: number;
  opponentDeviations: number;
  deviations: DeviationReport[];
}

/**
 * Traverses real games ply-by-ply against the Repertoire DAG
 * to identify exact player mistakes and opponent novelties.
 */
export async function detectDeviations(
  games: ImportedGame[],
  dag: RepertoireDAG,
  username: string,
  repertoire: Repertoire,
  options: { maxGames?: number; evaluate?: boolean } = {}
): Promise<AnalysisSummary> {
  const maxGames = options.maxGames ?? 40;
  const shouldEvaluate = options.evaluate ?? true;
  const cleanUsername = username.trim().toLowerCase();
  const deviations: DeviationReport[] = [];

  let playerDeviationsCount = 0;
  let opponentDeviationsCount = 0;
  let totalAnalyzed = 0;

  for (const game of games.slice(0, maxGames)) {
    if (!game.pgn && !game.id) continue;

    // Identify user's color in this game
    const isWhite = game.white.toLowerCase().includes(cleanUsername);
    const isBlack = game.black.toLowerCase().includes(cleanUsername);

    let playerColor: ChessColor;
    if (isWhite && !isBlack) {
      playerColor = 'white';
    } else if (isBlack && !isWhite) {
      playerColor = 'black';
    } else {
      // If ambiguous, match repertoire color
      playerColor = repertoire.color;
    }

    // Only inspect games matching repertoire orientation
    if (playerColor !== repertoire.color) {
      continue;
    }

    totalAnalyzed++;

    try {
      const chess = new Chess();
      // Handle both raw PGN and move strings
      try {
        chess.loadPgn(game.pgn);
      } catch {
        continue;
      }

      const moveHistory = chess.history({ verbose: true });
      const walkChess = new Chess();

      for (let ply = 0; ply < moveHistory.length; ply++) {
        const move = moveHistory[ply];
        const currentFen = walkChess.fen();
        const nodeId = fenToNodeId(currentFen);

        const node = dag.getNode(nodeId);
        if (!node) {
          // Repertoire did not reach this position
          break;
        }

        // Get prepared moves in the active repertoire from this position
        const repEdges = dag
          .getEdgesFrom(nodeId)
          .filter((e) => e.repertoireId === repertoire.id);

        const isPlayerTurn =
          (playerColor === 'white' && walkChess.turn() === 'w') ||
          (playerColor === 'black' && walkChess.turn() === 'b');

        if (isPlayerTurn) {
          // It was player's turn to play
          const isPrepared = repEdges.some((e) => e.san === move.san);

          if (!isPrepared && repEdges.length > 0) {
            // Player DEVIATED from prepared repertoire!
            const preparedMove = repEdges[0].san;
            let centipawnLoss: number | undefined;

            if (shouldEvaluate) {
              try {
                // Try Lichess Cloud Eval first
                const cloud = await fetchCloudEval(currentFen);
                if (cloud && cloud.pvs.length > 0 && cloud.pvs[0].cp !== undefined) {
                  // Loss estimation
                  centipawnLoss = Math.abs(cloud.pvs[0].cp);
                } else {
                  const localEval = evaluatePosition(currentFen);
                  centipawnLoss = Math.abs(localEval.multiPv[0]?.score.value ?? 30);
                }
              } catch {
                centipawnLoss = 50;
              }
            }

            deviations.push({
              gameId: game.id,
              platform: game.platform,
              playerUsername: username,
              playerColor,
              deviationPly: ply + 1,
              playedMove: move.san,
              preparedMove,
              positionFen: currentFen,
              centipawnLoss,
              isOpponentDeviation: false,
              repertoireId: repertoire.id,
              addedToTraining: false,
              createdAt: Date.now(),
            });

            playerDeviationsCount++;
            break; // Stop traversing this game after first deviation
          }
        } else {
          // It was opponent's turn to play
          const isHandledByRepertoire = repEdges.some((e) => e.san === move.san);

          if (!isHandledByRepertoire && repEdges.length > 0) {
            // Opponent played a move not yet in the repertoire (novelty / blind spot)
            deviations.push({
              gameId: game.id,
              platform: game.platform,
              playerUsername: username,
              playerColor,
              deviationPly: ply + 1,
              playedMove: move.san,
              preparedMove: null,
              positionFen: currentFen,
              isOpponentDeviation: true,
              repertoireId: repertoire.id,
              addedToTraining: false,
              createdAt: Date.now(),
            });

            opponentDeviationsCount++;
            break; // Stop traversing this game after opponent novelty
          }
        }

        // Apply move to board
        walkChess.move(move);
      }
    } catch {
      // Continue to next game on parse error
    }
  }

  return {
    totalAnalyzed,
    playerDeviations: playerDeviationsCount,
    opponentDeviations: opponentDeviationsCount,
    deviations,
  };
}
