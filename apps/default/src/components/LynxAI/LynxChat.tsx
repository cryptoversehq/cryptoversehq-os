/**
 * LynxChat.tsx — Lynx AI Chat Window.
 * Connected to agent-routed Lynx Pipeline for full AI flow:
 *   lynxResponder → Identity → Permissions → AgentRouter
 *   → BrainFusion → DeepSeek → Memory → SelfEvolution → KnowledgeGraph
 * Fixed position: maxHeight prevents overflow, proper flex layout.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { useAuthStore } from '@/lib/authStore';
import { lynxResponder, AGENTS } from '@/lib/lynxResponder';
import { MessageBubble, type Message as UIMessage } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { LynxLogo } from './LynxLogo';
import { LanguageSelector } from './LanguageSelector';
import { lynxULE } from '@/lib/lynxUniversalLanguage';
import { useUserLanguage } from '@/hooks/useUserLanguage';

interface LynxChatProps {
  isOpen: boolean;
  onClose: () => void;
}

function getQuickActions(pathname: string): { icon: string; label: string }[] {
  if (pathname.startsWith('/trading')) {
    return [
      { icon: '📈', label: 'How to start trading?' },
      { icon: '📊', label: 'Explain order types' },
      { icon: '🛡️', label: 'Risk management tips' },
      { icon: '📉', label: 'Market analysis' },
    ];
  }
  if (pathname.startsWith('/academy')) {
    return [
      { icon: '📚', label: 'Where to start learning?' },
      { icon: '🎓', label: 'Course recommendations' },
      { icon: '✅', label: 'How to earn XP?' },
    ];
  }
  if (pathname.startsWith('/portfolio')) {
    return [
      { icon: '💰', label: 'Portfolio analysis' },
      { icon: '📊', label: 'Performance review' },
      { icon: '🎯', label: 'Diversification tips' },
    ];
  }
  if (pathname.startsWith('/bots')) {
    return [
      { icon: '🤖', label: 'How bots work?' },
      { icon: '⚙️', label: 'Best bot settings' },
      { icon: '📈', label: 'Bot performance' },
    ];
  }
  return [
    { icon: '📈', label: "Today's Market Analysis" },
    { icon: '🎓', label: 'What course should I take?' },
    { icon: '📊', label: 'Analyze my Portfolio' },
  ];
}

function buildWelcome(name: string): string {
  return "👋 Hi **" + name + "**! I'm 🦊 **Lynx AI**, your CryptoVerse HQ smart coach.\n\nI can help you with:\n- 📈 **Trading** — strategies, analysis, risk\n- 🎓 **Academy** — courses, XP, guides\n- 🤖 **Bots** — AI trading bots\n- 🔄 **Copy Trading** — follow top traders\n- 💬 **General help** — any questions!\n\nWhat can I help you with today?";
}

export function LynxChat({ isOpen, onClose }: LynxChatProps) {
  const { user } = useAuthStore();
  const { userLanguage } = useUserLanguage();
  const [input, setInput] = useState('');
  const [localAnswers, setLocalAnswers] = useState<UIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [agentName, setAgentName] = useState('Lynx AI Router');
  const [agentEmoji, setAgentEmoji] = useState('🤖');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasWelcomed = useRef(false);
  const respondingRef = useRef(false);

  const displayMessages: UIMessage[] = React.useMemo(() => {
    const out: UIMessage[] = [];
    if (hasWelcomed.current) {
      const userName = user?.displayName || user?.email?.split('@')[0] || 'Trader';
      out.push({ id: 'welcome', role: 'assistant', content: buildWelcome(userName), timestamp: new Date() });
    }
    for (const m of localAnswers) {
      out.push(m);
    }
    return out;
  }, [user, localAnswers]);

  useEffect(() => {
    if (isOpen) hasWelcomed.current = true;
    else hasWelcomed.current = false;
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages, isLoading]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading || respondingRef.current) return;

    // Add user message immediately
    const userMsg: UIMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed, timestamp: new Date() };
    setLocalAnswers((prev) => [...prev, userMsg]);
    setInput('');

    respondingRef.current = true;
    setIsLoading(true);
    const userId = user?.id || 'anonymous';

    // Detect current section from URL pathname
    const currentSection = typeof window !== 'undefined'
      ? window.location.pathname.split('/')[1] || 'dashboard'
      : 'dashboard';

    // Resolve the active agent so the header reflects who is answering
    const detection = lynxResponder.detectRoute(trimmed, currentSection, user?.role);
    const agent = AGENTS[detection.primaryAgent] || AGENTS.router;
    setAgentName(agent.name);
    setAgentEmoji(agent.emoji);

    try {
      const result = await lynxULE.processQuery({
        query: trimmed,
        userId,
        contextSection: currentSection,
        preferredLanguage: userLanguage?.isManual ? userLanguage.code : undefined,
      });

      const aiMsg: UIMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.content,
        timestamp: new Date(),
        source: result.source,
      };
      setLocalAnswers((prev) => [...prev, aiMsg]);

      // Log pipeline metadata in dev mode
      if (process.env.NODE_ENV === 'development') {
        console.log('[LynxChat] Pipeline response:', {
          source: result.source,
          confidence: result.confidence,
          language: result.language,
          processingTime: result.processingTime,
        });
      }

    } catch (error) {
      console.error('[LynxChat] Pipeline error:', error);
      const message = error instanceof Error ? error.message : 'Lynx could not complete the request.';
      const errorMsg: UIMessage = { id: crypto.randomUUID(), role: 'assistant', content: message, timestamp: new Date() };
      setLocalAnswers((prev) => [...prev, errorMsg]);
    } finally {
      respondingRef.current = false;
      setIsLoading(false);
    }
  }, [isLoading, user, userLanguage]);

  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  const quickActions = getQuickActions(pathname);
  const showQuickActions = quickActions.length > 0 && displayMessages.length <= 1;

  if (!isOpen) return null;

  return (
    <div
      className="lynx-chat fixed bottom-24 right-6 w-[380px] max-w-[calc(100vw-2rem)] bg-card rounded-2xl shadow-2xl border border-border z-50 flex flex-col overflow-hidden"
      style={{ maxHeight: 'calc(100vh - 120px)' }}
    >
      <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-border bg-card rounded-t-2xl">
        <div className="flex items-center gap-3 min-w-0">
          <LynxLogo size={32} mode="default" />
          <div className="min-w-0">
            <p className="font-bold text-sm truncate">{agentEmoji} {agentName}</p>
            <p className="text-[10px] text-muted-foreground">{isLoading ? 'Thinking...' : 'Online'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <LanguageSelector />
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" aria-label="Close chat">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {displayMessages.map((msg) => (<MessageBubble key={msg.id} message={msg} />))}
        {isLoading && displayMessages.length > 0 && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      {showQuickActions && (
        <div className="flex-shrink-0 px-4 py-2 flex gap-2 flex-wrap border-t border-border bg-card">
          {quickActions.map((action) => (
            <button key={action.label} onClick={() => sendMessage(action.label)} className="text-xs px-3 py-1 bg-secondary rounded-full hover:bg-secondary/80 transition whitespace-nowrap">
              {action.icon} {action.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex-shrink-0 p-4 border-t border-border bg-card rounded-b-2xl flex gap-2">
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask Lynx AI..." className="flex-1 px-3 py-2 bg-secondary/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" onKeyDown={(e) => e.key === 'Enter' && sendMessage(input)} />
        <button onClick={() => sendMessage(input)} disabled={isLoading || !input.trim()} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50">Send</button>
      </div>
    </div>
  );
}
