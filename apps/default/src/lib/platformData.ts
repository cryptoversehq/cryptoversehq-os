/**
 * platformData.ts — CryptoVerse HQ
 *
 * Provides AI agents with read access to live platform data.
 * Reads users from localStorage (cryptoverse_users) and stores from Zustand.
 */

import { useAuthStore } from './authStore';
import { useTradingStore } from './tradingStore';
import { useAcademyStore } from './academyStore';
import { useBotStore } from './botStore';
import { fetchTickets } from './ticketStore';
import { useStrategyStore } from './strategyStore';
import { useCopyTradingStore } from './copyTradingStore';
import { useOnChainStore } from './onChainStore';
import { useLiveEventStore } from './liveEventStore';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PlatformSnapshot {
  users:       { total: number; admins: number; superAdmins: number; byPlan: Record<string, number> };
  trading:     { balance: number; openPositions: number; totalTrades: number; totalPnl: number };
  academy:     { totalXP: number; completedLessons: number };
  bots:        { total: number; active: number; paused: number; error: number };
  tickets:     { total: number; open: number; resolved: number };
  strategies:  { total: number; listed: number };
  copyTrading: { relationships: number; active: number };
  onChain:     { alerts: number; events: number };
  events:      { total: number; active: number; participants: number };
}

function emptySnapshot(): PlatformSnapshot {
  return {
    users: { total: 0, admins: 0, superAdmins: 0, byPlan: {} },
    trading: { balance: 0, openPositions: 0, totalTrades: 0, totalPnl: 0 },
    academy: { totalXP: 0, completedLessons: 0 },
    bots: { total: 0, active: 0, paused: 0, error: 0 },
    tickets: { total: 0, open: 0, resolved: 0 },
    strategies: { total: 0, listed: 0 },
    copyTrading: { relationships: 0, active: 0 },
    onChain: { alerts: 0, events: 0 },
    events: { total: 0, active: 0, participants: 0 },
  };
}

// ─── Read users from localStorage ───────────────────────────────────────────

function readUsersFromStorage(): { users: Record<string, unknown>[]; byPlan: Record<string, number>; admins: number; superAdmins: number } {
  try {
    const raw = localStorage.getItem('cryptoverse_users');
    if (!raw) return { users: [], byPlan: {}, admins: 0, superAdmins: 0 };
    const data = JSON.parse(raw) as Record<string, { password: string; profile: Record<string, unknown> }>;
    const userList: Record<string, unknown>[] = [];
    const byPlan: Record<string, number> = {};
    let admins = 0, superAdmins = 0;
    for (const [, entry] of Object.entries(data)) {
      const p = entry.profile || {};
      userList.push(p);
      const plan = (p['plan'] as string) || 'bronze';
      byPlan[plan] = (byPlan[plan] || 0) + 1;
      const role = p['role'] as string || 'user';
      if (role === 'admin') admins++;
      if (role === 'super_admin') superAdmins++;
    }
    return { users: userList, byPlan, admins, superAdmins };
  } catch {
    return { users: [], byPlan: {}, admins: 0, superAdmins: 0 };
  }
}

// ─── Read Platform Snapshot ─────────────────────────────────────────────────

export function getPlatformSnapshot(): PlatformSnapshot {
  try {
    const { users, byPlan, admins, superAdmins } = readUsersFromStorage();

    const trading = useTradingStore.getState();
    const pnl = (trading.history || []).reduce((sum: number, t: Record<string, number>) => sum + (t.pnl || 0), 0);

    const academy = useAcademyStore.getState();

    const bots = useBotStore.getState();
    const botList = Object.values((bots as Record<string, Record<string, Record<string, unknown>>>)['bots'] || {});
    let activeBots = 0, pausedBots = 0, errorBots = 0;
    for (const b of botList) {
      const s = b['status'] as string;
      if (s === 'active') activeBots++;
      else if (s === 'paused') pausedBots++;
      else if (s === 'error') errorBots++;
    }

    const strat = useStrategyStore.getState();
    const stratList = Object.values((strat as Record<string, Record<string, Record<string, unknown>>>)['strategies'] || {});
    let listedStrats = 0;
    for (const s of stratList) { if (s['isListed']) listedStrats++; }

    const ct = useCopyTradingStore.getState();
    const relList = Object.values((ct as Record<string, Record<string, Record<string, unknown>>>)['relationships'] || {});
    let activeRels = 0;
    for (const r of relList) { if (r['status'] === 'active') activeRels++; }

    const oc = useOnChainStore.getState();
    const alertList = Object.values((oc as Record<string, Record<string, Record<string, unknown>>>)['alerts'] || {});
    const eventList = Object.values((oc as Record<string, Record<string, Record<string, unknown>>>)['events'] || {});

    const le = useLiveEventStore.getState();
    const liveEvents = Object.values((le as Record<string, Record<string, Record<string, unknown>>>)['events'] || {});
    let activeEvents = 0, totalParticipants = 0;
    for (const e of liveEvents) {
      if (e['status'] === 'active') activeEvents++;
      totalParticipants += ((e['participantCount'] as number) || 0);
    }

    return {
      users:       { total: users.length, admins, superAdmins, byPlan },
      trading:     { balance: trading.balance, openPositions: trading.positions?.length || 0, totalTrades: trading.history?.length || 0, totalPnl: Math.round(pnl * 100) / 100 },
      academy:     { totalXP: academy.totalXP, completedLessons: (academy.completedLessons as Set<string>)?.size || 0 },
      bots:        { total: botList.length, active: activeBots, paused: pausedBots, error: errorBots },
      tickets:     { total: 0, open: 0, resolved: 0 },
      strategies:  { total: stratList.length, listed: listedStrats },
      copyTrading: { relationships: relList.length, active: activeRels },
      onChain:     { alerts: alertList.length, events: eventList.length },
      events:      { total: liveEvents.length, active: activeEvents, participants: totalParticipants },
    };
  } catch (err) {
    console.warn('[platformData] Error:', err);
    return emptySnapshot();
  }
}

// ─── Format for AI ───────────────────────────────────────────────────────────

export function formatSnapshotForAI(snap: PlatformSnapshot): string {
  return `
LIVE PLATFORM DATA:
Users: ${snap.users.total} total (${snap.users.admins} admins, ${snap.users.superAdmins} super admins), Plans: ${JSON.stringify(snap.users.byPlan)}
Trading: $${snap.trading.balance.toLocaleString()} balance, ${snap.trading.openPositions} open positions, ${snap.trading.totalTrades} total trades, PnL: $${snap.trading.totalPnl}
Academy: ${snap.academy.totalXP} XP, ${snap.academy.completedLessons} lessons completed
Bots: ${snap.bots.total} total (${snap.bots.active} active, ${snap.bots.paused} paused, ${snap.bots.error} errors)
Tickets: use @platform tickets for live ticket data
Strategies: ${snap.strategies.total} total (${snap.strategies.listed} listed)
Copy Trading: ${snap.copyTrading.relationships} relationships (${snap.copyTrading.active} active)
On-Chain: ${snap.onChain.alerts} alerts, ${snap.onChain.events} events
Events: ${snap.events.total} total (${snap.events.active} active, ${snap.events.participants} participants)
`.trim();
}

// ─── @platform command handler ───────────────────────────────────────────────

export async function handlePlatformCommand(
  command: string,
  userRole: string,
): Promise<string | null> {
  const cmd = command.trim().toLowerCase();

  if (cmd === '@platform report' || cmd === '@platform status') {
    const snap = getPlatformSnapshot();
    return `📊 **Platform Report**

${formatSnapshotForAI(snap)}

_Data refreshed at ${new Date().toLocaleString()}_`;
  }

  const isAdmin = userRole === 'admin' || userRole === 'super_admin';

  if (cmd === '@platform users') {
    if (!isAdmin) return '⛔ Requires admin or super admin access.';
    const { users } = readUsersFromStorage();
    const list = users.slice(0, 20).map(u =>
      `- ${u['displayName'] || u['email']} (${u['role'] || 'user'}, ${u['plan'] || 'bronze'})`
    ).join('\n');
    return `👥 **Users** (${users.length} total, showing first 20):

${list}${users.length > 20 ? `\n\n_...and ${users.length - 20} more_` : ''}`;
  }

  if (cmd === '@platform trades') {
    if (!isAdmin) return '⛔ Requires admin or super admin access.';
    const trading = useTradingStore.getState();
    const history = trading.history?.slice(0, 10) || [];
    if (history.length === 0) return '📈 No trades recorded yet.';
    const list = history.map((t: Record<string, unknown>) =>
      `- ${t['side']} ${t['symbol']} ${t['action']} | PnL: $${t['pnl']} | ${t['timestamp']}`
    ).join('\n');
    const pnl = history.reduce((sum: number, t: Record<string, number>) => sum + (t.pnl || 0), 0);
    return `📈 **Recent Trades** (last ${history.length}):

${list}

Total PnL: $${Math.round(pnl * 100) / 100}`;
  }

  if (cmd === '@platform bots') {
    if (!isAdmin) return '⛔ Requires admin or super admin access.';
    const bots = useBotStore.getState();
    const botList = Object.values((bots as Record<string, Record<string, Record<string, unknown>>>)['bots'] || {});
    if (botList.length === 0) return '🤖 No bots deployed yet.';
    const list = botList.slice(0, 15).map(b =>
      `- ${b['name'] || 'Unnamed'} (${b['type'] || 'unknown'}, ${b['status']}) PnL: $${b['pnl'] || 0}`
    ).join('\n');
    return `🤖 **Bots** (${botList.length} total):

${list}${botList.length > 15 ? `\n\n_...and ${botList.length - 15} more_` : ''}`;
  }

  if (cmd === '@platform tickets') {
    if (!isAdmin) return '⛔ Requires admin or super admin access.';
    try {
      const tickets = await fetchTickets();
      if (tickets.length === 0) return '🎫 No tickets found.';
      const open = tickets.filter(t => t.status === 'open' || t.status === 'ai_handling' || t.status === 'admin_handling');
      const list = open.slice(0, 10).map(t =>
        `- #${t.nodeId.slice(-6)} [${t.section}] ${t.title} (${t.priority}, ${t.status})`
      ).join('\n');
      return `🎫 **Open Tickets** (${open.length} of ${tickets.length} total):

${list}${open.length > 10 ? `\n\n_...and ${open.length - 10} more_` : open.length === 0 ? '_No open tickets_' : ''}`;
    } catch {
      return '🎫 Unable to fetch tickets at this moment.';
    }
  }

  if (cmd === '@platform super') {
    if (userRole !== 'super_admin') return '⛔ Requires super admin access.';
    const snap = getPlatformSnapshot();
    return `👑 **Super Admin Dashboard**

${formatSnapshotForAI(snap)}

Admins: ${snap.users.admins} | Super Admins: ${snap.users.superAdmins}
Plans: ${JSON.stringify(snap.users.byPlan)}

_Use @platform users/trades/bots/tickets for details_`;
  }

  return null;
}

export function isPlatformCommand(message: string): boolean {
  return message.trim().toLowerCase().startsWith('@platform');
}
