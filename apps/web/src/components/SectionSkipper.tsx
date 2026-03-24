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
      className="sticky z-30 transition-opacity duration-300 pointer-events-none"
      style={{
        top: '50%',
        transform: 'translateY(-50%)',
        height: 0, // don't affect layout
        opacity: visible ? 1 : 0,
      }}
    >
      <div
        className="pointer-events-auto flex flex-col items-center"
        style={{ width: 16, marginLeft: -8 }}
      >
        <div className="relative flex flex-col items-center">
          {/* Continuous vertical line */}
          <div
            className="absolute bg-stone-600"
            style={{
              top: 18,
              bottom: 18,
              left: '50%',
              width: 1,
              marginLeft: -0.5,
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
    </div>
  );
});
