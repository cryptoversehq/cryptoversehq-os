/**
 * eventTypes.ts — Complete type system for Live Events & Group Challenges
 */

// ── Core enums ───────────────────────────────────────────────────────────────

export type EventType =
  | 'weekend_warrior'
  | 'monthly_championship'
  | 'team_battle'
  | 'live_webinar'
  | 'flash_challenge'
  | 'market_analysis_live';

export type EventStatus = 'upcoming' | 'live' | 'completed' | 'cancelled';

export type EventDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export type RewardType = 'badge' | 'virtual_cash' | 'xp' | 'nft' | 'plan_upgrade';

export type TeamRole = 'captain' | 'member';

export type ParticipantStatus = 'registered' | 'active' | 'disqualified' | 'completed';

// ── Event metadata ───────────────────────────────────────────────────────────

export interface EventReward {
  rank:        number | 'all';   // 1st, 2nd … or 'all' participants
  type:        RewardType;
  label:       string;
  value:       number;           // CP / XP amount, or 0 for badge/NFT
  icon:        string;           // emoji
}

export interface EventRule {
  label: string;
  value: string;
}

export interface EventSpeaker {
  name:    string;
  title:   string;
  avatar:  string;             // initials fallback
  bio:     string;
}

export interface LiveEvent {
  id:            string;
  type:          EventType;
  title:         string;
  subtitle:      string;
  description:   string;
  status:        EventStatus;
  difficulty:    EventDifficulty;

  startAt:       string;       // ISO
  endAt:         string;       // ISO
  durationLabel: string;       // "48 hours", "30 days" …

  maxParticipants:  number | null;   // null = unlimited
  currentParticipants: number;
  minLevel:         number;          // 0 = no restriction

  teamSize:         number | null;   // null = individual
  isTeamEvent:      boolean;

  prize:            string;          // short human-readable "$5,000 prize pool"
  prizePool:        number;          // USD
  rewards:          EventReward[];

  tags:             string[];
  rules:            EventRule[];
  speakers?:        EventSpeaker[];  // webinars / market analysis

  coverGradient:    string;          // Tailwind gradient classes
  accentColor:      string;          // hex
  icon:             string;          // emoji
  isHot:            boolean;
  isFeatured:       boolean;
}

// ── Participant & team ───────────────────────────────────────────────────────

export interface EventParticipant {
  userId:       string;
  displayName:  string;
  avatarSeed:   string;
  rank:         number;
  score:        number;        // portfolio return % or points
  pnl:          number;        // USD
  pnlPct:       number;
  trades:       number;
  winRate:      number;        // 0-1
  status:       ParticipantStatus;
  teamId?:      string;
  teamRole?:    TeamRole;
  joinedAt:     string;
  country?:     string;
  badge?:       string;        // rank badge emoji
  delta:        number;        // rank change since last tick (+/-)
}

export interface EventTeam {
  id:           string;
  eventId:      string;
  name:         string;
  emoji:        string;
  color:        string;
  captain:      EventParticipant;
  members:      EventParticipant[];
  totalScore:   number;
  rank:         number;
  isOpen:       boolean;       // accepting new members
}

// ── Chat message (webinar) ───────────────────────────────────────────────────

export interface EventChatMessage {
  id:          string;
  userId:      string;
  displayName: string;
  avatarSeed:  string;
  text:        string;
  timestamp:   string;
  isHost:      boolean;
  isPinned:    boolean;
  reactions:   Record<string, number>; // emoji → count
}

// ── Notification ─────────────────────────────────────────────────────────────

export interface EventNotification {
  id:        string;
  eventId:   string;
  title:     string;
  body:      string;
  icon:      string;
  timestamp: string;
  read:      boolean;
  type:      'start' | 'end_soon' | 'rank_change' | 'team_invite' | 'reward';
}

// ── Store state ──────────────────────────────────────────────────────────────

export interface UserEventEntry {
  eventId:      string;
  joinedAt:     string;
  teamId?:      string;
  currentRank:  number;
  score:        number;
  pnl:          number;
  pnlPct:       number;
  trades:       number;
  winRate:      number;
  status:       ParticipantStatus;
  rewardsEarned: EventReward[];
}

export interface EventsState {
  events:          LiveEvent[];
  leaderboards:    Record<string, EventParticipant[]>;
  teams:           Record<string, EventTeam[]>;
  chatMessages:    Record<string, EventChatMessage[]>;
  notifications:   EventNotification[];
  myEntries:       Record<string, UserEventEntry>;
  earnedBadges:    string[];
  activeTab:       string;
  selectedEventId: string | null;
}

// ── Event type metadata ──────────────────────────────────────────────────────

export const EVENT_TYPE_META: Record<EventType, {
  label:    string;
  icon:     string;
  color:    string;
  duration: string;
  teamPlay: boolean;
}> = {
  weekend_warrior: {
    label:    'Weekend Warrior',
    icon:     '⚔️',
    color:    '#f59e0b',
    duration: '48 hours',
    teamPlay: false,
  },
  monthly_championship: {
    label:    'Monthly Championship',
    icon:     '🏆',
    color:    '#6366f1',
    duration: '30 days',
    teamPlay: false,
  },
  team_battle: {
    label:    'Team Battle',
    icon:     '🛡️',
    color:    '#ec4899',
    duration: '7 days',
    teamPlay: true,
  },
  live_webinar: {
    label:    'Live Webinar',
    icon:     '🎙️',
    color:    '#22c55e',
    duration: '1-2 hours',
    teamPlay: false,
  },
  flash_challenge: {
    label:    'Flash Challenge',
    icon:     '⚡',
    color:    '#ef4444',
    duration: '1-6 hours',
    teamPlay: false,
  },
  market_analysis_live: {
    label:    'Market Analysis Live',
    icon:     '📊',
    color:    '#06b6d4',
    duration: '1 hour',
    teamPlay: false,
  },
};

export const DIFFICULTY_META: Record<EventDifficulty, { label: string; color: string }> = {
  beginner:     { label: 'Beginner',     color: '#22c55e' },
  intermediate: { label: 'Intermediate', color: '#f59e0b' },
  advanced:     { label: 'Advanced',     color: '#f97316' },
  expert:       { label: 'Expert',       color: '#ef4444' },
};

// ── Deterministic pseudo-random helpers ──────────────────────────────────────

function seededRng(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ── Mock leaderboard generator ───────────────────────────────────────────────

const NAMES = [
  'AlphaWolf','CryptoKing','MoonRider','BitMaster','SatoshiX',
  'EtherQueen','DeFiPro','BlockTrader','CoinSurfer','HashKnight',
  'TokenTiger','ChainHawk','WalletWizard','BullRunner','BearSlayer',
  'LiquidLion','StakeShark','YieldYak','GasGuru','NodeNinja',
];
const COUNTRIES = ['🇺🇸','🇬🇧','🇩🇪','🇯🇵','🇨🇦','🇦🇺','🇧🇷','🇰🇷','🇸🇬','🇫🇷'];
const RANK_BADGES = ['🥇','🥈','🥉'];

export function generateLeaderboard(eventId: string, count = 50): EventParticipant[] {
  const rng = seededRng(eventId.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
  return Array.from({ length: count }, (_, i) => {
    const baseScore = 35 - i * 0.6 + (rng() - 0.5) * 3;
    const pnl       = baseScore * 1000 * (0.8 + rng() * 0.4);
    const winRate   = Math.max(0.3, Math.min(0.9, 0.7 - i * 0.004 + (rng() - 0.5) * 0.1));
    const delta     = Math.round((rng() - 0.5) * 4);
    return {
      userId:      `user-${eventId}-${i}`,
      displayName: NAMES[i % NAMES.length] + (i >= NAMES.length ? String(Math.floor(i / NAMES.length)) : ''),
      avatarSeed:  `${eventId}-${i}`,
      rank:        i + 1,
      score:       parseFloat(baseScore.toFixed(2)),
      pnl:         Math.round(pnl),
      pnlPct:      parseFloat(baseScore.toFixed(2)),
      trades:      Math.round(8 + rng() * 42),
      winRate:     parseFloat(winRate.toFixed(3)),
      status:      'active' as ParticipantStatus,
      joinedAt:    new Date(Date.now() - rng() * 86400000 * 7).toISOString(),
      country:     COUNTRIES[Math.floor(rng() * COUNTRIES.length)],
      badge:       i < 3 ? RANK_BADGES[i] : undefined,
      delta,
    };
  });
}

// ── Mock teams generator ─────────────────────────────────────────────────────

const TEAM_NAMES  = ['Alpha Wolves','Beta Bears','Gamma Bulls','Delta Hawks','Epsilon Lions'];
const TEAM_EMOJIS = ['🐺','🐻','🐂','🦅','🦁'];
const TEAM_COLORS = ['#f59e0b','#6366f1','#22c55e','#ec4899','#06b6d4'];

export function generateTeams(eventId: string): EventTeam[] {
  const rng = seededRng(eventId.split('').reduce((a, c) => a + c.charCodeAt(0), 1337));
  const lb  = generateLeaderboard(eventId, 25);

  return TEAM_NAMES.map((name, ti) => {
    const startIdx = ti * 5;
    const members  = lb.slice(startIdx, startIdx + 5).map((p, mi) => ({
      ...p,
      teamRole: (mi === 0 ? 'captain' : 'member') as TeamRole,
    }));
    const totalScore = members.reduce((s, m) => s + m.score, 0);
    return {
      id:         `team-${eventId}-${ti}`,
      eventId,
      name,
      emoji:      TEAM_EMOJIS[ti],
      color:      TEAM_COLORS[ti],
      captain:    members[0],
      members,
      totalScore: parseFloat(totalScore.toFixed(2)),
      rank:       ti + 1,
      isOpen:     rng() > 0.5,
    };
  });
}

// ── Chat message generator ───────────────────────────────────────────────────

const CHAT_MSGS = [
  "This is incredible! BTC just broke resistance 🚀",
  "Great insights on the DeFi plays today",
  "What's your take on ETH's upcoming upgrade?",
  "Just placed my first trade in this challenge!",
  "The volatility is insane right now ⚡",
  "Anyone else catching the SOL momentum?",
  "Thanks for the analysis, really helpful 🙏",
  "HODL strategy is working perfectly for me",
  "RSI showing oversold on multiple pairs",
  "The support level at 42k is holding strong",
  "Great event setup, learning so much here!",
  "Pump incoming? Volume spiking on the 4H 📈",
];

export function generateChatMessages(eventId: string, count = 20): EventChatMessage[] {
  const rng = seededRng(eventId.split('').reduce((a, c) => a + c.charCodeAt(0), 42));
  return Array.from({ length: count }, (_, i) => ({
    id:          `msg-${eventId}-${i}`,
    userId:      `user-chat-${i}`,
    displayName: NAMES[i % NAMES.length],
    avatarSeed:  `chat-${i}`,
    text:        CHAT_MSGS[i % CHAT_MSGS.length],
    timestamp:   new Date(Date.now() - (count - i) * 45000).toISOString(),
    isHost:      i === 0 || i === 7,
    isPinned:    i === 0,
    reactions:   { '👍': Math.floor(rng() * 12), '🔥': Math.floor(rng() * 8), '💯': Math.floor(rng() * 5) },
  }));
}

// ── Canonical event catalog ──────────────────────────────────────────────────

function daysFromNow(d: number, startOffset = 0): [string, string] {
  const s = new Date(Date.now() + startOffset * 86400000);
  const e = new Date(Date.now() + (startOffset + d) * 86400000);
  return [s.toISOString(), e.toISOString()];
}

export function buildEventCatalog(): LiveEvent[] {
  const now = Date.now();
  const sat  = new Date(); sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7 || 7));

  return [
    // ── FLASH CHALLENGE — live now ──────────────────────────────────────────
    {
      id:           'flash-001',
      type:         'flash_challenge',
      title:        '⚡ BTC Flash Sprint',
      subtitle:     'Score the highest BTC return in 4 hours',
      description:  'A hyper-focused 4-hour battle where traders go all-in on Bitcoin spot trading. Only BTC/USDT pairs allowed. Maximum leverage 3×. Highest return percentage wins.',
      status:       'live',
      difficulty:   'intermediate',
      startAt:      new Date(now - 3600000).toISOString(),
      endAt:        new Date(now + 10800000).toISOString(),
      durationLabel:'4 hours',
      maxParticipants: 200,
      currentParticipants: 147,
      minLevel:     0,
      teamSize:     null,
      isTeamEvent:  false,
      prize:        '$1,000 prize pool',
      prizePool:    1000,
      rewards: [
        { rank: 1, type: 'virtual_cash', label: '1st Place', value: 500, icon: '🥇' },
        { rank: 2, type: 'virtual_cash', label: '2nd Place', value: 250, icon: '🥈' },
        { rank: 3, type: 'virtual_cash', label: '3rd Place', value: 150, icon: '🥉' },
        { rank: 'all', type: 'xp', label: 'Participant XP', value: 200, icon: '⭐' },
      ],
      tags:         ['Bitcoin','Spot','Fast'],
      rules: [
        { label: 'Asset', value: 'BTC/USDT only' },
        { label: 'Max Leverage', value: '3×' },
        { label: 'Scoring', value: 'Return % on starting $10,000 virtual' },
        { label: 'Disqualified if', value: 'No trades in first 30 min' },
      ],
      coverGradient:'from-red-900/60 via-orange-900/40 to-background',
      accentColor:  '#ef4444',
      icon:         '⚡',
      isHot:        true,
      isFeatured:   true,
    },

    // ── WEEKEND WARRIOR — upcoming ──────────────────────────────────────────
    {
      id:           'weekend-001',
      type:         'weekend_warrior',
      title:        '🗡️ Weekend Warrior VII',
      subtitle:     '48 hours of all-market mayhem',
      description:  'The iconic Weekend Warrior returns! Trade any spot or derivatives pair across crypto markets for 48 hours straight. Top performers earn exclusive badges and cash prizes.',
      status:       'upcoming',
      difficulty:   'advanced',
      startAt:      (() => { const d = new Date(sat); return d.toISOString(); })(),
      endAt:        (() => { const d = new Date(sat); d.setDate(d.getDate() + 2); return d.toISOString(); })(),
      durationLabel:'48 hours',
      maxParticipants: 1000,
      currentParticipants: 673,
      minLevel:     0,
      teamSize:     null,
      isTeamEvent:  false,
      prize:        '$5,000 prize pool',
      prizePool:    5000,
      rewards: [
        { rank: 1, type: 'virtual_cash', label: '1st Place', value: 2000, icon: '🥇' },
        { rank: 2, type: 'virtual_cash', label: '2nd Place', value: 1000, icon: '🥈' },
        { rank: 3, type: 'virtual_cash', label: '3rd Place', value: 500, icon: '🥉' },
        { rank: 1, type: 'badge', label: 'Weekend Warrior Badge', value: 0, icon: '⚔️' },
        { rank: 'all', type: 'xp', label: 'Participation XP', value: 500, icon: '⭐' },
      ],
      tags:         ['Multi-asset','Spot','Derivatives','Weekend'],
      rules: [
        { label: 'Assets', value: 'All spot & perp pairs' },
        { label: 'Max Leverage', value: '10×' },
        { label: 'Starting Balance', value: '$50,000 virtual' },
        { label: 'Scoring', value: 'Net portfolio return %' },
        { label: 'Minimum Trades', value: '5 completed trades' },
      ],
      coverGradient:'from-amber-900/60 via-yellow-900/40 to-background',
      accentColor:  '#f59e0b',
      icon:         '⚔️',
      isHot:        true,
      isFeatured:   false,
    },

    // ── MONTHLY CHAMPIONSHIP — live ─────────────────────────────────────────
    {
      id:           'monthly-001',
      type:         'monthly_championship',
      title:        '🏆 April Championship',
      subtitle:     'The ultimate 30-day trading marathon',
      description:  'The biggest monthly event on CryptoVerse HQ. Trade freely across all available pairs. Climb the leaderboard over 30 days. Your highest 7-day return counts as your final score.',
      status:       'live',
      difficulty:   'expert',
      ...(() => { const s = new Date(); s.setDate(1); const e = new Date(s); e.setMonth(e.getMonth()+1); e.setDate(0); return { startAt: s.toISOString(), endAt: e.toISOString() }; })(),
      durationLabel:'30 days',
      maxParticipants: null,
      currentParticipants: 3241,
      minLevel:     0,
      teamSize:     null,
      isTeamEvent:  false,
      prize:        '$25,000 prize pool',
      prizePool:    25000,
      rewards: [
        { rank: 1, type: 'virtual_cash', label: '1st Place', value: 10000, icon: '🥇' },
        { rank: 2, type: 'virtual_cash', label: '2nd Place', value: 5000, icon: '🥈' },
        { rank: 3, type: 'virtual_cash', label: '3rd Place', value: 2500, icon: '🥉' },
        { rank: 1, type: 'plan_upgrade', label: 'Gold Plan (3 months)', value: 0, icon: '👑' },
        { rank: 1, type: 'badge', label: 'Champion Badge', value: 0, icon: '🏆' },
        { rank: 'all', type: 'xp', label: 'Monthly XP', value: 1000, icon: '⭐' },
      ],
      tags:         ['All-pairs','Long-term','Championship'],
      rules: [
        { label: 'Assets', value: 'All available pairs' },
        { label: 'Leverage', value: 'Unlimited' },
        { label: 'Starting Balance', value: '$100,000 virtual' },
        { label: 'Scoring', value: 'Best 7-day rolling return within the month' },
        { label: 'Minimum Trades', value: '20 completed trades' },
        { label: 'Wash Trading', value: 'Auto-detected & disqualified' },
      ],
      coverGradient:'from-violet-900/60 via-indigo-900/40 to-background',
      accentColor:  '#6366f1',
      icon:         '🏆',
      isHot:        false,
      isFeatured:   true,
    },

    // ── TEAM BATTLE — upcoming ──────────────────────────────────────────────
    {
      id:           'team-001',
      type:         'team_battle',
      title:        '🛡️ Alpha vs Beta Battle',
      subtitle:     '5v5 team-based portfolio competition',
      description:  'Form a 5-person team, pick a name, and go to war against other teams. Team captain sets the strategy; members execute trades. Combined team return determines the winner.',
      status:       'upcoming',
      difficulty:   'advanced',
      startAt:      daysFromNow(7, 2)[0],
      endAt:        daysFromNow(7, 2)[1],
      durationLabel:'7 days',
      maxParticipants: 100,
      currentParticipants: 65,
      minLevel:     0,
      teamSize:     5,
      isTeamEvent:  true,
      prize:        '$8,000 team prize',
      prizePool:    8000,
      rewards: [
        { rank: 1, type: 'virtual_cash', label: 'Winning Team (per member)', value: 1200, icon: '🥇' },
        { rank: 2, type: 'virtual_cash', label: '2nd Team (per member)', value: 500, icon: '🥈' },
        { rank: 1, type: 'badge', label: 'Team Champion Badge', value: 0, icon: '🛡️' },
        { rank: 'all', type: 'xp', label: 'Team XP', value: 750, icon: '⭐' },
      ],
      tags:         ['Teams','Collaborative','Strategy'],
      rules: [
        { label: 'Team Size', value: 'Exactly 5 members' },
        { label: 'Scoring', value: 'Average of all team member returns' },
        { label: 'Communication', value: 'In-app team chat enabled' },
        { label: 'Captain Bonus', value: 'Captain earns 10% extra on team score' },
        { label: 'Substitutions', value: 'Up to 1 member swap allowed' },
      ],
      coverGradient:'from-pink-900/60 via-rose-900/40 to-background',
      accentColor:  '#ec4899',
      icon:         '🛡️',
      isHot:        true,
      isFeatured:   false,
    },

    // ── LIVE WEBINAR — live now ─────────────────────────────────────────────
    {
      id:           'webinar-001',
      type:         'live_webinar',
      title:        '🎙️ Mastering DeFi Yield Strategies',
      subtitle:     'Expert session with CryptoVerse HQ analysts',
      description:  'Deep-dive webinar covering the hottest DeFi yield opportunities in 2025. Live Q&A, real-time chart analysis, and exclusive alpha for participants.',
      status:       'live',
      difficulty:   'intermediate',
      startAt:      new Date(now - 1800000).toISOString(),
      endAt:        new Date(now + 2700000).toISOString(),
      durationLabel:'90 minutes',
      maxParticipants: null,
      currentParticipants: 892,
      minLevel:     0,
      teamSize:     null,
      isTeamEvent:  false,
      prize:        'Free participation',
      prizePool:    0,
      rewards: [
        { rank: 'all', type: 'xp', label: 'Attendance XP', value: 300, icon: '⭐' },
        { rank: 'all', type: 'badge', label: 'DeFi Scholar Badge', value: 0, icon: '🎓' },
      ],
      tags:         ['DeFi','Education','Yield','Live'],
      rules: [
        { label: 'Format', value: 'Live presentation + Q&A' },
        { label: 'Recording', value: 'Available 24h after event' },
        { label: 'Attendance Badge', value: 'Requires 30+ min watch time' },
      ],
      speakers: [
        { name: 'Dr. Sarah Chen', title: 'Head of DeFi Research', avatar: 'SC', bio: 'Former Goldman Sachs quant, 8 years in DeFi protocols' },
        { name: 'Marcus Webb', title: 'Senior Analyst', avatar: 'MW', bio: 'Yield optimization specialist, ex-Aave contributor' },
      ],
      coverGradient:'from-emerald-900/60 via-green-900/40 to-background',
      accentColor:  '#22c55e',
      icon:         '🎙️',
      isHot:        false,
      isFeatured:   true,
    },

    // ── MARKET ANALYSIS LIVE ────────────────────────────────────────────────
    {
      id:           'market-001',
      type:         'market_analysis_live',
      title:        '📊 AI Market Breakdown: Q2 Outlook',
      subtitle:     'CryptoVerse HQ live algorithmic analysis',
      description:  'Our AI models run live during the session, analysing on-chain data, sentiment signals, and technical patterns across 50+ assets in real time.',
      status:       'upcoming',
      difficulty:   'beginner',
      startAt:      daysFromNow(1)[0],
      endAt:        daysFromNow(1)[1],
      durationLabel:'1 hour',
      maxParticipants: null,
      currentParticipants: 412,
      minLevel:     0,
      teamSize:     null,
      isTeamEvent:  false,
      prize:        'Free + exclusive report',
      prizePool:    0,
      rewards: [
        { rank: 'all', type: 'xp', label: 'Attendance XP', value: 200, icon: '⭐' },
        { rank: 'all', type: 'badge', label: 'Market Analyst Badge', value: 0, icon: '📊' },
      ],
      tags:         ['AI','Analysis','Q2','Educational'],
      rules: [
        { label: 'Format', value: 'AI-driven live analysis' },
        { label: 'Interactivity', value: 'Ask AI questions in chat' },
        { label: 'Report', value: 'Full PDF report post-event' },
      ],
      speakers: [
        { name: 'CryptoVerse HQ', title: 'Autonomous Analysis Engine', avatar: 'AI', bio: 'Real-time LLM + quant model stack processing live market data' },
      ],
      coverGradient:'from-cyan-900/60 via-blue-900/40 to-background',
      accentColor:  '#06b6d4',
      icon:         '📊',
      isHot:        false,
      isFeatured:   false,
    },

    // ── FLASH CHALLENGE #2 — completed ──────────────────────────────────────
    {
      id:           'flash-002',
      type:         'flash_challenge',
      title:        '⚡ ETH Speed Run',
      subtitle:     '3-hour ETH/USDT blitz',
      description:  'Past event — ETH-only 3-hour flash challenge. Final results recorded.',
      status:       'completed',
      difficulty:   'beginner',
      startAt:      new Date(now - 7200000).toISOString(),
      endAt:        new Date(now - 3600000).toISOString(),
      durationLabel:'3 hours',
      maxParticipants: 100,
      currentParticipants: 98,
      minLevel:     0,
      teamSize:     null,
      isTeamEvent:  false,
      prize:        '$500 prize pool',
      prizePool:    500,
      rewards: [
        { rank: 1, type: 'virtual_cash', label: '1st Place', value: 250, icon: '🥇' },
        { rank: 2, type: 'virtual_cash', label: '2nd Place', value: 125, icon: '🥈' },
        { rank: 'all', type: 'xp', label: 'XP', value: 150, icon: '⭐' },
      ],
      tags:         ['Ethereum','Completed','Fast'],
      rules: [
        { label: 'Asset', value: 'ETH/USDT only' },
        { label: 'Starting Balance', value: '$5,000 virtual' },
      ],
      coverGradient:'from-slate-900/60 via-zinc-900/40 to-background',
      accentColor:  '#94a3b8',
      icon:         '⚡',
      isHot:        false,
      isFeatured:   false,
    },
  ];
}
