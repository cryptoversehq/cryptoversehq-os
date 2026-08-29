import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, BookOpen, Trophy, Swords, UserCircle,
  Menu, LogOut, Bell, Sun, Moon, BarChart2, BarChart3, Globe, FlaskConical, Bot, ShoppingBag, RefreshCw, Link2, CalendarDays, Plug,
  Wallet, Crown, Gem, Award, ShieldCheck, LayoutDashboard,
  ChevronDown, Coins, Star,
} from 'lucide-react';
import { AgentChat }             from './components/AgentChat';
import { CryptoVerseLogo }       from './components/CryptoVerseLogo';
// leaderboard: PERIODS fix applied
import { NotificationPanel }     from './components/NotificationPanel';
import { LynxButton }            from './components/LynxAI/LynxButton';
import { LynxChat }              from './components/LynxAI/LynxChat';
import { CoachingMessages }       from './components/LynxAI/CoachingMessages';
import { ProactiveSuggestions }  from './components/LynxAI/ProactiveSuggestions';
import { WelcomeMessage }        from './components/LynxAI/WelcomeMessage';
import { GuidanceToast }         from './components/LynxAI/GuidanceToast';
import { useLynxAI }             from './hooks/useLynxAI';
import { useLynxGuidance }       from './hooks/useLynxGuidance';
import { useLynxEvents }          from './hooks/useLynxEvents';
import { lynxContext }            from './lib/contextEngine';
import { LanguageSelector }      from './components/LanguageSelector';
import { WelcomeGuide }          from './components/WelcomeGuide';
import { BacktestProgressSidebar, BacktestNavBadge } from './components/backtest/BacktestProgressSidebar';
import { Toaster, toast } from 'sonner';
import { lynxOrchestrator } from './lib/lynxOrchestrator';
import { useLynxRuntime } from './hooks/useLynxRuntime';
import { type LynxLifecycleState } from './lib/lynxLifecycle';
import { cn }                    from './lib/utils';
import { useIsMobile }          from './hooks/useIsMobile';
import { useAppStore }           from './lib/appStore';
import { useAuthStore }          from './lib/authStore';
import { useI18nStore }          from './lib/i18nStore';
import { isRTL }                  from './lib/i18n';
import { useSubscriptionMonitor } from './lib/useSubscriptionMonitor';
import { distributeMonthlyCP } from './lib/monthlyCPReward';
import { useUnifiedBalanceStore } from './lib/unifiedBalanceStore';
import { useAcademyStore, selectLevel, selectAvailableXP, getLevelInfo } from './lib/academyStore';
import { useBotStore }           from './lib/botStore';
import { useBotMonitor }         from './lib/botMonitor';
import { BotBacktestProvider }   from './lib/botBacktestContext';


import { LoginPage }             from './components/auth/LoginPage';
import {
  SentimentNotificationProvider,
  SentimentDigestBanner,
} from './components/sentiment/SentimentNotifications';
import { getLoginStats } from './lib/loginHistoryStore';
import { AIErrorMonitor } from './hooks/useAIErrorMonitor';
import ContextAwareGuidance from './components/features/ContextAwareGuidance';
import AllFeaturesTest from './components/debug/AllFeaturesTest';
import SecretsDebugPage from './components/debug/SecretsDebugPage';
import WhatsNewPage from './components/features/WhatsNewPage';
import WelcomeProMessage from './components/features/WelcomeProMessage';
import QuickTour from './components/features/QuickTour';
import FeedbackAdminPage from './components/features/FeedbackAdminPage';
import HelpPage from './components/features/HelpPage';
import ChangelogPage from './components/features/ChangelogPage';
import { AdminRoutes } from './routes/AdminRoutes';
import { AuthRoutes } from './routes/AuthRoutes';
import { MainRoutes } from './routes/MainRoutes';
import { PublicRoutes, PUBLIC_PATHS } from './routes/PublicRoutes';

// ─── Sidebar Item ─────────────────────────────────────────────────────────────
const SidebarItem = ({
  icon: Icon, label, path, badge,
}: {
  icon:   React.ElementType;
  label:  string;
  path:   string;
  badge?: number;
}) => {
  const location = useLocation();
  // For the root "/" route, only match exactly (not every path)
  const isActive = path === '/'
    ? location.pathname === '/'
    : location.pathname === path || location.pathname.startsWith(path + '/');
  return (
    <Link
      to={path}
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300',
        isActive
          ? 'bg-primary text-primary-foreground font-medium shadow-lg shadow-primary/20'
          : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span
          className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
          style={{ background: '#00C853', color: '#0A1929' }}
        >
          {badge}
        </span>
      )}
    </Link>
  );
};

// ─── NFT nav group ────────────────────────────────────────────────────────────
const NFT_SUBNAV = [
  { path: '/nft',             label: 'Dashboard',     emoji: '📊' },
  { path: '/nft/live-sales',  label: 'Live Sales',    emoji: '⚡' },
  { path: '/nft/metaverse',   label: 'Metaverse',     emoji: '🌐' },
  { path: '/nft/watchlist',   label: 'Watchlist',     emoji: '👁️' },
  { path: '/nft/whales',      label: 'Whales',        emoji: '🐋' },
  { path: '/nft/simulate',    label: 'Trading Sim',   emoji: '🎮' },
  { path: '/nft/wallets',     label: 'Wallet Tracker',emoji: '👜' },
  { path: '/nft/alerts',      label: 'Alerts',        emoji: '🔔' },
  { path: '/nft/report',      label: 'Final Report',  emoji: '📋' },
];

const NFTNavGroup = () => {
  const location  = useLocation();
  const isSection = location.pathname.startsWith('/nft');
  const [open, setOpen] = React.useState(isSection);

  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-left',
          isSection
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
        )}>
        <span className="h-5 w-5 shrink-0 text-lg flex items-center justify-center">🖼️</span>
        <span className="flex-1">NFT & Metaverse</span>
        <svg className={cn('h-4 w-4 transition-transform shrink-0', open ? 'rotate-180' : '')}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="ml-8 mt-0.5 space-y-0.5 border-l border-white/8 pl-3">
          {NFT_SUBNAV.map(item => {
            const active = item.path === '/nft' ? location.pathname === '/nft' : location.pathname.startsWith(item.path);
            return (
              <Link key={item.path} to={item.path}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all',
                  active
                    ? 'text-primary bg-primary/10 font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/4',
                )}>
                <span className="text-xs">{item.emoji}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── On-Chain expandable nav group ────────────────────────────────────────────
const ON_CHAIN_SUBNAV = [
  { path: '/on-chain',                label: 'Dashboard',     emoji: '📊' },
  { path: '/on-chain/smart-money',    label: 'Smart Money',   emoji: '🧠' },
  { path: '/on-chain/exchange-flow',  label: 'Exchange Flow', emoji: '🏦' },
  { path: '/on-chain/alerts',         label: 'Alerts',        emoji: '🔔' },
];

const OnChainNavGroup = () => {
  const location  = useLocation();
  const isSection = location.pathname.startsWith('/on-chain');
  const [open, setOpen] = React.useState(isSection);

  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-left',
          isSection
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
        )}>
        <Link2 className="h-5 w-5 shrink-0" />
        <span className="flex-1">⛓ On-Chain</span>
        <svg className={cn('h-4 w-4 transition-transform shrink-0', open ? 'rotate-180' : '')}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="ml-8 mt-0.5 space-y-0.5 border-l border-white/8 pl-3">
          {ON_CHAIN_SUBNAV.map(item => {
            const active = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all',
                  active
                    ? 'text-primary bg-primary/10 font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/4',
                )}>
                <span className="text-xs">{item.emoji}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Account Dropdown ─────────────────────────────────────────────────────────
function AccountDropdown({ avatarSrc }: { avatarSrc: string }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const items = [
    { icon: Crown,      emoji: '💎', label: 'Subscription',      path: '/subscription' },
    { icon: Wallet,     emoji: '👛', label: 'My Wallet',         path: '/wallet' },
    { icon: Gem,        emoji: '💰', label: 'Buy CP',            path: '/buy-cp' },
    { icon: Award,      emoji: '📊', label: 'Earnings Dashboard', path: '/creator/earnings' },
  ] as const;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 group"
        aria-label="Account menu"
      >
        <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-blue-500 to-purple-600 border-2 border-card overflow-hidden hover:ring-2 hover:ring-primary transition-all">
          <img src={avatarSrc} alt="Avatar" className="w-full h-full object-cover" />
        </div>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.96 }}
          transition={{ duration: 0.15 }}
          className="absolute right-0 top-full mt-2 w-52 bg-card border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50"
        >
          {/* Profile link */}
          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-secondary/50 border-b border-white/5 transition-colors"
          >
            <UserCircle className="h-4 w-4 text-primary" />
            <span className="font-semibold">Profile & Settings</span>
          </Link>

          {/* Financial menu items */}
          <div className="py-1">
            {items.map(item => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
              >
                <span className="text-base">{item.emoji}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ─── User View mode banner (§New Feature 2 — Viewer mode + Emergency Exit) ────
// Shown across the whole main app whenever an Admin/Super Admin is viewing as
// a user. Read-only badge + a big, obvious way back to the admin panel. The
// viewed user is never notified — this only changes what THIS tab renders.
function ViewModeBanner() {
  const { viewState, endUserView, user } = useAuthStore();
  const navigate = useNavigate();

  if (!viewState.isViewing) return null;

  // Idea §3 — presence badge from real login history (no fabricated status).
  const stats    = user ? getLoginStats(user.id) : null;
  const isOnline = !!stats?.lastLogin && (Date.now() - new Date(stats.lastLogin.timestamp).getTime()) < 5 * 60 * 1000;

  const handleExit = () => {
    endUserView();
    navigate('/admin/users');
  };

  return (
    <div data-view-safe className="fixed top-0 inset-x-0 z-[200] flex items-center justify-between gap-3 px-4 py-2 bg-amber-400 text-[#0A1929] shadow-lg">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-bold truncate">
          👁️ Viewing as {viewState.targetUser} — Read Only
        </span>
        <span className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0',
          isOnline ? 'bg-emerald-600 text-white' : 'bg-black/15 text-black/60',
        )}>
          <span className={cn('w-1.5 h-1.5 rounded-full', isOnline ? 'bg-emerald-200' : 'bg-black/40')} />
          {isOnline ? 'Online' : 'Offline'}
        </span>
      </div>
      {/* Emergency Exit — idea §4 */}
      <button onClick={handleExit}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A1929] text-white text-xs font-bold hover:bg-[#0A1929]/85 transition-all shrink-0">
        🚪 Emergency Exit to Admin Panel
      </button>
    </div>
  );
}

// ─── Global manipulation blocker (completes the User View read-only requirement) ──
// Rather than patching every edit/delete/save button across the whole app,
// this intercepts clicks and form submissions in the CAPTURE phase and blocks
// anything that looks like a mutating action (matched by verb) while a User
// View session is active. Pure navigation/reading — links, tabs, pagination,
// filters, search, theme/language toggles — is left alone so the admin can
// still browse the app to diagnose the user's issue.
const VIEW_ONLY_MUTATION_VERBS = [
  'save', 'delete', 'remove', 'ban', 'unban', 'suspend', 'unsuspend', 'buy', 'sell',
  'trade', 'execute', 'submit', 'create', 'add', 'update', 'edit', 'follow', 'unfollow',
  'withdraw', 'deposit', 'approve', 'reject', 'publish', 'unpublish', 'rotate', 'reset',
  'purchase', 'upgrade', 'send', 'transfer', 'connect', 'disconnect', 'confirm', 'post',
  'like', 'report', 'claim', 'redeem', 'convert', 'swap', 'stake', 'unstake',
  'close position', 'open position', 'place order', 'cancel order', 'promote', 'demote',
  'assign', 'revoke', 'invite', 'join', 'leave', 'accept', 'decline', 'cancel subscription',
  'renew', 'activate', 'deactivate', 'enable', 'disable', 'flag', 'warn', 'donate', 'tip',
];
const VIEW_ONLY_SAFE_VERBS = [
  'view', 'next', 'prev', 'previous', 'back', 'search', 'filter', 'sort', 'expand', 'collapse',
  'show', 'hide', 'close', 'cancel', 'refresh', 'exit', 'copy', 'export', 'download', 'select',
  'read', 'ignore',
];

function isViewOnlyMutationLabel(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  if (!t) return false;
  if (VIEW_ONLY_SAFE_VERBS.some(v => t === v || t.startsWith(v + ' '))) return false;
  return VIEW_ONLY_MUTATION_VERBS.some(v => t.includes(v));
}

function ViewOnlyGuard() {
  const isViewing = useAuthStore(s => s.viewState.isViewing);

  useEffect(() => {
    if (!isViewing) return;

    const blockClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-view-safe]')) return;
      const control = target.closest(
        'button, input[type="submit"], input[type="button"], [role="button"]',
      ) as HTMLElement | null;
      if (!control) return;
      const label = control.getAttribute('aria-label') || control.getAttribute('title') || control.textContent || '';
      if (isViewOnlyMutationLabel(label)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        toast.error('🔒 Read-only — you are viewing as a user. Exit User View to make changes.');
      }
    };

    const blockSubmit = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-view-safe]')) return;
      e.preventDefault();
      e.stopPropagation();
      toast.error('🔒 Read-only — you are viewing as a user. Exit User View to make changes.');
    };

    document.addEventListener('click', blockClick, true);
    document.addEventListener('submit', blockSubmit, true);
    return () => {
      document.removeEventListener('click', blockClick, true);
      document.removeEventListener('submit', blockSubmit, true);
    };
  }, [isViewing]);

  return null;
}

// ─── Role Badge ───────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const roleStyles: Record<string, { label: string; color: string; icon: string }> = {
    user:         { label: 'User',         color: 'bg-gray-500/20 text-gray-400',        icon: '👤' },
    vip:          { label: 'VIP',          color: 'bg-purple-500/20 text-purple-400',    icon: '⭐' },
    admin:        { label: 'Admin',        color: 'bg-blue-500/20 text-blue-400',        icon: '🛡️' },
    senior_admin: { label: 'Senior Admin', color: 'bg-indigo-500/20 text-indigo-400',    icon: '🛡️' },
    super_admin:  { label: 'Super Admin',  color: 'bg-amber-500/20 text-amber-400',      icon: '👑' },
    founder:      { label: 'Founder',      color: 'bg-amber-500/20 text-amber-400',      icon: '👑' },
    developer:    { label: 'Developer',    color: 'bg-emerald-500/20 text-emerald-400',  icon: '💻' },
  };

  const style = roleStyles[role] || roleStyles.user;

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${style.color}`}>
      {style.icon} {style.label}
    </span>
  );
}

// ─── Admin Button (role-gated) ────────────────────────────────────────────────
// Roles that already hold admin-level access. Regular `user` / `vip` never see
// the Admin Panel entry point; they go through the Profile → Request flow.
const ADMIN_ROLES = ['admin', 'senior_admin', 'super_admin', 'founder', 'developer'];

function AdminButton() {
  const role = useAuthStore(s => s.user?.role) || 'user';
  if (!ADMIN_ROLES.includes(role)) return null;
  return (
    <Link
      to="/admin"
      className="px-4 py-2 text-sm font-medium text-white bg-amber-500/20 hover:bg-amber-500/30 rounded-lg transition-colors flex items-center gap-2"
    >
      <span>🛡️</span>
      Admin Panel
    </Link>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────
const Layout = ({ children }: { children: React.ReactNode }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen]           = useState(false);
  const location                            = useLocation();

  const { theme, toggleTheme, notifications } = useAppStore();
  const { user, logout, viewState }           = useAuthStore();
  const role                                  = user?.role || 'user';

  // Unified balance
  const { balance, refresh } = useUnifiedBalanceStore();
  const availableXP          = useAcademyStore(selectAvailableXP);
  const level                = useAcademyStore(selectLevel);
  const levelData            = getLevelInfo(useAcademyStore(s => s.totalXP));
  useEffect(() => {
    refresh(); // initial load
    lynxOrchestrator.registerScheduledTask('unified-balance-refresh', 30_000, refresh);
    return () => { lynxOrchestrator.releaseScheduledTask('unified-balance-refresh'); };
  }, []);
  // Re-refresh when user changes
  useEffect(() => { refresh(); }, [user?.id]);

  // 5.1: Bot monitor — drives WebSocket-style real-time updates + notifications
  useBotMonitor();

  // 5.1: Active bots count for sidebar badge
  const activeBotCount = useBotStore(s =>
    user ? Object.values(s.bots).filter(b => b.userId === user.id && b.status === 'active').length : 0
  );
  const { t, isTranslating, translationProgress, lang } = useI18nStore();
  // RTL languages (Arabic/Persian/Urdu) need the mobile sidebar's closed-state
  // slide direction flipped — see the `aside` below. Without this, the CSS in
  // rtl.css that re-anchors `.left-0` elements to the right in RTL conflicts
  // with the LTR-only `-translate-x-full` used to hide the sidebar, leaving
  // it stuck partially on-screen (the "menu never closes" bug reported on
  // Persian/Arabic phones).
  const rtl = isRTL(lang);

  // Monitor subscription expiry and fire renewal warnings
  useSubscriptionMonitor();
  const unreadCount = notifications.filter(n => !n.read).length;

  // Monthly CP reward — distribute on app mount
  useEffect(() => {
    if (user) distributeMonthlyCP();
  }, [user?.id]);

  // Apply dark class whenever theme changes
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const avatarSrc = user?.avatarUrl
    ?? `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.avatarSeed ?? 'Felix'}`;

  return (
    <div className={cn('flex h-screen bg-background text-foreground overflow-hidden font-sans', viewState.isViewing && 'pt-9')}>
      <ViewModeBanner />
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-white/5 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 flex flex-col',
        mobileMenuOpen ? 'translate-x-0' : (rtl ? 'translate-x-full' : '-translate-x-full'),
      )}>
        {/* Logo */}
        <div className="p-6 flex items-center gap-4">
          <CryptoVerseLogo size={40} />
          <span className="text-xl font-bold tracking-tight">
            CryptoVerse{' '}
            <span className="text-[#FFD700] text-xs ml-1 px-1.5 py-0.5 rounded-md bg-amber-500/15">HQ</span>
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-4 space-y-1 mt-2 overflow-y-auto"
          onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setMobileMenuOpen(false); }}>
          <SidebarItem icon={LayoutDashboard} label="Dashboard"            path="/dashboard" />
          <SidebarItem icon={Activity}      label={t('nav.trade')}       path="/trading" />
          <SidebarItem icon={BarChart2}    label={t('nav.portfolio')}   path="/portfolio" />
          <div className="flex items-center">
            <div className="flex-1">
              <SidebarItem icon={FlaskConical} label="🔬 Backtest" path="/backtest" />
            </div>
            <BacktestNavBadge />
          </div>
          <SidebarItem icon={Bot}          label="🤖 Bots"              path="/bots" badge={activeBotCount} />
          <SidebarItem icon={ShoppingBag} label="🏪 Marketplace"       path="/marketplace" />
          <SidebarItem icon={RefreshCw}   label="🔄 Copy Trading"      path="/copy-trading" />
          <OnChainNavGroup />
          <NFTNavGroup />
          <SidebarItem icon={BarChart3}     label="🧠 Sentiment"          path="/sentiment" />
          <SidebarItem icon={CalendarDays} label="🏆 Events"              path="/events" />
          <SidebarItem icon={Plug}        label="🔗 Real Exchange"       path="/exchange" />
          <SidebarItem icon={BookOpen}    label={t('nav.academy')}      path="/academy" />
          <SidebarItem icon={Trophy}       label={t('nav.leaderboard')} path="/leaderboard" />
          <SidebarItem icon={Globe}        label={t('nations.title')}   path="/nations" />
          <SidebarItem icon={Swords}       label={t('nav.twinLeague')}  path="/twin-league" />
          {/* Admin Panel removed from sidebar — accessible via Profile > Admin Control Center */}
        </nav>

        {/* Part 11.2 — Background job progress */}
        <BacktestProgressSidebar />

        {/* Bottom Actions */}
        <div className="p-4 border-t border-white/5 space-y-1"
          onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setMobileMenuOpen(false); }}>
          <Link
            to="/profile"
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          >
            <UserCircle className="h-5 w-5" />
            <span>{t('nav.profile')}</span>
          </Link>
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-400/10 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            <span>{t('nav.logout')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-20 flex items-center justify-between px-6 border-b border-white/5 bg-background/50 backdrop-blur-md z-30">
          <button
            className="lg:hidden p-2 text-muted-foreground hover:text-foreground bg-secondary/50 rounded-lg"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1 flex justify-end items-center gap-3">
            {/* Live market indicator */}
            <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/50 border border-white/5">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-medium text-muted-foreground">Live Market Data</span>
            </div>

            {/* ── XP & Level Pill ── */}
            <Link
              to="/academy"
              className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-all"
            >
              <Star className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-bold text-primary">{availableXP.toLocaleString()} XP</span>
              <span className="text-[10px] text-muted-foreground">Lv.{level} {levelData.name}</span>
            </Link>

            {/* ── Unified Balance Pill ── */}
            <Link
              to="/wallet"
              className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 transition-all"
            >
              <Coins className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs font-bold text-amber-400">{balance.formatted}</span>
              <span className="text-[10px] text-muted-foreground">({balance.cpBalance.toLocaleString()} CP)</span>
            </Link>

            {/* Subscription badge */}
            <Link
              to="/subscription"
              className={cn(
                'hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition-all',
                user?.plan === 'pro_plus'
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                  : user?.plan === 'pro'
                    ? 'border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                    : 'border-slate-600/30 bg-slate-500/5 text-slate-400 hover:bg-slate-500/15',
              )}
            >
              <span className="text-sm">
                {user?.plan === 'pro_plus' ? '👑' : user?.plan === 'pro' ? '⭐' : '🆓'}
              </span>
              <span>{user?.plan === 'pro_plus' ? 'Pro+' : user?.plan === 'pro' ? 'Pro' : 'Free'}</span>
              <span className="text-[10px] opacity-60 ml-0.5">
                {user?.plan === 'free' ? 'Upgrade' : 'Manage'}
              </span>
            </Link>

            {/* Language selector */}
            <LanguageSelector compact />

            {/* Dark / Light toggle */}
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-full bg-secondary/50 text-muted-foreground hover:text-foreground border border-white/5 transition-colors"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark'
                ? <Sun className="h-5 w-5" />
                : <Moon className="h-5 w-5" />}
            </button>

            {/* Notification Bell */}
            <button
              onClick={() => setNotifOpen(o => !o)}
              className="p-2.5 rounded-full bg-secondary/50 text-muted-foreground hover:text-foreground border border-white/5 relative transition-colors"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
              )}
            </button>

            {/* Role badge — the user's current access level */}
            <RoleBadge role={role} />

            {/* Admin Panel button — role-gated: only admin-level roles see it */}
            <AdminButton />

            {/* Account Dropdown */}
            <AccountDropdown avatarSrc={avatarSrc} />
          </div>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col">
          <AIErrorMonitor />
          <ContextAwareGuidance />
          {/* Translation progress bar */}
          {isTranslating && (
            <div className="h-0.5 bg-secondary/30 relative overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${translationProgress}%` }}
              />
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Mobile bottom nav — hidden on /trading since MobileTradingLayout has its own tabs */}
      {location.pathname !== '/trading' && (
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-white/5 backdrop-blur-md flex items-stretch h-16">
        {[
          { icon: Activity,     label: 'Trade',    path: '/trading' },
          { icon: Bot,          label: '🤖 Bots',  path: '/bots' },
          { icon: RefreshCw,    label: '🔄 Copy',  path: '/copy-trading' },
          { icon: Link2,        label: '⛓ Chain',  path: '/on-chain' },
          { icon: ShoppingBag,  label: '🖼️ NFT',   path: '/nft' },
          { icon: Trophy,       label: 'Ranks',    path: '/leaderboard' },
        ].map(({ icon: Icon, label, path }) => {
          const isActive = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </nav>
      )}

      {/* Notification Panel */}
      <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} />

      {/* 🦊 Lynx AI Integrated System */}
      <LynxAIIntegration />

      {/* §6.4 Sentiment notification system */}
      <SentimentNotificationProvider />
      <SentimentDigestBanner />

      {/* ── Release: Welcome + Quick Tour ── */}
      <WelcomeProMessage />
      <QuickTour />
    </div>
  );
};

// ─── Lynx runtime failure fallback ─────────────────────────────────────────
// Rendered instead of the Lynx UI when the runtime reaches a `failed` state.
// Surfaces the failure observably (toast + console) but does NOT crash the app
// or leave a partially-initialized Lynx surface mounted.
function LynxRuntimeFailure({ state }: { state: LynxLifecycleState }) {
  useEffect(() => {
    toast.error(`Lynx AI is unavailable (state: ${state}). AI features are disabled.`);
  }, [state]);
  return null;
}

// ─── Lynx AI Integration ──────────────────────────────────────────────────────
function LynxAIIntegration() {
  const lynx = useLynxAI();
  const runtime = useLynxRuntime();
  const navigate = useNavigate();
  const location = useLocation();
  const { message: guidanceMsg, dismiss: dismissGuidance } = useLynxGuidance();

  // Only show on non-auth pages
  const AUTH_ROUTES = ['/signup', '/login', '/verify-otp', '/forgot-password', '/reset-password'];
  const isAuthRoute = AUTH_ROUTES.some(r => location.pathname.startsWith(r));
  const isAdminRoute = location.pathname.startsWith('/admin');

  if (isAuthRoute || isAdminRoute) return null;

  // The floating Lynx button + chat are DeepSeek-powered and self-contained.
  // They are intentionally NOT gated behind full-runtime readiness: if the Lynx
  // orchestrator is slow or fails, the working AI entry point must stay visible.
  // Only the contextual surfaces (welcome, proactive suggestions, guidance toast)
  // depend on the fully-initialized runtime.
  return (
    <>
      {/* Non-blocking failure notice (toast only). */}
      {runtime.failed && <LynxRuntimeFailure state={runtime.state} />}

      {/* Ready-gated contextual surfaces. */}
      {runtime.ready && (
        <>
          {/* Welcome Message */}
          {lynx.showWelcome && (
            <div className="fixed bottom-24 left-4 z-50 max-w-sm w-full hidden lg:block">
              <WelcomeMessage
                userName={undefined}
                onDismiss={lynx.dismissWelcome}
                onConfigure={() => navigate('/settings/lynx-ai')}
              />
            </div>
          )}

          {/* Proactive Suggestions */}
          {lynx.showWelcome === false && (
            <ProactiveSuggestions />
          )}

          {/* Guidance Toast */}
          {guidanceMsg && (
            <GuidanceToast message={guidanceMsg} onDismiss={dismissGuidance} />
          )}
        </>
      )}

      {/* Floating Button — always available. */}
      <LynxButton
        unreadCount={lynx.unreadCount}
        isOnline={lynx.isOnline}
        onClick={lynx.toggleChat}
      />

      {/* Chat Window — always available. */}
      <LynxChat isOpen={lynx.isChatOpen} onClose={lynx.closeChat} />
    </>
  );
}

// Admin route ownership lives in routes/AdminRoutes.tsx.

// ─── AUTH-AWARE INNER APP ─────────────────────────────────────────────────────
// Must be inside <Router> to use useLocation
function AppInner() {
  const { isAuthenticated, user, refreshRole } = useAuthStore();
  const location            = useLocation();
  const { trackPageView }   = useLynxEvents();

  // ── Lynx AI: page tracking + context refresh ─────────────────────────────
  useEffect(() => {
    trackPageView();
    lynxContext.refreshFromStores();
  }, [location.pathname, trackPageView]);

  // ── Reactive role sync — keep the header badge + Admin button in sync with
  // the Taskade DB without a page refresh. Refresh on a 60s interval and when
  // the tab becomes visible again.
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      refreshRole();
    }, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshRole();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user, refreshRole]);

  // ── Referral auto-claim ──────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const refCode = params.get('ref');
    if (!refCode || !isAuthenticated || !user) return;

    const claimKey = `cryptoverse_ref_claimed_${refCode}`;
    if (sessionStorage.getItem(claimKey)) return;

    import('@/lib/referralStore').then(({ claimReferralBonus, hasBeenReferred, lookupReferralCode }) => {
      if (hasBeenReferred()) return;
      const referrerId = lookupReferralCode(refCode);
      if (!referrerId) return;

      const result = claimReferralBonus(referrerId, user.id, user.name || user.email || 'New User');
      if (result.ok) {
        sessionStorage.setItem(claimKey, 'true');
      }
    });
  }, [location.search, isAuthenticated, user]);

  // ── Subscription auto-expiration check (every 60s) ──
  useEffect(() => {
    const check = () => {
      const exp = localStorage.getItem('cryptoverse_subscription_expiry');
      if (!exp) return;
      if (Date.now() > Number(exp)) {
        useAuthStore.getState().updateSubscription('free');
        localStorage.removeItem('cryptoverse_subscription');
        localStorage.removeItem('cryptoverse_subscription_expiry');
        import('sonner').then(({ toast }) => toast.info('Your subscription has expired. Upgrade to continue.'));
      }
    };
    check();
    lynxOrchestrator.registerScheduledTask('subscription-expiry-check', 60_000, check);
    return () => { lynxOrchestrator.releaseScheduledTask('subscription-expiry-check'); };
  }, []);

  // ── Lynx AI Operating System bootstrap (authoritative single init path) ──
  // Runs exactly once per authenticated runtime. bootstrapLynx() is idempotent
  // (guarded by an in-flight promise + lifecycle state), so React Strict Mode
  // double-invoke, re-renders, route changes, and provider remounts cannot
  // trigger a duplicate bootstrap. It is ONLY invoked after auth is confirmed,
  // so authenticated engines (identityEngine / permissionEngine, etc.) always
  // initialize with a real user context.
  //
  // Loaded via dynamic import so the ~45-engine graph is NOT part of the initial
  // bundle: pulling it eagerly at boot evaluates engine modules during initial
  // module load, which can throw before React mounts and white-screen the app.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    import('@/lib/lynxBootstrap')
      .then(({ bootstrapLynx }) => (cancelled ? null : bootstrapLynx()))
      .then((result) => {
        if (!result) return;
        if (!result.success) {
          const failed = result.failed.map(f => `${f.name}: ${f.error}`).join(' | ');
          console.error('[Lynx] bootstrap FAILED →', failed);
          toast.error('Lynx AI runtime failed to initialize');
        } else {
          console.info('[Lynx] bootstrap READY →', result.registered.length, 'engines in', result.durationMs, 'ms');
          console.info('[Lynx] orchestrator diagnostics', lynxOrchestrator.getDiagnostics());
        }
      })
      .catch((err) => {
        console.error('[Lynx] bootstrap module failed to load →', err);
        toast.error('Lynx AI failed to load');
      });
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // ── Initialize trading engines once on auth ────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;

    // Start the global position monitor (SL/TP/liquidation checks)
    import('@/lib/tradingStore').then(({ useTradingStore }) => {
      useTradingStore.getState().initMonitor();
    });

    // Start the order engine (pending limit/stop/stop-limit orders)
    import('@/lib/orderEngine').then(({ initOrderEngine }) => {
      import('@/lib/tradingStore').then(({ useTradingStore }) => {
        initOrderEngine((order, fillPrice, fillAmount) => {
          const result = useTradingStore.getState().openPosition({
            coinId: order.coinId,
            symbol: order.symbol,
            name: order.name,
            side: order.side === 'buy' ? 'long' : 'short',
            usdAmount: fillAmount,
            currentPrice: fillPrice,
            leverage: order.leverage,
            color: order.color,
            stopLoss: order.stopLoss,
            takeProfit: order.takeProfit,
          });
          return result;
        });
      });
    });

    // Restart monitor on visibility change (tab resume / system wake)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        import('@/lib/globalPositionMonitor').then(({ forcePositionCheck }) => {
          forcePositionCheck();
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isAuthenticated]);

  // Dedicated auth routes — never show the overlay on these paths
  const AUTH_ROUTES = ['/signup', '/login', '/verify-otp', '/forgot-password', '/reset-password'];
  const isAuthRoute  = AUTH_ROUTES.some(r => location.pathname.startsWith(r));
  const isAdminRoute = location.pathname.startsWith('/admin');

  // ── Diagnostic: Auth state at startup ──
  useEffect(() => {
    console.group('🔍 [Auth] Startup Diagnostic');
    console.log('1. isAuthenticated:', isAuthenticated);
    console.log('2. User:', user ? { email: user.email, role: user.role, plan: user.plan } : 'null');
    // Check for OIDC token in sessionStorage / localStorage
    const oidcKeys = Object.keys(sessionStorage).filter(k => k.includes('oidc') || k.includes('token'));
    console.log('3. OIDC sessionStorage keys:', oidcKeys.length > 0 ? oidcKeys : 'NONE');
    const lsOidcKeys = Object.keys(localStorage).filter(k => k.includes('oidc') || k.includes('token'));
    console.log('4. OIDC localStorage keys:', lsOidcKeys.length > 0 ? lsOidcKeys : 'NONE');
    // Check for JWT in cookies (non-httpOnly visible ones)
    console.log('5. document.cookie (first 200 chars):', document.cookie.substring(0, 200) || 'EMPTY');
    console.log('6. window.location.origin:', window.location.origin);
    console.log('7. Deployed Space ID (hardcoded): rdem1z86swzzv7q');
    console.groupEnd();
  }, [isAuthenticated, user]);

  // ── Public routes whitelist (replaces manual exclusion chain) ──
  const isPublicPath = PUBLIC_PATHS.includes(location.pathname);

  return (
    <>
      <ViewOnlyGuard />

      <Routes>
        <Route path="/admin/*" element={<AdminRoutes />} />
      </Routes>

      <AuthRoutes />

      {!isAuthRoute && !isAdminRoute && isPublicPath && (location.pathname !== '/' || !isAuthenticated) && <PublicRoutes />}

      {/* Authenticated app — hidden on auth routes and /admin/* */}
      {!isAuthRoute && !isAdminRoute && (isAuthenticated || (location.pathname !== '/' && location.pathname !== '/about' && location.pathname !== '/privacy' && location.pathname !== '/terms' && location.pathname !== '/contact' && location.pathname !== '/help' && location.pathname !== '/community' && location.pathname !== '/api-docs' && location.pathname !== '/blog' && location.pathname !== '/careers' && location.pathname !== '/status' && location.pathname !== '/security' && location.pathname !== '/cookie-policy')) && (
        <AnimatePresence mode="wait">
          {!isAuthenticated ? (
            <motion.div
              key="auth"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              style={{ position: 'fixed', inset: 0, zIndex: 50 }}
            >
              <LoginPage />
            </motion.div>
        ) : (
          <motion.div
            key="app"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            style={{ height: '100%' }}
          >
            {/* First-login cinematic guide — renders over the full app */}
            <WelcomeGuide />
            <Layout>
              <MainRoutes />
            </Layout>
          </motion.div>
        )}
      </AnimatePresence>
      )}
    </>
  );
}

// ─── CryptoVerse HQ - Production Build v2 ────────────────────────────────────
export default function App() {
  const theme = useAppStore(s => s.theme);
  return (
    <BotBacktestProvider>
      <Router>
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          theme={theme === 'dark' ? 'dark' : 'light'}
          offset={{ bottom: 88, right: 16 }}
          mobileOffset={{ bottom: 152, right: 12 }}
        />
        <AppInner />
      </Router>
    </BotBacktestProvider>
  );
}
// preview-cache-bust 20260813T1544
