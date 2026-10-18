'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Fire,
  CheckCircle,
  XCircle,
  Question,
  ArrowCounterClockwise,
  Sparkle,
  Trophy,
  ArrowRight,
  Lightning,
  Lightbulb,
  PuzzlePiece,
} from '@phosphor-icons/react';
import { TurnIndicatorBadge } from '@/components/icons/ChessPieceIcons';
import ChessBoard from './ChessBoard';

interface Puzzle {
  id: string;
  fen: string;
  turn: 'white' | 'black';
  title: string;
  theme: string;
  rating: number;
  solutionSan: string;
  solutionText: string;
}

const SAMPLE_PUZZLES: Puzzle[] = [
  {
    id: 'p1',
    fen: 'r1b1k2r/pppp1ppp/8/4q3/1bP5/2N1P3/PP1B1PPP/R2QKB1R w KQkq - 0 1',
    turn: 'white',
    title: 'Pin & Win Material',
    theme: 'Tactical Discovery',
    rating: 1720,
    solutionSan: 'Nd5',
    solutionText: '1. Nd5! attacks the bishop on b4 and targets c7 fork.',
  },
  {
    id: 'p2',
    fen: 'r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 0 5',
    turn: 'white',
    title: 'The Italian Strike',
    theme: 'Removal of Defender',
    rating: 1680,
    solutionSan: 'd4',
    solutionText: '1. d4! breaks open the center and regains piece with tempo.',
  },
  {
    id: 'p3',
    fen: 'r2q1rk1/1pp2ppp/p1np1n2/2b1p1B1/2B1P1b1/2NP1N2/PPP2PPP/R2Q1RK1 w - - 0 8',
    turn: 'white',
    title: 'Master Pin on f6',
    theme: 'Outpost & Tension',
    rating: 1810,
    solutionSan: 'Nd5',
    solutionText: '1. Nd5! exploits the f6 pin, increasing overwhelming pressure on Black.',
  },
  {
    id: 'p4',
    fen: 'r1b2rk1/pp1p1ppp/2n1pn2/8/1bP5/2N1PN2/PP1B1PPP/R3KB1R w KQ - 0 9',
    turn: 'white',
    title: 'Discovered Double Attack',
    theme: 'Fork & Central Domination',
    rating: 1750,
    solutionSan: 'a3',
    solutionText: '1. a3! forces Black bishop to declare intentions, seizing initiative.',
  },
];

export default function PuzzlesView() {
  const [puzzles, setPuzzles] = useState<Puzzle[]>(SAMPLE_PUZZLES);
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [solved, setSolved] = useState<boolean | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [streak, setStreak] = useState(0);
  const [userRating, setUserRating] = useState(1500);

  // Load persistent stats and live daily puzzle
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedStreak = localStorage.getItem('cc_puzzle_streak');
      const savedRating = localStorage.getItem('cc_puzzle_rating');
      if (savedStreak) setStreak(Number(savedStreak) || 0);
      if (savedRating) setUserRating(Number(savedRating) || 1500);
    }

    // Fetch live daily puzzle
    fetch('/api/puzzles/daily')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.puzzle) {
          setPuzzles((prev) => [data.puzzle, ...prev.filter((p) => p.id !== data.puzzle.id)]);
        }
      })
      .catch((err) => console.warn('Failed to fetch daily puzzle:', err));
  }, []);

  const currentPuzzle = puzzles[puzzleIndex % puzzles.length];

  const handleMove = useCallback(
    (move: { san: string }) => {
      if (solved !== null) return;
      if (move.san === currentPuzzle.solutionSan) {
        setSolved(true);
        setStreak((s) => {
          const next = s + 1;
          if (typeof window !== 'undefined') localStorage.setItem('cc_puzzle_streak', String(next));
          return next;
        });
        setUserRating((r) => {
          const next = r + 12;
          if (typeof window !== 'undefined') localStorage.setItem('cc_puzzle_rating', String(next));
          return next;
        });
      } else {
        setSolved(false);
        setStreak(() => {
          if (typeof window !== 'undefined') localStorage.setItem('cc_puzzle_streak', '0');
          return 0;
        });
        setUserRating((r) => {
          const next = Math.max(1000, r - 8);
          if (typeof window !== 'undefined') localStorage.setItem('cc_puzzle_rating', String(next));
          return next;
        });
      }
    },
    [solved, currentPuzzle]
  );

  const handleNextPuzzle = () => {
    setSolved(null);
    setShowHint(false);
    setShowSolution(false);
    setPuzzleIndex((i) => i + 1);
  };

  return (
    <div className="w-full min-h-[calc(100dvh-3.5rem)] bg-[#0B0F17] p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/20 text-amber-400 font-bold">
                <PuzzlePiece size={18} weight="duotone" />
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-white">Daily Tactical Puzzles</h1>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Sharp tactical drills matched to your active repertoire themes.
            </p>
          </div>

          {/* Stats Badges */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-xl bg-white/5 border border-white/5 px-3 py-1.5 text-xs">
              <Lightning size={16} weight="fill" className="text-amber-400" />
              <span className="text-gray-400">Rating:</span>
              <span className="font-bold text-white tabular-nums">{userRating}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-xl bg-orange-500/10 border border-orange-500/20 px-3 py-1.5 text-xs text-orange-400 font-bold">
              <Fire size={16} weight="fill" />
              <span className="tabular-nums">Streak: {streak}</span>
            </div>
          </div>
        </div>

        {/* Main Grid: Board + Details */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: ChessBoard */}
          <div className="lg:col-span-7 rounded-2xl border border-white/10 bg-[#111726] p-4">
            <div className="mb-3 flex items-center justify-between px-1">
              <TurnIndicatorBadge
                turn={currentPuzzle.turn}
                label={currentPuzzle.turn === 'white' ? 'White to move' : 'Black to move'}
              />
              <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[0.65rem] font-bold text-gray-400 font-mono">
                Puzzle #{puzzleIndex + 1} · {currentPuzzle.rating}
              </span>
            </div>
            <div className="max-w-[460px] mx-auto">
              <ChessBoard
                fen={currentPuzzle.fen}
                orientation={currentPuzzle.turn}
                onMove={handleMove}
                interactive={solved === null}
              />
            </div>
          </div>

          {/* Right: Info & Controls */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-2xl border border-white/10 bg-[#111726] p-5 shadow-xl space-y-4">
              <div>
                <span className="text-[0.65rem] font-bold uppercase tracking-wider text-amber-400">
                  {currentPuzzle.theme}
                </span>
                <h3 className="text-lg font-bold text-white mt-0.5">{currentPuzzle.title}</h3>
                <p className="text-xs text-gray-400 mt-1">
                  Find the best move on the board to convert the position or win material.
                </p>
              </div>

              {/* Status Banner */}
              <AnimatePresence mode="wait">
                {solved === true && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 flex items-center gap-3"
                  >
                    <CheckCircle size={20} weight="fill" className="text-emerald-400 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-emerald-300">Brilliant! That is correct.</p>
                      <p className="text-[0.7rem] text-gray-300 font-mono mt-0.5">
                        {currentPuzzle.solutionText}
                      </p>
                    </div>
                  </motion.div>
                )}

                {solved === false && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 flex items-center gap-3"
                  >
                    <XCircle size={20} weight="fill" className="text-rose-400 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-rose-300">Not quite the best line.</p>
                      <p className="text-[0.7rem] text-gray-400 mt-0.5">
                        Try looking for pins and vulnerable defenders.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Hint Box */}
              {showHint && !solved && (
                <div className="rounded-xl bg-white/5 p-3 text-xs text-amber-300 border border-amber-500/20 flex items-center gap-2">
                  <Lightbulb size={16} weight="duotone" className="shrink-0" />
                  <span>Hint: Look for active knight jump or center breaks.</span>
                </div>
              )}

              {/* Solution Box */}
              {showSolution && (
                <div className="rounded-xl bg-white/5 p-3 text-xs text-gray-200 border border-white/10 font-mono">
                  Solution: {currentPuzzle.solutionText}
                </div>
              )}

              {/* Actions */}
              <div className="pt-2 flex flex-col gap-2">
                {solved === null ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowHint(true)}
                      className="flex-1 rounded-xl bg-white/5 hover:bg-white/10 px-3 py-2 text-xs font-bold text-gray-300 transition-colors duration-150 cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Lightbulb size={15} weight="duotone" />
                      <span>Hint</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSolution(true)}
                      className="flex-1 rounded-xl bg-white/5 hover:bg-white/10 px-3 py-2 text-xs font-bold text-gray-300 transition-colors duration-150 cursor-pointer"
                    >
                      Reveal
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleNextPuzzle}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-4 py-2.5 text-xs font-bold text-stone-950 transition-colors duration-150 cursor-pointer active:scale-[0.98] shadow-xs"
                  >
                    <span>Next Puzzle</span>
                    <ArrowRight size={16} weight="bold" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
