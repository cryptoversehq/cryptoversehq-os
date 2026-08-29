/**
 * useLynxGuidance.ts - Main hook that generates and manages Lynx AI guidance toasts.
 * Watches context changes and shows guidance when appropriate.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLynxContext } from './useLynxContext';
import { generateGuidance, type GuidanceMessage } from '@/lib/guidanceGenerator';

const PAGE_CHANGE_COOLDOWN = 15000; // 15s before showing guidance on a new page

export function useLynxGuidance() {
  const context = useLynxContext();
  const [message, setMessage] = useState<GuidanceMessage | null>(null);
  const lastPageRef = useRef<string>('');
  const lastCheckRef = useRef<number>(0);

  const dismiss = useCallback(() => {
    setMessage(null);
  }, []);

  useEffect(() => {
    // Don't check too frequently
    const now = Date.now();
    if (now - lastCheckRef.current < PAGE_CHANGE_COOLDOWN) return;

    // Only check when page changes
    if (context.page === lastPageRef.current) return;
    lastPageRef.current = context.page;
    lastCheckRef.current = now;

    // Delay guidance slightly so the page loads first
    const timer = setTimeout(() => {
      const msg = generateGuidance(context);
      if (msg) {
        setMessage(msg);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [context.page]);

  // Also check periodically (every 60s) for behavior-based triggers
  useEffect(() => {
    const interval = setInterval(() => {
      const msg = generateGuidance(context);
      if (msg) {
        setMessage(msg);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [context]);

  return {
    message,
    dismiss,
  };
}
