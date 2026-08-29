/**
 * coachEngine.ts - Lynx AI Coach Engine
 * Generates proactive coaching messages and intelligent UI adaptations.
 */

import { lynxBrain } from './brainEngine';
import { lynxContext } from './contextEngine';
import { lynxMemory } from './memoryEngine';

export interface CoachingMessage {
  id: string;
  type: 'warning' | 'guidance' | 'celebration' | 'greeting' | 'tip';
  icon: string;
  title: string;
  message: string;
  dismissible: boolean;
  autoDismiss: number;
  priority: 'low' | 'medium' | 'high';
  timestamp: number;
}

export interface UIAdaptation {
  component: string;
  property: string;
  value: unknown;
  reason: string;
}

type CoachSubscriber = (state: { messages: CoachingMessage[]; adaptations: UIAdaptation[] }) => void;

class LynxCoachEngine {
  private activeMessages: CoachingMessage[] = [];
  private dismissedMessages: string[] = [];
  private uiAdaptations: UIAdaptation[] = [];
  private subscribers: CoachSubscriber[] = [];
  private coachInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.loadDismissedFromStorage();
    this.startCoaching();
  }

  getActiveMessages(): CoachingMessage[] { return [...this.activeMessages]; }
  getUIAdaptations(): UIAdaptation[] { return [...this.uiAdaptations]; }

  dismissMessage(id: string): void {
    this.dismissedMessages.push(id);
    this.saveDismissedToStorage();
    this.activeMessages = this.activeMessages.filter((m) => m.id !== id);
    this.notifySubscribers();
  }

  subscribe(cb: CoachSubscriber): () => void {
    this.subscribers.push(cb);
    return () => { this.subscribers = this.subscribers.filter((s) => s !== cb); };
  }

  generateMessages(): CoachingMessage[] {
    const messages: CoachingMessage[] = [];
    const suggestions = lynxBrain.getSuggestions();
    const context = lynxContext.getContext();
    const memory = lynxMemory.getLongTermMemory();

    for (const s of suggestions) {
      if (this.isDismissed(s.id)) continue;
      const type: CoachingMessage['type'] = s.type === 'warning' ? 'warning' : s.type === 'recommendation' ? 'guidance' : s.type === 'celebration' ? 'celebration' : 'tip';
      messages.push({
        id: s.id, type, icon: this.getIcon(type), title: s.title, message: s.message,
        dismissible: s.priority !== 'high', autoDismiss: s.priority === 'high' ? 0 : 10000,
        priority: s.priority, timestamp: Date.now(),
      });
    }

    if (memory && memory.lastSeen < Date.now() - 8 * 60 * 60 * 1000 && !this.isDismissed('daily_greeting')) {
      const hour = new Date().getHours();
      const g = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
      messages.push({ id: 'daily_greeting', type: 'greeting', icon: '🦊', title: g + '!', message: 'What are your trading plans today?', dismissible: true, autoDismiss: 12000, priority: 'low', timestamp: Date.now() });
    }

    if (context.sessionTime > 600 && context.openPositions === 0 && !this.isDismissed('inactive')) {
      messages.push({ id: 'inactive', type: 'tip', icon: '💤', title: 'Ready to trade?', message: 'Want to try a practice trade?', dismissible: true, autoDismiss: 10000, priority: 'low', timestamp: Date.now() });
    }

    this.activeMessages = messages;
    this.notifySubscribers();
    return messages;
  }

  generateUIAdaptations(): UIAdaptation[] {
    const a: UIAdaptation[] = [];
    const m = lynxMemory.getLongTermMemory();
    const ctx = lynxContext.getContext();
    if (m?.tradingStyle === 'scalper') a.push({ component: 'TradingChart', property: 'defaultTimeframe', value: '1m', reason: 'scalper' });
    else if (m?.tradingStyle === 'swing_trader') a.push({ component: 'TradingChart', property: 'defaultTimeframe', value: '4h', reason: 'swing' });
    else if (m?.tradingStyle === 'holder') a.push({ component: 'TradingChart', property: 'defaultTimeframe', value: '1D', reason: 'holder' });
    if (m?.riskLevel === 'high' || m?.riskLevel === 'extreme') a.push({ component: 'TradePanel', property: 'showRiskWarning', value: true, reason: 'high_risk' });
    if (ctx.sentiment === 'stressed' || ctx.sentiment === 'negative') a.push({ component: 'TradePanel', property: 'leverageLimit', value: 5, reason: 'stressed' });
    this.uiAdaptations = a;
    this.notifySubscribers();
    return a;
  }

  private startCoaching(): void {
    this.generateMessages();
    this.generateUIAdaptations();
    this.coachInterval = setInterval(() => { this.generateMessages(); this.generateUIAdaptations(); }, 30000);
  }

  private getIcon(t: CoachingMessage['type']): string {
    return { warning: '⚠️', guidance: '💡', tip: '🔹', celebration: '🎉', greeting: '🦊' }[t] || '💬';
  }

  private isDismissed(id: string): boolean { return this.dismissedMessages.includes(id); }

  private notifySubscribers(): void {
    const s = { messages: [...this.activeMessages], adaptations: [...this.uiAdaptations] };
    for (const cb of this.subscribers) { try { cb(s); } catch {} }
  }

  private saveDismissedToStorage(): void {
    try { localStorage.setItem('cv_lynx_dismissed', JSON.stringify(this.dismissedMessages)); } catch {}
  }

  private loadDismissedFromStorage(): void {
    try { const d = localStorage.getItem('cv_lynx_dismissed'); if (d) this.dismissedMessages = JSON.parse(d); } catch {}
  }
}

export const lynxCoach = new LynxCoachEngine();
