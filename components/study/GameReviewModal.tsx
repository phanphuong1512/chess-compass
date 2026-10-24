'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Lightbulb,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  Plus,
  BarChart3,
  List,
  Eye,
  Loader2,
  Cpu,
  ArrowRight,
  RefreshCw,
  Trophy,
  Target,
  Smile,
  Frown,
  Meh,
} from 'lucide-react';
import type { ImportedGame, Repertoire } from '@/types/chess';
import type { RepertoireDAG } from '@/lib/chess/dag';
import { fenToNodeId, STARTING_FEN } from '@/lib/chess/dag';
import {
  analyzeFullGameAsync,
  type GameReviewResult,
  type MoveReviewItem,
  type MoveClassification,
  CLASSIFICATION_META,
  gameReviewMemoryCache,
  invalidateGameReview,
  getGameReviewKey,
} from '@/lib/chess/gameReview';
import ChessBoard, { type ClassificationBadge } from './ChessBoard';
import MaterialDifferenceBar from './MaterialDifferenceBar';
import { calculateMaterial } from '@/lib/chess/material';
import { playMoveSound, playCaptureSound, playCheckSound, playErrorSound } from '@/lib/chess/audio';
import { ClassificationIcon } from '@/components/icons/MoveClassificationIcons';
import { GraduationCap } from '@phosphor-icons/react';

interface GameReviewModalProps {
  game: ImportedGame;
  userColor?: 'white' | 'black';
  dag?: RepertoireDAG;
  activeRepertoire?: Repertoire | null;
  onClose: () => void;
  onAddToTraining?: (nodeId: string) => void;
}

export type ReviewViewMode = 'report' | 'detail' | 'retry';

interface RetryMistakeItem {
  ply: number;
  moveNumber: number;
  fenBefore: string;
  playedSan: string;
  playedUci: string;
  bestSan: string;
  bestUci: string;
  classification: MoveClassification;
  turn: 'white' | 'black';
}

// Circular SVG Accuracy Ring
const RING_RADIUS = 34;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS; // ~213.628

function AccuracyRing({
  accuracy,
  shown,
  className,
}: {
  accuracy?: number | null;
  shown?: string;
  className?: string;
}) {
  const pct = accuracy != null ? Math.min(100, Math.max(0, accuracy)) : null;
  const strokeDashoffset = pct != null ? RING_CIRCUMFERENCE - (RING_CIRCUMFERENCE * pct) / 100 : RING_CIRCUMFERENCE;

  return (
    <svg viewBox="0 0 84 84" className={className || 'size-20 sm:size-24'} role="img">
      <circle
        cx="42"
        cy="42"
        r={RING_RADIUS}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.15}
        strokeWidth="8"
      />
      {pct != null && (
        <circle
          cx="42"
          cy="42"
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={strokeDashoffset}
          transform="rotate(-90 42 42)"
          className="text-emerald-500 transition-all duration-700 ease-out"
        />
      )}
      <text
        x="42"
        y="47"
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-white font-mono text-[15px] font-extrabold"
      >
        {shown ?? (pct != null ? `${pct.toFixed(1)}%` : '-')}
      </text>
    </svg>
  );
}

// Interactive Monotone Evaluation Area Chart
function EvaluationAreaChart({
  moves,
  currentPly,
  onSelectPly,
  height = 72,
}: {
  moves: MoveReviewItem[];
  currentPly: number;
  onSelectPly: (ply: number) => void;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{ ply: number; evalCp: number; x: number; y: number } | null>(null);

  const totalPlies = moves.length;
  if (totalPlies === 0) return null;

  const width = 800; // SVG internal coordinate width
  const padX = 12;
  const padY = 8;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const midY = padY + innerH / 2;

  // Compute (x, y) coordinates for all plies
  const points = moves.map((m, idx) => {
    const ply = idx + 1;
    const x = padX + (idx / Math.max(1, totalPlies - 1)) * innerW;
    // Clamp centipawns between -800 and +800
    const cp = Math.max(-800, Math.min(800, m.evalAfterCp || 0));
    // White advantage is up (negative delta from midY), Black advantage is down (positive delta)
    const norm = cp / 800;
    const y = midY - norm * (innerH / 2);
    const isError =
      m.classification === 'blunder' ||
      m.classification === 'mistake' ||
      m.classification === 'miss' ||
      m.classification === 'inaccuracy';
    const markerColor =
      m.classification === 'blunder'
        ? '#E11D48'
        : m.classification === 'mistake'
        ? '#F97316'
        : m.classification === 'miss'
        ? '#EF4444'
        : m.classification === 'inaccuracy'
        ? '#EAB308'
        : null;

    return { ply, x, y, cp, isError, markerColor, classification: m.classification };
  });

  // Construct SVG Area and Line paths
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${midY} L ${points[0].x.toFixed(1)} ${midY} Z`;

  // Active cursor x
  const activePoint = currentPly > 0 && currentPly <= totalPlies ? points[currentPly - 1] : null;

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickRatio = (e.clientX - rect.left) / rect.width;
    const targetPly = Math.min(totalPlies, Math.max(1, Math.round(clickRatio * totalPlies)));
    onSelectPly(targetPly);
  };

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden select-none cursor-pointer">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full h-full block"
        style={{ height: `${height}px` }}
        onClick={handleSvgClick}
      >
        {/* Baseline dashed 0-line */}
        <line
          x1={padX}
          y1={midY}
          x2={width - padX}
          y2={midY}
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />

        {/* Evaluation Area fill */}
        <path d={areaPath} fill="rgba(16, 185, 129, 0.22)" />

        {/* Evaluation curve stroke */}
        <path d={linePath} fill="none" stroke="#10B981" strokeWidth="2" strokeLinejoin="round" />

        {/* Marker dots for errors / key moments */}
        {points.map((p) => {
          if (!p.isError || !p.markerColor) return null;
          return (
            <circle
              key={p.ply}
              cx={p.x}
              cy={p.y}
              r={p.classification === 'blunder' ? 4 : 3.5}
              fill={p.markerColor}
              stroke="#0E131E"
              strokeWidth="1.5"
            />
          );
        })}

        {/* Active cursor line */}
        {activePoint && (
          <line
            x1={activePoint.x}
            y1={padY}
            x2={activePoint.x}
            y2={height - padY}
            stroke="#F59E0B"
            strokeWidth="2.5"
          />
        )}
      </svg>
    </div>
  );
}

export default function GameReviewModal({
  game,
  userColor = 'white',
  dag,
  activeRepertoire,
  onClose,
  onAddToTraining,
}: GameReviewModalProps) {
  // 3 distinct view modes: 'report' (overview), 'detail' (move analysis), 'retry' (solve mistakes)
  const [viewMode, setViewMode] = useState<ReviewViewMode>('report');
  const [currentPly, setCurrentPly] = useState(0);
  const [showBestMove, setShowBestMove] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>(userColor);

  // Retry Mistakes Mode State
  const [retryIndex, setRetryIndex] = useState(0);
  const [retryStatus, setRetryStatus] = useState<'asking' | 'solved' | 'played' | 'wrong' | 'revealed'>('asking');
  const [retryResults, setRetryResults] = useState<Record<number, boolean>>({});

  // Check in-memory cache synchronously for instant zero-wait opening
  const cacheKey = getGameReviewKey(game);
  const initialCached = gameReviewMemoryCache.get(cacheKey) || null;

  // Real Engine Analysis State
  const [reviewResult, setReviewResult] = useState<GameReviewResult | null>(initialCached);
  const [isLoading, setIsLoading] = useState(!initialCached);
  const [progressPercent, setProgressPercent] = useState(initialCached ? 100 : 0);
  const [progressText, setProgressText] = useState(
    initialCached ? 'Analysis ready' : 'Initializing Stockfish 16 engine...'
  );

  const moveListRef = useRef<HTMLDivElement>(null);
  const activeMoveButtonRef = useRef<HTMLButtonElement>(null);

  // Execute or Load Stockfish Analysis
  const runAnalysis = React.useCallback(
    (force = false) => {
      let isMounted = true;
      setIsLoading(true);
      setProgressPercent(15);
      setProgressText(force ? 'Re-analyzing with Stockfish 16 engine...' : 'Loading game analysis...');

      analyzeFullGameAsync(
        game,
        userColor,
        dag,
        activeRepertoire ?? undefined,
        (pct, msg) => {
          if (isMounted) {
            setProgressPercent(pct);
            setProgressText(msg);
          }
        },
        force
      )
        .then((res) => {
          if (isMounted) {
            setReviewResult(res);
            setIsLoading(false);
          }
        })
        .catch((err) => {
          console.error('Failed to analyze game with Stockfish:', err);
          if (isMounted) setIsLoading(false);
        });

      return () => {
        isMounted = false;
      };
    },
    [game, userColor, dag, activeRepertoire]
  );

  useEffect(() => {
    // If cached review has the telltale bugged 99.9% score, automatically re-analyze
    if (initialCached && initialCached.whiteAccuracy >= 99.8 && initialCached.blackAccuracy >= 99.8) {
      invalidateGameReview(game);
      return runAnalysis(true);
    }
    // If not already in memory cache, run analysis
    if (!initialCached) {
      return runAnalysis(false);
    }
  }, [initialCached, runAnalysis, game]);

  const handleForceReanalyze = () => {
    invalidateGameReview(game);
    runAnalysis(true);
  };

  const totalPlies = reviewResult ? (reviewResult.moves?.length ?? 0) : 0;
  const currentMove: MoveReviewItem | undefined =
    reviewResult && currentPly > 0 ? reviewResult.moves[currentPly - 1] : undefined;

  // Deriving currentFen directly guarantees 100% accurate piece positions
  const currentFen = useMemo(() => {
    if (!reviewResult || !reviewResult.moves || reviewResult.moves.length === 0) {
      return STARTING_FEN;
    }
    if (currentPly <= 0) {
      return reviewResult.moves[0]?.fenBefore || reviewResult.positions?.[0] || STARTING_FEN;
    }
    const moveIdx = Math.min(currentPly - 1, reviewResult.moves.length - 1);
    return reviewResult.moves[moveIdx]?.fenAfter || STARTING_FEN;
  }, [reviewResult, currentPly]);

  // Extract all retryable mistakes for the user
  const retryMistakes = useMemo((): RetryMistakeItem[] => {
    if (!reviewResult || !reviewResult.moves) return [];
    const items: RetryMistakeItem[] = [];

    for (const m of reviewResult.moves) {
      const isUserMove =
        (m.ply % 2 === 1 && userColor === 'white') || (m.ply % 2 === 0 && userColor === 'black');
      if (!isUserMove) continue;

      const isMistake =
        m.classification === 'blunder' ||
        m.classification === 'mistake' ||
        m.classification === 'miss' ||
        m.classification === 'inaccuracy';

      if (!isMistake) continue;
      if (!m.bestMove) continue;

      const playedUci = `${m.from}${m.to}`;
      const bestUci = `${m.bestMove.from}${m.bestMove.to}`;
      if (playedUci === bestUci) continue;

      items.push({
        ply: m.ply,
        moveNumber: Math.ceil(m.ply / 2),
        fenBefore: m.fenBefore,
        playedSan: m.san,
        playedUci,
        bestSan: m.bestMove.san,
        bestUci,
        classification: m.classification,
        turn: userColor,
      });
    }

    return items;
  }, [reviewResult, userColor]);

  const activeMistake: RetryMistakeItem | undefined = retryMistakes[retryIndex];

  // Auto-scroll the move list when current ply changes
  useEffect(() => {
    if (activeMoveButtonRef.current && moveListRef.current) {
      activeMoveButtonRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [currentPly]);

  // Keyboard navigation (Left, Right, Space)
  useEffect(() => {
    if (isLoading || !reviewResult || viewMode === 'retry') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentPly((p) => Math.max(0, p - 1));
        setShowBestMove(false);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentPly((p) => Math.min(totalPlies, p + 1));
        setShowBestMove(false);
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLoading, reviewResult, totalPlies, viewMode, onClose]);

  // Auto-play interval
  useEffect(() => {
    if (!isPlaying || !reviewResult || viewMode !== 'detail') return;
    const interval = setInterval(() => {
      setCurrentPly((prev) => {
        if (prev >= totalPlies) {
          setIsPlaying(false);
          return prev;
        }
        if (soundEnabled) playMoveSound();
        return prev + 1;
      });
    }, 1400);

    return () => clearInterval(interval);
  }, [isPlaying, reviewResult, totalPlies, soundEnabled, viewMode]);

  // Destination square badge glyph on ChessBoard (ChessAtlas destination glyph overlay)
  const classificationBadge = useMemo((): ClassificationBadge | null => {
    if (viewMode !== 'detail' || !currentMove) return null;
    const meta = CLASSIFICATION_META[currentMove.classification];
    if (!meta) return null;
    return {
      square: currentMove.to,
      color: meta.dotColor,
      glyph: meta.short,
      icon: meta.label,
    };
  }, [viewMode, currentMove]);

  // Constructed arrows for ChessBoard
  const boardArrows = useMemo(() => {
    if (viewMode === 'retry') {
      if (!activeMistake) return [];
      if (retryStatus === 'asking' || retryStatus === 'wrong' || retryStatus === 'played') {
        // Red arrow showing the played blunder
        return [
          {
            from: activeMistake.playedUci.slice(0, 2),
            to: activeMistake.playedUci.slice(2, 4),
            color: '#EF4444',
          },
        ];
      }
      if (retryStatus === 'solved' || retryStatus === 'revealed') {
        // Green arrow showing the best move
        return [
          {
            from: activeMistake.bestUci.slice(0, 2),
            to: activeMistake.bestUci.slice(2, 4),
            color: '#10B981',
          },
        ];
      }
      return [];
    }

    // Detail mode arrows
    const list: Array<{ from: string; to: string; color: string }> = [];
    if (!currentMove) return list;

    // Show green arrow for Stockfish best move recommendation on mistakes
    if (
      (showBestMove ||
        currentMove.classification === 'blunder' ||
        currentMove.classification === 'mistake' ||
        currentMove.classification === 'miss') &&
      currentMove.bestMove &&
      (currentMove.bestMove.from !== currentMove.from || currentMove.bestMove.to !== currentMove.to)
    ) {
      list.push({
        from: currentMove.bestMove.from,
        to: currentMove.bestMove.to,
        color: '#10B981',
      });
    }

    return list;
  }, [viewMode, activeMistake, retryStatus, currentMove, showBestMove]);

  const lastMoveHighlight = useMemo(() => {
    if (viewMode === 'retry') return null;
    if (!currentMove) return null;
    return { from: currentMove.from, to: currentMove.to };
  }, [viewMode, currentMove]);

  // Chess.com Real Win Probability & Eval Bar State
  const winProbWhite = useMemo(() => {
    const cp = currentMove ? currentMove.evalAfterCp : (reviewResult?.evalHistory[currentPly] ?? 20);
    return Math.min(100, Math.max(0, 100 / (1 + Math.pow(10, -cp / 400))));
  }, [currentMove, reviewResult, currentPly]);

  const whiteBarHeight = boardOrientation === 'white' ? winProbWhite : 100 - winProbWhite;

  const evalLabel = useMemo(() => {
    const cp = currentMove ? currentMove.evalAfterCp : (reviewResult?.evalHistory[currentPly] ?? 20);
    if (Math.abs(cp) >= 25000) {
      return cp > 0 ? '+M' : '-M';
    }
    const score = cp / 100;
    return `${score > 0 ? '+' : ''}${score.toFixed(1)}`;
  }, [currentMove, reviewResult, currentPly]);

  // Mascot Mood & Summary Header
  const mascotMood = useMemo(() => {
    if (!reviewResult) return { expression: 'idle', title: 'Game Analyzed', desc: '' };
    const userAcc = userColor === 'white' ? reviewResult.whiteAccuracy : reviewResult.blackAccuracy;
    const oppAcc = userColor === 'white' ? reviewResult.blackAccuracy : reviewResult.whiteAccuracy;
    const res = game.result;

    const isWin =
      (userColor === 'white' && res === '1-0') || (userColor === 'black' && res === '0-1');
    const isLoss =
      (userColor === 'white' && res === '0-1') || (userColor === 'black' && res === '1-0');

    if (isWin) {
      return {
        expression: 'happy' as const,
        title: 'Victory! Outstanding Game',
        desc: `You played with ${userAcc.toFixed(1)}% accuracy compared to opponent's ${oppAcc.toFixed(1)}%.`,
      };
    }
    if (isLoss) {
      return {
        expression: 'sad' as const,
        title: 'Tough Loss · Good Learning Opportunity',
        desc: `You scored ${userAcc.toFixed(1)}% accuracy. Review your critical mistakes to turn games around.`,
      };
    }
    return {
      expression: 'idle' as const,
      title: 'Balanced Game · Hard Fought',
      desc: `Both players matched evenly with ${userAcc.toFixed(1)}% and ${oppAcc.toFixed(1)}% accuracy.`,
    };
  }, [reviewResult, userColor, game.result]);

  // Move validation handler for Retry Mistakes Mode
  const handleRetryBoardMove = (move: { from: string; to: string; san: string; promotion?: string }) => {
    if (!activeMistake) return;
    const playedUci = `${move.from}${move.to}`;
    const bestUci = activeMistake.bestUci.slice(0, 4);

    if (move.san === activeMistake.bestSan || playedUci === bestUci) {
      // Correct best move!
      playCheckSound();
      setRetryStatus('solved');
      setRetryResults((prev) => ({ ...prev, [retryIndex]: true }));
    } else if (move.san === activeMistake.playedSan || playedUci === activeMistake.playedUci) {
      // Repeated original mistake
      playErrorSound();
      setRetryStatus('played');
    } else {
      // Wrong move
      playErrorSound();
      setRetryStatus('wrong');
      setRetryResults((prev) => ({ ...prev, [retryIndex]: false }));
    }
  };

  const handleNextMistake = () => {
    if (retryIndex + 1 < retryMistakes.length) {
      setRetryIndex((i) => i + 1);
      setRetryStatus('asking');
    } else {
      // Done with all mistakes
      setViewMode('report');
    }
  };

  const handleStartRetry = () => {
    if (retryMistakes.length === 0) return;
    setRetryIndex(0);
    setRetryStatus('asking');
    setRetryResults({});
    setViewMode('retry');
  };

  const classificationOrder: MoveClassification[] = [
    'brilliant',
    'great',
    'best',
    'excellent',
    'good',
    'book',
    'inaccuracy',
    'mistake',
    'miss',
    'blunder',
  ];

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 lg:p-6 overflow-hidden select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="relative w-full max-w-[1240px] h-[95vh] max-h-[920px] rounded-2xl border border-white/10 bg-[#0E131F] text-white flex flex-col shadow-2xl overflow-hidden"
      >
        {/* ========================================================================= */}
        {/* TOP MODAL BAR: Breadcrumbs, View Switcher Tabs, Settings & Close         */}
        {/* ========================================================================= */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-white/[0.08] bg-[#0A0E17] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500 text-stone-950 font-black text-xs shrink-0">
              CC
            </span>
            <div className="truncate">
              <h2 className="text-sm font-bold text-white truncate flex items-center gap-2">
                <span>Game Review</span>
                <span className="text-xs font-mono text-gray-400 font-normal">
                  ({game.white} vs {game.black})
                </span>
              </h2>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setViewMode('report')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'report'
                  ? 'bg-emerald-500 text-stone-950 shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Report</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('detail');
                if (currentPly === 0) setCurrentPly(1);
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'detail'
                  ? 'bg-emerald-500 text-stone-950 shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>Analysis</span>
            </button>
            <button
              type="button"
              onClick={handleStartRetry}
              disabled={retryMistakes.length === 0}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-30 disabled:pointer-events-none ${
                viewMode === 'retry'
                  ? 'bg-emerald-500 text-stone-950 shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry ({retryMistakes.length})</span>
            </button>
          </div>

          {/* Actions: Sound, Re-analyze, Close */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSoundEnabled((s) => !s)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title={soundEnabled ? 'Mute Sounds' : 'Enable Sounds'}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={handleForceReanalyze}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Force Engine Re-analysis"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors ml-1"
              title="Close Review"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* LOADING OVERLAY: Engine Calculation Progress                              */}
        {/* ========================================================================= */}
        {isLoading && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0E131F]/95 backdrop-blur-md px-6">
            <div className="w-full max-w-md p-6 rounded-2xl bg-[#141B2B] border border-white/10 shadow-2xl text-center flex flex-col items-center gap-4">
              <div className="relative">
                <Loader2 className="h-10 w-10 text-emerald-400 animate-spin" />
                <Cpu className="h-5 w-5 text-white absolute inset-0 m-auto" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Stockfish 16 Engine Review</h3>
                <p className="text-xs text-gray-400 mt-1 font-mono">{progressText}</p>
              </div>
              <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW MODE 1: REPORT VIEW (Overview, Dual Accuracy Rings, Table, CTAs)      */}
        {/* ========================================================================= */}
        {viewMode === 'report' && reviewResult && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6 max-w-4xl mx-auto w-full">
            {/* Mascot Coach Mood Card */}
            <div className="flex items-center gap-4 p-4 sm:p-5 rounded-2xl bg-white/[0.04] border border-white/10 shadow-lg">
              <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                {mascotMood.expression === 'happy' ? (
                  <Smile className="h-7 w-7 sm:h-8 sm:w-8" />
                ) : mascotMood.expression === 'sad' ? (
                  <Frown className="h-7 w-7 sm:h-8 sm:w-8" />
                ) : (
                  <Meh className="h-7 w-7 sm:h-8 sm:w-8" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base sm:text-lg font-extrabold text-white">{mascotMood.title}</h3>
                <p className="text-xs sm:text-sm text-gray-400 mt-0.5 leading-relaxed">{mascotMood.desc}</p>
              </div>
            </div>

            {/* Dual Circular SVG Accuracy Rings */}
            <div className="grid grid-cols-2 gap-4">
              {/* White Player Ring */}
              <div
                className={`p-4 rounded-2xl border flex flex-col items-center text-center gap-3 transition-colors ${
                  userColor === 'white'
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-white ring-2 ring-white/20" />
                  <span className="text-xs font-bold text-white truncate max-w-[140px]">
                    {game.white}
                  </span>
                  {game.whiteRating && (
                    <span className="text-[11px] font-mono text-gray-400">({game.whiteRating})</span>
                  )}
                </div>
                <AccuracyRing accuracy={reviewResult.whiteAccuracy} />
                <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
                  White Accuracy
                </span>
              </div>

              {/* Black Player Ring */}
              <div
                className={`p-4 rounded-2xl border flex flex-col items-center text-center gap-3 transition-colors ${
                  userColor === 'black'
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-stone-900 border border-white/50" />
                  <span className="text-xs font-bold text-white truncate max-w-[140px]">
                    {game.black}
                  </span>
                  {game.blackRating && (
                    <span className="text-[11px] font-mono text-gray-400">({game.blackRating})</span>
                  )}
                </div>
                <AccuracyRing accuracy={reviewResult.blackAccuracy} />
                <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
                  Black Accuracy
                </span>
              </div>
            </div>

            {/* Interactive Monotone Evaluation Area Chart */}
            <div className="rounded-2xl border border-white/10 bg-[#0A0E17] p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs text-gray-400 font-medium px-1">
                <span>Evaluation Timeline</span>
                <span className="text-[11px] font-mono">Click point to jump to ply</span>
              </div>
              <EvaluationAreaChart
                moves={reviewResult.moves}
                currentPly={currentPly}
                onSelectPly={(ply) => {
                  setCurrentPly(ply);
                  setViewMode('detail');
                }}
                height={84}
              />
            </div>

            {/* 4-Column Move Classification Breakdown Table */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden p-4">
              <div className="grid grid-cols-[1fr_3.5rem_2.5rem_3.5rem] items-center gap-2 pb-2 mb-2 border-b border-white/10 text-xs text-gray-400 font-semibold px-2">
                <span>Classification</span>
                <span className="text-center">White</span>
                <span className="text-center">Icon</span>
                <span className="text-center">Black</span>
              </div>

              <div className="flex flex-col gap-1.5">
                {classificationOrder.map((cat) => {
                  const meta = CLASSIFICATION_META[cat];
                  const wCount = reviewResult.counts.white[cat] || 0;
                  const bCount = reviewResult.counts.black[cat] || 0;
                  if (wCount === 0 && bCount === 0) return null;

                  return (
                    <div
                      key={cat}
                      className="grid grid-cols-[1fr_3.5rem_2.5rem_3.5rem] items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors text-xs"
                    >
                      <span className="font-semibold text-gray-300">{meta.label}</span>
                      <span
                        className="text-center font-mono font-bold text-sm"
                        style={{ color: wCount > 0 ? meta.dotColor : 'rgba(255,255,255,0.2)' }}
                      >
                        {wCount}
                      </span>
                      <div className="flex items-center justify-center">
                        <ClassificationIcon classification={cat} size={24} />
                      </div>
                      <span
                        className="text-center font-mono font-bold text-sm"
                        style={{ color: bCount > 0 ? meta.dotColor : 'rgba(255,255,255,0.2)' }}
                      >
                        {bCount}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action Buttons: Start Review & Retry Mistakes */}
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setViewMode('detail');
                  setCurrentPly(1);
                }}
                className="w-full flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 py-3.5 text-sm font-extrabold text-stone-950 transition-transform active:scale-[0.98] cursor-pointer shadow-lg"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>Start Review</span>
              </button>

              <button
                type="button"
                onClick={handleStartRetry}
                disabled={retryMistakes.length === 0}
                className="w-full sm:w-auto px-6 flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 py-3.5 text-sm font-bold text-white transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Retry Mistakes ({retryMistakes.length})</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW MODE 2: DETAIL VIEW (Board + EvalBar + Coach Box + Move List)        */}
        {/* ========================================================================= */}
        {viewMode === 'detail' && reviewResult && (
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
            {/* Left Column: Board + Eval Bar + Navigation */}
            <div className="flex-1 flex flex-col items-center justify-center p-3 sm:p-5 overflow-y-auto">
              <div className="w-full max-w-[560px] flex flex-col gap-3">
                {/* Board Container with Left-attached Vertical EvalBar */}
                <div className="relative flex items-stretch gap-2.5 w-full">
                  {/* Full-Height Eval Bar */}
                  <div className="w-3 sm:w-3.5 rounded-full bg-[#1C2333] border border-white/10 flex flex-col overflow-hidden relative shadow-inner">
                    <div
                      className="w-full bg-white transition-all duration-300"
                      style={{ height: `${whiteBarHeight}%` }}
                    />
                    <div className="absolute inset-x-0 bottom-1 flex items-center justify-center pointer-events-none">
                      <span className="text-[9px] font-mono font-bold text-black drop-shadow-sm">
                        {evalLabel}
                      </span>
                    </div>
                  </div>

                  {/* Interactive ChessBoard with Destination Square Badge Glyph */}
                  <div className="flex-1 aspect-square relative rounded-xl overflow-hidden border border-white/10 shadow-2xl bg-[#141B29]">
                    <ChessBoard
                      fen={currentFen}
                      orientation={boardOrientation}
                      interactive={false}
                      lastMove={lastMoveHighlight}
                      arrows={boardArrows}
                      classificationBadge={classificationBadge}
                    />
                  </div>
                </div>

                {/* Bottom Board Navigation Controls */}
                <div className="flex items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentPly(0);
                        setShowBestMove(false);
                      }}
                      disabled={currentPly <= 0}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      title="First Move"
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentPly((p) => Math.max(0, p - 1));
                        setShowBestMove(false);
                      }}
                      disabled={currentPly <= 0}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      title="Previous Move"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsPlaying((p) => !p)}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors"
                      title={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentPly((p) => Math.min(totalPlies, p + 1));
                        setShowBestMove(false);
                      }}
                      disabled={currentPly >= totalPlies}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      title="Next Move"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentPly(totalPlies);
                        setShowBestMove(false);
                      }}
                      disabled={currentPly >= totalPlies}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      title="Last Move"
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Centered Ply Counter */}
                  <span className="text-xs font-mono font-bold text-gray-400">
                    {currentPly} / {totalPlies}
                  </span>

                  <button
                    type="button"
                    onClick={() => setBoardOrientation((o) => (o === 'white' ? 'black' : 'white'))}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors text-xs font-bold"
                    title="Flip Board"
                  >
                    Flip
                  </button>
                </div>

                {/* Mini Evaluation Area Chart */}
                <div className="rounded-xl border border-white/10 bg-[#0A0E17] p-2">
                  <EvaluationAreaChart
                    moves={reviewResult.moves}
                    currentPly={currentPly}
                    onSelectPly={(ply) => setCurrentPly(ply)}
                    height={54}
                  />
                </div>
              </div>
            </div>

            {/* Right Column: Coach Narration Box + Scrollable Move List */}
            <div className="w-full lg:w-[420px] border-t lg:border-t-0 lg:border-l border-white/10 bg-[#0B0F18] flex flex-col min-h-0">
              {/* Back to Overview CTA */}
              <div className="px-4 py-2.5 border-b border-white/[0.08] flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('report')}
                  className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Overview Report</span>
                </button>
                {retryMistakes.length > 0 && (
                  <button
                    type="button"
                    onClick={handleStartRetry}
                    className="flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Retry Mistakes ({retryMistakes.length})</span>
                  </button>
                )}
              </div>

              {/* Coach Narration Card */}
              <div className="p-4 border-b border-white/[0.08] bg-white/[0.02] shrink-0">
                {currentMove ? (
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ClassificationIcon classification={currentMove.classification} size={28} />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono font-bold text-gray-400">
                              {Math.ceil(currentMove.ply / 2)}.
                              {currentMove.ply % 2 === 1 ? '' : '..'}
                            </span>
                            <span className="text-sm font-extrabold text-white">{currentMove.san}</span>
                          </div>
                          <span
                            className="text-xs font-bold uppercase tracking-wider"
                            style={{ color: CLASSIFICATION_META[currentMove.classification]?.dotColor }}
                          >
                            {CLASSIFICATION_META[currentMove.classification]?.label}
                          </span>
                        </div>
                      </div>

                      {/* Best move toggle button */}
                      {currentMove.bestMove && (
                        <button
                          type="button"
                          onClick={() => setShowBestMove((b) => !b)}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            showBestMove
                              ? 'bg-emerald-500 text-stone-950 shadow-md'
                              : 'bg-white/5 border border-white/10 text-emerald-400 hover:bg-white/10'
                          }`}
                        >
                          <Lightbulb className="h-3.5 w-3.5" />
                          <span>Best: {currentMove.bestMove.san}</span>
                        </button>
                      )}
                    </div>

                    <p className="text-xs text-gray-300 leading-relaxed font-sans">
                      {currentMove.comment}
                    </p>

                    {currentMove.tacticalExplanation && (
                      <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-gray-400 font-sans leading-relaxed">
                        <span className="font-bold text-amber-300 block mb-0.5">Engine Tactical Reason:</span>
                        {currentMove.tacticalExplanation}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-xs text-gray-400">Starting position. Use controls or arrow keys to step forward.</p>
                  </div>
                )}
              </div>

              {/* Scrollable Move List (ChessAtlas Move Tree format) */}
              <div ref={moveListRef} className="flex-1 overflow-y-auto p-2 divide-y divide-white/[0.03]">
                {Array.from({ length: Math.ceil(totalPlies / 2) }).map((_, moveNumberIdx) => {
                  const moveNumber = moveNumberIdx + 1;
                  const whitePly = moveNumberIdx * 2 + 1;
                  const blackPly = moveNumberIdx * 2 + 2;

                  const whiteMove = reviewResult.moves[whitePly - 1];
                  const blackMove = reviewResult.moves[blackPly - 1];

                  return (
                    <div
                      key={moveNumber}
                      className="grid grid-cols-[2.5rem_1fr_1fr] items-center gap-1.5 py-1 px-2 hover:bg-white/[0.02] rounded-lg text-xs font-mono"
                    >
                      <span className="text-gray-500 font-semibold">{moveNumber}.</span>

                      {/* White Move Button */}
                      {whiteMove ? (
                        <button
                          type="button"
                          ref={currentPly === whitePly ? activeMoveButtonRef : undefined}
                          onClick={() => {
                            setCurrentPly(whitePly);
                            setShowBestMove(false);
                          }}
                          className={`flex items-center justify-between px-2 py-1 rounded-md transition-colors cursor-pointer ${
                            currentPly === whitePly
                              ? 'bg-emerald-500 text-stone-950 font-bold shadow-md'
                              : 'hover:bg-white/5 text-gray-200'
                          }`}
                        >
                          <span>{whiteMove.san}</span>
                          <ClassificationIcon classification={whiteMove.classification} size={15} />
                        </button>
                      ) : (
                        <span />
                      )}

                      {/* Black Move Button */}
                      {blackMove ? (
                        <button
                          type="button"
                          ref={currentPly === blackPly ? activeMoveButtonRef : undefined}
                          onClick={() => {
                            setCurrentPly(blackPly);
                            setShowBestMove(false);
                          }}
                          className={`flex items-center justify-between px-2 py-1 rounded-md transition-colors cursor-pointer ${
                            currentPly === blackPly
                              ? 'bg-emerald-500 text-stone-950 font-bold shadow-md'
                              : 'hover:bg-white/5 text-gray-200'
                          }`}
                        >
                          <span>{blackMove.san}</span>
                          <ClassificationIcon classification={blackMove.classification} size={15} />
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW MODE 3: RETRY MISTAKES VIEW (Interactive Mistake Solving Mode)       */}
        {/* ========================================================================= */}
        {viewMode === 'retry' && activeMistake && (
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
            {/* Left: Board with Pre-Mistake Position */}
            <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto">
              <div className="w-full max-w-[540px] flex flex-col gap-3">
                {/* Stepper Progress */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-amber-400">
                      Mistake {retryIndex + 1} of {retryMistakes.length}
                    </span>
                    <span className="text-[11px] font-mono text-gray-400">
                      (Move {activeMistake.moveNumber} for {activeMistake.turn})
                    </span>
                  </div>

                  {/* Progress Dots */}
                  <div className="flex items-center gap-1.5">
                    {retryMistakes.map((_, idx) => (
                      <span
                        key={idx}
                        className={`size-2 rounded-full transition-all ${
                          retryResults[idx] === true
                            ? 'bg-emerald-400'
                            : retryResults[idx] === false
                            ? 'bg-rose-500'
                            : idx === retryIndex
                            ? 'bg-amber-400 scale-125'
                            : 'bg-white/20'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Interactive ChessBoard */}
                <div className="aspect-square relative rounded-xl overflow-hidden border border-white/10 shadow-2xl bg-[#141B29]">
                  <ChessBoard
                    fen={activeMistake.fenBefore}
                    orientation={userColor}
                    onMove={
                      retryStatus === 'asking' || retryStatus === 'wrong' || retryStatus === 'played'
                        ? handleRetryBoardMove
                        : undefined
                    }
                    interactive={
                      retryStatus === 'asking' || retryStatus === 'wrong' || retryStatus === 'played'
                    }
                    arrows={boardArrows}
                  />
                </div>
              </div>
            </div>

            {/* Right: Coach Feedback, Solution & Progression */}
            <div className="w-full lg:w-[400px] border-t lg:border-t-0 lg:border-l border-white/10 bg-[#0B0F18] p-5 flex flex-col justify-between">
              <div className="flex flex-col gap-4">
                <button
                  type="button"
                  onClick={() => setViewMode('report')}
                  className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-white transition-colors cursor-pointer self-start"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Back to Report</span>
                </button>

                <div className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/10">
                  <ClassificationIcon classification={activeMistake.classification} size={32} />
                  <div>
                    <h3 className="text-sm font-bold text-white">Find the Best Move</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      You played{' '}
                      <span className="font-mono font-bold text-rose-400">{activeMistake.playedSan}</span> in the game.
                    </p>
                  </div>
                </div>

                {/* Live Feedback Box */}
                {retryStatus === 'asking' && (
                  <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
                    Make your move on the board to find the engine&apos;s best recommendation.
                  </div>
                )}

                {retryStatus === 'played' && (
                  <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-300 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>That&apos;s the mistake you played during the game! Try to find a better tactic.</span>
                  </div>
                )}

                {retryStatus === 'wrong' && (
                  <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
                    <X className="h-4 w-4 shrink-0" />
                    <span>Not the best move. Try again, or click &quot;Show Solution&quot;.</span>
                  </div>
                )}

                {retryStatus === 'solved' && (
                  <div className="p-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-xs text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                    <div>
                      <span className="font-extrabold block text-sm">Solved!</span>
                      <span>
                        <strong className="font-mono text-white">{activeMistake.bestSan}</strong> is the best move in this position.
                      </span>
                    </div>
                  </div>
                )}

                {retryStatus === 'revealed' && (
                  <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300">
                    The best move was <strong className="font-mono text-white">{activeMistake.bestSan}</strong> (indicated with the green arrow).
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2 pt-4">
                {retryStatus === 'solved' || retryStatus === 'revealed' ? (
                  <button
                    type="button"
                    onClick={handleNextMistake}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 py-3.5 text-sm font-extrabold text-stone-950 transition-transform active:scale-[0.98] cursor-pointer shadow-lg"
                  >
                    <span>{retryIndex + 1 < retryMistakes.length ? 'Next Mistake' : 'Finish Retry'}</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setRetryStatus('revealed')}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 py-3 text-xs font-bold text-gray-300 hover:text-white transition-colors cursor-pointer"
                    >
                      <Eye className="h-4 w-4" />
                      <span>Show Solution</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleNextMistake}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-transparent hover:bg-white/5 py-2 text-xs font-semibold text-gray-400 hover:text-white transition-colors cursor-pointer"
                    >
                      <span>Skip this mistake</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
