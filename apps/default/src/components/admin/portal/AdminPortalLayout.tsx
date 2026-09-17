import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, CreditCard, BookOpen, Trophy,
  Flag, HeadphonesIcon, Shield, ClipboardList, FileText,
  Bell, LogOut, Menu, X, ChevronRight, AlertTriangle,
  Zap, RefreshCw, Activity, Image, Brain, DollarSign, ShieldCheck, KeyRound, Settings,
  ArrowLeftCircle, Terminal,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
// Batch C2.5: `@/lib/adminAuthStore` (the cryptoverse_admin_session store) is no
// longer imported anywhere in this file — every value it offered was editable in
// the browser. The admin identity comes from GET /api/me (useAdminIdentity).
import { useAdminManagementStore, ADMIN_LEVEL_META, AdminNotifType } from '@/lib/adminManagementStore';
import { useAuthStore } from '@/lib/authStore';
import { type AdminSectionId } from '@/lib/adminPortalStore';
import { CryptoVerseLogo } from '@/components/CryptoVerseLogo';
import { AdminLynxButton } from '@/components/admin/AdminLynxButton';
import { destroySession, loadAuthSession, refreshActivity } from '@/lib/security/sessionManager';
import { useAdminIdentity, logoutAdminSession, clearAdminSessionCache, hasFullAdminAccess, roleLevel } from '@/lib/adminApi';

/** Email from the app's own session cache (`cryptoverse_session`), if present. */
function readCachedAppSessionEmail(): string | null {
  try {
    const raw = localStorage.getItem('cryptoverse_session');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { email?: string } | null;
    return parsed?.email ?? null;
  } catch { return null; }
}

// ── Role-based nav config ─────────────────────────────────────────────────────
interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  minLevel: number;
  badge?: string;
  color?: string;
  /** LEGACY (Batch C2/C2.5) — `minLevel`, `section` and `subscriptionAdminOnly`
   *  are no longer consulted by anything. Nav visibility is decided from the
   *  SERVER role in `allowedNav`: the owner tier sees all of NAV_ITEMS and the
   *  other two admin roles see only Subscriptions. The old comment here described
   *  `hasAccess(email, section)`, which has been deleted. */
  section?: AdminSectionId;
  /** LEGACY — see above. */
  subscriptionAdminOnly?: boolean;
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
  { path: '/admin/subscriptions', label: 'Subscriptions',  icon: CreditCard,      minLevel: 1,  color: 'text-amber-400', subscriptionAdminOnly: true },
  // ── AI Intelligence ─────────────────────────────────────────────────────
  { path: '/admin/ai-dashboard',    label: 'AI Intelligence', icon: Brain,       minLevel: 1,  color: 'text-purple-400' },
  { path: '/admin/command-console', label: 'Command Console', icon: Terminal,    minLevel: 3,  color: 'text-amber-400' },
  // ── Admin Tools ─────────────────────────────────────────────────────────
  { path: '/admin/revenue',          label: 'Revenue',        icon: DollarSign,  minLevel: 4,  color: 'text-yellow-400'  },
  { path: '/admin/api-management',   label: 'API Management',  icon: KeyRound,    minLevel: 6,  color: 'text-amber-400'   },
  { path: '/admin/settings',         label: 'Pricing Settings', icon: Settings,   minLevel: 6,  color: 'text-amber-400'   },
  { path: '/admin/cloud',            label: 'Cloud Operations', icon: Activity,   minLevel: 1,  color: 'text-cyan-400'   },
];

// Batch C2.5: the client-side SessionTimer was deleted here. It counted down 30
// minutes from `session.lastActive` and let the admin "extend" it with a click —
// a browser-side pretence of authority over a server-side session. The Better Auth
// cookie and the API's own revocation checks are the authority; the UI simply does
// not need to model expiry.

// Notification bell
function AdminNotifBell() {
  // Batch C2.5: the audience level comes from the SERVER role (GET /api/me) —
  // the cryptoverse_admin_session level it used to read was editable in the browser.
  const identity = useAdminIdentity();
  const { notifications, markNotifRead, getMyNotifications } = useAdminManagementStore();
  const [open, setOpen] = useState(false);

  const level = roleLevel(identity?.role);
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
  // Batch C2.5: there is no admin session store any more. The admin identity is
  // the SERVER's answer (useAdminIdentity, above) and signing out is
  // logoutAdminSession(), which revokes the Better Auth cookie.
  const { user: appUser, endUserView } = useAuthStore();
  const { notifications }         = useAdminManagementStore();
  const location                  = useLocation();
  const navigate                  = useNavigate();
  const [sidebarOpen, setSidebar] = useState(false);

  // Authorization: the admin role comes from the SERVER (GET /api/me).
  // ServerAdminGuard has already verified the session + role; this value only
  // shapes the UI (which nav items are shown, read-only mode).
  const identity  = useAdminIdentity();
  const adminRole = identity?.role ?? null;

  const ownerTier = hasFullAdminAccess(adminRole);
  const level: number = ownerTier ? 6 : adminRole ? 3 : 1;
  const meta = ADMIN_LEVEL_META[Math.min(level, 6) as keyof typeof ADMIN_LEVEL_META]
    ?? ADMIN_LEVEL_META[1];
  const roleLabel = adminRole ? adminRole.replace(/_/g, ' ') : meta.role;
  const identityEmail = identity?.email || appUser?.email || 'Admin account';

  // Nav is filtered purely by the server-provided admin role:
  //   developer / founder / super_admin   → everything
  //   subscription_admin / support_admin  → only the Subscriptions tool
  //   anything else → nothing (ServerAdminGuard has already redirected)
  const allowedNav = React.useMemo(() => {
    if (hasFullAdminAccess(adminRole)) return NAV_ITEMS;
    if (adminRole === 'subscription_admin' || adminRole === 'support_admin') {
      return NAV_ITEMS.filter(n => n.path === '/admin/subscriptions');
    }
    return [];
  }, [adminRole]);

  // Sign out: clear the server (Supabase) session, then the admin session store,
  // then the main app session — WITHOUT authStore.logout()'s own redirect to
  // '/dashboard' — and land on the admin login page.
  const logout = useCallback(async () => {
    await logoutAdminSession();
    clearAdminSessionCache();
    // Batch C2.5: no local admin session store to clear any more — the Better
    // Auth cookie was revoked by logoutAdminSession() above.
    try {
      destroySession();
      window.localStorage.removeItem('cryptoverse_session');
      window.sessionStorage.removeItem('cryptoverse_session');
      window.sessionStorage.removeItem('cryptoverse_user_view_state');
      useAuthStore.setState({ user: null, isAuthenticated: false, isAdmin: false, isSuperAdmin: false });
    } catch { /* ignore — sign-out must always complete */ }
    window.location.replace('/admin/login');
  }, []);

  // Batch C2.5: handleExpiry fed the removed client-side SessionTimer.

  /**
   * "Back to App" — hand the admin over to the normal user app.
   *
   * Two auth systems are in play here: the portal authenticates against the
   * server (Better Auth cookie, `/admin/login`), while the app keeps its own
   * session in this browser. So this button:
   *   1. ends any active "View as user" impersonation — otherwise /dashboard
   *      would render as the viewed account, not as the admin;
   *   2. refreshes the app session's activity clock — time spent working in the
   *      portal is real work, and letting the app's idle validator count it as
   *      idle logged admins out the moment they returned;
   *   3. only falls back to an app sign-in when there genuinely is no app
   *      session in this browser, and says so, instead of silently dropping the
   *      admin on a login page that looks like a forced logout.
   */
  const backToApp = useCallback(async () => {
    const wasViewing = useAuthStore.getState().viewState.isViewing;
    try { endUserView(); } catch { /* no active view */ }

    let appSession: ReturnType<typeof loadAuthSession> = null;
    try { appSession = loadAuthSession(); } catch { appSession = null; }
    const cachedEmail = appSession?.email ?? readCachedAppSessionEmail();

    if (cachedEmail) {
      if (appSession) refreshActivity(appSession);
      // A hard reload is only needed when impersonation was active: that is the
      // one case where stale view state must not survive. A plain in-app
      // navigation otherwise, so the app session is left completely untouched.
      if (wasViewing) window.location.assign('/dashboard');
      else navigate('/dashboard');
      return;
    }

    // No app session in this browser. The admin is still authenticated against
    // the API (Better Auth cookie), but the app keeps its OWN session — and
    // Batch C2 removed the client-side "mint an app session from an email"
    // path (loginFromSession) that used to paper over this, because it turned a
    // verified admin email into an app session without the app's own sign-in.
    // Say so plainly instead of dropping the admin on a login page that looks
    // like a forced logout.
    toast.error('Your app session has ended. Sign in with your app account to continue.');
    navigate('/login');
  }, [endUserView, navigate]);

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

        {/* Admin badge — Batch C2.5: the identity comes from the app session and the
            SERVER-verified admin (GET /api/me). The deleted cryptoverse_admin_session
            used to supply the avatar seed and display name here, and leftover
            references to it are what crashed this layout on every admin page. */}
        <div className="mx-4 mt-4 mb-2 px-3 py-2.5 rounded-xl border" style={{ borderColor: meta.border, background: meta.bg }}>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-black/20 overflow-hidden flex-shrink-0">
              <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${appUser?.avatarSeed ?? 'Admin'}`} alt="" className="w-full h-full" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{appUser?.displayName || identity?.email || 'Admin'}</p>
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
          {/* Return to the normal user app WITHOUT ending the admin session. */}
          <button
            onClick={() => { void backToApp(); }}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-white/50 hover:text-white hover:bg-white/5 text-sm transition-all text-left"
          >
            <ArrowLeftCircle className="h-4 w-4" />
            <span>Back to App</span>
          </button>
          <button
            onClick={() => { void logout(); }}
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

            {/* Batch C2.5: the 30-minute client session timer lived here. It was a
                countdown that could be "extended" from the browser while the real
                authority is the Better Auth cookie plus the server's revocation
                checks — the illusion of control over server-side expiry. If a
                countdown is ever wanted again, drive it from /api/me session
                expires_at and treat it as display only. */}

            {/* Notifications */}
            <AdminNotifBell />

            {/* Batch C2.5: this printed session.ipAddress from the local admin
                session store. The authoritative value is GET /api/me → session.ip
                if the UI wants it back — showing a browser-recorded IP as though
                it were the server's was misleading, so it is gone. */}
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
