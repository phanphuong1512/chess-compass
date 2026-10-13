'use client';

import React from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Swords,
  Puzzle,
  BarChart2,
  Compass,
  Library as LibraryIcon,
  Trophy,
  Award,
  Crown,
  Flame,
  ChevronDown,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/useAuth';

export type StudyNavTab =
  | 'repertoire'
  | 'games'
  | 'puzzles'
  | 'statistics'
  | 'explorer'
  | 'library'
  | 'leaderboard'
  | 'achievements';

interface StudySidebarProps {
  activeTab: StudyNavTab;
  onSelectTab: (tab: StudyNavTab) => void;
  learnedVariationsCount?: number;
  totalVariationsCap?: number;
  className?: string;
  onCloseMobile?: () => void;
}

export default function StudySidebar({
  activeTab,
  onSelectTab,
  learnedVariationsCount = 122,
  totalVariationsCap = 200,
  className = '',
  onCloseMobile,
}: StudySidebarProps) {
  const { user, isLoading, loginWithGoogle, logout } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);

  const learningItems: Array<{ id: StudyNavTab; label: string; icon: React.ReactNode }> = [
    { id: 'repertoire', label: 'My Repertoire', icon: <BookOpen className="h-4 w-4" /> },
    { id: 'games', label: 'Games', icon: <Swords className="h-4 w-4" /> },
    { id: 'puzzles', label: 'Puzzles', icon: <Puzzle className="h-4 w-4" /> },
    { id: 'statistics', label: 'Statistics', icon: <BarChart2 className="h-4 w-4" /> },
    { id: 'explorer', label: 'Explorer', icon: <Compass className="h-4 w-4" /> },
    { id: 'library', label: 'Library', icon: <LibraryIcon className="h-4 w-4" /> },
  ];

  const communityItems: Array<{ id: StudyNavTab; label: string; icon: React.ReactNode }> = [
    { id: 'leaderboard', label: 'Leaderboard', icon: <Trophy className="h-4 w-4" /> },
    { id: 'achievements', label: 'Achievements', icon: <Award className="h-4 w-4" /> },
  ];

  const progressPercent = Math.min(
    100,
    Math.round((learnedVariationsCount / Math.max(totalVariationsCap, 1)) * 100)
  );

  return (
    <aside className={`w-[240px] shrink-0 border-r border-white/[0.08] bg-[#0E131F] flex flex-col justify-between h-full select-none ${className}`}>
      <div>
        {/* Brand / Logo */}
        <div className="p-4 pt-5 pb-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group cursor-pointer">
            {/* Golden Compass / Knight Icon */}
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 text-[#0B0F17] shadow-md group-hover:scale-105 transition-transform font-bold text-lg">
              🧭
            </div>
            <span className="text-lg font-extrabold tracking-tight text-white group-hover:text-amber-300 transition-colors">
              Chess Compass
            </span>
          </Link>

          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="md:hidden flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-gray-400 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        {/* LEARNING Section */}
        <div className="px-3 py-2">
          <span className="block px-3 text-[0.65rem] font-bold tracking-wider uppercase text-gray-500 mb-1.5">
            LEARNING
          </span>
          <nav className="space-y-0.5">
            {learningItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectTab(item.id);
                    onCloseMobile?.();
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white/10 text-white shadow-xs font-bold'
                      : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                  }`}
                >
                  <span className={isActive ? 'text-amber-400' : 'text-gray-400'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* COMMUNITY Section */}
        <div className="px-3 py-2 mt-2">
          <span className="block px-3 text-[0.65rem] font-bold tracking-wider uppercase text-gray-500 mb-1.5">
            COMMUNITY
          </span>
          <nav className="space-y-0.5">
            {communityItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectTab(item.id);
                    onCloseMobile?.();
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white/10 text-white shadow-xs font-bold'
                      : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                  }`}
                >
                  <span className={isActive ? 'text-amber-400' : 'text-gray-400'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom Footer Section */}
      <div className="p-3 border-t border-white/[0.06] space-y-3">
        {/* Variations Counter Meter */}
        <div className="rounded-xl bg-white/5 p-2.5 border border-white/5">
          <div className="flex items-center justify-between text-[0.68rem] text-gray-400 mb-1.5 font-medium">
            <span className="flex items-center gap-1">
              <span className="text-amber-400">⚡</span> Variations
            </span>
            <span className="font-mono text-gray-300">
              {learnedVariationsCount} / {totalVariationsCap}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Unlimited with Premium Button */}
        <button
          type="button"
          onClick={() => {}}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 px-3 py-2 text-xs font-bold text-[#0B0F17] shadow-md hover:from-amber-300 hover:to-yellow-400 transition-all cursor-pointer active:scale-[0.98]"
        >
          <Crown className="h-3.5 w-3.5" />
          <span>Unlimited with Premium</span>
        </button>

        {/* User Auth Section */}
        {!user ? (
          <button
            type="button"
            onClick={loginWithGoogle}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white text-gray-900 px-3 py-2.5 text-xs font-bold shadow-md hover:bg-gray-100 transition-all cursor-pointer active:scale-[0.98]"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Sign in with Google</span>
          </button>
        ) : (
          <div className="relative">
            <div
              onClick={() => setUserMenuOpen((prev) => !prev)}
              className="flex items-center justify-between rounded-xl bg-white/5 p-2 border border-white/5 hover:bg-white/10 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {user.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.picture}
                    alt={user.name}
                    className="h-7 w-7 rounded-full object-cover border border-amber-400/30 shrink-0"
                  />
                ) : (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 font-bold text-xs text-black">
                    {(user.name || user.email)[0].toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white truncate max-w-[90px]">
                      {user.name}
                    </span>
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/20 px-1.5 py-0.2 text-[0.6rem] font-bold text-orange-400 border border-orange-500/30">
                      <Flame className="h-2.5 w-2.5" /> 1
                    </span>
                  </div>
                  <p className="text-[0.65rem] text-emerald-400 font-medium truncate max-w-[110px]">
                    {user.email}
                  </p>
                </div>
              </div>
              <ChevronDown className={`h-3.5 w-3.5 text-gray-400 shrink-0 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
            </div>

            {/* Dropdown Menu */}
            {userMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-white/10 bg-[#161D2C] p-1.5 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in slide-in-from-bottom-2">
                <div className="px-2.5 py-1.5 border-b border-white/5 mb-1">
                  <p className="text-xs font-bold text-white truncate">{user.name}</p>
                  <p className="text-[0.65rem] text-gray-400 truncate">{user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
