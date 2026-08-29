/**
 * useLynxEvents.ts — Lynx AI hook for emitting typed events from components.
 * Provides convenience wrappers for trackPageView, trackTrade, trackAcademy, etc.
 */

import { useCallback } from 'react';
import { lynxEvents } from '@/lib/eventSystem';
import { useLocation } from 'react-router-dom';

export function useLynxEvents() {
  const location = useLocation();

  // ── Page Events ────────────────────────────────────────────────────────

  const trackPageView = useCallback(() => {
    lynxEvents.emit({
      type: 'PAGE_VIEW',
      page: location.pathname,
    });
  }, [location.pathname]);

  // ── Trading Events ─────────────────────────────────────────────────────

  const trackTrade = useCallback((data: {
    symbol: string;
    side?: string;
    leverage: number;
    amount: number;
    price: number;
    type: 'open' | 'close' | 'cancel';
    pnl?: number;
    pnlPercent?: number;
  }) => {
    if (data.type === 'open') {
      lynxEvents.emit({
        type: 'TRADE_OPEN',
        symbol: data.symbol,
        side: data.side || 'long',
        leverage: data.leverage,
        amount: data.amount,
        price: data.price,
      });
    } else if (data.type === 'close' && data.pnl !== undefined) {
      lynxEvents.emit({
        type: 'TRADE_CLOSE',
        symbol: data.symbol,
        pnl: data.pnl,
        pnlPercent: data.pnlPercent || 0,
      });
    } else if (data.type === 'cancel') {
      lynxEvents.emit({
        type: 'TRADE_CANCEL',
        symbol: data.symbol,
        reason: 'user_cancel',
      });
    }
  }, []);

  // ── Academy Events ─────────────────────────────────────────────────────

  const trackAcademy = useCallback((data: {
    type: 'lesson_start' | 'lesson_complete' | 'quiz_start' | 'quiz_complete';
    lessonId?: string;
    moduleId?: string;
    duration?: number;
    questionCount?: number;
    score?: number;
    passed?: boolean;
  }) => {
    if (data.type === 'lesson_start' && data.lessonId) {
      lynxEvents.emit({
        type: 'ACADEMY_LESSON_START',
        lessonId: data.lessonId,
        moduleId: data.moduleId || '',
      });
    } else if (data.type === 'lesson_complete' && data.lessonId) {
      lynxEvents.emit({
        type: 'ACADEMY_LESSON_COMPLETE',
        lessonId: data.lessonId,
        moduleId: data.moduleId || '',
        duration: data.duration || 0,
      });
    } else if (data.type === 'quiz_start') {
      lynxEvents.emit({
        type: 'ACADEMY_QUIZ_START',
        moduleId: data.moduleId || '',
        questionCount: data.questionCount || 0,
      });
    } else if (data.type === 'quiz_complete') {
      lynxEvents.emit({
        type: 'ACADEMY_QUIZ_COMPLETE',
        moduleId: data.moduleId || '',
        score: data.score || 0,
        passed: data.passed || false,
      });
    }
  }, []);

  // ── Settings Events ────────────────────────────────────────────────────

  const trackSettings = useCallback((setting: string, oldValue: unknown, newValue: unknown) => {
    lynxEvents.emit({
      type: 'SETTINGS_CHANGE',
      setting,
      oldValue,
      newValue,
    });
  }, []);

  // ── Language Events ────────────────────────────────────────────────────

  const trackLanguage = useCallback((oldLanguage: string, newLanguage: string) => {
    lynxEvents.emit({
      type: 'LANGUAGE_CHANGE',
      oldLanguage,
      newLanguage,
    });
  }, []);

  // ── Chat Events ────────────────────────────────────────────────────────

  const trackChat = useCallback((data: { type: 'open' | 'close' | 'message'; role?: 'user' | 'assistant'; content?: string }) => {
    if (data.type === 'open') {
      lynxEvents.emit({ type: 'CHAT_OPEN' });
    } else if (data.type === 'close') {
      lynxEvents.emit({ type: 'CHAT_CLOSE' });
    } else if (data.type === 'message' && data.role && data.content) {
      lynxEvents.emit({ type: 'CHAT_MESSAGE', role: data.role, content: data.content });
    }
  }, []);

  return {
    trackPageView,
    trackTrade,
    trackAcademy,
    trackSettings,
    trackLanguage,
    trackChat,
    trackEvent: lynxEvents.emit.bind(lynxEvents),
    getEvents: lynxEvents.getEvents.bind(lynxEvents),
    getEventStats: lynxEvents.getEventStats.bind(lynxEvents),
  };
}
