import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Users, ClipboardList, Activity,
  X, ChevronRight, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/authStore';
import { useAdminManagementStore } from '@/lib/adminManagementStore';
import { ShoppingBag } from 'lucide-react';
import { useStrategyStore } from '@/lib/strategyStore';
import { AdminMemberList } from './AdminMemberList';
import { AdminRequestList } from './AdminRequestList';
import { AdminActivityLog } from './AdminActivityLog';
import { AdminStats } from './AdminStats';
import { AdminStrategyManagement } from './AdminStrategyManagement';

type Tab = 'members' | 'requests' | 'activity' | 'stats' | 'strategies';

interface AdminPanelProps {
  open: boolean;
  onClose: () => void;
}

export function AdminPanel({ open, onClose }: AdminPanelProps) {
  const { user } = useAuthStore();
  const { refresh, members, requests } = useAdminManagementStore();
  const [activeTab, setActiveTab] = useState<Tab>('members');

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const pendingCount = requests.filter(r => r.status === 'ai_approved').length;

  const pendingStrategies = useStrategyStore(s =>
    Object.values(s.strategies).filter(st => st.status === 'pending').length
  );
  const flaggedCount = useStrategyStore(s => s.flaggedStrategies.filter(f => !f.resolved).length);
  const strategyBadge = (pendingStrategies + flaggedCount) || undefined;

  const tabs: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'members',    label: 'Admins',     icon: Users,         badge: members.length },
    { id: 'requests',   label: 'Requests',   icon: ClipboardList, badge: pendingCount > 0 ? pendingCount : undefined },
    { id: 'activity',   label: 'Audit Log',  icon: Activity },
    { id: 'stats',      label: 'Overview',   icon: Shield },
    { id: 'strategies', label: 'Strategies', icon: ShoppingBag,   badge: strategyBadge },
  ];

  if (!user?.isAdmin) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-4xl bg-background border-l border-white/8 shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 bg-card/50">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-red-500/25 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <h2 className="font-bold text-base">Admin Control Center</h2>
                  <p className="text-xs text-muted-foreground capitalize">
                    {user?.role?.replace(/_/g, ' ') ?? 'Admin'} <span className="opacity-50">•</span> {user?.email ?? 'Admin account'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={refresh}
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
                  title="Refresh"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex items-center gap-1 px-6 py-3 border-b border-white/5 bg-card/30">
              {tabs.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                      isActive
                        ? 'bg-primary/15 text-primary border border-primary/20'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{tab.label}</span>
                    {tab.badge !== undefined && (
                      <span className={cn(
                        'ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold',
                        isActive
                          ? 'bg-primary/30 text-primary'
                          : 'bg-secondary text-muted-foreground',
                      )}>
                        {tab.badge}
                      </span>
                    )}
                    {tab.id === 'requests' && pendingCount > 0 && !isActive && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full" />
                    )}
                  </button>
                );
              })}

              <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                <ChevronRight className="h-3 w-3" />
                <span className="capitalize">{activeTab}</span>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                >
                  {activeTab === 'members'    && <AdminMemberList />}
                  {activeTab === 'requests'   && <AdminRequestList />}
                  {activeTab === 'activity'   && <AdminActivityLog />}
                  {activeTab === 'stats'      && <AdminStats />}
                  {activeTab === 'strategies' && <AdminStrategyManagement />}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
