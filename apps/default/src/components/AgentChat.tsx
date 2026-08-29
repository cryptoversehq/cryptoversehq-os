/**
 * AgentChat.tsx — CryptoVerse HQ Lynx AI
 * Routes all AI through DeepSeek API directly.
 * Works in preview AND published — no server proxy needed.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, X, Send, User, Maximize2, Minimize2, Loader2,
  Sparkles, CheckCircle2, HeadphonesIcon, Shield, RefreshCw, AlertCircle,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/authStore';
import {
  createConversation as createConv,
  appendMessage,
  markEscalated,
  parseEscalation,
  summariseForTicket,
  buildAdminEvalPrompt,
  MentorMessage,
  MentorConversation,
} from '@/lib/mentorChatStore';
import { createTicket } from '@/lib/ticketStore';
import type { TicketSection } from '@/lib/ticketStore';
import { useDeepSeekChat } from '@/hooks/useDeepSeekChat';
import { useTradingStore } from '@/lib/tradingStore';
import { LynxLogo } from '@/components/LynxAI/LynxLogo';

// ─── Constants ────────────────────────────────────────────────────────────────

const STARTER_PROMPTS = [
  '📈 How do I start trading?',
  '🔄 Explain copy trading',
  '🎓 Guide me through Academy',
  '🤖 How do bots work?',
  '📊 What is sentiment analysis?',
  '🛡️ Risk management tips',
  '🏆 Join a competition',
  '🎫 I need support',
];

const WELCOME_MESSAGE = `👋 Hello! I'm your **CryptoVerse HQ Lynx AI**. How can I help you with trading, training, or technical issues?

I can help you with:
- 📈 **Trading** — strategies, analysis, risk management
- 🎓 **Academy** — lessons, tests, guided exercises  
- 🔄 **Copy Trading** — following top traders
- 🤖 **Bots** — configuration and automation
- 🏆 **Competitions** — rules, scheduling, winners
- 🎫 **Support** — I'll create a ticket if I can't solve it`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sectionFromContent(content: string): TicketSection {
  const low = content.toLowerCase();
  if (low.includes('trade') || low.includes('trading') || low.includes('leverage')) return 'trade';
  if (low.includes('academy') || low.includes('lesson') || low.includes('quiz'))    return 'academy';
  if (low.includes('marketplace') || low.includes('strategy'))                       return 'marketplace';
  if (low.includes('copy'))                                                          return 'copy-trading';
  if (low.includes('chain') || low.includes('blockchain'))                           return 'onchain';
  if (low.includes('nft'))                                                           return 'nft';
  if (low.includes('sentiment'))                                                     return 'sentiment';
  if (low.includes('event') || low.includes('competition'))                          return 'events';
  return 'general';
}

function msgText(content: string): string {
  return content;
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ content, isUser }: { content: string; isUser: boolean }) {
  if (!content) return null;
  return (
    <div className={cn('flex gap-2.5', isUser ? 'flex-row-reverse' : '')}>
      <div className={cn(
        'shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5',
        isUser ? 'bg-secondary' : 'bg-yellow-500/15',
      )}>
        {isUser
          ? <User className="h-3.5 w-3.5 text-muted-foreground" />
          : <Bot className="h-3.5 w-3.5" style={{ color: '#FFD700' }} />}
      </div>
      <div className={cn(
        'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
        isUser
          ? 'bg-primary text-primary-foreground rounded-tr-none'
          : 'bg-secondary/50 border border-white/5 rounded-tl-none text-foreground',
      )}>
        {isUser
          ? <span>{content}</span>
          : <ReactMarkdown className="prose prose-invert prose-sm max-w-none [&>p]:mb-1 [&>ul]:mb-1">
              {content.replace(/ESCALATE_TO_ADMIN:[a-z\-]+/gi, '').replace(/\n{3,}/g, '\n\n').trim()}
            </ReactMarkdown>}
      </div>
    </div>
  );
}

// ─── Banners ──────────────────────────────────────────────────────────────────

function EscalationBanner({ section, ticketCreated }: { section: string; ticketCreated: boolean }) {
  return (
    <div className="mx-3 mb-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
      <div className="flex items-center gap-2 mb-1">
        {ticketCreated
          ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          : <HeadphonesIcon className="h-4 w-4 text-amber-400" />}
        <p className="text-xs font-bold text-amber-400">
          {ticketCreated ? 'Ticket Created Successfully' : 'Escalating to Admin...'}
        </p>
      </div>
      <p className="text-[11px] text-white/60">
        {ticketCreated
          ? `Issue sent to ${section} admin. Check "Support Center" in your Profile.`
          : `Routing to the ${section} team...`}
      </p>
    </div>
  );
}

function AdminEvalBanner({ onEval, loading }: { onEval: () => void; loading: boolean }) {
  return (
    <div className="mx-3 mb-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
      <div className="flex items-center gap-2 mb-1">
        <Shield className="h-4 w-4 text-blue-400" />
        <p className="text-xs font-bold text-blue-400">Admin Status Request Detected</p>
      </div>
      <p className="text-[11px] text-white/60 mb-2">Lynx AI can evaluate your activity for admin eligibility.</p>
      <button onClick={onEval} disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/25 text-blue-400 text-xs font-semibold disabled:opacity-50 transition-all hover:bg-blue-500/25">
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3" />}
        Evaluate My Activity
      </button>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-3 mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2">
      <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-red-300">{message}</p>
        <button onClick={onRetry} className="mt-1.5 text-[11px] text-red-400 underline underline-offset-2">Try again</button>
      </div>
    </div>
  );
}


// ─── ActiveChat ────────

type UserProp = { id: string; email: string; displayName: string; joinedAt: string } | null;

type ActiveChatProps = {
  conv: MentorConversation;
  onClose: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onNewConv: () => void;
  user: UserProp;
};

function ActiveChat({ conv, onClose, isExpanded, onToggleExpand, onNewConv, user }: ActiveChatProps) {
  const chat = useDeepSeekChat();
  const { messages, status, error, reload, agentName, agentEmoji } = chat;
  const isSending = status === 'submitted' || status === 'streaming';

  const [input,         setInput]         = useState('');
  const [escalated,     setEscalated]     = useState<{ section: string; ticketCreated: boolean } | null>(null);
  const [showAdminEval, setShowAdminEval] = useState(false);
  const [evalLoading,   setEvalLoading]   = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastHandledId = useRef<string | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isSending]);

  // Persist AI responses + detect escalation / admin request
  useEffect(() => {
    if (isSending) return;
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== 'assistant') return;
    if (lastHandledId.current === lastMsg.id) return;
    lastHandledId.current = lastMsg.id;

    const text = lastMsg.content || '';
    if (!text) return;

    appendMessage(conv.id, 'assistant', text);

    const escalationSection = parseEscalation(text);
    if (escalationSection && !escalated) {
      const section = escalationSection as TicketSection;
      setEscalated({ section, ticketCreated: false });
      if (user) {
        const mentorMsgs: MentorMessage[] = messages.map(m => ({
          id: m.id, role: m.role as 'user' | 'assistant',
          content: m.content || '', timestamp: new Date().toISOString(),
        }));
        const { title, description } = summariseForTicket(mentorMsgs);
        createTicket({
          userEmail: user.email, userName: user.displayName, section,
          title: `[Lynx AI] ${title}`,
          description: `**Chat transcript:**\n\n${description}`,
          priority: 'medium',
        }).then((nodeId: string) => {
          markEscalated(conv.id, nodeId, section);
          setEscalated({ section, ticketCreated: true });
        }).catch(() => setEscalated({ section, ticketCreated: false }));
      }
    }

    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (lastUser) {
      const t = (lastUser.content || '').toLowerCase();
      setShowAdminEval(t.includes('admin') &&
        (t.includes('request') || t.includes('apply') || t.includes('status') || t.includes('become')));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSending, messages]);

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || isSending || escalated) return;
    setInput('');
    appendMessage(conv.id, 'user', msg);
    await chat.sendMessage({ id: `${Date.now()}`, role: 'user', parts: [{ type: 'text', text: msg }] });
  }, [input, isSending, escalated, conv.id, chat]);

  const handleAdminEval = async () => {
    if (!user) return;
    setEvalLoading(true);
    setShowAdminEval(false);

    // Use Zustand store instead of raw localStorage
    let totalClosedTrades = 0;
    let winCount = 0;
    try {
      const tradingState = useTradingStore.getState();
      const history = (tradingState as any).history as Array<{ pnl: number }> | undefined;
      if (history && Array.isArray(history)) {
        totalClosedTrades = history.length;
        winCount = history.filter(t => t.pnl > 0).length;
      }
    } catch { /* fallback to zero values */ }

    const daysActive  = Math.floor((Date.now() - new Date(user.joinedAt).getTime()) / 86400000);
    const winRate = totalClosedTrades > 0
      ? (winCount / totalClosedTrades) * 100 : 0;
    const academyLevel = (() => {
      try {
        const academyData = localStorage.getItem('academy-storage');
        if (academyData) {
          const parsed = JSON.parse(academyData);
          return parsed.state?.level || 1;
        }
      } catch (e) { /* ignore */ }
      return 1;
    })();
    const prompt = buildAdminEvalPrompt({ daysActive, totalTrades: totalClosedTrades, winRate: Math.round(winRate), academyLevel });
    appendMessage(conv.id, 'user', '📋 Evaluate my activity for admin status');
    await chat.sendMessage({ id: `${Date.now()}`, role: 'user', parts: [{ type: 'text', text: prompt }] });
    setEvalLoading(false);
  };

  const hasMessages = messages.length > 0;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/20 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center">
            <LynxLogo size={36} state="idle" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-foreground">{agentName}</h3>
            <p className="text-[10px] text-green-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" /> CryptoVerse HQ · Online
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <button onClick={onNewConv} title="New conversation"
            className="p-1.5 hover:text-foreground transition-colors rounded-lg hover:bg-white/5">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button onClick={onToggleExpand}
            className="p-1.5 hover:text-foreground transition-colors rounded-lg hover:bg-white/5">
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button onClick={onClose}
            className="p-1.5 hover:text-foreground transition-colors rounded-lg hover:bg-white/5">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {!hasMessages && (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
              style={{ background: 'rgba(255,215,0,0.10)', border: '1px solid rgba(255,215,0,0.20)' }}>
              <Sparkles className="h-7 w-7" style={{ color: '#FFD700' }} />
            </div>
            <h4 className="text-sm font-bold text-foreground mb-1">CryptoVerse HQ Lynx AI</h4>
            <div className="text-xs text-muted-foreground mb-4 max-w-[240px] mx-auto leading-relaxed text-left">
              <ReactMarkdown className="prose prose-invert prose-xs max-w-none [&>p]:mb-1 [&>ul]:mb-1">
                {WELCOME_MESSAGE}
              </ReactMarkdown>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {STARTER_PROMPTS.map(p => (
                <button key={p} onClick={() => sendMessage(p)}
                  className="text-xs px-2.5 py-1.5 rounded-full transition-all"
                  style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.18)', color: '#FFD700' }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(m => (
          <MessageBubble key={m.id} content={m.content || ''} isUser={m.role === 'user'} />
        ))}

        {isSending && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,215,0,0.12)' }}>
              <Bot className="h-3.5 w-3.5" style={{ color: '#FFD700' }} />
            </div>
            <div className="bg-secondary/50 border border-white/5 rounded-2xl rounded-tl-none px-3.5 py-2.5">
              <div className="flex gap-1 items-center h-4">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {showAdminEval && !evalLoading && <AdminEvalBanner onEval={handleAdminEval} loading={evalLoading} />}
      {error && !isSending && (
        <ErrorBanner message="Connection error. Please check your network and try again." onRetry={() => reload()} />
      )}
      {escalated && <EscalationBanner section={escalated.section} ticketCreated={escalated.ticketCreated} />}

      {/* Input */}
      <div className="p-3 border-t border-white/10 bg-black/20 backdrop-blur-md shrink-0">
        {escalated?.ticketCreated ? (
          <button onClick={onNewConv}
            className="w-full py-2.5 rounded-full text-sm font-semibold transition-all"
            style={{ background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.25)', color: '#FFD700' }}>
            Start New Conversation
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input type="text" value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Ask Lynx AI…" disabled={isSending || !!escalated}
              className="flex-1 bg-secondary/50 border border-white/10 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-yellow-500/40 disabled:opacity-50 transition-all" />
            <button onClick={() => sendMessage()} disabled={!input.trim() || isSending || !!escalated}
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #FFD700 0%, #FFA800 100%)' }}>
              {isSending
                ? <Loader2 className="h-4 w-4 animate-spin text-[#0A1929]" />
                : <Send className="h-4 w-4 text-[#0A1929]" />}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Root Export ──────────────────────────────────────────────────────────────

export function AgentChat() {
  const { user } = useAuthStore();
  const [isOpen,     setIsOpen]     = useState(() => {
    try {
      return localStorage.getItem('cv_mentor_panel_open') === 'true';
    } catch { return false; }
  });
  const [isExpanded, setIsExpanded] = useState(() => {
    try {
      return localStorage.getItem('cv_mentor_panel_expanded') === 'true';
    } catch { return false; }
  });
  const [conv,       setConv]       = useState<MentorConversation | null>(null);
  const [convError,  setConvError]  = useState<string | null>(null);

  // Persist panel state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('cv_mentor_panel_open', String(isOpen));
    } catch { /* ignore */ }
  }, [isOpen]);

  useEffect(() => {
    try {
      localStorage.setItem('cv_mentor_panel_expanded', String(isExpanded));
    } catch { /* ignore */ }
  }, [isExpanded]);

  const startConversation = useCallback(() => {
    try {
      const newConv = createConv({
        userId:    user?.id    ?? 'guest',
        userEmail: user?.email ?? '',
        userName:  user?.displayName ?? 'Guest',
      });
      setConv(newConv);
      setConvError(null);
    } catch (err) {
      console.error('[AgentChat] Failed to create conversation:', err);
      setConvError('Failed to start conversation. Please try again.');
    }
  }, [user]);

  // Auto-create conversation if panel is open (e.g. restored from localStorage)
  // but no conversation exists yet — prevents the "Starting Lynx AI…" spinner.
  useEffect(() => {
    if (isOpen && !conv && !convError) {
      startConversation();
    }
  }, [isOpen, conv, convError, startConversation]);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    // Create conversation immediately when opening
    if (!conv) {
      startConversation();
    }
  }, [conv, startConversation]);

  const userProp: UserProp = user
    ? { id: user.id, email: user.email, displayName: user.displayName, joinedAt: user.joinedAt }
    : null;

  if (!isOpen) {
    return (
      <button onClick={handleOpen}
        // Below `lg` the app shows a fixed h-16 bottom tab bar (see Layout in
        // App.tsx), so `bottom-6` alone sits the button right on top of the
        // last tab instead of floating above it — worse still in RTL, where
        // rtl.css moves this button to the left and it lands squarely on the
        // NFT tab icon instead of empty space. `bottom-20` clears the tab bar
        // (64px) plus a gap on mobile/tablet; `lg:bottom-6` restores the
        // original corner position once the tab bar is gone.
        className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shadow-black/40 transition-all hover:scale-105 active:scale-[0.97] z-40"
        style={{ background: 'linear-gradient(135deg, #FFD700 0%, #FFA800 100%)', boxShadow: '0 4px 24px rgba(255,215,0,0.30)' }}
        title="CryptoVerse Lynx AI">
        <Bot className="h-6 w-6 text-[#0A1929]" />
      </button>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        key="chat-panel"
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={cn(
          'fixed z-50 flex flex-col overflow-hidden',
          'border border-white/10 shadow-2xl',
          isExpanded
            ? 'inset-0 rounded-none'
            : 'bottom-20 right-4 lg:bottom-6 lg:right-6 w-[calc(100vw-2rem)] max-w-sm sm:w-96 h-[600px] max-h-[70dvh] lg:max-h-[85dvh] rounded-2xl',
        )}
        style={{ background: '#0A1929' }}
      >
        {convError ? (
          <div className="flex flex-col h-full items-center justify-center gap-4 p-8 text-center">
            <AlertCircle className="h-8 w-8 text-red-400" />
            <p className="text-sm text-red-400">{convError}</p>
            <button onClick={startConversation}
              className="px-4 py-2 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/20 text-amber-400 rounded-lg text-xs font-semibold transition-all">
              Try Again
            </button>
          </div>
        ) : conv ? (
          <ActiveChat
            key={conv.id}
            conv={conv}
            onClose={() => { setIsOpen(false); setIsExpanded(false); }}
            isExpanded={isExpanded}
            onToggleExpand={() => setIsExpanded(e => !e)}
            onNewConv={startConversation}
            user={userProp}
          />
        ) : (
          <div className="flex flex-col h-full items-center justify-center gap-4 p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#FFD700' }} />
            <p className="text-sm text-muted-foreground">Starting Lynx AI…</p>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
