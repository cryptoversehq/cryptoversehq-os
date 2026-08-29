/**
 * LiveWebinarFullPage.tsx — Spec §3.5
 * Live stream area, Q&A queue with voting, live chat, materials panel
 */
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Share2, Users, ThumbsUp, Send, Pin,
  Download, PlayCircle, FileText, BarChart3, Mic, MicOff,
  Video, MessageSquare, HelpCircle, BookOpen,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useEventsStore } from './eventStore';
import { useAuthStore } from '../../lib/authStore';
import { EventChatMessage, EVENT_TYPE_META } from './eventTypes';
import { Avatar, StatusBadge, fmtNum } from './eventUtils';
import { toast } from 'sonner';

// ── Q&A question ──────────────────────────────────────────────────────────────

interface QAItem { id: string; text: string; author: string; votes: number; answered: boolean }

const INIT_QA: QAItem[] = [
  { id: 'q1', text: 'How to identify fake breakouts?',          author: 'MoonTrader', votes: 28, answered: false },
  { id: 'q2', text: 'What is the best RSI setting for 4H?',     author: 'CryptoWolf', votes: 14, answered: false },
  { id: 'q3', text: 'Can you show an example on SOL?',          author: 'BitMaster',  votes: 11, answered: false },
  { id: 'q4', text: 'How do you trade during high volatility?', author: 'GridMaster', votes: 7,  answered: false },
];

function QARow({ item, onUpvote }: { item: QAItem; onUpvote: (id: string) => void }) {
  return (
    <div className={cn(
      'flex items-center gap-3 p-3 rounded-xl transition-colors',
      item.answered ? 'opacity-40' : 'bg-white/2 hover:bg-white/4',
    )}>
      <button onClick={() => onUpvote(item.id)} disabled={item.answered}
        className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors shrink-0 disabled:opacity-40">
        <ThumbsUp className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] font-black text-foreground">{item.votes}</span>
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground font-bold">{item.text}</p>
        <p className="text-[10px] text-muted-foreground">{item.author}</p>
      </div>
      {item.answered && <span className="text-[9px] text-emerald-400 font-bold shrink-0">Answered</span>}
    </div>
  );
}

// ── Chat bubble ───────────────────────────────────────────────────────────────

function ChatBubble({ msg, accentColor }: { msg: EventChatMessage; accentColor: string }) {
  return (
    <div className={cn('flex gap-2', msg.isPinned && 'bg-amber-500/5 -mx-1 px-1 py-1 rounded-lg border border-amber-500/15')}>
      <Avatar seed={msg.avatarSeed} size={22} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className={cn('text-[10px] font-black', msg.isHost ? 'text-amber-400' : 'text-muted-foreground')}>
            {msg.displayName}{msg.isHost && ' 🎙️'}
          </span>
          {msg.isPinned && <Pin className="inline h-2.5 w-2.5 text-amber-400" />}
        </div>
        <p className="text-xs text-foreground/90 break-words">{msg.text}</p>
        {Object.entries(msg.reactions).some(([,c]) => c > 0) && (
          <div className="flex gap-1 mt-0.5">
            {Object.entries(msg.reactions).filter(([,c]) => c > 0).map(([e, c]) => (
              <span key={e} className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded-full">{e} {c}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function LiveWebinarFullPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getEvent, getChatMessages, sendChatMessage, isJoined, joinEvent } = useEventsStore();
  const { user } = useAuthStore();

  const event  = getEvent(id ?? '');
  const joined = isJoined(id ?? '');
  const messages = getChatMessages(id ?? '');

  const [panel,     setPanel]     = useState<'chat' | 'qa' | 'materials'>('chat');
  const [chatInput, setChatInput] = useState('');
  const [qaItems,   setQaItems]   = useState<QAItem[]>(INIT_QA);
  const [qaInput,   setQaInput]   = useState('');
  const [viewers,   setViewers]   = useState(892);
  const [muted,     setMuted]     = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => {
    const id2 = setInterval(() => setViewers(v => v + Math.floor((Math.random() - 0.4) * 3)), 6000);
    return () => clearInterval(id2);
  }, []);

  if (!event) return <div className="flex items-center justify-center h-full"><button onClick={() => navigate('/events')} className="text-primary underline">← Back</button></div>;

  const meta = EVENT_TYPE_META[event.type];
  const isLive = event.status === 'live';

  function handleSend() {
    if (!chatInput.trim() || !user) return;
    sendChatMessage(event.id, user.id, user.displayName, chatInput);
    setChatInput('');
  }

  function handleAskQuestion() {
    if (!qaInput.trim()) return;
    const q: QAItem = { id: Date.now().toString(), text: qaInput.trim(), author: user?.displayName ?? 'Anonymous', votes: 0, answered: false };
    setQaItems(prev => [q, ...prev]);
    setQaInput('');
    toast.success('Question submitted!');
  }

  function handleUpvote(qid: string) {
    setQaItems(prev => prev.map(q => q.id === qid ? { ...q, votes: q.votes + 1 } : q));
  }

  const sortedQA = [...qaItems].sort((a, b) => b.votes - a.votes);

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/events/${event.id}`)}
            className="p-2 rounded-xl bg-white/4 hover:bg-white/8 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="font-black text-foreground text-base leading-tight">{event.title}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusBadge status={event.status} />
              <span className="text-[10px] text-muted-foreground">
                <Users className="inline h-3 w-3 mr-0.5" />{viewers.toLocaleString()} watching
              </span>
            </div>
          </div>
        </div>
        <button onClick={() => { toast.success('Link copied!'); }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/4 border border-white/8 text-xs font-bold">
          <Share2 className="h-3.5 w-3.5" /> Share
        </button>
      </div>

      {/* Main layout: stream + panel */}
      <div className="flex flex-col lg:flex-row gap-5" style={{ minHeight: 520 }}>

        {/* ── Stream ── */}
        <div className="flex-1 flex flex-col">
          {/* Video area */}
          <div className={cn('relative flex-1 rounded-2xl overflow-hidden flex items-center justify-center bg-gradient-to-br', event.coverGradient)}
            style={{ minHeight: 300, border: `1px solid ${event.accentColor}25` }}>
            <div className="absolute inset-0 bg-black/45" />

            {isLive && (
              <div className="absolute top-4 left-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500 text-white text-[10px] font-black z-10">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                LIVE NOW
              </div>
            )}

            <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur text-white text-[10px] font-bold z-10">
              <Users className="h-3 w-3" /> {viewers.toLocaleString()}
            </div>

            <div className="relative z-10 text-center px-6">
              <span className="text-6xl block mb-4">{event.icon}</span>
              <p className="text-2xl font-black text-white mb-1">{event.title}</p>
              <p className="text-sm text-white/70">{event.subtitle}</p>
              {event.speakers && event.speakers[0] && (
                <p className="mt-3 text-sm text-white/50">
                  {isLive ? '🎙️ ' : ''}{event.speakers[0].name} presenting…
                </p>
              )}
              {!isLive && (
                <div className="mt-4 flex items-center justify-center gap-2 text-white/50 text-sm">
                  <PlayCircle className="h-5 w-5" />
                  {event.status === 'upcoming' ? 'Stream starts soon' : 'Replay available below'}
                </div>
              )}
            </div>

            {/* Floating reactions */}
            {isLive && (
              <div className="absolute bottom-4 right-4 flex flex-col gap-1.5 z-10">
                {['👍','🔥','💯','🚀'].map(e => (
                  <button key={e} className="text-lg px-2 py-1 rounded-full bg-white/10 backdrop-blur hover:bg-white/20 transition-colors">
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <button onClick={() => setMuted(m => !m)}
              className={cn('flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-colors',
                muted ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-white/5 text-muted-foreground border border-white/8')}>
              {muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              {muted ? 'Unmute' : 'Mute'}
            </button>

            {/* Speaker cards */}
            <div className="flex gap-2 ml-auto">
              {event.speakers?.map(sp => (
                <div key={sp.name} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/4 border border-white/6">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white shrink-0"
                    style={{ background: meta.color }}>{sp.avatar}</div>
                  <span className="text-[11px] text-muted-foreground hidden sm:block">{sp.name.split(' ')[0]}</span>
                </div>
              ))}
            </div>

            {!joined && event.status !== 'completed' && (
              <button onClick={() => user && joinEvent(event.id, user.id, user.displayName)}
                className="ml-auto px-4 py-2 rounded-xl text-xs font-bold text-white"
                style={{ background: meta.color }}>
                Join Free
              </button>
            )}
          </div>
        </div>

        {/* ── Side panel ── */}
        <div className="w-full lg:w-80 flex flex-col rounded-2xl overflow-hidden"
          style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', height: 520 }}>

          {/* Panel tabs */}
          <div className="flex border-b border-white/5 shrink-0">
            {([
              { id: 'chat',      Icon: MessageSquare, label: 'Chat' },
              { id: 'qa',        Icon: HelpCircle,    label: 'Q&A' },
              { id: 'materials', Icon: BookOpen,      label: 'Materials' },
            ] as const).map(({ id: pid, Icon, label }) => (
              <button key={pid} onClick={() => setPanel(pid)}
                className={cn('flex-1 flex items-center justify-center gap-1.5 py-3 text-[11px] font-bold transition-colors',
                  panel === pid ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground')}>
                <Icon className="h-3.5 w-3.5" /> {label}
                {pid === 'qa' && qaItems.filter(q => !q.answered).length > 0 && (
                  <span className="text-[9px] px-1 rounded-full bg-primary/20 text-primary font-black">
                    {qaItems.filter(q => !q.answered).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Chat */}
          {panel === 'chat' && (
            <>
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                {messages.map(msg => <ChatBubble key={msg.id} msg={msg} accentColor={meta.color} />)}
                <div ref={chatEndRef} />
              </div>
              <div className="px-3 py-3 border-t border-white/5 shrink-0 flex gap-2">
                <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder={joined ? 'Say something…' : 'Join to chat'}
                  disabled={!joined || !isLive}
                  className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/8 text-xs focus:outline-none disabled:opacity-40" />
                <button onClick={handleSend} disabled={!chatInput.trim() || !joined || !isLive}
                  className="p-2 rounded-xl text-white disabled:opacity-30 transition-all"
                  style={{ background: meta.color }}>
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </>
          )}

          {/* Q&A */}
          {panel === 'qa' && (
            <>
              {/* Submit question */}
              <div className="px-3 py-3 border-b border-white/5 shrink-0">
                <div className="flex gap-2">
                  <input value={qaInput} onChange={e => setQaInput(e.target.value)}
                    placeholder="Ask a question…"
                    className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/8 text-xs focus:outline-none" />
                  <button onClick={handleAskQuestion} disabled={!qaInput.trim()}
                    className="p-2 rounded-xl text-white disabled:opacity-30"
                    style={{ background: meta.color }}>
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
                {sortedQA.length > 0 && (
                  <p className="text-[10px] text-muted-foreground px-1 mb-2">
                    📝 Q&A Queue — {sortedQA.filter(q => !q.answered).length} pending
                  </p>
                )}
                {sortedQA.map(q => <QARow key={q.id} item={q} onUpvote={handleUpvote} />)}
              </div>
            </>
          )}

          {/* Materials */}
          {panel === 'materials' && (
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              {[
                { icon: FileText, label: 'Presentation Slides', action: 'Download', available: true },
                { icon: PlayCircle, label: 'Recording', action: isLive ? 'Available after webinar' : 'Watch', available: !isLive },
                { icon: BarChart3, label: 'Practice Chart', action: 'Interactive', available: true },
                { icon: BookOpen,  label: 'Session Notes', action: 'Download', available: true },
              ].map(item => (
                <div key={item.label} className={cn(
                  'flex items-center gap-3 p-3 rounded-xl transition-colors',
                  item.available ? 'bg-white/3 hover:bg-white/5 cursor-pointer' : 'bg-white/1 opacity-50',
                )}>
                  <item.icon className="h-4 w-4 shrink-0" style={{ color: meta.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground">{item.label}</p>
                    <p className="text-[10px] text-muted-foreground">{item.action}</p>
                  </div>
                  {item.available && <Download className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
