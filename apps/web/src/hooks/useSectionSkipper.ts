'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface SectionSkipperState {
  currentSection: number;
  skipperVisible: boolean;
  scrollToSection: (section: number) => void;
}

const NUM_SECTIONS = 6;

export function useSectionSkipper(
  scrollContainerRef: React.RefObject<HTMLDivElement | null>,
  isStreaming: boolean,
): SectionSkipperState {
  const [currentSection, setCurrentSection] = useState(0);
  const [skipperVisible, setSkipperVisible] = useState(false);
  const rafRef = useRef<number>(0);
  const activeMessageRef = useRef<HTMLElement | null>(null);

  const update = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || isStreaming) {
      setSkipperVisible(false);
      return;
    }

    const viewportHeight = container.clientHeight;
    const containerRect = container.getBoundingClientRect();

    // Find all assistant messages
    const assistantMessages = container.querySelectorAll<HTMLElement>('[data-role="assistant"]');
    if (assistantMessages.length === 0) {
      setSkipperVisible(false);
      return;
    }

    // Find the assistant message with the largest viewport overlap that is taller than viewport
    let bestMessage: HTMLElement | null = null;
    let bestOverlap = 0;

    for (const msg of assistantMessages) {
      const rect = msg.getBoundingClientRect();
      const msgHeight = rect.height;

      // Only consider messages taller than the viewport
      if (msgHeight <= viewportHeight) continue;

      // Calculate overlap with the viewport (container bounds)
      const overlapTop = Math.max(rect.top, containerRect.top);
      const overlapBottom = Math.min(rect.bottom, containerRect.bottom);
      const overlap = Math.max(0, overlapBottom - overlapTop);

      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMessage = msg;
      }
    }

    if (!bestMessage) {
      setSkipperVisible(false);
      activeMessageRef.current = null;
      return;
    }

    activeMessageRef.current = bestMessage;

    // Calculate scroll progress within this message
    const msgRect = bestMessage.getBoundingClientRect();
    const scrollableDistance = msgRect.height - viewportHeight;
    if (scrollableDistance <= 0) {
      setSkipperVisible(false);
      return;
    }

    const progress = Math.max(0, Math.min(1, (containerRect.top - msgRect.top) / scrollableDistance));
    const section = Math.round(progress * (NUM_SECTIONS - 1));

    setCurrentSection(section);
    setSkipperVisible(true);
  }, [scrollContainerRef, isStreaming]);

  // Scroll listener with rAF throttling
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    // Also listen for resize
    window.addEventListener('resize', onScroll, { passive: true });
    // Initial check with a delay to let messages render
    const timer = setTimeout(() => requestAnimationFrame(update), 500);

    return () => {
      container.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(rafRef.current);
      clearTimeout(timer);
    };
  }, [scrollContainerRef, update]);

  // Hide during streaming, re-check when streaming ends
  useEffect(() => {
    if (isStreaming) {
      setSkipperVisible(false);
    } else {
      // Re-check after streaming ends and messages settle
      const timer = setTimeout(() => requestAnimationFrame(update), 1000);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, update]);

  const scrollToSection = useCallback((section: number) => {
    const container = scrollContainerRef.current;
    const msg = activeMessageRef.current;
    if (!container || !msg) return;

    const containerRect = container.getBoundingClientRect();
    const msgRect = msg.getBoundingClientRect();
    const scrollableDistance = msgRect.height - containerRect.height;
    if (scrollableDistance <= 0) return;

    const targetProgress = section / (NUM_SECTIONS - 1);
    const targetScrollTop = container.scrollTop + (msgRect.top - containerRect.top) + targetProgress * scrollableDistance;

    container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
  }, [scrollContainerRef]);

  return { currentSection, skipperVisible, scrollToSection };
}
