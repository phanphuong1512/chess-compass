import { Chess } from 'chess.js';
import type { RepertoireEdge, RepertoireNode, FSRSCard } from '@/types/chess';
import { RepertoireDAG, fenToNodeId, STARTING_FEN } from './dag';

export interface LineMove {
  fromFen: string;
  toFen: string;
  san: string;
  uci: string;
  moveNumber: number;
  isWhite: boolean;
}

export interface RepertoireLine {
  id: string;
  title: string;
  moves: LineMove[];
  formattedMoves: string;
  nodeIds: string[];
  isMainLine: boolean;
  leafNodeId: string;
}

export interface RepertoireChapter {
  id: string;
  title: string;
  subtitle: string;
  keyMoves: string[];
  lines: RepertoireLine[];
  allNodeIds: string[];
  totalPositions: number;
  learnedCount: number;
  dueCount: number;
  progressPercent: number;
  actionType: 'learn' | 'review' | 'overstudy';
  actionCount: number;
}

/**
 * Formats a list of moves into standard chess notation string (e.g. 1. e4 c5 2. Nf3 d6)
 */
export function formatLineString(moves: LineMove[]): string {
  if (moves.length === 0) return '';
  const tokens: string[] = [];
  let lastMoveNumber = 0;

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (m.isWhite) {
      if (m.moveNumber !== lastMoveNumber) {
        tokens.push(`${m.moveNumber}. ${m.san}`);
        lastMoveNumber = m.moveNumber;
      } else {
        tokens.push(m.san);
      }
    } else {
      if (i === 0 || m.moveNumber !== lastMoveNumber) {
        tokens.push(`${m.moveNumber}... ${m.san}`);
        lastMoveNumber = m.moveNumber;
      } else {
        tokens.push(m.san);
      }
    }
  }

  return tokens.join(' ');
}

/**
 * Extracts all distinct variations/lines from a Repertoire DAG.
 * Traverses from root FEN to every leaf position.
 */
export function extractRepertoireLines(
  dag: RepertoireDAG,
  repertoireId: string,
  rootFen = STARTING_FEN
): RepertoireLine[] {
  const rootNodeId = fenToNodeId(rootFen);
  const lines: RepertoireLine[] = [];

  interface PathStep {
    edge: RepertoireEdge;
    isWhite: boolean;
    moveNumber: number;
    fenBefore: string;
    fenAfter: string;
    isBranchPoint: boolean;
  }

  function dfs(currentNodeId: string, currentFen: string, path: PathStep[]) {
    const outgoing = dag
      .getEdgesFrom(currentNodeId)
      .filter((e) => !repertoireId || e.repertoireId === repertoireId);

    if (outgoing.length === 0) {
      // Reached a leaf position! Create a line
      if (path.length > 0) {
        const lineMoves: LineMove[] = path.map((p) => ({
          fromFen: p.fenBefore,
          toFen: p.fenAfter,
          san: p.edge.san,
          uci: p.edge.uci,
          moveNumber: p.moveNumber,
          isWhite: p.isWhite,
        }));

        const nodeIds = [rootNodeId, ...path.map((p) => p.edge.toNodeId)];
        const formatted = formatLineString(lineMoves);

        // ChessAtlas Smart Variation Naming (variation-tree-D0EpKHrD.js):
        // Main Line if no sidelines taken; otherwise named after the branching moves!
        const branchSteps = path.filter((p) => p.isBranchPoint);
        const isMainLine = lines.length === 0 || branchSteps.length === 0;
        const lastMove = lineMoves[lineMoves.length - 1];

        let title = 'Main Line';
        if (!isMainLine && branchSteps.length > 0) {
          if (branchSteps.length === 1) {
            const b = branchSteps[0];
            title = `Line after ${b.moveNumber}${b.isWhite ? '.' : '...'} ${b.edge.san}`;
          } else {
            title = branchSteps
              .map((b) => `${b.moveNumber}${b.isWhite ? '.' : '...'} ${b.edge.san}`)
              .join(' · ');
          }
        } else if (!isMainLine && lastMove) {
          title = `Line with ${lastMove.moveNumber}${lastMove.isWhite ? '.' : '...'} ${lastMove.san}`;
        }

        lines.push({
          id: `line_${lines.length + 1}`,
          title,
          moves: lineMoves,
          formattedMoves: formatted,
          nodeIds,
          isMainLine,
          leafNodeId: currentNodeId,
        });
      }
      return;
    }

    // Sort edges by sortOrder (main line is sortOrder 0)
    outgoing.sort((a, b) => a.sortOrder - b.sortOrder);

    for (let edgeIdx = 0; edgeIdx < outgoing.length; edgeIdx++) {
      const edge = outgoing[edgeIdx];
      const chess = new Chess(currentFen);
      try {
        const m = chess.move(edge.san);
        if (m) {
          const isWhite = chess.turn() === 'b'; // Turn just changed, so moving side was inverse
          const moveNumber = Math.floor(chess.history().length / 2) + (isWhite ? 1 : 0);
          const nextFen = chess.fen();

          // Avoid cyclic infinite loops
          if (!path.some((p) => p.edge.toNodeId === edge.toNodeId)) {
            dfs(edge.toNodeId, nextFen, [
              ...path,
              {
                edge,
                isWhite,
                moveNumber,
                fenBefore: currentFen,
                fenAfter: nextFen,
                isBranchPoint: outgoing.length > 1 && edgeIdx > 0,
              },
            ]);
          }
        }
      } catch {
        // Skip invalid move
      }
    }
  }

  dfs(rootNodeId, rootFen, []);

  return lines;
}

/**
 * Organizes lines into structured Opening Chapters matching ChessAtlas's course hierarchy.
 * Works seamlessly for ANY repertoire (Vienna, Sicilian, French, Caro-Kann, 1.d4, etc.)!
 */
export function buildRepertoireChapters(
  lines: RepertoireLine[],
  repertoireColor: 'white' | 'black',
  cards: FSRSCard[]
): RepertoireChapter[] {
  if (lines.length === 0) return [];

  const cardsMap = new Map<string, FSRSCard>();
  for (const c of cards) {
    cardsMap.set(c.nodeId, c);
  }

  // Group lines by first 1-3 defining moves
  const groupMap = new Map<string, { title: string; subtitle: string; keyMoves: string[]; lines: RepertoireLine[] }>();

  for (const line of lines) {
    let groupKey = 'general';
    let title = 'Main Repertoire Lines';
    let subtitle = 'Primary variations';
    let keyMoves: string[] = [];

    const moves = line.moves;
    if (repertoireColor === 'white') {
      // White repertoire: group by Black's first reply (moves[1])
      if (moves.length >= 2) {
        const reply = moves[1].san;
        keyMoves = [moves[0].san, reply];

        if (reply === 'e5') {
          groupKey = 'e5';
          title = '1. e4 e5 - Open Game';
          subtitle = 'Kingside & Classical Replies';
        } else if (reply === 'c5') {
          groupKey = 'c5';
          title = '1. e4 c5 - Sicilian Defense';
          subtitle = 'Counter-attacking lines';
        } else if (reply === 'e6') {
          groupKey = 'e6';
          title = '1. e4 e6 - French Defense';
          subtitle = 'Solid pawn chains';
        } else if (reply === 'c6') {
          groupKey = 'c6';
          title = '1. e4 c6 - Caro-Kann Defense';
          subtitle = 'Endgame & Structure';
        } else if (reply === 'd5') {
          groupKey = 'd5';
          title = '1. e4 d5 - Scandinavian Defense';
          subtitle = 'Center challenge';
        } else if (reply === 'Nf6') {
          groupKey = 'Nf6';
          title = "1. e4 Nf6 - Alekhine's Defense";
          subtitle = 'Provocative knight leaps';
        } else if (reply === 'g6' || reply === 'd6') {
          groupKey = 'modern';
          title = 'Modern & Pirc Defenses';
          subtitle = 'Hypermodern setups';
        } else {
          groupKey = reply;
          title = `Replies with 1...${reply}`;
          subtitle = 'Sidelines & Alternatives';
        }
      } else if (moves.length >= 1) {
        keyMoves = [moves[0].san];
        groupKey = moves[0].san;
        title = `Starter: ${moves[0].san}`;
        subtitle = 'First move lines';
      }
    } else {
      // Black repertoire: group by White's first move (moves[0])
      if (moves.length >= 1) {
        const first = moves[0].san;
        if (first === 'e4') {
          groupKey = 'e4';
          title = 'Against 1. e4 (King’s Pawn)';
          subtitle = moves[1] ? `Defending with 1...${moves[1].san}` : 'Main defense';
          keyMoves = moves.slice(0, 2).map((m) => m.san);
        } else if (first === 'd4') {
          groupKey = 'd4';
          title = 'Against 1. d4 (Queen’s Pawn)';
          subtitle = moves[1] ? `Replying with 1...${moves[1].san}` : 'Classical structures';
          keyMoves = moves.slice(0, 2).map((m) => m.san);
        } else if (first === 'c4') {
          groupKey = 'c4';
          title = 'Against 1. c4 (English Opening)';
          subtitle = 'Flank combat';
          keyMoves = moves.slice(0, 2).map((m) => m.san);
        } else if (first === 'Nf3') {
          groupKey = 'Nf3';
          title = 'Against 1. Nf3 (Réti Opening)';
          subtitle = 'Flexible preparations';
          keyMoves = moves.slice(0, 2).map((m) => m.san);
        } else {
          groupKey = first;
          title = `Against 1. ${first}`;
          subtitle = 'Flank and unconventional systems';
          keyMoves = [first];
        }
      }
    }

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, { title, subtitle, keyMoves, lines: [] });
    }
    groupMap.get(groupKey)!.lines.push(line);
  }

  // Convert groups into chapters with real telemetry
  const chapters: RepertoireChapter[] = [];

  for (const [key, grp] of groupMap.entries()) {
    const allNodeIdsSet = new Set<string>();
    for (const l of grp.lines) {
      for (const nid of l.nodeIds) {
        allNodeIdsSet.add(nid);
      }
    }
    const allNodeIds = Array.from(allNodeIdsSet);
    const totalPositions = allNodeIds.length;

    let learnedCount = 0;
    let dueCount = 0;

    for (const nid of allNodeIds) {
      const card = cardsMap.get(nid);
      if (card && card.reps > 0) {
        learnedCount++;
        if (card.dueDate <= Date.now()) {
          dueCount++;
        }
      }
    }

    const progressPercent =
      totalPositions > 0 ? Math.min(100, Math.round((learnedCount / totalPositions) * 100)) : 0;

    let actionType: 'learn' | 'review' | 'overstudy' = 'learn';
    let actionCount = Math.max(1, totalPositions - learnedCount);

    if (dueCount > 0) {
      actionType = 'review';
      actionCount = dueCount;
    } else if (progressPercent >= 100) {
      actionType = 'overstudy';
      actionCount = learnedCount;
    }

    chapters.push({
      id: `chapter_${key}`,
      title: grp.title,
      subtitle: grp.subtitle,
      keyMoves: grp.keyMoves,
      lines: grp.lines,
      allNodeIds,
      totalPositions,
      learnedCount,
      dueCount,
      progressPercent,
      actionType,
      actionCount,
    });
  }

  return chapters;
}
