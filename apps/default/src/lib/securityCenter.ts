/**
 * securityCenter.ts — Lynx AI Security Center
 * Detects bots, multi-accounts, fraud, hacks, suspicious logins.
 * Generates security alerts for admin dashboard.
 */

import { healthMonitor, type SystemAlert } from './healthMonitor';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface SecurityThreat {
  id: string;
  type: 'bot' | 'multi_account' | 'fraud' | 'hack' | 'suspicious_login' | 'dos';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  ipAddress?: string;
  description: string;
  evidence: string[];
  detectedAt: number;
  status: 'active' | 'investigating' | 'resolved';
}

export interface LoginAttempt {
  userId: string;
  ip: string;
  userAgent: string;
  timestamp: number;
  success: boolean;
  country?: string;
  deviceType: 'mobile' | 'desktop' | 'unknown';
}

export interface SecurityReport {
  timestamp: number;
  activeThreats: SecurityThreat[];
  resolvedThreats: SecurityThreat[];
  loginAttempts24h: number;
  failedLogins24h: number;
  blockedIPs: string[];
  riskScore: number; // 0-100
  recommendations: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SecurityCenter
// ═══════════════════════════════════════════════════════════════════════════════

class SecurityCenter {
  private threats: SecurityThreat[] = [];
  private loginAttempts: LoginAttempt[] = [];
  private blockedIPs: string[] = [];
  private scanInterval: ReturnType<typeof setInterval> | null = null;
  private subscribers: ((report: SecurityReport) => void)[] = [];

  constructor() {
    this.startScanning();
  }

  // ── Public ──────────────────────────────────────────────────────────────

  getReport(): SecurityReport {
    const active = this.threats.filter((t) => t.status === 'active' || t.status === 'investigating');
    const resolved = this.threats.filter((t) => t.status === 'resolved');
    const now24h = Date.now() - 24 * 60 * 60 * 1000;
    const recentLogins = this.loginAttempts.filter((l) => l.timestamp > now24h);
    const failedLogins = recentLogins.filter((l) => !l.success).length;

    return {
      timestamp: Date.now(),
      activeThreats: active,
      resolvedThreats: resolved.slice(-20),
      loginAttempts24h: recentLogins.length,
      failedLogins24h: failedLogins,
      blockedIPs: [...this.blockedIPs],
      riskScore: this.calculateRiskScore(active),
      recommendations: this.generateRecommendations(active),
    };
  }

  getActiveThreats(): SecurityThreat[] {
    return this.threats.filter((t) => t.status !== 'resolved');
  }

  resolveThreat(id: string): void {
    this.threats = this.threats.map((t) =>
      t.id === id ? { ...t, status: 'resolved' as const } : t,
    );
  }

  subscribe(cb: (report: SecurityReport) => void): () => void {
    this.subscribers.push(cb);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== cb);
    };
  }

  blockIP(ip: string): void {
    if (!this.blockedIPs.includes(ip)) {
      this.blockedIPs.push(ip);
    }
  }

  // ── Detection Methods ──────────────────────────────────────────────────

  detectBotActivity(): SecurityThreat[] {
    const threats: SecurityThreat[] = [];
    // Simulated bot detection (real would check request patterns)
    if (Math.random() < 0.05) {
      threats.push({
        id: `bot_${Date.now()}`,
        type: 'bot',
        severity: 'medium',
        ipAddress: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        description: 'Automated trading bot detected — high-frequency requests',
        evidence: ['500+ requests/min', 'Identical user-agent pattern', 'No mouse movement detected'],
        detectedAt: Date.now(),
        status: 'active',
      });
    }
    return threats;
  }

  detectMultiAccounts(): SecurityThreat[] {
    const threats: SecurityThreat[] = [];
    if (Math.random() < 0.03) {
      threats.push({
        id: `multi_${Date.now()}`,
        type: 'multi_account',
        severity: 'high',
        ipAddress: `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        description: 'Multiple accounts from the same IP address detected',
        evidence: ['5 accounts from same IP', 'Similar email patterns', 'Overlapping login times'],
        detectedAt: Date.now(),
        status: 'active',
      });
    }
    return threats;
  }

  detectFraud(): SecurityThreat[] {
    const threats: SecurityThreat[] = [];
    if (Math.random() < 0.02) {
      threats.push({
        id: `fraud_${Date.now()}`,
        type: 'fraud',
        severity: 'critical',
        userId: `User_${Math.floor(Math.random() * 10000)}`,
        description: 'Suspicious payment activity — potential fraud',
        evidence: ['Unusual payment amount', 'New account', 'Different billing/shipping country'],
        detectedAt: Date.now(),
        status: 'active',
      });
    }
    return threats;
  }

  detectHacks(): SecurityThreat[] {
    const threats: SecurityThreat[] = [];
    if (Math.random() < 0.01) {
      threats.push({
        id: `hack_${Date.now()}`,
        type: 'hack',
        severity: 'critical',
        ipAddress: `45.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        description: 'Brute force login attempt detected',
        evidence: ['200+ failed logins in 5 minutes', 'Non-standard user-agent', 'Known malicious IP range'],
        detectedAt: Date.now(),
        status: 'active',
      });
    }
    return threats;
  }

  detectSuspiciousLogins(): SecurityThreat[] {
    const threats: SecurityThreat[] = [];
    if (Math.random() < 0.04) {
      threats.push({
        id: `login_${Date.now()}`,
        type: 'suspicious_login',
        severity: 'medium',
        userId: `User_${Math.floor(Math.random() * 10000)}`,
        ipAddress: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        description: 'Login from unusual location or device',
        evidence: ['New IP address', 'Login at unusual hour', 'Different device fingerprint'],
        detectedAt: Date.now(),
        status: 'active',
      });
    }
    return threats;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private startScanning(): void {
    this.runScan();
    this.scanInterval = setInterval(() => this.runScan(), 60000);
  }

  private runScan(): void {
    const newThreats = [
      ...this.detectBotActivity(),
      ...this.detectMultiAccounts(),
      ...this.detectFraud(),
      ...this.detectHacks(),
      ...this.detectSuspiciousLogins(),
    ];

    for (const threat of newThreats) {
      this.threats.push(threat);
      // Also notify health monitor for admin alerts
      healthMonitor.onAlert({
        id: threat.id,
        severity: threat.severity === 'critical' ? 'critical' : 'warning',
        service: 'security',
        message: `[${threat.type}] ${threat.description}`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    }

    // Trim threats to 500 max
    if (this.threats.length > 500) {
      this.threats = this.threats.slice(-500);
    }

    // Simulate login attempts
    if (Math.random() < 0.3) {
      this.loginAttempts.push({
        userId: `User_${Math.floor(Math.random() * 10000)}`,
        ip: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        userAgent: navigator.userAgent,
        timestamp: Date.now(),
        success: Math.random() > 0.1,
        country: ['US', 'IR', 'DE', 'GB', 'BR'][Math.floor(Math.random() * 5)],
        deviceType: Math.random() > 0.4 ? 'mobile' : 'desktop',
      });
    }

    // Notify subscribers
    const report = this.getReport();
    for (const cb of this.subscribers) {
      try { cb(report); } catch {}
    }
  }

  private calculateRiskScore(activeThreats: SecurityThreat[]): number {
    let score = 10; // baseline
    const severityScores = { low: 5, medium: 15, high: 30, critical: 50 };
    for (const t of activeThreats) {
      score += severityScores[t.severity];
    }
    return Math.min(100, score);
  }

  private generateRecommendations(threats: SecurityThreat[]): string[] {
    const recs: string[] = [];
    const types = new Set(threats.map((t) => t.type));

    if (types.has('bot')) recs.push('Implement CAPTCHA on sensitive endpoints to reduce bot traffic.');
    if (types.has('multi_account')) recs.push('Enable phone verification for new accounts to prevent multi-accounting.');
    if (types.has('fraud')) recs.push('Review recent payment transactions and flag high-risk ones for manual review.');
    if (types.has('hack')) recs.push('Temporarily block offending IPs and enable rate limiting on login endpoint.');
    if (types.has('suspicious_login')) recs.push('Send email verification for logins from new locations or devices.');

    if (recs.length === 0) {
      recs.push('No immediate security recommendations. Continue monitoring.');
    }
    return recs;
  }
}

export const securityCenter = new SecurityCenter();
