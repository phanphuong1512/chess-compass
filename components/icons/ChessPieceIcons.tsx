import React from 'react';

interface ChessPieceIconProps {
  color?: 'white' | 'black';
  size?: number;
  className?: string;
}

/**
 * Clean SVG Chess Piece Icons for high-craft UI badges and scoresheets.
 * Avoids raw unicode font inconsistencies and emoji fallback slop.
 */
export function ChessPawnIcon({ color = 'white', size = 16, className = '' }: ChessPieceIconProps) {
  const isWhite = color === 'white';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
    >
      <circle
        cx="12"
        cy="6.5"
        r="3"
        fill={isWhite ? '#F8FAFC' : '#1E293B'}
        stroke={isWhite ? '#94A3B8' : '#0F172A'}
        strokeWidth="1.5"
      />
      <path
        d="M9.5 11C9.5 9.89543 10.6193 9 12 9C13.3807 9 14.5 9.89543 14.5 11C14.5 13.5 16 16.5 16.5 18H7.5C8 16.5 9.5 13.5 9.5 11Z"
        fill={isWhite ? '#F8FAFC' : '#1E293B'}
        stroke={isWhite ? '#94A3B8' : '#0F172A'}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <rect
        x="6"
        y="18"
        width="12"
        height="2.5"
        rx="1"
        fill={isWhite ? '#E2E8F0' : '#0F172A'}
        stroke={isWhite ? '#94A3B8' : '#0F172A'}
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function ChessKnightIcon({ color = 'white', size = 16, className = '' }: ChessPieceIconProps) {
  const isWhite = color === 'white';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
    >
      <path
        d="M17 19H7C7.5 17 8.5 15.5 10 14.5C8.5 13 8 10 8 10C8 9 9 7.5 10 7C9.5 6 10 4.5 11.5 4C13 3.5 14.5 4.5 15 5.5C16.5 6 17.5 7.5 17 9.5C16.5 11 15 11.5 15 11.5C16.5 12.5 17 14 17 15.5C17 17 16.5 18 17 19Z"
        fill={isWhite ? '#F8FAFC' : '#1E293B'}
        stroke={isWhite ? '#94A3B8' : '#0F172A'}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="11.5" cy="7" r="1" fill={isWhite ? '#0F172A' : '#F8FAFC'} />
      <rect
        x="6"
        y="19"
        width="12"
        height="2"
        rx="0.8"
        fill={isWhite ? '#E2E8F0' : '#0F172A'}
        stroke={isWhite ? '#94A3B8' : '#0F172A'}
        strokeWidth="1.2"
      />
    </svg>
  );
}

export function ChessBishopIcon({ color = 'white', size = 16, className = '' }: ChessPieceIconProps) {
  const isWhite = color === 'white';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
    >
      <circle cx="12" cy="4" r="1.5" fill={isWhite ? '#F8FAFC' : '#1E293B'} stroke={isWhite ? '#94A3B8' : '#0F172A'} strokeWidth="1" />
      <path
        d="M12 5.5C9.5 5.5 8 8 8 11.5C8 14 9.5 16.5 10 18H14C14.5 16.5 16 14 16 11.5C16 8 14.5 5.5 12 5.5Z"
        fill={isWhite ? '#F8FAFC' : '#1E293B'}
        stroke={isWhite ? '#94A3B8' : '#0F172A'}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <line x1="12" y1="8" x2="12" y2="13" stroke={isWhite ? '#94A3B8' : '#475569'} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="10" y1="10" x2="14" y2="10" stroke={isWhite ? '#94A3B8' : '#475569'} strokeWidth="1.5" strokeLinecap="round" />
      <rect
        x="6"
        y="18"
        width="12"
        height="2.5"
        rx="1"
        fill={isWhite ? '#E2E8F0' : '#0F172A'}
        stroke={isWhite ? '#94A3B8' : '#0F172A'}
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function ChessRookIcon({ color = 'white', size = 16, className = '' }: ChessPieceIconProps) {
  const isWhite = color === 'white';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
    >
      <path
        d="M7 6V9H8.5V7.5H10.5V9H13.5V7.5H15.5V9H17V6H7Z"
        fill={isWhite ? '#F8FAFC' : '#1E293B'}
        stroke={isWhite ? '#94A3B8' : '#0F172A'}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 9L9.5 18H14.5L15.5 9H8.5Z"
        fill={isWhite ? '#F8FAFC' : '#1E293B'}
        stroke={isWhite ? '#94A3B8' : '#0F172A'}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <rect
        x="6"
        y="18"
        width="12"
        height="2.5"
        rx="1"
        fill={isWhite ? '#E2E8F0' : '#0F172A'}
        stroke={isWhite ? '#94A3B8' : '#0F172A'}
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function ChessQueenIcon({ color = 'white', size = 16, className = '' }: ChessPieceIconProps) {
  const isWhite = color === 'white';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
    >
      <circle cx="6" cy="7" r="1.2" fill={isWhite ? '#F8FAFC' : '#1E293B'} stroke={isWhite ? '#94A3B8' : '#0F172A'} strokeWidth="1" />
      <circle cx="9" cy="5.5" r="1.2" fill={isWhite ? '#F8FAFC' : '#1E293B'} stroke={isWhite ? '#94A3B8' : '#0F172A'} strokeWidth="1" />
      <circle cx="12" cy="5" r="1.2" fill={isWhite ? '#F8FAFC' : '#1E293B'} stroke={isWhite ? '#94A3B8' : '#0F172A'} strokeWidth="1" />
      <circle cx="15" cy="5.5" r="1.2" fill={isWhite ? '#F8FAFC' : '#1E293B'} stroke={isWhite ? '#94A3B8' : '#0F172A'} strokeWidth="1" />
      <circle cx="18" cy="7" r="1.2" fill={isWhite ? '#F8FAFC' : '#1E293B'} stroke={isWhite ? '#94A3B8' : '#0F172A'} strokeWidth="1" />
      <path
        d="M6 8.5L8.5 13.5L12 8L15.5 13.5L18 8.5L16.5 18H7.5L6 8.5Z"
        fill={isWhite ? '#F8FAFC' : '#1E293B'}
        stroke={isWhite ? '#94A3B8' : '#0F172A'}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <rect
        x="6"
        y="18"
        width="12"
        height="2.5"
        rx="1"
        fill={isWhite ? '#E2E8F0' : '#0F172A'}
        stroke={isWhite ? '#94A3B8' : '#0F172A'}
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function ChessKingIcon({ color = 'white', size = 16, className = '' }: ChessPieceIconProps) {
  const isWhite = color === 'white';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
    >
      {/* Crown cross */}
      <line x1="12" y1="3" x2="12" y2="7" stroke={isWhite ? '#94A3B8' : '#0F172A'} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="10" y1="5" x2="14" y2="5" stroke={isWhite ? '#94A3B8' : '#0F172A'} strokeWidth="1.5" strokeLinecap="round" />
      {/* Crown body */}
      <path
        d="M7 9C7 7.5 8.5 7 12 7C15.5 7 17 7.5 17 9C17 11.5 15.5 13.5 15 18H9C8.5 13.5 7 11.5 7 9Z"
        fill={isWhite ? '#F8FAFC' : '#1E293B'}
        stroke={isWhite ? '#94A3B8' : '#0F172A'}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <rect
        x="6"
        y="18"
        width="12"
        height="2.5"
        rx="1"
        fill={isWhite ? '#E2E8F0' : '#0F172A'}
        stroke={isWhite ? '#94A3B8' : '#0F172A'}
        strokeWidth="1.5"
      />
    </svg>
  );
}

/**
 * High-craft Turn Indicator badge (replaces emoji circles like ⚪ and ⚫)
 */
export function TurnIndicatorBadge({
  turn,
  label,
  className = '',
}: {
  turn: 'white' | 'black';
  label?: string;
  className?: string;
}) {
  const isWhite = turn === 'white';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${
        isWhite
          ? 'bg-white/10 text-slate-100 border border-white/20'
          : 'bg-stone-900/80 text-stone-300 border border-white/10'
      } ${className}`}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          isWhite
            ? 'bg-radial from-white to-slate-200 border border-white shadow-[0_0_6px_rgba(255,255,255,0.4)]'
            : 'bg-stone-900 border border-stone-500 shadow-inner'
        }`}
      />
      {label || (isWhite ? 'White' : 'Black')}
    </span>
  );
}
