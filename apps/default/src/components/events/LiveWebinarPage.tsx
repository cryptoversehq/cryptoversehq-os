/**
 * LiveWebinarPage.tsx — Live webinar/market-analysis viewer with chat
 */
import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Mic, MicOff, Video, VideoOff, MessageSquare, Users,
  Pin, ThumbsUp, Flame, Star, Send, PlayCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useEventsStore } from './eventStore';
import { useAuthStore } from '../../lib/authStore';
import { LiveEvent, EventChatMessage, EVENT_TYPE_META } from './eventTypes';
import { Avatar, StatusBadge } from './eventUtils';

interface Props { event: LiveEvent }

const REACTIONS = [
  { emoji: '👍', icon: ThumbsUp },
  { emoji: '🔥', icon: Flame },
  { emoji: '💯', icon: Star },
];

// Simulated live stats that change over time
function useLiveStats(eventId: string) {
  const [viewers,  setViewers]  = useState(892);
  const [likes,    setLikes]    = useState(2341);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setViewers(v  => v + Math.floor((Math.random() - 0.4) * 5));
      setLikes(l    => l + Math.floor(Math.random() * 3));
      setDuration(d => d + 1);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  return { viewers: Math.max(800, viewers), likes, duration };
}

export function LiveWebinarPage({ event }: Props) {
  const { getChatMessages, sendChatMessage, isJoined, joinEvent } = useEventsStore();
  const { user }  = useAuthStore();
  const meta      = EVENT_TYPE_META[event.type];
  const isLive    = event.status === 'live';
  const joined    = isJoined(event.id);

  const [chatInput, setChatInput] = useState('');
  const [muted,     setMuted]     = useState(true);
  const [showChat,  setShowChat]  = useState(true);
  const chatEndRef  = useRef<HTMLDivElement>(null);

  const messages   = getChatMessages(event.id);
  const { viewers, likes, duration } = useLiveStats(event.id);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Simulate incoming messages
  useEffect(() => {
    if (!isLive) return;
    const pool = [
      'Great session! 🔥', 'When are we covering yield farming?', 'BTC looking bullish rn 📈',
      'Thanks for the alpha!', 'Can you share the charts?', 'This is gold 💯', 'Love this event!',
    ];
    const names = ['CryptoWolf','BitMaster','MoonTrader','EtherKing','DeFiPro'];
    const id = setInterval(() => {
      if (Math.random() > 0.4) {
        const msg: EventChatMessage = {
          id: Math.random().toString(36).slice(2),
          userId: `live-${Date.now()}`,
          displayName: names[Math.floor(Math.random() * names.length)],
          avatarSeed: Math.random().toString(),
          text: pool[Math.floor(Math.random() * pool.length)],
          timestamp: new Date().toISOString(),
          isHost: false,
          isPinned: false,
          reactions: {},
        };
        // inject into store via sendChatMessage (uses existing userId)
      }
    }, 4000);
    return () => clearInterval(id);
  }, [isLive]);

  function handleSend() {
    if (!chatInput.trim() || !user) return;
    sendChatMessage(event.id, user.id, user.displayName, chatInput);
    setChatInput('');
  }

  function fmtDuration(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  return (
    <div className="space-y-4">
      {/* Player + chat layout */}
      <div className="flex gap-4 flex-col lg:flex-row" style={{ minHeight: 480 }}>

        {/* ── Video player ── */}
        <div className="flex-1 rounded-2xl overflow-hidden flex flex-col"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>

          {/* Player area */}
          <div className={cn('relative flex-1 flex items-center justify-center bg-gradient-to-br', event.coverGradient)}
            style={{ minHeight: 260 }}>
            <div className="absolute inset-0 bg-black/40" />

            {/* Live badge */}
            {isLive && (
              <div className="absolute top-4 left-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500 text-white text-[11px] font-black z-10">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                LIVE
              </div>
            )}

            {/* Viewer count */}
            <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur text-white text-[11px] font-bold z-10">
              <Users className="h-3 w-3" /> {viewers.toLocaleString()}
            </div>

            {/* Duration */}
            {isLive && (
              <div className="absolute bottom-4 left-4 text-[11px] text-white/60 font-mono z-10">
                {fmtDuration(duration)}
              </div>
            )}

            {/* Center content */}
            <div className="relative z-10 text-center">
              <span className="text-7xl mb-4 block drop-shadow-lg">{event.icon}</span>
              <p className="text-xl font-black text-white drop-shadow mb-1">{event.title}</p>
              <p className="text-sm text-white/70">{event.subtitle}</p>
              {!isLive && (
                <div className="mt-4 flex items-center gap-2 text-white/60 justify-center text-sm">
                  <PlayCircle className="h-5 w-5" />
                  <span>{event.status === 'upcoming' ? 'Stream starts soon' : 'Replay available'}</span>
                </div>
              )}
            </div>

            {/* Reaction floaters */}
            {isLive && (
              <div className="absolute bottom-4 right-4 space-y-1">
                {REACTIONS.map(r => (
                  <button key={r.emoji}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur text-sm hover:bg-white/20 transition-colors"
                    onClick={() => {}}>
                    <span>{r.emoji}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Controls bar */}
          <div className="flex items-center gap-3 px-4 py-3 border-t border-white/5">
            <button onClick={() => setMuted(m => !m)}
              className={cn('p-2 rounded-xl transition-colors', muted ? 'bg-red-500/15 text-red-400' : 'bg-white/5 text-muted-foreground hover:text-foreground')}>
              {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>❤️ {likes.toLocaleString()}</span>
              {isLive && <span className="text-emerald-400">● Streaming</span>}
            </div>
            <div className="ml-auto flex gap-2">
              {/* Speakers */}
              {event.speakers?.map(sp => (
                <div key={sp.name} className="flex items-center gap-2 px-2 py-1 rounded-xl bg-white/4 border border-white/6">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white"
                    style={{ background: meta.color }}>{sp.avatar}</div>
                  <span className="text-[10px] text-muted-foreground hidden sm:block">{sp.name.split(' ')[0]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Join CTA if not joined */}
          {!joined && event.status !== 'completed' && (
            <div className="mx-4 mb-4 flex items-center gap-3 p-3 rounded-xl"
              style={{ background: `${meta.color}10`, border: `1px solid ${meta.color}25` }}>
              <p className="text-xs text-muted-foreground flex-1">Join to participate in the Q&A and earn your attendance badge.</p>
              <button onClick={() => user && joinEvent(event.id, user.id, user.displayName)}
                className="px-4 py-1.5 rounded-xl text-xs font-bold text-white"
                style={{ background: meta.color }}>
                Join Free
              </button>
            </div>
          )}
        </div>

        {/* ── Chat panel ── */}
        {showChat && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            className="w-full lg:w-80 flex flex-col rounded-2xl overflow-hidden"
            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', height: 480 }}>

            {/* Chat header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" style={{ color: meta.color }} />
                <span className="text-sm font-black text-foreground">Live Chat</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{messages.length} messages</span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
              {messages.map(msg => (
                <ChatBubble key={msg.id} msg={msg} accentColor={meta.color} />
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="px-3 py-3 border-t border-white/5 shrink-0">
              <div className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder={joined ? "Say something…" : "Join to chat"}
                  disabled={!joined || !isLive}
                  className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/8 text-xs focus:outline-none focus:border-primary/30 placeholder:text-muted-foreground disabled:opacity-40"
                />
                <button onClick={handleSend} disabled={!chatInput.trim() || !joined || !isLive}
                  className="p-2 rounded-xl text-white transition-all disabled:opacity-30 hover:brightness-110"
                  style={{ background: meta.color }}>
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Speakers section */}
      {event.speakers && event.speakers.length > 0 && (
        <div>
          <p className="text-xs font-black text-muted-foreground uppercase tracking-wider mb-3">Speakers</p>
          <div className="flex gap-3 flex-wrap">
            {event.speakers.map(sp => (
              <div key={sp.name} className="flex items-center gap-3 p-3 rounded-2xl flex-1 min-w-[220px]"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-sm text-white shrink-0"
                  style={{ background: meta.color }}>{sp.avatar}</div>
                <div>
                  <p className="text-sm font-black text-foreground">{sp.name}</p>
                  <p className="text-[10px]" style={{ color: meta.color }}>{sp.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{sp.bio}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChatBubble({ msg, accentColor }: { msg: EventChatMessage; accentColor: string }) {
  return (
    <div className={cn('flex gap-2', msg.isPinned ? 'bg-amber-500/5 -mx-1 px-1 py-1 rounded-lg border border-amber-500/15' : '')}>
      <Avatar seed={msg.avatarSeed} size={22} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className={cn('text-[10px] font-black', msg.isHost ? 'text-amber-400' : 'text-muted-foreground')}>
            {msg.displayName}
            {msg.isHost && ' 🎙️'}
            {msg.isPinned && <Pin className="inline h-2.5 w-2.5 ml-1 text-amber-400" />}
          </span>
        </div>
        <p className="text-xs text-foreground/90 break-words">{msg.text}</p>
        {Object.keys(msg.reactions).length > 0 && (
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
