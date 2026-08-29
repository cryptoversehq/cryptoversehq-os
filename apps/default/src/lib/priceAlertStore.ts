import { create } from 'zustand';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlertCondition = 'above' | 'below' | 'cross';
export type AlertStatus    = 'active' | 'triggered' | 'paused';

export interface PriceAlert {
  id:          string;
  coinId:      string;
  coinSymbol:  string;
  coinColor:   string;
  targetPrice: number;
  condition:   AlertCondition;
  status:      AlertStatus;
  note:        string;           // optional label e.g. "key resistance"
  createdAt:   number;
  triggeredAt: number | null;
  soundEnabled: boolean;
  // internal: last price seen, used to detect "cross" transitions
  _lastPrice:  number | null;
}

export interface AlertToast {
  id:         string;
  alert:      PriceAlert;
  price:      number;
  timestamp:  number;
}

interface PriceAlertState {
  alerts:  PriceAlert[];
  toasts:  AlertToast[];

  addAlert:    (a: Omit<PriceAlert, 'id' | 'createdAt' | 'triggeredAt' | '_lastPrice' | 'status'>) => void;
  removeAlert: (id: string) => void;
  toggleAlert: (id: string) => void;         // active ↔ paused
  updateAlert: (id: string, patch: Partial<Pick<PriceAlert, 'targetPrice' | 'condition' | 'note' | 'soundEnabled'>>) => void;
  dismissToast: (id: string) => void;
  clearTriggered: () => void;

  // Called from Dashboard price tick
  checkAlerts: (coinId: string, coinSymbol: string, coinColor: string, price: number) => void;
}

// ─── Web Audio Sound Synthesis ────────────────────────────────────────────────

let _audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  try {
    if (!_audioCtx || _audioCtx.state === 'closed') {
      _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Resume if suspended (browser policy)
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    return _audioCtx;
  } catch {
    return null;
  }
}

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  gain = 0.18,
  delay = 0,
) {
  const ctx = getAudioCtx();
  if (!ctx) return;

  const osc  = ctx.createOscillator();
  const gNode = ctx.createGain();

  osc.connect(gNode);
  gNode.connect(ctx.destination);

  osc.type      = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime + delay);

  // Smooth envelope to avoid clicks
  gNode.gain.setValueAtTime(0, ctx.currentTime + delay);
  gNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + delay + 0.02);
  gNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);

  osc.start(ctx.currentTime + delay);
  osc.stop(ctx.currentTime + delay + duration + 0.05);
}

export const AlertSounds = {
  /** Bright ascending chime — price went ABOVE target */
  above() {
    playTone(880, 0.15, 'sine', 0.2);
    playTone(1100, 0.20, 'sine', 0.18, 0.12);
    playTone(1320, 0.30, 'sine', 0.15, 0.28);
  },

  /** Deep descending tone — price went BELOW target */
  below() {
    playTone(440, 0.20, 'sine', 0.2);
    playTone(350, 0.25, 'sine', 0.18, 0.15);
    playTone(260, 0.35, 'sine', 0.15, 0.32);
  },

  /** Neutral double-beep — price crossed through target */
  cross() {
    playTone(660, 0.12, 'square', 0.12);
    playTone(660, 0.12, 'square', 0.12, 0.22);
  },

  /** Soft tick used for test/preview */
  preview() {
    playTone(800, 0.18, 'sine', 0.15);
  },
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const usePriceAlertStore = create<PriceAlertState>((set, get) => ({
  alerts: [],
  toasts: [],

  addAlert: (a) => {
    const alert: PriceAlert = {
      ...a,
      id:          `alert-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      status:      'active',
      createdAt:   Date.now(),
      triggeredAt: null,
      _lastPrice:  null,
    };
    set(s => ({ alerts: [alert, ...s.alerts] }));
  },

  removeAlert: (id) => set(s => ({ alerts: s.alerts.filter(a => a.id !== id) })),

  toggleAlert: (id) => set(s => ({
    alerts: s.alerts.map(a =>
      a.id === id
        ? { ...a, status: a.status === 'active' ? 'paused' : 'active' }
        : a,
    ),
  })),

  updateAlert: (id, patch) => set(s => ({
    alerts: s.alerts.map(a => a.id === id ? { ...a, ...patch } : a),
  })),

  dismissToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),

  clearTriggered: () => set(s => ({
    alerts: s.alerts.filter(a => a.status !== 'triggered'),
  })),

  checkAlerts: (coinId, _coinSymbol, _coinColor, price) => {
    const { alerts } = get();
    const active = alerts.filter(a => a.coinId === coinId && a.status === 'active');
    if (active.length === 0) return;

    const nowMs = Date.now();
    const newToasts: AlertToast[] = [];
    const updatedAlerts = alerts.map(a => {
      if (a.coinId !== coinId || a.status !== 'active') return a;

      const prev = a._lastPrice;
      let triggered = false;

      if (a.condition === 'above') {
        triggered = price >= a.targetPrice;
      } else if (a.condition === 'below') {
        triggered = price <= a.targetPrice;
      } else if (a.condition === 'cross') {
        // Detect a threshold crossing in either direction
        if (prev !== null) {
          triggered =
            (prev < a.targetPrice && price >= a.targetPrice) ||
            (prev > a.targetPrice && price <= a.targetPrice);
        }
      }

      const updated = { ...a, _lastPrice: price };

      if (triggered) {
        if (a.soundEnabled) AlertSounds[a.condition]();

        const toast: AlertToast = {
          id:        `toast-${a.id}-${nowMs}`,
          alert:     { ...updated, status: 'triggered', triggeredAt: nowMs },
          price,
          timestamp: nowMs,
        };
        newToasts.push(toast);

        // Mark as triggered (one-shot) and clear _lastPrice
        return { ...updated, status: 'triggered' as AlertStatus, triggeredAt: nowMs };
      }

      return updated;
    });

    set(s => ({
      alerts: updatedAlerts,
      toasts: [...newToasts, ...s.toasts].slice(0, 8),
    }));
  },
}));
