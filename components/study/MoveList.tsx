'use client';

import { useCallback } from 'react';
import type { RepertoireEdge } from '@/types/chess';

interface MoveListProps {
  moves: RepertoireEdge[];
  currentMoveIndex: number;
  onSelectMove: (index: number) => void;
  onNavigateFirst?: () => void;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
  onNavigateLast?: () => void;
}

export default function MoveList({
  moves,
  currentMoveIndex,
  onSelectMove,
  onNavigateFirst,
  onNavigatePrev,
  onNavigateNext,
  onNavigateLast,
}: MoveListProps) {
  // Group moves into pairs (white, black)
  const movePairs = useCallback(() => {
    const pairs: Array<{ number: number; white?: RepertoireEdge; black?: RepertoireEdge; whiteIdx: number; blackIdx: number }> = [];
    
    for (let i = 0; i < moves.length; i += 2) {
      pairs.push({
        number: Math.floor(i / 2) + 1,
        white: moves[i],
        black: moves[i + 1],
        whiteIdx: i,
        blackIdx: i + 1,
      });
    }
    return pairs;
  }, [moves]);

  return (
    <div className="flex flex-col gap-1">
      {/* Navigation controls */}
      <div className="flex items-center justify-center gap-1 border-b border-white/10 pb-2 mb-2">
        {[
          { icon: '⏮', action: onNavigateFirst, label: 'First' },
          { icon: '◀', action: onNavigatePrev, label: 'Previous' },
          { icon: '▶', action: onNavigateNext, label: 'Next' },
          { icon: '⏭', action: onNavigateLast, label: 'Last' },
        ].map((btn) => (
          <button
            key={btn.label}
            type="button"
            onClick={btn.action}
            className="flex h-8 w-10 items-center justify-center rounded bg-white/5 text-sm text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={btn.label}
          >
            {btn.icon}
          </button>
        ))}
      </div>

      {/* Move list */}
      <div className="max-h-[400px] overflow-y-auto pr-1 font-mono text-sm [scrollbar-width:thin] [scrollbar-color:#4B5563_transparent]">
        {moves.length === 0 ? (
          <p className="text-center text-gray-500 italic py-4">No moves yet. Play a move on the board.</p>
        ) : (
          movePairs().map((pair) => (
            <div key={pair.number} className="flex items-center gap-0.5 mb-0.5">
              <span className="w-8 flex-shrink-0 text-right text-gray-500 text-xs pr-1">
                {pair.number}.
              </span>
              {pair.white && (
                <button
                  type="button"
                  onClick={() => onSelectMove(pair.whiteIdx)}
                  className={`flex-1 rounded px-1.5 py-0.5 text-left transition-colors ${
                    currentMoveIndex === pair.whiteIdx
                      ? 'bg-[#10B981]/20 text-[#10B981] font-bold'
                      : 'text-gray-200 hover:bg-white/5'
                  }`}
                >
                  {pair.white.san}
                  {pair.white.annotation?.nag && (
                    <span className="ml-0.5 text-yellow-400">{pair.white.annotation.nag}</span>
                  )}
                </button>
              )}
              {pair.black && (
                <button
                  type="button"
                  onClick={() => onSelectMove(pair.blackIdx)}
                  className={`flex-1 rounded px-1.5 py-0.5 text-left transition-colors ${
                    currentMoveIndex === pair.blackIdx
                      ? 'bg-[#10B981]/20 text-[#10B981] font-bold'
                      : 'text-gray-200 hover:bg-white/5'
                  }`}
                >
                  {pair.black.san}
                  {pair.black.annotation?.nag && (
                    <span className="ml-0.5 text-yellow-400">{pair.black.annotation.nag}</span>
                  )}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
