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
import ChessBoard from './ChessBoard';
import { playMoveSound } from '@/lib/chess/audio';
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

export default function GameReviewModal({
  game,
  userColor = 'white',
  dag,
  activeRepertoire,
  onClose,
  onAddToTraining,
}: GameReviewModalProps) {
  // Mode: 'summary' (Report Card) or 'review' (Move by Move)
  const [viewMode, setViewMode] = useState<'summary' | 'review'>('summary');
  const [currentPly, setCurrentPly] = useState(0);
  const [showBestMove, setShowBestMove] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>(userColor);

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
    // If not already in memory cache, run analysis (checks Dexie database first)
    if (!initialCached) {
      return runAnalysis(false);
    }
  }, [initialCached, runAnalysis]);

  const handleForceReanalyze = () => {
    invalidateGameReview(game);
    runAnalysis(true);
  };

  const totalPlies = reviewResult ? (reviewResult.moves?.length ?? (reviewResult.positions?.length ? reviewResult.positions.length - 1 : 0)) : 0;
  const currentMove: MoveReviewItem | undefined =
    reviewResult && currentPly > 0 ? reviewResult.moves[currentPly - 1] : undefined;

  // Deriving currentFen directly from currentMove.fenAfter guarantees 100% accurate piece positions
  const currentFen = useMemo(() => {
    if (!reviewResult || !reviewResult.moves || reviewResult.moves.length === 0) {
      return STARTING_FEN;
    }
    if (currentPly <= 0) {
      return reviewResult.moves[0]?.fenBefore || reviewResult.positions?.[0] || STARTING_FEN;
    }
    const moveIdx = Math.min(currentPly - 1, reviewResult.moves.length - 1);
    return reviewResult.moves[moveIdx]?.fenAfter || reviewResult.positions?.[currentPly] || STARTING_FEN;
  }, [reviewResult, currentPly]);


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
    if (isLoading || !reviewResult) return;

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
  }, [isLoading, reviewResult, totalPlies, onClose]);

  // Auto-play interval
  useEffect(() => {
    if (!isPlaying || !reviewResult) return;
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
  }, [isPlaying, reviewResult, totalPlies, soundEnabled]);

  // Construct arrows for ChessBoard:
  // - Played mistake/blunder move: red arrow
  // - Real Stockfish best move recommendation: green arrow
  const arrows = useMemo(() => {
    const list: Array<{ from: string; to: string; color: string }> = [];
    if (!currentMove) return list;

    if (
      showBestMove &&
      currentMove.bestMove &&
      (currentMove.bestMove.from !== currentMove.from || currentMove.bestMove.to !== currentMove.to)
    ) {
      list.push({
        from: currentMove.bestMove.from,
        to: currentMove.bestMove.to,
        color: '#10B981', // green arrow for real best move
      });
    }

    if (currentMove.classification === 'blunder' || currentMove.classification === 'mistake') {
      list.push({
        from: currentMove.from,
        to: currentMove.to,
        color: '#EF4444', // red arrow for blunder
      });
    }

    return list;
  }, [currentMove, showBestMove]);

  const lastMoveHighlight = useMemo(() => {
    if (!currentMove) return null;
    return { from: currentMove.from, to: currentMove.to };
  }, [currentMove]);

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

  // Jump to next key moment (mistake, blunder, miss)
  const jumpToNextKeyMove = () => {
    if (!reviewResult) return;
    for (let i = currentPly; i < reviewResult.moves.length; i++) {
      const m = reviewResult.moves[i];
      if (m.classification === 'blunder' || m.classification === 'mistake' || m.classification === 'miss') {
        setCurrentPly(i + 1);
        setShowBestMove(false);
        if (soundEnabled) playMoveSound();
        return;
      }
    }
    for (let i = 0; i < currentPly - 1; i++) {
      const m = reviewResult.moves[i];
      if (m.classification === 'blunder' || m.classification === 'mistake' || m.classification === 'miss') {
        setCurrentPly(i + 1);
        setShowBestMove(false);
        if (soundEnabled) playMoveSound();
        return;
      }
    }
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
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 overflow-hidden select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="relative w-full max-w-[1180px] h-[92vh] max-h-[880px] rounded-2xl border border-white/10 bg-[#121724] text-white flex flex-col shadow-2xl overflow-hidden"
      >
        {/* ========================================================================= */}
        {/* TOP MODAL BAR: Title, Engine Badge, Mode Tabs, Sound, Flip & Close       */}
        {/* ========================================================================= */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.08] bg-[#0E131E] shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400 text-stone-950 font-bold text-xs">
              <Eye className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                Game Review
                <span className="text-xs font-normal text-gray-400">·</span>
                <span className="text-xs font-mono font-medium text-gray-300">
                  {game.white} vs {game.black} ({game.result})
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[0.62rem] font-bold text-emerald-400">
                  <Cpu className="h-2.5 w-2.5" />
                  Stockfish 16
                </span>
                {!isLoading && reviewResult && (
                  <button
                    type="button"
                    onClick={handleForceReanalyze}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[0.62rem] font-semibold text-gray-300 hover:text-white transition-colors cursor-pointer"
                    title="Re-run deep engine analysis"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    <span className="hidden sm:inline">Re-analyze</span>
                  </button>
                )}
              </h2>
            </div>
          </div>


          <div className="flex items-center gap-2">
            {/* View Mode Toggle: Summary Report vs Move Review */}
            {!isLoading && reviewResult && (
              <div className="flex items-center bg-white/5 border border-white/10 rounded-lg p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setViewMode('summary')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors cursor-pointer ${
                    viewMode === 'summary'
                      ? 'bg-amber-400 text-stone-950 font-bold shadow-xs'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  <span>Report</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('review')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors cursor-pointer ${
                    viewMode === 'review'
                      ? 'bg-amber-400 text-stone-950 font-bold shadow-xs'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <List className="h-3.5 w-3.5" />
                  <span>Review</span>
                </button>
              </div>
            )}

            {/* Sound Toggle */}
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-gray-400 hover:text-white transition-colors cursor-pointer"
              title={soundEnabled ? 'Mute audio' : 'Enable audio'}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-gray-400 hover:text-white transition-colors cursor-pointer ml-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* BODY CONTENT                                                             */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            /* Loading State with Real Progress Bar (Screenshot 1) */
            <div className="h-full flex flex-col items-center justify-center p-8 space-y-6 max-w-lg mx-auto text-center">
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-400/10 border border-amber-400/20 text-amber-400">
                <GraduationCap size={32} weight="duotone" />
                <Loader2 className="absolute -top-1 -right-1 h-5 w-5 animate-spin text-amber-400" />
              </div>

              <div className="space-y-1.5 w-full">
                <h3 className="text-lg font-bold text-white tracking-tight">
                  Game Review in Progress
                </h3>
                <p className="text-xs text-gray-400 leading-relaxed">{progressText}</p>
              </div>

              {/* Progress bar */}
              <div className="w-full space-y-1.5">
                <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-amber-400 transition-all duration-300 rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[0.68rem] text-gray-400 font-mono">
                  <span>Stockfish 16 Engine Depth 50+</span>
                  <span className="font-bold text-amber-400">{progressPercent}%</span>
                </div>
              </div>
            </div>
          ) : reviewResult ? (
            viewMode === 'summary' ? (
              /* =================================================================== */
              /* 1. REPORT CARD / SUMMARY VIEW (SCREENSHOT 1 & 2)                    */
              /* =================================================================== */
              <div className="h-full overflow-y-auto p-6 space-y-6">
                {/* Coach Speech Bubble */}
                <div className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/10 max-w-3xl mx-auto">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/20 text-amber-400 font-bold shrink-0">
                    <GraduationCap size={26} weight="duotone" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                      Grandmaster Coach
                    </span>
                    <p className="text-sm text-gray-200 leading-relaxed">
                      {reviewResult.summaryComment} Let us explore the pivotal acts and critical
                      tactical moments that shaped the outcome.
                    </p>
                  </div>
                </div>

                {/* Player Accuracies Card */}
                <div className="grid grid-cols-2 gap-4 max-w-3xl mx-auto">
                  {/* White Player */}
                  <div className="rounded-xl border border-white/10 bg-[#161D2C] p-4 text-center space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      <span className="h-3 w-3 rounded-full border border-gray-400 bg-white" />
                      <span className="text-sm font-bold text-white truncate max-w-[160px]">
                        {game.white}
                      </span>
                      {game.whiteRating && (
                        <span className="text-xs text-gray-400">({game.whiteRating})</span>
                      )}
                    </div>
                    <div>
                      <span className="text-3xl font-extrabold text-white font-mono tabular-nums">
                        {reviewResult.whiteAccuracy}%
                      </span>
                      <span className="block text-[0.68rem] uppercase font-bold text-gray-400 mt-0.5">
                        White Accuracy
                      </span>
                    </div>
                  </div>

                  {/* Black Player */}
                  <div className="rounded-xl border border-white/10 bg-[#161D2C] p-4 text-center space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      <span className="h-3 w-3 rounded-full border border-gray-400 bg-transparent" />
                      <span className="text-sm font-bold text-white truncate max-w-[160px]">
                        {game.black}
                      </span>
                      {game.blackRating && (
                        <span className="text-xs text-gray-400">({game.blackRating})</span>
                      )}
                    </div>
                    <div>
                      <span className="text-3xl font-extrabold text-white font-mono tabular-nums">
                        {reviewResult.blackAccuracy}%
                      </span>
                      <span className="block text-[0.68rem] uppercase font-bold text-gray-400 mt-0.5">
                        Black Accuracy
                      </span>
                    </div>
                  </div>
                </div>

                {/* Move Classification Breakdown Table */}
                <div className="max-w-3xl mx-auto rounded-2xl border border-white/10 bg-[#141A28] shadow-xl overflow-hidden">
                  {/* Table Header */}
                  <div className="grid grid-cols-12 px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-gray-400 border-b border-white/[0.08] bg-[#0E131E]/70 items-center">
                    {/* White Player Column */}
                    <div className="col-span-4 flex items-center justify-end gap-2 pr-6 sm:pr-8">
                      <span className="h-2.5 w-2.5 rounded-full border border-gray-300 bg-white shadow-xs" />
                      <span className="text-xs font-bold text-gray-200 truncate max-w-[130px]">
                        {game.white}
                      </span>
                      {game.whiteRating && (
                        <span className="text-[0.68rem] font-mono text-gray-400">({game.whiteRating})</span>
                      )}
                    </div>

                    {/* Middle Column Label */}
                    <div className="col-span-4 flex items-center justify-center">
                      <span className="text-[0.68rem] font-bold uppercase tracking-widest text-gray-400">
                        Classification
                      </span>
                    </div>

                    {/* Black Player Column */}
                    <div className="col-span-4 flex items-center justify-start gap-2 pl-6 sm:pr-8">
                      <span className="h-2.5 w-2.5 rounded-full border border-gray-400 bg-stone-900 shadow-xs" />
                      <span className="text-xs font-bold text-gray-200 truncate max-w-[130px]">
                        {game.black}
                      </span>
                      {game.blackRating && (
                        <span className="text-[0.68rem] font-mono text-gray-400">({game.blackRating})</span>
                      )}
                    </div>
                  </div>

                  {/* Table Rows */}
                  <div className="divide-y divide-white/[0.04]">
                    {classificationOrder.map((cat) => {
                      const meta = CLASSIFICATION_META[cat];
                      const whiteCount = reviewResult.counts.white[cat];
                      const blackCount = reviewResult.counts.black[cat];

                      return (
                        <div
                          key={cat}
                          className="grid grid-cols-12 px-6 py-2.5 items-center hover:bg-white/[0.03] transition-colors text-xs font-semibold"
                        >
                          {/* White Count */}
                          <div className="col-span-4 flex items-center justify-end pr-6 sm:pr-8">
                            {whiteCount > 0 ? (
                              <span
                                className={`inline-flex items-center justify-center min-w-[32px] h-6 px-2 rounded-md font-mono text-xs font-bold tabular-nums border shadow-xs ${meta.badgeBg} ${meta.textColor}`}
                              >
                                {whiteCount}
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center min-w-[32px] h-6 px-2 text-gray-600 font-mono text-xs">
                                0
                              </span>
                            )}
                          </div>

                          {/* Classification Badge & Label (Fixed-width centered container for vertical alignment) */}
                          <div className="col-span-4 flex items-center justify-center">
                            <div className="flex items-center gap-3 w-36">
                              <div className="w-6 h-6 flex items-center justify-center shrink-0">
                                <ClassificationIcon classification={cat} size={22} />
                              </div>
                              <span className="text-xs font-semibold text-gray-200 tracking-wide">
                                {meta.label}
                              </span>
                            </div>
                          </div>

                          {/* Black Count */}
                          <div className="col-span-4 flex items-center justify-start pl-6 sm:pl-8">
                            {blackCount > 0 ? (
                              <span
                                className={`inline-flex items-center justify-center min-w-[32px] h-6 px-2 rounded-md font-mono text-xs font-bold tabular-nums border shadow-xs ${meta.badgeBg} ${meta.textColor}`}
                              >
                                {blackCount}
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center min-w-[32px] h-6 px-2 text-gray-600 font-mono text-xs">
                                0
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>


                {/* Primary CTA: Start Review */}
                <div className="max-w-3xl mx-auto pt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('review');
                      setCurrentPly(1);
                    }}
                    className="flex items-center gap-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold px-8 py-3.5 text-sm transition-transform active:scale-[0.98] cursor-pointer shadow-lg"
                  >
                    <Play className="h-4 w-4 fill-stone-950" />
                    <span>Start Review</span>
                  </button>
                </div>
              </div>
            ) : (
              /* =================================================================== */
              /* 2. MOVE-BY-MOVE REVIEW VIEW (SCREENSHOT 3 & 4)                      */
              /* =================================================================== */
              <div className="h-full grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden">
                {/* LEFT COLUMN: Chessboard & Stepper Controls (7 cols) */}
                <div className="lg:col-span-7 flex flex-col h-full border-r border-white/[0.08] bg-[#0E131E] p-4 sm:p-5 overflow-y-auto">
                  {/* Chessboard Container with Chess.com-style Vertical Eval Bar */}
                  <div className="flex gap-2.5 items-stretch justify-center max-w-[490px] mx-auto w-full">
                    {/* Vertical Eval Bar */}
                    <div className="relative w-6 sm:w-7 rounded-lg bg-[#262421] border border-white/10 overflow-hidden flex flex-col justify-end shrink-0 shadow-inner">
                      <div
                        className="w-full bg-[#EAE8E6] transition-all duration-300"
                        style={{ height: `${whiteBarHeight}%` }}
                      />
                      <div
                        className={`absolute left-0 right-0 text-[0.62rem] font-bold font-mono text-center select-none ${
                          whiteBarHeight > 50 ? 'bottom-1 text-[#262421]' : 'top-1 text-white'
                        }`}
                      >
                        {evalLabel}
                      </div>
                    </div>

                    {/* Board */}
                    <div className="flex-1 aspect-square relative max-w-[450px]">
                      <ChessBoard
                        fen={currentFen}
                        orientation={boardOrientation}
                        interactive={false}
                        lastMove={lastMoveHighlight}
                        arrows={arrows}
                      />

                      {/* Move quality badge on top left */}
                      {currentMove && (
                        <div className="absolute top-2 left-2 z-10 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-stone-950/90 backdrop-blur-md border border-white/10 text-xs font-bold shadow-xl">
                          <ClassificationIcon classification={currentMove.classification} size={18} />
                          <span className={CLASSIFICATION_META[currentMove.classification].textColor}>
                            {CLASSIFICATION_META[currentMove.classification].label} ({currentMove.san})
                          </span>
                          <span className="text-gray-400 font-normal text-[0.65rem] border-l border-white/20 pl-2 ml-0.5">
                            {currentMove.engineSource === 'lichess-server'
                              ? 'Lichess SF'
                              : currentMove.engineSource === 'lichess-cloud'
                                ? 'Cloud SF16'
                                : 'Local SF'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Advantage Line Graph with Scrubber Cursor */}
                  <div className="mt-4 px-2">
                    <div className="flex items-center justify-between text-[0.68rem] text-gray-400 mb-1">
                      <span>Advantage Timeline (Stockfish 16)</span>
                      <span className="font-mono text-gray-300">
                        Ply {currentPly} / {totalPlies}
                      </span>
                    </div>

                    <div
                      className="relative w-full h-10 bg-[#161D2C] rounded-lg border border-white/10 overflow-hidden cursor-pointer"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const clickX = e.clientX - rect.left;
                        const percentage = Math.max(0, Math.min(1, clickX / rect.width));
                        const targetPly = Math.round(percentage * totalPlies);
                        setCurrentPly(targetPly);
                      }}
                    >
                      {/* Zero center line */}
                      <div className="absolute top-1/2 left-0 right-0 h-px bg-white/20" />

                      {/* SVG Evaluation Trend Curve */}
                      <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                        <polyline
                          fill="none"
                          stroke="#F59E0B"
                          strokeWidth="1.5"
                          points={reviewResult.evalHistory
                            .map((val, idx) => {
                              const x = (idx / totalPlies) * 100;
                              const clamped = Math.max(-600, Math.min(600, val));
                              const y = 20 - (clamped / 600) * 18;
                              return `${x}%,${y}`;
                            })
                            .join(' ')}
                        />
                      </svg>

                      {/* Scrubber vertical line indicator */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-amber-400 pointer-events-none transition-all duration-75"
                        style={{
                          left: `${(currentPly / totalPlies) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Board Navigation Controls */}
                  <div className="mt-3 flex items-center justify-center gap-1.5 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentPly(0);
                        setShowBestMove(false);
                      }}
                      className="rounded-lg bg-white/5 p-2 text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                      title="First move (Home)"
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCurrentPly((p) => Math.max(0, p - 1));
                        setShowBestMove(false);
                      }}
                      className="rounded-lg bg-white/5 p-2 text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                      title="Previous move (Left arrow)"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="rounded-lg bg-amber-400 hover:bg-amber-300 p-2 text-stone-950 font-bold transition-colors cursor-pointer px-4"
                      title="Play / Pause walkthrough (Space)"
                    >
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-stone-950" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCurrentPly((p) => Math.min(totalPlies, p + 1));
                        setShowBestMove(false);
                      }}
                      className="rounded-lg bg-white/5 p-2 text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                      title="Next move (Right arrow)"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCurrentPly(totalPlies);
                        setShowBestMove(false);
                      }}
                      className="rounded-lg bg-white/5 p-2 text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                      title="Last move (End)"
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setBoardOrientation((o) => (o === 'white' ? 'black' : 'white'))
                      }
                      className="ml-2 rounded-lg bg-white/5 p-2 text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                      title="Flip board"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={jumpToNextKeyMove}
                      className="ml-1 rounded-lg bg-rose-500/15 border border-rose-500/30 px-2.5 py-1.5 text-rose-300 hover:bg-rose-500/25 transition-colors cursor-pointer text-xs font-semibold flex items-center gap-1.5"
                      title="Jump to next blunder, mistake or miss"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                      <span className="hidden sm:inline">Key Move</span>
                    </button>
                  </div>
                </div>

                {/* RIGHT COLUMN: Review Console, Coach Bubble, Action Buttons & Moves (5 cols) */}
                <div className="lg:col-span-5 flex flex-col h-full bg-[#121724] overflow-hidden">
                  {/* 1. Coach Speech Bubble at the Top */}
                  <div className="p-4 border-b border-white/[0.08] bg-[#161D2C] shrink-0 space-y-3">
                    {currentMove ? (
                      <>
                        {/* Classification Badge Tag & Eval Score */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <ClassificationIcon classification={currentMove.classification} size={22} />
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                                CLASSIFICATION_META[currentMove.classification].badgeBg
                              } ${CLASSIFICATION_META[currentMove.classification].textColor}`}
                            >
                              <span>
                                {currentMove.san} is {CLASSIFICATION_META[currentMove.classification].label}
                              </span>
                            </span>
                          </div>

                          {/* Centipawn Score */}
                          <span className="font-mono text-xs font-bold text-gray-300">
                            {currentMove.evalAfterCp >= 0
                              ? `+${(currentMove.evalAfterCp / 100).toFixed(2)}`
                              : `${(currentMove.evalAfterCp / 100).toFixed(2)}`}
                          </span>
                        </div>

                        {/* Coach Natural Explanation */}
                        <p className="text-xs text-gray-300 leading-relaxed font-normal">
                          {currentMove.comment}
                        </p>

                        {/* Expandable Deep Tactical Explanation */}
                        {showExplanation && (
                          <div className="mt-2 p-2.5 rounded-lg bg-white/5 text-[0.72rem] text-gray-300 border border-white/5 leading-normal">
                            {currentMove.tacticalExplanation}
                          </div>
                        )}

                        {/* Real Best Move Box when toggled */}
                        {showBestMove && currentMove.bestMove && (
                          <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 space-y-1">
                            <div className="flex items-center justify-between font-bold">
                              <span>Stockfish Recommendation:</span>
                              <span className="font-mono">{currentMove.bestMove.san}</span>
                            </div>
                            <p className="text-[0.7rem] text-emerald-200/80">
                              Playing {currentMove.bestMove.san} maintains the evaluation at{' '}
                              {currentMove.bestMove.evalCp >= 0 ? '+' : ''}
                              {(currentMove.bestMove.evalCp / 100).toFixed(2)}.
                            </p>
                          </div>
                        )}

                        {/* Action Buttons: Explain, Best, Next */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setShowExplanation(!showExplanation)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                              showExplanation
                                ? 'bg-amber-400 text-stone-950 border-amber-400 font-bold'
                                : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            <Lightbulb className="h-3.5 w-3.5" />
                            <span>Explain</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setShowBestMove(!showBestMove)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                              showBestMove
                                ? 'bg-emerald-500 text-stone-950 border-emerald-500 font-bold'
                                : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            <span>Best Move</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setCurrentPly((p) => Math.min(totalPlies, p + 1));
                              setShowBestMove(false);
                              if (soundEnabled) playMoveSound();
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold text-xs transition-colors cursor-pointer shadow-xs"
                          >
                            <span>Next</span>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Add to FSRS Training Queue for Mistakes / Blunders */}
                        {(currentMove.classification === 'blunder' ||
                          currentMove.classification === 'mistake') &&
                          onAddToTraining && (
                            <button
                              type="button"
                              onClick={() => {
                                const nodeId = fenToNodeId(currentMove.fenBefore);
                                onAddToTraining(nodeId);
                                alert('Position added to your FSRS review queue!');
                              }}
                              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-xs font-bold text-rose-300 hover:bg-rose-500/30 transition-colors cursor-pointer"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>Add this mistake to FSRS Training Queue</span>
                            </button>
                          )}
                      </>
                    ) : (
                      <div className="py-2 text-center text-xs text-gray-400">
                        Starting position. Click &quot;Next&quot; or press Right Arrow to begin move review.
                      </div>
                    )}
                  </div>

                  {/* 2. Moves Notation List (Full Game Scoresheet) */}
                  <div
                    ref={moveListRef}
                    className="flex-1 overflow-y-auto p-3 space-y-1 divide-y divide-white/[0.03]"
                  >
                    {Array.from({ length: Math.ceil(reviewResult.moves.length / 2) }).map(
                      (_, moveIdx) => {
                        const whiteMove = reviewResult.moves[moveIdx * 2];
                        const blackMove = reviewResult.moves[moveIdx * 2 + 1];
                        const moveNum = moveIdx + 1;

                        return (
                          <div
                            key={moveNum}
                            className="grid grid-cols-12 gap-1 py-1 text-xs items-center"
                          >
                            {/* Move number */}
                            <span className="col-span-2 text-gray-500 font-mono font-medium pl-1">
                              {moveNum}.
                            </span>

                            {/* White move */}
                            <div className="col-span-5">
                              {whiteMove && (
                                <button
                                  ref={currentPly === whiteMove.ply + 1 ? activeMoveButtonRef : null}
                                  type="button"
                                  onClick={() => {
                                    setCurrentPly(whiteMove.ply + 1);
                                    setShowBestMove(false);
                                    if (soundEnabled) playMoveSound();
                                  }}
                                  className={`w-full flex items-center justify-between px-2 py-1 rounded-md text-left transition-colors cursor-pointer ${
                                    currentPly === whiteMove.ply + 1
                                      ? 'bg-amber-400 text-stone-950 font-bold'
                                      : 'hover:bg-white/5 text-gray-200'
                                  }`}
                                >
                                  <span className="font-semibold">{whiteMove.san}</span>
                                  <ClassificationIcon classification={whiteMove.classification} size={15} />
                                </button>
                              )}
                            </div>

                            {/* Black move */}
                            <div className="col-span-5">
                              {blackMove && (
                                <button
                                  ref={currentPly === blackMove.ply + 1 ? activeMoveButtonRef : null}
                                  type="button"
                                  onClick={() => {
                                    setCurrentPly(blackMove.ply + 1);
                                    setShowBestMove(false);
                                    if (soundEnabled) playMoveSound();
                                  }}
                                  className={`w-full flex items-center justify-between px-2 py-1 rounded-md text-left transition-colors cursor-pointer ${
                                    currentPly === blackMove.ply + 1
                                      ? 'bg-amber-400 text-stone-950 font-bold'
                                      : 'hover:bg-white/5 text-gray-200'
                                  }`}
                                >
                                  <span className="font-semibold">{blackMove.san}</span>
                                  <ClassificationIcon classification={blackMove.classification} size={15} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="h-full flex items-center justify-center p-8 text-sm text-gray-400">
              Could not load analysis for this game.
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
