/**
 * eventBusinessLogic.ts — §4 Business Logic Layer
 *
 * Self-contained, framework-agnostic classes that the Zustand store
 * delegates to. Each class mirrors the spec exactly and exposes both
 * synchronous (in-memory) and async-compatible APIs.
 *
 * §4.1  EventScheduler      — start/end lifecycle + notification dispatch
 * §4.2  EventRankingCalculator — ROI / PnL / contribution scoring
 * §4.3  PrizeDistributor    — CP award + badge ledger + XP
 * §4.4  TeamBattleManager   — create / join / score teams
 */

import { toast } from 'sonner';
import {
  LiveEvent,
  EventParticipant,
  EventTeam,
  EventNotification,
  UserEventEntry,
  EventReward,
  EventType,
} from './eventTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function isoNow(): string {
  return new Date().toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// §4.1  EventScheduler
// ─────────────────────────────────────────────────────────────────────────────

export type EventStatusChange = {
  eventId: string;
  newStatus: 'live' | 'completed';
  timestamp: string;
};

export type SchedulerNotification = {
  userId: string;
  title: string;
  message: string;
  type: 'event_start' | 'event_end' | 'rank_change' | 'reward';
};

/** Callbacks the scheduler uses to reach the store */
export interface SchedulerCallbacks {
  updateEventStatus:       (eventId: string, status: 'live' | 'completed') => void;
  getEventRegistrants:     (eventId: string) => string[];   // user ids
  sendNotification:        (n: SchedulerNotification) => void;
  initializeEventTracking: (eventId: string) => void;
  calculateAndDistribute:  (eventId: string) => void;
}

export class EventScheduler {
  private scheduledEvents: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private callbacks!: SchedulerCallbacks;

  /** Inject store callbacks (called once at store init) */
  init(callbacks: SchedulerCallbacks): void {
    this.callbacks = callbacks;
  }

  /** Schedule a single event — safe to call multiple times (idempotent) */
  scheduleEvent(eventId: string, eventData: LiveEvent): void {
    // Clear any pre-existing timers for this event
    this.cancelEvent(eventId);

    const now       = Date.now();
    const startTime = new Date(eventData.startAt).getTime();
    const endTime   = new Date(eventData.endAt).getTime();

    // ── Already active? ────────────────────────────────────────────────────
    if (startTime <= now && endTime > now) {
      this.startEvent(eventId, eventData);
    } else if (startTime > now) {
      // ── Schedule start ─────────────────────────────────────────────────
      const startDelay = startTime - now;
      const startTimer = setTimeout(() => this.startEvent(eventId, eventData), startDelay);
      this.scheduledEvents.set(`${eventId}_start`, startTimer);
    }

    // ── Schedule end ────────────────────────────────────────────────────────
    if (endTime > now) {
      const endDelay = endTime - now;
      const endTimer = setTimeout(() => this.endEvent(eventId, eventData), endDelay);
      this.scheduledEvents.set(`${eventId}_end`, endTimer);
    }
  }

  /** Schedule all events in the catalog */
  scheduleAll(events: LiveEvent[]): void {
    for (const ev of events) {
      if (ev.status !== 'completed' && ev.status !== 'cancelled') {
        this.scheduleEvent(ev.id, ev);
      }
    }
  }

  /** Cancel all timers for an event */
  cancelEvent(eventId: string): void {
    const startKey = `${eventId}_start`;
    const endKey   = `${eventId}_end`;
    if (this.scheduledEvents.has(startKey)) {
      clearTimeout(this.scheduledEvents.get(startKey)!);
      this.scheduledEvents.delete(startKey);
    }
    if (this.scheduledEvents.has(endKey)) {
      clearTimeout(this.scheduledEvents.get(endKey)!);
      this.scheduledEvents.delete(endKey);
    }
  }

  /** Cancel ALL scheduled events */
  cancelAll(): void {
    for (const timer of this.scheduledEvents.values()) clearTimeout(timer);
    this.scheduledEvents.clear();
  }

  // ── Private lifecycle ───────────────────────────────────────────────────────

  private startEvent(eventId: string, eventData: LiveEvent): void {
    this.callbacks.updateEventStatus(eventId, 'live');
    this.callbacks.initializeEventTracking(eventId);

    const registrants = this.callbacks.getEventRegistrants(eventId);
    for (const userId of registrants) {
      this.callbacks.sendNotification({
        userId,
        title:   'Event Started! 🚀',
        message: `"${eventData.title}" has started. Good luck!`,
        type:    'event_start',
      });
    }

    // In-app toast (shown to the current user regardless)
    toast.success(`🔴 ${eventData.title} is now LIVE!`, { duration: 5000 });
  }

  private endEvent(eventId: string, eventData: LiveEvent): void {
    this.callbacks.calculateAndDistribute(eventId);
    this.callbacks.updateEventStatus(eventId, 'completed');

    const registrants = this.callbacks.getEventRegistrants(eventId);
    for (const userId of registrants) {
      this.callbacks.sendNotification({
        userId,
        title:   'Event Ended 🏆',
        message: `"${eventData.title}" has concluded. Check your results!`,
        type:    'event_end',
      });
    }

    toast.info(`🏁 ${eventData.title} has ended. Results are in!`, { duration: 5000 });
  }

  /** Returns count of active timers (useful for debugging) */
  get activeTimerCount(): number {
    return this.scheduledEvents.size;
  }
}

// Singleton — one scheduler per app session
export const eventScheduler = new EventScheduler();

// ─────────────────────────────────────────────────────────────────────────────
// §4.2  EventRankingCalculator
// ─────────────────────────────────────────────────────────────────────────────

export interface Ranking {
  userId:      string;
  displayName: string;
  avatarSeed:  string;
  score:       number;      // final score for ranking
  roi:         number;      // percentage
  pnl:         number;      // USD
  trades:      number;
  winRate:     number;
  rank:        number;
  delta:       number;      // rank change vs previous snapshot
  teamId?:     string;
}

export interface ScoredParticipant {
  userId:     string;
  score:      number;
  rawMetrics: Record<string, number>;
}

export class EventRankingCalculator {

  /**
   * Calculate rankings for all participants in an event.
   * Returns array sorted by score descending with rank assigned.
   */
  calculateRankings(
    participants: EventParticipant[],
    eventType:    EventType,
    previousRankMap: Map<string, number> = new Map(),
  ): Ranking[] {
    const scored = participants.map(p => ({
      participant: p,
      score: this.scoreParticipant(p, eventType),
    }));

    // Sort descending
    scored.sort((a, b) => b.score - a.score);

    return scored.map(({ participant: p, score }, i) => {
      const prevRank = previousRankMap.get(p.userId) ?? i + 1;
      const rank     = i + 1;
      return {
        userId:      p.userId,
        displayName: p.displayName,
        avatarSeed:  p.avatarSeed,
        score,
        roi:         p.pnlPct,
        pnl:         p.pnl,
        trades:      p.trades,
        winRate:     p.winRate,
        rank,
        delta:       prevRank - rank,
        teamId:      p.teamId,
      };
    });
  }

  /**
   * Compute a single participant's score based on event type.
   * Mirrors the spec's switch statement exactly.
   */
  scoreParticipant(p: EventParticipant, eventType: EventType): number {
    switch (eventType) {
      case 'weekend_warrior':
      case 'monthly_championship':
        // Score = ROI percentage
        return this.getParticipantROI(p);

      case 'team_battle':
        // Score = team contribution points (weighted by win rate)
        return this.getTeamContribution(p);

      case 'flash_challenge':
        // Score = PnL in the challenge time window
        return this.getTimeWindowPnL(p);

      case 'live_webinar':
      case 'market_analysis_live':
        // Attendance score (all equal for webinar-type events)
        return p.trades > 0 ? 100 : 0;

      default:
        return p.pnlPct;
    }
  }

  /** ROI-based score for weekend/monthly events */
  private getParticipantROI(p: EventParticipant): number {
    // ROI = ((finalBalance - initialBalance) / initialBalance) × 100
    // Proxy from participant data: use pnlPct directly (already % return)
    return parseFloat(p.pnlPct.toFixed(4));
  }

  /** Team contribution = individual score weighted by win rate */
  private getTeamContribution(p: EventParticipant): number {
    const baseScore = p.pnlPct * (0.5 + p.winRate * 0.5);
    return parseFloat(baseScore.toFixed(4));
  }

  /** PnL in time window for flash challenges */
  private getTimeWindowPnL(p: EventParticipant): number {
    // In a real backend this would query trades filtered by event window
    // Proxy: use the pre-computed pnlPct value
    return parseFloat(p.pnlPct.toFixed(4));
  }

  /**
   * Calculate team rankings by summing/averaging member scores.
   */
  calculateTeamRankings(teams: EventTeam[], eventType: EventType): TeamRanking[] {
    const scored = teams.map(team => {
      const allMembers = [team.captain, ...team.members];
      // Team score = average of member scores
      const scores     = allMembers.map(m => this.scoreParticipant(m as EventParticipant, eventType));
      const avgScore   = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      return { team, avgScore };
    });

    scored.sort((a, b) => b.avgScore - a.avgScore);

    return scored.map(({ team, avgScore }, i) => ({
      teamId:      team.id,
      teamName:    team.name,
      emoji:       team.emoji,
      color:       team.color,
      score:       parseFloat(avgScore.toFixed(2)),
      memberCount: team.members.length + 1,
      rank:        i + 1,
    }));
  }
}

export interface TeamRanking {
  teamId:      string;
  teamName:    string;
  emoji:       string;
  color:       string;
  score:       number;
  memberCount: number;
  rank:        number;
}

// ─────────────────────────────────────────────────────────────────────────────
// §4.3  PrizeDistributor
// ─────────────────────────────────────────────────────────────────────────────

export interface PrizeTransaction {
  id:          string;
  userId:      string;
  eventId:     string;
  eventTitle:  string;
  amount:      number;       // CP
  xpAwarded:   number;
  badgesAwarded: string[];
  rank:        number;
  timestamp:   string;
}

export interface DistributionResult {
  transactions:  PrizeTransaction[];
  totalCPAwarded: number;
  totalXPAwarded: number;
  badgesIssued:  string[];
}

export class PrizeDistributor {

  /**
   * Distribute prizes based on final rankings.
   * Mirrors the spec's rank-tiered logic exactly.
   */
  distribute(
    event:     LiveEvent,
    rankings:  Ranking[],
  ): DistributionResult {
    const transactions:  PrizeTransaction[] = [];
    let totalCP = 0;
    let totalXP = 0;
    const badges: string[] = [];

    for (const ranking of rankings) {
      const { cpAmount, badgeNames } = this.determinePrize(event, ranking.rank);
      const xp = this.calculateXP(ranking.rank, event.type);

      totalCP += cpAmount;
      totalXP += xp;

      const tx: PrizeTransaction = {
        id:            uid(),
        userId:        ranking.userId,
        eventId:       event.id,
        eventTitle:    event.title,
        amount:        cpAmount,
        xpAwarded:     xp,
        badgesAwarded: badgeNames,
        rank:          ranking.rank,
        timestamp:     isoNow(),
      };
      transactions.push(tx);

      if (badgeNames.length > 0) badges.push(...badgeNames);
    }

    return { transactions, totalCPAwarded: totalCP, totalXPAwarded: totalXP, badgesIssued: badges };
  }

  /**
   * Determine CP amount and badges for a given rank.
   * Uses the event's rewards array as the source of truth.
   */
  determinePrize(event: LiveEvent, rank: number): { cpAmount: number; badgeNames: string[] } {
    let cpAmount   = 0;
    const badgeNames: string[] = [];

    for (const reward of event.rewards) {
      if (reward.rank === 'all') {
        // Participation reward — everyone gets it
        if (reward.type === 'virtual_cash') cpAmount += reward.value;
        if (reward.type === 'badge')        badgeNames.push(reward.label);
        if (reward.type === 'xp')           { /* handled separately */ }
        continue;
      }

      // Rank-specific rewards
      if (typeof reward.rank === 'number') {
        if (rank === reward.rank) {
          if (reward.type === 'virtual_cash') cpAmount += reward.value;
          if (reward.type === 'badge')        badgeNames.push(reward.label);
        }
        // Handle rank ranges encoded in label
        // e.g. "Rank 2-5" → covered by individual reward entries
      }
    }

    // Fallback tiered logic (mirrors spec 4.3 exactly)
    if (cpAmount === 0) {
      const prizeMap = event.rewards.filter(r => r.type === 'virtual_cash' && typeof r.rank === 'number');
      if (rank === 1) {
        const r1 = prizeMap.find(r => r.rank === 1);
        if (r1) cpAmount = r1.value;
        badgeNames.push(`${event.title} Champion`);
      } else if (rank >= 2 && rank <= 5) {
        const r2 = prizeMap.find(r => r.rank === 2);
        if (r2) cpAmount = r2.value;
        badgeNames.push(`${event.title} Elite`);
      } else if (rank >= 6 && rank <= 20) {
        const r6 = prizeMap.find(r => r.rank === 3);
        if (r6) cpAmount = r6.value;
        badgeNames.push(`${event.title} Contender`);
      } else if (rank >= 21 && rank <= 100) {
        // Consolation
        cpAmount = Math.round(event.prizePool * 0.001); // 0.1% each
      }
    }

    return { cpAmount, badgeNames };
  }

  /** XP scales inversely with rank, capped at the event-defined XP reward */
  calculateXP(rank: number, eventType: EventType): number {
    const baseXP: Record<EventType, number> = {
      flash_challenge:      150,
      weekend_warrior:      500,
      monthly_championship: 1000,
      team_battle:          750,
      live_webinar:         300,
      market_analysis_live: 200,
    };
    const base  = baseXP[eventType] ?? 100;
    // Top 10 get full XP, everyone else gets 50%
    return rank <= 10 ? base : Math.round(base * 0.5);
  }

  /**
   * Award all-participant XP (called for webinar/analysis events).
   */
  calculateAttendanceXP(eventType: EventType): number {
    return this.calculateXP(999, eventType);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §4.4  TeamBattleManager
// ─────────────────────────────────────────────────────────────────────────────

export interface TeamRecord {
  id:         string;
  name:       string;
  emoji:      string;
  captainId:  string;
  memberIds:  string[];
  score:      number;
  rank:       number;
  isOpen:     boolean;
  createdAt:  string;
}

export interface TeamMemberScore {
  userId:      string;
  score:       number;
  contribution: number;   // percentage of team total
}

export class TeamBattleManager {
  private readonly MAX_TEAM_SIZE = 5;

  /** §4.4 createTeam */
  createTeam(teamName: string, captainId: string, emoji = '⚔️'): TeamRecord {
    if (!teamName.trim()) throw new Error('Team name cannot be empty');

    const team: TeamRecord = {
      id:        uid(),
      name:      teamName.trim(),
      emoji,
      captainId,
      memberIds: [captainId],
      score:     0,
      rank:      0,
      isOpen:    true,
      createdAt: isoNow(),
    };

    return team;
  }

  /** §4.4 joinTeam — throws on validation failure */
  joinTeam(team: TeamRecord, userId: string): TeamRecord {
    if (team.memberIds.length >= this.MAX_TEAM_SIZE) {
      throw new Error(`Team is full (max ${this.MAX_TEAM_SIZE} members)`);
    }
    if (team.memberIds.includes(userId)) {
      throw new Error('User is already a member of this team');
    }
    if (!team.isOpen) {
      throw new Error('This team is not accepting new members');
    }

    return {
      ...team,
      memberIds: [...team.memberIds, userId],
    };
  }

  /** §4.4 updateTeamScore — recalculates from member scores */
  updateTeamScore(team: TeamRecord, memberScores: Map<string, number>): number {
    let total = 0;
    for (const memberId of team.memberIds) {
      total += memberScores.get(memberId) ?? 0;
    }
    return parseFloat(total.toFixed(4));
  }

  /** Per-member contribution breakdown */
  getMemberContributions(team: TeamRecord, memberScores: Map<string, number>): TeamMemberScore[] {
    const totalScore = this.updateTeamScore(team, memberScores);
    return team.memberIds.map(userId => {
      const score        = memberScores.get(userId) ?? 0;
      const contribution = totalScore > 0 ? (score / totalScore) * 100 : 0;
      return {
        userId,
        score:        parseFloat(score.toFixed(2)),
        contribution: parseFloat(contribution.toFixed(1)),
      };
    });
  }

  /** §4.4 getTeamLeaderboard — sort teams by score, assign ranks */
  getTeamLeaderboard(teams: TeamRecord[]): (TeamRecord & { rank: number })[] {
    const sorted = [...teams].sort((a, b) => b.score - a.score);
    return sorted.map((t, i) => ({ ...t, rank: i + 1 }));
  }

  /** Lock team (captain action) */
  lockTeam(team: TeamRecord): TeamRecord {
    return { ...team, isOpen: false };
  }

  /** Validate: can this team participate? */
  validateTeam(team: TeamRecord): { valid: boolean; reason?: string } {
    if (team.memberIds.length < 2) {
      return { valid: false, reason: `Need at least 2 members (have ${team.memberIds.length})` };
    }
    if (team.memberIds.length > this.MAX_TEAM_SIZE) {
      return { valid: false, reason: `Too many members (max ${this.MAX_TEAM_SIZE})` };
    }
    return { valid: true };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singletons — one instance per app session
// ─────────────────────────────────────────────────────────────────────────────

export const rankingCalculator  = new EventRankingCalculator();
export const prizeDistributor   = new PrizeDistributor();
export const teamBattleManager  = new TeamBattleManager();
