'use client';

import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

/**
 * Chess.com-style Move Classification Badges.
 * Pure vector SVG with authentic colors, micro-gradients, and tactile shadows.
 * Zero emojis, zero system-dependent rendering bugs.
 */

// 1. Brilliant (!!) — Cyan / Turquoise with double exclamation
export function BrilliantIcon({ size = 20, className = '' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 drop-shadow-xs ${className}`}
      aria-label="Brilliant move"
    >
      <circle cx="12" cy="12" r="11" fill="#1BACA6" />
      <circle cx="12" cy="12" r="11" fill="url(#brilliant-grad)" />
      <circle cx="12" cy="12" r="10.5" stroke="rgba(255,255,255,0.25)" strokeWidth="0.75" />
      {/* Exclamation 1 */}
      <path d="M8.2 6.5L8.7 12.5H10L10.5 6.5H8.2Z" fill="#FFFFFF" />
      <circle cx="9.35" cy="15.2" r="1.15" fill="#FFFFFF" />
      {/* Exclamation 2 */}
      <path d="M13.5 6.5L14 12.5H15.3L15.8 6.5H13.5Z" fill="#FFFFFF" />
      <circle cx="14.65" cy="15.2" r="1.15" fill="#FFFFFF" />
      <defs>
        <radialGradient id="brilliant-grad" cx="0" cy="0" r="1" gradientTransform="translate(12 8) scale(14)">
          <stop stopColor="#2DD4BF" stopOpacity="0.45" />
          <stop offset="1" stopColor="#1BACA6" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

// 2. Great (!) — Deep Blue with single exclamation
export function GreatIcon({ size = 20, className = '' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 drop-shadow-xs ${className}`}
      aria-label="Great move"
    >
      <circle cx="12" cy="12" r="11" fill="#5C8BB4" />
      <circle cx="12" cy="12" r="10.5" stroke="rgba(255,255,255,0.25)" strokeWidth="0.75" />
      <path d="M10.8 6L11.2 12.8H12.8L13.2 6H10.8Z" fill="#FFFFFF" />
      <circle cx="12" cy="15.8" r="1.3" fill="#FFFFFF" />
    </svg>
  );
}

// 3. Best (★) — Engine Green with solid 5-point star
export function BestIcon({ size = 20, className = '' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 drop-shadow-xs ${className}`}
      aria-label="Best move"
    >
      <circle cx="12" cy="12" r="11" fill="#81B64C" />
      <circle cx="12" cy="12" r="10.5" stroke="rgba(255,255,255,0.25)" strokeWidth="0.75" />
      <path
        d="M12 5.2L13.9 9.6L18.6 10.1L15.1 13.3L16.1 18L12 15.6L7.9 18L8.9 13.3L5.4 10.1L10.1 9.6L12 5.2Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

// 4. Excellent — Light Green with crisp upward chevron/arrow
export function ExcellentIcon({ size = 20, className = '' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 drop-shadow-xs ${className}`}
      aria-label="Excellent move"
    >
      <circle cx="12" cy="12" r="11" fill="#96BC4B" />
      <circle cx="12" cy="12" r="10.5" stroke="rgba(255,255,255,0.25)" strokeWidth="0.75" />
      <path
        d="M12 6.5L7.5 11.2H10.3V17H13.7V11.2H16.5L12 6.5Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

// 5. Good — Muted Olive/Green with clean checkmark
export function GoodIcon({ size = 20, className = '' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 drop-shadow-xs ${className}`}
      aria-label="Good move"
    >
      <circle cx="12" cy="12" r="11" fill="#98BC8A" />
      <circle cx="12" cy="12" r="10.5" stroke="rgba(255,255,255,0.25)" strokeWidth="0.75" />
      <path
        d="M7.5 12.5L10.5 15.5L16.5 9.5"
        stroke="#FFFFFF"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// 6. Book — Leather Brown with open theoretical book vector
export function BookIcon({ size = 20, className = '' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 drop-shadow-xs ${className}`}
      aria-label="Book move"
    >
      <circle cx="12" cy="12" r="11" fill="#A88B5E" />
      <circle cx="12" cy="12" r="10.5" stroke="rgba(255,255,255,0.25)" strokeWidth="0.75" />
      {/* Book pages */}
      <path
        d="M6.8 8C8.2 7.2 10.4 7.2 12 8.3C13.6 7.2 15.8 7.2 17.2 8V16C15.8 15.2 13.6 15.2 12 16.3C10.4 15.2 8.2 15.2 6.8 16V8Z"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="rgba(255,255,255,0.15)"
      />
      <line x1="12" y1="8.3" x2="12" y2="16.3" stroke="#FFFFFF" strokeWidth="1.4" />
    </svg>
  );
}

// 7. Inaccuracy (?!) — Amber Gold with ?!
export function InaccuracyIcon({ size = 20, className = '' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 drop-shadow-xs ${className}`}
      aria-label="Inaccuracy"
    >
      <circle cx="12" cy="12" r="11" fill="#E6A318" />
      <circle cx="12" cy="12" r="10.5" stroke="rgba(255,255,255,0.25)" strokeWidth="0.75" />
      <text
        x="12"
        y="12.5"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#FFFFFF"
        fontFamily="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
        fontWeight="800"
        fontSize="11"
        letterSpacing="-0.5px"
      >
        ?!
      </text>
    </svg>
  );
}

// 8. Mistake (?) — Warm Orange with single ?
export function MistakeIcon({ size = 20, className = '' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 drop-shadow-xs ${className}`}
      aria-label="Mistake"
    >
      <circle cx="12" cy="12" r="11" fill="#E58F2A" />
      <circle cx="12" cy="12" r="10.5" stroke="rgba(255,255,255,0.25)" strokeWidth="0.75" />
      <text
        x="12"
        y="12.5"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#FFFFFF"
        fontFamily="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
        fontWeight="800"
        fontSize="13"
      >
        ?
      </text>
    </svg>
  );
}

// 9. Miss — Tactical Coral/Red with crosshair target
export function MissIcon({ size = 20, className = '' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 drop-shadow-xs ${className}`}
      aria-label="Missed opportunity"
    >
      <circle cx="12" cy="12" r="11" fill="#CA3431" />
      <circle cx="12" cy="12" r="10.5" stroke="rgba(255,255,255,0.25)" strokeWidth="0.75" />
      {/* Target ring */}
      <circle cx="12" cy="12" r="4.2" stroke="#FFFFFF" strokeWidth="1.8" />
      {/* Reticle tick marks */}
      <line x1="12" y1="5.2" x2="12" y2="7.8" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="12" y1="16.2" x2="12" y2="18.8" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="5.2" y1="12" x2="7.8" y2="12" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="16.2" y1="12" x2="18.8" y2="12" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// 10. Blunder (??) — Deep Crimson Red with double ??
export function BlunderIcon({ size = 20, className = '' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 drop-shadow-xs ${className}`}
      aria-label="Blunder"
    >
      <circle cx="12" cy="12" r="11" fill="#CA3431" />
      <circle cx="12" cy="12" r="10.5" stroke="rgba(255,255,255,0.25)" strokeWidth="0.75" />
      <text
        x="12"
        y="12.5"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#FFFFFF"
        fontFamily="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
        fontWeight="800"
        fontSize="11"
        letterSpacing="-0.5px"
      >
        ??
      </text>
    </svg>
  );
}

// 11. Forced (→) — ChessAtlas Forced Move Green with right arrow
export function ForcedIcon({ size = 20, className = '' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 drop-shadow-xs ${className}`}
      aria-label="Forced move"
    >
      <circle cx="12" cy="12" r="11" fill="#81B64C" />
      <circle cx="12" cy="12" r="10.5" stroke="rgba(255,255,255,0.25)" strokeWidth="0.75" />
      <path
        d="M7 12h9M13 8l4 4-4 4"
        stroke="#FFFFFF"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Universal move classification icon dispatcher.
 */
export function ClassificationIcon({
  classification,
  size = 20,
  className = '',
}: {
  classification: string;
  size?: number;
  className?: string;
}) {
  switch (classification.toLowerCase()) {
    case 'brilliant':
      return <BrilliantIcon size={size} className={className} />;
    case 'great':
      return <GreatIcon size={size} className={className} />;
    case 'best':
      return <BestIcon size={size} className={className} />;
    case 'forced':
      return <ForcedIcon size={size} className={className} />;
    case 'excellent':
      return <ExcellentIcon size={size} className={className} />;
    case 'good':
      return <GoodIcon size={size} className={className} />;
    case 'book':
      return <BookIcon size={size} className={className} />;
    case 'inaccuracy':
      return <InaccuracyIcon size={size} className={className} />;
    case 'mistake':
      return <MistakeIcon size={size} className={className} />;
    case 'miss':
      return <MissIcon size={size} className={className} />;
    case 'blunder':
      return <BlunderIcon size={size} className={className} />;
    default:
      return <GoodIcon size={size} className={className} />;
  }
}
