'use client';

import { memo } from 'react';

interface SectionSkipperProps {
  currentSection: number;
  visible: boolean;
  avatarCenterX: number;
  onJump: (section: number) => void;
}

const NUM_SECTIONS = 6;

export const SectionSkipper = memo(function SectionSkipper({
  currentSection,
  visible,
  avatarCenterX,
  onJump,
}: SectionSkipperProps) {
  if (!visible) return null;

  return (
    <div
      className="absolute z-30 transition-opacity duration-300"
      style={{
        // Align horizontally with the avatar center
        left: avatarCenterX - 8,
        top: '50%',
        transform: 'translateY(-50%)',
        opacity: visible ? 1 : 0,
      }}
    >
      {/* Continuous vertical line behind the dots */}
      <div className="relative flex flex-col items-center">
        <div
          className="absolute w-px bg-stone-600"
          style={{
            top: 18,
            bottom: 18,
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
  );
});
