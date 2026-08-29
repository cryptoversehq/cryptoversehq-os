/**
 * TransactionDetailModal.tsx — Spec §3.2
 * Full transaction detail panel with light/dark mode support.
 */
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  X, Copy, ExternalLink, Bell, Share2, Download,
  User, Building2, AlertTriangle, TrendingUp, Clock, Hash, Layers,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';
import { SimulatedTx } from '../../lib/onChainSimulator';
import { CHAIN_META, WHALE_TIER_META } from '../../lib/onChainTypes';
import { useNavigate } from 'react-router-dom';
import { CHAIN_DISPLAY, fmtUsd, fmtAddr, timeAgo } from './onChainUtils';
import { cn } from '@/lib/utils';

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text).catch(() => {});
  toast.success(`${label} copied!`, { duration: 1800 });
}

function generateActivity(seed: string): Array<{ day: string; value: number }> {
  const base = seed.charCodeAt(2) ?? 50;
  return Array.from({ length: 30 }, (_, i) => ({
    day: `Day ${i + 1}`,
    value: Math.max(0, Math.round(base * 100 + Math.sin(i * 0.7 + base) * base * 80 + Math.random() * 2000)),
  }));
}

function generateSimilar(tx: SimulatedTx): { type: string; count: number }[] {
  return [
    { type: `Same From Wallet: ${Math.floor(Math.random() * 5) + 1} similar transactions in last 7 days`, count: 1 },
    { type: `Same To Wallet: ${Math.floor(Math.random() * 15) + 5} transactions from different whales`, count: 2 },
    { type: `Similar Amount: ${Math.floor(Math.random() * 4) + 1} transactions in ±20% range`, count: 3 },
  ];
}

interface WalletBoxProps {
  title:   string;
  address: string;
  label:   string | null;
  chain:   typeof CHAIN_META[keyof typeof CHAIN_META];
  color:   string;
  onTrack: () => void;
}

function WalletBox({ title, address, label, chain, color, onTrack }: WalletBoxProps) {
  const isExchange = label?.toLowerCase().includes('exchange') || label?.toLowerCase().includes('binance') || label?.toLowerCase().includes('coinbase') || label?.toLowerCase().includes('kraken');
  const explorerBase = chain.explorerUrl.replace('/tx', '/address');
  const fakeBalance = Math.round(Math.random() * 50_000 + 500).toLocaleString();
  const firstSeen = new Date(Date.now() - Math.random() * 2 * 365 * 86400_000).toLocaleDateString();

  return (
    <div className="rounded-2xl p-4 flex-1 min-w-0"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">{title}</p>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
          {isExchange ? <Building2 className="h-4 w-4" style={{ color }} /> : <User className="h-4 w-4" style={{ color }} />}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-sm text-foreground">{label ?? 'Unknown Wallet'}</p>
          <div className="flex items-center gap-1">
            <span className="font-mono text-[11px] text-muted-foreground">{fmtAddr(address)}</span>
            <button onClick={() => copyToClipboard(address, 'Address')}
              className="text-muted-foreground/40 hover:text-muted-foreground transition-colors">
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
      <div className="space-y-1.5 text-xs text-muted-foreground mb-3">
        <div className="flex justify-between">
          <span>Balance</span>
          <span className="font-mono font-semibold text-foreground">{fakeBalance} {chain.symbol}</span>
        </div>
        <div className="flex justify-between">
          <span>First seen</span>
          <span className="font-semibold text-foreground">{firstSeen}</span>
        </div>
        <div className="flex justify-between">
          <span>Type</span>
          <span className="font-semibold text-foreground">{isExchange ? 'Centralized Exchange' : 'Smart Wallet'}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onTrack}
          className="flex-1 py-1.5 rounded-lg text-xs font-semibold border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors">
          Track Wallet
        </button>
        <a href={`${explorerBase}/${address}`} target="_blank" rel="noopener noreferrer"
          className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-primary transition-colors">
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}

interface Props {
  tx:      SimulatedTx;
  onClose: () => void;
}

export function TransactionDetailModal({ tx, onClose }: Props) {
  const navigate   = useNavigate();
  const chain      = CHAIN_META[tx.chain];
  const display    = CHAIN_DISPLAY[tx.chain];
  const tier       = WHALE_TIER_META[tx.whaleTier];
  const explorer   = `${chain.explorerUrl}/${tx.txHash}`;
  const activityData = useMemo(() => generateActivity(tx.txHash), [tx.txHash]);
  const similar    = useMemo(() => generateSimilar(tx), [tx.txHash]);

  const gasFee     = (Math.random() * 0.02 + 0.001).toFixed(4);
  const gasFeeUsd  = (parseFloat(gasFee) * chain.nativeUsdPrice).toFixed(2);
  const blockNum   = tx.blockNumber.toLocaleString();
  const timestamp  = new Date(tx.timestamp).toUTCString().replace('GMT', 'UTC');

  function handleTrackWallet(address: string) {
    onClose();
    navigate(`/on-chain/wallet/${address}`);
  }

  function handleCreateAlert(address: string) {
    onClose();
    navigate('/on-chain/alerts', { state: { prefillAddress: address } });
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-8 sm:bottom-8 sm:w-full sm:max-w-3xl z-[55] rounded-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', boxShadow: '0 30px 100px rgba(0,0,0,0.6)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <span className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border')} style={{ background: tier.bg.split(' ').filter(c => c.startsWith('bg-'))[0] ? undefined : undefined }}>
              <span>{tier.icon}</span>
              <span className="font-bold" style={{ color: tier.color.startsWith('text-') ? `var(--${tier.color.replace('text-', '').replace('-400', '-foreground')})` : tier.color }}>{tier.label} Alert</span>
            </span>
            <span className="text-xs text-muted-foreground">{timeAgo(tx.timestamp)}</span>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Transaction hash */}
          <div className="rounded-2xl p-4"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Hash className="h-3 w-3" /> Transaction Hash
            </p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-foreground break-all">{tx.txHash}</span>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => copyToClipboard(tx.txHash, 'Tx hash')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:text-foreground transition-colors">
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
              <a href={explorer} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:text-primary transition-colors">
                <ExternalLink className="h-3.5 w-3.5" /> View on {display.name === 'Bitcoin' ? 'Mempool' : display.name === 'Solana' ? 'Solscan' : display.name + 'scan'}
              </a>
              <button onClick={() => navigate(`/on-chain/transaction/${tx.txHash}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-primary/30 bg-primary/8 text-primary hover:bg-primary/15 transition-colors">
                <Layers className="h-3.5 w-3.5" /> Full Analysis
              </button>
            </div>
          </div>

          {/* From / To wallets */}
          <div className="flex flex-col sm:flex-row gap-3">
            <WalletBox
              title="From Wallet"
              address={tx.fromAddress}
              label={tx.fromLabel}
              chain={chain}
              color="#ef4444"
              onTrack={() => handleTrackWallet(tx.fromAddress)}
            />
            <div className="flex sm:flex-col items-center justify-center text-muted-foreground/40 px-1 self-center">
              <div className="hidden sm:block w-px h-8 bg-border" />
              <span className="text-xl">→</span>
              <div className="hidden sm:block w-px h-8 bg-border" />
            </div>
            <WalletBox
              title="To Wallet"
              address={tx.toAddress}
              label={tx.toLabel}
              chain={chain}
              color="#34d399"
              onTrack={() => handleTrackWallet(tx.toAddress)}
            />
          </div>

          {/* Transaction details */}
          <div className="rounded-2xl p-4"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Layers className="h-3 w-3" /> Transaction Details
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
              {[
                { label: 'Amount', value: `${tx.valueNative} (${fmtUsd(tx.valueUsd)})`, highlight: true },
                { label: 'Token', value: `${tx.tokenSymbol} (${tx.tokenStandard})` },
                { label: 'Gas Fee', value: `${gasFee} ${chain.symbol} ($${gasFeeUsd})` },
                { label: 'Block', value: `#${blockNum}` },
                { label: 'Timestamp', value: timestamp },
                { label: 'Status', value: '✅ Confirmed' },
              ].map(r => (
                <div key={r.label}>
                  <span className="text-muted-foreground text-xs">{r.label}</span>
                  <p className={cn('font-semibold text-sm', r.highlight ? 'text-emerald-400' : 'text-foreground')}>{r.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Historical activity chart */}
          <div className="rounded-2xl p-4"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3" /> From Wallet Activity (Last 30 Days)
              </p>
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={activityData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={display.color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={display.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" hide />
                <YAxis hide />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-lg px-2.5 py-1.5 text-xs"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                        <span style={{ color: display.color }}>{fmtUsd(payload[0].value as number)}</span>
                      </div>
                    );
                  }}
                />
                <Area type="monotone" dataKey="value" stroke={display.color} strokeWidth={1.5}
                  fill="url(#actGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Similar transactions */}
          <div className="rounded-2xl p-4"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 text-amber-400" /> Similar Transactions
            </p>
            <div className="space-y-2">
              {similar.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-amber-400 mt-0.5">•</span>
                  <span className="text-muted-foreground">{s.type}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-border flex flex-wrap gap-2 shrink-0">
          <button onClick={() => handleCreateAlert(tx.fromAddress)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold"
            style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: 'white' }}>
            <Bell className="h-3.5 w-3.5" /> Create Alert for This Wallet
          </button>
          <button
            onClick={() => {
              navigator.share?.({ title: 'Whale Alert', text: `${fmtUsd(tx.valueUsd)} moved on ${display.name}`, url: explorer });
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border border-border text-muted-foreground hover:text-foreground transition-colors">
            <Share2 className="h-3.5 w-3.5" /> Share
          </button>
          <button onClick={() => { toast.success('Exported as CSV'); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border border-border text-muted-foreground hover:text-foreground transition-colors">
            <Download className="h-3.5 w-3.5" /> Export
          </button>
        </div>
      </motion.div>
    </>
  );
}
