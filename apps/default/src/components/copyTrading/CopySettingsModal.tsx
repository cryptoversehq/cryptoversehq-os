/**
 * CopySettingsModal.tsx
 * Full copy settings configuration — used both to START copying and to ADJUST settings.
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Settings2, TrendingUp, Shield, Filter, Bell, Calculator, CheckCircle, Loader2 } from 'lucide-react';
import { TopTrader } from '../../lib/copyTradingTypes';
import { CopySettings, DEFAULT_COPY_SETTINGS } from '../../lib/copyTradingTypes';
import { useCopyTradingStore } from '../../lib/copyTradingStore';
import { CTV, fmtPct, fmtUsd } from './CopyTradingUtils';
import { BottomSheet } from '../marketplace/BottomSheet';

interface Props {
  trader: TopTrader;
  existingRelId?: string;          // if set → "Adjust" mode, else → "Start" mode
  initialSettings?: Partial<CopySettings>;
  followerId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const PCT_PRESETS = [25, 50, 75, 100];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <p className="text-xs font-semibold min-w-[160px] shrink-0" style={{ color: CTV.gray }}>{label}</p>
      {children}
    </div>
  );
}

function NumberInput({ value, onChange, prefix, suffix, placeholder }: {
  value: number; onChange: (v: number) => void; prefix?: string; suffix?: string; placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-1 rounded-xl overflow-hidden"
      style={{ background: CTV.surface, border: `1px solid ${CTV.border}` }}>
      {prefix && <span className="px-2 text-xs" style={{ color: CTV.gray }}>{prefix}</span>}
      <input
        type="number"
        value={value || ''}
        placeholder={placeholder ?? '0'}
        onChange={e => onChange(+e.target.value || 0)}
        className="flex-1 bg-transparent py-2 px-2 text-sm focus:outline-none text-foreground min-w-0"
        style={{ minWidth: 60 }}
      />
      {suffix && <span className="px-2 text-xs" style={{ color: CTV.gray }}>{suffix}</span>}
    </div>
  );
}

function CheckRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <div onClick={() => onChange(!checked)}
        className="w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all"
        style={{ background: checked ? CTV.gold : 'transparent', borderColor: checked ? CTV.gold : CTV.border }}>
        {checked && <CheckCircle className="h-3 w-3 text-[#0A1929]" strokeWidth={3} />}
      </div>
      <span className="text-xs text-foreground">{label}</span>
    </label>
  );
}

export function CopySettingsModal({ trader, existingRelId, initialSettings, followerId, onClose, onSuccess }: Props) {
  const startCopying  = useCopyTradingStore(s => s.startCopying);
  const updateSettings = useCopyTradingStore(s => s.updateSettings);

  const [s, setS] = useState<CopySettings>({ ...DEFAULT_COPY_SETTINGS, ...initialSettings });
  const [phase, setPhase] = useState<'form' | 'saving' | 'done'>('form');
  const [customPct, setCustomPct] = useState(false);

  const isAdjust = !!existingRelId;
  const title = isAdjust ? `Adjust Settings — ${trader.displayName}` : `Copy Settings — ${trader.displayName}`;

  const update = <K extends keyof CopySettings>(k: K, v: CopySettings[K]) => setS(prev => ({ ...prev, [k]: v }));

  const avgTrade = trader.avgTradeSizeUsd * (s.copyPct / 100);
  const estimatedMonthlyProfit = avgTrade * (trader.totalTrades / 12) * (trader.winRate / 100) * 0.02;

  async function handleSubmit() {
    setPhase('saving');
    await new Promise(r => setTimeout(r, 700));

    if (isAdjust) {
      updateSettings(existingRelId!, s);
    } else {
      const res = startCopying({ followerId, traderId: trader.id, settings: s });
      if (!res.ok) { setPhase('form'); return; }
    }

    setPhase('done');
    setTimeout(onSuccess, 1_200);
  }

  const sectionStyle = { background: 'var(--bg-card)', border: `1px solid ${CTV.border}` };

  return (
    <BottomSheet open onClose={onClose} title={
      <div className="flex items-center gap-2">
        <Settings2 className="h-4 w-4" style={{ color: CTV.gold }} />
        <span className="text-sm font-bold">{title}</span>
      </div>
    } maxHeight="92vh">
      <AnimatePresence mode="wait">
        {phase === 'form' && (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="p-5 space-y-6">

            {/* Copy Amount */}
            <section>
              <SectionHeader icon={<TrendingUp className="h-4 w-4 text-yellow-400" />} title="Copy Amount Settings" />
              <div className="rounded-2xl p-4 space-y-4 mt-2" style={sectionStyle}>
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: CTV.gray }}>Copy Percentage</p>
                  <div className="flex flex-wrap gap-2">
                    {PCT_PRESETS.map(p => (
                      <button key={p} onClick={() => { update('copyPct', p); setCustomPct(false); }}
                        className="px-4 py-1.5 rounded-xl text-xs font-bold transition-all"
                        style={{
                          background: s.copyPct === p && !customPct ? CTV.goldAlpha : CTV.surface,
                          color:      s.copyPct === p && !customPct ? CTV.gold : CTV.gray,
                          border:     `1px solid ${s.copyPct === p && !customPct ? CTV.goldBorder : CTV.border}`,
                        }}>
                        {p}%
                      </button>
                    ))}
                    <button onClick={() => setCustomPct(true)}
                      className="px-4 py-1.5 rounded-xl text-xs font-bold transition-all"
                      style={{
                        background: customPct ? CTV.goldAlpha : CTV.surface,
                        color:      customPct ? CTV.gold : CTV.gray,
                        border:     `1px solid ${customPct ? CTV.goldBorder : CTV.border}`,
                      }}>
                      Custom
                    </button>
                    {customPct && (
                      <NumberInput value={s.copyPct} onChange={v => update('copyPct', Math.min(100, Math.max(1, v)))} suffix="%" placeholder="50" />
                    )}
                  </div>
                  <p className="text-[11px] mt-2" style={{ color: CTV.gray }}>
                    Trader invests <strong style={{ color: CTV.gold }}>${trader.avgTradeSizeUsd.toLocaleString()}</strong> → You invest <strong style={{ color: CTV.gold }}>${avgTrade.toFixed(0)}</strong> ({s.copyPct}%)
                  </p>
                </div>
              </div>
            </section>

            {/* Risk Management */}
            <section>
              <SectionHeader icon={<Shield className="h-4 w-4 text-red-400" />} title="Risk Management" />
              <div className="rounded-2xl p-4 space-y-3 mt-2" style={sectionStyle}>
                <Row label="Maximum per trade">
                  <NumberInput value={s.maxPerTradeUsd} onChange={v => update('maxPerTradeUsd', v)} prefix="$" placeholder="1000" />
                  <span className="text-[11px]" style={{ color: CTV.gray }}>0 = no limit</span>
                </Row>
                <Row label="Maximum daily loss">
                  <NumberInput value={s.maxDailyLossUsd} onChange={v => update('maxDailyLossUsd', v)} prefix="$" placeholder="500" />
                  <span className="text-[11px]" style={{ color: CTV.gray }}>Stop if exceeded</span>
                </Row>
                <Row label="Stop loss (portfolio)">
                  <NumberInput value={s.stopLossPct} onChange={v => update('stopLossPct', v)} suffix="%" placeholder="20" />
                  <span className="text-[11px]" style={{ color: CTV.gray }}>0 = disabled</span>
                </Row>
                <Row label="Take profit (portfolio)">
                  <NumberInput value={s.takeProfitPct} onChange={v => update('takeProfitPct', v)} suffix="%" placeholder="50" />
                  <span className="text-[11px]" style={{ color: CTV.gray }}>0 = disabled</span>
                </Row>
              </div>
            </section>

            {/* Trade Filtering */}
            <section>
              <SectionHeader icon={<Filter className="h-4 w-4 text-blue-400" />} title="Trade Filtering" />
              <div className="rounded-2xl p-4 space-y-3 mt-2" style={sectionStyle}>
                <CheckRow checked={s.copyLong}      onChange={v => update('copyLong', v)}      label="Copy long positions (BUY)" />
                <CheckRow checked={s.copyShort}     onChange={v => update('copyShort', v)}     label="Copy short positions (SELL)" />
                <CheckRow checked={s.skipSameSymbol} onChange={v => update('skipSameSymbol', v)} label="Skip if I have open position in same symbol" />
                <Row label="Min trade size">
                  <NumberInput value={s.minTradeSizeUsd} onChange={v => update('minTradeSizeUsd', v)} prefix="$" placeholder="100" />
                  <span className="text-[11px]" style={{ color: CTV.gray }}>Skip smaller trades</span>
                </Row>
                <Row label="Max trade size">
                  <NumberInput value={s.maxTradeSizeUsd} onChange={v => update('maxTradeSizeUsd', v)} prefix="$" placeholder="0" />
                  <span className="text-[11px]" style={{ color: CTV.gray }}>0 = no limit</span>
                </Row>
              </div>
            </section>

            {/* Notifications */}
            <section>
              <SectionHeader icon={<Bell className="h-4 w-4 text-yellow-400" />} title="Notification Preferences" />
              <div className="rounded-2xl p-4 space-y-3 mt-2" style={sectionStyle}>
                <CheckRow checked={s.notifyOnCopy}               onChange={v => update('notifyOnCopy', v)}               label="Notify when a trade is copied" />
                <CheckRow checked={s.notifyOnDailyLossApproach}  onChange={v => update('notifyOnDailyLossApproach', v)}  label="Notify when daily loss limit approached (80%)" />
              </div>
            </section>

            {/* Estimated Impact */}
            <section>
              <SectionHeader icon={<Calculator className="h-4 w-4 text-emerald-400" />} title="Estimated Impact" />
              <div className="rounded-2xl p-4 space-y-2 mt-2" style={{ ...sectionStyle, background: CTV.greenAlpha, border: `1px solid ${CTV.greenBorder}` }}>
                {[
                  { label: 'Average copied trade',       value: fmtUsd(avgTrade) },
                  { label: 'Estimated monthly profit',   value: fmtUsd(estimatedMonthlyProfit) + ` (based on ${fmtPct(trader.winRate, false)} win rate)` },
                  { label: 'Max risk per trade',         value: s.maxPerTradeUsd > 0 ? fmtUsd(s.maxPerTradeUsd) : 'Unlimited' },
                  { label: 'Copy fee',                   value: `${trader.copyFeePct}% of profit` },
                ].map(item => (
                  <div key={item.label} className="flex items-start gap-2">
                    <span className="text-emerald-400 shrink-0 mt-0.5">•</span>
                    <span className="text-xs text-foreground"><strong>{item.label}:</strong> {item.value}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Actions */}
            <div className="flex gap-3 pb-4">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all"
                style={{ background: CTV.surface, color: CTV.gray, border: `1px solid ${CTV.border}` }}>
                Cancel
              </button>
              <button onClick={handleSubmit}
                className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#FFD700,#FFA800)', color: '#0A1929' }}>
                {isAdjust ? '💾 Save Settings' : '🚀 Start Copying'}
              </button>
            </div>
          </motion.div>
        )}

        {phase === 'saving' && (
          <motion.div key="saving" className="flex flex-col items-center py-16 gap-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Loader2 className="h-10 w-10 animate-spin" style={{ color: CTV.gold }} />
            <p className="text-sm text-muted-foreground">{isAdjust ? 'Saving settings…' : 'Starting copy…'}</p>
          </motion.div>
        )}

        {phase === 'done' && (
          <motion.div key="done" className="flex flex-col items-center py-16 gap-3"
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
            <CheckCircle className="h-14 w-14 text-emerald-400" />
            <p className="font-bold text-lg text-foreground">{isAdjust ? 'Settings Updated!' : 'Now Copying!'}</p>
            <p className="text-sm text-muted-foreground text-center px-8">
              {isAdjust
                ? `Your copy settings for ${trader.displayName} have been saved.`
                : `You are now copying ${trader.displayName}. Trades will be mirrored automatically.`}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </BottomSheet>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <h3 className="font-bold text-sm text-foreground">{title}</h3>
    </div>
  );
}
