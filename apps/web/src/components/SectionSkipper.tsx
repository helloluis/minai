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
  return (
    <div
      className="absolute left-2 sm:left-4 z-30 flex flex-col items-center transition-opacity duration-300"
      style={{
        bottom: 80,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div className="flex flex-col items-center">
        {Array.from({ length: NUM_SECTIONS }).map((_, i) => {
          const isActive = i === currentSection;
          return (
            <div key={i} className="flex flex-col items-center">
              {/* Connecting line */}
              {i > 0 && (
                <div className="w-px bg-stone-600" style={{ height: 16 }} />
              )}
              {/* Tap target — generous padding around the dot */}
              <button
                onClick={() => onJump(i)}
                className="flex items-center justify-center transition-all duration-200"
                style={{ width: 36, height: 36 }}
                aria-label={`Jump to section ${i + 1} of ${NUM_SECTIONS}`}
              >
                <span
                  className="rounded-full transition-all duration-200 block"
                  style={{
                    width: isActive ? 14 : 10,
                    height: isActive ? 14 : 10,
                    backgroundColor: isActive ? 'var(--color-minai-500, #22c55e)' : '#1c1917',
                    border: `2px solid ${isActive ? 'var(--color-minai-500, #22c55e)' : '#78716c'}`,
                  }}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
});
