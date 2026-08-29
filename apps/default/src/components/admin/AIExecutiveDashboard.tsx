/**
 * AIExecutiveDashboard.tsx — Lynx AI Executive Dashboard. 5 tabs.
 */

import React, { useState, useEffect } from 'react';
import {
  Activity, Users, BookOpen, TrendingUp, AlertTriangle,
  CheckCircle2, XCircle, Clock, Shield,
  Globe, DollarSign, BarChart3, PieChart, Smartphone,
  ShieldAlert, LogIn, EyeOff, Coins, GraduationCap, Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { healthMonitor, type SystemHealthReport } from '@/lib/healthMonitor';
import { businessAnalyst, type BusinessReport } from '@/lib/businessAnalyst';
import { securityCenter, type SecurityReport, type SecurityThreat } from '@/lib/securityCenter';
import { economyManager, type EconomyReport } from '@/lib/economyManager';
import { contentManager, type ContentReport } from '@/lib/contentManager';
import { lynxBrain } from '@/lib/brainEngine';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ElementType; color: string }> = {
    healthy: { icon: CheckCircle2, color: 'text-emerald-400 bg-emerald-500/10' },
    degraded: { icon: Clock, color: 'text-amber-400 bg-amber-500/10' },
    down: { icon: XCircle, color: 'text-red-400 bg-red-500/10' },
    active: { icon: AlertTriangle, color: 'text-red-400 bg-red-500/10' },
    resolved: { icon: CheckCircle2, color: 'text-emerald-400 bg-emerald-500/10' },
    balanced: { icon: CheckCircle2, color: 'text-emerald-400 bg-emerald-500/10' },
    too_hard: { icon: XCircle, color: 'text-red-400 bg-red-500/10' },
    too_easy: { icon: Clock, color: 'text-amber-400 bg-amber-500/10' },
  };
  const c = map[status] || { icon: AlertTriangle, color: 'text-slate-400 bg-slate-500/10' };
  const Icon = c.icon;
  return <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', c.color)}><Icon className="h-3 w-3" />{status}</span>;
}

function Card({ icon: Icon, label, value, sub, color = 'text-foreground' }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string;
}) {
  return <div className="bg-card border border-border rounded-2xl p-4 shadow-sm"><div className="flex items-center gap-2 text-muted-foreground mb-2"><Icon className="h-4 w-4" /><span className="text-xs font-medium">{label}</span></div><p className={cn('text-2xl font-bold', color)}>{value}</p>{sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}</div>;
}

export function AIExecutiveDashboard() {
  const [tab, setTab] = useState<'overview' | 'business' | 'security' | 'economy' | 'content'>('overview');
  const [tick, setTick] = useState(0);

  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 10000); return () => clearInterval(id); }, []);

  const report = healthMonitor.getReport();
  const biz = businessAnalyst.getReport();
  const sec = securityCenter.getReport();
  const eco = economyManager.getReport();
  const content = contentManager.getReport();
  const brain = lynxBrain.getBrainSummary();
  const services = Object.values(report.services);

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: Activity },
    { id: 'business' as const, label: 'Business', icon: BarChart3 },
    { id: 'security' as const, label: 'Security', icon: Shield },
    { id: 'economy' as const, label: 'Economy', icon: Coins },
    { id: 'content' as const, label: 'Content', icon: BookOpen },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold flex items-center gap-2"><span className="text-3xl">🦊</span>Lynx AI Admin Center</h1><p className="text-sm text-muted-foreground mt-1">System · Business · Security · Economy · Content</p></div>
        <StatusBadge status={report.overallStatus} />
      </div>

      <div className="flex gap-2 border-b border-border pb-2 overflow-x-auto">
        {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap', tab === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}><t.icon className="h-4 w-4" />{t.label}</button>)}
      </div>

      {/* OVERVIEW */}
      {tab === 'overview' && <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card icon={Activity} label="System Health" value={report.overallStatus === 'healthy' ? '100%' : '85%'} sub={`${services.filter(s => s.status === 'healthy').length}/${services.length} up`} color={report.overallStatus === 'healthy' ? 'text-emerald-400' : 'text-amber-400'} />
          <Card icon={ShieldAlert} label="Risk Score" value={`${sec.riskScore}/100`} color={sec.riskScore > 50 ? 'text-red-400' : sec.riskScore > 25 ? 'text-amber-400' : 'text-emerald-400'} />
          <Card icon={DollarSign} label="Monthly Revenue" value={`$${(biz.salesMetrics.monthlyRevenue / 1000).toFixed(1)}K`} sub={`${biz.salesMetrics.conversionRate}% conv`} />
          <Card icon={TrendingUp} label="Inflation" value={`${eco.inflation.currentRate}%`} sub={eco.inflation.trend} color={eco.inflation.health === 'healthy' ? 'text-emerald-400' : eco.inflation.health === 'warning' ? 'text-amber-400' : 'text-red-400'} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {services.map(svc => <div key={svc.name} className="flex items-center justify-between p-3 bg-card border border-border rounded-xl"><div><p className="text-sm font-medium">{svc.name}</p><p className="text-[10px] text-muted-foreground">{Math.round(svc.latency)}ms · {svc.uptime.toFixed(1)}%</p></div><StatusBadge status={svc.status} /></div>)}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card icon={Users} label="Active Users" value={biz.churnMetrics.activeUsers7d.toLocaleString()} sub={`${biz.churnMetrics.churnRate}% churn`} />
          <Card icon={BookOpen} label="Course Completions" value={`${content.overallStats.overallCompletionRate}%`} sub={`${content.overallStats.totalEnrollments.toLocaleString()} enrolled`} />
          <Card icon={Coins} label="CP Supply" value={`${(eco.cpMetrics.circulatingSupply / 1_000_000).toFixed(1)}M`} sub={`${eco.cpMetrics.netFlow > 0 ? '+' : ''}${eco.cpMetrics.netFlow} today`} />
          <Card icon={Smartphone} label="Mobile Users" value={`${biz.userBehavior.deviceSplit.mobile}%`} />
        </div>
      </>}

      {/* BUSINESS */}
      {tab === 'business' && <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card icon={DollarSign} label="Total Revenue" value={`$${(biz.salesMetrics.totalRevenue / 1000).toFixed(0)}K`} color="text-emerald-400" />
          <Card icon={TrendingUp} label="Conversion" value={`${biz.salesMetrics.conversionRate}%`} sub="Free → Paid" />
          <Card icon={DollarSign} label="ARPU" value={`$${biz.salesMetrics.averageRevenuePerUser}`} />
          <Card icon={PieChart} label="Top Plan" value={biz.salesMetrics.topPlan} />
        </div>
        <h3 className="font-bold text-sm">Country Distribution</h3>
        {biz.countryAnalysis.map(c => <div key={c.country} className="flex items-center gap-3 p-2 bg-card border border-border rounded-xl"><span className="text-sm w-32 truncate">{c.country}</span><div className="flex-1 bg-muted rounded-full h-2"><div className="bg-primary h-2 rounded-full" style={{ width: `${c.percentage}%` }} /></div><span className="text-xs w-14 text-right">{c.percentage}%</span><span className="text-xs font-mono w-20 text-right">${(c.revenue / 1000).toFixed(0)}K</span></div>)}
        <h3 className="font-bold text-sm">Feature Engagement</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">{biz.featureUsage.map(f => <div key={f.feature} className="flex items-center justify-between p-3 bg-card border border-border rounded-xl"><div><p className="text-sm font-medium">{f.feature}</p><p className="text-[10px] text-muted-foreground">{f.uniqueUsers.toLocaleString()} users</p></div><span className="text-sm font-bold">{f.percentage}%</span></div>)}</div>
        {biz.recommendations.length > 0 && <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4"><h3 className="font-bold text-sm mb-2">💡 Recommendations</h3><ul className="space-y-1">{biz.recommendations.map((r, i) => <li key={i} className="text-sm text-muted-foreground">· {r}</li>)}</ul></div>}
      </>}

      {/* SECURITY */}
      {tab === 'security' && <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card icon={ShieldAlert} label="Risk Score" value={`${sec.riskScore}/100`} color={sec.riskScore > 50 ? 'text-red-400' : 'text-emerald-400'} />
          <Card icon={LogIn} label="Logins Today" value={sec.loginAttempts24h.toLocaleString()} sub={`${sec.failedLogins24h} failed`} />
          <Card icon={AlertTriangle} label="Active Threats" value={sec.activeThreats.length} color={sec.activeThreats.length > 0 ? 'text-red-400' : 'text-emerald-400'} />
          <Card icon={EyeOff} label="Blocked IPs" value={sec.blockedIPs.length} />
        </div>
        <h3 className="font-bold text-sm">Active Threats</h3>
        {sec.activeThreats.length === 0 ? <div className="text-center py-8 text-muted-foreground"><CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-400" /><p>All clear</p></div> :
          <div className="space-y-2 max-h-96 overflow-y-auto">{sec.activeThreats.map(t => {
            const sevMap: Record<string, { clr: string; icn: React.ElementType }> = { critical: { clr: 'border-red-500/30 bg-red-500/5', icn: XCircle }, high: { clr: 'border-orange-500/30 bg-orange-500/5', icn: AlertTriangle }, medium: { clr: 'border-amber-500/30 bg-amber-500/5', icn: AlertTriangle }, low: { clr: 'border-blue-500/30 bg-blue-500/5', icn: Activity } };
            const s = sevMap[t.severity] || sevMap.low;
            const I = s.icn;
            return <div key={t.id} className={cn('flex items-start gap-3 p-3 rounded-xl border', s.clr)}><I className="h-4 w-4 mt-0.5" /><div className="flex-1 min-w-0"><p className="text-sm font-medium capitalize">{t.type.replace(/_/g, ' ')}</p><p className="text-xs text-muted-foreground">{t.description}</p></div><StatusBadge status={t.status} /></div>;
          })}</div>
        }
        {sec.recommendations.length > 0 && <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4"><h3 className="font-bold text-sm mb-2">🛡️ Recommendations</h3><ul className="space-y-1">{sec.recommendations.map((r, i) => <li key={i} className="text-sm text-muted-foreground">· {r}</li>)}</ul></div>}
      </>}

      {/* ECONOMY */}
      {tab === 'economy' && <>
        <h3 className="font-bold text-sm">CP Token Metrics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card icon={Coins} label="Total Supply" value={`${(eco.cpMetrics.totalSupply / 1_000_000).toFixed(1)}M`} />
          <Card icon={Activity} label="Circulating" value={`${(eco.cpMetrics.circulatingSupply / 1_000_000).toFixed(1)}M`} sub={`${eco.cpMetrics.locked.toLocaleString()} locked`} />
          <Card icon={TrendingUp} label="Minted Today" value={`+${eco.cpMetrics.mintedToday.toLocaleString()}`} color="text-emerald-400" />
          <Card icon={TrendingUp} label="Burned Today" value={`-${eco.cpMetrics.burnedToday.toLocaleString()}`} color="text-red-400" />
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <h3 className="font-bold text-sm mb-3">Inflation Analysis</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card icon={TrendingUp} label="Current Rate" value={`${eco.inflation.currentRate}%`} color={eco.inflation.health === 'healthy' ? 'text-emerald-400' : eco.inflation.health === 'warning' ? 'text-amber-400' : 'text-red-400'} />
            <Card icon={Activity} label="Trend" value={eco.inflation.trend} />
            <Card icon={Target} label="Projected (30d)" value={`${eco.inflation.projectedRate30d}%`} />
            <Card icon={CheckCircle2} label="Health" value={eco.inflation.health} color={eco.inflation.health === 'healthy' ? 'text-emerald-400' : 'text-amber-400'} />
          </div>
          <p className="text-xs text-muted-foreground mt-2">Factors: {eco.inflation.factors.join(' · ')}</p>
        </div>
        <h3 className="font-bold text-sm">Pricing Suggestions</h3>
        <div className="space-y-2">{eco.pricingSuggestions.map((p, i) => <div key={i} className="p-3 bg-card border border-border rounded-xl"><div className="flex items-center justify-between"><p className="text-sm font-medium">{p.item}</p><span className={cn('text-xs font-bold', p.changePercent > 10 ? 'text-red-400' : 'text-amber-400')}>{p.changePercent > 0 ? '+' : ''}{p.changePercent}%</span></div><p className="text-xs text-muted-foreground">{p.currentPrice} → {p.suggestedPrice} | {p.reason}</p></div>)}</div>
        {eco.recommendations.length > 0 && <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4"><h3 className="font-bold text-sm mb-2">💡 Recommendations</h3><ul className="space-y-1">{eco.recommendations.map((r, i) => <li key={i} className="text-sm text-muted-foreground">· {r}</li>)}</ul></div>}
      </>}

      {/* CONTENT */}
      {tab === 'content' && <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card icon={BookOpen} label="Courses" value={content.overallStats.totalCourses} />
          <Card icon={Users} label="Total Enrollments" value={content.overallStats.totalEnrollments.toLocaleString()} />
          <Card icon={GraduationCap} label="Completion Rate" value={`${content.overallStats.overallCompletionRate}%`} color={content.overallStats.overallCompletionRate < 60 ? 'text-red-400' : 'text-emerald-400'} />
          <Card icon={Target} label="Avg Quiz Pass" value={`${content.overallStats.averageQuizPassRate}%`} color={content.overallStats.averageQuizPassRate < 60 ? 'text-red-400' : 'text-emerald-400'} />
        </div>
        <h3 className="font-bold text-sm">Course Performance</h3>
        <div className="space-y-2">{content.courses.map(c => <div key={c.courseId} className="p-3 bg-card border border-border rounded-xl"><div className="flex items-center justify-between"><p className="text-sm font-medium">{c.name}</p><span className={cn('text-xs font-bold', c.completionRate > 60 ? 'text-emerald-400' : 'text-red-400')}>{c.completionRate}%</span></div><div className="flex gap-4 mt-2 text-xs text-muted-foreground"><span>{c.averageScore}% avg</span><span>{c.averageTimeMinutes} min</span><span>{c.enrollments.toLocaleString()} enrolled</span></div>{c.dropOffPoints.length > 0 && <p className="text-[10px] text-red-400 mt-1">Drop-offs: {c.dropOffPoints.map(d => `${d.section}(${d.dropRate}%)`).join(', ')}</p>}</div>)}</div>
        <h3 className="font-bold text-sm">Quiz Difficulty</h3>
        {content.quizzes.map(q => <div key={q.quizId} className="flex items-center justify-between p-3 bg-card border border-border rounded-xl"><div><p className="text-sm font-medium">{q.quizId}</p><p className="text-xs text-muted-foreground">Pass: {q.passRate}% · Avg: {q.averageScore}%</p></div><StatusBadge status={q.difficulty} /></div>)}
        <h3 className="font-bold text-sm">Content Suggestions</h3>
        <div className="space-y-2">{content.suggestions.map((s, i) => <div key={i} className={cn('p-3 rounded-xl border', s.priority === 'high' ? 'border-red-500/30 bg-red-500/5' : s.priority === 'medium' ? 'border-amber-500/30 bg-amber-500/5' : 'border-blue-500/30 bg-blue-500/5')}><p className="text-sm font-medium">{s.target}</p><p className="text-xs text-muted-foreground">{s.issue}</p><p className="text-xs mt-1">→ {s.recommendation}</p></div>)}</div>
      </>}

      <div className="text-center text-[10px] text-muted-foreground pt-2 border-t border-border">
        Lynx AI Operating System · Auto-refreshes every 10 seconds
      </div>
    </div>
  );
}
