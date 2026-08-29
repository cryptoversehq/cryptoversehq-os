/**
 * BottomSheet.tsx — §8
 * Reusable mobile-first bottom sheet / drawer.
 * On mobile it slides up from the bottom; on tablet+ it's a centered modal.
 * Uses Framer Motion with drag-to-dismiss gesture.
 */
import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence, PanInfo, useAnimation } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  /** Max height as a CSS value (default: 90vh on mobile) */
  maxHeight?: string;
  /** If true, renders as a standard centered modal on all screen sizes */
  alwaysModal?: boolean;
}

const DRAG_THRESHOLD = 100; // px downward drag to dismiss

export function BottomSheet({ open, onClose, title, children, maxHeight = '90vh', alwaysModal = false }: Props) {
  const controls = useAnimation();
  const sheetRef = useRef<HTMLDivElement>(null);

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > DRAG_THRESHOLD || info.velocity.y > 400) {
      controls.start({ y: '100%', opacity: 0, transition: { duration: 0.25 } }).then(onClose);
    } else {
      controls.start({ y: 0, transition: { type: 'spring', stiffness: 400, damping: 40 } });
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="bs-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            key="bs-sheet"
            ref={sheetRef}
            initial={{ y: '100%', opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
            drag={alwaysModal ? false : 'y'}
            dragConstraints={{ top: 0 }}
            dragElastic={0.12}
            onDragEnd={handleDragEnd}
            className={cn(
              'fixed z-[75] flex flex-col',
              'bg-card border border-border',
              'shadow-2xl overflow-hidden',
              alwaysModal
                ? 'inset-4 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg rounded-2xl'
                : 'bottom-0 left-0 right-0 rounded-t-3xl'
            )}
            style={{
              maxHeight,
            }}
          >
            {/* Drag handle (mobile only) */}
            {!alwaysModal && (
              <div className="flex justify-center pt-3 pb-1 shrink-0 cursor-grab active:cursor-grabbing">
                <div className="w-10 h-1 rounded-full bg-secondary/50" />
              </div>
            )}

            {/* Header */}
            {title && (
              <div
                className="flex items-center justify-between px-5 py-3 border-b shrink-0"
                style={{ borderColor: 'rgba(255,215,0,0.12)' }}
              >
                <div className="font-bold text-sm text-foreground flex items-center gap-2">{title}</div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
