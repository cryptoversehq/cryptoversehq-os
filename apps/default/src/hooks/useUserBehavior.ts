/**
 * useUserBehavior.ts - Track user behavior for Lynx AI personalization.
 * Tracks: current page, time on page, click count.
 */

import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

export interface UserBehavior {
  currentPage: string;
  timeOnPage: number; // seconds
  clickCount: number;
  lastPageChange: number; // timestamp
}

export function useUserBehavior(initialClicks = 0): UserBehavior {
  const [behavior, setBehavior] = useState<UserBehavior>({
    currentPage: '/',
    timeOnPage: 0,
    clickCount: initialClicks,
    lastPageChange: Date.now(),
  });
  const location = useLocation();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track page changes
  useEffect(() => {
    setBehavior((prev) => ({
      ...prev,
      currentPage: location.pathname,
      timeOnPage: 0,
      lastPageChange: Date.now(),
    }));
  }, [location.pathname]);

  // Track time on page
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setBehavior((prev) => ({
        ...prev,
        timeOnPage: prev.timeOnPage + 1,
      }));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [behavior.currentPage]);

  // Track clicks
  useEffect(() => {
    const handler = () => {
      setBehavior((prev) => ({
        ...prev,
        clickCount: prev.clickCount + 1,
      }));
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  return behavior;
}
