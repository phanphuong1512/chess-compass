'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  X,
  ArrowCounterClockwise,
  Trophy,
  Fire,
  Target,
  Lightning,
  Sparkle,
} from '@phosphor-icons/react';
import ChessBoard from './ChessBoard';
import MaterialDifferenceBar from './MaterialDifferenceBar';
import { calculateMaterial } from '@/lib/chess/material';
import { playMoveSound, playCaptureSound, playErrorSound } from '@/lib/chess/audio';
import type { FSRSCard, FSRSRating, RepertoireNode, RepertoireEdge } from '@/types/chess';
import { scheduleReview, formatInterval, predictIntervals, getDueCards } from '@/lib/fsrs/scheduler';

interface TrainingSessionProps {
  cards: FSRSCard[];
  nodes: Map<string, RepertoireNode>;
  edges: Map<string, RepertoireEdge[]>;
  onUpdateCard: (card: FSRSCard) => void;
  onComplete: () => void;
  orientation?: 'white' | 'black';
  repertoireName?: string;
  chapterTitle?: string;
}

type SessionState = 'showing' | 'correct' | 'incorrect' | 'complete';

export default function TrainingSession({
  cards: allCards,
  nodes,
  edges,
  onUpdateCard,
  onComplete,
  orientation = 'white',
  repertoireName,
  chapterTitle,
}: TrainingSessionProps) {
  const dueCards = useMemo(() => {
    const raw = getDueCards(allCards);
    // Filter cards where node exists and there is an outgoing edge to guess
    const valid = raw.filter(
      (c) => nodes.has(c.nodeId) && (edges.get(c.nodeId)?.length ?? 0) > 0
    );
    // If no due cards, fall back to any cards with outgoing moves (for Overstudy / Chapter training)
    if (valid.length === 0) {
      return allCards.filter(
        (c) => nodes.has(c.nodeId) && (edges.get(c.nodeId)?.length ?? 0) > 0
      );
    }
    return valid;
  }, [allCards, nodes, edges]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionState, setSessionState] = useState<SessionState>('showing');
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [playedMoveSan, setPlayedMoveSan] = useState<string | null>(null);

  const currentCard = dueCards[currentIndex];
  const currentNode = currentCard ? nodes.get(currentCard.nodeId) : undefined;
  const currentEdges = currentCard ? (edges.get(currentCard.nodeId) ?? []) : [];
  const expectedMove = currentEdges[0]; // Primary recommended move

  // Calculate material for current position
  const boardMaterial = useMemo(() => {
    return currentNode ? calculateMaterial(currentNode.fen) : null;
  }, [currentNode]);

  const intervals = useMemo(() => {
    if (!currentCard) return { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<FSRSRating, number>;
    return predictIntervals(currentCard);
  }, [currentCard]);

  // Handle user's played move on the board
  const handleMove = useCallback(
    (move: { from: string; to: string; san: string; promotion?: string }) => {
      if (sessionState !== 'showing' || !currentCard || currentEdges.length === 0) return;

      // Check if move matches ANY valid prepared edge in the repertoire
      const matchedEdge = currentEdges.find(
        (e) => e.san === move.san || (e.uci && e.uci.startsWith(move.from + move.to))
      );

      if (matchedEdge) {
        try {
          if (move.san.includes('x')) {
            playCaptureSound();
          } else {
            playMoveSound();
          }
        } catch {}

        setPlayedMoveSan(matchedEdge.san);
        setSessionState('correct');
        setStreak((s) => {
          const newStreak = s + 1;
          setMaxStreak((m) => Math.max(m, newStreak));
          return newStreak;
        });
        setCorrect((c) => c + 1);
      } else {
        try {
          playErrorSound();
        } catch {}

        setSessionState('incorrect');
        setStreak(0);
      }
    },
    [sessionState, currentCard, currentEdges]
  );

  const handleRating = useCallback(
    (rating: FSRSRating) => {
      if (!currentCard) return;

      const { card: updatedCard } = scheduleReview(currentCard, rating);
      onUpdateCard(updatedCard);
      setReviewed((r) => r + 1);

      // Move to next card
      if (currentIndex + 1 < dueCards.length) {
        setCurrentIndex((i) => i + 1);
        setSessionState('showing');
        setPlayedMoveSan(null);
      } else {
        setSessionState('complete');
      }
    },
    [currentCard, currentIndex, dueCards.length, onUpdateCard]
  );

  // Keyboard navigation for SRS ratings (1 = Again, 2 = Hard, 3 = Good, 4 = Easy, Space = Good)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (sessionState === 'correct') {
        if (e.key === ' ' || e.key === 'Enter' || e.key === '3') {
          e.preventDefault();
          handleRating(3);
        } else if (e.key === '2') {
          e.preventDefault();
          handleRating(2);
        } else if (e.key === '4') {
          e.preventDefault();
          handleRating(4);
        }
      } else if (sessionState === 'incorrect') {
        if (e.key === ' ' || e.key === 'Enter' || e.key === '1') {
          e.preventDefault();
          handleRating(1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sessionState, handleRating]);

  if (!currentCard || !currentNode || sessionState === 'complete') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center gap-6 rounded-2xl border border-white/10 bg-[#111827]/90 p-8 backdrop-blur-md text-white shadow-2xl"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
          <Trophy size={40} weight="duotone" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-extrabold text-white">Session Complete!</h2>
          <p className="text-xs text-gray-400 mt-1">
            {repertoireName || 'Repertoire'} · All due cards reviewed
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6 text-center w-full max-w-xs py-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-2xl font-bold text-emerald-400 font-mono">{reviewed}</p>
            <p className="text-[0.68rem] text-gray-400 uppercase tracking-wider mt-0.5">Reviewed</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-2xl font-bold text-blue-400 font-mono">
              {reviewed > 0 ? Math.round((correct / reviewed) * 100) : 100}%
            </p>
            <p className="text-[0.68rem] text-gray-400 uppercase tracking-wider mt-0.5">Accuracy</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-2xl font-bold text-amber-400 font-mono">{maxStreak}</p>
            <p className="text-[0.68rem] text-gray-400 uppercase tracking-wider mt-0.5">Best Streak</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onComplete}
          className="rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 px-8 py-3 text-sm font-bold text-stone-950 transition-transform active:scale-[0.98] cursor-pointer shadow-lg"
        >
          Return to Dashboard
        </button>
      </motion.div>
    );
  }

  const isWhiteTurn = currentNode.fen.split(' ')[1] === 'w';

  return (
    <div className="flex flex-col gap-3 max-w-[490px] mx-auto w-full text-white">
      {/* Session Header & Telemetry */}
      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#141B29] px-4 py-2.5 shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-300 font-medium">
            <Target size={16} weight="duotone" className="text-emerald-400" />
            <span className="font-mono">
              {currentIndex + 1} / {dueCards.length}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-orange-400 font-bold">
            <Fire size={16} weight="fill" />
            <span className="font-mono">{streak}</span>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[0.68rem] font-bold text-amber-400 block truncate max-w-[200px]">
            {chapterTitle || repertoireName || 'Repertoire Practice'}
          </span>
          <span className="text-[0.65rem] text-gray-400 font-mono">
            {isWhiteTurn ? 'White to move' : 'Black to move'}
          </span>
        </div>
      </div>

      {/* Top Player Material Bar */}
      {boardMaterial && (
        <MaterialDifferenceBar
          material={orientation === 'white' ? boardMaterial.black : boardMaterial.white}
          pieceColor={orientation === 'white' ? 'white' : 'black'}
          playerName={orientation === 'white' ? 'Opponent' : 'You'}
          className="px-2"
        />
      )}

      {/* Board */}
      <div className="aspect-square relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-[#141B29]">
        <ChessBoard
          fen={currentNode.fen}
          orientation={orientation}
          onMove={sessionState === 'showing' ? handleMove : undefined}
          interactive={sessionState === 'showing'}
          arrows={
            expectedMove && (sessionState === 'incorrect' || sessionState === 'correct')
              ? [
                  {
                    from: expectedMove.uci.slice(0, 2),
                    to: expectedMove.uci.slice(2, 4),
                    color: sessionState === 'correct' ? '#10B981' : '#EF4444',
                  },
                ]
              : []
          }
        />
      </div>

      {/* Bottom Player Material Bar */}
      {boardMaterial && (
        <MaterialDifferenceBar
          material={orientation === 'white' ? boardMaterial.white : boardMaterial.black}
          pieceColor={orientation === 'white' ? 'black' : 'white'}
          playerName={orientation === 'white' ? 'You' : 'Opponent'}
          className="px-2"
        />
      )}

      {/* Feedback & SRS Rating Controls */}
      <AnimatePresence mode="wait">
        {sessionState === 'correct' && (
          <motion.div
            key="correct"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 shadow-xl"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <Check size={14} weight="bold" />
                </div>
                <span className="text-sm font-bold text-emerald-300">
                  Correct! <span className="font-mono text-white">{playedMoveSan || expectedMove.san}</span>
                </span>
              </div>
              <span className="text-[0.65rem] text-emerald-400 font-medium">Press Space to continue</span>
            </div>

            <div className="flex gap-2">
              {([2, 3, 4] as FSRSRating[]).map((rating) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => handleRating(rating)}
                  className={`flex-1 rounded-xl px-3 py-2 text-center text-xs font-bold transition-all cursor-pointer border shadow-sm ${
                    rating === 2
                      ? 'border-orange-500/30 bg-orange-500/15 text-orange-300 hover:bg-orange-500/25'
                      : rating === 3
                        ? 'border-blue-500/30 bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'
                        : 'border-emerald-500/30 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                  }`}
                >
                  <span className="block">{rating === 2 ? 'Hard (2)' : rating === 3 ? 'Good (Space)' : 'Easy (4)'}</span>
                  <span className="block text-[0.62rem] opacity-75 font-mono mt-0.5">
                    {formatInterval(intervals[rating])}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {sessionState === 'incorrect' && (
          <motion.div
            key="incorrect"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 shadow-xl"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/20 text-rose-400">
                <X size={14} weight="bold" />
              </div>
              <span className="text-sm font-bold text-rose-300">
                Incorrect! Expected: <span className="font-mono text-white">{expectedMove?.san || ''}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleRating(1)}
              className="w-full rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 px-4 py-2.5 text-xs font-bold text-rose-200 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              <ArrowCounterClockwise size={15} weight="bold" />
              <span>Again (1) — Review soon</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
