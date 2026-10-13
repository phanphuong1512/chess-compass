import { db } from '@/lib/db';
import { RepertoireDAG, STARTING_FEN, fenToNodeId } from './dag';
import { createCard } from '@/lib/fsrs/scheduler';
import type { Repertoire, RepertoireNode } from '@/types/chess';

export async function ensureDefaultRepertoire(): Promise<string> {
  const existingReps = await db.repertoires.toArray();
  const viennaExists = existingReps.some((r) => r.id === 'rep_vienna');
  
  if (existingReps.length > 0 && viennaExists) {
    return existingReps[0].id;
  }

  const whiteRepId = 'rep_white_e4';
  const blackRepId = 'rep_black_sicilian';
  const viennaRepId = 'rep_vienna';

  if (!existingReps.some((r) => r.id === whiteRepId)) {
    const whiteRep: Repertoire = {
      id: whiteRepId,
      name: "White: 1.e4 Master Systems",
      color: 'white',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      description: "Grandmaster 1.e4 repertoire covering Italian, Sicilian, French & Caro-Kann",
    };
    await db.repertoires.put(whiteRep);
  }

  if (!existingReps.some((r) => r.id === blackRepId)) {
    const blackRep: Repertoire = {
      id: blackRepId,
      name: "Black: Sicilian Defense",
      color: 'black',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      description: "Fighting responses against 1.e4 with the Sicilian",
    };
    await db.repertoires.put(blackRep);
  }

  // Vienna Game Repertoire (Matching user's diagram)
  if (!viennaExists) {
    const viennaRep: Repertoire = {
      id: viennaRepId,
      name: "Vienna Game",
      color: 'white',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      description: "Dynamic 1.e4 e5 2.Nc3 repertoire with aggressive kingside lines",
    };
    await db.repertoires.put(viennaRep);
  }

  const dag = new RepertoireDAG();

  // Root node
  const rootNode: RepertoireNode = {
    id: fenToNodeId(STARTING_FEN),
    fen: STARTING_FEN,
    comments: 'Starting Position',
    annotations: [],
  };
  await db.nodes.put(rootNode);

  // Sample lines to populate
  interface SeedLine {
    repId: string;
    moves: string[];
    annotations?: Record<string, string>;
  }

  const sampleLines: SeedLine[] = [
    // Vienna Game (From Diagram Screenshot)
    // Main line: Closed Vienna with 7.f5!
    {
      repId: viennaRepId,
      moves: ['e4', 'e5', 'Nc3', 'Nc6', 'Bc4', 'Nf6', 'd3', 'Bc5', 'f4', 'd6', 'Nf3', 'a6', 'f5'],
      annotations: {
        'f5': 'f5! Shuts down Be6 and Bg4, opens a kingside attack with g4, and sets up Bg5 tactics.',
      },
    },
    { repId: viennaRepId, moves: ['e4', 'e5', 'Nc3', 'Nf6', 'f4', 'd5', 'fxe5', 'Nxe4', 'Qf3', 'Nc6'] },
    { repId: viennaRepId, moves: ['e4', 'e5', 'Nc3', 'Nf6', 'Bc4', 'Nxe4', 'Qh5', 'Nd6', 'Bb3', 'Nc6'] },
    { repId: viennaRepId, moves: ['e4', 'e5', 'Nc3', 'Nf6', 'g3', 'd5', 'exd5', 'Nxd5', 'Bg2'] },
    { repId: viennaRepId, moves: ['e4', 'e5', 'Nc3', 'Bc5', 'Bc4', 'Nf6', 'd3', 'd6', 'f4'] },
    { repId: viennaRepId, moves: ['e4', 'e5', 'Nc3', 'd6', 'Bc4', 'Nf6', 'd3', 'Be7'] },
    { repId: viennaRepId, moves: ['e4', 'e5', 'Nc3', 'Bb4', 'Nge2', 'Nf6', 'a3', 'Be7'] },
    { repId: viennaRepId, moves: ['e4', 'e5', 'Nc3', 'g6', 'Nf3', 'Bg7', 'd4', 'exd4', 'Nxd4'] },
    // Line 1: Italian Game
    { repId: whiteRepId, moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3'] },
    // Line 2: Sicilian Open
    { repId: whiteRepId, moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3'] },
    // Line 3: French Defense
    { repId: whiteRepId, moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6', 'e5'] },
    // Line 4: Caro-Kann
    { repId: whiteRepId, moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4'] },
    // Line 5: Black Sicilian Najdorf
    { repId: blackRepId, moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'] },
  ];

  for (const line of sampleLines) {
    let currentFen = STARTING_FEN;
    for (const san of line.moves) {
      try {
        const { node, edge, isTransposition } = dag.addMove(currentFen, san, line.repId);

        // Apply annotation if present
        if (line.annotations && line.annotations[san]) {
          const comment = line.annotations[san];
          node.comments = comment;
          edge.annotation = { comment };
        }

        await db.nodes.put(node);
        if (!edge.id) {
          const { id: _unused, ...edgeToSave } = edge;
          const edgeId = await db.edges.put(edgeToSave);
          edge.id = edgeId as number;
        }

        if (!isTransposition) {
          const existingCard = await db.cards.where('nodeId').equals(node.id).first();
          if (!existingCard) {
            const card = createCard(node.id);
            card.dueDate = Date.now() - 1000;
            await db.cards.put(card);
          }
        }
        currentFen = node.fen;
      } catch {
        break;
      }
    }
  }

  return viennaExists ? existingReps[0].id : viennaRepId;
}
