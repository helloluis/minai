'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface SectionSkipperState {
  currentSection: number;
  skipperVisible: boolean;
  skipperLeft: number;
  scrollToSection: (section: number) => void;
}

const NUM_SECTIONS = 6;

export function useSectionSkipper(
  scrollContainerRef: React.RefObject<HTMLDivElement | null>,
  isStreaming: boolean,
): SectionSkipperState {
  const [currentSection, setCurrentSection] = useState(0);
  const [skipperVisible, setSkipperVisible] = useState(false);
  const [skipperLeft, setSkipperLeft] = useState(0);
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

    // Count visible assistant avatars — if more than 1 visible, hide
    // (means multiple messages in view, not a single long one)
    const avatars = container.querySelectorAll<HTMLElement>('[data-role="assistant"] .minai-logo-avatar');
    let visibleAvatarCount = 0;
    for (const avatar of avatars) {
      const aRect = avatar.getBoundingClientRect();
      if (aRect.top < containerRect.bottom && aRect.bottom > containerRect.top) {
        visibleAvatarCount++;
      }
    }
    if (visibleAvatarCount > 1) {
      setSkipperVisible(false);
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

    // Calculate horizontal position: center on the assistant's avatar
    const msgAvatar = bestMessage.querySelector('.minai-logo-avatar');
    if (msgAvatar) {
      const avatarRect = msgAvatar.getBoundingClientRect();
      setSkipperLeft(avatarRect.left + avatarRect.width / 2);
    }
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
    // Initial check
    requestAnimationFrame(update);

    return () => {
      container.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, [scrollContainerRef, update]);

  // Hide during streaming
  useEffect(() => {
    if (isStreaming) setSkipperVisible(false);
  }, [isStreaming]);

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

  return { currentSection, skipperVisible, skipperLeft, scrollToSection };
}
