/**
 * TeamBattlePage.tsx — Team formation, team leaderboard, and member stats
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Plus, Shield, Crown, Lock, Unlock, TrendingUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useEventsStore } from './eventStore';
import { useAuthStore } from '../../lib/authStore';
import { LiveEvent, EventTeam, EVENT_TYPE_META } from './eventTypes';
import { Avatar, StatusBadge, fmtPct, fmtNum, EmptyState } from './eventUtils';

interface Props { event: LiveEvent }

const TEAM_EMOJIS = ['🐺','🦅','🦁','🐉','🦊','⚡','🔥','🌊','🏹','⚔️'];
const TEAM_COLORS = ['#6366f1','#ec4899','#f59e0b','#22c55e','#06b6d4','#ef4444','#8b5cf6','#f97316'];

export function TeamBattlePage({ event }: Props) {
  const { getTeams, createTeam, joinTeam, isJoined } = useEventsStore();
  const { user } = useAuthStore();
  const meta     = EVENT_TYPE_META[event.type];
  const teams    = getTeams(event.id);

  const [showCreate, setShowCreate] = useState(false);
  const [teamName,   setTeamName]   = useState('');
  const [selEmoji,   setSelEmoji]   = useState('🐺');
  const [view,       setView]       = useState<'board' | 'detail'>(teams.length > 0 ? 'board' : 'board');
  const [selTeam,    setSelTeam]    = useState<EventTeam | null>(null);

  const joined = isJoined(event.id);

  function handleCreate() {
    if (!teamName.trim() || !user) return;
    createTeam(event.id, teamName.trim(), selEmoji, user.id);
    setShowCreate(false);
    setTeamName('');
  }

  function handleJoinTeam(teamId: string) {
    if (!user) return;
    joinTeam(event.id, teamId, user.id);
  }

  // Sort teams by total score
  const sorted = [...teams].sort((a, b) => b.totalScore - a.totalScore).map((t, i) => ({ ...t, rank: i + 1 }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{event.icon}</span>
            <h2 className="text-lg font-black text-foreground">{event.title}</h2>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={event.status} />
            <span className="text-[11px] text-muted-foreground">{sorted.length} teams · {fmtNum(event.currentParticipants)} participants</span>
          </div>
        </div>
        {event.status !== 'completed' && joined && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:brightness-110"
            style={{ background: meta.color }}>
            <Plus className="h-4 w-4" /> Create Team
          </button>
        )}
      </div>

      {/* Create team modal */}
      {showCreate && (
        <div className="rounded-2xl p-5 space-y-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="font-black text-foreground">🛡️ Create Your Team</p>
          <input value={teamName} onChange={e => setTeamName(e.target.value)}
            placeholder="Team name…" maxLength={24}
            className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/40" />
          <div>
            <p className="text-[11px] text-muted-foreground mb-2">Choose emoji</p>
            <div className="flex gap-2 flex-wrap">
              {TEAM_EMOJIS.map(e => (
                <button key={e} onClick={() => setSelEmoji(e)}
                  className={cn('text-xl w-9 h-9 rounded-xl transition-all', selEmoji === e ? 'bg-primary/20 scale-110' : 'bg-white/4 hover:bg-white/8')}>
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!teamName.trim()}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-40 transition-all"
              style={{ background: meta.color }}>
              Create {selEmoji} {teamName || 'Team'}
            </button>
            <button onClick={() => setShowCreate(false)}
              className="px-4 py-2.5 rounded-xl border border-white/10 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Teams grid / board */}
      {sorted.length === 0 ? (
        <EmptyState icon="🛡️" title="No teams yet" body="Be the first to create a team for this event!" />
      ) : (
        <>
          {/* Team scoreboard */}
          <div className="space-y-3">
            <p className="text-xs font-black text-muted-foreground uppercase tracking-wider">Team Standings</p>
            {sorted.map((team, idx) => (
              <motion.div
                key={team.id}
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.05 }}
                className="rounded-2xl overflow-hidden cursor-pointer hover:scale-[1.01] transition-all"
                style={{ background: `${team.color}08`, border: `1px solid ${team.color}20` }}
                onClick={() => setSelTeam(selTeam?.id === team.id ? null : team)}>

                {/* Team header */}
                <div className="flex items-center gap-3 p-4">
                  {/* Rank */}
                  <div className="w-8 text-center shrink-0">
                    {idx === 0 ? <span className="text-xl">🥇</span>
                      : idx === 1 ? <span className="text-xl">🥈</span>
                      : idx === 2 ? <span className="text-xl">🥉</span>
                      : <span className="text-sm font-black text-muted-foreground">#{idx+1}</span>}
                  </div>

                  <span className="text-2xl">{team.emoji}</span>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-black text-sm text-foreground">{team.name}</p>
                      {team.isOpen
                        ? <Unlock className="h-3 w-3 text-emerald-400" />
                        : <Lock className="h-3 w-3 text-red-400" />}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Users className="h-3 w-3" /> {team.members.length + 1}/5
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Capt: <span className="text-foreground">{team.captain.displayName}</span>
                      </span>
                    </div>
                  </div>

                  {/* Score */}
                  <div className="text-right shrink-0">
                    <p className={cn('font-black text-sm tabular-nums', team.totalScore >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {team.totalScore >= 0 ? '+' : ''}{team.totalScore.toFixed(2)}%
                    </p>
                    <p className="text-[9px] text-muted-foreground">avg return</p>
                  </div>

                  {/* Join btn */}
                  {team.isOpen && (team.members.length + 1) < 5 && event.status !== 'completed' && (
                    <button onClick={e => { e.stopPropagation(); handleJoinTeam(team.id); }}
                      className="ml-2 px-3 py-1.5 rounded-xl text-[11px] font-bold text-white transition-all hover:brightness-110"
                      style={{ background: team.color }}>
                      Join
                    </button>
                  )}
                </div>

                {/* Member list (expanded) */}
                {selTeam?.id === team.id && (
                  <div className="border-t px-4 py-3 space-y-2" style={{ borderColor: `${team.color}15` }}>
                    {/* Captain */}
                    <MemberRow participant={team.captain} role="captain" color={team.color} />
                    {/* Members */}
                    {team.members.map(m => (
                      <MemberRow key={m.userId} participant={m} role="member" color={team.color} />
                    ))}
                    {/* Empty slots */}
                    {Array.from({ length: Math.max(0, 4 - team.members.length) }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 py-1.5 opacity-30">
                        <div className="w-7 h-7 rounded-full border border-dashed border-white/20" />
                        <span className="text-xs text-muted-foreground">Open slot</span>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MemberRow({ participant, role, color }: {
  participant: Parameters<typeof Avatar>[0] & { displayName: string; score: number; pnlPct: number; trades: number };
  role: 'captain' | 'member';
  color: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar seed={participant.avatarSeed} size={26} />
      <span className="text-xs font-bold text-foreground flex-1 truncate">{participant.displayName}</span>
      {role === 'captain' && (
        <Crown className="h-3 w-3 shrink-0" style={{ color }} />
      )}
      <span className={cn('text-xs font-black tabular-nums shrink-0', participant.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
        {participant.pnlPct >= 0 ? '+' : ''}{participant.pnlPct.toFixed(1)}%
      </span>
    </div>
  );
}
