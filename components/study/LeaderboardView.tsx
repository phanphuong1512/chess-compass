'use client';

import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useAuth } from '@/lib/auth/useAuth';
import { Trophy, Flame, Crown, Medal, ArrowUp, ArrowDown, Sparkles } from 'lucide-react';

interface LeaderboardUser {
  rank: number;
  username: string;
  avatar: string;
  avatarUrl?: string;
  xp: number;
  streak: number;
  level: number;
  leagueZone: 'promote' | 'safe' | 'relegate';
  isCurrentUser?: boolean;
}

const PEER_PLAYERS: LeaderboardUser[] = [
  { rank: 1, username: 'GrandmasterFlow', avatar: '♔', xp: 14250, streak: 18, level: 8, leagueZone: 'promote' },
  { rank: 2, username: 'SicilianSlayer', avatar: '♘', xp: 12890, streak: 12, level: 7, leagueZone: 'promote' },
  { rank: 3, username: 'DeepStockfishWasm', avatar: '♖', xp: 11450, streak: 9, level: 6, leagueZone: 'promote' },
  { rank: 4, username: 'CaroKannKing', avatar: '♗', xp: 9800, streak: 14, level: 6, leagueZone: 'promote' },
  { rank: 5, username: 'EndgameOracle', avatar: '♕', xp: 8950, streak: 7, level: 5, leagueZone: 'promote' },
  { rank: 6, username: 'NimzoKnight', avatar: '♙', xp: 8200, streak: 5, level: 5, leagueZone: 'safe' },
  { rank: 7, username: 'TacticsNinja', avatar: '♘', xp: 7800, streak: 4, level: 5, leagueZone: 'safe' },
  { rank: 15, username: 'PawnPusher99', avatar: '♙', xp: 5400, streak: 2, level: 3, leagueZone: 'safe' },
  { rank: 28, username: 'BlunderCheck', avatar: '♟', xp: 2100, streak: 0, level: 2, leagueZone: 'relegate' },
  { rank: 29, username: 'RookLifter', avatar: '♖', xp: 1850, streak: 0, level: 2, leagueZone: 'relegate' },
  { rank: 30, username: 'CheckmateGhost', avatar: '♚', xp: 1200, streak: 0, level: 1, leagueZone: 'relegate' },
];

export default function LeaderboardView() {
  const { user } = useAuth();
  const reviewLogs = useLiveQuery(() => db.reviewLogs.toArray()) || [];
  const repertoires = useLiveQuery(() => db.repertoires.toArray()) || [];

  const currentUserData = useMemo(() => {
    let puzzleStreak = 0;
    if (typeof window !== 'undefined') {
      puzzleStreak = Number(localStorage.getItem('cc_puzzle_streak') || 0);
    }

    // Real XP: 25 XP per card reviewed + 100 XP per repertoire + 50 XP per puzzle streak
    const reviewXp = reviewLogs.length * 25;
    const repXp = repertoires.length * 100;
    const puzzleXp = puzzleStreak * 50;
    const totalXp = Math.max(150, reviewXp + repXp + puzzleXp);

    const level = Math.max(1, Math.floor(totalXp / 1000) + 1);
    const streak = Math.max(1, puzzleStreak || (reviewLogs.length > 0 ? 2 : 1));

    const username = user?.name || 'You (Guest)';
    const avatar = '🧭';
    const avatarUrl = user?.picture;

    return {
      rank: totalXp > 8000 ? 6 : totalXp > 5000 ? 14 : 18,
      username,
      avatar,
      avatarUrl,
      xp: totalXp,
      streak,
      level,
      leagueZone: (totalXp > 8500 ? 'promote' : 'safe') as 'promote' | 'safe' | 'relegate',
      isCurrentUser: true,
    };
  }, [user, reviewLogs, repertoires]);

  const leaderboardList = useMemo(() => {
    const list = [...PEER_PLAYERS, currentUserData];
    list.sort((a, b) => b.xp - a.xp);
    return list.map((item, index) => ({
      ...item,
      rank: index + 1,
    }));
  }, [currentUserData]);

  const userStanding = leaderboardList.find((u) => u.isCurrentUser) || currentUserData;

  return (
    <div className="w-full min-h-[calc(100vh-3.5rem)] bg-[#0B0F17] p-6 lg:p-8 space-y-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Banner */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-r from-indigo-900/40 via-purple-900/30 to-amber-900/30 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-black font-extrabold text-2xl shadow-lg">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[0.65rem] font-bold text-amber-300 border border-amber-400/30">
                  DIAMOND LEAGUE
                </span>
                <span className="text-xs text-gray-400">Weekly Season</span>
              </div>
              <h2 className="text-xl font-extrabold text-white mt-1">Community Leaderboard</h2>
              <p className="text-xs text-gray-400">
                Top 5 players promote to Master League based on actual study & training XP.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-[0.65rem] text-gray-400 block uppercase tracking-wider font-bold">Your Standing</span>
              <span className="text-lg font-black text-white font-mono">
                #{userStanding.rank} · {userStanding.xp.toLocaleString()} XP
              </span>
            </div>
          </div>
        </div>

        {/* Standings Table */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#111726] shadow-xl overflow-hidden">
          <div className="p-4 border-b border-white/5 flex items-center justify-between text-xs text-gray-400">
            <span className="font-bold uppercase tracking-wider text-[0.65rem]">Weekly Ranks</span>
            <div className="flex items-center gap-4 text-[0.7rem]">
              <span className="flex items-center gap-1 text-emerald-400">
                <ArrowUp className="h-3 w-3" /> Promotion Zone (Top 5)
              </span>
              <span className="flex items-center gap-1 text-rose-400">
                <ArrowDown className="h-3 w-3" /> Relegation Zone (Bottom 3)
              </span>
            </div>
          </div>

          <div className="divide-y divide-white/[0.04]">
            {leaderboardList.map((player) => {
              return (
                <div
                  key={`${player.username}-${player.rank}`}
                  className={`flex items-center justify-between p-4 transition-colors ${
                    player.isCurrentUser
                      ? 'bg-amber-400/10 border-l-4 border-amber-400'
                      : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {/* Rank badge */}
                    <div className="w-8 text-center font-mono font-bold text-sm">
                      {player.rank === 1 ? (
                        <span className="text-amber-400 text-base">🥇</span>
                      ) : player.rank === 2 ? (
                        <span className="text-gray-300 text-base">🥈</span>
                      ) : player.rank === 3 ? (
                        <span className="text-amber-600 text-base">🥉</span>
                      ) : (
                        <span className={player.isCurrentUser ? 'text-amber-300' : 'text-gray-400'}>
                          #{player.rank}
                        </span>
                      )}
                    </div>

                    {/* Avatar */}
                    {player.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={player.avatarUrl}
                        alt={player.username}
                        className="h-9 w-9 rounded-xl object-cover border border-amber-400/30"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white font-bold text-sm">
                        {player.avatar}
                      </div>
                    )}

                    {/* User info */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${player.isCurrentUser ? 'text-amber-300 font-extrabold' : 'text-white'}`}>
                          {player.username}
                        </span>
                        {player.isCurrentUser && (
                          <span className="rounded-full bg-amber-400/20 px-1.5 py-0.2 text-[0.6rem] font-bold text-amber-300">
                            YOU
                          </span>
                        )}
                      </div>
                      <span className="text-[0.68rem] text-gray-400 font-medium">
                        Level {player.level}
                      </span>
                    </div>
                  </div>

                  {/* XP & Streak */}
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-1 text-orange-400 text-xs font-bold font-mono">
                      <Flame className="h-3.5 w-3.5" />
                      <span>{player.streak}</span>
                    </div>

                    <div className="w-24 text-right font-mono font-bold text-sm text-white">
                      {player.xp.toLocaleString()} <span className="text-[0.65rem] text-gray-500">XP</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
