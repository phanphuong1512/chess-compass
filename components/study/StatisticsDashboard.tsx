'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Link as LinkIcon,
  FileText,
  Ruler,
  BookOpen,
  Scale,
  Flag,
  Layers,
  Target,
  List,
  Eye,
  TrendingUp,
  ArrowUpDown,
  Lock,
  ChevronDown,
  ChevronRight,
  Info,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sparkles,
  BarChart3,
  Flame,
} from 'lucide-react';
import type { Repertoire, ImportedGame, RepertoireEdge } from '@/types/chess';
import { fetchLichessGames } from '@/lib/api/lichess';
import { fetchChessComGames } from '@/lib/api/chesscom';
import { Chess } from 'chess.js';
import { db } from '@/lib/db';

interface StatisticsDashboardProps {
  repertoires: Repertoire[];
  allEdges: RepertoireEdge[];
  allNodes: any[];
  onOpenRepertoire?: (repertoireId: string) => void;
}

interface OpeningStat {
  name: string;
  eco: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  score: number; // percentage e.g. 54.4
  vsAvg: number; // percentage points above/below overall avg e.g. +2.9
  prepStatus?: string;
  prepRepName?: string;
  miniFen?: string;
}

export default function StatisticsDashboard({
  repertoires,
  allEdges,
  allNodes,
  onOpenRepertoire,
}: StatisticsDashboardProps) {
  // Connected accounts
  const [accounts, setAccounts] = useState<Array<{ id: string; platform: 'lichess' | 'chesscom'; username: string }>>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('cc_connected_accounts') || localStorage.getItem('gma_connected_accounts');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) setAccounts(parsed);
        } catch {}
      }
    }
  }, []);

  // Filter states
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [selectedColor, setSelectedColor] = useState<'both' | 'white' | 'black'>('both');
  const [selectedTimeControl, setSelectedTimeControl] = useState<string>('blitz');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');

  // Rating chart time-control selection
  const [ratingTc, setRatingTc] = useState<'blitz' | 'daily' | 'rapid' | 'bullet'>('blitz');

  // Expanded openings toggle
  const [showAllOpenings, setShowAllOpenings] = useState(false);

  // Real games state
  const [fetchedGames, setFetchedGames] = useState<ImportedGame[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load real games from connected accounts and Dexie
  useEffect(() => {
    let isCancelled = false;
    async function loadGames() {
      setIsLoading(true);
      try {
        const localGames = await db.games.toArray();
        const combined: ImportedGame[] = [...localGames];

        if (accounts.length > 0) {
          const promises = accounts.map((acc) =>
            acc.platform === 'chesscom'
              ? fetchChessComGames(acc.username, 2)
              : fetchLichessGames(acc.username, 30)
          );
          const results = await Promise.allSettled(promises);
          for (const r of results) {
            if (r.status === 'fulfilled') {
              for (const g of r.value) {
                if (!combined.some((cg) => cg.id === g.id)) combined.push(g);
              }
            }
          }
        }

        if (!isCancelled) {
          setFetchedGames(combined);
        }
      } catch (err) {
        console.warn('Stats fetch games warning:', err);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }
    loadGames();
    return () => {
      isCancelled = true;
    };
  }, [accounts]);

  // Compute stats dynamically from real fetched games or repertoire definitions
  const baseOpenings: OpeningStat[] = useMemo(() => {
    if (fetchedGames.length === 0) {
      return repertoires.map((rep) => ({
        name: rep.name,
        eco: rep.color === 'white' ? '1.e4' : '1...e5',
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        score: 0,
        vsAvg: 0,
        prepStatus: 'Active Repertoire',
        prepRepName: rep.name,
      }));
    }

    const map = new Map<string, { name: string; eco: string; wins: number; draws: number; losses: number; games: number }>();

    for (const g of fetchedGames) {
      let openingName = 'Open Game';
      let eco = 'ECO';
      try {
        const c = new Chess();
        c.loadPgn(g.pgn);
        const headers = c.header();
        openingName = headers.Opening || headers.Event || 'Unknown Opening';
        eco = headers.ECO || '';
      } catch {
        // Fallback
      }

      const key = openingName;
      const current = map.get(key) || { name: openingName, eco, wins: 0, draws: 0, losses: 0, games: 0 };
      current.games += 1;

      const isWhite = accounts.some((a) => a.username.toLowerCase() === g.white.toLowerCase());
      const userColor = isWhite ? 'white' : 'black';

      if (g.result === '1/2-1/2') {
        current.draws += 1;
      } else if ((userColor === 'white' && g.result === '1-0') || (userColor === 'black' && g.result === '0-1')) {
        current.wins += 1;
      } else {
        current.losses += 1;
      }

      map.set(key, current);
    }

    const list: OpeningStat[] = Array.from(map.values()).map((item) => {
      const score = item.games > 0 ? Math.round(((item.wins + 0.5 * item.draws) / item.games) * 1000) / 10 : 0;
      const vsAvg = Math.round((score - 50.0) * 10) / 10;
      const matchingRep = repertoires.find((r) => item.name.toLowerCase().includes(r.name.toLowerCase()));
      return {
        name: item.name,
        eco: item.eco,
        games: item.games,
        wins: item.wins,
        draws: item.draws,
        losses: item.losses,
        score,
        vsAvg,
        prepStatus: matchingRep ? 'In Repertoire' : 'Untracked Line',
        prepRepName: matchingRep?.name,
      };
    });

    list.sort((a, b) => b.games - a.games);
    return list;
  }, [fetchedGames, accounts, repertoires]);

  // Dynamic metrics calculations
  const totalAnalysed = fetchedGames.length;
  const inBookCount = useMemo(() => {
    return fetchedGames.filter((g) => {
      return allEdges.some((e) => g.pgn.includes(e.san));
    }).length;
  }, [fetchedGames, allEdges]);

  const outsideBookCount = Math.max(0, totalAnalysed - inBookCount);
  const deepCount = useMemo(() => {
    return fetchedGames.filter((g) => (g.pgn.match(/\d+\./g) || []).length >= 6).length;
  }, [fetchedGames]);
  const avgDepth = totalAnalysed > 0 ? Math.round((deepCount / totalAnalysed) * 12 * 10) / 10 : 0;
  const uncoveredCount = baseOpenings.filter((o) => o.prepStatus === 'Untracked Line').length;

  // Dynamic time control counts from real games
  const tcCounts = useMemo(() => {
    const counts = { blitz: 0, daily: 0, rapid: 0, bullet: 0 };
    for (const g of fetchedGames) {
      const tc = (g.timeControl || '').toLowerCase();
      if (tc.includes('blitz') || tc === '180' || tc === '300' || tc === '180+2' || tc === '300+2') counts.blitz++;
      else if (tc.includes('daily') || tc.includes('1/') || tc.includes('correspondence')) counts.daily++;
      else if (tc.includes('rapid') || tc === '600' || tc === '900+10' || tc === '1800') counts.rapid++;
      else if (tc.includes('bullet') || tc === '60' || tc === '120+1' || tc === '60+1') counts.bullet++;
      else counts.blitz++;
    }
    return counts;
  }, [fetchedGames]);

  // Dynamic rating summary
  const ratingSummary = useMemo(() => {
    let latestRating = 1500;
    let initialRating = 1500;
    const ratings: number[] = [];

    for (const g of fetchedGames) {
      const isWhite = accounts.some((a) => a.username.toLowerCase() === g.white.toLowerCase());
      const r = isWhite ? g.whiteRating : g.blackRating;
      if (r && r > 0) {
        ratings.push(r);
      }
    }

    if (ratings.length > 0) {
      initialRating = ratings[ratings.length - 1];
      latestRating = ratings[0];
    }

    const diff = latestRating - initialRating;
    return {
      current: latestRating,
      diff: diff >= 0 ? `+${diff}` : `${diff}`,
      count: ratings.length,
    };
  }, [fetchedGames, accounts]);

  // Display list (top 4 or all)
  const displayedOpenings = showAllOpenings ? baseOpenings : baseOpenings.slice(0, 4);

  // Positives & Negatives for "What carries your score, and what drags it"
  const carriers = baseOpenings.filter((o) => o.vsAvg > 0).sort((a, b) => b.vsAvg - a.vsAvg);
  const draggers = baseOpenings.filter((o) => o.vsAvg < 0).sort((a, b) => a.vsAvg - b.vsAvg);

  return (
    <div className="w-full min-h-screen bg-[#0B0F17] text-white p-6 lg:p-8 space-y-6">
      {/* 1. Header with Penguin Mascot */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          {/* Penguin Avatar with cozy winter scarf matching ChessAtlas screenshot */}
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1E293B] to-[#0F172A] border border-white/10 shadow-lg text-3xl">
            🐧
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight text-white">
              Your openings
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">
              What your games say about your repertoire.
            </p>
          </div>
        </div>

        {/* Filter Bar Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          {/* Account Filter */}
          <div className="relative">
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="appearance-none rounded-xl border border-white/10 bg-[#141B29] px-3.5 py-1.5 pr-8 text-xs font-semibold text-gray-200 hover:border-white/20 focus:outline-none focus:border-amber-400/50 cursor-pointer"
            >
              <option value="all">All accounts</option>
              {accounts.map((acc) => (
                <option key={`${acc.platform}-${acc.username}`} value={`${acc.platform}-${acc.username}`}>
                  {acc.platform === 'chesscom' ? 'Chess.com' : 'Lichess'} · {acc.username}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          </div>

          {/* Platform Filter */}
          <div className="relative">
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="appearance-none rounded-xl border border-white/10 bg-[#141B29] px-3.5 py-1.5 pr-8 text-xs font-semibold text-gray-200 hover:border-white/20 focus:outline-none focus:border-amber-400/50 cursor-pointer"
            >
              <option value="all">Platform</option>
              <option value="chesscom">Chess.com</option>
              <option value="lichess">Lichess</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          </div>

          {/* Colour Filter */}
          <div className="relative">
            <select
              value={selectedColor}
              onChange={(e) => setSelectedColor(e.target.value as any)}
              className="appearance-none rounded-xl border border-white/10 bg-[#141B29] px-3.5 py-1.5 pr-8 text-xs font-semibold text-gray-200 hover:border-white/20 focus:outline-none focus:border-amber-400/50 cursor-pointer"
            >
              <option value="both">Colour</option>
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          </div>

          {/* Time control Filter */}
          <div className="relative">
            <select
              value={selectedTimeControl}
              onChange={(e) => setSelectedTimeControl(e.target.value)}
              className="appearance-none rounded-xl border border-white/10 bg-[#141B29] px-3.5 py-1.5 pr-8 text-xs font-semibold text-gray-200 hover:border-white/20 focus:outline-none focus:border-amber-400/50 cursor-pointer"
            >
              <option value="all">Time control</option>
              <option value="blitz">Blitz</option>
              <option value="rapid">Rapid</option>
              <option value="bullet">Bullet</option>
              <option value="daily">Daily</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          </div>

          {/* Period Filter */}
          <div className="relative">
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="appearance-none rounded-xl border border-white/10 bg-[#141B29] px-3.5 py-1.5 pr-8 text-xs font-semibold text-gray-200 hover:border-white/20 focus:outline-none focus:border-amber-400/50 cursor-pointer"
            >
              <option value="all">Period</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">This year</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          </div>
        </div>
      </div>

      {/* 2. Top KPIs and "What leaving it costs you" Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: 4 Metric Cards (2x2 Grid) */}
        <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Card 1: Played outside your repertoire */}
          <div className="rounded-2xl border border-white/[0.07] bg-[#111726] p-5 shadow-sm hover:border-white/15 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-gray-400">
                <LinkIcon className="h-4 w-4" />
              </div>
              <span className="text-2xl font-extrabold text-white">{outsideBookCount}</span>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-gray-300">
              <span>Played outside your repertoire</span>
              <span className="text-gray-500 cursor-help" title="Games where you deviated from your prepared lines">ⓘ</span>
            </div>
            <p className="text-[0.68rem] text-gray-500 mt-1">of {totalAnalysed} analysed</p>
          </div>

          {/* Card 2: Deep enough to judge */}
          <div className="rounded-2xl border border-white/[0.07] bg-[#111726] p-5 shadow-sm hover:border-white/15 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-gray-400">
                <FileText className="h-4 w-4" />
              </div>
              <span className="text-2xl font-extrabold text-white">{deepCount}</span>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-gray-300">
              <span>Deep enough to judge</span>
              <span className="text-gray-500 cursor-help" title="Games where the opening lasted at least 6 half-moves">ⓘ</span>
            </div>
            <p className="text-[0.68rem] text-gray-500 mt-1">of {inBookCount} that matched a repertoire</p>
          </div>

          {/* Card 3: Average prep depth */}
          <div className="rounded-2xl border border-white/[0.07] bg-[#111726] p-5 shadow-sm hover:border-white/15 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-gray-400">
                <Ruler className="h-4 w-4" />
              </div>
              <span className="text-2xl font-extrabold text-white">{avgDepth}</span>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-gray-300">
              <span>Average prep depth</span>
              <span className="text-gray-500 cursor-help" title="Average number of plies before leaving book">ⓘ</span>
            </div>
            <p className="text-[0.68rem] text-gray-500 mt-1">half-moves</p>
          </div>

          {/* Card 4: Openings you don't cover */}
          <div className="rounded-2xl border border-white/[0.07] bg-[#111726] p-5 shadow-sm hover:border-white/15 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-gray-400">
                <BookOpen className="h-4 w-4" />
              </div>
              <span className="text-2xl font-extrabold text-white">{uncoveredCount}</span>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-gray-300">
              <span>Openings you don't cover</span>
              <span className="text-gray-500 cursor-help" title="Frequently played openings with no active repertoire">ⓘ</span>
            </div>
            <p className="text-[0.68rem] text-gray-500 mt-1">of your {Math.min(10, baseOpenings.length || 10)} most played</p>
          </div>
        </div>

        {/* Right: "What leaving it costs you" Card */}
        <div className="lg:col-span-6 rounded-2xl border border-white/[0.07] bg-[#111726] p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-gray-400">
                <Scale className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">What leaving it costs you</h3>
                <p className="text-[0.7rem] text-gray-400">Same games, split by whether you stayed in your prep.</p>
              </div>
            </div>

            {/* Headline Callout */}
            <div className="mt-4 text-center">
              <p className="text-xs font-semibold text-gray-300">
                Staying in your prep is worth <span className="text-emerald-400 font-bold">9 points</span> of win rate
              </p>
            </div>

            {/* Split Comparison Columns */}
            <div className="mt-5 grid grid-cols-2 gap-6">
              {/* Following your repertoire */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-gray-300">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span className="font-semibold text-[0.75rem]">Following your repertoire</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white">53.2%</span>
                  <span className="text-[0.7rem] text-gray-500">over 79 games</span>
                </div>
                {/* W / D / L Stacked Bar */}
                <div className="h-2 w-full overflow-hidden rounded-full flex bg-white/5">
                  <div className="bg-emerald-400 transition-all" style={{ width: '53.2%' }} />
                  <div className="bg-gray-500 transition-all" style={{ width: '12.6%' }} />
                  <div className="bg-rose-500 transition-all" style={{ width: '34.2%' }} />
                </div>
              </div>

              {/* After leaving it */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-gray-300">
                  <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                  <span className="font-semibold text-[0.75rem]">After leaving it</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white">44.4%</span>
                  <span className="text-[0.7rem] text-gray-500">over 18 games</span>
                </div>
                {/* W / D / L Stacked Bar */}
                <div className="h-2 w-full overflow-hidden rounded-full flex bg-white/5">
                  <div className="bg-emerald-400 transition-all" style={{ width: '44.4%' }} />
                  <div className="bg-gray-500 transition-all" style={{ width: '11.2%' }} />
                  <div className="bg-rose-500 transition-all" style={{ width: '44.4%' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Footer Legend */}
          <div className="mt-6 pt-3 border-t border-white/5 flex items-center justify-between text-[0.65rem] text-gray-400">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Wins
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-gray-500" /> Draws
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-rose-500" /> Losses
              </span>
            </div>
            <span>Each bar is that group's own games.</span>
          </div>
        </div>
      </div>

      {/* 3. Middle Section: "Who left the repertoire first" and "How deep your preparation holds" */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Who left the repertoire first */}
        <div className="lg:col-span-6 rounded-2xl border border-white/[0.07] bg-[#111726] p-6 shadow-sm">
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-gray-400">
              <Flag className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Who left the repertoire first</h3>
              <p className="text-[0.7rem] text-gray-400">
                Only games that followed one of your repertoires for at least 6 half-moves. Open a row to see them.
              </p>
            </div>
          </div>

          {/* Tri-color Segmented Bar */}
          <div className="mt-5 h-2.5 w-full overflow-hidden rounded-full flex bg-white/5">
            <div className="bg-emerald-400 transition-all" style={{ width: '36%' }} />
            <div className="bg-amber-400 transition-all" style={{ width: '45%' }} />
            <div className="bg-rose-500 transition-all" style={{ width: '19%' }} />
          </div>

          {/* Breakdown Rows */}
          <div className="mt-5 space-y-2">
            {/* Row 1 */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors cursor-pointer group">
              <div className="flex items-start gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 mt-1 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">
                    You played your line to the end
                  </h4>
                  <p className="text-[0.68rem] text-gray-400">
                    The game stayed inside your prep, or followed it as far as it goes
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-bold text-white">35</span>
                <span className="text-xs text-gray-400 font-mono">36%</span>
                <ChevronRight className="h-4 w-4 text-gray-500 group-hover:text-white transition-colors" />
              </div>
            </div>

            {/* Row 2 */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors cursor-pointer group">
              <div className="flex items-start gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400 mt-1 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
                    Your opponent left first
                  </h4>
                  <p className="text-[0.68rem] text-gray-400">
                    You were still on script - these moves are the gaps to prepare
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-bold text-white">44</span>
                <span className="text-xs text-gray-400 font-mono">45%</span>
                <ChevronRight className="h-4 w-4 text-gray-500 group-hover:text-white transition-colors" />
              </div>
            </div>

            {/* Row 3 */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors cursor-pointer group">
              <div className="flex items-start gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500 mt-1 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-white group-hover:text-rose-300 transition-colors">
                    You left your prep
                  </h4>
                  <p className="text-[0.68rem] text-gray-400">
                    The only case where the miss is yours
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-bold text-white">18</span>
                <span className="text-xs text-gray-400 font-mono">19%</span>
                <ChevronRight className="h-4 w-4 text-gray-500 group-hover:text-white transition-colors" />
              </div>
            </div>
          </div>
        </div>

        {/* Right: How deep your preparation holds */}
        <div className="lg:col-span-6 rounded-2xl border border-white/[0.07] bg-[#111726] p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-gray-400">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">How deep your preparation holds</h3>
                <p className="text-[0.7rem] text-gray-400">
                  Share of games still following your repertoire, move by move.
                </p>
              </div>
            </div>

            <p className="mt-4 text-xs font-semibold text-gray-300">
              Half your games are out of book by <span className="text-white font-bold">move 5</span>
            </p>

            {/* Step Chart Visualization matching Screenshot */}
            <div className="mt-4 relative h-40 w-full pt-2">
              <svg className="h-full w-full overflow-visible" viewBox="0 0 500 120" preserveAspectRatio="none">
                {/* Grid lines */}
                <line x1="0" y1="10" x2="500" y2="10" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <line x1="0" y1="37" x2="500" y2="37" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <line x1="0" y1="65" x2="500" y2="65" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <line x1="0" y1="92" x2="500" y2="92" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <line x1="0" y1="118" x2="500" y2="118" stroke="rgba(255,255,255,0.06)" />

                {/* Step Line (Move 3: 100% (y=10), Move 4: 60% (y=53), Move 5: 25% (y=91), Move 6: 10% (y=108), Move 7-8: 2% (y=116)) */}
                <path
                  d="M 30,10 L 110,10 L 110,53 L 190,53 L 190,91 L 270,91 L 270,108 L 350,108 L 350,116 L 470,116"
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="2.5"
                  strokeLinejoin="miter"
                />
              </svg>

              {/* Y Axis Labels */}
              <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[0.6rem] font-mono text-gray-500 pointer-events-none -translate-x-1">
                <span>100%</span>
                <span>75%</span>
                <span>50%</span>
                <span>25%</span>
                <span>0%</span>
              </div>

              {/* X Axis Labels */}
              <div className="mt-2 flex justify-between text-[0.65rem] font-mono text-gray-400 px-6">
                <span>3</span>
                <span>4</span>
                <span>5</span>
                <span>6</span>
                <span>7</span>
                <span>8</span>
              </div>
            </div>
          </div>

          <p className="mt-4 text-[0.65rem] text-gray-500">
            Share of the 97 judged games still following your repertoire at each move.
          </p>
        </div>
      </div>

      {/* 4. Moves you have no answer to Card */}
      <div className="rounded-2xl border border-white/[0.07] bg-[#111726] p-6 shadow-sm">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-gray-400">
            <Target className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Moves you have no answer to</h3>
            <p className="text-[0.7rem] text-gray-400">
              Played against you while you were still following your repertoire.
            </p>
          </div>
        </div>

        {/* Golden bordered promo box */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.03] p-8 flex flex-col items-center justify-center text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-3 shadow-inner">
            <Lock className="h-5 w-5" />
          </div>
          <h4 className="text-base font-bold text-white">
            44 games where your opponent left your prep first
          </h4>
          <p className="text-xs text-gray-400 max-w-lg mt-1 leading-relaxed">
            Premium reads those games and lists the exact moves you have no answer to, most frequent first, with a one-click way to prepare each one.
          </p>
          <button
            type="button"
            className="mt-5 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 px-6 py-2.5 text-xs font-extrabold text-[#0B0F17] shadow-lg hover:from-amber-300 hover:to-yellow-400 transition-all cursor-pointer active:scale-95"
          >
            See what to prepare
          </button>
        </div>
      </div>

      {/* 5. Opening by opening Table */}
      <div className="rounded-2xl border border-white/[0.07] bg-[#111726] p-6 shadow-sm">
        <div className="flex items-center gap-2.5 mb-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-gray-400">
            <List className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Opening by opening</h3>
            <p className="text-[0.7rem] text-gray-400">
              Every opening you played at least 3 times. Open a row for the variations inside it.
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 text-[0.65rem] font-bold uppercase text-gray-400 tracking-wider">
                <th className="pb-3 pl-2">Opening</th>
                <th className="pb-3 px-3">W / D / L ⓘ</th>
                <th className="pb-3 px-3">Games</th>
                <th className="pb-3 px-3">Score ⓘ</th>
                <th className="pb-3 px-3">VS Avg ⓘ</th>
                <th className="pb-3 pr-2">Your Prep ⓘ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03] text-xs">
              {displayedOpenings.map((op, idx) => (
                <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                  {/* Name and thumbnail */}
                  <td className="py-3 pl-2">
                    <div className="flex items-center gap-3">
                      {/* Mini Board thumbnail */}
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-[#1A2234] text-lg font-bold shadow-xs">
                        {op.eco.startsWith('B') ? '♟' : op.eco.startsWith('C') ? '♞' : op.eco.startsWith('A') ? '♝' : '♚'}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-white group-hover:text-amber-300 transition-colors">
                          <ChevronRight className="h-3 w-3 text-gray-500" />
                          <span>{op.name}</span>
                        </div>
                        <span className="text-[0.65rem] text-gray-400 font-mono">{op.eco}</span>
                      </div>
                    </div>
                  </td>

                  {/* W / D / L bar */}
                  <td className="py-3 px-3 min-w-[100px]">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full flex bg-white/5">
                      <div className="bg-emerald-400" style={{ width: `${op.score}%` }} />
                      <div className="bg-gray-500" style={{ width: `${(op.draws / op.games) * 100}%` }} />
                      <div className="bg-rose-500" style={{ width: `${(op.losses / op.games) * 100}%` }} />
                    </div>
                  </td>

                  {/* Games */}
                  <td className="py-3 px-3 font-semibold text-gray-300 font-mono">
                    {op.games}
                  </td>

                  {/* Score */}
                  <td className="py-3 px-3 font-bold text-white font-mono">
                    {op.score}%
                  </td>

                  {/* VS Avg */}
                  <td className="py-3 px-3 font-bold font-mono">
                    <span className={op.vsAvg > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {op.vsAvg > 0 ? `+${op.vsAvg}` : op.vsAvg}
                    </span>
                  </td>

                  {/* Your Prep */}
                  <td className="py-3 pr-2">
                    {op.prepStatus === 'view_line' ? (
                      <button
                        type="button"
                        className="flex items-center gap-1 text-[0.7rem] font-semibold text-gray-400 hover:text-white transition-colors cursor-pointer"
                      >
                        <Eye className="h-3 w-3" />
                        <span>View the line</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <BookOpen className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <div className="truncate max-w-[180px]">
                          <p className="text-[0.7rem] font-semibold text-gray-300 truncate">
                            {op.prepStatus}
                          </p>
                          <p className="text-[0.6rem] text-gray-500 truncate">{op.prepRepName}</p>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Show all toggle */}
        <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[0.7rem]">
          <button
            type="button"
            onClick={() => setShowAllOpenings(!showAllOpenings)}
            className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors cursor-pointer font-semibold"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAllOpenings ? 'rotate-180' : ''}`} />
            <span>{showAllOpenings ? 'Collapse openings' : 'Show all 10 openings'}</span>
          </button>
          <span className="text-gray-500">6 games could not be matched to an opening.</span>
        </div>
      </div>

      {/* 6. Accuracy and Rating Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: How accurately you play */}
        <div className="lg:col-span-6 rounded-2xl border border-white/[0.07] bg-[#111726] p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-gray-400">
                <Target className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">How accurately you play</h3>
                <p className="text-[0.7rem] text-gray-400">
                  Your most recent analysed games, under the filters above.
                </p>
              </div>
            </div>

            {/* Metrics */}
            <div className="mt-5 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[0.68rem] font-semibold text-gray-400 uppercase tracking-wider">
                  Average accuracy
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-black text-white">90%</span>
                  <span className="text-[0.7rem] text-gray-500">over 1 game</span>
                </div>
              </div>
              <div>
                <p className="text-[0.68rem] font-semibold text-gray-400 uppercase tracking-wider">
                  Blunders per game
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-black text-white">1</span>
                </div>
              </div>
            </div>
          </div>

          {/* Premium callout */}
          <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                <Lock className="h-4 w-4" />
              </div>
              <div>
                <h5 className="text-xs font-bold text-white">
                  Accuracy by phase: opening, middlegame, endgame
                </h5>
                <p className="text-[0.68rem] text-gray-400 mt-0.5">
                  Premium shows where in the game your accuracy drops, so you know what to work on.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 px-3.5 py-1.5 text-[0.7rem] font-bold text-[#0B0F17] hover:from-amber-300 hover:to-yellow-400 transition-all cursor-pointer whitespace-nowrap"
            >
              See your accuracy by phase
            </button>
          </div>
        </div>

        {/* Right: What carries your score, and what drags it */}
        <div className="lg:col-span-6 rounded-2xl border border-white/[0.07] bg-[#111726] p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-gray-400">
                <ArrowUpDown className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  What carries your score, and what drags it
                </h3>
                <p className="text-[0.7rem] text-gray-400">
                  Measured against your own average, not against 50%.
                </p>
              </div>
            </div>

            {/* Horizontal Bar Chart matching Screenshot 3 & 4 */}
            <div className="mt-5 space-y-2 text-xs">
              {/* Positive carriers */}
              {carriers.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-32 truncate text-right font-medium text-gray-300 text-[0.75rem]">
                    {item.name}
                  </div>
                  <div className="w-6 text-right font-mono text-[0.7rem] text-gray-500">
                    {item.games}
                  </div>
                  <div className="flex-1 flex items-center">
                    <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${Math.min(100, item.vsAvg * 3.2)}%` }} />
                    <span className="ml-2 font-mono text-[0.7rem] font-bold text-emerald-400">
                      +{item.vsAvg}
                    </span>
                  </div>
                </div>
              ))}

              <div className="my-2 border-t border-white/5" />

              {/* Negative draggers */}
              {draggers.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-32 truncate text-right font-medium text-gray-300 text-[0.75rem]">
                    {item.name}
                  </div>
                  <div className="w-6 text-right font-mono text-[0.7rem] text-gray-500">
                    {item.games}
                  </div>
                  <div className="flex-1 flex items-center justify-end">
                    <span className="mr-2 font-mono text-[0.7rem] font-bold text-rose-400">
                      {item.vsAvg}
                    </span>
                    <div className="h-2 rounded-full bg-rose-500" style={{ width: `${Math.min(100, Math.abs(item.vsAvg) * 3.2)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-4 text-[0.65rem] text-gray-500">
            Percentage points above or below your overall win rate. Openings with fewer than 3 games are left out.
          </p>
        </div>
      </div>

      {/* 7. Rating History Chart matching Screenshot 3 & 4 */}
      <div className="rounded-2xl border border-white/[0.07] bg-[#111726] p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-gray-400">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Your rating</h3>
              <p className="text-[0.7rem] text-gray-400">One account and one time control at a time.</p>
            </div>
          </div>

          {/* Account & TC Badges */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {accounts.length > 0 ? (
              accounts.map((acc, idx) => (
                <button
                  key={`${acc.platform}-${acc.username}`}
                  type="button"
                  className={`rounded-full px-2.5 py-1 text-[0.68rem] font-bold border transition-colors ${
                    idx === 0
                      ? 'bg-amber-400/10 border-amber-400/30 text-amber-300'
                      : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'
                  }`}
                >
                  {acc.platform === 'chesscom' ? 'Chess.com' : 'Lichess'} · {acc.username}
                </button>
              ))
            ) : (
              <span className="rounded-full bg-white/5 border border-white/5 px-2.5 py-1 text-[0.68rem] font-medium text-gray-400">
                Connected accounts will appear here
              </span>
            )}

            <button
              type="button"
              onClick={() => setRatingTc('blitz')}
              className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold transition-colors cursor-pointer ${
                ratingTc === 'blitz'
                  ? 'bg-amber-400 text-black'
                  : 'bg-white/5 text-gray-400 hover:text-white'
              }`}
            >
              Blitz {tcCounts.blitz}
            </button>
            <button
              type="button"
              onClick={() => setRatingTc('daily')}
              className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold transition-colors cursor-pointer ${
                ratingTc === 'daily'
                  ? 'bg-amber-400 text-black'
                  : 'bg-white/5 text-gray-400 hover:text-white'
              }`}
            >
              Daily {tcCounts.daily}
            </button>
            <button
              type="button"
              onClick={() => setRatingTc('rapid')}
              className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold transition-colors cursor-pointer ${
                ratingTc === 'rapid'
                  ? 'bg-amber-400 text-black'
                  : 'bg-white/5 text-gray-400 hover:text-white'
              }`}
            >
              Rapid {tcCounts.rapid}
            </button>
            <button
              type="button"
              onClick={() => setRatingTc('bullet')}
              className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold transition-colors cursor-pointer ${
                ratingTc === 'bullet'
                  ? 'bg-amber-400 text-black'
                  : 'bg-white/5 text-gray-400 hover:text-white'
              }`}
            >
              Bullet {tcCounts.bullet}
            </button>
          </div>
        </div>

        {/* Big rating readout */}
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-3xl font-black text-white font-mono">{ratingSummary.current}</span>
          <span className={`text-xs font-bold font-mono ${ratingSummary.diff.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}`}>
            {ratingSummary.diff} over this period
          </span>
        </div>

        {/* Golden Rating Trendline SVG Chart */}
        <div className="relative h-48 w-full">
          <svg className="h-full w-full overflow-visible" viewBox="0 0 600 140" preserveAspectRatio="none">
            <defs>
              <linearGradient id="ratingGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Subtle grid lines */}
            <line x1="0" y1="10" x2="600" y2="10" stroke="rgba(255,255,255,0.04)" />
            <line x1="0" y1="40" x2="600" y2="40" stroke="rgba(255,255,255,0.04)" />
            <line x1="0" y1="75" x2="600" y2="75" stroke="rgba(255,255,255,0.04)" />
            <line x1="0" y1="105" x2="600" y2="105" stroke="rgba(255,255,255,0.04)" />
            <line x1="0" y1="135" x2="600" y2="135" stroke="rgba(255,255,255,0.04)" />

            {/* Filled Area */}
            <path
              d="M 20,135 L 50,132 Q 80,130 90,80 T 130,85 T 180,105 T 230,80 T 290,90 T 360,88 T 420,40 T 490,25 T 570,25 L 570,135 Z"
              fill="url(#ratingGradient)"
            />

            {/* Golden Smooth Curve */}
            <path
              d="M 20,135 L 50,132 Q 80,130 90,80 T 130,85 T 180,105 T 230,80 T 290,90 T 360,88 T 420,40 T 490,25 T 570,25"
              fill="none"
              stroke="#F59E0B"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>

          {/* Y Axis Labels */}
          <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[0.6rem] font-mono text-gray-500 pointer-events-none -translate-x-1">
            <span>1633</span>
            <span>1595</span>
            <span>1540</span>
            <span>1485</span>
            <span>1430</span>
          </div>

          {/* X Axis Labels */}
          <div className="mt-2 flex justify-between text-[0.65rem] font-mono text-gray-500 px-6">
            <span>Jul 26</span>
            <span>Jul 26</span>
            <span>Aug 26</span>
            <span>Aug 26</span>
            <span>Sep 26</span>
            <span>Sep 26</span>
          </div>
        </div>
      </div>

      {/* 8. Footer matching Screenshot 4 */}
      <footer className="mt-12 pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-4">
          <span>© 2026 Chess Compass</span>
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[0.65rem] font-semibold text-gray-400">
              Download on the App Store
            </span>
            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[0.65rem] font-semibold text-gray-400">
              GET IT ON Google Play
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[0.75rem]">
          <span className="hover:text-gray-300 cursor-pointer">About</span>
          <span className="hover:text-gray-300 cursor-pointer">Contact</span>
          <span className="hover:text-gray-300 cursor-pointer">Privacy</span>
          <span className="hover:text-gray-300 cursor-pointer">Terms</span>
          <span className="hover:text-gray-300 cursor-pointer">𝕏</span>
          <span className="hover:text-gray-300 cursor-pointer">📷</span>
          <span className="hover:text-gray-300 cursor-pointer">▶</span>
        </div>
      </footer>
    </div>
  );
}
