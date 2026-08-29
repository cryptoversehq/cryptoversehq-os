import React from 'react';
import { Users, ClipboardList, Activity, Shield, TrendingUp, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useAdminManagementStore, ADMIN_LEVEL_META, AdminLevel } from '@/lib/adminManagementStore';

export function AdminStats() {
  const { members, requests, activity } = useAdminManagementStore();

  const activeMembers    = members.filter(m => m.status === 'active').length;
  const suspendedMembers = members.filter(m => m.status === 'suspended').length;
  const pendingReqs      = requests.filter(r => r.status === 'ai_approved').length;
  const approvedReqs     = requests.filter(r => r.status === 'super_approved').length;
  const rejectedReqs     = requests.filter(r => r.status === 'super_rejected' || r.status === 'ai_rejected').length;

  // Level distribution
  const levelCounts: Record<AdminLevel, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (const m of members) {
    levelCounts[m.level] = (levelCounts[m.level] || 0) + 1;
  }

  const statCards = [
    { label: 'Total Admins',    value: members.length,    icon: Users,         color: '#60a5fa' },
    { label: 'Active',          value: activeMembers,     icon: CheckCircle2,  color: '#34d399' },
    { label: 'Suspended',       value: suspendedMembers,  icon: XCircle,       color: '#ef4444' },
    { label: 'Pending Review',  value: pendingReqs,       icon: Clock,         color: '#f59e0b' },
    { label: 'Approved',        value: approvedReqs,      icon: TrendingUp,    color: '#a78bfa' },
    { label: 'Audit Events',    value: activity.length,   icon: Activity,      color: '#fb923c' },
  ];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-white/5 rounded-2xl p-4 shadow">
            <div className="flex items-center gap-2 mb-2">
              <Icon className="h-4 w-4" style={{ color }} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className="text-2xl font-bold font-mono" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Level distribution */}
      <div className="bg-card border border-white/5 rounded-2xl p-5 shadow">
        <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm">
          <Shield className="h-4 w-4 text-primary" /> Admin Level Distribution
        </h3>
        <div className="space-y-3">
          {(Object.entries(ADMIN_LEVEL_META) as [string, typeof ADMIN_LEVEL_META[AdminLevel]][]).map(([lvl, meta]) => {
            const level = Number(lvl) as AdminLevel;
            const count = levelCounts[level] || 0;
            const maxCount = Math.max(...Object.values(levelCounts), 1);
            const pct = (count / maxCount) * 100;
            return (
              <div key={lvl} className="flex items-center gap-3">
                <span className="text-base w-5 text-center">{meta.icon}</span>
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium" style={{ color: meta.color }}>{meta.role}</span>
                    <span className="text-muted-foreground font-mono">{count}</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, backgroundColor: meta.color }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent activity summary */}
      <div className="bg-card border border-white/5 rounded-2xl p-5 shadow">
        <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4 text-primary" /> Recent Activity
        </h3>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No activity recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {activity.slice(0, 8).map(entry => (
              <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{entry.action}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {entry.adminName} → {entry.targetLabel}
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
