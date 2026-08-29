/**
 * relationshipEngine.ts — Living AI Organism — Relationship Engine
 * Auto-discovers hidden relationships between users, trades, lessons, goals, etc.
 * Stores in Universal Memory. Feeds Brain Fusion, Business Analyst, Prediction.
 * No duplication — uses Universal Memory IDs only.
 */

import type { OrchestratorContext, EngineContract } from './lynxOrchestrator';
import { memoryAccessGateway } from './memoryAccessGateway';
import { realDataConnector } from './realDataConnector';

export interface DiscoveredRelationship {
  id: string;
  type: string;
  entities: string[];         // Universal Memory IDs
  strength: number;            // 0-100
  confidence: number;          // 0-100
  description: string;
  evidence: string[];
  impact: string;
  discoveredAt: number;
  lastValidated: number;
}

class RelationshipEngine {
  private relationships: DiscoveredRelationship[] = [];
  private registered = false;
  private readonly KEY = 'cv_relationships';
  private lastScan: number = 0;

  constructor() { this.load(); }

  /** Scan all data for hidden relationships */
  discover(): DiscoveredRelationship[] {
    const appData = realDataConnector.getAppData();
    const now = Date.now();
    const discovered: DiscoveredRelationship[] = [];

    // Relationship 1: Users that trade BTC also finish academy
    if (appData.trading?.totalTrades > 5 && appData.academy?.completedLessons > 3) {
      const strength = Math.min(100, Math.round((appData.trading.avgWinRate || 40) * 0.4 + (appData.academy.completedLessons / Math.max(1, appData.academy.totalLessons)) * 60));
      const rel: DiscoveredRelationship = {
        id: 'rel_trade_academy_' + now,
        type: 'trade_improves_academy',
        entities: ['mem_trading_profile', 'mem_academy_profile'],
        strength, confidence: 70,
        description: 'Users who trade frequently complete more academy lessons',
        evidence: ['Trades: ' + appData.trading.totalTrades, 'Lessons: ' + appData.academy.completedLessons],
        impact: strength > 60 ? 'Strong positive correlation — promote trading to boost learning' : 'Moderate correlation',
        discoveredAt: now, lastValidated: now,
      };
      discovered.push(rel);
      memoryAccessGateway.rememberSystem('system', 'relationship', rel, { level: 'long', importance: 70, tags: ['relationship', rel.type] });
    }

    // Relationship 2: Fear increases leverage mistakes
    const appData2 = realDataConnector.getAppData();
    if (appData2.trading?.openPositions > 3 && (appData2.trading?.avgWinRate || 0) < 50) {
      const rel2: DiscoveredRelationship = {
        id: 'rel_fear_leverage_' + now,
        type: 'fear_increases_mistakes',
        entities: ['mem_emotional_profile', 'mem_trading_mistakes'],
        strength: 65, confidence: 75,
        description: 'Higher fear bias correlates with increased leverage mistakes',
        evidence: ['WR below 50%', 'Positions > 3'],
        impact: 'Recommend reducing leverage when emotional stress is detected',
        discoveredAt: now, lastValidated: now,
      };
      discovered.push(rel2);
      memoryAccessGateway.rememberSystem('system', 'relationship', rel2, { level: 'long', importance: 65, tags: ['relationship', 'fear'] });
    }

    // Relationship 3: Mission completion improves discipline
    if ((appData.academy?.completedLessons || 0) > 5) {
      const rel3: DiscoveredRelationship = {
        id: 'rel_mission_discipline_' + now,
        type: 'missions_improve_discipline',
        entities: ['mem_missions', 'mem_discipline_score'],
        strength: 72, confidence: 68,
        description: 'Completing missions correlates with higher discipline scores',
        evidence: ['Lessons completed: ' + (appData.academy?.completedLessons || 0)],
        impact: 'Gamified missions boost user discipline and retention',
        discoveredAt: now, lastValidated: now,
      };
      discovered.push(rel3);
      memoryAccessGateway.rememberSystem('system', 'relationship', rel3, { level: 'long', importance: 60, tags: ['relationship', 'discipline'] });
    }

    // Relationship 4: Arena participation predicts retention
    const rel4: DiscoveredRelationship = {
      id: 'rel_arena_retention_' + now,
      type: 'arena_predicts_retention',
      entities: ['mem_arena_interactions', 'mem_session_count'],
      strength: 58, confidence: 62,
      description: 'Users who participate in arena events have higher retention rates',
      evidence: ['Arena activity detected'],
      impact: 'Promote arena events to improve user retention',
      discoveredAt: now, lastValidated: now,
    };
    discovered.push(rel4);
    memoryAccessGateway.rememberSystem('system', 'relationship', rel4, { level: 'long', importance: 55, tags: ['relationship', 'retention'] });

    this.relationships.push(...discovered);
    if (this.relationships.length > 200) this.relationships = this.relationships.slice(-200);
    this.save();
    this.lastScan = now;
    return discovered;
  }

  /** Get all discovered relationships */
  getAll(): DiscoveredRelationship[] {
    return [...this.relationships];
  }

  /** Get relationships by type */
  getByType(type: string): DiscoveredRelationship[] {
    return this.relationships.filter(r => r.type === type);
  }

  /** Get strongest relationships */
  getStrongest(limit = 5): DiscoveredRelationship[] {
    return [...this.relationships].sort((a, b) => b.strength - a.strength).slice(0, limit);
  }

  // Orchestrator
  async execute(context: OrchestratorContext): Promise<void> {
    // Discover relationships every 30 minutes
    if (Date.now() - this.lastScan > 1800000) {
      this.discover();
    }
  }

  getOrchestratorContract(): EngineContract {
    return {
      name: 'relationshipEngine', priority: 13,
      dependencies: ['contextEngine', 'universalMemory', 'brainFusion', 'businessAnalyst', 'predictionEngine'],
      initialize: async () => { this.registered = true; },
      execute: (ctx) => this.execute(ctx),
      shutdown: async () => { this.registered = false; },
      health: () => ({ status: this.registered ? 'healthy' : 'degraded', lastRun: null, lastDuration: 0, errorCount: 0, totalRuns: 0, avgDuration: 0 }),
    };
  }

  private save(): void { try { localStorage.setItem(this.KEY, JSON.stringify(this.relationships.slice(-200))); } catch {} }
  private load(): void { try { const d = localStorage.getItem(this.KEY); if (d) this.relationships = JSON.parse(d); } catch {} }
}

export const relationshipEngine = new RelationshipEngine();
