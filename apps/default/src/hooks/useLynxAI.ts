/**
 * useLynxAI.ts - Main Lynx AI hook managing state.
 * Tracks: chat open state, unread messages, online status, welcome dismissed.
 */

import { useState, useCallback } from 'react';
import { useAuthStore } from '@/lib/authStore';

const WELCOME_DISMISSED_KEY = 'lynx_ai_welcome_dismissed_v1';

export function useLynxAI() {
  const { user, isAuthenticated } = useAuthStore();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOnline] = useState(true); // Lynx AI is always online (DeepSeek-powered)
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => {
    try {
      return localStorage.getItem(WELCOME_DISMISSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggleChat = useCallback(() => {
    setIsChatOpen((prev) => !prev);
    if (!isChatOpen) {
      setUnreadCount(0); // Clear unread when opening
    }
  }, [isChatOpen]);

  const closeChat = useCallback(() => setIsChatOpen(false), []);

  const dismissWelcome = useCallback(() => {
    setWelcomeDismissed(true);
    try {
      localStorage.setItem(WELCOME_DISMISSED_KEY, 'true');
    } catch {}
  }, []);

  const resetWelcome = useCallback(() => {
    setWelcomeDismissed(false);
    try {
      localStorage.removeItem(WELCOME_DISMISSED_KEY);
    } catch {}
  }, []);

  const incrementUnread = useCallback(() => {
    if (!isChatOpen) {
      setUnreadCount((prev) => prev + 1);
    }
  }, [isChatOpen]);

  const showWelcome = isAuthenticated && !welcomeDismissed;

  return {
    isChatOpen,
    toggleChat,
    closeChat,
    unreadCount,
    isOnline,
    showWelcome,
    dismissWelcome,
    resetWelcome,
    incrementUnread,
  };
}
