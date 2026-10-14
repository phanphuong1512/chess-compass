'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Search,
  Check,
  Loader2,
  ArrowLeft,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { Chess } from 'chess.js';
import type { Repertoire, RepertoireNode, RepertoireEdge } from '@/types/chess';
import { fetchLichessGames } from '@/lib/api/lichess';
import { fetchChessComGames } from '@/lib/api/chesscom';
import { fenToNodeId, STARTING_FEN } from '@/lib/chess/dag';
import { db } from '@/lib/db';
import { createCard } from '@/lib/fsrs/scheduler';

export interface DetectedOpening {
  key: string;
  name: string;
  side: 'white' | 'black';
  gamesCount: number;
  scorePercent: number;
  movesList: string[][];
  topLine: string[];
}

interface BuildFromGamesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRepertoireCreated: (repertoireId: string) => void;
  existingRepertoires?: Repertoire[];
}

export default function BuildFromGamesModal({
  isOpen,
  onClose,
  onRepertoireCreated,
  existingRepertoires = [],
}: BuildFromGamesModalProps) {
  // Step: 'input' | 'analyzing' | 'select'
  const [step, setStep] = useState<'input' | 'analyzing' | 'select'>('input');

  // Input states
  const [lichessUsername, setLichessUsername] = useState('');
  const [chesscomUsername, setChesscomUsername] = useState('');

  // Scanning & Detection states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scannedGamesCount, setScannedGamesCount] = useState(0);
  const [detectedOpenings, setDetectedOpenings] = useState<DetectedOpening[]>([]);
  const [selectedOpeningKeys, setSelectedOpeningKeys] = useState<Set<string>>(new Set());
  const [alreadyKnow, setAlreadyKnow] = useState(true);

  // Saving states
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Load saved usernames from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedLichess = localStorage.getItem('cc_lichess_username') || localStorage.getItem('gma_lichess_username') || '';
      const savedChesscom = localStorage.getItem('cc_chesscom_username') || localStorage.getItem('gma_chesscom_username') || '';
      setLichessUsername(savedLichess);
      setChesscomUsername(savedChesscom);
    }
  }, []);

  if (!isOpen) return null;

  // Clean and format opening name from ECO URL or Lichess opening
  const formatOpeningName = (rawName: string): string => {
    if (!rawName) return 'Main Opening Line';
    // If from Chess.com ECOUrl like "Caro-Kann-Defense-Advance-Variation-3...cxd5-4.Nf3"
    let clean = rawName;
    if (clean.includes('/openings/')) {
      clean = clean.split('/openings/')[1] || clean;
    }
    // Remove move tails like "-3...cxd5"
    clean = clean.replace(/-\d+\.{1,3}.*$/, '');
    clean = clean.replace(/-/g, ' ');
    // Format nicely
    clean = clean.replace(/\b([a-z])/g, (_, ch) => ch.toUpperCase());
    return clean.trim();
  };

  // Step 1 -> Analyze Games
  const handleAnalyzeGames = async () => {
    const lichess = lichessUsername.trim();
    const chesscom = chesscomUsername.trim();

    if (!lichess && !chesscom) {
      setError('Please enter at least one Lichess or Chess.com username.');
      return;
    }

    // Save to localStorage
    if (typeof window !== 'undefined') {
      if (lichess) localStorage.setItem('cc_lichess_username', lichess);
      if (chesscom) localStorage.setItem('cc_chesscom_username', chesscom);
    }

    setError(null);
    setIsAnalyzing(true);
    setStep('analyzing');
    setScannedGamesCount(0);

    abortControllerRef.current = new AbortController();

    try {
      const allRawGames: Array<{
        platform: 'lichess' | 'chesscom';
        white: string;
        black: string;
        winner: 'white' | 'black' | 'draw';
        openingName: string;
        sanMoves: string[];
      }> = [];

      // 1. Fetch Lichess games
      if (lichess) {
        try {
          const lichessGames = await fetchLichessGames(lichess, 80);
          for (const g of lichessGames) {
            const isWhite = g.white.toLowerCase() === lichess.toLowerCase();
            const isBlack = g.black.toLowerCase() === lichess.toLowerCase();
            if (!isWhite && !isBlack) continue;

            const winner = g.result === '1-0' ? 'white' : g.result === '0-1' ? 'black' : 'draw';
            // Extract SAN moves from PGN
            let sanMoves: string[] = [];
            try {
              const c = new Chess();
              c.loadPgn(g.pgn);
              sanMoves = c.history();
            } catch {
              // fallback: token split
              sanMoves = g.pgn
                .replace(/\[.*?\]/g, '')
                .replace(/\d+\./g, '')
                .trim()
                .split(/\s+/)
                .filter(Boolean);
            }

            allRawGames.push({
              platform: 'lichess',
              white: g.white,
              black: g.black,
              winner,
              openingName: g.opening || 'Open Game',
              sanMoves,
            });
          }
        } catch (err) {
          console.warn('Lichess scan warning:', err);
        }
      }

      // 2. Fetch Chess.com games
      if (chesscom) {
        try {
          const chesscomGames = await fetchChessComGames(chesscom, 3);
          for (const g of chesscomGames) {
            const isWhite = g.white.toLowerCase() === chesscom.toLowerCase();
            const isBlack = g.black.toLowerCase() === chesscom.toLowerCase();
            if (!isWhite && !isBlack) continue;

            const winner = g.result === '1-0' ? 'white' : g.result === '0-1' ? 'black' : 'draw';

            let openingName = 'Open Game';
            const ecoMatch = g.pgn.match(/\[ECOUrl "([^"]+)"\]/);
            if (ecoMatch && ecoMatch[1]) {
              openingName = formatOpeningName(ecoMatch[1]);
            } else {
              const nameMatch = g.pgn.match(/\[Opening "([^"]+)"\]/);
              if (nameMatch && nameMatch[1]) openingName = nameMatch[1];
            }

            let sanMoves: string[] = [];
            try {
              const c = new Chess();
              c.loadPgn(g.pgn);
              sanMoves = c.history();
            } catch {
              sanMoves = g.pgn
                .replace(/\[.*?\]/g, '')
                .replace(/\d+\./g, '')
                .trim()
                .split(/\s+/)
                .filter(Boolean);
            }

            allRawGames.push({
              platform: 'chesscom',
              white: g.white,
              black: g.black,
              winner,
              openingName,
              sanMoves,
            });
          }
        } catch (err) {
          console.warn('Chess.com scan warning:', err);
        }
      }

      setScannedGamesCount(allRawGames.length);

      if (allRawGames.length === 0) {
        setError('No games found for the specified username(s). Please verify the spelling.');
        setIsAnalyzing(false);
        setStep('input');
        return;
      }

      // Group games by (openingName, side)
      const groupsMap = new Map<
        string,
        {
          name: string;
          side: 'white' | 'black';
          games: number;
          wins: number;
          draws: number;
          movesList: string[][];
        }
      >();

      for (const g of allRawGames) {
        const isWhite =
          (lichess && g.white.toLowerCase() === lichess.toLowerCase()) ||
          (chesscom && g.white.toLowerCase() === chesscom.toLowerCase());
        const side: 'white' | 'black' = isWhite ? 'white' : 'black';

        const rawOpName = g.openingName || 'General System';
        const formattedName = formatOpeningName(rawOpName);
        const groupKey = `${formattedName}__${side}`;

        const existing = groupsMap.get(groupKey) || {
          name: formattedName,
          side,
          games: 0,
          wins: 0,
          draws: 0,
          movesList: [],
        };

        existing.games += 1;
        const won = (side === 'white' && g.winner === 'white') || (side === 'black' && g.winner === 'black');
        const drew = g.winner === 'draw';
        if (won) existing.wins += 1;
        if (drew) existing.draws += 1;

        if (g.sanMoves.length > 0) {
          existing.movesList.push(g.sanMoves.slice(0, 16));
        }

        groupsMap.set(groupKey, existing);
      }

      // Compute statistics and top line for each opening
      const detected: DetectedOpening[] = [];
      for (const [key, group] of groupsMap.entries()) {
        const scorePercent = Math.min(
          100,
          Math.max(0, Math.round(((group.wins + 0.5 * group.draws) / Math.max(group.games, 1)) * 100))
        );

        // Compute top line: the most frequent continuation
        // Count move frequencies at each ply
        let topLine: string[] = [];
        if (group.movesList.length > 0) {
          // Sort move sequences by length and pick the modal sequence
          const sortedSeq = [...group.movesList].sort((a, b) => b.length - a.length);
          topLine = sortedSeq[0] || [];
        }

        detected.push({
          key,
          name: group.name,
          side: group.side,
          gamesCount: group.games,
          scorePercent,
          movesList: group.movesList,
          topLine,
        });
      }

      // Sort by popularity: highest games count first
      detected.sort((a, b) => b.gamesCount - a.gamesCount);

      setDetectedOpenings(detected);
      // Select all detected openings by default (up to 12)
      const initialSelected = new Set<string>();
      detected.slice(0, 12).forEach((o) => initialSelected.add(o.key));
      setSelectedOpeningKeys(initialSelected);

      setIsAnalyzing(false);
      setStep('select');
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze games. Please check your internet connection.');
      setIsAnalyzing(false);
      setStep('input');
    }
  };

  // Toggle selection of an opening card
  const toggleOpeningSelection = (key: string) => {
    setSelectedOpeningKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Cancel analysis in progress
  const handleCancelAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsAnalyzing(false);
    setStep('input');
  };

  // Step 2 -> Create Repertoire and Save to D1 / Dexie
  const handleCreateRepertoire = async () => {
    const selected = detectedOpenings.filter((o) => selectedOpeningKeys.has(o.key));
    if (selected.length === 0) return;

    setIsSaving(true);
    setError(null);

    try {
      const whiteOpenings = selected.filter((o) => o.side === 'white');
      const blackOpenings = selected.filter((o) => o.side === 'black');

      let createdRepertoireId = '';

      // Helper to process and insert lines for a side
      const buildSideRepertoire = async (
        color: 'white' | 'black',
        openings: DetectedOpening[]
      ): Promise<string> => {
        const now = Date.now();
        const repId = `rep_${color}_games_${now}`;
        const repName = color === 'white' ? 'My White Repertoire' : 'My Black Repertoire';
        const description = `Built automatically from your recent games (${openings.length} openings)`;

        // 1. Create Repertoire in D1
        await fetch('/api/study/repertoires', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: repId,
            name: repName,
            color,
            description,
          }),
        });

        // 2. Put Repertoire in Dexie
        const repRecord: Repertoire = {
          id: repId,
          name: repName,
          color,
          description,
          createdAt: now,
          updatedAt: now,
        };
        await db.repertoires.put(repRecord);

        // 3. Extract and play moves for each opening
        const allBatchMoves: Array<{
          fromFen: string;
          toFen: string;
          san: string;
          uci: string;
          sortOrder: number;
          annotation?: { comment?: string };
        }> = [];

        // Ensure Root Node exists
        const rootNode: RepertoireNode = {
          id: fenToNodeId(STARTING_FEN),
          fen: STARTING_FEN,
          comments: 'Starting Position',
          annotations: [],
        };
        await db.nodes.put(rootNode);

        for (let opIdx = 0; opIdx < openings.length; opIdx++) {
          const opening = openings[opIdx];
          const chess = new Chess(STARTING_FEN);

          // Play up to 14 plies of the top line
          const movesToPlay = opening.topLine.slice(0, 14);
          for (let mIdx = 0; mIdx < movesToPlay.length; mIdx++) {
            const san = movesToPlay[mIdx];
            const fromFen = chess.fen();
            const fromNodeId = fenToNodeId(fromFen);

            try {
              const move = chess.move(san);
              if (!move) break;

              const toFen = chess.fen();
              const toNodeId = fenToNodeId(toFen);
              const uci = move.from + move.to + (move.promotion ?? '');

              const annotation =
                mIdx === movesToPlay.length - 1
                  ? { comment: opening.name }
                  : undefined;

              allBatchMoves.push({
                fromFen,
                toFen,
                san: move.san,
                uci,
                sortOrder: mIdx,
                annotation,
              });

              // Put Node and Edge into local Dexie for instant offline availability
              const targetNode: RepertoireNode = {
                id: toNodeId,
                fen: toFen,
                comments: annotation?.comment || '',
                annotations: [],
              };
              await db.nodes.put(targetNode);

              const edgeRecord: RepertoireEdge = {
                fromNodeId,
                toNodeId,
                san: move.san,
                uci,
                repertoireId: repId,
                sortOrder: mIdx,
                annotation,
              };
              await db.edges.put(edgeRecord);

              // Put Card into local Dexie
              const cardId = `card_${toNodeId}_${repId}`;
              const card = createCard(toNodeId);
              card.id = cardId;
              if (alreadyKnow) {
                card.state = 'review';
                card.reps = 1;
                card.stability = 2.3;
                card.difficulty = 5.0;
                card.lastReview = now;
                card.dueDate = now + 86400000;
              }
              await db.cards.put(card);
            } catch {
              break;
            }
          }
        }

        // 4. Batch Save moves & cards to Cloudflare D1
        if (allBatchMoves.length > 0) {
          await fetch('/api/study/moves', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              moves: allBatchMoves,
              repertoireId: repId,
              initialLearned: alreadyKnow,
            }),
          });
        }

        return repId;
      };

      // Create Black repertoire if black openings selected
      if (blackOpenings.length > 0) {
        const blackRepId = await buildSideRepertoire('black', blackOpenings);
        createdRepertoireId = blackRepId;
      }

      // Create White repertoire if white openings selected
      if (whiteOpenings.length > 0) {
        const whiteRepId = await buildSideRepertoire('white', whiteOpenings);
        // Default to the side with the most games
        if (!createdRepertoireId || whiteOpenings.length >= blackOpenings.length) {
          createdRepertoireId = whiteRepId;
        }
      }

      setIsSaving(false);
      onClose();
      if (createdRepertoireId) {
        onRepertoireCreated(createdRepertoireId);
      }
    } catch (err) {
      console.error('Failed to create repertoire from games:', err);
      setError(err instanceof Error ? err.message : 'Failed to save repertoire to database.');
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-[560px] rounded-2xl border border-white/10 bg-[#111827] p-6 shadow-2xl text-white my-8"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top-Right Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 text-gray-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

          {/* ========================================================================= */}
          {/* STEP 1: USERNAME INPUT (MATCHING SCREENSHOT 1 & 2) */}
          {/* ========================================================================= */}
          {step === 'input' || step === 'analyzing' ? (
            <div>
              {/* Header */}
              <div className="mb-6">
                <h2 className="text-2xl font-bold tracking-tight text-white">
                  Build a repertoire from your games
                </h2>
                <p className="text-sm text-gray-400 mt-1 leading-snug">
                  We scan your recent games and turn the openings you play most into ready-to-train lines.
                </p>
              </div>

              {/* Input Cards */}
              <div className="space-y-3 mb-4">
                {/* 1. Lichess Username Card */}
                <div
                  className={`rounded-2xl border transition-all p-3.5 px-4 flex items-center gap-3.5 ${
                    lichessUsername.trim()
                      ? 'border-emerald-500/40 bg-[#0B0F17]'
                      : 'border-white/10 bg-[#0B0F17]/70 focus-within:border-emerald-500/40'
                  }`}
                >
                  {/* Knight Icon Circle */}
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5 border border-white/10 text-gray-300">
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 20v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                      <path d="M12 4a3 3 0 0 0-3 3v3h6V7a3 3 0 0 0-3-3z" />
                      <circle cx="10" cy="8" r="1" fill="currentColor" />
                    </svg>
                  </div>

                  <div className="flex-1 min-w-0">
                    <span className="block text-[0.65rem] font-bold tracking-wider uppercase text-gray-400">
                      LICHESS USERNAME
                    </span>
                    <input
                      type="text"
                      value={lichessUsername}
                      onChange={(e) => setLichessUsername(e.target.value)}
                      placeholder="e.g. magnuscarlsen"
                      disabled={isAnalyzing}
                      onKeyDown={(e) => e.key === 'Enter' && handleAnalyzeGames()}
                      className="w-full bg-transparent text-base font-semibold text-white outline-none placeholder-gray-600 mt-0.5"
                    />
                  </div>

                  {/* Green Checkmark Badge */}
                  {lichessUsername.trim() && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 shadow-xs">
                      <Check className="h-4 w-4" />
                    </div>
                  )}
                </div>

                {/* 2. Chess.com Username Card */}
                <div
                  className={`rounded-2xl border transition-all p-3.5 px-4 flex items-center gap-3.5 ${
                    chesscomUsername.trim()
                      ? 'border-emerald-500/40 bg-[#0B0F17]'
                      : 'border-white/10 bg-[#0B0F17]/70 focus-within:border-emerald-500/40'
                  }`}
                >
                  {/* Green Pawn Icon Circle */}
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5 border border-white/10 text-emerald-400 text-xl font-bold">
                    ♟
                  </div>

                  <div className="flex-1 min-w-0">
                    <span className="block text-[0.65rem] font-bold tracking-wider uppercase text-gray-400">
                      CHESS.COM USERNAME
                    </span>
                    <input
                      type="text"
                      value={chesscomUsername}
                      onChange={(e) => setChesscomUsername(e.target.value)}
                      placeholder="e.g. hikaru"
                      disabled={isAnalyzing}
                      onKeyDown={(e) => e.key === 'Enter' && handleAnalyzeGames()}
                      className="w-full bg-transparent text-base font-semibold text-white outline-none placeholder-gray-600 mt-0.5"
                    />
                  </div>

                  {/* Green Checkmark Badge */}
                  {chesscomUsername.trim() && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 shadow-xs">
                      <Check className="h-4 w-4" />
                    </div>
                  )}
                </div>
              </div>

              {/* Security Note */}
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-6">
                <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>Only your public games are scanned. We never ask for a password.</span>
              </div>

              {/* Analyzing Progress Card (Screenshot 2) */}
              {isAnalyzing && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 rounded-2xl border border-amber-500/30 bg-[#141B29] p-3.5 px-4 flex items-center justify-between shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-amber-400 shrink-0" />
                    <span className="text-sm font-medium text-gray-200">
                      {scannedGamesCount > 0
                        ? `Analyzing ${scannedGamesCount} games...`
                        : 'Connecting to Lichess & Chess.com...'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelAnalysis}
                    className="text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </motion.div>
              )}

              {/* Error Alert */}
              {error && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                  <span>{error}</span>
                </div>
              )}

              {/* Bottom Actions */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isAnalyzing}
                  className="rounded-xl border border-white/10 bg-[#1E293B] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#334155] transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAnalyzeGames}
                  disabled={isAnalyzing || (!lichessUsername.trim() && !chesscomUsername.trim())}
                  className="flex items-center gap-2 rounded-xl bg-[#EAB308] hover:bg-[#FACC15] disabled:opacity-50 px-6 py-2.5 text-xs font-bold text-[#0B0F17] shadow-lg transition-all active:scale-[0.98] cursor-pointer"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-[#0B0F17]" />
                      <span>Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4 text-[#0B0F17]" />
                      <span>Analyze my games</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* ========================================================================= */
            /* STEP 2: PICK OPENINGS TO KEEP (MATCHING SCREENSHOT 3) */
            /* ========================================================================= */
            <div>
              {/* Header */}
              <div className="mb-5">
                <h2 className="text-2xl font-bold tracking-tight text-white">
                  Pick the openings to keep
                </h2>
                <p className="text-xs text-gray-400 mt-1 leading-snug">
                  Each opening becomes a chapter: the theory, then the continuation you play most. You get one repertoire per side.
                </p>
              </div>

              {/* Openings List */}
              <div className="max-h-[360px] overflow-y-auto space-y-2.5 pr-1.5 [scrollbar-width:thin] [scrollbar-color:#334155_transparent] mb-3">
                {detectedOpenings.map((opening) => {
                  const isSelected = selectedOpeningKeys.has(opening.key);
                  return (
                    <div
                      key={opening.key}
                      onClick={() => toggleOpeningSelection(opening.key)}
                      className={`rounded-2xl border transition-all p-3.5 px-4 flex items-center justify-between gap-3 cursor-pointer ${
                        isSelected
                          ? 'border-amber-500/50 bg-[#141B29] hover:border-amber-400'
                          : 'border-white/10 bg-[#0F172A]/80 opacity-60 hover:opacity-100 hover:border-white/20'
                      }`}
                    >
                      {/* Left: Gold Checkbox + Title */}
                      <div className="flex items-center gap-3.5 min-w-0">
                        {/* Gold Checkbox */}
                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors ${
                            isSelected
                              ? 'bg-[#EAB308] text-[#0B0F17] font-bold shadow-xs'
                              : 'border border-gray-600 bg-transparent'
                          }`}
                        >
                          {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                        </div>

                        {/* Title and Side */}
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-white truncate max-w-[340px]" title={opening.name}>
                            {opening.name}
                          </h4>
                          <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-0.5">
                            {opening.side === 'white' ? (
                              <>
                                <span className="inline-block h-2 w-2 rounded-full bg-white shadow-xs" />
                                <span>as White · {opening.gamesCount} games</span>
                              </>
                            ) : (
                              <>
                                <span className="inline-block h-2 w-2 rounded-full border border-gray-400 bg-transparent" />
                                <span>as Black · {opening.gamesCount} games</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Score */}
                      <div className="text-right shrink-0 pl-2">
                        <span className="block text-base font-extrabold text-white font-mono">
                          {opening.scorePercent}%
                        </span>
                        <span className="block text-[0.6rem] font-bold text-gray-400 tracking-wider uppercase">
                          SCORE
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* "I already know these lines" Card */}
              <div
                onClick={() => setAlreadyKnow(!alreadyKnow)}
                className="rounded-2xl border border-white/10 bg-[#111827] p-3.5 px-4 flex items-start gap-3.5 cursor-pointer hover:border-white/20 transition-colors mb-5"
              >
                {/* Gold Checkbox */}
                <div
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors ${
                    alreadyKnow
                      ? 'bg-[#EAB308] text-[#0B0F17] font-bold shadow-xs'
                      : 'border border-gray-600 bg-transparent'
                  }`}
                >
                  {alreadyKnow && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                </div>

                <div>
                  <h4 className="text-xs font-bold text-white">I already know these lines</h4>
                  <p className="text-[0.7rem] text-gray-400 mt-0.5 leading-snug">
                    Mark everything as learned so it goes straight to the review queue. Leave unchecked to learn the lines from scratch.
                  </p>
                </div>
              </div>

              {/* Error Alert */}
              {error && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                  <span>{error}</span>
                </div>
              )}

              {/* Bottom Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setStep('input')}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#1E293B] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#334155] transition-colors cursor-pointer disabled:opacity-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={handleCreateRepertoire}
                  disabled={selectedOpeningKeys.size === 0 || isSaving}
                  className="flex items-center gap-2 rounded-xl bg-[#EAB308] hover:bg-[#FACC15] disabled:opacity-50 px-6 py-2.5 text-xs font-bold text-[#0B0F17] shadow-lg transition-all active:scale-[0.98] cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-[#0B0F17]" />
                      <span>Saving to Repertoire...</span>
                    </>
                  ) : (
                    <span>Create repertoire</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
