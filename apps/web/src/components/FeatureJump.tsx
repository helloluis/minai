'use client';

export function FeatureJump() {
  return (
    <button
      onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
      className="relative z-10 w-full flex flex-col items-center justify-center gap-3 bg-gray-800/50 backdrop-blur-lg border-t border-white/10 cursor-pointer hover:bg-gray-800/60 transition-colors"
      style={{ height: '10%' }}
    >
      <p className="text-white/70 text-lg sm:text-xl font-light tracking-wide lowercase">
        here&apos;s how minai can help you work faster
      </p>
      <svg className="w-5 h-5 text-white/40 animate-bounce" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );
}
