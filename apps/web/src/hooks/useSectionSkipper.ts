'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface SectionSkipperState {
  currentSection: number;
  skipperVisible: boolean;
  skipperTop: number;
  skipperLeft: number;
  scrollToSection: (section: number) => void;
}

const NUM_SECTIONS = 6;
const SKIPPER_HEIGHT = NUM_SECTIONS * 36; // 6 dots × 36px each

export function useSectionSkipper(
  scrollContainerRef: React.RefObject<HTMLDivElement | null>,
  isStreaming: boolean,
): SectionSkipperState {
  const [currentSection, setCurrentSection] = useState(0);
  const [skipperVisible, setSkipperVisible] = useState(false);
  const [skipperTop, setSkipperTop] = useState(0);
  const [skipperLeft, setSkipperLeft] = useState(0);
  const rafRef = useRef<number>(0);
  const activeMessageRef = useRef<HTMLElement | null>(null);
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;

  const update = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || isStreamingRef.current) {
      setSkipperVisible(false);
      activeMessageRef.current = null;
      return;
    }

    const viewportHeight = container.clientHeight;
    const containerRect = container.getBoundingClientRect();

    const assistantMessages = container.querySelectorAll<HTMLElement>('[data-role="assistant"]');
    if (assistantMessages.length === 0) {
      setSkipperVisible(false);
      activeMessageRef.current = null;
      return;
    }

    // Count how many assistant avatars are visible in viewport
    const avatars = container.querySelectorAll<HTMLElement>('.minai-logo-avatar');
    let visibleAvatars = 0;
    for (const avatar of avatars) {
      const r = avatar.getBoundingClientRect();
      if (r.top < containerRect.bottom && r.bottom > containerRect.top) {
        visibleAvatars++;
      }
    }

    // If multiple assistant messages are visible, hide skipper
    if (visibleAvatars > 1) {
      setSkipperVisible(false);
      activeMessageRef.current = null;
      return;
    }

    // Find the best qualifying message: taller than viewport, most overlap
    let bestMessage: HTMLElement | null = null;
    let bestOverlap = 0;

    for (const msg of assistantMessages) {
      const rect = msg.getBoundingClientRect();
      if (rect.height <= viewportHeight) continue;

      const overlapTop = Math.max(rect.top, containerRect.top);
      const overlapBottom = Math.min(rect.bottom, containerRect.bottom);
      const overlap = Math.max(0, overlapBottom - overlapTop);

      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMessage = msg;
      }
    }

    // Need at least 40% viewport coverage
    if (!bestMessage || bestOverlap < viewportHeight * 0.4) {
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
      activeMessageRef.current = null;
      return;
    }

    const progress = Math.max(0, Math.min(1, (containerRect.top - msgRect.top) / scrollableDistance));
    const section = Math.round(progress * (NUM_SECTIONS - 1));

    // Position: find the avatar for this message to align horizontally
    const avatar = bestMessage.querySelector('.minai-logo-avatar');
    if (avatar) {
      const avatarRect = avatar.getBoundingClientRect();
      setSkipperLeft(avatarRect.left + avatarRect.width / 2 - 8); // center on avatar
    }

    // Vertical position: clamp within the visible portion of the message
    const visibleTop = Math.max(msgRect.top, containerRect.top);
    const visibleBottom = Math.min(msgRect.bottom, containerRect.bottom);
    const visibleMid = (visibleTop + visibleBottom) / 2;
    const clampedTop = Math.max(
      visibleTop + 20,
      Math.min(visibleBottom - SKIPPER_HEIGHT - 20, visibleMid - SKIPPER_HEIGHT / 2)
    );
    setSkipperTop(clampedTop);

    setCurrentSection(section);
    setSkipperVisible(true);
  }, [scrollContainerRef]);

  // Scroll listener
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    const timer = setTimeout(() => requestAnimationFrame(update), 500);

    return () => {
      container.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(rafRef.current);
      clearTimeout(timer);
    };
  }, [scrollContainerRef, update]);

  // Hide during streaming, re-check when it ends
  useEffect(() => {
    if (isStreaming) {
      setSkipperVisible(false);
    } else {
      const timer = setTimeout(() => requestAnimationFrame(update), 1000);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, update]);

  const scrollToSection = useCallback((section: number) => {
    const container = scrollContainerRef.current;
    const msg = activeMessageRef.current;
    if (!container || !msg) return;

    // Only scroll if message is still the active one
    const containerRect = container.getBoundingClientRect();
    const msgRect = msg.getBoundingClientRect();
    if (msgRect.height <= containerRect.height) return;

    setCurrentSection(section);

    const scrollableDistance = msgRect.height - containerRect.height;
    const targetProgress = section / (NUM_SECTIONS - 1);
    const targetScrollTop = container.scrollTop + (msgRect.top - containerRect.top) + targetProgress * scrollableDistance;

    container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
  }, [scrollContainerRef]);

  return { currentSection, skipperVisible, skipperTop, skipperLeft, scrollToSection };
}
