'use client';

import React from 'react';
import { Play, GraduationCap, CheckCircle2 } from 'lucide-react';
import type { RepertoireLine } from '@/lib/chess/repertoireTree';

interface RepertoireLinesListProps {
  lines: RepertoireLine[];
  onSelectLine: (line: RepertoireLine) => void;
  onTrainLine?: (line: RepertoireLine) => void;
  currentFen?: string;
}

export default function RepertoireLinesList({
  lines,
  onSelectLine,
  onTrainLine,
  currentFen,
}: RepertoireLinesListProps) {
  if (lines.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-gray-400">
        <p>No discrete lines found yet.</p>
        <p className="text-[0.65rem] text-gray-500 mt-1">
          Make moves on the board to add variations or import a PGN study.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 select-none">
      {lines.map((line, idx) => {
        const isCurrentLine = currentFen && line.moves.some((m) => m.toFen === currentFen);

        return (
          <div
            key={line.id || idx}
            onClick={() => onSelectLine(line)}
            className={`group rounded-xl border p-3 transition-all cursor-pointer ${
              isCurrentLine
                ? 'border-amber-400/40 bg-amber-400/10 shadow-sm'
                : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/15'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`rounded px-1.5 py-0.2 text-[0.62rem] font-bold uppercase tracking-wider ${
                      line.isMainLine
                        ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                        : 'bg-white/10 text-gray-300'
                    }`}
                  >
                    {line.isMainLine ? 'Main Line' : `Line ${idx + 1}`}
                  </span>
                  <span className="text-[0.68rem] text-gray-400 font-mono">
                    {line.moves.length} moves
                  </span>
                </div>

                <p className="font-mono text-xs font-semibold text-gray-200 group-hover:text-amber-300 transition-colors leading-relaxed line-clamp-2">
                  {line.formattedMoves}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0 pt-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectLine(line);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
                  title="Load Line on Board"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                </button>

                {onTrainLine && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTrainLine(line);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/30 text-amber-300 transition-colors"
                    title="Train this specific line"
                  >
                    <GraduationCap className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
