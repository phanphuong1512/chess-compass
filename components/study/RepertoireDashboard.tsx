'use client';

import React, { useState, useMemo } from 'react';
import {
  Plus,
  Clock,
  RotateCcw,
  Sparkles,
  Library,
  Target,
  ChevronRight,
  BookOpen,
  Archive,
  Layers,
  Flame,
  Award,
  Check,
  X,
  AlertCircle,
  HelpCircle,
  ArrowRight,
} from 'lucide-react';
import type { Repertoire, FSRSCard, RepertoireEdge } from '@/types/chess';

interface RepertoireDashboardProps {
  repertoires: Repertoire[];
  allCards: FSRSCard[];
  allEdges: RepertoireEdge[];
  onSelectRepertoire: (id: string) => void;
  onOpenCreateModal: () => void;
  onOpenBuildFromGames?: () => void;
  onStartReview?: (repertoireId?: string) => void;
  onDrillMistakes?: () => void;
}

// Preset visual themes for covers matching ChessAtlas artwork
const COVER_THEMES: Record<string, { bg: string; symbol: string; badge?: string }> = {
  rep_vienna: {
    bg: 'bg-emerald-950/70 border-emerald-500/30 text-emerald-300',
    symbol: '♞',
    badge: 'Library',
  },
  rep_white_e4: {
    bg: 'bg-amber-950/70 border-amber-500/30 text-amber-300',
    symbol: '♚',
  },
  rep_black_sicilian: {
    bg: 'bg-slate-900 border-slate-700 text-slate-200',
    symbol: '♞',
    badge: '1 mistake',
  },
  default_white: {
    bg: 'bg-amber-950/70 border-amber-500/30 text-amber-300',
    symbol: '♙',
  },
  default_black: {
    bg: 'bg-slate-900 border-slate-700 text-slate-200',
    symbol: '♟',
  },
};

export default function RepertoireDashboard({
  repertoires,
  allCards,
  allEdges,
  onSelectRepertoire,
  onOpenCreateModal,
  onOpenBuildFromGames,
  onStartReview,
  onDrillMistakes,
}: RepertoireDashboardProps) {
  const [showArchived, setShowArchived] = useState(false);
  const [showGettingStarted, setShowGettingStarted] = useState(true);
  const [showEditorHelp, setShowEditorHelp] = useState(false);

  // Group repertoires by White and Black
  const whiteReps = useMemo(() => repertoires.filter((r) => r.color === 'white'), [repertoires]);
  const blackReps = useMemo(() => repertoires.filter((r) => r.color === 'black'), [repertoires]);

  // Telemetry computation
  const { totalDueCount, totalMistakesCount, totalLearnedCount, topDueRepertoire } = useMemo(() => {
    const due = allCards.filter((c) => c.dueDate <= Date.now() && c.reps > 0);
    const mistakes = allCards.filter((c) => c.lapses > 0);
    const learned = allCards.filter((c) => c.reps > 0);

    // Find repertoire with the most due cards
    const repDueMap = new Map<string, number>();
    for (const card of due) {
      const edge = allEdges.find((e) => e.toNodeId === card.nodeId);
      if (edge) {
        repDueMap.set(edge.repertoireId, (repDueMap.get(edge.repertoireId) || 0) + 1);
      }
    }

    let topRep: Repertoire | null = null;
    let maxDue = -1;
    for (const rep of repertoires) {
      const count = repDueMap.get(rep.id) || 0;
      if (count > maxDue) {
        maxDue = count;
        topRep = rep;
      }
    }

    return {
      totalDueCount: due.length,
      totalMistakesCount: mistakes.length,
      totalLearnedCount: learned.length,
      topDueRepertoire: topRep || repertoires[0] || null,
    };
  }, [allCards, allEdges, repertoires]);

  // Compute telemetry and stats for an individual repertoire
  const getRepTelemetry = (rep: Repertoire) => {
    const repEdges = allEdges.filter((e) => e.repertoireId === rep.id);
    const targetNodeIds = new Set(repEdges.map((e) => e.toNodeId));
    const repCards = allCards.filter((c) => targetNodeIds.has(c.nodeId));

    const totalLines = repEdges.length;
    const learnedCards = repCards.filter((c) => c.reps > 0);
    const dueCards = repCards.filter((c) => c.dueDate <= Date.now() && c.reps > 0);

    const progressPercent = totalLines > 0
      ? Math.min(100, Math.round((learnedCards.length / totalLines) * 100))
      : 0;

    // Real chapter count based on unique moves from root
    const rootEdges = repEdges.filter((e) => e.fromNodeId.includes('rnbqkbnr/pppppppp'));
    const chaptersCount = Math.max(rootEdges.length, 1);

    return {
      totalLines,
      learnedCount: learnedCards.length,
      dueCount: dueCards.length,
      progressPercent,
      chaptersCount,
    };
  };

  const renderCard = (rep: Repertoire) => {
    const stats = getRepTelemetry(rep);
    const theme =
      COVER_THEMES[rep.id] ||
      (rep.color === 'white' ? COVER_THEMES.default_white : COVER_THEMES.default_black);

    return (
      <div
        key={rep.id}
        onClick={() => onSelectRepertoire(rep.id)}
        className="group relative flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#121724] p-5 transition-colors duration-150 hover:border-amber-400/40 hover:bg-[#161F30] cursor-pointer"
      >
        <div>
          {/* Top Row: Thumbnail + Info */}
          <div className="flex gap-4 items-start mb-4">
            {/* Thumbnail Cover */}
            <div
              className={`relative h-14 w-14 shrink-0 rounded-xl border flex items-center justify-center font-bold text-2xl select-none ${theme.bg}`}
            >
              <span>{theme.symbol}</span>
            </div>

            {/* Title & Metadata */}
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                {rep.name}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5 truncate">
                {stats.chaptersCount} chapters · {stats.totalLines} lines
              </p>

              {/* Badges */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {theme.badge === 'Library' && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-400/10 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-300 border border-amber-400/20">
                    <Library className="h-3 w-3" /> Library
                  </span>
                )}
                {theme.badge === '1 mistake' && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-400 border border-amber-500/20">
                    <Target className="h-3 w-3" /> 1 mistake
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2 mt-4">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 transition-all duration-500"
                style={{ width: `${Math.max(stats.progressPercent, stats.learnedCount > 0 ? 12 : 0)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="mt-4 flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-white/[0.04]">
          <span className="font-medium text-gray-300">
            {stats.learnedCount > 0
              ? `${stats.learnedCount}/${stats.totalLines} learned`
              : `0/${stats.totalLines} learned`}
          </span>

          {stats.dueCount > 0 ? (
            <span className="flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[0.65rem] font-bold text-amber-300 border border-amber-400/30">
              <RotateCcw className="h-2.5 w-2.5" /> {stats.dueCount} due
            </span>
          ) : stats.learnedCount > 0 ? (
            <span className="flex items-center gap-1 text-[0.7rem] text-emerald-400 font-medium">
              <RotateCcw className="h-3 w-3" /> {stats.learnedCount}
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  // Weekday initials
  const weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const todayIndex = (new Date().getDay() + 6) % 7; // 0 = Mon, 6 = Sun

  return (
    <div className="w-full max-w-[1400px] mx-auto px-6 py-6 select-none space-y-6">
      {/* ========================================================================= */}
      {/* TOP ROW: TRAIN NOW + STREAK (MATCHING SCREENSHOT 1) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* CARD 1: TRAIN NOW (Wider card) */}
        <div className="lg:col-span-2 rounded-2xl border border-white/[0.08] bg-[#121724] p-6 flex flex-col justify-between relative overflow-hidden group">
          <div>
            <span className="text-[0.68rem] font-bold tracking-wider uppercase text-amber-400">
              TRAIN NOW
            </span>
            <h2 className="text-4xl font-extrabold text-white mt-1.5 tracking-tight tabular-nums">
              {totalDueCount} positions
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              ~{Math.max(1, Math.round(totalDueCount * 0.3))} min · From{' '}
              <span className="text-gray-300 font-medium">
                {topDueRepertoire?.name || 'My Repertoire'}
              </span>
            </p>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onStartReview?.(topDueRepertoire?.id)}
              className="flex items-center gap-2 rounded-xl bg-amber-400 hover:bg-amber-300 px-5 py-2.5 text-xs font-bold text-stone-950 transition-colors duration-150 active:scale-[0.98] cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Start review →</span>
            </button>
          </div>
        </div>

        {/* CARD 2: STREAK & DRILL MISTAKES (Stacked column) */}
        <div className="flex flex-col gap-3.5">
          {/* Top Subcard: Streak */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#121724] p-5">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[0.65rem] font-bold tracking-wider uppercase text-gray-400">
                  STREAK
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-2xl font-extrabold text-white tabular-nums">1</span>
                  <span className="text-xs text-gray-400">day</span>
                  <span className="text-[0.7rem] text-gray-500 ml-2">Best streak 1 day</span>
                </div>
              </div>

              {/* Fire Flame Icon */}
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/15 text-orange-400">
                <Flame className="h-5 w-5 fill-orange-400/30" />
              </div>
            </div>

            {/* Level 4 Progress Bar */}
            <div className="mt-2.5">
              <div className="flex justify-between text-[0.65rem] text-gray-400 mb-1">
                <span>Lv. 4</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 w-[65%]" />
              </div>
            </div>

            {/* Day of Week Circles */}
            <div className="mt-3 flex items-center justify-between">
              {weekDays.map((day, idx) => {
                const isToday = idx === todayIndex;
                const isChecked = idx <= todayIndex;
                return (
                  <div key={`${day}-${idx}`} className="flex flex-col items-center gap-1">
                    <span className="text-[0.6rem] font-semibold text-gray-500">{day}</span>
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-all ${
                        isToday && isChecked
                          ? 'bg-amber-400 text-black ring-2 ring-amber-400/40 shadow-xs'
                          : isChecked
                            ? 'bg-white/10 text-white'
                            : 'bg-white/5 text-gray-600'
                      }`}
                    >
                      {isChecked ? <Check className="h-3 w-3 stroke-[3]" /> : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-3 text-[0.68rem] text-gray-400 text-center font-medium">
              1 streak protection ready
            </p>
          </div>

          {/* Bottom Subcard: Drill Mistakes */}
          <button
            type="button"
            onClick={onDrillMistakes}
            className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-[#141B29]/90 p-4 px-5 backdrop-blur-md shadow-md hover:border-red-500/30 hover:bg-[#182032] transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 text-xs font-bold">
                🎯
              </div>
              <span className="text-xs font-bold tracking-wider uppercase text-rose-400 group-hover:text-rose-300 transition-colors">
                DRILL MISTAKES
              </span>
            </div>

            <div className="flex items-center gap-1 font-mono font-bold text-rose-400 text-sm">
              <span>{totalMistakesCount}</span>
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* GETTING STARTED CARD (MATCHING SCREENSHOT 1) */}
      {/* ========================================================================= */}
      {showGettingStarted && (
        <div className="rounded-2xl border border-white/[0.08] bg-[#141B29]/90 p-5 px-6 backdrop-blur-md shadow-xl relative">
          <button
            type="button"
            onClick={() => setShowGettingStarted(false)}
            className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors cursor-pointer"
            aria-label="Dismiss getting started"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="mb-3">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold text-white">Getting started</h3>
              <span className="text-xs text-gray-400">4 of 5 done</span>
            </div>

            {/* Green Progress Bar */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10 mt-2.5">
              <div className="h-full rounded-full bg-emerald-400 w-[80%]" />
            </div>
          </div>

          <div className="space-y-2 mt-4 text-xs">
            {/* Item 1 */}
            <div className="flex items-center gap-2.5 text-gray-300">
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <Check className="h-2.5 w-2.5 stroke-[3]" />
              </div>
              <span>Learn your first lines</span>
            </div>

            {/* Item 2 */}
            <div
              onClick={() => onStartReview?.(topDueRepertoire?.id)}
              className="flex items-center justify-between rounded-xl p-1.5 px-2 -mx-2 hover:bg-white/5 transition-colors cursor-pointer group text-amber-300"
            >
              <div className="flex items-start gap-2.5">
                <RotateCcw className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white group-hover:text-amber-300 transition-colors">
                    Come back for your first review
                  </span>
                  <p className="text-[0.7rem] text-gray-400">
                    {totalDueCount} reviews are due - doing just one is enough.
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>

            {/* Item 3 */}
            <div className="flex items-center gap-2.5 text-gray-300">
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <Check className="h-2.5 w-2.5 stroke-[3]" />
              </div>
              <span>Check your game mistakes</span>
            </div>

            {/* Item 4 */}
            <div className="flex items-center gap-2.5 text-gray-300">
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <Check className="h-2.5 w-2.5 stroke-[3]" />
              </div>
              <span>Drill your mistakes</span>
            </div>

            {/* Item 5 */}
            <div>
              <div
                onClick={() => setShowEditorHelp(!showEditorHelp)}
                className="flex items-center gap-2.5 text-gray-300 cursor-pointer hover:text-white transition-colors"
              >
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <Check className="h-2.5 w-2.5 stroke-[3]" />
                </div>
                <span>Try the editor</span>
              </div>
              <button
                type="button"
                onClick={() => setShowEditorHelp(!showEditorHelp)}
                className="ml-6.5 text-[0.68rem] text-gray-400 hover:text-white transition-colors cursor-pointer mt-0.5"
              >
                How the editor works ⌄
              </button>
              {showEditorHelp && (
                <p className="ml-6.5 mt-1 text-[0.7rem] text-gray-400 bg-white/5 p-2 rounded-lg border border-white/5">
                  Play moves on the board or in the Diagram Graph to add candidate lines, transpositions, and NAG strategic comments directly to your repertoire.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION HEADER: MY REPERTOIRE (MATCHING SCREENSHOT 1 & 2) */}
      {/* ========================================================================= */}
      <div className="pt-2">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {/* Mascot Icon: Penguin with scarf */}
            <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-700 via-sky-600 to-teal-500 shadow-xl border border-white/10 shrink-0">
              <span className="text-2xl select-none">🐧</span>
              <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 border-2 border-[#0B0F17]" />
            </div>

            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white">
                My Repertoire
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Your repertoires. Import a course from the library or build your own.
              </p>
            </div>
          </div>

          {/* Header Controls */}
          <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
            {/* Show archived toggle */}
            <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-400 hover:text-white transition-colors mr-1">
              <div
                onClick={() => setShowArchived(!showArchived)}
                className={`relative h-5 w-9 rounded-full transition-colors ${
                  showArchived ? 'bg-amber-400' : 'bg-white/10'
                }`}
              >
                <div
                  className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                    showArchived ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </div>
              <span className="text-xs">Show archived</span>
            </label>

            {/* Build from Games Button */}
            {onOpenBuildFromGames && (
              <button
                type="button"
                onClick={onOpenBuildFromGames}
                className="flex items-center gap-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 px-3.5 py-2 text-xs font-bold text-amber-300 transition-all shadow-md active:scale-[0.98] cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span>Build from games</span>
              </button>
            )}

            {/* New Repertoire Button */}
            <button
              type="button"
              onClick={onOpenCreateModal}
              className="flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 px-3.5 py-2 text-xs font-bold text-white transition-all shadow-md active:scale-[0.98] cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 text-amber-400" />
              <span>New repertoire</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* WHITE REPERTOIRES (SCREENSHOT 2) */}
        {/* ========================================================================= */}
        <div className="mb-8">
          <div className="mb-3.5 flex items-center gap-2">
            <span className="text-sm">♔</span>
            <h3 className="text-xs font-bold tracking-wider uppercase text-gray-300">
              White
            </h3>
            <span className="rounded-md bg-white/10 px-1.5 py-0.2 text-[0.65rem] font-bold text-gray-400 font-mono">
              {whiteReps.length}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {whiteReps.map((rep) => renderCard(rep))}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* BLACK REPERTOIRES (SCREENSHOT 2) */}
        {/* ========================================================================= */}
        <div>
          <div className="mb-3.5 flex items-center gap-2">
            <span className="text-sm">♚</span>
            <h3 className="text-xs font-bold tracking-wider uppercase text-gray-300">
              Black
            </h3>
            <span className="rounded-md bg-white/10 px-1.5 py-0.2 text-[0.65rem] font-bold text-gray-400 font-mono">
              {blackReps.length}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {blackReps.map((rep) => renderCard(rep))}
          </div>
        </div>
      </div>
    </div>
  );
}
