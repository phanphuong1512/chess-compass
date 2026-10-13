'use client';

import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { Award, Star, CheckCircle2, Lock, Flame, Sparkles, Compass } from 'lucide-react';

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedDate?: string;
  progress: number; // 0 to 100
  progressText: string;
  rewardXp: number;
}

export default function AchievementsView() {
  const repertoires = useLiveQuery(() => db.repertoires.toArray()) || [];
  const cards = useLiveQuery(() => db.cards.toArray()) || [];
  const reviewLogs = useLiveQuery(() => db.reviewLogs.toArray()) || [];
  const deviations = useLiveQuery(() => db.deviations.toArray()) || [];
  const edges = useLiveQuery(() => db.edges.toArray()) || [];
  const games = useLiveQuery(() => db.games.toArray()) || [];

  const achievements: Achievement[] = useMemo(() => {
    const repCount = repertoires.length;
    const revCount = reviewLogs.length;
    const devCount = deviations.length;
    const cardCount = cards.length;
    const edgeCount = edges.length;
    const gameCount = games.length;
    const masteredCount = cards.filter((c) => c.stability >= 5).length;

    return [
      {
        id: 'ach_pioneer',
        title: 'Chess Compass Pioneer',
        description: 'Create or import your first repertoire.',
        icon: '🧭',
        unlocked: repCount >= 1,
        progress: Math.min(100, Math.round((repCount / 1) * 100)),
        progressText: repCount >= 1 ? 'Completed' : `${repCount} / 1 repertoire`,
        rewardXp: 500,
      },
      {
        id: 'ach_fsrs_polymath',
        title: 'FSRS-6 Memory Master',
        description: 'Complete 25 flashcard reviews using spaced repetition.',
        icon: '🧠',
        unlocked: revCount >= 25,
        progress: Math.min(100, Math.round((revCount / 25) * 100)),
        progressText: `${revCount} / 25 reviews`,
        rewardXp: 750,
      },
      {
        id: 'ach_deviation_hunter',
        title: 'Deviation Hunter',
        description: 'Detect and inspect deviations from your real games.',
        icon: '🎯',
        unlocked: devCount >= 5,
        progress: Math.min(100, Math.round((devCount / 5) * 100)),
        progressText: `${devCount} / 5 deviations`,
        rewardXp: 800,
      },
      {
        id: 'ach_deep_prep',
        title: 'Deep Book Master',
        description: 'Build a repertoire tree with at least 15 move variations.',
        icon: '📖',
        unlocked: cardCount >= 15,
        progress: Math.min(100, Math.round((cardCount / 15) * 100)),
        progressText: `${cardCount} / 15 positions`,
        rewardXp: 1000,
      },
      {
        id: 'ach_multi_platform',
        title: 'Cross-Platform Scout',
        description: 'Import games from Chess.com, Lichess, or PGN files.',
        icon: '⚡',
        unlocked: gameCount >= 1,
        progress: Math.min(100, Math.round((gameCount / 5) * 100)),
        progressText: `${gameCount} / 5 games analyzed`,
        rewardXp: 600,
      },
      {
        id: 'ach_ironclad_retention',
        title: 'Ironclad Retention',
        description: 'Reach high memory stability across 5 positions.',
        icon: '🛡️',
        unlocked: masteredCount >= 5,
        progress: Math.min(100, Math.round((masteredCount / 5) * 100)),
        progressText: `${masteredCount} / 5 mastered positions`,
        rewardXp: 1500,
      },
      {
        id: 'ach_grandmaster_dag',
        title: 'Transposition Sage',
        description: 'Expand your repertoire DAG to at least 20 interconnected edges.',
        icon: '🕸️',
        unlocked: edgeCount >= 20,
        progress: Math.min(100, Math.round((edgeCount / 20) * 100)),
        progressText: `${edgeCount} / 20 graph moves`,
        rewardXp: 900,
      },
    ];
  }, [repertoires, cards, reviewLogs, deviations, edges, games]);

  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const totalCount = achievements.length;
  const totalXpEarned = achievements.filter((a) => a.unlocked).reduce((sum, a) => sum + a.rewardXp, 0);

  return (
    <div className="w-full min-h-[calc(100vh-3.5rem)] bg-[#0B0F17] p-6 lg:p-8 space-y-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Banner */}
        <div className="rounded-2xl border border-white/10 bg-[#111726] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/10 border border-amber-400/30 text-2xl shadow-inner">
              🏅
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-white">Your Achievements</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Milestones unlocked as you study, drill, and analyze your openings.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <span className="text-[0.65rem] text-gray-400 uppercase tracking-wider font-bold block">
                Progress
              </span>
              <span className="text-lg font-black text-white font-mono">
                {unlockedCount} / {totalCount}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[0.65rem] text-gray-400 uppercase tracking-wider font-bold block">
                Total XP Earned
              </span>
              <span className="text-lg font-black text-amber-400 font-mono">
                +{totalXpEarned.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Badges Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {achievements.map((ach) => (
            <div
              key={ach.id}
              className={`rounded-2xl border p-5 transition-all flex flex-col justify-between ${
                ach.unlocked
                  ? 'border-amber-400/20 bg-gradient-to-br from-[#161D2C] to-[#121824] shadow-lg shadow-amber-400/5'
                  : 'border-white/5 bg-[#0E131F]/50 opacity-75'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-md ${
                      ach.unlocked
                        ? 'bg-amber-400/15 border border-amber-400/30'
                        : 'bg-white/5 border border-white/5 grayscale'
                    }`}
                  >
                    {ach.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">{ach.title}</h3>
                      {ach.unlocked ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[0.65rem] font-bold text-emerald-400 border border-emerald-400/20">
                          <CheckCircle2 className="h-3 w-3" /> Unlocked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-white/5 px-2 py-0.5 text-[0.65rem] font-bold text-gray-400 border border-white/5">
                          <Lock className="h-2.5 w-2.5" /> Locked
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                      {ach.description}
                    </p>
                  </div>
                </div>

                <span className="text-xs font-mono font-bold text-amber-400 shrink-0">
                  +{ach.rewardXp} XP
                </span>
              </div>

              {/* Progress bar */}
              <div className="mt-4 pt-3 border-t border-white/5">
                <div className="flex items-center justify-between text-[0.7rem] text-gray-400 mb-1.5 font-medium">
                  <span>Progress</span>
                  <span className="font-mono text-gray-300">{ach.progressText}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      ach.unlocked
                        ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                        : 'bg-white/20'
                    }`}
                    style={{ width: `${ach.progress}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
