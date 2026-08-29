/**
 * botMonitor.ts — Spec 5.1: Real-time Bot Status Updates
 *
 * Implements a WebSocket-style polling loop that:
 *   - Watches every active bot for status changes
 *   - Fires push notifications for:
 *       • Bot started / stopped
 *       • Large profit/loss (> ±5%)
 *       • Risk limit reached
 *       • Error occurred
 *   - Exposes a React hook (useBotMonitor) used once in Layout
 *
 * The "WebSocket" is simulated as a 2-second interval — the live price
 * feed (coinGeckoService) already drives price ticks; this layer adds
 * the monitoring overlay on top.
 */

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useBotStore } from './botStore';
import { useAuthStore } from './authStore';
import { useAppStore }  from './appStore';
import type { UserBot } from './botTypes';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface BotSnapshot {
  status:         UserBot['status'];
  totalProfitPct: number;
  lastError:      string | null;
  stopReason:     UserBot['stopReason'];
  totalTrades:    number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Polling interval (ms) — simulates WebSocket heartbeat */
const POLL_INTERVAL_MS = 2_000;

/** Profit/loss threshold that triggers a large-move notification (spec: >5%) */
const LARGE_MOVE_PCT = 5;

/** How long (ms) to suppress repeat notifications for the same event */
const NOTIFY_COOLDOWN_MS = 30_000;

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function pushNotification(
  addNotification: (n: { type: string; title: string; message: string }) => void,
  type: 'trade' | 'achievement' | 'system' | 'liquidation',
  title: string,
  message: string,
) {
  // In-app notification panel
  addNotification({ type, title, message });
  // Sonner toast for immediate visibility
  switch (type) {
    case 'achievement':
      toast.success(title, { description: message, duration: 5_000 });
      break;
    case 'liquidation':
      toast.error(title, { description: message, duration: 8_000 });
      break;
    case 'trade':
      toast.info(title, { description: message, duration: 4_000 });
      break;
    default:
      toast(title, { description: message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MONITOR CLASS
// ─────────────────────────────────────────────────────────────────────────────

class BotMonitor {
  private timer:     ReturnType<typeof setInterval> | null = null;
  private snapshots: Map<string, BotSnapshot> = new Map();
  private cooldowns: Map<string, number>       = new Map();   // eventKey → last-fired-ts
  private userId:    string | null             = null;
  private addNotify: ((n: any) => void) | null = null;

  start(userId: string, addNotification: (n: any) => void) {
    this.userId    = userId;
    this.addNotify = addNotification;
    if (this.timer) return; // already running
    // 2-second poll: CRITICAL PERFORMANCE PATH - dual-registered.
    // Raw setInterval needed for sub-60s real-time bot status alerts.
    // Also registered with orchestrator for centralized audit visibility.
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    import('./lynxOrchestrator').then(({ lynxOrchestrator }) => {
      lynxOrchestrator.registerScheduledTask('bot-monitor-poll', POLL_INTERVAL_MS, () => { this.poll(); });
    }).catch(() => {});
    // Seed initial snapshots so we don't fire spurious startup events
    this.seedSnapshots();
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.snapshots.clear();
    this.cooldowns.clear();
  }

  private seedSnapshots() {
    const bots = this.getUserBots();
    for (const bot of bots) {
      this.snapshots.set(bot.id, this.toSnapshot(bot));
    }
  }

  private getUserBots(): UserBot[] {
    if (!this.userId) return [];
    const state = useBotStore.getState();
    return Object.values(state.bots).filter(b => b.userId === this.userId);
  }

  private toSnapshot(bot: UserBot): BotSnapshot {
    return {
      status:         bot.status,
      totalProfitPct: bot.totalProfitPct,
      lastError:      bot.lastError,
      stopReason:     bot.stopReason,
      totalTrades:    bot.totalTrades,
    };
  }

  private canFire(eventKey: string): boolean {
    const last = this.cooldowns.get(eventKey) ?? 0;
    if (Date.now() - last < NOTIFY_COOLDOWN_MS) return false;
    this.cooldowns.set(eventKey, Date.now());
    return true;
  }

  private notify(
    type: 'trade' | 'achievement' | 'system' | 'liquidation',
    title: string,
    message: string,
  ) {
    this.addNotify?.({ type, title, message });
    switch (type) {
      case 'achievement':
        toast.success(title, { description: message, duration: 5_000 }); break;
      case 'liquidation':
        toast.error(title, { description: message, duration: 8_000 }); break;
      case 'trade':
        toast.info(title, { description: message, duration: 4_000 }); break;
      default:
        toast(title, { description: message });
    }
  }

  private poll() {
    const bots = this.getUserBots();

    for (const bot of bots) {
      const prev = this.snapshots.get(bot.id);
      const curr = this.toSnapshot(bot);

      // ── Spec 5.1: Bot started ────────────────────────────────────────────
      if (prev && prev.status !== 'active' && curr.status === 'active') {
        if (this.canFire(`started:${bot.id}`)) {
          this.notify('system', `🤖 ${bot.name} Started`, 'Bot is now running and executing trades.');
        }
      }

      // ── Spec 5.1: Bot stopped ────────────────────────────────────────────
      if (prev && prev.status === 'active' && curr.status !== 'active') {
        const reason = bot.stopReason ?? 'stopped';
        const isError = curr.status === 'error';
        if (this.canFire(`stopped:${bot.id}`)) {
          this.notify(
            isError ? 'liquidation' : 'system',
            isError ? `⚠️ ${bot.name} Halted` : `⏹ ${bot.name} Stopped`,
            isError
              ? `Bot halted due to error: ${bot.lastError ?? reason}`
              : `Bot stopped (${reason.replace(/_/g, ' ')}).`,
          );
        }
      }

      // ── Spec 5.1: Risk limit reached ────────────────────────────────────
      if (
        prev &&
        prev.stopReason !== 'max_loss_reached' &&
        bot.stopReason === 'max_loss_reached'
      ) {
        if (this.canFire(`riskLimit:${bot.id}`)) {
          this.notify('liquidation', `🛑 ${bot.name} — Risk Limit`, `Bot stopped: max loss limit reached.`);
        }
      }

      if (
        prev &&
        prev.stopReason !== 'daily_loss_limit' &&
        bot.stopReason === 'daily_loss_limit'
      ) {
        if (this.canFire(`dailyLimit:${bot.id}`)) {
          this.notify('liquidation', `🛑 ${bot.name} — Daily Loss Limit`, `Bot paused: daily loss limit hit.`);
        }
      }

      // ── Spec 5.1: Error occurred ─────────────────────────────────────────
      if (prev && !prev.lastError && curr.lastError) {
        if (this.canFire(`error:${bot.id}`)) {
          this.notify('liquidation', `🔴 ${bot.name} — Error`, curr.lastError);
        }
      }

      // ── Spec 5.1: Large profit/loss (> ±5%) ──────────────────────────────
      // Only fires once per crossing of the threshold, not every tick
      const prevPct = prev?.totalProfitPct ?? 0;
      const currPct = curr.totalProfitPct;

      // Large gain crossing
      if (prevPct < LARGE_MOVE_PCT && currPct >= LARGE_MOVE_PCT) {
        if (this.canFire(`gainThresh:${bot.id}`)) {
          this.notify(
            'achievement',
            `🚀 ${bot.name} — Up +${LARGE_MOVE_PCT}%!`,
            `Total return: +${currPct.toFixed(2)}%. Consider locking in profits.`,
          );
        }
      }

      // Large loss crossing
      if (prevPct > -LARGE_MOVE_PCT && currPct <= -LARGE_MOVE_PCT) {
        if (this.canFire(`lossThresh:${bot.id}`)) {
          this.notify(
            'liquidation',
            `📉 ${bot.name} — Down ${LARGE_MOVE_PCT}%`,
            `Total return: ${currPct.toFixed(2)}%. Bot is running recovery logic.`,
          );
        }
      }

      // Update snapshot
      this.snapshots.set(bot.id, curr);
    }

    // Clean up snapshots for deleted bots
    for (const [id] of this.snapshots) {
      if (!bots.find(b => b.id === id)) this.snapshots.delete(id);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON
// ─────────────────────────────────────────────────────────────────────────────

const _monitor = new BotMonitor();

// ─────────────────────────────────────────────────────────────────────────────
// REACT HOOK  (called once in Layout)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * useBotMonitor — Spec 5.1
 *
 * Starts the monitoring loop when the user is logged in.
 * Automatically restarts if the userId changes.
 */
export function useBotMonitor() {
  const { user }           = useAuthStore();
  const { addNotification } = useAppStore();

  useEffect(() => {
    if (!user) { _monitor.stop(); return; }
    _monitor.start(user.id, addNotification);
    return () => { _monitor.stop(); };
  }, [user?.id, addNotification]);
}
