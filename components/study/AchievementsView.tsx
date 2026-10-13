'use client';

import React from 'react';
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

const ACHIEVEMENTS_DATA: Achievement[] = [
  {
    id: 'ach_pioneer',
    title: 'Grandmaster Atlas Pioneer',
    description: 'Create your first repertoire in Grandmaster Atlas.',
    icon: '🧭',
    unlocked: true,
    unlockedDate: 'Oct 04, 2026',
    progress: 100,
    progressText: 'Completed',
    rewardXp: 500,
  },
  {
    id: 'ach_fsrs_polymath',
    title: 'FSRS-6 Connoisseur',
    description: 'Complete 100 flashcard reviews using the adaptive spaced repetition algorithm.',
    icon: '🧠',
    unlocked: true,
    unlockedDate: 'Oct 05, 2026',
    progress: 100,
    progressText: '122 / 100 reviews',
    rewardXp: 750,
  },
  {
    id: 'ach_deviation_hunter',
    title: 'Deviation Hunter',
    description: 'Detect and review 10 deviations from your real games.',
    icon: '🎯',
    unlocked: false,
    progress: 80,
    progressText: '8 / 10 deviations',
    rewardXp: 800,
  },
  {
    id: 'ach_deep_prep',
    title: 'Deep Book Master',
    description: 'Extend a repertoire line to 14 or more half-moves.',
    icon: '📖',
    unlocked: true,
    unlockedDate: 'Oct 06, 2026',
    progress: 100,
    progressText: 'Reached Ply 16',
    rewardXp: 1000,
  },
  {
    id: 'ach_multi_platform',
    title: 'Cross-Platform Scout',
    description: 'Sync games from both Chess.com and Lichess accounts.',
    icon: '⚡',
    unlocked: true,
    unlockedDate: 'Oct 06, 2026',
    progress: 100,
    progressText: '2 accounts synced',
    rewardXp: 600,
  },
  {
    id: 'ach_streak_sentinel',
    title: 'Streak Sentinel',
    description: 'Maintain a daily training streak for 7 consecutive days.',
    icon: '🔥',
    unlocked: false,
    progress: 14,
    progressText: '1 / 7 days',
    rewardXp: 1200,
  },
  {
    id: 'ach_ironclad_retention',
    title: 'Ironclad Retention',
    description: 'Achieve 90%+ retrievability across 50 scheduled cards.',
    icon: '🛡️',
    unlocked: false,
    progress: 68,
    progressText: '34 / 50 cards',
    rewardXp: 1500,
  },
  {
    id: 'ach_grandmaster_dag',
    title: 'Transposition Sage',
    description: 'Convergence of 5 distinct move orders into the exact same transposition node.',
    icon: '🕸️',
    unlocked: true,
    unlockedDate: 'Oct 06, 2026',
    progress: 100,
    progressText: 'Completed',
    rewardXp: 900,
  },
];

export default function AchievementsView() {
  const unlockedCount = ACHIEVEMENTS_DATA.filter((a) => a.unlocked).length;
  const totalCount = ACHIEVEMENTS_DATA.length;
  const totalXpEarned = ACHIEVEMENTS_DATA.filter((a) => a.unlocked).reduce((sum, a) => sum + a.rewardXp, 0);

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
          {ACHIEVEMENTS_DATA.map((ach) => (
            <div
              key={ach.id}
              className={`rounded-2xl border p-5 transition-all flex flex-col justify-between ${
                ach.unlocked
                  ? 'border-white/[0.08] bg-[#111726] hover:border-amber-400/30 shadow-md'
                  : 'border-white/[0.04] bg-[#0E131F]/60 opacity-75'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5 border border-white/5 text-2xl shadow-xs">
                      {ach.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">{ach.title}</h3>
                        {ach.unlocked && (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                        {ach.description}
                      </p>
                    </div>
                  </div>

                  <span className="shrink-0 rounded-full bg-amber-400/10 px-2 py-0.5 text-[0.65rem] font-bold text-amber-300 border border-amber-400/20 font-mono">
                    +{ach.rewardXp} XP
                  </span>
                </div>
              </div>

              {/* Progress and status */}
              <div className="mt-4 pt-3 border-t border-white/5">
                <div className="flex items-center justify-between text-[0.7rem] text-gray-400 mb-1.5 font-medium">
                  <span>{ach.progressText}</span>
                  {ach.unlocked && ach.unlockedDate && (
                    <span className="text-emerald-400 font-semibold">{ach.unlockedDate}</span>
                  )}
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      ach.unlocked ? 'bg-emerald-400' : 'bg-amber-400'
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
