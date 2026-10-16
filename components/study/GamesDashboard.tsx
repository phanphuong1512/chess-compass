'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw,
  Upload,
  Settings2,
  ExternalLink,
  ChevronDown,
  Check,
  X,
  Trash2,
  Plus,
  Loader2,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  Eye,
  BarChart3,
  Search,
  Filter,
  History,
  User,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  BookOpen,
  Zap,
} from 'lucide-react';
import { Chess } from 'chess.js';
import type { Repertoire, ImportedGame, DeviationReport, FSRSCard } from '@/types/chess';
import { fetchLichessGames } from '@/lib/api/lichess';
import { fetchChessComGames } from '@/lib/api/chesscom';
import { RepertoireDAG, fenToNodeId, STARTING_FEN } from '@/lib/chess/dag';
import { createCard } from '@/lib/fsrs/scheduler';
import { db } from '@/lib/db';
import ChessBoard from './ChessBoard';

interface ConnectedAccount {
  id: string;
  platform: 'lichess' | 'chesscom';
  username: string;
  lastSynced: number;
}

interface GamesDashboardProps {
  repertoires: Repertoire[];
  allEdges: any[];
  allNodes: any[];
  onAddToTraining: (nodeId: string) => void;
}

interface AnalyzedGame extends ImportedGame {
  userColor: 'white' | 'black';
  repertoireMatch?: {
    repertoireName: string;
    status: 'in-book' | 'off-book' | 'opp-off-book' | 'mistake' | 'deviated';
    deviationPly?: number;
    playedMove?: string;
    preparedMove?: string;
    isTrained?: boolean;
  };
}

export default function GamesDashboard({
  repertoires,
  allEdges,
  allNodes,
  onAddToTraining,
}: GamesDashboardProps) {
  // Connected Accounts
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);

  // Selected account filter: 'all' or account.id
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [showAccountsDropdown, setShowAccountsDropdown] = useState(false);

  // New account form inside dropdown
  const [newPlatform, setNewPlatform] = useState<'lichess' | 'chesscom'>('lichess');
  const [newUsername, setNewUsername] = useState('');
  const [isAddingAccount, setIsAddingAccount] = useState(false);

  // PGN Import Modal
  const [showPgnModal, setShowPgnModal] = useState(false);
  const [importPgnText, setImportPgnText] = useState('');
  const [importSide, setImportSide] = useState<'white' | 'black' | 'by_name'>('white');

  // Active game preview modal
  const [activePreviewGame, setActivePreviewGame] = useState<AnalyzedGame | null>(null);
  const [previewPly, setPreviewPly] = useState(0);

  // Syncing & Games states
  const [isSyncing, setIsSyncing] = useState(false);
  const [games, setGames] = useState<ImportedGame[]>([]);
  const [lastSyncTime, setLastSyncTime] = useState<number>(Date.now() - 20 * 3600 * 1000);

  // Filters
  const [filterRepertoire, setFilterRepertoire] = useState<string>('all');
  const [filterColor, setFilterColor] = useState<string>('all');
  const [filterResult, setFilterResult] = useState<string>('all');
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [filterTimeControl, setFilterTimeControl] = useState<string>('all');
  const [filterPeriod, setFilterPeriod] = useState<string>('all');

  // Build DAG for fast lookup
  const dag = useMemo(() => new RepertoireDAG(allNodes, allEdges), [allNodes, allEdges]);

  // Load saved accounts from localStorage on mount
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

  // Save accounts to localStorage
  const saveAccounts = (newAccs: ConnectedAccount[]) => {
    setAccounts(newAccs);
    if (typeof window !== 'undefined') {
      localStorage.setItem('cc_connected_accounts', JSON.stringify(newAccs));
      localStorage.setItem('gma_connected_accounts', JSON.stringify(newAccs));
    }
  };

  // Live Sync Games from Lichess & Chess.com
  const syncGames = useCallback(async () => {
    setIsSyncing(true);
    const fetched: ImportedGame[] = [];

    for (const acc of accounts) {
      try {
        if (acc.platform === 'lichess') {
          const lGames = await fetchLichessGames(acc.username, 40);
          fetched.push(...lGames);
        } else if (acc.platform === 'chesscom') {
          const cGames = await fetchChessComGames(acc.username, 2);
          fetched.push(...cGames);
        }
      } catch (err) {
        console.warn(`Error syncing games for ${acc.username}:`, err);
      }
    }

    if (fetched.length > 0) {
      // Sort newest first
      fetched.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setGames(fetched);
      setLastSyncTime(Date.now());
      // Save to Dexie
      try {
        for (const g of fetched.slice(0, 50)) {
          await db.games.put(g);
        }
      } catch {}
    } else {
      // Try loading from local Dexie database if offline
      const stored = await db.games.toArray();
      if (stored.length > 0) {
        setGames(stored);
      }
    }

    setIsSyncing(false);
  }, [accounts]);

  // Initial sync on mount
  useEffect(() => {
    syncGames();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Analyze games against active repertoires
  const analyzedGames: AnalyzedGame[] = useMemo(() => {
    return games.map((game) => {
      // Find matching user account
      const matchedAcc = accounts.find(
        (a) =>
          game.white.toLowerCase().includes(a.username.toLowerCase()) ||
          game.black.toLowerCase().includes(a.username.toLowerCase())
      );
      const username = matchedAcc?.username.toLowerCase() || 'phanphuongvii';
      const isUserWhite = game.white.toLowerCase().includes(username);
      const userColor: 'white' | 'black' = isUserWhite ? 'white' : 'black';

      // Find best matching repertoire for this user color
      const matchingReps = repertoires.filter((r) => r.color === userColor);
      let repMatch: AnalyzedGame['repertoireMatch'] = {
        repertoireName: userColor === 'white' ? 'My White openings' : 'My Black openings',
        status: 'off-book',
      };

      if (matchingReps.length > 0) {
        // Walk game moves against DAG
        try {
          const c = new Chess();
          c.loadPgn(game.pgn);
          const history = c.history({ verbose: true });

          const walk = new Chess();
          let inBookPlies = 0;
          let activeRep = matchingReps[0];

          for (let ply = 0; ply < Math.min(history.length, 20); ply++) {
            const mv = history[ply];
            const fen = walk.fen();
            const nodeId = fenToNodeId(fen);

            const repEdges = allEdges.filter((e) => e.fromNodeId === nodeId);
            const isUserTurn = (userColor === 'white' && walk.turn() === 'w') || (userColor === 'black' && walk.turn() === 'b');

            if (repEdges.length === 0) {
              if (inBookPlies >= 4) {
                if (isUserTurn) {
                  repMatch = {
                    repertoireName: activeRep.name,
                    status: 'deviated',
                    deviationPly: ply + 1,
                    playedMove: mv.san,
                  };
                } else {
                  repMatch = {
                    repertoireName: activeRep.name,
                    status: 'opp-off-book',
                    deviationPly: ply + 1,
                    playedMove: mv.san,
                  };
                }
              }
              break;
            }

            const matchingEdge = repEdges.find((e) => e.san === mv.san);
            if (matchingEdge) {
              inBookPlies++;
              const matchedRep = repertoires.find((r) => r.id === matchingEdge.repertoireId);
              if (matchedRep) activeRep = matchedRep;
              walk.move(mv.san);
            } else {
              if (isUserTurn) {
                repMatch = {
                  repertoireName: activeRep.name,
                  status: 'mistake',
                  deviationPly: ply + 1,
                  playedMove: mv.san,
                  preparedMove: repEdges[0]?.san,
                  isTrained: false,
                };
              } else {
                repMatch = {
                  repertoireName: activeRep.name,
                  status: 'opp-off-book',
                  deviationPly: ply + 1,
                  playedMove: mv.san,
                };
              }
              break;
            }
          }

          if (inBookPlies >= 6 && repMatch.status === 'off-book') {
            repMatch = {
              repertoireName: activeRep.name,
              status: 'in-book',
            };
          }
        } catch {
          // fallback
        }
      }

      return {
        ...game,
        userColor,
        repertoireMatch: repMatch,
      };
    });
  }, [games, accounts, repertoires, allEdges]);

  // Filtered games list
  const filteredGames = useMemo(() => {
    return analyzedGames.filter((g) => {
      // Platform filter
      if (filterPlatform !== 'all' && g.platform !== filterPlatform) return false;
      // Color filter
      if (filterColor !== 'all' && g.userColor !== filterColor) return false;
      // Result filter
      if (filterResult !== 'all') {
        if (filterResult === 'win' && ((g.userColor === 'white' && g.result !== '1-0') || (g.userColor === 'black' && g.result !== '0-1'))) return false;
        if (filterResult === 'loss' && ((g.userColor === 'white' && g.result !== '0-1') || (g.userColor === 'black' && g.result !== '1-0'))) return false;
        if (filterResult === 'draw' && g.result !== '1/2-1/2') return false;
      }
      // Repertoire filter
      if (filterRepertoire !== 'all') {
        if (!g.repertoireMatch?.repertoireName.toLowerCase().includes(filterRepertoire.toLowerCase())) return false;
      }
      return true;
    });
  }, [analyzedGames, filterPlatform, filterColor, filterResult, filterRepertoire]);

  // Format relative time (e.g. "20h ago", "5d ago")
  const formatTimeAgo = (timestamp: number) => {
    const diffHours = Math.round((Date.now() - timestamp) / (1000 * 3600));
    if (diffHours < 1) return 'just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays}d ago`;
  };

  // Add Account handler
  const handleAddAccount = async () => {
    if (!newUsername.trim()) return;
    setIsAddingAccount(true);
    const newAcc: ConnectedAccount = {
      id: String(Date.now()),
      platform: newPlatform,
      username: newUsername.trim(),
      lastSynced: Date.now(),
    };
    const updated = [...accounts, newAcc];
    saveAccounts(updated);
    setNewUsername('');
    setIsAddingAccount(false);
    setShowAccountsDropdown(false);
    // Trigger immediate sync
    syncGames();
  };

  // Delete Account handler
  const handleDeleteAccount = (id: string) => {
    const updated = accounts.filter((a) => a.id !== id);
    saveAccounts(updated);
  };

  // Handle PGN Import from modal
  const handleImportPgn = () => {
    if (!importPgnText.trim()) return;
    try {
      const c = new Chess();
      c.loadPgn(importPgnText);
      const headers = c.header();
      const newGame: ImportedGame = {
        id: `pgn_import_${Date.now()}`,
        platform: 'lichess',
        pgn: importPgnText,
        white: headers.White || 'Player 1',
        black: headers.Black || 'Player 2',
        result: headers.Result || '*',
        date: headers.Date || new Date().toISOString().split('T')[0],
      };
      setGames((prev) => [newGame, ...prev]);
      setShowPgnModal(false);
      setImportPgnText('');
    } catch (err) {
      alert('Could not parse PGN. Please verify the format.');
    }
  };

  // Preview game moves calculation
  const previewPositions = useMemo(() => {
    if (!activePreviewGame) return [];
    try {
      const c = new Chess();
      c.loadPgn(activePreviewGame.pgn);
      const moves = c.history();
      const posChess = new Chess();
      const fens: string[] = [STARTING_FEN];
      for (const m of moves) {
        posChess.move(m);
        fens.push(posChess.fen());
      }
      return fens;
    } catch {
      return [STARTING_FEN];
    }
  }, [activePreviewGame]);

  const currentPreviewFen = previewPositions[previewPly] || STARTING_FEN;

  return (
    <div className="w-full max-w-[1400px] mx-auto px-6 py-6 select-none space-y-6">
      {/* ========================================================================= */}
      {/* HEADER: YOUR GAMES + SYNC / IMPORT PGN / ACCOUNTS (SCREENSHOT 3) */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          {/* Header Icon */}
          <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-[#141B29] border border-white/10 shrink-0">
            <History className="h-5 w-5 text-amber-400" />
            <div className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-[#0B0F17]" />
          </div>

          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">Your games</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {games.length > 0 ? `${games.length} games` : '200 games'} · synced {formatTimeAgo(lastSyncTime)}
            </p>
          </div>
        </div>

        {/* Top Right Action Buttons */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto relative">
          {/* 1. Sync Button */}
          <button
            type="button"
            onClick={syncGames}
            disabled={isSyncing}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3.5 py-2 text-xs font-semibold text-white transition-colors active:scale-[0.98] cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-gray-300 ${isSyncing ? 'animate-spin text-amber-400' : ''}`} />
            <span>Sync</span>
          </button>

          {/* 2. Import PGN Button */}
          <button
            type="button"
            onClick={() => setShowPgnModal(true)}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3.5 py-2 text-xs font-semibold text-white transition-colors active:scale-[0.98] cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5 text-gray-300" />
            <span>Import PGN</span>
          </button>

          {/* 3. Accounts Button & Dropdown (Screenshot 5) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAccountsDropdown(!showAccountsDropdown)}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3.5 py-2 text-xs font-semibold text-white transition-colors active:scale-[0.98] cursor-pointer"
            >
              <Settings2 className="h-3.5 w-3.5 text-gray-300" />
              <span>Accounts</span>
              <span className="rounded-md bg-amber-400/20 px-1 py-0.2 text-[0.6rem] font-bold text-amber-300">
                All
              </span>
            </button>

            {/* ACCOUNTS DROPDOWN (SCREENSHOT 5) */}
            <AnimatePresence>
              {showAccountsDropdown && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 8 }}
                  className="absolute right-0 top-11 z-50 w-72 rounded-2xl border border-white/10 bg-[#141B29] p-4 shadow-2xl text-white"
                >
                  <span className="block text-[0.65rem] font-bold tracking-wider uppercase text-gray-400 mb-2.5">
                    SHOW GAMES FROM
                  </span>

                  {/* All Accounts Option */}
                  <div
                    onClick={() => {
                      setSelectedAccountId('all');
                      setShowAccountsDropdown(false);
                    }}
                    className="flex items-center gap-2.5 rounded-xl bg-white/5 p-2 px-3 hover:bg-white/10 transition-colors cursor-pointer mb-2"
                  >
                    <Check className="h-4 w-4 text-amber-400" />
                    <span className="text-xs font-semibold text-white">All accounts</span>
                  </div>

                  {/* Connected Accounts List */}
                  <div className="space-y-1 mb-3">
                    {accounts.map((acc) => (
                      <div
                        key={acc.id}
                        className="flex items-center justify-between rounded-xl p-2 px-3 hover:bg-white/5 transition-colors group"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`h-2 w-2 rounded-full ${acc.platform === 'lichess' ? 'bg-white' : 'bg-emerald-400'}`} />
                          <div>
                            <p className="text-xs font-bold text-white leading-tight">
                              {acc.username}{' '}
                              <span className="font-normal text-gray-400 text-[0.7rem]">
                                {acc.platform === 'lichess' ? 'Lichess' : 'Chess.Com'}
                              </span>
                            </p>
                            <p className="text-[0.65rem] text-gray-500">
                              synced {formatTimeAgo(acc.lastSynced)}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteAccount(acc.id)}
                          className="text-gray-500 hover:text-red-400 transition-colors p-1"
                          title="Delete account"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add New Account Form */}
                  <div className="border-t border-white/[0.08] pt-3">
                    <div className="flex gap-1.5 items-center">
                      <select
                        value={newPlatform}
                        onChange={(e) => setNewPlatform(e.target.value as any)}
                        className="rounded-xl border border-white/10 bg-[#0B0F17] px-2.5 py-1.5 text-xs text-white outline-none cursor-pointer"
                      >
                        <option value="lichess">Lichess</option>
                        <option value="chesscom">Chess.com</option>
                      </select>

                      <input
                        type="text"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        placeholder="Username"
                        onKeyDown={(e) => e.key === 'Enter' && handleAddAccount()}
                        className="flex-1 rounded-xl border border-white/10 bg-[#0B0F17] px-2.5 py-1.5 text-xs text-white placeholder-gray-500 outline-none"
                      />

                      <button
                        type="button"
                        onClick={handleAddAccount}
                        disabled={!newUsername.trim() || isAddingAccount}
                        className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-400 text-black hover:bg-amber-300 disabled:opacity-50 transition-colors cursor-pointer"
                        title="Add account"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FILTER BAR (SCREENSHOT 3) */}
      {/* ========================================================================= */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] [scrollbar-color:#334155_transparent]">
        {/* Filter: Repertoire */}
        <select
          value={filterRepertoire}
          onChange={(e) => setFilterRepertoire(e.target.value)}
          className="rounded-xl border border-white/10 bg-[#141B29] px-3 py-1.5 text-xs text-gray-300 hover:text-white outline-none cursor-pointer"
        >
          <option value="all">Repertoire</option>
          {repertoires.map((r) => (
            <option key={r.id} value={r.name}>{r.name}</option>
          ))}
        </select>

        {/* Filter: Color */}
        <select
          value={filterColor}
          onChange={(e) => setFilterColor(e.target.value)}
          className="rounded-xl border border-white/10 bg-[#141B29] px-3 py-1.5 text-xs text-gray-300 hover:text-white outline-none cursor-pointer"
        >
          <option value="all">Color</option>
          <option value="white">White</option>
          <option value="black">Black</option>
        </select>

        {/* Filter: Result */}
        <select
          value={filterResult}
          onChange={(e) => setFilterResult(e.target.value)}
          className="rounded-xl border border-white/10 bg-[#141B29] px-3 py-1.5 text-xs text-gray-300 hover:text-white outline-none cursor-pointer"
        >
          <option value="all">Result</option>
          <option value="win">Wins</option>
          <option value="loss">Losses</option>
          <option value="draw">Draws</option>
        </select>

        {/* Filter: Platform */}
        <select
          value={filterPlatform}
          onChange={(e) => setFilterPlatform(e.target.value)}
          className="rounded-xl border border-white/10 bg-[#141B29] px-3 py-1.5 text-xs text-gray-300 hover:text-white outline-none cursor-pointer"
        >
          <option value="all">Platform</option>
          <option value="lichess">Lichess</option>
          <option value="chesscom">Chess.com</option>
        </select>

        {/* Filter: Time Control */}
        <select
          value={filterTimeControl}
          onChange={(e) => setFilterTimeControl(e.target.value)}
          className="rounded-xl border border-white/10 bg-[#141B29] px-3 py-1.5 text-xs text-gray-300 hover:text-white outline-none cursor-pointer"
        >
          <option value="all">Time control</option>
          <option value="blitz">Blitz (3-5 min)</option>
          <option value="rapid">Rapid (10-15 min)</option>
          <option value="bullet">Bullet (1-2 min)</option>
        </select>

        {/* Filter: Period */}
        <select
          value={filterPeriod}
          onChange={(e) => setFilterPeriod(e.target.value)}
          className="rounded-xl border border-white/10 bg-[#141B29] px-3 py-1.5 text-xs text-gray-300 hover:text-white outline-none cursor-pointer"
        >
          <option value="all">Period</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
      </div>

      {/* ========================================================================= */}
      {/* GAMES TABLE LIST (SCREENSHOT 3) */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#141B29] overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-3 px-5 py-3 text-[0.65rem] font-bold tracking-wider uppercase text-gray-500 border-b border-white/[0.06]">
          <span className="col-span-4">PLAYERS</span>
          <span className="col-span-2 text-center">RESULT</span>
          <span className="col-span-3">REPERTOIRE</span>
          <span className="col-span-1">DATE</span>
          <span className="col-span-2 text-right">ACTION</span>
        </div>

        {/* Table Rows */}
        <div className="divide-y divide-white/[0.04]">
          {filteredGames.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              {isSyncing ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
                  <span>Syncing games from Lichess & Chess.com...</span>
                </div>
              ) : (
                'No games found matching the selected filters.'
              )}
            </div>
          ) : (
            filteredGames.slice(0, 40).map((game) => {
              const isWin =
                (game.userColor === 'white' && game.result === '1-0') ||
                (game.userColor === 'black' && game.result === '0-1');
              const isDraw = game.result === '1/2-1/2';

              return (
                <div
                  key={game.id}
                  className="grid grid-cols-12 gap-3 px-5 py-3.5 items-center hover:bg-white/[0.03] transition-colors"
                >
                  {/* Column 1: Time control & Players */}
                  <div className="col-span-4 flex items-center gap-3">
                    {/* Time control & Platform badge */}
                    <div className="text-center w-14 shrink-0">
                      <Zap className="h-3 w-3 text-amber-400 mx-auto mb-0.5" />
                      <span className="block text-[0.65rem] font-bold text-gray-300">
                        {game.timeControl || '5 min'}
                      </span>
                      <span className="block text-[0.6rem] text-gray-500 capitalize">
                        {game.platform}
                      </span>
                    </div>

                    {/* Players */}
                    <div className="min-w-0">
                      {/* White player */}
                      <div className="flex items-center gap-1.5 text-xs truncate">
                        <span className="h-2 w-2 rounded-full border border-gray-400 bg-white shrink-0" />
                        <span className={`font-semibold truncate ${game.userColor === 'white' ? 'text-white' : 'text-gray-300'}`}>
                          {game.white}
                        </span>
                        {game.whiteRating ? (
                          <span className="text-[0.65rem] text-gray-500">({game.whiteRating})</span>
                        ) : null}
                      </div>

                      {/* Black player */}
                      <div className="flex items-center gap-1.5 text-xs truncate mt-0.5">
                        <span className="h-2 w-2 rounded-full border border-gray-400 bg-transparent shrink-0" />
                        <span className={`font-semibold truncate ${game.userColor === 'black' ? 'text-white' : 'text-gray-300'}`}>
                          {game.black}
                        </span>
                        {game.blackRating ? (
                          <span className="text-[0.65rem] text-gray-500">({game.blackRating})</span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Column 2: Result */}
                  <div className="col-span-2 flex items-center justify-center gap-2">
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        isWin
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : isDraw
                            ? 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {isWin ? '+' : isDraw ? '=' : '−'}
                    </div>
                    <span className="text-xs font-mono font-bold text-gray-300">
                      {game.result}
                    </span>
                  </div>

                  {/* Column 3: Repertoire & Deviation Badges */}
                  <div className="col-span-3 flex flex-wrap items-center gap-1.5 min-w-0">
                    {game.repertoireMatch?.status === 'off-book' ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5 text-[0.65rem] font-semibold text-gray-400 border border-white/5">
                        ⊘ Off-book
                      </span>
                    ) : (
                      <>
                        <span className="text-xs font-bold text-white truncate max-w-[140px] flex items-center" title={game.repertoireMatch?.repertoireName}>
                          <BookOpen className="h-3 w-3 text-amber-400 shrink-0 inline mr-1" />
                          <span className="truncate">{game.repertoireMatch?.repertoireName}</span>
                        </span>

                        {game.repertoireMatch?.status === 'opp-off-book' && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[0.62rem] font-semibold text-amber-300 border border-amber-500/30">
                            <Lightbulb className="h-3 w-3 text-amber-300 shrink-0" />
                            <span>Opp. off-book</span>
                          </span>
                        )}

                        {game.repertoireMatch?.status === 'mistake' && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[0.62rem] font-semibold text-rose-400 border border-rose-500/30">
                            <AlertTriangle className="h-3 w-3 text-rose-400 shrink-0" />
                            <span>Mistake</span>
                          </span>
                        )}

                        {game.repertoireMatch?.status === 'deviated' && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[0.62rem] font-semibold text-amber-400 border border-amber-500/30">
                            <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                            <span>Deviated</span>
                          </span>
                        )}

                        {game.repertoireMatch?.isTrained && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[0.62rem] font-semibold text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                            <span>Trained</span>
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Column 4: Date */}
                  <div className="col-span-1 text-xs text-gray-400 font-mono flex items-center gap-1">
                    <span>{game.date}</span>
                  </div>

                  {/* Column 5: Action Button */}
                  <div className="col-span-2 flex items-center justify-end">
                    {game.repertoireMatch?.status === 'mistake' || game.repertoireMatch?.status === 'deviated' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setActivePreviewGame(game);
                          setPreviewPly(game.repertoireMatch?.deviationPly || 0);
                        }}
                        className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors cursor-pointer"
                      >
                        <BarChart3 className="h-3.5 w-3.5 text-amber-400" />
                        <span>View analysis</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setActivePreviewGame(game);
                          setPreviewPly(0);
                        }}
                        className="flex items-center gap-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 px-3 py-1.5 text-xs font-bold text-stone-950 transition-colors active:scale-[0.98] cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>View game</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* IMPORT GAMES FROM PGN MODAL (SCREENSHOT 4) */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {showPgnModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-[540px] rounded-2xl border border-white/10 bg-[#141B29] p-6 shadow-2xl text-white my-8"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setShowPgnModal(false)}
                className="absolute top-5 right-5 text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="mb-4">
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Import games from PGN
                </h2>
                <p className="text-xs text-gray-400 mt-1 leading-snug">
                  For games played anywhere else - Chessiverse, over the board, another site. They are checked against your repertoire like your synced games.
                </p>
              </div>

              {/* PGN Textarea */}
              <div className="mb-3">
                <span className="block text-[0.65rem] font-bold tracking-wider uppercase text-gray-400 mb-1">
                  PGN
                </span>
                <textarea
                  value={importPgnText}
                  onChange={(e) => setImportPgnText(e.target.value)}
                  placeholder="Paste one or more games, or upload a .pgn file below..."
                  rows={5}
                  className="w-full rounded-xl border border-amber-500/40 bg-[#0B0F17] p-3 font-mono text-xs text-white placeholder-gray-500 outline-none focus:border-amber-400"
                />
              </div>

              {/* File Upload Line */}
              <div className="flex items-center justify-between text-xs text-gray-400 mb-5">
                <span>{importPgnText ? 'Game detected in box' : 'No game detected yet.'}</span>
                <label className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 cursor-pointer transition-colors">
                  <span>Choose File</span>
                  <input
                    type="file"
                    accept=".pgn"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (evt) => setImportPgnText(String(evt.target?.result || ''));
                        reader.readAsText(file);
                      }
                    }}
                  />
                </label>
              </div>

              {/* Which side did you play? */}
              <div className="mb-5">
                <span className="block text-xs font-bold text-white mb-2">
                  Which side did you play?
                </span>
                <div className="grid grid-cols-3 gap-2.5">
                  {/* Option 1: White */}
                  <div
                    onClick={() => setImportSide('white')}
                    className={`rounded-xl border p-3 text-center cursor-pointer transition-all ${
                      importSide === 'white'
                        ? 'border-amber-400 bg-amber-400/10 text-white shadow-xs'
                        : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20'
                    }`}
                  >
                    <div className="mx-auto mb-1 h-3.5 w-3.5 rounded-full bg-white shadow-xs" />
                    <span className="block text-xs font-bold text-white">White</span>
                    <span className="block text-[0.62rem] text-gray-400">In every game</span>
                  </div>

                  {/* Option 2: Black */}
                  <div
                    onClick={() => setImportSide('black')}
                    className={`rounded-xl border p-3 text-center cursor-pointer transition-all ${
                      importSide === 'black'
                        ? 'border-amber-400 bg-amber-400/10 text-white shadow-xs'
                        : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20'
                    }`}
                  >
                    <div className="mx-auto mb-1 h-3.5 w-3.5 rounded-full border border-gray-400 bg-transparent" />
                    <span className="block text-xs font-bold text-white">Black</span>
                    <span className="block text-[0.62rem] text-gray-400">In every game</span>
                  </div>

                  {/* Option 3: By Name */}
                  <div
                    onClick={() => setImportSide('by_name')}
                    className={`rounded-xl border p-3 text-center cursor-pointer transition-colors ${
                      importSide === 'by_name'
                        ? 'border-amber-400 bg-amber-400/10 text-white'
                        : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20'
                    }`}
                  >
                    <User className="mx-auto mb-1 h-3.5 w-3.5 text-gray-300" />
                    <span className="block text-xs font-bold text-white">By name</span>
                    <span className="block text-[0.62rem] text-gray-400">From the players</span>
                  </div>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setShowPgnModal(false)}
                  className="rounded-xl border border-white/10 bg-[#1E293B] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#334155] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImportPgn}
                  disabled={!importPgnText.trim()}
                  className="rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 px-6 py-2.5 text-xs font-bold text-stone-950 transition-colors active:scale-[0.98] cursor-pointer"
                >
                  Import
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* INTERACTIVE GAME VIEWER MODAL */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {activePreviewGame && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-[720px] rounded-2xl border border-white/10 bg-[#141B29] p-6 shadow-2xl text-white my-8"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setActivePreviewGame(null)}
                className="absolute top-5 right-5 text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-amber-400 font-bold uppercase tracking-wider">
                    Game Review
                  </span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-300 font-mono">
                    {activePreviewGame.white} vs {activePreviewGame.black} ({activePreviewGame.result})
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white mt-1">
                  {activePreviewGame.repertoireMatch?.repertoireName || 'Repertoire Inspection'}
                </h3>
              </div>

              {/* Game View Grid: Board + Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                {/* Chess Board */}
                <div className="w-full aspect-square">
                  <ChessBoard
                    fen={currentPreviewFen}
                    orientation={activePreviewGame.userColor}
                    interactive={false}
                  />
                  {/* Stepper controls */}
                  <div className="flex items-center justify-center gap-1 mt-2">
                    <button
                      type="button"
                      onClick={() => setPreviewPly(0)}
                      className="rounded bg-white/10 p-1.5 text-gray-300 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                      title="First move"
                    >
                      <ChevronsLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewPly((p) => Math.max(0, p - 1))}
                      className="rounded bg-white/10 p-1.5 text-gray-300 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                      title="Previous move"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="px-2 text-xs font-mono text-gray-400">
                      Ply {previewPly} / {previewPositions.length - 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPreviewPly((p) => Math.min(previewPositions.length - 1, p + 1))}
                      className="rounded bg-white/10 p-1.5 text-gray-300 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                      title="Next move"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewPly(previewPositions.length - 1)}
                      className="rounded bg-white/10 p-1.5 text-gray-300 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                      title="Last move"
                    >
                      <ChevronsRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Details & Deviation Pinpoint */}
                <div className="space-y-4">
                  {activePreviewGame.repertoireMatch?.deviationPly ? (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                        <h4 className="text-xs font-bold text-amber-300">
                          Deviation at Ply {activePreviewGame.repertoireMatch.deviationPly}
                        </h4>
                      </div>
                      <p className="text-xs text-gray-300 leading-relaxed">
                        Played move:{' '}
                        <span className="font-mono font-bold text-rose-400">
                          {activePreviewGame.repertoireMatch.playedMove}
                        </span>
                        {activePreviewGame.repertoireMatch.preparedMove && (
                          <>
                            {' '}
                            instead of prepared{' '}
                            <span className="font-mono font-bold text-emerald-400">
                              {activePreviewGame.repertoireMatch.preparedMove}
                            </span>
                          </>
                        )}
                      </p>

                      {/* Add to Training Queue */}
                      <button
                        type="button"
                        onClick={() => {
                          const nodeId = fenToNodeId(currentPreviewFen);
                          onAddToTraining(nodeId);
                          alert('Position successfully added to your FSRS review queue!');
                        }}
                        className="mt-3 flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-black hover:bg-amber-300 transition-colors shadow-xs"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add to Training Queue</span>
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        <h4 className="text-xs font-bold text-emerald-300">
                          {activePreviewGame.repertoireMatch?.status === 'in-book'
                            ? 'Maintained Repertoire Line'
                            : 'Standard Game'}
                        </h4>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        Opening played smoothly according to your prepared theory.
                      </p>
                    </div>
                  )}

                  <div className="rounded-xl bg-white/5 p-3 text-xs text-gray-400 space-y-1">
                    <p>Platform: <span className="text-white capitalize">{activePreviewGame.platform}</span></p>
                    <p>Date: <span className="text-white">{activePreviewGame.date}</span></p>
                    <p>Time Control: <span className="text-white">{activePreviewGame.timeControl || 'Standard'}</span></p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
