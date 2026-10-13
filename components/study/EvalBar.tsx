'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { EngineScore } from '@/types/chess';

interface EvalBarProps {
  score: EngineScore | null;
  orientation?: 'white' | 'black';
  vertical?: boolean;
}

export default function EvalBar({ score, orientation = 'white', vertical = true }: EvalBarProps) {
  const { percentage, displayText } = useMemo(() => {
    if (!score) return { percentage: 50, displayText: '0.0' };

    if (score.type === 'mate') {
      const mateIn = score.value;
      return {
        percentage: mateIn > 0 ? 100 : 0,
        displayText: `M${Math.abs(mateIn)}`,
      };
    }

    // Centipawn to percentage (sigmoid-like mapping)
    const cp = score.value;
    const sigmoid = 50 + 50 * (2 / (1 + Math.exp(-0.004 * cp)) - 1);
    const clamped = Math.max(2, Math.min(98, sigmoid));
    const formatted = (Math.abs(cp) / 100).toFixed(1);
    const sign = cp > 0 ? '+' : cp < 0 ? '-' : '';
    
    return {
      percentage: orientation === 'white' ? clamped : 100 - clamped,
      displayText: `${sign}${formatted}`,
    };
  }, [score, orientation]);

  const whitePercentage = percentage;

  if (vertical) {
    return (
      <div className="relative flex h-full w-6 flex-col overflow-hidden rounded-md border border-white/10">
        {/* Black section */}
        <motion.div
          className="bg-[#374151]" 
          animate={{ height: `${100 - whitePercentage}%` }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
        />
        {/* White section */}
        <motion.div
          className="bg-[#E5E7EB] flex-1"
          animate={{ height: `${whitePercentage}%` }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
        />
        {/* Score label */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-[0.55rem] font-bold -rotate-90 whitespace-nowrap ${
            whitePercentage > 50 ? 'text-gray-800' : 'text-gray-200'
          }`}>
            {displayText}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-5 w-full overflow-hidden rounded-md border border-white/10">
      <motion.div
        className="bg-[#E5E7EB]"
        animate={{ width: `${whitePercentage}%` }}
        transition={{ duration: 0.4, ease: 'easeInOut' }}
      />
      <motion.div
        className="bg-[#374151] flex-1"
        animate={{ width: `${100 - whitePercentage}%` }}
        transition={{ duration: 0.4, ease: 'easeInOut' }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[0.6rem] font-bold text-gray-600">{displayText}</span>
      </div>
    </div>
  );
}
