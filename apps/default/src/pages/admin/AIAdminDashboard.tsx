/**
 * AIAdminDashboard.tsx - Unified Lynx AI Intelligence Hub.
 */

import React, { useState, useEffect } from 'react';
import {
  Activity, Users, BookOpen, TrendingUp, AlertTriangle,
  CheckCircle2, XCircle, Clock, Shield, BarChart3,
  Globe, DollarSign, PieChart, Smartphone, Coins,
  ShieldAlert, LogIn, EyeOff, GraduationCap, Target,
  Terminal, Zap, Bot, Trophy, Wifi, Cpu, HardDrive, Send, Brain, Server,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { healthMonitor, type SystemHealthReport } from '@/lib/healthMonitor';
import { businessAnalyst, type BusinessReport } from '@/lib/businessAnalyst';
import { securityCenter, type SecurityReport } from '@/lib/securityCenter';
import { economyManager, type EconomyReport } from '@/lib/economyManager';
import { contentManager, type ContentReport } from '@/lib/contentManager';
import { digitalTwin, type DigitalTwinSnapshot } from '@/lib/digitalTwin';
import { lynxBrain } from '@/lib/brainEngine';

function Card({ icon: Icon, label, value, sub, color }: any) {
  return <div className="bg-card border border-border rounded-2xl p-4 shadow-sm"><div className="flex items-center gap-2 text-muted-foreground mb-2"><Icon className="h-4 w-4" /><span className="text-xs font-medium">{label}</span></div><p className={cn('text-2xl font-bold', color || 'text-foreground')}>{value}</p>{sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}</div>;
}

function ActiveThreatsList({ threats }: { threats: any[] }) {
  return (
    <div className="space-y-2">
      {threats.map((t) => {
        const isCrit = t.severity === 'critical';
        const rowCls = isCrit
          ? 'p-3 rounded-xl border border-red-500/30 bg-red-500/5'
          : 'p-3 rounded-xl border border-amber-500/30 bg-amber-500/5';
        return (
          <div key={t.id} className={rowCls}>
            <p className="text-sm font-medium capitalize">{t.type.split('_').join(' ')}</p>
            <p className="text-xs text-muted-foreground">{t.description}</p>
          </div>
        );
      })}
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const m: any = { healthy: { I: CheckCircle2, c: 'text-emerald-400 bg-emerald-500/10' }, degraded: { I: Clock, c: 'text-amber-400 bg-amber-500/10' }, down: { I: XCircle, c: 'text-red-400 bg-red-500/10' } };
  const b = m[status] || { I: AlertTriangle, c: 'text-slate-400 bg-slate-500/10' };
  return <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', b.c)}><b.I className="h-3 w-3" />{status}</span>;
}

export function AIAdminDashboard() {
  const health = healthMonitor.getReport();
  const biz = businessAnalyst.getReport();
  const sec = securityCenter.getReport();
  const eco = economyManager.getReport();
  const content = contentManager.getReport();
  const [twin, setTwin] = useState<DigitalTwinSnapshot>(digitalTwin.getSnapshot());
  const [cmdInput, setCmdInput] = useState('');
  const [cmdHistory, setCmdHistory] = useState<any[]>([]);
  const [tab, setTab] = useState<string>('overview');
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((t: number) => t + 1), 10000);
    const u = digitalTwin.subscribe(setTwin);
    return () => { clearInterval(id); u(); };
  }, []);

  const handleCmd = (cmd: string) => {
    const t = cmd.trim();
    if (!t) return;
    setCmdHistory((p: any[]) => [...p, { role: 'user', content: t }]);
    const resps: any = {
      'show top problems': 'Top Issues Today:\n- Security: suspicious logins detected\n- Churn: 8.2% above threshold\n- Content: DeFi Mastery at 40%\n- Inflation trending upward',
      'system health': 'System running normally. All services up.',
      'compare this month with last month': 'MoM: Revenue +13%, Users +14.5%, Active +10.5%, Churn -0.9%',
    };
    setTimeout(() => setCmdHistory((p: any[]) => [...p, { role: 'ai', content: resps[t.toLowerCase()] || 'Command not recognized.' }]), 200);
    setCmdInput('');
  };

  const brain = lynxBrain.getBrainSummary();
  const svcs = Object.values(health.services);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'business', label: 'Business', icon: BarChart3 },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'economy', label: 'Economy', icon: Coins },
    { id: 'content', label: 'Content', icon: BookOpen },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold flex items-center gap-3"><span className="text-4xl">🦊</span>Lynx AI Intelligence Center</h1><p className="text-sm text-muted-foreground mt-1">System oversight · Analytics · Security · AI insights</p></div>
        <Badge status={health.overallStatus} />
      </div>

      {/* Digital Twin */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3"><Zap className="h-4 w-4 text-primary" /><h3 className="font-bold text-sm">Digital Twin — Live</h3><span className="text-[10px] text-muted-foreground ml-auto">Every 5s</span></div>
        <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-9 gap-2">
          <Card icon={Users} label="Online" value={twin.onlineUsers} color="text-blue-400" />
          <Card icon={Globe} label="Pages" value={twin.activePageViews.toLocaleString()} />
          <Card icon={Bot} label="AI" value={twin.aiRequestsToday.toLocaleString()} sub={`${twin.aiAvgResponseMs}ms`} color="text-purple-400" />
          <Card icon={Trophy} label="Tournaments" value={twin.activeTournaments} color="text-amber-400" />
          <Card icon={DollarSign} label="Payments" value={twin.paymentsToday} sub={`$${twin.paymentsValue.toLocaleString()}`} color="text-emerald-400" />
          <Card icon={Wifi} label="WS" value={twin.wsConnections} />
          <Card icon={Clock} label="Uptime" value={twin.systemUptime} />
          <Card icon={Cpu} label="CPU" value={`${twin.cpuUsage}%`} />
          <Card icon={HardDrive} label="Mem" value={`${twin.memoryUsageMB}MB`} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-2 overflow-x-auto">
        {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap', tab === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}><t.icon className="h-4 w-4" />{t.label}</button>)}
      </div>

      {tab === 'overview' && <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card icon={Activity} label="Health" value={health.overallStatus === 'healthy' ? '100%' : '85%'} sub={`${svcs.filter((s: any) => s.status === 'healthy').length}/${svcs.length}`} color={health.overallStatus === 'healthy' ? 'text-emerald-400' : 'text-amber-400'} />
          <Card icon={ShieldAlert} label="Risk" value={`${sec.riskScore}/100`} color={sec.riskScore > 50 ? 'text-red-400' : 'text-emerald-400'} />
          <Card icon={DollarSign} label="Revenue" value={`$${(biz.salesMetrics.monthlyRevenue / 1000).toFixed(1)}K`} sub={`${biz.salesMetrics.conversionRate}% conv`} />
          <Card icon={TrendingUp} label="Inflation" value={`${eco.inflation.currentRate}%`} color={eco.inflation.health === 'healthy' ? 'text-emerald-400' : 'text-amber-400'} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Server className="h-4 w-4" />Services</h3>{svcs.map((s: any) => <div key={s.name} className="flex items-center justify-between p-2 bg-card border border-border rounded-xl mb-1"><span className="text-xs">{s.name}</span><span className="text-[10px] text-muted-foreground">{Math.round(s.latency)}ms</span><Badge status={s.status} /></div>)}</div>
          <div className="bg-card border border-border rounded-2xl p-4"><h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Brain className="h-4 w-4 text-primary" />Brain</h3><pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">{brain}</pre></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card icon={Users} label="Active Users" value={biz.churnMetrics.activeUsers7d.toLocaleString()} sub={`${biz.churnMetrics.churnRate}% churn`} />
          <Card icon={BookOpen} label="Completion" value={`${content.overallStats.overallCompletionRate}%`} />
          <Card icon={Coins} label="CP Supply" value={`${(eco.cpMetrics.circulatingSupply / 1_000_000).toFixed(1)}M`} />
          <Card icon={Smartphone} label="Mobile" value={`${biz.userBehavior.deviceSplit.mobile}%`} />
        </div>
      </>}

      {tab === 'business' && <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card icon={DollarSign} label="Revenue" value={`$${(biz.salesMetrics.totalRevenue / 1000).toFixed(0)}K`} color="text-emerald-400" />
          <Card icon={TrendingUp} label="Conversion" value={`${biz.salesMetrics.conversionRate}%`} />
          <Card icon={DollarSign} label="ARPU" value={`$${biz.salesMetrics.averageRevenuePerUser}`} />
          <Card icon={PieChart} label="Top Plan" value={biz.salesMetrics.topPlan.replace('_', ' ')} />
        </div>
        <h3 className="font-bold text-sm">Countries</h3>
        {biz.countryAnalysis.map((c: any) => <div key={c.country} className="flex items-center gap-3 p-2 bg-card border border-border rounded-xl"><span className="text-sm w-32 truncate">{c.country}</span><div className="flex-1 bg-muted rounded-full h-2"><div className="bg-primary h-2 rounded-full" style={{ width: `${c.percentage}%` }} /></div><span className="text-xs w-14 text-right">{c.percentage}%</span><span className="text-xs font-mono w-20 text-right">${(c.revenue / 1000).toFixed(0)}K</span></div>)}
        <h3 className="font-bold text-sm">Features</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">{biz.featureUsage.map((f: any) => <div key={f.feature} className="flex items-center justify-between p-3 bg-card border border-border rounded-xl"><span className="text-sm">{f.feature}</span><span className="text-sm font-bold">{f.percentage}%</span></div>)}</div>
      </>}

      {tab === 'security' && <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card icon={ShieldAlert} label="Risk Score" value={`${sec.riskScore}/100`} color={sec.riskScore > 50 ? 'text-red-400' : 'text-emerald-400'} />
          <Card icon={LogIn} label="Logins" value={sec.loginAttempts24h.toLocaleString()} sub={`${sec.failedLogins24h} failed`} />
          <Card icon={AlertTriangle} label="Threats" value={sec.activeThreats.length} color={sec.activeThreats.length > 0 ? 'text-red-400' : 'text-emerald-400'} />
          <Card icon={EyeOff} label="Blocked IPs" value={sec.blockedIPs.length} />
        </div>
        <h3 className="font-bold text-sm">Active Threats</h3>
        {sec.activeThreats.length === 0
          ? <div className="text-center py-4 text-muted-foreground"><CheckCircle2 className="h-6 w-6 mx-auto mb-1 text-emerald-400" /><p className="text-sm">All clear</p></div>
          : <ActiveThreatsList threats={sec.activeThreats} />
        }
      </>}

      {tab === 'economy' && <>
        <h3 className="font-bold text-sm">CP Token Metrics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card icon={Coins} label="Total Supply" value={`${(eco.cpMetrics.totalSupply / 1_000_000).toFixed(1)}M`} />
          <Card icon={Activity} label="Circulating" value={`${(eco.cpMetrics.circulatingSupply / 1_000_000).toFixed(1)}M`} sub={`${eco.cpMetrics.locked.toLocaleString()} locked`} />
          <Card icon={TrendingUp} label="Minted" value={`+${eco.cpMetrics.mintedToday.toLocaleString()}`} color="text-emerald-400" />
          <Card icon={TrendingUp} label="Burned" value={`-${eco.cpMetrics.burnedToday.toLocaleString()}`} color="text-red-400" />
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 mt-3">
          <h3 className="font-bold text-sm mb-3">Inflation</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card icon={TrendingUp} label="Rate" value={`${eco.inflation.currentRate}%`} color={eco.inflation.health === 'healthy' ? 'text-emerald-400' : 'text-amber-400'} />
            <Card icon={Activity} label="Trend" value={eco.inflation.trend} />
            <Card icon={Target} label="30d" value={`${eco.inflation.projectedRate30d}%`} />
            <Card icon={CheckCircle2} label="Health" value={eco.inflation.health} />
          </div>
        </div>
      </>}

      {tab === 'content' && <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card icon={BookOpen} label="Courses" value={content.overallStats.totalCourses} />
          <Card icon={Users} label="Enrollments" value={content.overallStats.totalEnrollments.toLocaleString()} />
          <Card icon={GraduationCap} label="Completion" value={`${content.overallStats.overallCompletionRate}%`} color={content.overallStats.overallCompletionRate < 60 ? 'text-red-400' : 'text-emerald-400'} />
          <Card icon={Target} label="Quiz Pass" value={`${content.overallStats.averageQuizPassRate}%`} />
        </div>
        <h3 className="font-bold text-sm mt-3">Courses</h3>
        <div className="space-y-2">{content.courses.map((c: any) => <div key={c.courseId} className="p-3 bg-card border border-border rounded-xl"><div className="flex items-center justify-between"><span className="text-sm font-medium">{c.name}</span><span className={cn('text-xs font-bold', c.completionRate > 60 ? 'text-emerald-400' : 'text-red-400')}>{c.completionRate}%</span></div><div className="flex gap-3 text-xs text-muted-foreground mt-1"><span>{c.averageScore}% avg</span><span>{c.averageTimeMinutes} min</span><span>{c.enrollments.toLocaleString()} enrolled</span></div></div>)}</div>
      </>}

      {/* Command Console */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3"><Terminal className="h-4 w-4 text-primary" /><h3 className="font-bold text-sm">AI Command Console</h3></div>
        <div className="flex gap-2 mb-3 flex-wrap">
          {['show top problems', 'system health', 'compare this month with last month'].map((c: string) => <button key={c} onClick={() => handleCmd(c)} className="px-3 py-1.5 bg-secondary rounded-full text-xs hover:bg-secondary/80">{c}</button>)}
        </div>
        <div className="flex gap-2">
          <input type="text" value={cmdInput} onChange={(e: any) => setCmdInput(e.target.value)} placeholder='Type a command...' className="flex-1 px-3 py-2 bg-secondary/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" onKeyDown={(e: any) => e.key === 'Enter' && handleCmd(cmdInput)} />
          <button onClick={() => handleCmd(cmdInput)} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium flex items-center gap-1"><Send className="h-3 w-3" />Run</button>
        </div>
        {cmdHistory.length > 0 && <div className="space-y-2 mt-3 max-h-40 overflow-y-auto">{cmdHistory.map((m: any, i: number) => <div key={i} className={cn('p-2 rounded-lg text-sm', m.role === 'user' ? 'bg-primary/10 text-primary ml-8' : 'bg-secondary/50')}><div className="whitespace-pre-wrap text-xs">{m.content}</div></div>)}</div>}
      </div>
    </div>
  );
}
