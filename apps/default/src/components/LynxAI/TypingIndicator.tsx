/**
 * TypingIndicator.tsx - Animated typing dots for Lynx AI chat.
 */

import React from 'react';
import { LynxLogo } from './LynxLogo';

export function TypingIndicator() {
  return (
    <div className="flex gap-2 items-start">
      <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">
        <LynxLogo size={24} state="thinking" />
      </div>
      <div className="bg-secondary rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex gap-1.5">
          <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
