'use client';

import { useState, useEffect, useCallback } from 'react';

interface Feature {
  title: string;
  subtitle: string;
  description: string;
  color: string;
  video: string;
}

const FEATURES: Feature[] = [
  {
    title: 'deep academic or industry research',
    subtitle: 'works even with legacy websites that other AI tools struggle to access',
    description: 'minai has a headless browser that navigates complex sites, fills forms, and extracts data — and gets smarter every time it visits a domain. government portals, old ASPX archives, JS-heavy SPAs — nothing is off limits.',
    color: '#2E7D32',
    video: '/minai-feature-01.mp4',
  },
  {
    title: 'process and analyze multiple files in minutes',
    subtitle: 'upload files into a notebook and get a consolidated summary',
    description: 'upload PDFs, Word docs, and spreadsheets into a notebook and ask questions across all your files at once. minai reads, summarizes, and cross-references automatically — saving you hours of manual work.',
    color: '#3E8948',
    video: '/minai-feature-02.mp4',
  },
  {
    title: 'create documents, spreadsheets, and PDFs directly from chat',
    subtitle: 'never write your own office docs again!',
    description: 'ask minai to export research as a Word document, structure data into a spreadsheet with multiple tabs, or generate a clean PDF — all from the conversation. files are saved to your notebook for easy access.',
    color: '#4E7D5A',
    video: '/minai-feature-03.mp4',
  },
];

const AUTO_ADVANCE_MS = 5000;

export function FeatureCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const advance = useCallback(() => {
    setActiveIndex((i) => (i + 1) % FEATURES.length);
  }, []);

  // Auto-advance
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(advance, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [paused, advance]);

  const feature = FEATURES[activeIndex];

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Carousel slide */}
      <div className="flex flex-col sm:flex-row items-center gap-8 sm:gap-12 min-h-[320px]">
        {/* Looping video */}
        <div
          className="flex-shrink-0 w-64 h-64 sm:w-72 sm:h-72 rounded-2xl overflow-hidden
            border transition-colors duration-500"
          style={{ borderColor: `${feature.color}40` }}
        >
          <video
            key={feature.video}
            src={feature.video}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        </div>

        {/* Text */}
        <div className="flex-1 text-center sm:text-left">
          <h2 className="text-2xl sm:text-3xl font-semibold text-gray-100 mb-2 transition-all duration-300 lowercase">
            {feature.title}
          </h2>
          <p className="text-minai-400 font-medium text-sm mb-4 lowercase">
            {feature.subtitle}
          </p>
          <p className="text-gray-400 leading-relaxed max-w-lg">
            {feature.description}
          </p>
        </div>
      </div>

      {/* Dots + progress */}
      <div className="flex items-center justify-center gap-3 mt-10">
        {FEATURES.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveIndex(i)}
            className="relative w-10 h-1.5 rounded-full overflow-hidden bg-gray-800 transition-colors"
            aria-label={`Feature ${i + 1}`}
          >
            {i === activeIndex ? (
              <div
                className="absolute inset-y-0 left-0 bg-minai-500 rounded-full"
                style={{
                  animation: paused ? 'none' : `progress ${AUTO_ADVANCE_MS}ms linear`,
                  width: paused ? '100%' : undefined,
                }}
              />
            ) : (
              <div className={`absolute inset-0 rounded-full transition-colors ${i < activeIndex ? 'bg-minai-800' : ''}`} />
            )}
          </button>
        ))}
      </div>

      {/* CSS animation for progress bar */}
      <style>{`
        @keyframes progress {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
}
