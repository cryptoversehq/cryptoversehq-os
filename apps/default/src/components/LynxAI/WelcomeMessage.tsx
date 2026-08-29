/**
 * WelcomeMessage.tsx - Lynx AI Welcome Component
 * Shows on first login (or every time via setting).
 * Personalized greeting with user's name.
 */

import React from 'react';

interface WelcomeMessageProps {
  userName?: string;
  onDismiss: () => void;
  onConfigure: () => void;
}

export function WelcomeMessage({ userName, onDismiss, onConfigure }: WelcomeMessageProps) {
  const displayName = userName || 'Dear User';

  return (
    <div className="welcome-message animate-in slide-in-from-bottom-4">
      <div className="flex items-start gap-3 p-4 bg-card rounded-2xl shadow-xl border border-border">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-2xl">🦊</span>
        </div>
        <div className="flex-1">
          <p className="text-sm">
            <span className="font-bold">Hello {displayName} 👋</span>
            <br />
            I'm <span className="font-bold text-primary">Lynx AI</span>, the CryptoVerse HQ smart coach.
            <br />
            <span className="text-xs text-muted-foreground">
              I'm with you throughout the program. If you have any questions, ask me!
            </span>
          </p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={onDismiss}
              className="text-xs px-3 py-1 bg-primary text-primary-foreground rounded-lg"
            >
              Get Started
            </button>
            <button
              onClick={onConfigure}
              className="text-xs px-3 py-1 bg-secondary text-secondary-foreground rounded-lg"
            >
              Settings
            </button>
          </div>
        </div>
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground">
          ✕
        </button>
      </div>
    </div>
  );
}
