'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Chess, type Square, type Move } from 'chess.js';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { motion, AnimatePresence } from 'framer-motion';
import { playMoveSound, playCaptureSound, playCheckSound, playErrorSound } from '@/lib/chess/audio';

interface ChessBoardProps {
  fen: string;
  onMove?: (move: { from: string; to: string; san: string; promotion?: string }) => void;
  orientation?: 'white' | 'black';
  interactive?: boolean;
  lastMove?: { from: string; to: string } | null;
  arrows?: Array<{ from: string; to: string; color: string }>;
  showCoordinates?: boolean;
}

export default function ChessBoard({
  fen,
  onMove,
  orientation = 'white',
  interactive = true,
  lastMove = null,
  arrows = [],
  showCoordinates = true,
}: ChessBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<Api | null>(null);
  const [promotionPending, setPromotionPending] = useState<{ from: Key; dest: Key } | null>(null);

  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);

  // Compute legal destination squares for the active turn
  const legalDests = useMemo(() => {
    if (!interactive) return new Map<Key, Key[]>();
    const dests = new Map<Key, Key[]>();
    const moves = chess.moves({ verbose: true }) as Move[];
    for (const m of moves) {
      const from = m.from as Key;
      const to = m.to as Key;
      const list = dests.get(from) || [];
      list.push(to);
      dests.set(from, list);
    }
    return dests;
  }, [chess, interactive]);

  // Convert arrow coordinates to Chessground DrawShape
  const autoShapes = useMemo((): DrawShape[] => {
    return arrows.map((a) => {
      let brush = 'green';
      if (a.color === 'red' || a.color.includes('red') || a.color.includes('EF4444')) brush = 'red';
      else if (a.color === 'blue' || a.color.includes('blue') || a.color.includes('3B82F6')) brush = 'blue';
      else if (a.color === 'yellow' || a.color.includes('yellow') || a.color.includes('EAB308')) brush = 'yellow';
      return {
        orig: a.from as Key,
        dest: a.to as Key,
        brush,
      };
    });
  }, [arrows]);

  const handleAfterMove = useCallback(
    (orig: Key, dest: Key) => {
      const piece = chess.get(orig as Square);
      const isPromotion = piece?.type === 'p' && (dest[1] === '8' || dest[1] === '1');

      if (isPromotion) {
        setPromotionPending({ from: orig, dest });
        return;
      }

      try {
        const move = chess.move({
          from: orig as Square,
          to: dest as Square,
        });

        if (move) {
          if (chess.inCheck()) playCheckSound();
          else if (move.captured) playCaptureSound();
          else playMoveSound();

          onMove?.({
            from: move.from,
            to: move.to,
            san: move.san,
          });
        }
      } catch {
        playErrorSound();
        // Revert board
        groundRef.current?.set({ fen: chess.fen() });
      }
    },
    [chess, onMove]
  );

  const handlePromotion = useCallback(
    (piece: 'q' | 'r' | 'b' | 'n') => {
      if (!promotionPending) return;
      try {
        const move = chess.move({
          from: promotionPending.from as Square,
          to: promotionPending.dest as Square,
          promotion: piece,
        });

        if (move) {
          if (chess.inCheck()) playCheckSound();
          else if (move.captured) playCaptureSound();
          else playMoveSound();

          onMove?.({
            from: move.from,
            to: move.to,
            san: move.san,
            promotion: piece,
          });
        }
      } catch {
        playErrorSound();
        groundRef.current?.set({ fen: chess.fen() });
      }
      setPromotionPending(null);
    },
    [promotionPending, chess, onMove]
  );

  // Initialize and update Chessground instance
  useEffect(() => {
    if (!containerRef.current) return;

    const turnColor = chess.turn() === 'w' ? 'white' : 'black';
    const check = chess.inCheck() ? turnColor : false;
    const lastMoveArray = lastMove ? ([lastMove.from as Key, lastMove.to as Key] as [Key, Key]) : undefined;

    const config: Config = {
      fen: chess.fen(),
      orientation,
      turnColor,
      check,
      lastMove: lastMoveArray,
      coordinates: showCoordinates,
      animation: {
        enabled: true,
        duration: 200,
      },
      movable: {
        free: false,
        color: interactive ? turnColor : undefined,
        dests: legalDests,
        showDests: true,
        events: {
          after: handleAfterMove,
        },
      },
      drawable: {
        enabled: true,
        visible: true,
        autoShapes,
      },
    };

    if (!groundRef.current) {
      groundRef.current = Chessground(containerRef.current, config);
    } else {
      groundRef.current.set(config);
    }
  }, [chess, orientation, interactive, legalDests, lastMove, showCoordinates, autoShapes, handleAfterMove]);

  // Clean up
  useEffect(() => {
    return () => {
      groundRef.current?.destroy();
      groundRef.current = null;
    };
  }, []);

  return (
    <div className="relative select-none aspect-square w-full max-w-[640px] mx-auto rounded-xl shadow-2xl overflow-hidden border border-white/10 bg-[#1e293b]">
      {/* Chessground DOM container */}
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{
          width: '100%',
          height: '100%',
        }}
      />

      {/* Interactive Promotion Dialog */}
      <AnimatePresence>
        {promotionPending && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md"
          >
            <div className="flex gap-3 rounded-2xl bg-[#1E293B] p-4 border border-white/20 shadow-2xl">
              {(['q', 'r', 'b', 'n'] as const).map((p) => {
                const isWhite = chess.turn() === 'w';
                const roleClass = `${p === 'q' ? 'queen' : p === 'r' ? 'rook' : p === 'b' ? 'bishop' : 'knight'} ${isWhite ? 'white' : 'black'}`;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handlePromotion(p)}
                    className="flex h-16 w-16 items-center justify-center rounded-xl bg-white/10 hover:bg-white/25 transition-all p-2 shadow-md hover:scale-110"
                    aria-label={`Promote to ${p}`}
                  >
                    <div className="cg-wrap h-12 w-12 relative pointer-events-none">
                      <div className={`piece ${roleClass} absolute inset-0 bg-contain bg-center bg-no-repeat`} />
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
