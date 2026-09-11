import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import { AdminLogin } from '../components/admin/portal/pages/AdminLogin';
import { AdminPortalLayout } from '../components/admin/portal/AdminPortalLayout';
import { AdminDashboard } from '../components/admin/portal/pages/AdminDashboard';
import { AdminUsers } from '../components/admin/portal/pages/AdminUsers';
import { AdminTransactions } from '../components/admin/portal/pages/AdminTransactions';
import { AdminContent } from '../components/admin/portal/pages/AdminContent';
import { AdminCompetitions } from '../components/admin/portal/pages/AdminCompetitions';
import { AdminEvents } from '../components/admin/portal/pages/AdminEvents';
import { AdminReports } from '../components/admin/portal/pages/AdminReports';
import { AdminTickets } from '../components/admin/portal/pages/AdminTickets';
import { AdminAdmins } from '../components/admin/portal/pages/AdminAdmins';
import { AdminRequests } from '../components/admin/portal/pages/AdminRequests';
import { AdminLogs } from '../components/admin/portal/pages/AdminLogs';
import { AdminCopyTrading } from '../components/admin/portal/pages/AdminCopyTrading';
import { AdminOnChain } from '../components/admin/portal/pages/AdminOnChain';
import { AdminNFTManagement } from '../components/admin/portal/pages/AdminNFTManagement';
import { AdminSentiment } from '../components/admin/portal/pages/AdminSentiment';
import { AdminExchangeManagement } from '../components/admin/portal/pages/AdminExchangeManagement';
import { AdminSubscriptions } from '../components/admin/portal/pages/AdminSubscriptions';
import { AdminRevenueDashboard } from '../components/admin/portal/pages/AdminRevenueDashboard';
import { AdminRoleManagement } from '../components/admin/portal/pages/AdminRoleManagement';
import { AdminApiManagement } from '../pages/admin/AdminApiManagement';
import { AdminSettings } from '../pages/admin/AdminSettings';
import { CloudDashboardPage } from '../pages/admin/CloudDashboardPage';
import { AIExecutiveDashboard } from '../components/admin/AIExecutiveDashboard';
import { AICommandConsole } from '../components/admin/AICommandConsole';
import { AIAdminDashboard } from '../pages/admin/AIAdminDashboard';
import { AdminLynxSettings } from '../pages/admin/AdminLynxSettings';
import { AdminAnalytics } from '../pages/admin/AdminAnalytics';
import { useAdminAuthStore } from '../lib/adminAuthStore';
import { useAuthStore } from '../lib/authStore';
import { hasAccess, type AdminSectionId } from '../lib/adminPortalStore';
import { ApiForbiddenError, fetchAdminRole, isAdminRole } from '../lib/adminApi';

export function Forbidden403() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#0a0a0f]">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm text-center space-y-6 rounded-3xl border border-red-500/20 p-8 bg-red-500/4">
        <div className="flex justify-center"><div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center"><ShieldCheck className="h-10 w-10 text-red-400" /></div></div>
        <div className="space-y-2"><h1 className="text-2xl font-black text-red-400">403 - Unauthorized Access</h1><p className="text-sm text-white/40 leading-relaxed">You do not have permission to access the Admin Panel.<br />This area is restricted to <span className="text-amber-300 font-semibold">Admin</span> and <span className="text-amber-300 font-semibold">Super Admin</span> roles.</p></div>
        <a href="/" className="block w-full py-3 rounded-2xl bg-white/5 text-white/50 text-sm hover:bg-white/10 transition-all border border-white/10">Return to Home</a>
      </motion.div>
    </div>
  );
}

function SectionGuard({ section, children }: { section: AdminSectionId; children: React.ReactElement }) {
  const { session } = useAdminAuthStore();
  const appUser = useAuthStore(state => state.user);
  const sharedRoleLevel = appUser?.role === 'super_admin' || appUser?.role === 'founder'
    ? 6
    : appUser?.role === 'senior_admin'
      ? 4
      : appUser?.role === 'admin' || appUser?.role === 'developer'
        ? 3
        : 1;
  const level = session?.level ?? sharedRoleLevel;
  const email = session?.email ?? appUser?.email ?? '';
  return level >= 6 || hasAccess(email, section) ? children : <Navigate to="/admin/403" replace />;
}

/** Full-screen status card used while the server gate is deciding. */
function AdminGateMessage({ title, spinner }: { title: string; spinner?: boolean }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#0a0a0f] text-white/60">
      {spinner
        ? <RefreshCw className="h-5 w-5 animate-spin text-amber-400" />
        : <ShieldCheck className="h-6 w-6 text-red-400" />}
      <p className="text-sm max-w-sm text-center px-6">{title}</p>
      {!spinner && (
        <a href="/admin/login" className="text-xs text-amber-300 hover:underline">Go to admin login</a>
      )}
    </div>
  );
}

/**
 * Server-side gate for the whole admin portal (Phase 1).
 *
 * Authorization is NOT read from the browser. On mount we ask the server:
 *   1. GET /api/me → the current user's role (developer / subscription_admin /
 *      support_admin)
 * A 401/403 (ApiForbiddenError), or a missing / insufficient role, redirects to
 * /admin/login.
 * Any other error (network / 5xx) is shown rather than silently locking out.
 */
function ServerAdminGuard({ children }: { children: React.ReactElement }) {
  const [state, setState]   = useState<'checking' | 'ok' | 'denied' | 'error'>('checking');
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const admin = await fetchAdminRole();
        if (!isAdminRole(admin.role)) {
          if (!canceled) setState('denied');
          return;
        }
        if (!canceled) setState('ok');
      } catch (err) {
        if (canceled) return;
        if (err instanceof ApiForbiddenError) {
          setState('denied');
        } else {
          setDetail((err as Error).message);
          setState('error');
        }
      }
    })();
    return () => { canceled = true; };
  }, []);

  if (state === 'checking') return <AdminGateMessage title="Verifying admin session…" spinner />;
  if (state === 'denied')   return <Navigate to="/admin/login" replace />;
  if (state === 'error')    return <AdminGateMessage title={detail ?? 'Could not verify the admin session.'} />;
  return children;
}

/**
 * Subscription management is authorized by the SERVER: the Render API answers
 * 401/403 to callers without the developer / subscription_admin role, and
 * AdminSubscriptions renders a Forbidden panel from that response. This guard is
 * a deliberate pass-through — a client-side role check would be a UX hint, not a
 * security boundary.
 */
function SubscriptionAdminGuard({ children }: { children: React.ReactElement }) {
  return children;
}

export function AdminRoutes() {
  return (
    <Routes>
      {/* Public admin entry — no auth, no portal layout. */}
      <Route path="login" element={<AdminLogin />} />

      {/* Everything else is behind the server-side admin gate. */}
      <Route element={<ServerAdminGuard><AdminPortalLayout /></ServerAdminGuard>}>
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="users" element={<SectionGuard section="users"><AdminUsers /></SectionGuard>} />
        <Route path="transactions" element={<SectionGuard section="transactions"><AdminTransactions /></SectionGuard>} />
        <Route path="content" element={<SectionGuard section="content"><AdminContent /></SectionGuard>} />
        <Route path="competitions" element={<SectionGuard section="competitions"><AdminCompetitions /></SectionGuard>} />
        <Route path="events" element={<SectionGuard section="events"><AdminEvents /></SectionGuard>} />
        <Route path="reports" element={<SectionGuard section="reports"><AdminReports /></SectionGuard>} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="tickets" element={<AdminTickets />} />
        <Route path="admins" element={<AdminAdmins />} />
        <Route path="requests" element={<AdminRequests />} />
        <Route path="logs" element={<AdminLogs />} />
        <Route path="copy-trading" element={<SectionGuard section="copyTrading"><AdminCopyTrading /></SectionGuard>} />
        <Route path="on-chain" element={<SectionGuard section="onChain"><AdminOnChain /></SectionGuard>} />
        <Route path="nft" element={<SectionGuard section="nft"><AdminNFTManagement /></SectionGuard>} />
        <Route path="sentiment" element={<SectionGuard section="sentiment"><AdminSentiment /></SectionGuard>} />
        <Route path="exchange" element={<AdminExchangeManagement />} />
        <Route path="subscriptions" element={<SubscriptionAdminGuard><AdminSubscriptions /></SubscriptionAdminGuard>} />
        <Route path="revenue" element={<AdminRevenueDashboard />} />
        <Route path="role-management" element={<AdminRoleManagement />} />
        <Route path="api-management" element={<AdminApiManagement />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="cloud" element={<CloudDashboardPage />} />
        <Route path="ai-dashboard" element={<AIExecutiveDashboard />} />
        <Route path="ai-intelligence" element={<AIAdminDashboard />} />
        <Route path="command-console" element={<AICommandConsole />} />
        <Route path="lynx-settings" element={<AdminLynxSettings />} />
        <Route path="403" element={<Forbidden403 />} />
        <Route index element={<AdminDashboard />} />
      </Route>
    </Routes>
  );
}
