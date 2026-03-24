'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const SECTION_COUNT = 6;

export function useSectionSkipper(
  scrollContainerRef: React.RefObject<HTMLDivElement | null>,
  isStreaming: boolean,
) {
  const [currentSection, setCurrentSection] = useState(-1);
  const [skipperVisible, setSkipperVisible] = useState(false);
  const [skipperLeft, setSkipperLeft] = useState(0);
  const activeMessageRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let rafId: number | null = null;

    const update = () => {
      rafId = null;
      const containerRect = container.getBoundingClientRect();

      // Find active assistant message: tallest viewport overlap, must be taller than viewport
      // Also count how many assistant messages are visible — hide skipper if > 1
      const assistantEls = container.querySelectorAll<HTMLElement>('[data-role="assistant"]');
      let bestEl: HTMLElement | null = null;
      let bestOverlap = 0;
      let visibleAvatarCount = 0;

      for (const el of assistantEls) {
        const rect = el.getBoundingClientRect();
        // Require at least 60px visible to count as "in view"
        const vTop = Math.max(rect.top, containerRect.top);
        const vBot = Math.min(rect.bottom, containerRect.bottom);
        if (vBot - vTop > 60) visibleAvatarCount++;
        if (rect.height <= containerRect.height) continue;
        const top = Math.max(rect.top, containerRect.top);
        const bottom = Math.min(rect.bottom, containerRect.bottom);
        const overlap = Math.max(0, bottom - top);
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestEl = el;
        }
      }

      activeMessageRef.current = bestEl;

      // DEBUG — remove after fixing
      if (typeof window !== 'undefined' && (window as any).__SKIPPER_DEBUG) {
        console.log('[skipper]', {
          assistantCount: assistantEls.length,
          visibleAvatarCount,
          bestEl: bestEl ? bestEl.id : null,
          bestOverlap,
          containerHeight: containerRect.height,
        });
      }

      if (!bestEl) {
        setSkipperVisible(false);
        return;
      }

      // Calculate scroll progress through the message (0..1)
      const msgRect = bestEl.getBoundingClientRect();
      const scrollableRange = bestEl.offsetHeight - containerRect.height;
      const scrolled = containerRect.top - msgRect.top;
      const progress = Math.max(0, Math.min(1, scrolled / scrollableRange));
      const section = Math.round(progress * (SECTION_COUNT - 1));
      setCurrentSection(section);

      // Visibility — hide if scrolled past or above the message
      const pastBottom = msgRect.bottom < containerRect.top + 60;
      const aboveTop = msgRect.top > containerRect.bottom;

      // Hide during streaming if the streaming message is in view
      let streamingInView = false;
      if (isStreaming) {
        const lastMsg = container.querySelector('[data-role]:last-of-type') as HTMLElement | null;
        if (lastMsg) {
          const lastRect = lastMsg.getBoundingClientRect();
          streamingInView = lastRect.bottom > containerRect.top && lastRect.top < containerRect.bottom;
          if (bestEl === lastMsg) streamingInView = true;
        } else {
          streamingInView = true;
        }
      }

      setSkipperVisible(!pastBottom && !aboveTop && !streamingInView && visibleAvatarCount <= 1);

      // Horizontal position — align with avatar
      const avatar = bestEl.querySelector<HTMLElement>('.minai-logo-avatar');
      if (avatar) {
        const r = avatar.getBoundingClientRect();
        setSkipperLeft(r.left + r.width / 2);
      }
    };

    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(update);
    };

    const onResize = () => {
      if (!rafId) rafId = requestAnimationFrame(update);
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    rafId = requestAnimationFrame(update);

    return () => {
      container.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [scrollContainerRef, isStreaming]);

  const scrollToSection = useCallback((index: number) => {
    const container = scrollContainerRef.current;
    const el = activeMessageRef.current;
    if (!container || !el) return;
    const containerRect = container.getBoundingClientRect();
    const scrollableRange = el.offsetHeight - containerRect.height;
    const targetProgress = index / (SECTION_COUNT - 1);
    const targetScrollTop = el.offsetTop - container.offsetTop + targetProgress * scrollableRange;
    container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
  }, [scrollContainerRef]);

  return { currentSection, skipperVisible, skipperLeft, scrollToSection };
}
