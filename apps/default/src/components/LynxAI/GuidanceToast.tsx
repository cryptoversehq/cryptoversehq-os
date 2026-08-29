/**
 * GuidanceToast.tsx - Animated toast displaying Lynx AI proactive guidance.
 * Shows context-aware tips based on user's current page and behavior.
 */

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LynxLogo } from './LynxLogo';
import type { GuidanceMessage } from '@/lib/guidanceGenerator';

interface GuidanceToastProps {
  message: GuidanceMessage;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export function GuidanceToast({ message, onDismiss, autoDismissMs = 8000 }: GuidanceToastProps) {
  // Auto-dismiss after timeout
  useEffect(() => {
    if (autoDismissMs <= 0) return;
    const timer = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, [autoDismissMs, onDismiss]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="guidance-toast fixed bottom-32 left-4 right-4 sm:left-auto sm:right-6 sm:w-80 z-40"
      >
        <div className="flex items-start gap-3 p-4 bg-card rounded-2xl shadow-xl border border-border ring-1 ring-primary/10">
          {/* Lynx icon */}
          <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center overflow-hidden">
            <LynxLogo size={32} state="idle" />
          </div>

          {/* Message content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm leading-relaxed">
              <span className="mr-1.5">{message.icon}</span>
              {message.text}
            </p>
            <button
              onClick={onDismiss}
              className="text-xs text-primary hover:text-primary/80 mt-1.5 font-medium transition-colors"
            >
              Got it
            </button>
          </div>

          {/* Close button */}
          <button
            onClick={onDismiss}
            className="flex-shrink-0 w-6 h-6 rounded-full hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss guidance"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
