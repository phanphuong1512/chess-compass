'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Chess } from 'chess.js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  GraduationCap,
  GitCompare,
  Globe,
  FileUp,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Database,
  Layers,
  Zap,
  List,
  GitBranch,
  Menu,
  X,
  Swords,
  Puzzle,
  BarChart2,
  Compass,
  Trophy,
  Award,
  Crown,
  Flame,
  Check,
  RotateCcw,
  Play,
  ArrowRight,
  Plus,
  LayoutGrid,
} from 'lucide-react';
import { TurnIndicatorBadge } from '@/components/icons/ChessPieceIcons';
import Link from 'next/link';
import Image from 'next/image';

import StudySidebar, { type StudyNavTab } from '@/components/study/StudySidebar';
import GamesDashboard from '@/components/study/GamesDashboard';
import StatisticsDashboard from '@/components/study/StatisticsDashboard';
import PuzzlesView from '@/components/study/PuzzlesView';
import LibraryView from '@/components/study/LibraryView';
import LeaderboardView from '@/components/study/LeaderboardView';
import AchievementsView from '@/components/study/AchievementsView';

import ChessBoard from '@/components/study/ChessBoard';
import EvalBar from '@/components/study/EvalBar';
import MoveList from '@/components/study/MoveList';
import RepertoireTree from '@/components/study/RepertoireTree';
import RepertoireLinesList from '@/components/study/RepertoireLinesList';
import TrainingSession from '@/components/study/TrainingSession';
import ExplorerPanel from '@/components/study/ExplorerPanel';
import DeviationDashboard from '@/components/study/DeviationDashboard';
import RepertoireGraph from '@/components/study/RepertoireGraph';
import RepertoireDashboard from '@/components/study/RepertoireDashboard';
import RepertoireDetail from '@/components/study/RepertoireDetail';
import NewRepertoireModal from '@/components/study/NewRepertoireModal';
import BuildFromGamesModal from '@/components/study/BuildFromGamesModal';

import { RepertoireDAG, STARTING_FEN, fenToNodeId } from '@/lib/chess/dag';
import { importPgnToRepertoireDAG } from '@/lib/chess/pgnParser';
import { extractRepertoireLines, type RepertoireLine } from '@/lib/chess/repertoireTree';
import { createCard, getDueCards } from '@/lib/fsrs/scheduler';
import { ensureDefaultRepertoire } from '@/lib/chess/seed';
import { evaluatePosition } from '@/lib/chess/eval';
import { db } from '@/lib/db/index';
import {
  fetchRepertoiresFromD1,
  createRepertoireInD1,
  deleteRepertoireFromD1,
  fetchGraphFromD1,
  recordMoveInD1,
  updateCardInD1,
  fetchDeviationsFromD1,
  markDeviationTrainedInD1,
} from '@/lib/db/client';

import type {
  StudyTab,
  Repertoire,
  RepertoireNode,
  RepertoireEdge,
  FSRSCard,
  DeviationReport,
  EngineScore,
  ChessColor,
} from '@/types/chess';

const logoSrc = 'https://assets.happybishops.com/hb-assets/logo.webp';

interface TreeNodeUI {
  nodeId: string;
  san: string;
  children: TreeNodeUI[];
  edge: RepertoireEdge;
  depth: number;
}

function buildTreeFromEdges(
  edges: RepertoireEdge[],
  rootNodeId: string,
  depth: number = 0,
  visited: Set<string> = new Set()
): TreeNodeUI[] {
  if (visited.has(rootNodeId) || depth > 30) return [];
  visited.add(rootNodeId);

  const childEdges = edges.filter((e) => e.fromNodeId === rootNodeId);
  return childEdges.map((edge) => ({
    nodeId: edge.toNodeId,
    san: edge.san,
    edge,
    depth,
    children: buildTreeFromEdges(edges, edge.toNodeId, depth + 1, new Set(visited)),
  }));
}

export default function StudyPage() {
  // Navigation & Screen Modes
  const [studyNavTab, setStudyNavTab] = useState<StudyNavTab>('repertoire');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [screenMode, setScreenMode] = useState<'dashboard' | 'repertoire'>('dashboard');
  const [viewMode, setViewMode] = useState<'board' | 'graph' | 'list'>('board');
  const [sideTab, setSideTab] = useState<'moves' | 'lines' | 'tree' | 'explorer'>('moves');
  const [trainingFilterNodeIds, setTrainingFilterNodeIds] = useState<string[] | null>(null);

  // Repertoires & Modals
  const [repertoires, setRepertoires] = useState<Repertoire[]>([]);
  const [activeRepertoireId, setActiveRepertoireId] = useState<string | null>(null);
  const [showNewRepertoireModal, setShowNewRepertoireModal] = useState(false);
  const [showBuildFromGamesModal, setShowBuildFromGamesModal] = useState(false);

  const activeRepertoire = useMemo(() => {
    return repertoires.find((r) => r.id === activeRepertoireId) || repertoires[0] || null;
  }, [repertoires, activeRepertoireId]);

  // Chess board state
  const [currentFen, setCurrentFen] = useState(STARTING_FEN);
  const [moveHistory, setMoveHistory] = useState<RepertoireEdge[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [engineScore, setEngineScore] = useState<EngineScore | null>({ type: 'cp', value: 20 });

  // Graph data & FSRS Cards
  const [allNodes, setAllNodes] = useState<RepertoireNode[]>([]);
  const [allEdges, setAllEdges] = useState<RepertoireEdge[]>([]);
  const [allCards, setAllCards] = useState<FSRSCard[]>([]);
  const [deviations, setDeviations] = useState<DeviationReport[]>([]);

  // Training state
  const [isTraining, setIsTraining] = useState(false);

  // DAG instance
  const dag = useMemo(() => new RepertoireDAG(allNodes, allEdges), [allNodes, allEdges]);

  // Tree data for sidebar
  const treeData = useMemo(() => {
    if (!activeRepertoireId) return [];
    const repEdges = allEdges.filter((e) => e.repertoireId === activeRepertoireId);
    const rootId = fenToNodeId(STARTING_FEN);
    return buildTreeFromEdges(repEdges, rootId);
  }, [allEdges, activeRepertoireId]);

  // Nodes map for training
  const nodesMap = useMemo(() => {
    const map = new Map<string, RepertoireNode>();
    for (const n of allNodes) map.set(n.id, n);
    return map;
  }, [allNodes]);

  const edgesMap = useMemo(() => {
    const map = new Map<string, RepertoireEdge[]>();
    for (const e of allEdges) {
      const existing = map.get(e.fromNodeId) ?? [];
      existing.push(e);
      map.set(e.fromNodeId, existing);
    }
    return map;
  }, [allEdges]);

  // Last move for board highlighting
  const lastMove = useMemo(() => {
    if (currentMoveIndex < 0 || currentMoveIndex >= moveHistory.length) return null;
    const edge = moveHistory[currentMoveIndex];
    return { from: edge.uci.slice(0, 2), to: edge.uci.slice(2, 4) };
  }, [currentMoveIndex, moveHistory]);

  const currentNodeId = fenToNodeId(currentFen);
  const selectedNode = dag.getNode(currentNodeId);

  // Dynamic suggested arrows for the position in the current repertoire
  const boardArrows = useMemo(() => {
    const currentNodeEdges = allEdges.filter(
      (e) => e.fromNodeId === currentNodeId && e.repertoireId === activeRepertoireId
    );
    if (currentNodeEdges.length > 0) {
      const topEdge = currentNodeEdges[0];
      return [
        {
          from: topEdge.uci.slice(0, 2),
          to: topEdge.uci.slice(2, 4),
          color: '#10B981',
        },
      ];
    }
    return [];
  }, [allEdges, currentNodeId, activeRepertoireId]);

  // Load repertoires and graph from Cloudflare D1 database (with IndexedDB fallback)
  const refreshDatabase = useCallback(async () => {
    try {
      // 1. Fetch real repertoires from Cloudflare D1
      let reps = await fetchRepertoiresFromD1();
      if (!reps || reps.length === 0) {
        const defaultRepId = await ensureDefaultRepertoire();
        reps = await fetchRepertoiresFromD1();
        setActiveRepertoireId((prev) => prev || defaultRepId);
      } else {
        setActiveRepertoireId((prev) => prev || reps[0].id);
      }
      setRepertoires(reps);

      // 2. Fetch full graph (nodes, edges, FSRS cards) from Cloudflare D1
      const graph = await fetchGraphFromD1();
      setAllNodes(graph.nodes);
      setAllEdges(graph.edges);
      setAllCards(graph.cards);

      // 3. Fetch real deviations from Cloudflare D1
      const devs = await fetchDeviationsFromD1();
      setDeviations(devs);
    } catch (err) {
      console.error('Database refresh error:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshDatabase();
  }, [refreshDatabase]);

  // Handle board move in editor mode
  const handleMove = useCallback(
    async (move: { from: string; to: string; san: string; promotion?: string }) => {
      const repId = activeRepertoireId || (repertoires[0]?.id ?? '');
      if (!repId) return;

      try {
        const chess = new Chess(currentFen);
        const result = chess.move({
          from: move.from as any,
          to: move.to as any,
          promotion: move.promotion,
        });
        if (!result) return;

        const newFen = chess.fen();

        // 1. Update DAG in memory
        const { node, edge, isTransposition } = dag.addMove(currentFen, result.san, repId);

        // 2. Persist node and edge to Dexie IndexedDB
        await db.nodes.put(node);
        if (!edge.id) {
          const { id: _unused, ...edgeToSave } = edge;
          const edgeId = await db.edges.put(edgeToSave);
          edge.id = edgeId as number;
        }

        // 3. Persist to Cloudflare D1 server database in background
        recordMoveInD1({
          fromFen: currentFen,
          toFen: newFen,
          san: result.san,
          uci: edge.uci,
          repertoireId: repId,
        });

        // 4. Create FSRS card if new node
        const targetNodeId = fenToNodeId(newFen);
        const existingCard = allCards.find((c) => c.nodeId === targetNodeId);
        if (!existingCard) {
          const newCard = createCard(targetNodeId);
          await db.cards.put(newCard);
          updateCardInD1(newCard);
          setAllCards((prev) => [...prev, newCard]);
        }

        // 5. Update UI state
        setCurrentFen(newFen);
        setAllNodes((prev) => (isTransposition ? prev : [...prev, node]));
        setAllEdges((prev) => {
          const exists = prev.some((e) => e.fromNodeId === edge.fromNodeId && e.san === edge.san);
          return exists ? prev : [...prev, edge];
        });

        const newHistory = [...moveHistory.slice(0, currentMoveIndex + 1), edge];
        setMoveHistory(newHistory);
        setCurrentMoveIndex(newHistory.length - 1);

        // 6. Fast Stockfish engine evaluation
        try {
          const evalRes = evaluatePosition(newFen);
          if (evalRes?.multiPv?.[0]?.score) {
            setEngineScore(evalRes.multiPv[0].score);
          }
        } catch {
          // ignore eval error
        }
      } catch (err) {
        console.error('Invalid move in editor:', err);
      }
    },
    [currentFen, activeRepertoireId, repertoires, dag, moveHistory, currentMoveIndex, allCards]
  );

  // Move history navigation
  const navigateToMove = useCallback(
    (index: number) => {
      if (index < 0) {
        setCurrentFen(STARTING_FEN);
        setCurrentMoveIndex(-1);
        return;
      }
      if (index >= moveHistory.length) return;

      const chess = new Chess();
      for (let i = 0; i <= index; i++) {
        try {
          chess.move(moveHistory[i].san);
        } catch {
          break;
        }
      }
      setCurrentFen(chess.fen());
      setCurrentMoveIndex(index);
    },
    [moveHistory]
  );

  const navigateFirst = useCallback(() => navigateToMove(-1), [navigateToMove]);
  const navigatePrev = useCallback(
    () => navigateToMove(currentMoveIndex - 1),
    [navigateToMove, currentMoveIndex]
  );
  const navigateNext = useCallback(
    () => navigateToMove(currentMoveIndex + 1),
    [navigateToMove, currentMoveIndex]
  );
  const navigateLast = useCallback(
    () => navigateToMove(moveHistory.length - 1),
    [navigateToMove, moveHistory.length]
  );

  // Select node from sidebar tree
  const handleSelectNode = useCallback(
    (nodeId: string) => {
      const node = dag.getNode(nodeId);
      if (!node) return;

      setCurrentFen(node.fen);

      // Reconstruct line from root to this node
      const rootId = fenToNodeId(STARTING_FEN);
      const repEdges = allEdges.filter((e) => e.repertoireId === activeRepertoireId);

      const findPath = (current: string, path: RepertoireEdge[]): RepertoireEdge[] | null => {
        if (current === nodeId) return path;
        const outgoing = repEdges.filter((e) => e.fromNodeId === current);
        for (const edge of outgoing) {
          const res = findPath(edge.toNodeId, [...path, edge]);
          if (res) return res;
        }
        return null;
      };

      const path = findPath(rootId, []);
      if (path) {
        setMoveHistory(path);
        setCurrentMoveIndex(path.length - 1);
      }
    },
    [dag, allEdges, activeRepertoireId]
  );

  // Extract all discrete lines for the active repertoire (ChessAtlas style)
  const repertoireLines = useMemo(() => {
    if (!activeRepertoireId) return [];
    return extractRepertoireLines(dag, activeRepertoireId);
  }, [dag, activeRepertoireId]);

  const handleSelectLine = useCallback(
    (line: RepertoireLine) => {
      const edges: RepertoireEdge[] = [];
      for (const m of line.moves) {
        const edge = allEdges.find(
          (e) => e.san === m.san && e.fromNodeId === fenToNodeId(m.fromFen)
        );
        if (edge) {
          edges.push(edge);
        } else {
          edges.push({
            fromNodeId: fenToNodeId(m.fromFen),
            toNodeId: fenToNodeId(m.toFen),
            san: m.san,
            uci: m.uci,
            repertoireId: activeRepertoireId || '',
            sortOrder: 0,
          });
        }
      }
      setMoveHistory(edges);
      setCurrentMoveIndex(edges.length - 1);
      if (line.moves.length > 0) {
        setCurrentFen(line.moves[line.moves.length - 1].toFen);
      }
    },
    [allEdges, activeRepertoireId]
  );

  const handleTrainLine = useCallback((line: RepertoireLine) => {
    setTrainingFilterNodeIds(line.nodeIds);
    setIsTraining(true);
  }, []);

  // Create repertoire handler with full PGN import support
  const handleCreateNewRepertoire = useCallback(
    async (repData: {
      name: string;
      color: ChessColor;
      firstMove?: string;
      coverStyle?: string;
      pgnText?: string;
    }) => {
      try {
        const newRep: Repertoire = {
          id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: repData.name,
          color: repData.color,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          description: `Custom ${repData.color} repertoire`,
        };
        await createRepertoireInD1(newRep);

        // If PGN text is provided, parse and import all moves into the repertoire!
        if (repData.pgnText && repData.pgnText.trim()) {
          const { nodes, edges } = await importPgnToRepertoireDAG(repData.pgnText, newRep.id, dag);

          // Persist all nodes to Dexie
          for (const n of nodes) {
            await db.nodes.put(n);
          }

          // Persist all edges and create FSRS cards
          const movesToSave: Array<{
            fromFen: string;
            toFen: string;
            san: string;
            uci: string;
            sortOrder: number;
          }> = [];

          for (let idx = 0; idx < edges.length; idx++) {
            const e = edges[idx];
            await db.edges.put(e);
            await db.cards.put(createCard(e.toNodeId));

            const nodeBefore = dag.getNode(e.fromNodeId);
            const nodeAfter = dag.getNode(e.toNodeId);
            if (nodeBefore && nodeAfter) {
              movesToSave.push({
                fromFen: nodeBefore.fen,
                toFen: nodeAfter.fen,
                san: e.san,
                uci: e.uci,
                sortOrder: idx,
              });
            }
          }

          if (movesToSave.length > 0) {
            try {
              await fetch('/api/study/moves', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  moves: movesToSave,
                  repertoireId: newRep.id,
                }),
              });
            } catch (err) {
              console.warn('Background sync to D1 moves:', err);
            }
          }
        } else if (repData.firstMove) {
          const chess = new Chess();
          const moveRes = chess.move(repData.firstMove);
          if (moveRes) {
            await recordMoveInD1({
              fromFen: STARTING_FEN,
              toFen: chess.fen(),
              san: repData.firstMove,
              uci: moveRes.from + moveRes.to,
              repertoireId: newRep.id,
            });
          }
        }

        await refreshDatabase();
        setActiveRepertoireId(newRep.id);
        setOrientation(repData.color);
        setStudyNavTab('repertoire');
        setScreenMode('repertoire');
        setViewMode('board');
      } catch (err) {
        console.error('Failed to create repertoire:', err);
      }
    },
    [refreshDatabase]
  );

  // Add course from library
  const handleAddLibraryCourse = useCallback(
    async (course: any) => {
      try {
        const newRep: Repertoire = {
          id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: course.title,
          color: course.color,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          description: course.description,
        };
        await createRepertoireInD1(newRep);

        const currentChess = new Chess();
        for (const m of course.firstMoves) {
          const fromFen = currentChess.fen();
          const moveRes = currentChess.move(m.san);
          if (moveRes) {
            const toFen = currentChess.fen();
            await recordMoveInD1({
              fromFen,
              toFen,
              san: m.san,
              uci: moveRes.from + moveRes.to,
              repertoireId: newRep.id,
            });
          }
        }

        await refreshDatabase();
        setActiveRepertoireId(newRep.id);
        setOrientation(course.color);
        setStudyNavTab('repertoire');
        setScreenMode('repertoire');
        setViewMode('board');
      } catch (err) {
        console.error('Add library course error:', err);
      }
    },
    [refreshDatabase]
  );

  // Chapter selection from RepertoireDetail
  const handleSelectChapter = useCallback(
    (chapter: any) => {
      const moves: string[] = Array.isArray(chapter)
        ? chapter
        : chapter?.moves || chapter?.initialMoves || [];

      if (moves.length > 0) {
        const chess = new Chess();
        const edges: RepertoireEdge[] = [];
        for (let i = 0; i < moves.length; i++) {
          const san = moves[i];
          try {
            const fromFen = chess.fen();
            const moveRes = chess.move(san);
            if (moveRes) {
              edges.push({
                fromNodeId: fenToNodeId(fromFen),
                toNodeId: fenToNodeId(chess.fen()),
                san,
                uci: moveRes.from + moveRes.to,
                repertoireId: activeRepertoireId || '',
                sortOrder: i,
              });
            }
          } catch {
            break;
          }
        }
        setCurrentFen(chess.fen());
        setMoveHistory(edges);
        setCurrentMoveIndex(edges.length - 1);
        setViewMode('board');
      }
    },
    [activeRepertoireId]
  );

  // Training handlers
  const handleStartTrainingWithMode = useCallback(
    (mode: 'review' | 'learn' | 'overstudy', filterNodeIds?: string[]) => {
      setTrainingFilterNodeIds(filterNodeIds && filterNodeIds.length > 0 ? filterNodeIds : null);
      setIsTraining(true);
    },
    []
  );

  // Training cards filtered by active repertoire and selected chapter
  const trainingCards = useMemo(() => {
    let cards = allCards;
    if (activeRepertoireId) {
      const repEdges = allEdges.filter((e) => e.repertoireId === activeRepertoireId);
      const repNodeIds = new Set(repEdges.map((e) => e.toNodeId));
      repNodeIds.add(fenToNodeId(STARTING_FEN));
      cards = cards.filter((c) => repNodeIds.has(c.nodeId));
    }
    if (trainingFilterNodeIds && trainingFilterNodeIds.length > 0) {
      const filterSet = new Set(trainingFilterNodeIds);
      cards = cards.filter((c) => filterSet.has(c.nodeId));
    }
    return cards.length > 0 ? cards : allCards;
  }, [allCards, activeRepertoireId, allEdges, trainingFilterNodeIds]);

  const handleUpdateCard = useCallback(async (card: FSRSCard) => {
    await updateCardInD1(card);
    setAllCards((prev) => prev.map((c) => (c.id === card.id ? card : c)));
  }, []);

  // Explorer move selection
  const handleExplorerMove = useCallback(
    (san: string) => {
      handleMove({ from: '', to: '', san });
    },
    [handleMove]
  );

  // Add deviation to training
  const handleAddDeviationToTraining = useCallback(async (nodeIdOrDev: any) => {
    const targetNodeId = typeof nodeIdOrDev === 'string' ? nodeIdOrDev : fenToNodeId(nodeIdOrDev.positionFen);
    const card = createCard(targetNodeId);
    card.dueDate = Date.now();
    await updateCardInD1(card);
    setAllCards((prev) => [...prev, card]);

    if (typeof nodeIdOrDev !== 'string' && nodeIdOrDev.id) {
      await markDeviationTrainedInD1(nodeIdOrDev.id);
      setDeviations((prev) =>
        prev.map((d) => (d.id === nodeIdOrDev.id ? { ...d, addedToTraining: true } : d))
      );
    }
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') navigatePrev();
      else if (e.key === 'ArrowRight') navigateNext();
      else if (e.key === 'Home') navigateFirst();
      else if (e.key === 'End') navigateLast();
      else if (e.key === 'f') setOrientation((o) => (o === 'white' ? 'black' : 'white'));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigatePrev, navigateNext, navigateFirst, navigateLast]);

  return (
    <div className="flex h-[100dvh] w-full bg-[#0B0F17] text-white overflow-hidden select-none">
      {/* 1. Desktop Persistent Left Sidebar */}
      <StudySidebar
        activeTab={studyNavTab}
        onSelectTab={(tab) => {
          setStudyNavTab(tab);
          setIsTraining(false);
          if (tab === 'repertoire' && !activeRepertoireId) {
            setScreenMode('dashboard');
          }
        }}
        learnedVariationsCount={allCards.filter((c) => c.reps > 0).length}
        totalVariationsCap={Math.max(allCards.length, 50)}
        className="hidden md:flex"
      />

      {/* 2. Mobile Drawer Navigation */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative z-10 w-[260px] h-full border-r border-white/10"
            >
              <StudySidebar
                activeTab={studyNavTab}
                onSelectTab={(tab) => {
                  setStudyNavTab(tab);
                  setIsTraining(false);
                  setMobileSidebarOpen(false);
                  if (tab === 'repertoire' && !activeRepertoireId) {
                    setScreenMode('dashboard');
                  }
                }}
                onCloseMobile={() => setMobileSidebarOpen(false)}
                learnedVariationsCount={allCards.filter((c) => c.reps > 0).length}
                totalVariationsCap={Math.max(allCards.length, 50)}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 3. Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header Bar */}
        <header className="shrink-0 h-14 border-b border-white/[0.08] bg-[#0B0F17] px-4 flex items-center justify-between z-20">
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger toggle */}
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-gray-300 hover:text-white transition-colors"
              aria-label="Open Navigation"
            >
              <Menu className="h-4 w-4" />
            </button>

            {/* Back Button if inside repertoire */}
            {studyNavTab === 'repertoire' && screenMode === 'repertoire' ? (
              <button
                type="button"
                onClick={() => setScreenMode('dashboard')}
                className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-white transition-colors cursor-pointer group"
                title="Back to My Repertoire"
              >
                <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
                <span>Back</span>
              </button>
            ) : (
              <Link
                href="/"
                className="flex items-center gap-2 text-gray-400 transition-colors hover:text-white group md:hidden"
                title="Return to Home"
              >
                <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
                <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-md">
                  <Image src={logoSrc} alt="Happy Bishops" fill sizes="28px" className="object-contain" />
                </div>
              </Link>
            )}

            <div className="hidden sm:block h-5 w-px bg-white/10" />

            {/* Title / Breadcrumb */}
            {studyNavTab === 'repertoire' && screenMode === 'repertoire' ? (
              <div className="flex items-center gap-2 truncate">
                <span className="text-sm font-bold text-white tracking-wide truncate max-w-[200px] sm:max-w-md">
                  {activeRepertoire?.name || 'Repertoire'}
                </span>
                <span className="rounded-full bg-white/10 px-2 py-0.2 text-[0.65rem] font-bold text-gray-300">
                  {activeRepertoire?.color === 'white' ? 'White' : 'Black'}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-white tracking-wide">
                  {studyNavTab === 'repertoire'
                    ? 'My Repertoire'
                    : studyNavTab === 'games'
                    ? 'Your games'
                    : studyNavTab === 'statistics'
                    ? 'Statistics'
                    : studyNavTab === 'explorer'
                    ? 'Opening Explorer'
                    : studyNavTab === 'puzzles'
                    ? 'Tactical Puzzles'
                    : studyNavTab === 'library'
                    ? 'Opening Library'
                    : studyNavTab === 'leaderboard'
                    ? 'Diamond League'
                    : 'Achievements'}
                </span>
              </div>
            )}
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2.5">
            {isTraining ? (
              <button
                type="button"
                onClick={() => setIsTraining(false)}
                className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:text-white transition-colors"
              >
                <span>Exit Training</span>
              </button>
            ) : studyNavTab === 'repertoire' && screenMode === 'repertoire' ? (
              <div className="flex items-center gap-2">
                {/* 3-way View switcher: Board, Graph, Overview */}
                <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/5 p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode('board')}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                      viewMode === 'board'
                        ? 'bg-amber-400 text-stone-950 font-bold shadow-xs'
                        : 'text-gray-400 hover:text-white'
                    }`}
                    title="Interactive Board & Moves"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Board</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('graph')}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                      viewMode === 'graph'
                        ? 'bg-amber-400 text-stone-950 font-bold shadow-xs'
                        : 'text-gray-400 hover:text-white'
                    }`}
                    title="Interactive Diagram Graph View"
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Graph</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                      viewMode === 'list'
                        ? 'bg-amber-400 text-stone-950 font-bold shadow-xs'
                        : 'text-gray-400 hover:text-white'
                    }`}
                    title="Chapters Overview"
                  >
                    <List className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Overview</span>
                  </button>
                </div>

                {/* Flip Board */}
                <button
                  type="button"
                  onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-gray-400 hover:text-white transition-colors cursor-pointer"
                  title="Flip board (F)"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>
            ) : studyNavTab === 'repertoire' && screenMode === 'dashboard' ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowBuildFromGamesModal(true)}
                  className="hidden sm:flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                >
                  <span>Build from games</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewRepertoireModal(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-400/15 border border-amber-400/30 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-400/25 transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>New Repertoire</span>
                </button>
              </div>
            ) : null}
          </div>
        </header>

        {/* Scrollable View Area */}
        <div className="flex-1 overflow-y-auto">
          {/* Active Training Session */}
          {isTraining ? (
            <main className="mx-auto max-w-lg px-4 py-6">
              <TrainingSession
                cards={trainingCards}
                nodes={nodesMap}
                edges={edgesMap}
                onUpdateCard={handleUpdateCard}
                onComplete={() => setIsTraining(false)}
                orientation={activeRepertoire?.color || orientation}
                repertoireName={activeRepertoire?.name}
              />
            </main>
          ) : studyNavTab === 'repertoire' ? (
            screenMode === 'dashboard' ? (
              <RepertoireDashboard
                repertoires={repertoires}
                allCards={allCards}
                allEdges={allEdges}
                onSelectRepertoire={(id) => {
                  setActiveRepertoireId(id);
                  const selectedRep = repertoires.find((r) => r.id === id);
                  if (selectedRep) setOrientation(selectedRep.color);
                  setScreenMode('repertoire');
                  setViewMode('board');
                }}
                onOpenCreateModal={() => setShowNewRepertoireModal(true)}
                onOpenBuildFromGames={() => setShowBuildFromGamesModal(true)}
                onStartReview={() => {
                  setTrainingFilterNodeIds(null);
                  setIsTraining(true);
                }}
                onDrillMistakes={() => {
                  setTrainingFilterNodeIds(null);
                  setIsTraining(true);
                }}
              />
            ) : viewMode === 'board' && activeRepertoire ? (
              <div className="h-full flex flex-col lg:flex-row overflow-hidden bg-[#0B0F17]">
                {/* Left/Center: Interactive ChessBoard + EvalBar + Navigation */}
                <div className="flex-1 flex flex-col items-center justify-center p-3 sm:p-5 overflow-y-auto">
                  <div className="w-full max-w-[500px] flex flex-col gap-2.5">
                    {/* Top board status: Turn, Eval, Engine Pill */}
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <TurnIndicatorBadge
                          turn={(() => {
                            try {
                              return new Chess(currentFen).turn() === 'w' ? 'white' : 'black';
                            } catch {
                              return 'white';
                            }
                          })()}
                          label={(() => {
                            try {
                              return new Chess(currentFen).turn() === 'w' ? 'White to move' : 'Black to move';
                            } catch {
                              return 'White to move';
                            }
                          })()}
                        />
                        <span className="text-[0.68rem] font-bold text-gray-400 capitalize">
                          {activeRepertoire.color} Repertoire
                        </span>
                      </div>
                      {engineScore && (
                        <div className="flex items-center gap-1.5 rounded-md bg-white/5 border border-white/10 px-2 py-0.5 text-xs font-mono font-bold text-gray-300">
                          <span>Eval:</span>
                          <span className={engineScore.value >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {engineScore.type === 'mate'
                              ? `M${engineScore.value}`
                              : `${engineScore.value >= 0 ? '+' : ''}${(engineScore.value / 100).toFixed(2)}`}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* ChessBoard + Vertical EvalBar */}
                    <div className="flex items-stretch gap-2.5">
                      <div className="w-6 shrink-0 rounded-lg overflow-hidden bg-white/5 border border-white/10">
                        <EvalBar score={engineScore} />
                      </div>
                      <div className="flex-1 aspect-square rounded-xl overflow-hidden border border-white/10 shadow-2xl bg-[#141B29]">
                        <ChessBoard
                          fen={currentFen}
                          orientation={orientation}
                          onMove={handleMove}
                          interactive={true}
                          lastMove={lastMove}
                          arrows={boardArrows}
                          showCoordinates={true}
                        />
                      </div>
                    </div>

                    {/* Bottom Controls: Navigation Stepper & Action Buttons */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={navigateFirst}
                          className="rounded-lg bg-white/5 p-2 text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          title="First Move (Home)"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={navigatePrev}
                          className="rounded-lg bg-white/5 p-2 text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          title="Previous Move (Left)"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={navigateNext}
                          className="rounded-lg bg-white/5 p-2 text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          title="Next Move (Right)"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={navigateLast}
                          className="rounded-lg bg-white/5 p-2 text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          title="Last Move (End)"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentFen(STARTING_FEN);
                            setMoveHistory([]);
                            setCurrentMoveIndex(-1);
                          }}
                          className="flex items-center gap-1 rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          title="Reset Board"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Reset</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setTrainingFilterNodeIds(null);
                            setIsTraining(true);
                          }}
                          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 px-3.5 py-1.5 text-xs font-bold text-stone-950 transition-all hover:brightness-110 active:scale-[0.98] cursor-pointer shadow-md"
                        >
                          <GraduationCap className="h-3.5 w-3.5 stroke-[2.5]" />
                          <span>Train This</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Scoresheet Tabs (Moves, Tree, Explorer) */}
                <div className="w-full lg:w-[400px] shrink-0 border-t lg:border-t-0 lg:border-l border-white/[0.08] bg-[#121724] flex flex-col h-[380px] lg:h-full">
                  <div className="flex items-center border-b border-white/[0.08] bg-[#0E131E] px-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSideTab('moves')}
                      className={`px-3 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                        sideTab === 'moves'
                          ? 'border-amber-400 text-amber-300'
                          : 'border-transparent text-gray-400 hover:text-white'
                      }`}
                    >
                      Moves ({moveHistory.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSideTab('lines')}
                      className={`px-3 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                        sideTab === 'lines'
                          ? 'border-amber-400 text-amber-300'
                          : 'border-transparent text-gray-400 hover:text-white'
                      }`}
                    >
                      Lines ({repertoireLines.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSideTab('tree')}
                      className={`px-3 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                        sideTab === 'tree'
                          ? 'border-amber-400 text-amber-300'
                          : 'border-transparent text-gray-400 hover:text-white'
                      }`}
                    >
                      Tree
                    </button>
                    <button
                      type="button"
                      onClick={() => setSideTab('explorer')}
                      className={`px-3 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                        sideTab === 'explorer'
                          ? 'border-amber-400 text-amber-300'
                          : 'border-transparent text-gray-400 hover:text-white'
                      }`}
                    >
                      Explorer
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3">
                    {sideTab === 'moves' ? (
                      <MoveList
                        moves={moveHistory}
                        currentMoveIndex={currentMoveIndex}
                        onSelectMove={navigateToMove}
                      />
                    ) : sideTab === 'lines' ? (
                      <RepertoireLinesList
                        lines={repertoireLines}
                        onSelectLine={handleSelectLine}
                        onTrainLine={handleTrainLine}
                        currentFen={currentFen}
                      />
                    ) : sideTab === 'tree' ? (
                      <RepertoireTree
                        repertoires={repertoires}
                        activeRepertoireId={activeRepertoireId}
                        treeData={treeData}
                        onSelectRepertoire={(id) => {
                          setActiveRepertoireId(id);
                          const sel = repertoires.find((r) => r.id === id);
                          if (sel) setOrientation(sel.color);
                        }}
                        onSelectNode={handleSelectNode}
                        onCreateRepertoire={() => setShowNewRepertoireModal(true)}
                        onDeleteRepertoire={async (id) => {
                          await deleteRepertoireFromD1(id);
                          await refreshDatabase();
                        }}
                        selectedNodeId={currentNodeId}
                      />
                    ) : (
                      <ExplorerPanel fen={currentFen} onSelectMove={handleExplorerMove} />
                    )}
                  </div>
                </div>
              </div>
            ) : viewMode === 'graph' && activeRepertoire ? (
              <div className="w-full h-full overflow-hidden">
                <RepertoireGraph
                  repertoire={activeRepertoire}
                  allNodes={allNodes}
                  allEdges={allEdges}
                  allCards={allCards}
                  onBack={() => setScreenMode('dashboard')}
                  onStartTrainingNode={() => {
                    setTrainingFilterNodeIds(null);
                    setIsTraining(true);
                  }}
                  onUpdateNode={(updatedNode) => {
                    setAllNodes((prev) => prev.map((n) => (n.id === updatedNode.id ? updatedNode : n)));
                  }}
                />
              </div>
            ) : activeRepertoire ? (
              <RepertoireDetail
                repertoire={activeRepertoire}
                allNodes={allNodes}
                allEdges={allEdges}
                allCards={allCards}
                onStartTraining={handleStartTrainingWithMode}
                onOpenGraph={() => setViewMode('graph')}
                onSelectChapter={handleSelectChapter}
                onEditRepertoire={() => setShowNewRepertoireModal(true)}
              />
            ) : null
          ) : studyNavTab === 'games' ? (
            <GamesDashboard
              repertoires={repertoires}
              allEdges={allEdges}
              allNodes={allNodes}
              onAddToTraining={handleAddDeviationToTraining}
            />
          ) : studyNavTab === 'statistics' ? (
            <StatisticsDashboard
              repertoires={repertoires}
              allEdges={allEdges}
              allNodes={allNodes}
              onOpenRepertoire={(id) => {
                setActiveRepertoireId(id);
                setStudyNavTab('repertoire');
                setScreenMode('repertoire');
              }}
            />
          ) : studyNavTab === 'explorer' ? (
            <div className="max-w-4xl mx-auto p-6">
              <div className="rounded-2xl border border-white/10 bg-[#141B29] p-5 shadow-xl">
                <ExplorerPanel fen={currentFen} onSelectMove={handleExplorerMove} />
              </div>
            </div>
          ) : studyNavTab === 'puzzles' ? (
            <PuzzlesView />
          ) : studyNavTab === 'library' ? (
            <LibraryView onAddCourseToRepertoire={handleAddLibraryCourse} />
          ) : studyNavTab === 'leaderboard' ? (
            <LeaderboardView />
          ) : studyNavTab === 'achievements' ? (
            <AchievementsView />
          ) : null}
        </div>
      </div>

      {/* New Repertoire Modal */}
      <NewRepertoireModal
        isOpen={showNewRepertoireModal}
        onClose={() => setShowNewRepertoireModal(false)}
        onCreate={handleCreateNewRepertoire}
        onOpenGameSync={() => {
          setShowNewRepertoireModal(false);
          setShowBuildFromGamesModal(true);
        }}
      />

      {/* Build Repertoire From Games Modal */}
      <BuildFromGamesModal
        isOpen={showBuildFromGamesModal}
        onClose={() => setShowBuildFromGamesModal(false)}
        onRepertoireCreated={async (newRepId) => {
          await refreshDatabase();
          setActiveRepertoireId(newRepId);
          setStudyNavTab('repertoire');
          setScreenMode('repertoire');
        }}
        existingRepertoires={repertoires}
      />
    </div>
  );
}
