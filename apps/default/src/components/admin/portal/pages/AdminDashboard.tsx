import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users, CreditCard, HeadphonesIcon, Flag, Trophy,
  BookOpen, AlertTriangle, CheckCircle2, Clock, TrendingUp,
  ShieldAlert, Zap, Activity, BarChart3, Check, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminAuthStore } from '@/lib/adminAuthStore';
import { useAdminPortalStore, TWO_MAN_ACTIONS } from '@/lib/adminPortalStore';
import { useAdminManagementStore, ADMIN_LEVEL_META } from '@/lib/adminManagementStore';
import { useAdminPaymentStore } from '@/lib/adminPaymentStore';
import { useEventsStore } from '../../../events/eventStore';
import { useAuthStore } from '@/lib/authStore';
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

const CARD_VARIANTS = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };

/** Bucket real audit-log timestamps into 12 two-hour windows over the last 24h. */
function buildActivitySpark(auditTimestamps: string[]): { t: number; v: number }[] {
  const now = Date.now();
  const bucketMs = 2 * 60 * 60 * 1000; // 2h buckets × 12 = 24h
  const buckets = Array.from({ length: 12 }, (_, i) => ({ t: i, v: 0 }));
  for (const ts of auditTimestamps) {
    const age = now - new Date(ts).getTime();
    if (age < 0 || age > 24 * 60 * 60 * 1000) continue;
    const idx = 11 - Math.floor(age / bucketMs);
    if (idx >= 0 && idx < 12) buckets[idx].v += 1;
  }
  return buckets;
}

export function AdminDashboard() {
  const { session }            = useAdminAuthStore();
  const { user: appUser }      = useAuthStore();
  const { users, tickets, reports, twoManRequests, approveTwoMan, rejectTwoMan, loadUsers, loadTickets } = useAdminPortalStore();
  const { notifications, alerts, members, richAudit } = useAdminManagementStore();
  const { rows: paymentRows } = useAdminPaymentStore();
  const { events } = useEventsStore();

  // Load live data on mount
  useEffect(() => {
    loadUsers();
    loadTickets();
  }, [loadUsers, loadTickets]);

  // Resolve effective admin level the same way SectionGuard/AdminPortalLayout do:
  // prefer the dedicated Admin Portal session's level, but fall back to the
  // main-app role (super_admin → 6, admin → 3, everyone else → 1) so a
  // superadmin who entered via the main-app session (never logged in through
  // the standalone /admin login form) still gets the full dashboard instead
  // of defaulting to a Level-1 "Content Admin" view.
  const level = session?.level
    ?? (appUser?.role === 'super_admin' ? 6 : appUser?.role === 'admin' ? 3 : 1);
  const meta  = ADMIN_LEVEL_META[level];

  const auditLast24h = richAudit.filter(a => Date.now() - new Date(a.timestamp).getTime() < 24 * 60 * 60 * 1000).length;
  const sparkData = buildActivitySpark(richAudit.map(a => a.timestamp));

  // KPIs relevant to admin level
  const kpis = [
    { label: 'Total Users',      value: users.length,                                           icon: Users,         color: '#60a5fa', change: `${users.filter(u=>u.status==='active').length} active`, minLevel: 1 },
    { label: 'Active Users',     value: users.filter(u => u.status === 'active').length,        icon: Activity,      color: '#34d399', change: `${users.filter(u=>u.status==='active').length} online`, minLevel: 1 },
    { label: 'Pending Payments', value: paymentRows.filter(t => t.status === 'pending').length,  icon: CreditCard,    color: '#f59e0b', change: 'Needs review', minLevel: 3 },
    { label: 'Open Tickets',     value: tickets.filter(t => t.status === 'open').length,         icon: HeadphonesIcon,color: '#a78bfa', change: `${tickets.filter(t=>t.priority==='critical').length} critical`, minLevel: 3 },
    { label: 'Pending Reports',  value: reports.filter(r => r.status === 'pending').length,      icon: Flag,          color: '#fb923c', change: 'Awaiting action', minLevel: 2 },
    { label: 'Active Competitions', value: events.filter(e => e.status === 'live').length,       icon: Trophy,        color: '#f472b6', change: `${events.filter(e=>e.status==='upcoming').length} upcoming`, minLevel: 4 },
    { label: 'Admin Members',    value: members.length,                                           icon: ShieldAlert,   color: '#ef4444', change: `${members.filter(m=>m.status==='active').length} active`, minLevel: 6 },
    { label: 'Audit Events',     value: auditLast24h,                                             icon: BarChart3,     color: '#06b6d4', change: 'Last 24h',     minLevel: 6 },
  ].filter(k => level >= k.minLevel);

  // Two-man pending
  const pendingTwoMan = twoManRequests.filter(r => r.status === 'pending');

  // Active alerts
  const activeAlerts = (alerts || []).filter(a => !a.dismissed).slice(0, 3);

  // Unread notifs for this level
  const myNotifs = (notifications || []).filter(n => n.forLevels.includes(level) && !n.read).slice(0, 5);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-xl font-bold text-white">
            {meta.icon} {meta.role} Dashboard
          </h1>
          <p className="text-sm text-white/40 mt-0.5">
            Welcome back, {session?.displayName} · {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold"
          style={{ borderColor: meta.border, background: meta.bg, color: meta.color }}>
          Level {level} Access
        </div>
      </motion.div>

      {/* KPI Grid */}
      <motion.div
        variants={{ show: { transition: { staggerChildren: 0.06 } } }}
        initial="hidden" animate="show"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
      >
        {kpis.map(k => (
          <motion.div key={k.label} variants={CARD_VARIANTS}
            className="bg-white/[0.03] border border-white/8 rounded-2xl p-4 hover:border-white/12 transition-all">
            <div className="flex items-center justify-between mb-3">
              <k.icon className="h-4 w-4" style={{ color: k.color }} />
              <span className="text-[10px] text-white/30">{k.change}</span>
            </div>
            <p className="text-2xl font-bold text-white font-mono">{k.value}</p>
            <p className="text-xs text-white/40 mt-0.5">{k.label}</p>
          </motion.div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Sparkline */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="lg:col-span-2 bg-white/[0.03] border border-white/8 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Admin Activity (24h)
            </h3>
            <span className="text-[10px] text-white/30 bg-secondary/30 text-white/50 px-2 py-0.5 rounded-full border border-white/10">
              {auditLast24h} logged action{auditLast24h === 1 ? '' : 's'}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={sparkData}>
              <defs>
                <linearGradient id="adminGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" hide />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, fontSize: 11 }}
                labelStyle={{ color: 'rgba(255,255,255,0.4)' }}
                itemStyle={{ color: '#a5b4fc' }}
              />
              <Area type="monotone" dataKey="v" stroke="#6366f1" fill="url(#adminGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Alerts panel */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="bg-white/[0.03] border border-white/8 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" /> Active Alerts
          </h3>
          {activeAlerts.length === 0 && myNotifs.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-white/20">
              <CheckCircle2 className="h-8 w-8 mb-2" />
              <p className="text-sm">All clear</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeAlerts.map(a => (
                <div key={a.id} className={cn('px-3 py-2.5 rounded-xl border text-xs',
                  a.severity === 'high'   ? 'bg-red-500/8 border-red-500/20 text-red-300' :
                  a.severity === 'medium' ? 'bg-amber-500/8 border-amber-500/20 text-amber-300' :
                                            'bg-blue-500/8 border-blue-500/20 text-blue-300'
                )}>
                  <p className="font-semibold">{a.pattern.replace(/_/g, ' ')}</p>
                  <p className="text-white/40 mt-0.5">{a.description}</p>
                </div>
              ))}
              {myNotifs.map(n => (
                <div key={n.id} className={cn('px-3 py-2.5 rounded-xl border text-xs',
                  n.severity === 'critical' ? 'bg-red-500/8 border-red-500/20 text-red-300' :
                  n.severity === 'warning'  ? 'bg-amber-500/8 border-amber-500/20 text-amber-300' :
                                              'bg-blue-500/8 border-blue-500/20 text-blue-300'
                )}>
                  <p className="font-semibold">{n.title}</p>
                  <p className="text-white/40 mt-0.5 leading-relaxed">{n.message}</p>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Two-Man Rule Queue */}
      {level >= 6 && pendingTwoMan.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-amber-400 mb-4 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> Two-Man Rule — Pending Approvals ({pendingTwoMan.length})
          </h3>
          <div className="space-y-3">
            {pendingTwoMan.map(req => {
              const actionMeta = TWO_MAN_ACTIONS[req.action];
              const myApproval = req.approvals.find(a => a.adminId === session?.adminId);
              return (
                <div key={req.id} className="bg-white/3 border border-white/8 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{actionMeta.icon}</span>
                      <p className="text-sm font-semibold text-white">{actionMeta.label}</p>
                      <span className="text-[10px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/20">
                        {req.approvals.length}/2 approved
                      </span>
                    </div>
                    <p className="text-xs text-white/40">Target: {req.targetLabel} · Reason: {req.reason}</p>
                    <p className="text-[10px] text-white/25 mt-1">Requested by {req.requesterName}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {!myApproval ? (
                      <>
                        <button
                          onClick={() => approveTwoMan(req.id, session?.adminId ?? '', session?.displayName ?? '')}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/15 border border-green-500/25 text-green-400 text-xs font-semibold hover:bg-green-500/25 transition-all"
                        >
                          <Check className="h-3.5 w-3.5" /> Approve
                        </button>
                        <button
                          onClick={() => rejectTwoMan(req.id, session?.adminId ?? '')}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-all"
                        >
                          <X className="h-3.5 w-3.5" /> Reject
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-green-400 flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" /> You approved
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Quick stats for level */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
        className="bg-white/[0.02] border border-border rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-white/60 mb-4 flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" /> Your Permissions
        </h3>
        <div className="flex flex-wrap gap-2">
          {level >= 1 && ['View Content', 'Edit Lessons', 'Publish Lessons', 'Manage Quizzes'].map(p => (
            <span key={p} className="text-[11px] px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">{p}</span>
          ))}
          {level >= 2 && ['Moderate Chat', 'Review Reports', 'Warn Users', 'Delete Messages'].map(p => (
            <span key={p} className="text-[11px] px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">{p}</span>
          ))}
          {level >= 3 && ['Manage Tickets', 'Approve Payments', 'Adjust Plans'].map(p => (
            <span key={p} className="text-[11px] px-2.5 py-1 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400">{p}</span>
          ))}
          {level >= 4 && ['Manage Competitions', 'Disqualify Traders'].map(p => (
            <span key={p} className="text-[11px] px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">{p}</span>
          ))}
          {level >= 5 && ['Economy Control', 'Freeze Accounts', 'Monitor Fraud'].map(p => (
            <span key={p} className="text-[11px] px-2.5 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400">{p}</span>
          ))}
          {level >= 6 && ['Full System Access', 'Manage All Admins', 'View Audit Logs', 'Two-Man Rule'].map(p => (
            <span key={p} className="text-[11px] px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">{p}</span>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
