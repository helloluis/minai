'use client';

import { memo } from 'react';

interface SectionSkipperProps {
  currentSection: number;
  visible: boolean;
  onJump: (section: number) => void;
}

const NUM_SECTIONS = 6;

export const SectionSkipper = memo(function SectionSkipper({
  currentSection,
  visible,
  onJump,
}: SectionSkipperProps) {
  if (!visible) return null;

  return (
    <div
      className="absolute z-30 transition-opacity duration-300"
      style={{
        // Position alongside the message bubble's left edge
        left: 52, // after avatar (w-6 + mr-1.5 + some padding)
        top: '50%',
        transform: 'translateY(-50%) translateX(-20px)',
        opacity: visible ? 1 : 0,
      }}
    >
      {/* Continuous vertical line behind the dots */}
      <div className="relative flex flex-col items-center">
        {/* The line */}
        <div
          className="absolute w-px bg-stone-600"
          style={{
            top: 18, // half of first dot area
            bottom: 18, // half of last dot area
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        />

        {/* Dots */}
        {Array.from({ length: NUM_SECTIONS }).map((_, i) => {
          const isActive = i === currentSection;
          return (
            <button
              key={i}
              onClick={() => onJump(i)}
              className="relative flex items-center justify-center"
              style={{ width: 36, height: 36 }}
              aria-label={`Jump to section ${i + 1} of ${NUM_SECTIONS}`}
            >
              {isActive ? (
                // Active: larger ring with colored border, semi-transparent fill
                <span
                  className="rounded-full"
                  style={{
                    width: 16,
                    height: 16,
                    backgroundColor: '#22c55e',
                    border: '2.5px solid #22c55e',
                  }}
                />
              ) : (
                // Inactive: small solid dot
                <span
                  className="rounded-full transition-colors duration-150 hover:bg-stone-400"
                  style={{
                    width: 8,
                    height: 8,
                    backgroundColor: '#78716c',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});
