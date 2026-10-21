'use client';

import React from 'react';
import type { PlayerMaterial, PieceType } from '@/lib/chess/material';
import {
  ChessPawnIcon,
  ChessKnightIcon,
  ChessBishopIcon,
  ChessRookIcon,
  ChessQueenIcon,
} from '@/components/icons/ChessPieceIcons';

interface MaterialDifferenceBarProps {
  material: PlayerMaterial;
  pieceColor: 'white' | 'black'; // The color of the pieces to display (the captured enemy pieces)
  playerName?: string;
  playerRating?: number;
  className?: string;
}

function renderPieceIcon(type: PieceType, color: 'white' | 'black', size = 15) {
  switch (type) {
    case 'p':
      return <ChessPawnIcon color={color} size={size} />;
    case 'n':
      return <ChessKnightIcon color={color} size={size} />;
    case 'b':
      return <ChessBishopIcon color={color} size={size} />;
    case 'r':
      return <ChessRookIcon color={color} size={size} />;
    case 'q':
      return <ChessQueenIcon color={color} size={size} />;
  }
}

/**
 * Renders player header with captured pieces glyphs and material point advantage (+1, +3).
 * Exactly matches ChessAtlas & Chess.com interface.
 */
export default function MaterialDifferenceBar({
  material,
  pieceColor,
  playerName,
  playerRating,
  className = '',
}: MaterialDifferenceBarProps) {
  return (
    <div className={`flex items-center justify-between text-xs py-1 px-1.5 select-none ${className}`}>
      <div className="flex items-center gap-2 min-w-0">
        {playerName && (
          <span className="font-semibold text-gray-200 truncate max-w-[160px]">
            {playerName}
            {playerRating ? (
              <span className="ml-1 text-gray-400 font-normal font-mono text-[0.7rem]">
                ({playerRating})
              </span>
            ) : null}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <div className="flex items-center -space-x-1">
          {material.captured.map(({ type, count }) => (
            <div key={type} className="flex items-center">
              {Array.from({ length: count }).map((_, idx) => (
                <span
                  key={idx}
                  className="transition-transform hover:scale-110"
                  style={{ marginLeft: idx > 0 ? -4 : 0 }}
                >
                  {renderPieceIcon(type, pieceColor, 15)}
                </span>
              ))}
            </div>
          ))}
        </div>

        {material.lead > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-white/10 text-gray-200 font-mono text-[0.68rem] font-bold tabular-nums">
            +{material.lead}
          </span>
        )}
      </div>
    </div>
  );
}
