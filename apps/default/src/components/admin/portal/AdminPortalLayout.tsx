import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, CreditCard, BookOpen, Trophy,
  Flag, HeadphonesIcon, Shield, ClipboardList, FileText,
  Bell, LogOut, Menu, X, Clock, ChevronRight, AlertTriangle,
  Zap, RefreshCw, Activity, Image, Brain, DollarSign, ShieldCheck, KeyRound, Settings,
  ArrowLeftCircle, Terminal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminAuthStore } from '@/lib/adminAuthStore';
import { useAdminManagementStore, ADMIN_LEVEL_META, AdminNotifType } from '@/lib/adminManagementStore';
import { useAuthStore } from '@/lib/authStore';
import { hasAccess, type AdminSectionId } from '@/lib/adminPortalStore';
import { CryptoVerseLogo } from '@/components/CryptoVerseLogo';
import { AdminLynxButton } from '@/components/admin/AdminLynxButton';

// ── Role-based nav config ─────────────────────────────────────────────────────
interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  minLevel: number;
  badge?: string;
  color?: string;
  /** If set, a section-scoped Admin (level 3, not Super Admin) additionally
   *  needs hasAccess(email, section) to see/use this item. Super Admins and
   *  items without a section are governed by minLevel alone. */
  section?: AdminSectionId;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/admin/dashboard',    label: 'Dashboard',      icon: LayoutDashboard, minLevel: 1,  color: 'text-primary' },
  { path: '/admin/users',        label: 'Users',          icon: Users,           minLevel: 2,  color: 'text-blue-400', section: 'users' },
  { path: '/admin/transactions', label: 'Transactions',   icon: CreditCard,      minLevel: 3,  color: 'text-green-400', section: 'transactions' },
  { path: '/admin/content',      label: 'Content',        icon: BookOpen,        minLevel: 1,  color: 'text-sky-400', section: 'content' },
  { path: '/admin/competitions', label: 'Competitions',   icon: Trophy,          minLevel: 4,  color: 'text-amber-400', section: 'competitions' },
  { path: '/admin/events',      label: 'Events',          icon: Zap,             minLevel: 4,  color: 'text-red-400', section: 'events'   },
  { path: '/admin/reports',      label: 'Reports',        icon: Flag,            minLevel: 2,  color: 'text-purple-400', section: 'reports' },
  { path: '/admin/tickets',      label: 'Support',        icon: HeadphonesIcon,  minLevel: 3,  color: 'text-teal-400' },
  { path: '/admin/admins',       label: 'Admin Members',  icon: Shield,          minLevel: 6,  color: 'text-red-400' },
  { path: '/admin/requests',     label: 'Admin Requests', icon: ClipboardList,   minLevel: 6,  color: 'text-orange-400' },
  { path: '/admin/logs',         label: 'Audit Logs',     icon: FileText,        minLevel: 6,  color: 'text-slate-400' },
  { path: '/admin/copy-trading', label: 'Copy Trading',   icon: RefreshCw,       minLevel: 3,  color: 'text-yellow-400', section: 'copyTrading' },
  { path: '/admin/on-chain',    label: 'On-Chain',        icon: Activity,        minLevel: 2,  color: 'text-cyan-400', section: 'onChain' },
  { path: '/admin/nft',         label: 'NFT Management',  icon: Image,           minLevel: 2,  color: 'text-violet-400', section: 'nft' },
  { path: '/admin/sentiment',   label: 'Sentiment',       icon: Brain,           minLevel: 2,  color: 'text-amber-400', section: 'sentiment'  },
  { path: '/admin/exchange',    label: 'Exchange Mgmt',   icon: Activity,        minLevel: 3,  color: 'text-emerald-400' },
  // ── AI Intelligence ─────────────────────────────────────────────────────
  { path: '/admin/ai-dashboard',    label: 'AI Intelligence', icon: Brain,       minLevel: 1,  color: 'text-purple-400' },
  { path: '/admin/command-console', label: 'Command Console', icon: Terminal,    minLevel: 3,  color: 'text-amber-400' },
  // ── Admin Tools ─────────────────────────────────────────────────────────
  { path: '/admin/revenue',          label: 'Revenue',        icon: DollarSign,  minLevel: 4,  color: 'text-yellow-400'  },
  { path: '/admin/role-management',  label: 'Role Management', icon: ShieldCheck, minLevel: 6,  color: 'text-amber-400'   },
  { path: '/admin/api-management',   label: 'API Management',  icon: KeyRound,    minLevel: 6,  color: 'text-amber-400'   },
  { path: '/admin/settings',         label: 'Pricing Settings', icon: Settings,   minLevel: 6,  color: 'text-amber-400'   },
  { path: '/admin/cloud',            label: 'Cloud Operations', icon: Activity,   minLevel: 1,  color: 'text-cyan-400'   },
];

// Session countdown timer
function SessionTimer({ onExpiry }: { onExpiry: () => void }) {
  const { session, touchSession, isSessionValid } = useAdminAuthStore();
  const [remaining, setRemaining] = useState(30 * 60);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!session) return;
      const elapsed = Math.floor((Date.now() - new Date(session.lastActive).getTime()) / 1000);
      const left    = Math.max(0, 30 * 60 - elapsed);
      setRemaining(left);
      if (left === 0) onExpiry();
    }, 1000);
    return () => clearInterval(interval);
  }, [session, onExpiry]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const isWarning = remaining < 5 * 60;

  return (
    <button
      onClick={touchSession}
      title="Click to extend session"
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-semibold border transition-all',
        isWarning
          ? 'bg-amber-500/10 border-amber-500/25 text-amber-400 animate-pulse'
          : 'bg-white/3 border-white/8 text-white/40',
      )}
    >
      <Clock className="h-3 w-3" />
      {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
    </button>
  );
}

// Notification bell
function AdminNotifBell() {
  const { session }   = useAdminAuthStore();
  const { notifications, markNotifRead, getMyNotifications } = useAdminManagementStore();
  const [open, setOpen] = useState(false);

  const level = session?.level ?? 1;
  const myNotifs = getMyNotifications ? getMyNotifications(level) : notifications.filter(n => n.forLevels.includes(level));
  const unread = myNotifs.filter(n => !n.read).length;

  const SEVERITY_COLOR: Record<string, string> = {
    info: 'text-blue-400', warning: 'text-amber-400', critical: 'text-red-400',
  };
  const TYPE_ICON: Record<AdminNotifType, string> = {
    admin_request: '🔔', system_error: '⚙️', fraud_alert: '🚨',
    user_report: '🚩', support_escalation: '🎧', competition_dispute: '🏆', content_flag: '📚',
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-all border border-transparent hover:border-white/8"
      >
        <Bell className="h-4.5 w-4.5 h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-2 w-80 bg-[#12121a] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <span className="text-sm font-semibold text-white">Notifications</span>
                <span className="text-[10px] text-white/40">{unread} unread</span>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {myNotifs.length === 0 ? (
                  <p className="text-center py-8 text-white/30 text-sm">All clear ✓</p>
                ) : (
                  myNotifs.slice(0, 10).map(n => (
                    <button
                      key={n.id}
                      onClick={() => markNotifRead(n.id)}
                      className={cn(
                        'w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/3 transition-all border-b border-white/3 last:border-0',
                        !n.read && 'bg-white/2',
                      )}
                    >
                      <span className="text-base flex-shrink-0 mt-0.5">{TYPE_ICON[n.type]}</span>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-xs font-semibold', SEVERITY_COLOR[n.severity])}>{n.title}</p>
                        <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">{n.message}</p>
                        <p className="text-[10px] text-white/20 mt-1">
                          {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      {!n.read && <span className="w-1.5 h-1.5 bg-blue-400 rounded-full flex-shrink-0 mt-1.5" />}
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Layout ───────────────────────────────────────────────────────────────
export function AdminPortalLayout() {
  const { session, logout: adminLogout } = useAdminAuthStore();
  const { user: appUser, logout: appLogout } = useAuthStore();
  const { notifications }         = useAdminManagementStore();
  const location                  = useLocation();
  const [sidebarOpen, setSidebar] = useState(false);

  // Authorization comes ONLY from a real adminAuthStore session obtained via
  // the standalone AdminLogin flow (email/password/2FA). The main-app
  // appUser.role is NOT trusted to elevate privilege (it is client-editable
  // and never grants admin portal access).
  const level: number = session?.level ?? 1;

  const meta = ADMIN_LEVEL_META[Math.min(level, 6) as keyof typeof ADMIN_LEVEL_META]
    ?? ADMIN_LEVEL_META[1];
  const unifiedRole = appUser?.role;
  const roleLabel = unifiedRole ? unifiedRole.replace(/_/g, ' ') : meta.role;
  const identityEmail = session?.email ?? appUser?.email ?? 'Admin account';

  // Unified logout — clears both auth systems and redirects to home
  const logout = () => {
    if (session) adminLogout();
    if (appUser) appLogout();
    // appLogout() calls window.location.replace('/') so this fires after
  };

  // Effective email across both auth systems — used to resolve section access.
  const email = session?.email ?? appUser?.email ?? '';

  // Items tagged with a `section` are gated purely by the Superadmin's
  // per-section grant (see adminPortalStore.hasAccess); Super Admins (level 6)
  // always see everything. Untagged items keep the existing level gate.
  const allowedNav = NAV_ITEMS.filter(n =>
    n.section ? (level >= 6 || hasAccess(email, n.section)) : level >= n.minLevel,
  );

  const handleExpiry = useCallback(() => { logout(); }, [logout]);

  useEffect(() => { setSidebar(false); }, [location.pathname]);

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white overflow-hidden">
      {/* Sidebar overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-40 lg:hidden"
          onClick={() => setSidebar(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 w-60 bg-[#0d0d14] border-r border-white/5 flex flex-col transform transition-transform duration-300 lg:relative lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        {/* Logo */}
        <div className="flex items-center gap-4 px-5 py-5 border-b border-white/5">
          <CryptoVerseLogo size={32} className="flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">CryptoVerse HQ</p>
            <p className="text-[10px] text-white/30 truncate">Admin Portal</p>
          </div>
        </div>

        {/* Admin badge */}
        <div className="mx-4 mt-4 mb-2 px-3 py-2.5 rounded-xl border" style={{ borderColor: meta.border, background: meta.bg }}>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-black/20 overflow-hidden flex-shrink-0">
              <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${session?.avatarSeed ?? appUser?.avatarSeed ?? 'Admin'}`} alt="" className="w-full h-full" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{session?.displayName ?? appUser?.displayName ?? 'Admin'}</p>
              <p className="text-[10px] truncate" style={{ color: meta.color }}>{meta.icon} {meta.role}</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {allowedNav.map(item => {
            const Icon     = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-white/8 text-white border border-white/8'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/4',
                )}
              >
                <Icon className={cn('h-4 w-4 flex-shrink-0', isActive && item.color)} />
                <span className="truncate">{item.label}</span>
                {isActive && <ChevronRight className="h-3 w-3 ml-auto text-white/30" />}
              </Link>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="p-3 border-t border-white/5 space-y-1">
          {/* Return to the normal user app without ending the session — the
              admin portal previously had no way back except a full sign-out. */}
          <Link
            to="/dashboard"
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-white/50 hover:text-white hover:bg-white/5 text-sm transition-all"
          >
            <ArrowLeftCircle className="h-4 w-4" />
            <span>Back to App</span>
          </Link>
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-red-400/70 hover:text-red-400 hover:bg-red-500/8 text-sm transition-all"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 bg-[#0d0d14]/80 backdrop-blur-md flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5"
              onClick={() => setSidebar(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-xs text-white/30">
              <span>Admin</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-white/60 font-medium capitalize">
                {location.pathname.split('/').pop()?.replace(/-/g, ' ') || 'Dashboard'}
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs text-amber-400">
              <span className="capitalize">{roleLabel}</span>
              <span className="text-white/25">•</span>
              <span className="text-white/50 truncate max-w-56">{identityEmail}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Live indicator */}
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/8 border border-green-500/15">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[11px] text-green-400 font-medium">Live</span>
            </div>

            {/* Session timer */}
            <SessionTimer onExpiry={handleExpiry} />

            {/* Notifications */}
            <AdminNotifBell />

            {/* IP */}
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-white/20 font-mono">
              <Zap className="h-3 w-3" />
              {session?.ipAddress}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* ═══ Lynx AI Admin Button ═══════════════════════════════════════════ */}
      <AdminLynxButton />
    </div>
  );
}
