/**
 * AIInsightsPanel.tsx — AI-powered on-chain insights
 * Analyzes recent whale activity and provides summary recommendations.
 */
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, TrendingUp, TrendingDown, AlertCircle, Lightbulb } from 'lucide-react';
import { useOnChainStore } from '../../lib/onChainStore';
import { fmtUsd, timeAgo, CHAIN_DISPLAY } from './onChainUtils';
import { WHALE_TIER_META } from '../../lib/onChainTypes';

interface Props {
  userId: string;
}

export function AIInsightsPanel({ userId }: Props) {
  const events = useOnChainStore(s => s.events);

  const insights = useMemo(() => {
    const userEvents = Object.values(events)
      .filter(e => e.userId === userId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 20);

    if (userEvents.length === 0) {
      return {
        summary: 'No on-chain data collected yet. Set up alerts to start receiving whale activity insights.',
        signals: [] as { icon: string; text: string; color: string }[],
        recommendation: 'Start by creating a whale alert for Ethereum or Bitcoin to begin tracking on-chain activity.',
      };
    }

    // Analyze recent events
    const megaCount = userEvents.filter(e => e.whaleTier === 'mega' || e.whaleTier === 'whale').length;
    const totalVolume = userEvents.reduce((s, e) => s + e.value, 0);
    const chains = [...new Set(userEvents.map(e => e.chain))];
    const avgSignificance = userEvents.length > 0
      ? userEvents.reduce((s, e) => s + e.significance, 0) / userEvents.length
      : 0;

    const signals: { icon: string; text: string; color: string }[] = [];

    if (megaCount >= 3) {
      signals.push({ icon: '🐋', text: `${megaCount} large whale movements detected recently`, color: '#a78bfa' });
    }
    if (totalVolume > 50_000_000) {
      signals.push({ icon: '📊', text: `High on-chain volume: ${fmtUsd(totalVolume)} tracked`, color: '#60a5fa' });
    }
    if (avgSignificance >= 0.7) {
      signals.push({ icon: '🎯', text: `High significance alerts (${Math.round(avgSignificance * 100)}% avg)`, color: '#34d399' });
    }
    if (chains.length >= 3) {
      signals.push({ icon: '⛓️', text: `Activity across ${chains.length} chains`, color: '#fbbf24' });
    }

    if (signals.length === 0) {
      signals.push({ icon: '👀', text: 'Monitoring for significant whale activity', color: '#6b7280' });
    }

    const recommendation = totalVolume > 100_000_000
      ? 'High whale activity detected. Consider reviewing exchange flows for confirmation before making trading decisions.'
      : megaCount > 0
        ? 'Whale activity is moderate. Track smart money wallets to identify potential accumulation patterns.'
        : 'Set up additional whale alerts across more chains to increase signal coverage.';

    return {
      summary: `AI analyzed ${userEvents.length} recent on-chain events totaling ${fmtUsd(totalVolume)} in volume across ${chains.length} chain(s).`,
      signals,
      recommendation,
    };
  }, [events, userId]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-5"
      style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.06))',
        border: '1px solid rgba(99,102,241,0.2)',
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-indigo-400" />
        <h3 className="font-bold text-sm text-foreground">🤖 AI On-Chain Insights</h3>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 ml-auto">
          Updated live
        </span>
      </div>

      {/* Summary */}
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">
        {insights.summary}
      </p>

      {/* Signals */}
      {insights.signals.length > 0 && (
        <div className="space-y-2 mb-4">
          {insights.signals.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="text-lg">{s.icon}</span>
              <span className="text-foreground">{s.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recommendation */}
      <div className="flex items-start gap-2 p-3 rounded-xl"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
        <Lightbulb className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">{insights.recommendation}</p>
      </div>
    </motion.div>
  );
}

export default AIInsightsPanel;
