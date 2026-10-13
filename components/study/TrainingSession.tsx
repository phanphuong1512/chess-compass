'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, SkipForward, RotateCcw, Trophy, Flame, Target } from 'lucide-react';
import ChessBoard from './ChessBoard';
import type { FSRSCard, FSRSRating, RepertoireNode, RepertoireEdge } from '@/types/chess';
import { scheduleReview, formatInterval, predictIntervals, getDueCards } from '@/lib/fsrs/scheduler';

interface TrainingSessionProps {
  cards: FSRSCard[];
  nodes: Map<string, RepertoireNode>;
  edges: Map<string, RepertoireEdge[]>;
  onUpdateCard: (card: FSRSCard) => void;
  onComplete: () => void;
}

type SessionState = 'showing' | 'correct' | 'incorrect' | 'complete';

export default function TrainingSession({
  cards: allCards,
  nodes,
  edges,
  onUpdateCard,
  onComplete,
}: TrainingSessionProps) {
  const dueCards = useMemo(() => getDueCards(allCards), [allCards]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionState, setSessionState] = useState<SessionState>('showing');
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [correct, setCorrect] = useState(0);

  const currentCard = dueCards[currentIndex];
  const currentNode = currentCard ? nodes.get(currentCard.nodeId) : undefined;
  const currentEdges = currentCard ? (edges.get(currentCard.nodeId) ?? []) : [];
  const expectedMove = currentEdges[0]; // The main line move to guess

  const intervals = useMemo(() => {
    if (!currentCard) return { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<FSRSRating, number>;
    return predictIntervals(currentCard);
  }, [currentCard]);

  const handleMove = useCallback((move: { san: string }) => {
    if (sessionState !== 'showing' || !expectedMove) return;

    if (move.san === expectedMove.san) {
      setSessionState('correct');
      setStreak((s) => {
        const newStreak = s + 1;
        setMaxStreak((m) => Math.max(m, newStreak));
        return newStreak;
      });
      setCorrect((c) => c + 1);
    } else {
      setSessionState('incorrect');
      setStreak(0);
    }
  }, [sessionState, expectedMove]);

  const handleRating = useCallback((rating: FSRSRating) => {
    if (!currentCard) return;

    const { card: updatedCard } = scheduleReview(currentCard, rating);
    onUpdateCard(updatedCard);
    setReviewed((r) => r + 1);

    // Move to next card
    if (currentIndex + 1 < dueCards.length) {
      setCurrentIndex((i) => i + 1);
      setSessionState('showing');
    } else {
      setSessionState('complete');
    }
  }, [currentCard, currentIndex, dueCards.length, onUpdateCard]);

  if (!currentCard || !currentNode || sessionState === 'complete') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center gap-6 rounded-2xl border border-white/10 bg-[#111827]/80 p-8 backdrop-blur-md"
      >
        <Trophy className="h-16 w-16 text-[#10B981]" />
        <h2 className="text-2xl font-bold text-white">Session Complete!</h2>
        <div className="grid grid-cols-3 gap-6 text-center">
          <div>
            <p className="text-3xl font-bold text-[#10B981]">{reviewed}</p>
            <p className="text-xs text-gray-400">Reviewed</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-[#8B5CF6]">{correct}</p>
            <p className="text-xs text-gray-400">Correct</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-yellow-400">{maxStreak}</p>
            <p className="text-xs text-gray-400">Best Streak</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onComplete}
          className="mt-4 rounded-lg bg-[#10B981] px-6 py-2.5 font-medium text-white transition-colors hover:bg-[#059669]"
        >
          Done
        </button>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stats bar */}
      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#111827]/80 px-4 py-2 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Target className="h-4 w-4 text-[#10B981]" />
            <span className="text-sm text-gray-300">
              {currentIndex + 1}/{dueCards.length}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Flame className="h-4 w-4 text-orange-400" />
            <span className="text-sm text-orange-300">{streak}</span>
          </div>
        </div>
        <span className="text-xs text-gray-500">
          {Math.round((correct / Math.max(reviewed, 1)) * 100)}% accuracy
        </span>
      </div>

      {/* Board */}
      <ChessBoard
        fen={currentNode.fen}
        onMove={sessionState === 'showing' ? handleMove : undefined}
        interactive={sessionState === 'showing'}
        arrows={
          expectedMove && (sessionState === 'incorrect' || sessionState === 'correct')
            ? [{ from: expectedMove.uci.slice(0, 2), to: expectedMove.uci.slice(2, 4), color: sessionState === 'correct' ? '#10B981' : '#EF4444' }]
            : []
        }
      />

      {/* Feedback */}
      <AnimatePresence mode="wait">
        {sessionState === 'correct' && (
          <motion.div
            key="correct"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-xl border border-[#10B981]/30 bg-[#10B981]/10 p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <Check className="h-5 w-5 text-[#10B981]" />
              <span className="font-semibold text-[#10B981]">Correct! {expectedMove.san}</span>
            </div>
            <div className="flex gap-2">
              {([2, 3, 4] as FSRSRating[]).map((rating) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => handleRating(rating)}
                  className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium transition-colors ${
                    rating === 2
                      ? 'bg-orange-500/20 text-orange-300 hover:bg-orange-500/30'
                      : rating === 3
                        ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'
                        : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                  }`}
                >
                  <span className="block">{rating === 2 ? 'Hard' : rating === 3 ? 'Good' : 'Easy'}</span>
                  <span className="block text-[0.6rem] opacity-70 mt-0.5">{formatInterval(intervals[rating])}</span>
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
            className="rounded-xl border border-red-500/30 bg-red-500/10 p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <X className="h-5 w-5 text-red-400" />
              <span className="font-semibold text-red-400">
                Incorrect! The move was: <span className="font-mono">{expectedMove.san}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleRating(1)}
              className="w-full rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/30"
            >
              <RotateCcw className="mr-1.5 inline h-3.5 w-3.5" />
              Again — Review soon
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
