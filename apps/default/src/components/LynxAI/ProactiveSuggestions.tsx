/**
 * ProactiveSuggestions.tsx - Lynx AI proactive suggestions based on user behavior.
 */

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/authStore';
import { useLocation, useNavigate } from 'react-router-dom';
import { generateSuggestions, type Suggestion } from '@/lib/suggestionEngine';
import { LynxLogo } from './LynxLogo';

interface Props {
  onClose?: () => void;
}

export function ProactiveSuggestions({ onClose }: Props) {
  const { user } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const newSuggestions = generateSuggestions(location.pathname, user);
    // Filter out dismissed suggestions
    setSuggestions(newSuggestions.filter((s) => !dismissed.has(s.title)));
  }, [location.pathname, user, dismissed]);

  const handleDismiss = (title: string) => {
    setDismissed((prev) => new Set([...prev, title]));
  };

  const handleAction = (suggestion: Suggestion) => {
    suggestion.action(navigate);
    handleDismiss(suggestion.title);
  };

  if (suggestions.length === 0) return null;

  return (
    <div className="proactive-suggestions fixed bottom-28 right-6 z-40 space-y-2 max-w-sm">
      {suggestions.slice(0, 3).map((suggestion, i) => (
        <div
          key={suggestion.title}
          className="flex items-start gap-3 p-3 bg-card rounded-xl shadow-lg border border-border animate-in slide-in-from-right-4"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center bg-transparent">
            {suggestion.icon === '🦊' ? <LynxLogo size={32} state="idle" /> : suggestion.icon}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{suggestion.title}</p>
            <p className="text-xs text-muted-foreground">{suggestion.description}</p>
          </div>
          <div className="flex flex-col gap-1 flex-shrink-0">
            <button
              onClick={() => handleAction(suggestion)}
              className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded-lg whitespace-nowrap"
            >
              View
            </button>
            <button
              onClick={() => handleDismiss(suggestion.title)}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
