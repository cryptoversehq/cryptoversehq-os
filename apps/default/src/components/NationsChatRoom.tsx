import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  MessageCircle, Send, SmilePlus, Lock, Users,
  ChevronDown, Sparkles, Flame, Flag, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/authStore';
import { useAdminPortalStore } from '@/lib/adminPortalStore';
import { useNationsChatModeration } from '@/lib/nationsChatModeration';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  authorName: string;
  authorAvatar: string;        // dicebear seed
  authorLevel: number;
  nationId: string;
  text: string;
  timestamp: number;           // ms since epoch
  reactions: Record<string, string[]>; // emoji → list of author names who reacted
  isBot: boolean;
}

interface NationsChatRoomProps {
  nationId: string;
  nationName: string;
  nationFlag: string;
  nationColor: string;
  nationGradient: string;
  isMember: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const EMOJI_PALETTE = ['🔥', '💎', '🚀', '📈', '😂', '💀', '👑', '⚡', '🤝', '💯'];

const TYPING_NAMES: Record<string, string[]> = {
  alpha: ['SatoshiNakamoto99', 'DiamondHands_Pro', 'IronHandsOnly'],
  bull:  ['WhaleRider_2025',  'MoonMathician',    'CryptoNomad_42'],
  sigma: ['AlgoPhantom_X',    'CryptoNomad_42',   'QuantumLeverage'],
  bear:  ['QuantumLeverage',  'Leveraged_Legend', 'AlgoPhantom_X'],
};

// Seeded bot messages per nation
const SEED_MESSAGES: Record<string, Array<{ author: string; level: number; text: string; ago: number }>> = {
  alpha: [
    { author: 'SatoshiNakamoto99', level: 98, text: '🔷 Alpha Republic never sleeps. Quant bots running 24/7 gm.',   ago: 3_600_000 },
    { author: 'DiamondHands_Pro',  level: 91, text: 'Anyone catching BTC at 62k? Looking like a textbook support.',   ago: 2_900_000 },
    { author: 'IronHandsOnly',     level: 71, text: 'Buy the fear, sell the euphoria. Classic alpha play.',           ago: 2_100_000 },
    { author: 'SatoshiNakamoto99', level: 98, text: 'Win rate sitting at 87.3% this week. Discipline 🙌',            ago: 1_600_000 },
    { author: 'DiamondHands_Pro',  level: 91, text: '@IronHandsOnly exactly. The algo triggered perfectly.',         ago: 1_000_000 },
    { author: 'IronHandsOnly',     level: 71, text: 'Leaderboard looking clean. #1 nation again this month 🏆',      ago:   500_000 },
  ],
  bull: [
    { author: 'WhaleRider_2025',   level: 94, text: '🟢 Every dip is a gift. Loaded up on ETH again gm.',           ago: 3_500_000 },
    { author: 'MoonMathician',     level: 84, text: 'Bull Empire never doubts the upward cycle. WAGMI 🚀',           ago: 2_700_000 },
    { author: 'CryptoNomad_42',    level: 75, text: 'Buying since 2019 and never stopped lol.',                     ago: 2_000_000 },
    { author: 'WhaleRider_2025',   level: 94, text: 'Market dipped 5% and we kept climbing. This community 💎',     ago: 1_500_000 },
    { author: 'MoonMathician',     level: 84, text: '$100 target incoming. Screenshot this.',                        ago:   800_000 },
    { author: 'CryptoNomad_42',    level: 75, text: 'When moon? RIGHT NOW. Always has been 📈',                     ago:   300_000 },
  ],
  sigma: [
    { author: 'AlgoPhantom_X',     level: 81, text: '🟡 Arbitrage window open on ETH/BTC for 12 minutes.',          ago: 3_200_000 },
    { author: 'CryptoNomad_42',    level: 75, text: 'Sigma never reveals the strategy. But it works.',              ago: 2_600_000 },
    { author: 'AlgoPhantom_X',     level: 81, text: 'Flash arb closed. +2.3% in under a minute.',                   ago: 1_900_000 },
    { author: 'CryptoNomad_42',    level: 75, text: 'Multi-chain operation running smooth. 🤫',                     ago: 1_300_000 },
    { author: 'AlgoPhantom_X',     level: 81, text: 'Next window predicted in ~40 min. Set your alerts.',           ago:   700_000 },
    { author: 'CryptoNomad_42',    level: 75, text: 'The Order stays hidden in plain sight ⚡',                     ago:   200_000 },
  ],
  bear: [
    { author: 'QuantumLeverage',   level: 87, text: '🔴 Markets looking very overbought. Short squeeze incoming.',   ago: 3_000_000 },
    { author: 'Leveraged_Legend',  level: 78, text: 'The bears feast while bulls celebrate lol.',                   ago: 2_400_000 },
    { author: 'AlgoPhantom_X',     level: 81, text: 'Short position hitting TP. +7.9% today.',                     ago: 1_800_000 },
    { author: 'QuantumLeverage',   level: 87, text: 'Leverage is a tool. Precision is the skill.',                 ago: 1_200_000 },
    { author: 'Leveraged_Legend',  level: 78, text: 'Volatility spiking — exactly what we needed.',                ago:   600_000 },
    { author: 'AlgoPhantom_X',     level: 81, text: 'Bear Collective loading up while the market sleeps 💀',        ago:   150_000 },
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000)      return 'just now';
  if (diff < 3_600_000)   return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)  return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function buildSeed(nationId: string): ChatMessage[] {
  const raw = SEED_MESSAGES[nationId] ?? SEED_MESSAGES['alpha'];
  return raw.map((m, i) => ({
    id: `seed-${nationId}-${i}`,
    authorName: m.author,
    authorAvatar: m.author,
    authorLevel: m.level,
    nationId,
    text: m.text,
    timestamp: Date.now() - m.ago,
    reactions: {},
    isBot: true,
  }));
}

// Auto-reply pool per nation
const AUTO_REPLIES: Record<string, string[]> = {
  alpha: [
    'The algorithm agrees 📊',
    'Quant signals confirm. Adding to position.',
    'Risk-adjusted returns looking clean this week.',
    'Precision entry. Typical Alpha move 🔷',
    'Our win rate speaks for itself 87% and climbing.',
  ],
  bull: [
    'WAGMI brothers and sisters 🚀',
    'Every dip is a gift. Never selling.',
    'The only way is up. Trust the cycle.',
    'Loading up while others panic 📈',
    'Bullish. Always bullish.',
  ],
  sigma: [
    'The Order observes. The Order acts. 🟡',
    'Opportunity identified. Executing.',
    'Three exchanges, one play. Classic Sigma.',
    'Arb window opening in 3... 2...',
    'Sigma stays silent. Results speak.',
  ],
  bear: [
    'The carnage continues. Precisely as predicted 🔴',
    'Short squeeze bait? We don\'t fall for it.',
    'Volatility is our playground 💀',
    'They said bears were extinct lol.',
    'Maximum pain incoming for longs.',
  ],
};

// ─── EmojiButton ──────────────────────────────────────────────────────────────
function EmojiPicker({
  onPick,
  onClose,
}: { onPick: (e: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-2 left-0 z-50 flex gap-1 bg-card border border-white/10
                 rounded-2xl px-3 py-2 shadow-2xl shadow-black/40 animate-in fade-in zoom-in-95 duration-150"
    >
      {EMOJI_PALETTE.map(e => (
        <button
          key={e}
          onClick={() => { onPick(e); onClose(); }}
          className="text-lg hover:scale-125 transition-transform duration-100 active:scale-90"
        >
          {e}
        </button>
      ))}
    </div>
  );
}

// ─── Single Message ───────────────────────────────────────────────────────────
function ChatBubble({
  msg,
  isOwn,
  nationColor,
  onReact,
  onReport,
  currentUserName,
}: {
  msg: ChatMessage;
  isOwn: boolean;
  nationColor: string;
  onReact: (msgId: string, emoji: string) => void;
  onReport: (msg: ChatMessage) => void;
  currentUserName: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reported, setReported]     = useState(false);

  const totalReactions = Object.values(msg.reactions).reduce((s, a) => s + a.length, 0);

  return (
    <div className={cn('flex gap-2.5 group', isOwn && 'flex-row-reverse')}>
      {/* Avatar */}
      <img
        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.authorAvatar}`}
        alt={msg.authorName}
        className="h-8 w-8 rounded-full border border-white/10 flex-shrink-0 self-start mt-0.5"
      />

      <div className={cn('flex flex-col max-w-[75%]', isOwn && 'items-end')}>
        {/* Meta */}
        <div className={cn('flex items-center gap-1.5 mb-1', isOwn && 'flex-row-reverse')}>
          <span className="text-xs font-semibold text-foreground/80 truncate max-w-[140px]">
            {msg.authorName}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold"
            style={{ backgroundColor: nationColor + '25', color: nationColor }}
          >
            Lv{msg.authorLevel}
          </span>
          <span className="text-[10px] text-muted-foreground flex-shrink-0">
            {fmtRelative(msg.timestamp)}
          </span>
        </div>

        {/* Bubble */}
        <div className="relative">
          <div
            className={cn(
              'px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed',
              isOwn
                ? 'rounded-tr-sm'
                : 'rounded-tl-sm bg-secondary/60 border border-white/5',
            )}
            style={isOwn ? { backgroundColor: nationColor + '30', border: `1px solid ${nationColor}50` } : {}}
          >
            {msg.text}
          </div>

          {/* Reaction row */}
          <div className={cn('flex flex-wrap gap-1 mt-1.5', isOwn && 'justify-end')}>
            {Object.entries(msg.reactions).map(([emoji, reactors]) => {
              const iReacted = reactors.includes(currentUserName);
              return (
                <button
                  key={emoji}
                  onClick={() => onReact(msg.id, emoji)}
                  className={cn(
                    'flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs border transition-all duration-150',
                    'hover:scale-105 active:scale-95',
                    iReacted
                      ? 'border-white/20 bg-white/10'
                      : 'border-white/5 bg-black/20 hover:border-white/15',
                  )}
                >
                  <span>{emoji}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{reactors.length}</span>
                </button>
              );
            })}

            {/* Add reaction */}
            <div className="relative">
              <button
                onClick={() => setPickerOpen(p => !p)}
                className="h-6 w-6 flex items-center justify-center rounded-full border border-white/5
                           bg-black/20 text-muted-foreground hover:border-white/20 hover:text-foreground
                           transition-all opacity-0 group-hover:opacity-100 duration-150"
              >
                <SmilePlus className="h-3 w-3" />
              </button>
              {pickerOpen && (
                <EmojiPicker
                  onPick={(e) => onReact(msg.id, e)}
                  onClose={() => setPickerOpen(false)}
                />
              )}
            </div>

            {/* Report message */}
            {!isOwn && !msg.isBot && (
              <button
                onClick={() => { if (!reported) { onReport(msg); setReported(true); } }}
                disabled={reported}
                title={reported ? 'Reported — an admin will review this' : 'Report this message'}
                className={cn(
                  'h-6 w-6 flex items-center justify-center rounded-full border transition-all duration-150',
                  reported
                    ? 'border-red-500/30 bg-red-500/10 text-red-400 opacity-100'
                    : 'border-white/5 bg-black/20 text-muted-foreground hover:border-red-500/30 hover:text-red-400 opacity-0 group-hover:opacity-100',
                )}
              >
                {reported ? <Check className="h-3 w-3" /> : <Flag className="h-3 w-3" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Typing Indicator ─────────────────────────────────────────────────────────
function TypingDots({ name, nationColor }: { name: string; nationColor: string }) {
  return (
    <div className="flex items-center gap-2 px-1 animate-in fade-in duration-200">
      <div className="flex gap-1 items-center">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full animate-bounce"
            style={{
              backgroundColor: nationColor,
              animationDelay: `${i * 150}ms`,
              animationDuration: '800ms',
            }}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{name} is typing…</span>
    </div>
  );
}

// ─── Locked Overlay ───────────────────────────────────────────────────────────
function LockedOverlay({
  nationName,
  nationFlag,
  nationColor,
}: { nationName: string; nationFlag: string; nationColor: string }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4
                    bg-card/80 backdrop-blur-md rounded-b-2xl">
      <div
        className="p-4 rounded-2xl border"
        style={{ backgroundColor: nationColor + '20', borderColor: nationColor + '40' }}
      >
        <Lock className="h-8 w-8" style={{ color: nationColor }} />
      </div>
      <div className="text-center px-6">
        <p className="font-bold text-lg">{nationFlag} Members Only</p>
        <p className="text-sm text-muted-foreground mt-1">
          Join <span style={{ color: nationColor }}>{nationName}</span> to access the clan chat room.
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function NationsChatRoom({
  nationId,
  nationName,
  nationFlag,
  nationColor,
  nationGradient,
  isMember,
}: NationsChatRoomProps) {
  const { user } = useAuthStore();
  const myName   = user?.displayName ?? 'You';
  const myAvatar = user?.avatarSeed  ?? 'Felix';
  const myLevel  = 63;
  const submitReport = useAdminPortalStore(s => s.submitReport);
  const { reportMessage, warnUser, isMuted } = useNationsChatModeration();

  // ── State ──────────────────────────────────────────────────────────────────
  const [messages, setMessages]       = useState<ChatMessage[]>(() => buildSeed(nationId));
  const [input, setInput]             = useState('');
  const [isTyping, setIsTyping]       = useState(false);
  const [typingName, setTypingName]   = useState('');
  const [pickerOpen, setPickerOpen]   = useState(false);
  const [unread, setUnread]           = useState(0);
  const [atBottom, setAtBottom]       = useState(true);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const scrollRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);

  // Re-seed when nation changes
  useEffect(() => {
    setMessages(buildSeed(nationId));
    setInput('');
    setUnread(0);
    setAtBottom(true);
  }, [nationId]);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    setUnread(0);
  }, []);

  useEffect(() => {
    if (atBottom) scrollToBottom(false);
    else setUnread(u => u + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Track scroll position to show/hide scroll-to-bottom pill
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(distFromBottom < 60);
    if (distFromBottom < 60) setUnread(0);
  }, []);

  // Simulated bot auto-reply after user sends
  const scheduleAutoReply = useCallback(() => {
    const names   = TYPING_NAMES[nationId] ?? TYPING_NAMES['alpha'];
    const replies = AUTO_REPLIES[nationId]  ?? AUTO_REPLIES['alpha'];
    const who = names[Math.floor(Math.random() * names.length)];
    const what = replies[Math.floor(Math.random() * replies.length)];
    const delay = 1200 + Math.random() * 2000;

    setTimeout(() => {
      setTypingName(who);
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [...prev, {
          id: uid(),
          authorName: who,
          authorAvatar: who,
          authorLevel: 60 + Math.floor(Math.random() * 40),
          nationId,
          text: what,
          timestamp: Date.now(),
          reactions: {},
          isBot: true,
        }]);
      }, delay);
    }, 500);
  }, [nationId]);

  // Also occasionally send unsolicited messages
  useEffect(() => {
    if (!isMember) return;
    const names   = TYPING_NAMES[nationId] ?? TYPING_NAMES['alpha'];
    const replies = AUTO_REPLIES[nationId]  ?? AUTO_REPLIES['alpha'];

    const id = setInterval(() => {
      if (Math.random() > 0.4) return; // ~60% chance to fire each tick
      const who  = names[Math.floor(Math.random() * names.length)];
      const what = replies[Math.floor(Math.random() * replies.length)];
      setTypingName(who);
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [...prev, {
          id: uid(),
          authorName: who,
          authorAvatar: who,
          authorLevel: 60 + Math.floor(Math.random() * 40),
          nationId,
          text: what,
          timestamp: Date.now(),
          reactions: {},
          isBot: true,
        }]);
      }, 1500 + Math.random() * 1500);
    }, 18_000 + Math.random() * 12_000);

    return () => clearInterval(id);
  }, [nationId, isMember]);

  // ── Send ───────────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || !isMember) return;

    // Check if user is muted by moderation
    const userId = user?.id ?? myName;
    if (isMuted(nationId, userId)) {
      toast.warning('You are muted in this chat room.', { duration: 3000 });
      return;
    }

    // Scan for banned words
    const bannedWords = ['scam', 'phishing', 'hack', 'malware', 'rug', 'ponzi'];
    const lowerText = text.toLowerCase();
    const foundBanned = bannedWords.find(w => lowerText.includes(w));
    if (foundBanned) {
      const result = warnUser(nationId, userId);
      const muteMsg = result.muted ? ' You have been muted.' : '';
      toast.warning(`Message contains prohibited content ("${foundBanned}").${muteMsg}`, { duration: 4000 });
      setInput('');
      return;
    }

    setMessages(prev => [...prev, {
      id: uid(),
      authorName: myName,
      authorAvatar: myAvatar,
      authorLevel: myLevel,
      nationId,
      text,
      timestamp: Date.now(),
      reactions: {},
      isBot: false,
    }]);
    setInput('');
    setAtBottom(true);
    scheduleAutoReply();
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [input, isMember, myName, myAvatar, nationId, scheduleAutoReply]);

  // ── React ──────────────────────────────────────────────────────────────────
  const handleReact = useCallback((msgId: string, emoji: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      const reactors = m.reactions[emoji] ?? [];
      const alreadyReacted = reactors.includes(myName);
      return {
        ...m,
        reactions: {
          ...m.reactions,
          [emoji]: alreadyReacted
            ? reactors.filter(n => n !== myName)
            : [...reactors, myName],
        },
      };
    }));
  }, [myName]);

  // ── Report ─────────────────────────────────────────────────────────────────
  const handleReport = useCallback((msg: ChatMessage) => {
    // Route through moderation store for auto-detection + admin notification
    reportMessage(nationId, msg.authorName, msg.text);
    // Also submit to admin portal for manual review
    submitReport({
      reporterId:   user?.id ?? myName,
      reporterName: myName,
      targetId:     msg.authorName,
      targetName:   msg.authorName,
      reason:       `Reported chat message in ${nationId}: "${msg.text.slice(0, 200)}"`,
      category:     'chat',
    });
    toast.success('Message reported. An admin will review it.');
  }, [submitReport, user, myName, reportMessage, nationId]);

  const onlineCount = useMemo(() => 42 + Math.floor(Math.random() * 80), []);

  return (
    <div className="bg-card border border-white/5 rounded-2xl overflow-hidden shadow-xl flex flex-col">

      {/* ── Header ── */}
      <div
        className={cn(
          'relative flex items-center gap-3 px-5 py-4 border-b border-white/5',
          'bg-gradient-to-r',
          nationGradient,
        )}
      >
        <div
          className="p-2 rounded-xl border"
          style={{ backgroundColor: nationColor + '25', borderColor: nationColor + '40' }}
        >
          <MessageCircle className="h-5 w-5" style={{ color: nationColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base">{nationFlag} {nationName} Chat</h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              {onlineCount} online
            </span>
            <span className="opacity-30">·</span>
            <Users className="h-3 w-3" />
            <span>Members only</span>
          </div>
        </div>
        {!isMember && (
          <span
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium"
            style={{ color: nationColor, borderColor: nationColor + '50', backgroundColor: nationColor + '15' }}
          >
            <Lock className="h-3 w-3" /> Join to chat
          </span>
        )}
        {isMember && (
          <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-green-500/15 border border-green-500/30 text-green-400 font-medium">
            <Sparkles className="h-3 w-3" /> Member
          </span>
        )}
      </div>

      {/* ── Messages ── */}
      <div className="relative flex-1">
        {/* Locked overlay */}
        {!isMember && (
          <LockedOverlay
            nationName={nationName}
            nationFlag={nationFlag}
            nationColor={nationColor}
          />
        )}

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-80 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin
                     scrollbar-thumb-white/10 scrollbar-track-transparent"
          style={{ scrollbarGutter: 'stable' }}
        >
          {messages.map(msg => (
            <ChatBubble
              key={msg.id}
              msg={msg}
              isOwn={msg.authorName === myName}
              nationColor={nationColor}
              onReact={handleReact}
              onReport={handleReport}
              currentUserName={myName}
            />
          ))}

          {/* Typing indicator */}
          {isTyping && <TypingDots name={typingName} nationColor={nationColor} />}

          <div ref={bottomRef} />
        </div>

        {/* Scroll-to-bottom pill */}
        {!atBottom && (
          <button
            onClick={() => scrollToBottom()}
            className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5
                       bg-card border border-white/10 rounded-full px-3 py-1.5
                       text-xs font-semibold shadow-lg hover:bg-secondary/60
                       transition-all animate-in fade-in slide-in-from-bottom-2 duration-200"
            style={{ color: nationColor }}
          >
            <ChevronDown className="h-3.5 w-3.5" />
            {unread > 0 ? `${unread} new` : 'Scroll down'}
          </button>
        )}
      </div>

      {/* ── Input Area ── */}
      <div className="px-4 py-3 border-t border-white/5 bg-secondary/10">
        {isMember ? (
          <div className="flex items-center gap-2">
            {/* My avatar */}
            <img
              src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${myAvatar}`}
              alt={myName}
              className="h-7 w-7 rounded-full border border-white/10 flex-shrink-0"
            />

            {/* Emoji quick-pick */}
            <div className="relative">
              <button
                onClick={() => setPickerOpen(p => !p)}
                className="h-8 w-8 flex items-center justify-center rounded-xl border border-white/5
                           bg-black/20 text-muted-foreground hover:border-white/15 hover:text-foreground
                           transition-all flex-shrink-0"
              >
                <SmilePlus className="h-4 w-4" />
              </button>
              {pickerOpen && (
                <div className="absolute bottom-full mb-2 left-0 z-50 flex gap-1 bg-card border
                                border-white/10 rounded-2xl px-3 py-2 shadow-2xl shadow-black/40
                                animate-in fade-in zoom-in-95 duration-150">
                  {EMOJI_PALETTE.map(e => (
                    <button
                      key={e}
                      onClick={() => {
                        setInput(i => i + e);
                        setPickerOpen(false);
                        inputRef.current?.focus();
                      }}
                      className="text-lg hover:scale-125 transition-transform duration-100 active:scale-90"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Text input */}
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={`Message ${nationFlag} ${nationName}…`}
              maxLength={280}
              className="flex-1 bg-black/20 border border-white/5 rounded-xl px-3 py-2 text-sm
                         placeholder:text-muted-foreground focus:outline-none focus:border-white/20
                         transition-all"
            />

            {/* Send */}
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className={cn(
                'h-9 w-9 flex items-center justify-center rounded-xl border text-sm font-semibold',
                'transition-all duration-200 active:scale-90 flex-shrink-0',
                input.trim()
                  ? 'text-white hover:brightness-110 shadow-lg'
                  : 'opacity-30 cursor-not-allowed border-white/5 bg-black/20 text-muted-foreground',
              )}
              style={input.trim() ? {
                backgroundColor: nationColor,
                borderColor: nationColor,
                boxShadow: `0 4px 14px ${nationColor}40`,
              } : {}}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" />
            Join <span className="font-semibold" style={{ color: nationColor }}>{nationName}</span> to send messages
          </div>
        )}

        {/* Char count */}
        {isMember && input.length > 200 && (
          <p className="text-right text-[10px] text-muted-foreground mt-1 pr-1">
            {280 - input.length} remaining
          </p>
        )}
      </div>

      {/* Active nation heat indicator */}
      {isMember && (
        <div
          className="flex items-center justify-center gap-2 py-2 border-t border-white/5 text-[11px] text-muted-foreground"
          style={{ background: nationColor + '08' }}
        >
          <Flame className="h-3 w-3 text-orange-400" />
          Chat active · {messages.length} messages · Nation-only channel
        </div>
      )}
    </div>
  );
}
