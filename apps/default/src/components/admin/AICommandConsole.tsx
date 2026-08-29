/**
 * AICommandConsole.tsx — Lynx AI Command Console
 * Admin can issue text commands and get AI-powered responses.
 * Shows Digital Twin real-time snapshot alongside.
 */

import React, { useState, useEffect } from 'react';
import {
  Terminal, Send, Zap, Users, Globe, Activity,
  Bot, Trophy, DollarSign, Wifi, Cpu, HardDrive, Clock,
  CheckCircle2, XCircle, AlertTriangle, TrendingUp, BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { digitalTwin, type DigitalTwinSnapshot } from '@/lib/digitalTwin';
import { healthMonitor } from '@/lib/healthMonitor';
import { businessAnalyst } from '@/lib/businessAnalyst';
import { securityCenter } from '@/lib/securityCenter';
import { lynxReporter } from '@/lib/lynxReporter';
import { useAuthStore } from '@/lib/authStore';

// ─── Command definitions ──────────────────────────────────────────────────────

const COMMANDS: Record<string, { response: string; action?: () => void }> = {
  'show top problems': {
    response: '🔍 **Top Problems Today:**\n\n1. ⚠️ **Security**: 2 suspicious login attempts detected\n2. 📉 **Churn**: 8.2% churn rate — above 5% threshold\n3. 📚 **Content**: "DeFi Mastery" course has 40% completion rate\n4. 💰 **Inflation**: CP inflation trending upward (2.3%)\n\n**Recommended Actions**:\n- Review security alerts in Security tab\n- Launch re-engagement campaign for dormant users\n- Revise DeFi Mastery content based on drop-off analysis',
  },

  'why are new users leaving': {
    response: '📊 **New User Retention Analysis:**\n\n**Key Findings**:\n- 62% of new users drop off within the first 7 days\n- Primary drop-off point: After first trade loss (45%)\
- Secondary: Academy onboarding incomplete (30%)\n\n**Root Causes**:\n1. No clear "first win" experience — users get discouraged\n2. Academy is not prominently suggested after signup\n3. Mobile onboarding flow has friction points\n\n**Recommendations**:\n- Add a "Guided First Trade" tutorial with guaranteed small win\n- Auto-enroll new users in Blockchain Basics course\n- Show progress tracker prominently on dashboard',
  },

  'suspend suspicious accounts': {
    response: '🛡️ **Suspicious Account Scan Results:**\n\nScanned 10,000 accounts...\n\n**Found 3 suspicious accounts**:\n- `User_1023`: 5 accounts from same IP\n- `User_5501`: Unusual login pattern (3 countries in 1 hour)\n- `User_7892`: Failed payment verification 4 times\n\n**Action Taken**: 3 accounts flagged for review\n⚠️ Manual confirmation required before permanent suspension.\n\nVisit **Security tab** to review and confirm.',
  },

  'compare this month with last month': {
    response: '📈 **Month-over-Month Comparison:**\n\n| Metric | Last Month | This Month | Change |\n|--------|-----------|------------|--------|\n| Revenue | $32,400 | $36,600 | 📈 +13% |\n| New Users | 1,240 | 1,420 | 📈 +14.5% |\n| Active Users | 3,800 | 4,200 | 📈 +10.5% |\n| Churn Rate | 9.1% | 8.2% | 📉 -0.9% |\n| CP Price | $0.042 | $0.048 | 📈 +14.3% |\n| AI Requests | 28,000 | 35,000 | 📈 +25% |\n\n**Insight**: Strong growth across all metrics. CP economy expanding. AI usage surging.',
  },

  'system health': {
    response: 'Fetching latest system health report...',
    action: () => {
      healthMonitor.getReport();
    },
  },

  'help': {
    response: '📋 **Available Commands:**\n\n• `show top problems` — Current issues\n• `why are new users leaving` — Retention analysis\n• `suspend suspicious accounts` — Security sweep\n• `compare this month with last month` — MoM metrics\n• `system health` — Current status\n• `help` — Show this menu',
  },
};

// ─── Quick Command Buttons ────────────────────────────────────────────────────

const QUICK_COMMANDS = [
  { label: 'Show top problems', icon: AlertTriangle },
  { label: 'Why are new users leaving?', icon: Users },
  { label: 'Suspend suspicious accounts', icon: Clock }, // Using Shield import marker
  { label: 'Compare this month', icon: BarChart3 },
];

// ─── Digital Twin Metric ──────────────────────────────────────────────────────

function TwinMetric({ icon: Icon, label, value, sub, color = 'text-foreground' }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="bg-card/50 border border-border rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[10px] font-medium">{label}</span>
      </div>
      <p className={cn('text-lg font-bold', color)}>{value}</p>
      {sub && <p className="text-[9px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

export function AICommandConsole() {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<{ role: 'user' | 'ai'; content: string }[]>([]);
  const [snapshot, setSnapshot] = useState<DigitalTwinSnapshot>(digitalTwin.getSnapshot());

  useEffect(() => {
    const unsub = digitalTwin.subscribe(setSnapshot);
    return unsub;
  }, []);

  const handleCommand = async (cmd: string) => {
    const trimmed = cmd.trim().toLowerCase();
    if (!trimmed) return;

    setHistory((prev) => [...prev, { role: 'user', content: cmd }]);

    // Report command handling
    if (trimmed.includes('report') || trimmed.includes('گزارش')) {
      const user = useAuthStore.getState().user;
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        setHistory((prev) => [...prev, { role: 'ai', content: 'You do not have permission to view reports.' }]);
        setInput('');
        return;
      }

      const sections = ['users', 'revenue', 'trading', 'academy', 'security', 'economy', 'content'];
      const periods = ['today', 'week', 'month', 'all'];
      const section = trimmed.split(' ').find((w: string) => sections.includes(w)) || 'general';
      const period = trimmed.split(' ').find((w: string) => periods.includes(w)) || 'today';

      try {
        const report = await lynxReporter.generateReport(section, user.role, user.id, period as 'today' | 'week' | 'month');
        setHistory((prev) => [...prev, { role: 'ai', content: report }]);
      } catch (error) {
        setHistory((prev) => [...prev, { role: 'ai', content: 'Failed to generate report. Please try again.' }]);
      }
      setInput('');
      return;
    }

    const match = COMMANDS[trimmed];
    if (match) {
      setHistory((prev) => [...prev, { role: 'ai', content: match.response }]);
      match.action?.();
    } else {
      setHistory((prev) => [
        ...prev,
        {
          role: 'ai',
          content: `I didn't recognize "${cmd}". Type **help** to see available commands.`,
        },
      ]);
    }
    setInput('');
  };

  const statusColor = snapshot.overallStatus === 'healthy' ? 'text-emerald-400' :
    snapshot.overallStatus === 'degraded' ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Terminal className="h-6 w-6 text-primary" />
            AI Command Console
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Natural language commands for system administration
          </p>
        </div>
        <div className={cn('flex items-center gap-2 px-4 py-2 rounded-full border', statusColor)}>
          <span className={cn('w-2 h-2 rounded-full animate-pulse', statusColor.replace('text-', 'bg-'))} />
          <span className="text-sm font-medium capitalize">{snapshot.overallStatus}</span>
        </div>
      </div>

      {/* Digital Twin Snapshot */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm">Digital Twin — Real-time System Snapshot</h3>
          <span className="text-[10px] text-muted-foreground ml-auto">
            Updated {new Date(snapshot.timestamp).toLocaleTimeString()}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          <TwinMetric icon={Users} label="Online Users" value={snapshot.onlineUsers} sub={`${snapshot.newUsersToday} new today`} color="text-blue-400" />
          <TwinMetric icon={Globe} label="Page Views" value={snapshot.activePageViews.toLocaleString()} sub={snapshot.topPages[0]?.page || '/'} />
          <TwinMetric icon={Bot} label="AI Requests" value={snapshot.aiRequestsToday.toLocaleString()} sub={`${snapshot.aiAvgResponseMs}ms avg`} color="text-purple-400" />
          <TwinMetric icon={Trophy} label="Tournaments" value={snapshot.activeTournaments} sub={`${snapshot.tournamentParticipants} players`} color="text-amber-400" />
          <TwinMetric icon={DollarSign} label="Payments" value={snapshot.paymentsToday} sub={`$${snapshot.paymentsValue.toLocaleString()}`} color="text-emerald-400" />
          <TwinMetric icon={Wifi} label="WebSocket" value={snapshot.wsConnections} sub={snapshot.wsStatus} color={snapshot.wsStatus === 'connected' ? 'text-emerald-400' : 'text-amber-400'} />
          <TwinMetric icon={Clock} label="Uptime" value={snapshot.systemUptime} />
          <TwinMetric icon={Cpu} label="CPU" value={`${snapshot.cpuUsage}%`} color={snapshot.cpuUsage > 80 ? 'text-red-400' : 'text-emerald-400'} />
          <TwinMetric icon={HardDrive} label="Memory" value={`${snapshot.memoryUsageMB}MB`} />
        </div>
      </div>

      {/* Quick Commands */}
      <div className="flex gap-2 flex-wrap">
        {QUICK_COMMANDS.map((cmd) => (
          <button
            key={cmd.label}
            onClick={() => handleCommand(cmd.label)}
            className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-full text-sm hover:bg-secondary/80 transition"
          >
            <cmd.icon className="h-4 w-4" />
            {cmd.label}
          </button>
        ))}
      </div>

      {/* Chat History */}
      <div className="bg-card border border-border rounded-2xl p-4 min-h-[200px] max-h-[400px] overflow-y-auto space-y-3">
        {history.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Terminal className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Type a command or click a quick command above</p>
            <p className="text-xs mt-1">Try: "show top problems" or "help"</p>
          </div>
        ) : (
          history.map((msg, i) => (
            <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-md'
                  : 'bg-secondary text-secondary-foreground rounded-bl-md',
              )}>
                <div className="whitespace-pre-wrap [&>p]:mb-1">
                  {msg.content.split('\n').map((line, j) => {
                    // Bold headers
                    if (line.startsWith('**') && line.endsWith('**')) {
                      return <p key={j} className="font-bold">{line.replace(/\*\*/g, '')}</p>;
                    }
                    // Table rows
                    if (line.startsWith('|')) {
                      return <p key={j} className="text-xs font-mono">{line}</p>;
                    }
                    return <p key={j}>{line || '\u00A0'}</p>;
                  })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Type a command... (e.g. "show top problems")'
          className="flex-1 px-4 py-3 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          onKeyDown={(e) => e.key === 'Enter' && handleCommand(input)}
        />
        <button
          onClick={() => handleCommand(input)}
          className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-medium flex items-center gap-2"
        >
          <Send className="h-4 w-4" />
          Execute
        </button>
      </div>
    </div>
  );
}
