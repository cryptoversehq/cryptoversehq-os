/**
 * TeamBattleFullPage.tsx — Spec §3.4
 * Live team score bar, member contribution table, team chat, strategy voting
 */
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, MessageSquare, Crown, Send, ThumbsUp,
  Shield, TrendingUp, Users, Zap, Check,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useEventsStore } from './eventStore';
import { useAuthStore } from '../../lib/authStore';
import { EventTeam, EventParticipant, EVENT_TYPE_META } from './eventTypes';
import { Avatar, StatusBadge, fmtPct, fmtNum } from './eventUtils';
import { toast } from 'sonner';

// ── Score bar (bulls vs bears) ────────────────────────────────────────────────

function TeamScoreBar({ teamA, teamB }: { teamA: EventTeam; teamB: EventTeam }) {
  const total  = teamA.totalScore + teamB.totalScore;
  const pctA   = total > 0 ? (teamA.totalScore / total) * 100 : 50;
  const leader = teamA.totalScore > teamB.totalScore ? teamA : teamB;
  const diff   = Math.abs(teamA.totalScore - teamB.totalScore).toFixed(2);

  return (
    <div className="rounded-3xl p-6 text-center"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>

      <div className="flex items-center justify-between gap-4 mb-6">
        {/* Team A */}
        <div className="flex-1 text-center">
          <span className="text-3xl">{teamA.emoji}</span>
          <p className="font-black text-foreground mt-1">{teamA.name}</p>
          <p className="text-3xl font-black mt-2" style={{ color: teamA.color }}>
            {teamA.totalScore.toFixed(2)}
          </p>
          <p className="text-[10px] text-muted-foreground">Points</p>
        </div>

        <div className="shrink-0 px-4">
          <p className="text-sm font-black text-muted-foreground">VS</p>
        </div>

        {/* Team B */}
        <div className="flex-1 text-center">
          <span className="text-3xl">{teamB.emoji}</span>
          <p className="font-black text-foreground mt-1">{teamB.name}</p>
          <p className="text-3xl font-black mt-2" style={{ color: teamB.color }}>
            {teamB.totalScore.toFixed(2)}
          </p>
          <p className="text-[10px] text-muted-foreground">Points</p>
        </div>
      </div>

      {/* Bar */}
      <div className="h-3 rounded-full overflow-hidden flex mb-3">
        <div className="h-full rounded-l-full transition-all duration-700"
          style={{ width: `${pctA}%`, background: teamA.color }} />
        <div className="h-full rounded-r-full flex-1 transition-all duration-700"
          style={{ background: teamB.color }} />
      </div>

      <p className="text-sm font-bold text-muted-foreground">
        <span className="text-foreground font-black">{leader.name}</span> leading by{' '}
        <span style={{ color: leader.color }} className="font-black">{diff} points</span>
      </p>
    </div>
  );
}

// ── Member contribution row ───────────────────────────────────────────────────

function MemberRow({ member, totalTeamScore, isMe }: { member: EventParticipant; totalTeamScore: number; isMe?: boolean }) {
  const contribution = totalTeamScore > 0 ? (member.score / totalTeamScore) * 100 : 0;
  const roleLabel = member.teamRole === 'captain' ? 'Captain' : 'Trader';

  return (
    <tr className={cn('border-b border-white/4 last:border-0', isMe && 'bg-primary/5')}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Avatar seed={member.avatarSeed} size={28} />
          <div>
            <div className="flex items-center gap-1.5">
              <span className={cn('text-sm font-bold', isMe ? 'text-primary' : 'text-foreground')}>{member.displayName}</span>
              {isMe && <span className="text-[9px] px-1.5 rounded-full bg-primary/20 text-primary font-black">YOU</span>}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-xs">
        <div className="flex items-center gap-1">
          {member.teamRole === 'captain' && <Crown className="h-3 w-3 text-amber-400" />}
          <span className="text-muted-foreground">{roleLabel}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <span className={cn('font-black text-sm tabular-nums', member.score >= 0 ? 'text-emerald-400' : 'text-red-400')}>
          {member.score.toFixed(1)}
        </span>
      </td>
      <td className="px-4 py-3 text-right text-xs text-muted-foreground">{member.trades}</td>
      <td className="px-4 py-3 min-w-[120px]">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-white/5">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, contribution)}%`, background: '#6366f1' }} />
          </div>
          <span className="text-[10px] font-bold text-muted-foreground w-8 text-right">{Math.round(contribution)}%</span>
        </div>
      </td>
    </tr>
  );
}

// ── Strategy card ─────────────────────────────────────────────────────────────

const STRATEGIES = [
  { id: 's1', label: 'Aggressive — Focus on high momentum altcoins', proposer: 'CryptoMaster', votes: 4, maxVotes: 5 },
  { id: 's2', label: 'Conservative — BTC & ETH only, low leverage',  proposer: 'SmartTrader',  votes: 2, maxVotes: 5 },
];

function StrategyCard({ strategy, onVote }: { strategy: typeof STRATEGIES[0]; onVote: (id: string) => void }) {
  const pct = (strategy.votes / strategy.maxVotes) * 100;
  return (
    <div className="p-4 rounded-2xl"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-bold text-foreground">{strategy.label}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Proposed by: {strategy.proposer}</p>
        </div>
        <button onClick={() => onVote(strategy.id)}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/15 text-primary text-xs font-bold hover:bg-primary/25 transition-colors border border-primary/20">
          <ThumbsUp className="h-3 w-3" /> Vote
        </button>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-white/5">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] text-muted-foreground font-bold">{strategy.votes}/{strategy.maxVotes}</span>
      </div>
    </div>
  );
}

// ── Chat message ──────────────────────────────────────────────────────────────

interface ChatMsg { id: string; user: string; seed: string; text: string; ts: string; isMe?: boolean }

const INIT_MESSAGES: ChatMsg[] = [
  { id: '1', user: 'CryptoMaster', seed: 'cm', text: 'BTC looking strong! Everyone buy the dip!', ts: '10:23' },
  { id: '2', user: 'SmartTrader', seed: 'st', text: 'ETH/BTC pair showing divergence. Watch for entry.', ts: '10:31' },
  { id: '3', user: 'BTCWhale', seed: 'bw', text: 'SOL breaking resistance at $180 🚀', ts: '10:45' },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export function TeamBattleFullPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getEvent, getTeams, isJoined, joinEvent, sendChatMessage, getChatMessages } = useEventsStore();
  const { user } = useAuthStore();

  const event  = getEvent(id ?? '');
  const teams  = getTeams(id ?? '');
  const joined = isJoined(id ?? '');

  const [chatInput,   setChatInput]   = useState('');
  const [strategies,  setStrategies]  = useState(STRATEGIES);
  const [localMsgs,   setLocalMsgs]   = useState<ChatMsg[]>(INIT_MESSAGES);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [localMsgs]);

  if (!event) return <div className="flex items-center justify-center h-full"><button onClick={() => navigate('/events')} className="text-primary underline">← Back</button></div>;

  const meta = EVENT_TYPE_META[event.type];

  // Use first two teams for the score bar
  const teamA = teams[0];
  const teamB = teams[1];

  // My team = first team for demo
  const myTeam = joined ? teams[0] : null;

  function handleSend() {
    if (!chatInput.trim() || !user) return;
    const msg: ChatMsg = {
      id:   Date.now().toString(),
      user: user.displayName,
      seed: user.id,
      text: chatInput.trim(),
      ts:   new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      isMe: true,
    };
    setLocalMsgs(m => [...m, msg]);
    setChatInput('');
  }

  function handleVote(stratId: string) {
    setStrategies(prev => prev.map(s =>
      s.id === stratId ? { ...s, votes: Math.min(s.maxVotes, s.votes + 1) } : s,
    ));
    toast.success('Vote submitted!');
  }

  const allMembers = myTeam ? [myTeam.captain, ...myTeam.members] : [];
  const totalTeamScore = allMembers.reduce((s, m) => s + m.score, 0);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/events/${event.id}`)}
            className="p-2 rounded-xl bg-white/4 hover:bg-white/8 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">{event.icon}</span>
              <h1 className="font-black text-foreground text-lg">{event.title}</h1>
              <StatusBadge status={event.status} />
            </div>
            <p className="text-xs text-muted-foreground">Team Battle</p>
          </div>
        </div>
        <button onClick={() => {}}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-white/4 border border-white/8 hover:bg-white/8 transition-colors">
          <MessageSquare className="h-3.5 w-3.5" /> Chat
        </button>
      </div>

      {/* Score bar */}
      {teamA && teamB && <TeamScoreBar teamA={teamA} teamB={teamB} />}

      {/* My team section */}
      {myTeam ? (
        <div className="space-y-4">
          {/* Team header */}
          <div className="flex items-center gap-2">
            <span className="text-xl">{myTeam.emoji}</span>
            <p className="font-black text-foreground">Your Team: {myTeam.name}</p>
          </div>

          {/* Member table */}
          <div className="rounded-2xl overflow-hidden border border-white/6">
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[480px]">
                <thead style={{ background: 'rgba(0,0,0,0.25)' }}>
                  <tr className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Member</th>
                    <th className="px-4 py-3 text-left">Role</th>
                    <th className="px-4 py-3 text-right">Points</th>
                    <th className="px-4 py-3 text-right">Trades</th>
                    <th className="px-4 py-3 text-left pl-6">Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  <MemberRow member={{ ...myTeam.captain, displayName: user?.displayName ?? 'You' }} totalTeamScore={totalTeamScore} isMe />
                  {myTeam.members.map(m => (
                    <MemberRow key={m.userId} member={m} totalTeamScore={totalTeamScore} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Not joined CTA */
        <div className="rounded-2xl p-6 text-center"
          style={{ background: `${meta.color}08`, border: `1px solid ${meta.color}20` }}>
          <Shield className="h-8 w-8 mx-auto mb-3" style={{ color: meta.color }} />
          <p className="font-black text-foreground mb-1">Join a Team</p>
          <p className="text-sm text-muted-foreground mb-4">Register to join or create a team and compete!</p>
          <button onClick={() => user && joinEvent(event.id, user.id, user.displayName)}
            className="px-6 py-2.5 rounded-xl font-bold text-sm text-white"
            style={{ background: meta.color }}>
            Join Event
          </button>
        </div>
      )}

      {/* All teams standings */}
      <div className="space-y-3">
        <p className="text-xs font-black text-muted-foreground uppercase tracking-wider">All Teams</p>
        {[...teams].sort((a, b) => b.totalScore - a.totalScore).map((team, i) => (
          <div key={team.id} className="flex items-center gap-4 p-4 rounded-2xl"
            style={{ background: `${team.color}06`, border: `1px solid ${team.color}18` }}>
            <span className="text-muted-foreground font-bold text-sm w-6 shrink-0">#{i + 1}</span>
            <span className="text-2xl">{team.emoji}</span>
            <div className="flex-1">
              <p className="font-bold text-sm text-foreground">{team.name}</p>
              <p className="text-[10px] text-muted-foreground">{team.members.length + 1} members</p>
            </div>
            <p className="font-black text-sm tabular-nums" style={{ color: team.color }}>
              {team.totalScore.toFixed(2)} pts
            </p>
          </div>
        ))}
      </div>

      {/* Team chat + strategies in a grid */}
      <div className="grid lg:grid-cols-2 gap-5">

        {/* Team Chat */}
        <div className="rounded-2xl overflow-hidden flex flex-col"
          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', minHeight: 340 }}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 shrink-0">
            <MessageSquare className="h-4 w-4" style={{ color: meta.color }} />
            <p className="text-sm font-black text-foreground">Team Chat</p>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {localMsgs.map(msg => (
              <div key={msg.id} className={cn('flex gap-2.5', msg.isMe && 'flex-row-reverse')}>
                <Avatar seed={msg.seed} size={26} />
                <div className={cn('max-w-[80%]', msg.isMe && 'items-end flex flex-col')}>
                  <div className="flex items-baseline gap-1.5 mb-0.5" style={{ flexDirection: msg.isMe ? 'row-reverse' : 'row' }}>
                    <span className="text-[10px] font-black text-muted-foreground">{msg.user}</span>
                    <span className="text-[9px] text-muted-foreground/50">{msg.ts}</span>
                  </div>
                  <div className={cn(
                    'text-xs px-3 py-2 rounded-2xl',
                    msg.isMe ? 'text-white rounded-tr-sm' : 'text-foreground rounded-tl-sm',
                  )}
                    style={{ background: msg.isMe ? meta.color : 'rgba(255,255,255,0.06)' }}>
                    {msg.text}
                  </div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="px-4 py-3 border-t border-white/5 shrink-0 flex gap-2">
            <input value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Type a message…"
              className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/8 text-xs focus:outline-none focus:border-primary/30" />
            <button onClick={handleSend} disabled={!chatInput.trim()}
              className="p-2 rounded-xl text-white disabled:opacity-30 hover:brightness-110 transition-all"
              style={{ background: meta.color }}>
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Team Strategies */}
        <div className="space-y-4">
          <p className="text-xs font-black text-muted-foreground uppercase tracking-wider">Team Strategies</p>
          <div className="space-y-3">
            {strategies.map(s => <StrategyCard key={s.id} strategy={s} onVote={handleVote} />)}
          </div>

          {/* Time remaining */}
          <div className="flex items-center gap-3 p-4 rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Zap className="h-5 w-5 text-amber-400 shrink-0" />
            <div>
              <p className="text-xs font-black text-foreground">Battle Timeline</p>
              <p className="text-[10px] text-muted-foreground">
                {event.status === 'live' ? 'Event is active' : `Starts ${new Date(event.startAt).toLocaleDateString()}`} · {event.durationLabel} total
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
