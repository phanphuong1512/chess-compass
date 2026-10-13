import { Chess } from 'chess.js';
import type { RepertoireNode, RepertoireEdge } from '@/types/chess';

// Normalize FEN by stripping half-move clock and full-move number
// This ensures transpositions converge to the same node
export function normalizeFen(fen: string): string {
  const parts = fen.split(' ');
  // Keep only: piece placement, active color, castling, en passant
  return parts.slice(0, 4).join(' ');
}

// Generate a deterministic node ID from a FEN
export function fenToNodeId(fen: string): string {
  return normalizeFen(fen);
}

// DAG Manager class for repertoire operations
export class RepertoireDAG {
  private nodes: Map<string, RepertoireNode> = new Map();
  private edges: Map<string, RepertoireEdge[]> = new Map(); // fromNodeId -> edges
  private reverseEdges: Map<string, RepertoireEdge[]> = new Map(); // toNodeId -> edges
  
  constructor(
    initialNodes?: RepertoireNode[],
    initialEdges?: RepertoireEdge[]
  ) {
    if (initialNodes) {
      for (const node of initialNodes) {
        this.nodes.set(node.id, node);
      }
    }
    if (initialEdges) {
      for (const edge of initialEdges) {
        this.addEdgeInternal(edge);
      }
    }
  }

  private addEdgeInternal(edge: RepertoireEdge): void {
    const fromEdges = this.edges.get(edge.fromNodeId) ?? [];
    fromEdges.push(edge);
    this.edges.set(edge.fromNodeId, fromEdges);

    const toEdges = this.reverseEdges.get(edge.toNodeId) ?? [];
    toEdges.push(edge);
    this.reverseEdges.set(edge.toNodeId, toEdges);
  }

  // Add a move to the repertoire - handles transpositions automatically
  addMove(fromFen: string, san: string, repertoireId: string): { node: RepertoireNode; edge: RepertoireEdge; isTransposition: boolean } {
    const chess = new Chess(fromFen);
    const move = chess.move(san);
    if (!move) throw new Error(`Invalid move: ${san} from ${fromFen}`);

    const fromNodeId = fenToNodeId(fromFen);
    const resultFen = chess.fen();
    const toNodeId = fenToNodeId(resultFen);

    // Ensure from-node exists
    if (!this.nodes.has(fromNodeId)) {
      this.nodes.set(fromNodeId, {
        id: fromNodeId,
        fen: fromFen,
        comments: '',
        annotations: [],
      });
    }

    // Check if target node already exists (transposition!)
    const isTransposition = this.nodes.has(toNodeId);
    if (!isTransposition) {
      this.nodes.set(toNodeId, {
        id: toNodeId,
        fen: resultFen,
        comments: '',
        annotations: [],
      });
    }

    // Check if this exact edge already exists
    const existingEdges = this.edges.get(fromNodeId) ?? [];
    const existingEdge = existingEdges.find(
      (e) => e.toNodeId === toNodeId && e.san === san
    );
    if (existingEdge) {
      return { node: this.nodes.get(toNodeId)!, edge: existingEdge, isTransposition };
    }

    const edge: RepertoireEdge = {
      fromNodeId,
      toNodeId,
      san: move.san,
      uci: move.from + move.to + (move.promotion ?? ''),
      repertoireId,
      sortOrder: existingEdges.length,
    };

    this.addEdgeInternal(edge);

    return { node: this.nodes.get(toNodeId)!, edge, isTransposition };
  }

  // Get node by ID
  getNode(nodeId: string): RepertoireNode | undefined {
    return this.nodes.get(nodeId);
  }

  // Get all outgoing edges from a node
  getEdgesFrom(nodeId: string): RepertoireEdge[] {
    return this.edges.get(nodeId) ?? [];
  }

  // Get all incoming edges to a node
  getEdgesTo(nodeId: string): RepertoireEdge[] {
    return this.reverseEdges.get(nodeId) ?? [];
  }

  // Get all nodes
  getAllNodes(): RepertoireNode[] {
    return Array.from(this.nodes.values());
  }

  // Get all edges
  getAllEdges(): RepertoireEdge[] {
    const allEdges: RepertoireEdge[] = [];
    for (const edges of this.edges.values()) {
      allEdges.push(...edges);
    }
    return allEdges;
  }

  // Check if a node is a leaf (no outgoing edges)
  isLeaf(nodeId: string): boolean {
    return (this.edges.get(nodeId) ?? []).length === 0;
  }

  // Get all leaf nodes
  getLeafNodes(): RepertoireNode[] {
    return this.getAllNodes().filter((node) => this.isLeaf(node.id));
  }

  // Get the main line from root to a specific depth
  getMainLine(rootFen: string, maxDepth: number = 50): RepertoireEdge[] {
    const line: RepertoireEdge[] = [];
    let currentId = fenToNodeId(rootFen);
    
    for (let i = 0; i < maxDepth; i++) {
      const edges = this.getEdgesFrom(currentId);
      if (edges.length === 0) break;
      // Main line is always the first edge (sortOrder 0)
      const mainEdge = edges.reduce((a, b) => a.sortOrder < b.sortOrder ? a : b);
      line.push(mainEdge);
      currentId = mainEdge.toNodeId;
    }
    
    return line;
  }

  // Get all variations from a position
  getVariations(nodeId: string): RepertoireEdge[][] {
    const variations: RepertoireEdge[][] = [];
    const edges = this.getEdgesFrom(nodeId);
    
    for (const edge of edges) {
      const subLine = this.getMainLine(this.nodes.get(edge.toNodeId)?.fen ?? '', 50);
      variations.push([edge, ...subLine]);
    }
    
    return variations;
  }

  // Remove a move (edge) and optionally orphaned nodes
  removeEdge(fromNodeId: string, toNodeId: string, san: string): void {
    const fromEdges = this.edges.get(fromNodeId) ?? [];
    const filtered = fromEdges.filter(
      (e) => !(e.toNodeId === toNodeId && e.san === san)
    );
    this.edges.set(fromNodeId, filtered);

    const revEdges = this.reverseEdges.get(toNodeId) ?? [];
    const filteredRev = revEdges.filter(
      (e) => !(e.fromNodeId === fromNodeId && e.san === san)
    );
    this.reverseEdges.set(toNodeId, filteredRev);

    // If target node has no more incoming edges, remove it and its subtree
    if ((this.reverseEdges.get(toNodeId) ?? []).length === 0) {
      this.removeSubtree(toNodeId);
    }
  }

  // Remove a node and all its descendants (if orphaned)
  private removeSubtree(nodeId: string): void {
    const edges = this.edges.get(nodeId) ?? [];
    for (const edge of edges) {
      const revEdges = this.reverseEdges.get(edge.toNodeId) ?? [];
      const filteredRev = revEdges.filter((e) => e.fromNodeId !== nodeId);
      this.reverseEdges.set(edge.toNodeId, filteredRev);
      
      if (filteredRev.length === 0) {
        this.removeSubtree(edge.toNodeId);
      }
    }
    this.edges.delete(nodeId);
    this.nodes.delete(nodeId);
  }

  // Count total positions
  get nodeCount(): number {
    return this.nodes.size;
  }

  // Count total moves
  get edgeCount(): number {
    let count = 0;
    for (const edges of this.edges.values()) {
      count += edges.length;
    }
    return count;
  }
}

// Starting FEN for standard chess
export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
