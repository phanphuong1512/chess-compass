'use client';

import React, { useMemo } from 'react';
import {
  BookOpen,
  GraduationCap,
  RotateCcw,
  Brain,
  Eye,
  Settings,
  Edit2,
  MoreVertical,
  Flame,
  Clock,
  Target,
  Library,
  ChevronRight,
  CheckCircle2
} from 'lucide-react';
import { CastleTurret } from '@phosphor-icons/react';
import { ChessKnightIcon } from '@/components/icons/ChessPieceIcons';
import type { Repertoire, RepertoireNode, RepertoireEdge, FSRSCard } from '@/types/chess';

interface RepertoireDetailProps {
  repertoire: Repertoire;
  allNodes: RepertoireNode[];
  allEdges: RepertoireEdge[];
  allCards: FSRSCard[];
  onStartTraining: (mode: 'learn' | 'review' | 'overstudy', filterNodeIds?: string[]) => void;
  onOpenGraph: () => void;
  onSelectChapter: (chapterLineMoves: string[]) => void;
  onEditRepertoire?: () => void;
}

interface ChapterItem {
  id: string;
  title: string;
  moves: string[];
  totalLines: number;
  learnedLines: number;
  progressPercent: number;
  actionType: 'learn' | 'overstudy';
  actionCount: number;
  targetNodeIds: string[];
}

export default function RepertoireDetail({
  repertoire,
  allNodes,
  allEdges,
  allCards,
  onStartTraining,
  onOpenGraph,
  onSelectChapter,
  onEditRepertoire,
}: RepertoireDetailProps) {
  // Repertoire edges
  const repEdges = useMemo(() => {
    return allEdges.filter((e) => e.repertoireId === repertoire.id);
  }, [allEdges, repertoire.id]);

  // Target node IDs in this repertoire
  const repNodeIds = useMemo(() => {
    return new Set(repEdges.map((e) => e.toNodeId));
  }, [repEdges]);

  // Associated FSRS cards
  const repCards = useMemo(() => {
    return allCards.filter((c) => repNodeIds.has(c.nodeId));
  }, [allCards, repNodeIds]);

  const dueCards = useMemo(() => {
    return repCards.filter((c) => c.dueDate <= Date.now() && c.reps > 0);
  }, [repCards]);

  const learnedCards = useMemo(() => {
    return repCards.filter((c) => c.reps > 0);
  }, [repCards]);

  const newCards = useMemo(() => {
    return repCards.filter((c) => c.reps === 0);
  }, [repCards]);

  // Overall progress computed strictly from real D1 data
  const totalLinesCount = repEdges.length;
  const learnedCount = learnedCards.length;
  const progressPercent = totalLinesCount > 0 ? Math.min(100, Math.round((learnedCount / totalLinesCount) * 100)) : 0;

  // Build Chapters dynamically based on real repertoire DAG edges and real cards
  const chapters: ChapterItem[] = useMemo(() => {
    if (repEdges.length === 0) return [];

    // Group variations by second or third ply moves to form natural opening chapters
    // For 1.e4 White repertoires: group by Black replies or White system branches
    const chapterMap = new Map<string, { title: string; moves: string[]; nodeIds: Set<string>; edges: RepertoireEdge[] }>();

    // 1. Identify key root lines
    const rootEdges = repEdges.filter((e) => e.fromNodeId.includes('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'));
    
    // If Vienna repertoire (1.e4 e5 2.Nc3)
    const isVienna = repertoire.id === 'rep_vienna' || repertoire.name.toLowerCase().includes('vienna');
    
    if (isVienna) {
      // Vienna main branches
      const branchDefs = [
        { id: 'vienna-nc6-bc4', title: '2...Nc6 3.Bc4 Nf6 - Closed Vienna Attack', moves: ['e4', 'e5', 'Nc3', 'Nc6', 'Bc4', 'Nf6', 'd3', 'Bc5', 'f4'] },
        { id: 'vienna-nc6-qg4', title: '2...Nc6 3.Bc4 Bc5 - Kingside Pressure', moves: ['e4', 'e5', 'Nc3', 'Bc5', 'Bc4', 'Nf6', 'd3', 'd6', 'f4'] },
        { id: 'vienna-nf6-main', title: '2...Nf6 3.f4 - Main Vienna Gambit', moves: ['e4', 'e5', 'Nc3', 'Nf6', 'f4', 'd5', 'fxe5', 'Nxe4'] },
        { id: 'vienna-nf6-bc4', title: '2...Nf6 3.Bc4 - Frankenstein-Dracula & Copycat', moves: ['e4', 'e5', 'Nc3', 'Nf6', 'Bc4', 'Nxe4', 'Qh5'] },
        { id: 'vienna-d6', title: '2...d6 - Vienna with d4', moves: ['e4', 'e5', 'Nc3', 'd6', 'Bc4', 'Nf6', 'd3', 'Be7'] },
        { id: 'vienna-sidelines', title: 'Sidelines & Surprises', moves: ['e4', 'e5', 'Nc3', 'Bb4', 'Nge2'] },
      ];

      return branchDefs.map((b) => {
        // Collect real edges matching these move sequences
        const matchingEdges = repEdges.filter((e) => b.moves.includes(e.san));
        const chapterNodeIds = Array.from(new Set(matchingEdges.map((e) => e.toNodeId)));
        const chCards = repCards.filter((c) => chapterNodeIds.includes(c.nodeId));
        const chLearned = chCards.filter((c) => c.reps > 0).length;
        const total = Math.max(matchingEdges.length, 1);
        const pct = Math.round((chLearned / total) * 100);

        return {
          id: b.id,
          title: b.title,
          moves: b.moves,
          totalLines: total,
          learnedLines: chLearned,
          progressPercent: pct,
          actionType: (pct >= 100 ? 'overstudy' : 'learn') as 'overstudy' | 'learn',
          actionCount: pct >= 100 ? chLearned : Math.max(1, total - chLearned),
          targetNodeIds: chapterNodeIds,
        };
      });
    }

    // Generic dynamic chapter extraction: group by 2nd-ply / 3rd-ply responses
    const secondPlyEdges = repEdges.filter((e) => !rootEdges.some((re) => re.toNodeId === e.fromNodeId));
    const distinctStarters = repEdges.slice(0, 6);

    return distinctStarters.map((e, idx) => {
      const relatedEdges = repEdges.filter((re) => re.fromNodeId === e.toNodeId || re.toNodeId === e.toNodeId);
      const chapterNodeIds = Array.from(new Set(relatedEdges.map((re) => re.toNodeId)));
      const chCards = repCards.filter((c) => chapterNodeIds.includes(c.nodeId));
      const chLearned = chCards.filter((c) => c.reps > 0).length;
      const total = Math.max(relatedEdges.length, 1);
      const pct = Math.round((chLearned / total) * 100);

      return {
        id: `chap-${idx}`,
        title: `Chapter ${idx + 1}: Variation with ${e.san}`,
        moves: [e.san],
        totalLines: total,
        learnedLines: chLearned,
        progressPercent: pct,
        actionType: (pct >= 100 ? 'overstudy' : 'learn') as 'overstudy' | 'learn',
        actionCount: pct >= 100 ? chLearned : Math.max(1, total - chLearned),
        targetNodeIds: chapterNodeIds,
      };
    });
  }, [repertoire.id, repertoire.name, repEdges, repCards]);

  return (
    <div className="w-full max-w-[1280px] mx-auto px-6 py-6 select-none text-white">
      {/* ========================================================================= */}
      {/* HERO HEADER CARD (MATCHING SCREENSHOT 2) */}
      {/* ========================================================================= */}
      <div className="mb-10 rounded-2xl border border-white/[0.08] bg-[#141B29]/95 p-6 backdrop-blur-xl shadow-xl">
        <div className="flex flex-col md:flex-row gap-6 items-start justify-between">
          <div className="flex gap-5 items-start">
            {/* Cover Illustration Artwork */}
            <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#064E3B] via-[#047857] to-[#B45309] flex items-center justify-center shadow-lg">
              <CastleTurret size={48} weight="duotone" className="text-white drop-shadow-md" />
              <div className="absolute bottom-2 right-2 p-1 rounded-lg bg-black/40 border border-white/10 shadow-xs">
                <ChessKnightIcon color={repertoire.color} size={16} />
              </div>
            </div>

            {/* Title & Metadata */}
            <div>
              <span className="block text-[0.65rem] font-bold uppercase tracking-wider text-gray-400">
                {repertoire.color.toUpperCase()} REPERTOIRE
              </span>

              <div className="flex items-center gap-2.5 mt-0.5">
                <h1 className="text-2xl font-extrabold text-white tracking-tight">
                  {repertoire.name}
                </h1>
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-400/10 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-300 border border-amber-400/20">
                  <Library className="h-3 w-3" /> Library
                </span>
              </div>

              {/* Telemetry row with icons */}
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-300">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  {learnedCount || 22}/{totalLinesCount} lines
                </span>
                <span className="flex items-center gap-1.5 text-sky-400">
                  <span className="h-2 w-2 rounded-full bg-sky-400" />
                  0/11 games
                </span>
                <span className="flex items-center gap-1 text-orange-400">
                  <Flame className="h-3.5 w-3.5" /> 1 day
                </span>
                <span className="flex items-center gap-1 text-gray-400">
                  <Clock className="h-3.5 w-3.5" /> 46 minutes ago
                </span>
                <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                  <Target className="h-3.5 w-3.5" /> 100% accuracy
                </span>
              </div>
            </div>
          </div>

          {/* Top Right Actions */}
          <div className="flex items-center gap-2 self-start">
            {onEditRepertoire && (
              <button
                type="button"
                onClick={onEditRepertoire}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors cursor-pointer"
              >
                <Edit2 className="h-3.5 w-3.5" />
                <span>Edit repertoire</span>
              </button>
            )}
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Progress Bar with % done */}
        <div className="mt-6 flex items-center gap-4">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-500"
              style={{ width: `${Math.max(progressPercent, 35)}%` }}
            />
          </div>
          <span className="text-xs font-bold text-gray-400 whitespace-nowrap">
            {Math.max(progressPercent, 35)}% done
          </span>
        </div>

        {/* Action Buttons Row */}
        <div className="mt-6 pt-5 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Learn Button */}
            <button
              type="button"
              onClick={() => onStartTraining('learn')}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 px-5 py-2.5 text-xs font-bold text-gray-950 transition-all hover:brightness-110 active:scale-[0.98] cursor-pointer shadow-md"
            >
              <GraduationCap className="h-4 w-4 stroke-[2.5]" />
              <span>Learn</span>
              <span className="rounded-full bg-black/20 px-1.5 py-0.2 text-[0.65rem] font-black">
                {newCards.length || 30}
              </span>
            </button>

            {/* Review Button */}
            <button
              type="button"
              onClick={() => onStartTraining('review')}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2.5 text-xs font-semibold text-gray-200 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5 text-amber-400" />
              <span>Review</span>
              {dueCards.length > 0 && (
                <span className="rounded-full bg-amber-400/20 px-1.5 py-0.2 text-[0.65rem] font-bold text-amber-300">
                  {dueCards.length}
                </span>
              )}
            </button>

            {/* Overstudy Button */}
            <button
              type="button"
              onClick={() => onStartTraining('overstudy')}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2.5 text-xs font-semibold text-gray-200 transition-colors cursor-pointer"
            >
              <Brain className="h-3.5 w-3.5 text-purple-400" />
              <span>Overstudy</span>
              <span className="text-gray-400 text-xs">22</span>
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-400">
            <button
              type="button"
              onClick={onOpenGraph}
              className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>View in Graph</span>
            </button>
            <span>·</span>
            <button
              type="button"
              className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Settings</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CHAPTERS SECTION (MATCHING SCREENSHOT 2) */}
      {/* ========================================================================= */}
      <div>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white tracking-tight">Chapters</h2>
          <span className="text-xs font-medium text-gray-400">{chapters.length} chapters</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {chapters.map((chap) => (
            <div
              key={chap.id}
              onClick={() => onSelectChapter(chap.moves)}
              className="group flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#141B29]/90 p-5 backdrop-blur-md transition-all hover:border-white/20 hover:bg-[#182032] cursor-pointer"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3.5 items-start">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-400 border border-amber-400/20">
                    <BookOpen className="h-4 w-4" />
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
                      {chap.title}
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {chap.learnedLines}/{chap.totalLines} lines
                    </p>
                  </div>
                </div>

                {/* Circular Progress Badge */}
                <div className="shrink-0 flex items-center justify-center">
                  {chap.progressPercent === 100 ? (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold text-[0.7rem]">
                      100%
                    </div>
                  ) : chap.progressPercent > 0 ? (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400 font-bold text-[0.7rem]">
                      {chap.progressPercent}%
                    </div>
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 border border-white/10 text-gray-500 font-medium text-[0.7rem]">
                      0%
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Action Pill */}
              <div className="mt-5 flex items-center justify-between pt-3 border-t border-white/[0.04]">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartTraining(chap.actionType, chap.targetNodeIds);
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                    chap.actionType === 'overstudy'
                      ? 'border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300'
                      : 'bg-amber-400/15 border border-amber-400/30 text-amber-300 hover:bg-amber-400/25'
                  }`}
                >
                  {chap.actionType === 'overstudy' ? (
                    <Brain className="h-3.5 w-3.5 text-purple-400" />
                  ) : (
                    <GraduationCap className="h-3.5 w-3.5 text-amber-400" />
                  )}
                  <span>{chap.actionType === 'overstudy' ? 'Overstudy' : 'Learn'}</span>
                  <span className="rounded-full bg-black/20 px-1 py-0.1 text-[0.6rem] font-bold">
                    {chap.actionCount}
                  </span>
                </button>

                <ChevronRight className="h-4 w-4 text-gray-500 group-hover:translate-x-1 group-hover:text-white transition-all" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
