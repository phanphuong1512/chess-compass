'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  MessageSquare,
  Sparkles,
  BookOpen,
  ArrowUpDown,
  GraduationCap,
  Save,
  Edit3,
  CheckCircle2,
  Clock,
  Circle,
  Flag
} from 'lucide-react';
import { Chess } from 'chess.js';
import ChessBoard from './ChessBoard';
import type { Repertoire, RepertoireNode, RepertoireEdge, FSRSCard } from '@/types/chess';
import { STARTING_FEN, fenToNodeId } from '@/lib/chess/dag';
import { db } from '@/lib/db';

interface RepertoireGraphProps {
  repertoire: Repertoire;
  allNodes: RepertoireNode[];
  allEdges: RepertoireEdge[];
  allCards: FSRSCard[];
  onBack?: () => void;
  onStartTrainingNode?: (nodeId: string) => void;
  onUpdateNode?: (node: RepertoireNode) => void;
}

// Tree node structure for layout
export interface GraphLayoutNode {
  id: string; // unique tree path ID
  nodeId: string; // FEN ID
  fromNodeId: string;
  san: string;
  formattedSan: string;
  ply: number;
  depth: number;
  isWhite: boolean;
  edge: RepertoireEdge | null;
  fen: string;
  annotation?: string;
  status: 'new' | 'learned' | 'due';
  // Layout coordinates
  x: number;
  y: number;
  width: number;
  height: number;
  subtreeHeight: number;
  // Relationships
  parentId: string | null;
  children: GraphLayoutNode[];
  rawChildCount: number;
  collapsed: boolean;
  // Breadcrumb
  variationName?: string;
  breadcrumb: string;
}

const NODE_W = 82;
const NODE_H = 32;
const ROOT_W = 84;
const ROOT_H = 34;
const X_STEP = 138;
const Y_STEP = 44;

function formatSanWithPiece(formattedSan: string, isWhite: boolean): React.ReactNode {
  const match = formattedSan.match(/^(\d+\.{1,3}\s*)(.*)$/);
  const prefix = match ? match[1] : '';
  const movePart = match ? match[2] : formattedSan;

  let pieceIcon: string | null = null;
  let moveNotation = movePart;

  if (movePart.startsWith('N')) {
    pieceIcon = isWhite ? '♘' : '♞';
    moveNotation = movePart.slice(1);
  } else if (movePart.startsWith('B')) {
    pieceIcon = isWhite ? '♗' : '♝';
    moveNotation = movePart.slice(1);
  } else if (movePart.startsWith('R')) {
    pieceIcon = isWhite ? '♖' : '♜';
    moveNotation = movePart.slice(1);
  } else if (movePart.startsWith('Q')) {
    pieceIcon = isWhite ? '♕' : '♛';
    moveNotation = movePart.slice(1);
  } else if (movePart.startsWith('K')) {
    pieceIcon = isWhite ? '♔' : '♚';
    moveNotation = movePart.slice(1);
  }

  return (
    <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
      <span className="text-[0.65rem] opacity-75">{prefix}</span>
      {pieceIcon && <span className="text-xs leading-none drop-shadow-xs">{pieceIcon}</span>}
      <span className="font-bold">{moveNotation}</span>
    </span>
  );
}

export default function RepertoireGraph({
  repertoire,
  allNodes,
  allEdges,
  allCards,
  onBack,
  onStartTrainingNode,
  onUpdateNode,
}: RepertoireGraphProps) {
  // Canvas viewport state
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 120, y: 250 });
  const [zoom, setZoom] = useState(0.9);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0, hasMoved: false });

  // Node selection & board state
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<'white' | 'black'>(repertoire.color);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

  // Annotation editing
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [editedNote, setEditedNote] = useState('');

  // Node & Card Lookup Maps
  const nodesMap = useMemo(() => {
    const map = new Map<string, RepertoireNode>();
    for (const n of allNodes) map.set(n.id, n);
    return map;
  }, [allNodes]);

  const cardsMap = useMemo(() => {
    const map = new Map<string, FSRSCard>();
    for (const c of allCards) map.set(c.nodeId, c);
    return map;
  }, [allCards]);

  // Edges filtered by active repertoire
  const repEdges = useMemo(() => {
    return allEdges.filter((e) => e.repertoireId === repertoire.id);
  }, [allEdges, repertoire.id]);

  // 1. Build hierarchical tree from repertoire edges
  const layoutTree = useMemo(() => {
    const rootFenId = fenToNodeId(STARTING_FEN);
    const rootNodeData = nodesMap.get(rootFenId);

    // Recursive tree builder
    function buildSubtree(
      fromId: string,
      currentFen: string,
      depth: number,
      pathPrefix: string,
      visited: Set<string>
    ): GraphLayoutNode[] {
      if (depth > 25 || visited.has(fromId)) return [];
      visited.add(fromId);

      const outgoing = repEdges
        .filter((e) => e.fromNodeId === fromId)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      return outgoing.map((edge) => {
        const toId = edge.toNodeId;
        const targetNode = nodesMap.get(toId);
        const card = cardsMap.get(toId);
        const fen = targetNode?.fen || currentFen;

        const ply = depth + 1;
        const isWhite = ply % 2 === 1;
        const moveNumber = Math.ceil(ply / 2);
        const formattedSan = isWhite ? `${moveNumber}. ${edge.san}` : `${moveNumber}... ${edge.san}`;
        const treeId = `${pathPrefix}->${edge.san}`;

        let status: 'new' | 'learned' | 'due' = 'new';
        if (card) {
          if (card.dueDate <= Date.now() && card.reps > 0) status = 'due';
          else if (card.reps > 0) status = 'learned';
        }

        const childOutgoing = repEdges.filter((e) => e.fromNodeId === toId);
        const rawChildCount = childOutgoing.length;

        const isCollapsed = collapsedNodes.has(treeId);
        const children = isCollapsed
          ? []
          : buildSubtree(toId, fen, depth + 1, treeId, new Set(visited));

        const annotation =
          edge.annotation?.comment ||
          targetNode?.comments ||
          (edge.annotation?.nag ? `Annotation: ${edge.annotation.nag}` : undefined);

        return {
          id: treeId,
          nodeId: toId,
          fromNodeId: fromId,
          san: edge.san,
          formattedSan,
          ply,
          depth: ply,
          isWhite,
          edge,
          fen,
          annotation,
          status,
          x: 0,
          y: 0,
          width: NODE_W,
          height: NODE_H,
          subtreeHeight: 1,
          parentId: pathPrefix === 'root' ? 'root' : pathPrefix,
          children,
          rawChildCount,
          collapsed: isCollapsed,
          breadcrumb: '',
        };
      });
    }

    const rootOutgoing = repEdges.filter((e) => e.fromNodeId === rootFenId);
    const rootRawChildCount = rootOutgoing.length;
    const isRootCollapsed = collapsedNodes.has('root');
    const rootChildren = isRootCollapsed
      ? []
      : buildSubtree(rootFenId, STARTING_FEN, 0, 'root', new Set());

    // Root node
    const rootNode: GraphLayoutNode = {
      id: 'root',
      nodeId: rootFenId,
      fromNodeId: '',
      san: 'Start',
      formattedSan: repertoire.name,
      ply: 0,
      depth: 0,
      isWhite: true,
      edge: null,
      fen: STARTING_FEN,
      annotation: rootNodeData?.comments,
      status: 'learned',
      x: 0,
      y: 0,
      width: ROOT_W,
      height: ROOT_H,
      subtreeHeight: 1,
      parentId: null,
      children: rootChildren,
      rawChildCount: rootRawChildCount,
      collapsed: isRootCollapsed,
      breadcrumb: 'Starting Position',
    };

    // Pass 1: Compute subtree heights (in slots)
    function computeHeights(node: GraphLayoutNode): number {
      if (node.children.length === 0 || node.collapsed) {
        node.subtreeHeight = 1;
        return 1;
      }
      let sum = 0;
      for (const child of node.children) {
        sum += computeHeights(child);
      }
      node.subtreeHeight = Math.max(1, sum);
      return node.subtreeHeight;
    }
    computeHeights(rootNode);

    // Pass 2: Assign coordinates
    let runningSlot = 0;
    function assignCoords(node: GraphLayoutNode, depth: number, currentBreadcrumb: string) {
      node.depth = depth;
      node.x = depth === 0 ? 0 : depth * X_STEP;
      node.breadcrumb = depth === 0 ? 'Starting Position' : currentBreadcrumb;

      if (node.children.length === 0 || node.collapsed) {
        node.y = runningSlot * Y_STEP;
        runningSlot += 1;
      } else {
        for (let i = 0; i < node.children.length; i++) {
          const child = node.children[i];
          const nextBreadcrumb = currentBreadcrumb
            ? `${currentBreadcrumb} ${child.formattedSan}`
            : child.formattedSan;
          assignCoords(child, depth + 1, nextBreadcrumb);
        }
        // Center parent between its first and last child
        const firstY = node.children[0].y;
        const lastY = node.children[node.children.length - 1].y;
        node.y = (firstY + lastY) / 2;
      }
    }
    assignCoords(rootNode, 0, '');

    return rootNode;
  }, [repEdges, nodesMap, cardsMap, repertoire, collapsedNodes]);

  // Flattened nodes array & lookup by tree id
  const { flatNodes, nodeLookup, activeLinePathIds } = useMemo(() => {
    const list: GraphLayoutNode[] = [];
    const lookup = new Map<string, GraphLayoutNode>();

    function traverse(node: GraphLayoutNode) {
      list.push(node);
      lookup.set(node.id, node);
      for (const child of node.children) {
        traverse(child);
      }
    }
    traverse(layoutTree);

    // Compute path of active selected node from root
    const pathIds = new Set<string>();
    if (selectedTreeId && lookup.has(selectedTreeId)) {
      let curr: GraphLayoutNode | null = lookup.get(selectedTreeId) || null;
      while (curr) {
        pathIds.add(curr.id);
        curr = curr.parentId ? lookup.get(curr.parentId) || null : null;
      }
    }

    return { flatNodes: list, nodeLookup: lookup, activeLinePathIds: pathIds };
  }, [layoutTree, selectedTreeId]);

  // Initial selection: Default to the deepest node of the first variation or root
  useEffect(() => {
    if (!selectedTreeId && flatNodes.length > 0) {
      // Find a deep leaf in the first branch (e.g. 7.f5 in Vienna if present)
      let current = layoutTree;
      while (current.children && current.children.length > 0) {
        current = current.children[0];
      }
      setSelectedTreeId(current.id);
    }
  }, [selectedTreeId, flatNodes, layoutTree]);

  // Active selected node object
  const activeNode = useMemo(() => {
    if (!selectedTreeId) return layoutTree;
    let currId: string | null = selectedTreeId;
    while (currId) {
      if (nodeLookup.has(currId)) {
        return nodeLookup.get(currId)!;
      }
      const lastArrow = currId.lastIndexOf('->');
      if (lastArrow <= 0) break;
      currId = currId.slice(0, lastArrow);
    }
    return layoutTree;
  }, [selectedTreeId, nodeLookup, layoutTree]);

  // Update note editor when active node changes
  useEffect(() => {
    setEditedNote(activeNode.annotation || '');
    setIsEditingNote(false);
  }, [activeNode]);

  // Pan to center of node smoothly
  const panToNode = useCallback(
    (node: GraphLayoutNode, smooth = true) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();

      // Desired position: node at around 35% from left and 50% from top
      const targetPanX = rect.width * 0.35 - (node.x + node.width / 2) * zoom;
      const targetPanY = rect.height * 0.5 - (node.y + node.height / 2) * zoom;

      setPan({ x: targetPanX, y: targetPanY });
    },
    [zoom]
  );

  // Auto-center on initial mount
  useEffect(() => {
    if (activeNode) {
      panToNode(activeNode, false);
    }
  }, [layoutTree.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        isEditingNote
      ) {
        return;
      }

      if (!activeNode) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        // Go to first child
        if (activeNode.children.length > 0) {
          const next = activeNode.children[0];
          setSelectedTreeId(next.id);
          panToNode(next);
        } else if (activeNode.rawChildCount > 0 && activeNode.collapsed) {
          // If active node is collapsed, ArrowRight auto-expands it
          setCollapsedNodes((prev) => {
            const next = new Set(prev);
            next.delete(activeNode.id);
            return next;
          });
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        // Go to parent
        if (activeNode.parentId && nodeLookup.has(activeNode.parentId)) {
          const parent = nodeLookup.get(activeNode.parentId)!;
          setSelectedTreeId(parent.id);
          panToNode(parent);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        // Go to next sibling
        if (activeNode.parentId && nodeLookup.has(activeNode.parentId)) {
          const parent = nodeLookup.get(activeNode.parentId)!;
          const idx = parent.children.findIndex((c) => c.id === activeNode.id);
          if (idx !== -1 && idx < parent.children.length - 1) {
            const nextSibling = parent.children[idx + 1];
            setSelectedTreeId(nextSibling.id);
            panToNode(nextSibling);
          }
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        // Go to previous sibling
        if (activeNode.parentId && nodeLookup.has(activeNode.parentId)) {
          const parent = nodeLookup.get(activeNode.parentId)!;
          const idx = parent.children.findIndex((c) => c.id === activeNode.id);
          if (idx > 0) {
            const prevSibling = parent.children[idx - 1];
            setSelectedTreeId(prevSibling.id);
            panToNode(prevSibling);
          }
        }
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setOrientation((o) => (o === 'white' ? 'black' : 'white'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeNode, nodeLookup, panToNode, isEditingNote]);

  // Mouse drag handlers for canvas panning
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag on left click
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
      hasMoved: false,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragStartRef.current.hasMoved = true;
    }
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Wheel zoom centered on mouse cursor
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.25), 2.2);

    // Keep point under mouse steady
    const newPanX = mouseX - (mouseX - pan.x) * (newZoom / zoom);
    const newPanY = mouseY - (mouseY - pan.y) * (newZoom / zoom);

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  // Zoom control buttons
  const handleZoomIn = () => {
    setZoom((z) => Math.min(z * 1.25, 2.2));
  };

  const handleZoomOut = () => {
    setZoom((z) => Math.max(z * 0.8, 0.25));
  };

  const handleFitView = () => {
    if (flatNodes.length === 0 || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const n of flatNodes) {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x + n.width);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y + n.height);
    }

    const treeW = maxX - minX + 160;
    const treeH = maxY - minY + 160;

    const scaleX = rect.width / treeW;
    const scaleY = rect.height / treeH;
    const optimalZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.35), 1.2);

    setZoom(optimalZoom);
    setPan({
      x: (rect.width - treeW * optimalZoom) / 2 - minX * optimalZoom + 80 * optimalZoom,
      y: (rect.height - treeH * optimalZoom) / 2 - minY * optimalZoom + 80 * optimalZoom,
    });
  };

  // Toggle Collapse
  const toggleCollapse = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    setCollapsedNodes(new Set());
  };

  const handleCollapseAll = () => {
    // Collect all nodes that have multiple variations to collapse
    const toCollapse = new Set<string>();
    for (const node of flatNodes) {
      if (node.rawChildCount > 1 && node.id !== 'root') {
        toCollapse.add(node.id);
      }
    }
    setCollapsedNodes(toCollapse);
  };

  // Save annotation changes to IndexedDB
  const handleSaveNote = async () => {
    if (!activeNode) return;
    const targetNode = nodesMap.get(activeNode.nodeId);
    if (!targetNode) return;

    const updatedNode: RepertoireNode = {
      ...targetNode,
      comments: editedNote,
    };

    await db.nodes.put(updatedNode);
    if (onUpdateNode) onUpdateNode(updatedNode);
    activeNode.annotation = editedNote;
    setIsEditingNote(false);
  };

  // Compute last move for chessboard preview highlight
  const lastMove = useMemo(() => {
    if (!activeNode.edge) return null;
    return {
      from: activeNode.edge.uci.slice(0, 2),
      to: activeNode.edge.uci.slice(2, 4),
    };
  }, [activeNode]);

  // Extract opening variation name from breadcrumb or node
  const displayOpeningTitle = useMemo(() => {
    return repertoire.name.toUpperCase();
  }, [repertoire.name]);

  return (
    <div className="relative flex h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-[#0B0F17] select-none text-white">
      {/* ========================================================================= */}
      {/* GRAPH CANVAS AREA */}
      {/* ========================================================================= */}
      <div
        ref={containerRef}
        className="relative flex-1 h-full overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Dot Grid Background */}
        <svg className="absolute inset-0 h-full w-full pointer-events-none opacity-25">
          <defs>
            <pattern
              id="dot-grid"
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
              patternTransform={`translate(${pan.x % (24 * zoom)}, ${pan.y % (24 * zoom)}) scale(${zoom})`}
            >
              <circle cx="2" cy="2" r="1.2" fill="#94A3B8" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dot-grid)" />
        </svg>

        {/* Top Controls Overlay */}
        <div className="absolute top-4 left-4 z-30 flex items-center gap-2">
          <button
            type="button"
            onClick={handleExpandAll}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#111827]/80 px-3 py-1.5 text-xs font-medium text-gray-300 backdrop-blur-md transition-colors hover:bg-white/10 hover:text-white cursor-pointer shadow-sm"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={handleCollapseAll}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#111827]/80 px-3 py-1.5 text-xs font-medium text-gray-300 backdrop-blur-md transition-colors hover:bg-white/10 hover:text-white cursor-pointer shadow-sm"
          >
            Collapse all
          </button>
        </div>

        {/* Top Right Legend */}
        <div className="absolute top-4 right-4 z-30 flex items-center gap-3 rounded-full border border-white/10 bg-[#111827]/80 px-4 py-1.5 backdrop-blur-md text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border border-gray-400 bg-gray-500/20" />
            <span className="text-gray-400">New</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#10B981]" />
            <span className="text-emerald-400 font-medium">Learned</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#F59E0B]" />
            <span className="text-amber-400 font-medium">Due</span>
          </div>
        </div>

        {/* Bottom Left Zoom Controls */}
        <div className="absolute bottom-6 left-6 z-30 flex flex-col rounded-xl border border-white/10 bg-[#111827]/85 p-1 backdrop-blur-md shadow-lg">
          <button
            type="button"
            onClick={handleZoomIn}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <div className="h-px w-full bg-white/10" />
          <button
            type="button"
            onClick={handleZoomOut}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <div className="h-px w-full bg-white/10" />
          <button
            type="button"
            onClick={handleFitView}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
            title="Fit to View"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Bottom Center Keyboard Hints */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-full border border-white/10 bg-[#111827]/90 px-4 py-1.5 backdrop-blur-md text-xs text-gray-400 shadow-xl pointer-events-none">
          <div className="flex items-center gap-1">
            <span className="font-mono text-[0.7rem] text-gray-300">← →</span>
            <span>Nav</span>
          </div>
          <span className="text-gray-600">·</span>
          <div className="flex items-center gap-1">
            <span className="font-mono text-[0.7rem] text-gray-300">↑ ↓</span>
            <span>Variation</span>
          </div>
          <span className="text-gray-600">·</span>
          <div className="flex items-center gap-1">
            <kbd className="rounded bg-white/10 px-1 py-0.2 font-mono text-[0.65rem] text-gray-300">F</kbd>
            <span>Flip</span>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* TRANSFORMED CANVAS LAYER (NODES & CONNECTORS) */}
        {/* ===================================================================== */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {/* SVG CONNECTOR LINES */}
          <svg className="absolute inset-0 overflow-visible pointer-events-none">
            {flatNodes.map((node) => {
              if (!node.parentId || !nodeLookup.has(node.parentId)) return null;
              const parent = nodeLookup.get(node.parentId)!;

              const x1 = parent.x + parent.width;
              const y1 = parent.y + parent.height / 2;
              const x2 = node.x;
              const y2 = node.y + node.height / 2;
              const dx = (x2 - x1) * 0.55;

              const pathData = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
              const isActive = activeLinePathIds.has(node.id) && activeLinePathIds.has(parent.id);

              return (
                <g key={`edge-${parent.id}-${node.id}`}>
                  {/* Subtle shadow glow for active path */}
                  {isActive && (
                    <path
                      d={pathData}
                      fill="none"
                      stroke="#8B5CF6"
                      strokeWidth="5"
                      strokeOpacity="0.3"
                    />
                  )}
                  {/* Main curve line */}
                  <path
                    d={pathData}
                    fill="none"
                    stroke={isActive ? '#A78BFA' : 'rgba(255, 255, 255, 0.16)'}
                    strokeWidth={isActive ? '2.5' : '1.5'}
                    className="transition-colors duration-150"
                  />
                </g>
              );
            })}

            {/* Short dashed connector stub for collapsed nodes leading into badge */}
            {flatNodes.map((node) => {
              if (!node.collapsed || node.rawChildCount === 0) return null;
              const badgeSize = 20;
              const badgeLeft = node.width + Math.round((X_STEP - node.width - badgeSize) / 2);
              const x1 = node.x + node.width;
              const y1 = node.y + node.height / 2;
              const x2 = node.x + badgeLeft + badgeSize / 2;
              const isActive = activeLinePathIds.has(node.id);

              return (
                <line
                  key={`collapsed-stub-${node.id}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y1}
                  stroke={isActive ? '#A78BFA' : 'rgba(255, 255, 255, 0.25)'}
                  strokeWidth={isActive ? '2' : '1.5'}
                  strokeDasharray="3 3"
                />
              );
            })}
          </svg>

          {/* HTML PILL NODES */}
          <div className="absolute inset-0 pointer-events-auto">
            {flatNodes.map((node) => {
              const isSelected = activeNode.id === node.id;
              const isRoot = node.depth === 0;
              const isPathActive = activeLinePathIds.has(node.id);

              // Pill visual style matching ChessAtlas (lilac / purple pills)
              let pillBg = 'bg-[#A855F7]/25 text-purple-100 border-[#C084FC]/40 hover:bg-[#A855F7]/40';
              if (isRoot) {
                pillBg = 'bg-[#8B5CF6]/40 text-white border-white/80 shadow-md';
              } else if (!node.isWhite) {
                pillBg = 'bg-[#9333EA]/25 text-purple-200 border-[#C084FC]/30 hover:bg-[#9333EA]/40';
              }

              // Status ring/accent
              let statusRing = '';
              if (node.status === 'learned') {
                statusRing = 'border-emerald-400 text-emerald-200';
              } else if (node.status === 'due') {
                statusRing = 'border-amber-400 text-amber-200';
              }

              return (
                <div
                  key={node.id}
                  className="group absolute"
                  style={{
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    width: `${node.width}px`,
                    height: `${node.height}px`,
                  }}
                >
                  {/* Root Node Header Badge */}
                  {isRoot && (
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-[#8B5CF6] px-2.5 py-0.5 text-[0.65rem] font-bold text-white shadow-md border border-white/20 whitespace-nowrap z-20">
                      <span>♛</span>
                      <span>{repertoire.name}</span>
                    </div>
                  )}

                  {/* Comment Bubble Icon on top of moves with notes */}
                  {!isRoot && node.annotation && (
                    <div
                      className="absolute -top-2 left-2 z-20 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#111827] border border-white/40 shadow-xs text-white"
                      title={node.annotation}
                    >
                      <MessageSquare className="h-2 w-2 text-amber-300 fill-amber-300/40" />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTreeId(node.id);
                      panToNode(node);
                    }}
                    className={`relative flex h-full w-full items-center justify-center gap-1.5 rounded-full border px-2.5 text-xs font-mono transition-all duration-150 cursor-pointer shadow-sm select-none ${pillBg} ${statusRing} ${
                      isSelected
                        ? '!border-white !bg-[#7C3AED] !text-white ring-2 ring-white/90 shadow-[0_0_20px_rgba(255,255,255,0.5)] scale-105 z-20 font-bold'
                        : isPathActive
                          ? 'border-purple-300/70'
                          : ''
                    }`}
                  >
                    {isRoot ? (
                      <Flag className="h-4 w-4 text-white fill-white" />
                    ) : (
                      <>
                        {formatSanWithPiece(node.formattedSan, node.isWhite)}
                        {/* Status dot */}
                        {node.status === 'learned' && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                        )}
                        {node.status === 'due' && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                        )}
                      </>
                    )}
                  </button>

                  {/* Variation Collapse / Expand Badge */}
                  {node.rawChildCount > 0 && (() => {
                    const badgeSize = 20;
                    // Exactly center vertically: for 32px height -> top is 6px, center is 6 + 10 = 16px.
                    // For 34px height (root) -> top is 7px, center is 7 + 10 = 17px.
                    const badgeTop = Math.round((node.height - badgeSize) / 2);
                    // Center in the horizontal gap between parent and child nodes
                    const badgeLeft = node.width + Math.round((X_STEP - node.width - badgeSize) / 2);

                    if (node.collapsed) {
                      // STATE 1: COLLAPSED -> show "+N" dashed circle badge
                      return (
                        <button
                          type="button"
                          onClick={(e) => toggleCollapse(node.id, e)}
                          style={{
                            top: `${badgeTop}px`,
                            left: `${badgeLeft}px`,
                            width: `${badgeSize}px`,
                            height: `${badgeSize}px`,
                          }}
                          className="absolute flex items-center justify-center rounded-full border border-dashed border-purple-400/80 bg-[#111827] text-[0.62rem] font-bold text-purple-300 hover:text-white hover:border-white hover:bg-purple-950/60 transition-all cursor-pointer z-10 shadow-xs leading-none p-0 shrink-0 select-none"
                          title={`Click to expand ${node.rawChildCount} variation${node.rawChildCount > 1 ? 's' : ''}`}
                        >
                          +{node.rawChildCount}
                        </button>
                      );
                    }

                    if (node.rawChildCount >= 2) {
                      // STATE 2: EXPANDED BRANCHING POINT (>= 2 variations) -> show "−" collapse handle
                      return (
                        <button
                          type="button"
                          onClick={(e) => toggleCollapse(node.id, e)}
                          style={{
                            top: `${badgeTop}px`,
                            left: `${badgeLeft}px`,
                            width: `${badgeSize}px`,
                            height: `${badgeSize}px`,
                          }}
                          className="absolute flex items-center justify-center rounded-full border border-dashed border-purple-400/50 bg-[#111827] text-[0.65rem] font-bold text-purple-400 hover:text-white hover:border-white hover:bg-purple-950/60 transition-all cursor-pointer z-10 shadow-xs leading-none p-0 shrink-0 select-none"
                          title={`Click to collapse ${node.rawChildCount} variations`}
                        >
                          −
                        </button>
                      );
                    }

                    // STATE 3: EXPANDED LINEAR (1 continuation) -> subtle hover "−" handle so linear lines remain clean
                    return (
                      <button
                        type="button"
                        onClick={(e) => toggleCollapse(node.id, e)}
                        style={{
                          top: `${badgeTop}px`,
                          left: `${badgeLeft}px`,
                          width: `${badgeSize}px`,
                          height: `${badgeSize}px`,
                        }}
                        className="absolute opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-full border border-dashed border-purple-400/40 bg-[#111827] text-[0.65rem] font-bold text-purple-400 hover:text-white hover:border-white hover:bg-purple-950/60 transition-all cursor-pointer z-10 shadow-xs leading-none p-0 shrink-0 select-none"
                        title="Click to collapse line"
                      >
                        −
                      </button>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RIGHT INSPECTOR PANEL (MATCHING THE SCREENSHOT) */}
      {/* ========================================================================= */}
      <aside className="w-[390px] shrink-0 border-l border-white/[0.08] bg-[#0F172A]/95 backdrop-blur-xl flex flex-col h-full overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#334155_transparent]">
        {/* Panel Header */}
        <div className="p-5 pb-3 border-b border-white/[0.06]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[0.65rem] font-bold tracking-wider uppercase text-gray-400">
              {displayOpeningTitle}
            </span>
            {activeNode.status === 'learned' ? (
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.6rem] font-semibold text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="h-2.5 w-2.5" /> Learned
              </span>
            ) : activeNode.status === 'due' ? (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.6rem] font-semibold text-amber-400 border border-amber-500/30">
                <Clock className="h-2.5 w-2.5" /> Due
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-gray-500/15 px-2 py-0.5 text-[0.6rem] font-semibold text-gray-400 border border-gray-500/20">
                <Circle className="h-2.5 w-2.5" /> New
              </span>
            )}
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-white font-mono">
            {activeNode.depth === 0 ? 'Starting Position' : activeNode.formattedSan}
          </h2>

          <p className="mt-1 text-xs text-gray-400 font-mono line-clamp-2">
            {activeNode.breadcrumb || '1. e4'}
          </p>
        </div>

        {/* Board Section */}
        <div className="p-5 pb-4">
          <div className="relative aspect-square w-full rounded-lg overflow-hidden border border-white/10 shadow-2xl bg-[#1E293B]">
            {/* Flip Board Button in top right of board */}
            <button
              type="button"
              onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
              className="absolute top-2 right-2 z-20 flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80 cursor-pointer shadow-md"
              title="Flip Board (F)"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
            </button>

            <ChessBoard
              fen={activeNode.fen}
              orientation={orientation}
              interactive={false}
              lastMove={lastMove}
              showCoordinates={true}
            />
          </div>
        </div>

        {/* PGN Annotation / Move Notes Card (Matching Screenshot 3) */}
        <div className="flex-1 px-5 pb-5 flex flex-col gap-3">
          {!activeNode.annotation && !isEditingNote ? (
            <div
              onClick={() => setIsEditingNote(true)}
              className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-center hover:border-white/20 transition-colors cursor-pointer group"
            >
              <p className="text-xs text-gray-500 italic group-hover:text-gray-400">
                No annotation on this position.
              </p>
              <span className="inline-block text-[0.65rem] text-amber-400/80 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                + Click to add note
              </span>
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-300">
                  <MessageSquare className="h-3.5 w-3.5 text-amber-400" />
                  <span className="uppercase tracking-wider text-[0.65rem] text-gray-400">
                    PGN Annotation
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingNote(!isEditingNote)}
                  className="flex items-center gap-1 rounded px-2 py-0.5 text-[0.65rem] text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <Edit3 className="h-3 w-3" />
                  {isEditingNote ? 'Cancel' : 'Edit'}
                </button>
              </div>

              {isEditingNote ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={editedNote}
                    onChange={(e) => setEditedNote(e.target.value)}
                    placeholder="Enter strategic concepts, key ideas, or tactics for this move..."
                    rows={4}
                    className="w-full rounded-lg border border-white/10 bg-black/30 p-2.5 text-xs text-gray-200 placeholder-gray-500 outline-none focus:border-amber-400/70 resize-none font-sans"
                  />
                  <button
                    type="button"
                    onClick={handleSaveNote}
                    className="self-end flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-gray-950 transition-colors hover:bg-amber-300 cursor-pointer"
                  >
                    <Save className="h-3 w-3" />
                    Save Note
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-300 leading-relaxed italic">
                  {activeNode.annotation}
                </p>
              )}
            </div>
          )}

          {/* Practice / Drill Button */}
          {onStartTrainingNode && activeNode.depth > 0 && (
            <button
              type="button"
              onClick={() => onStartTrainingNode(activeNode.nodeId)}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#10B981] to-[#059669] py-2.5 text-xs font-semibold text-white shadow-lg transition-transform active:scale-[0.98] cursor-pointer hover:brightness-105"
            >
              <GraduationCap className="h-4 w-4" />
              Practice From This Position
            </button>
          )}

          {/* Quick Line Variation Navigator */}
          {activeNode.children.length > 0 && (
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
              <span className="block text-[0.65rem] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Candidate Responses ({activeNode.children.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {activeNode.children.map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => {
                      setSelectedTreeId(child.id);
                      panToNode(child);
                    }}
                    className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                  >
                    {child.formattedSan}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
