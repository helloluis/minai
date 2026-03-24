'use client';

import { memo } from 'react';

const SECTION_COUNT = 6;

export const SectionSkipper = memo(function SectionSkipper({
  currentSection,
  visible,
  left,
  onJump,
}: {
  currentSection: number;
  visible: boolean;
  left: number;
  onJump: (index: number) => void;
}) {
  if (!visible || left === 0) return null;

  const sections = Array.from({ length: SECTION_COUNT }, (_, i) => i);

  return (
    <div
      className={`fixed z-20 flex flex-col items-center transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      style={{ left, bottom: 260, transform: 'translateX(-50%)' }}
    >
      <div className="relative flex flex-col items-center gap-5">
        {/* Vertical line behind the dots */}
        <div className="absolute top-2 bottom-2 w-px bg-stone-600 left-1/2 -translate-x-1/2" />

        {sections.map((i) => (
          <button
            key={i}
            onClick={() => onJump(i)}
            className={`relative z-10 rounded-full border-2 transition-all duration-200 ${
              i === currentSection
                ? 'w-4 h-4 bg-green-500 border-green-500'
                : 'w-3 h-3 bg-gray-900 border-stone-500 hover:border-green-500'
            }`}
          />
        ))}
      </div>
    </div>
  );
});
