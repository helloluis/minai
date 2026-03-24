'use client';

import { memo } from 'react';

interface SectionSkipperProps {
  currentSection: number;
  visible: boolean;
  left: number;
  onJump: (section: number) => void;
}

const NUM_SECTIONS = 6;
const BOTTOM_OFFSET = 260; // above the input area

export const SectionSkipper = memo(function SectionSkipper({
  currentSection,
  visible,
  left,
  onJump,
}: SectionSkipperProps) {
  return (
    <div
      className="fixed z-30 flex flex-col items-center transition-opacity duration-300 pointer-events-none"
      style={{
        left: left - 8, // center the 16px component on the avatar
        bottom: BOTTOM_OFFSET,
        opacity: visible ? 1 : 0,
      }}
    >
      <div className="flex flex-col items-center gap-0 pointer-events-auto">
        {Array.from({ length: NUM_SECTIONS }).map((_, i) => {
          const isActive = i === currentSection;
          return (
            <div key={i} className="flex flex-col items-center">
              {/* Connecting line (above dot, except first) */}
              {i > 0 && (
                <div
                  className="w-px bg-stone-600"
                  style={{ height: 10 }}
                />
              )}
              {/* Dot */}
              <button
                onClick={() => onJump(i)}
                className="rounded-full transition-all duration-200 flex-shrink-0"
                style={{
                  width: isActive ? 16 : 12,
                  height: isActive ? 16 : 12,
                  backgroundColor: isActive ? 'var(--color-minai-500, #22c55e)' : '#1c1917',
                  border: `2px solid ${isActive ? 'var(--color-minai-500, #22c55e)' : '#78716c'}`,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.target as HTMLElement).style.borderColor = 'var(--color-minai-500, #22c55e)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.target as HTMLElement).style.borderColor = '#78716c';
                }}
                aria-label={`Jump to section ${i + 1} of ${NUM_SECTIONS}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});
