import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HeadphonesIcon, Plus, X, CheckCircle2, Clock, Loader2,
  Star, MessageCircle, ChevronDown, ChevronUp, Bot, RefreshCw, Send,
} from 'lucide-react';
import { useAuthStore } from '@/lib/authStore';
import { fetchUserTickets, createTicket, closeTicket, Ticket, TicketSection, TicketPriority } from '@/lib/ticketStore';
import { cn } from '@/lib/utils';

const SECTIONS: { value: TicketSection; label: string; emoji: string }[] = [
  { value: 'trade',        label: 'Trading',      emoji: '📈' },
  { value: 'academy',      label: 'Academy',      emoji: '📚' },
  { value: 'marketplace',  label: 'Marketplace',  emoji: '🏪' },
  { value: 'copy-trading', label: 'Copy Trading', emoji: '🔄' },
  { value: 'onchain',      label: 'On-Chain',     emoji: '⛓️' },
  { value: 'nft',          label: 'NFT',          emoji: '🖼️' },
  { value: 'sentiment',    label: 'Sentiment',    emoji: '🧠' },
  { value: 'events',       label: 'Events',       emoji: '🏆' },
  { value: 'general',      label: 'General',      emoji: '💬' },
];

const STATUS_META: Record<Ticket['status'], { label: string; color: string; bg: string; icon: React.ElementType }> = {
  open:           { label: 'Open',           color: '#3b82f6', bg: '#3b82f620', icon: Clock },
  ai_handling:    { label: 'AI Reviewing',   color: '#8b5cf6', bg: '#8b5cf620', icon: Bot },
  admin_handling: { label: 'Admin Handling', color: '#f59e0b', bg: '#f59e0b20', icon: HeadphonesIcon },
  resolved:       { label: 'Resolved',       color: '#22c55e', bg: '#22c55e20', icon: CheckCircle2 },
  closed:         { label: 'Closed',         color: '#6b7280', bg: '#6b728020', icon: CheckCircle2 },
};

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(s => (
        <button key={s} type="button" onClick={() => onChange(s)}
          onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(0)}
          className="transition-transform hover:scale-110 active:scale-95">
          <Star className={cn('h-6 w-6 transition-colors',
            (hover || value) >= s ? 'text-amber-400 fill-amber-400' : 'text-white/20')} />
        </button>
      ))}
    </div>
  );
}

function TicketCard({ ticket, onClose }: { ticket: Ticket; onClose: (id: string, r: number) => Promise<void> }) {
  const [expanded, setExpanded]  = useState(false);
  const [rating,   setRating]    = useState(0);
  const [closing,  setClosing]   = useState(false);
  const [showRate, setShowRate]  = useState(false);
  const meta = STATUS_META[ticket.status];
  const StatusIcon = meta.icon;
  const sec = SECTIONS.find(s => s.value === ticket.section);

  return (
    <motion.div layout className="bg-card border border-white/5 rounded-2xl overflow-hidden">
      <div className="p-4 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 text-lg" style={{ backgroundColor: meta.bg }}>
            {sec?.emoji ?? '💬'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground truncate">{ticket.title}</p>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: meta.bg, color: meta.color }}>
                <StatusIcon className="h-2.5 w-2.5" />{meta.label}
              </span>
            </div>
            <p className="text-[11px] text-white/40 mt-0.5">{sec?.label ?? ticket.section} · {new Date(ticket.createdAt).toLocaleDateString()}</p>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-white/30 flex-shrink-0 mt-1" /> : <ChevronDown className="h-4 w-4 text-white/30 flex-shrink-0 mt-1" />}
        </div>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-white/5">
            <div className="p-4 space-y-3">
              <div>
                <p className="text-[11px] text-white/30 mb-1 uppercase tracking-wider">Your message</p>
                <p className="text-sm text-white/70 leading-relaxed">{ticket.description}</p>
              </div>
              {ticket.aiResponse && (
                <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/15">
                  <p className="text-[11px] text-purple-400 font-semibold mb-1 flex items-center gap-1"><Bot className="h-3 w-3" /> AI Response</p>
                  <p className="text-xs text-white/60 leading-relaxed">{ticket.aiResponse}</p>
                </div>
              )}
              {ticket.adminResponse && (
                <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
                  <p className="text-[11px] text-amber-400 font-semibold mb-1 flex items-center gap-1"><HeadphonesIcon className="h-3 w-3" /> Admin Response</p>
                  <p className="text-xs text-white/60 leading-relaxed">{ticket.adminResponse}</p>
                </div>
              )}
              {ticket.status === 'closed' && ticket.rating !== undefined && (
                <div className="flex items-center gap-2">
                  <p className="text-[11px] text-white/30">Your rating:</p>
                  {[1,2,3,4,5].map(s => <Star key={s} className={cn('h-4 w-4', (ticket.rating??0)>=s?'text-amber-400 fill-amber-400':'text-white/15')} />)}
                </div>
              )}
              {ticket.status === 'resolved' && !showRate && (
                <button onClick={() => setShowRate(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/20 transition-all">
                  <CheckCircle2 className="h-4 w-4" /> Mark Resolved & Rate
                </button>
              )}
              {showRate && (
                <div className="p-3 rounded-xl bg-white/3 border border-white/8 space-y-3">
                  <p className="text-xs text-white/60">Rate your experience:</p>
                  <StarRating value={rating} onChange={setRating} />
                  <div className="flex gap-2">
                    <button onClick={() => setShowRate(false)} className="flex-1 py-2 rounded-xl bg-white/5 text-sm text-white/40 hover:text-white">Cancel</button>
                    <button onClick={async () => { if (!rating) return; setClosing(true); await onClose(ticket.nodeId, rating); setClosing(false); }} disabled={!rating || closing}
                      className="flex-1 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-sm font-bold disabled:opacity-50 transition-all">
                      {closing ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Close Ticket'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}



function NewTicketForm({ onSubmit, onCancel }: {
  onSubmit: (d: { section: TicketSection; title: string; description: string; priority: TicketPriority }) => Promise<void>;
  onCancel: () => void;
}) {
  const [section,  setSection]  = useState<TicketSection>('general');
  const [title,    setTitle]    = useState('');
  const [desc,     setDesc]     = useState('');
  const [prio,     setPrio]     = useState<TicketPriority>('medium');
  const [busy,     setBusy]     = useState(false);
  const ok = title.trim().length > 3 && desc.trim().length > 10;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    await onSubmit({ section, title: title.trim(), description: desc.trim(), priority: prio });
    setBusy(false);
  };

  return (
    <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={submit}
      className="bg-card border border-white/5 rounded-2xl p-5 space-y-4 shadow-lg">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-foreground flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /> New Ticket</h3>
        <button type="button" onClick={onCancel} className="text-white/30 hover:text-white"><X className="h-4 w-4" /></button>
      </div>

      <div>
        <p className="text-[11px] text-white/40 uppercase tracking-wider mb-2">Section</p>
        <div className="grid grid-cols-3 gap-2">
          {SECTIONS.map(s => (
            <button key={s.value} type="button" onClick={() => setSection(s.value)}
              className={cn('flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all',
                section === s.value ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-white/3 border-white/8 text-white/40 hover:border-white/15 hover:text-white/60')}>
              <span>{s.emoji}</span>{s.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] text-white/40 uppercase tracking-wider mb-2">Priority</p>
        <div className="flex gap-2">
          {(['low','medium','high','critical'] as const).map(p => (
            <button key={p} type="button" onClick={() => setPrio(p)}
              className={cn('flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize border transition-all',
                prio===p ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-white/3 border-white/8 text-white/30 hover:text-white/60')}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] text-white/40 uppercase tracking-wider mb-1">Title</p>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Brief description of your issue…"
          className="w-full px-4 py-2.5 rounded-xl bg-secondary/30 border border-white/8 text-sm text-foreground placeholder:text-white/20 focus:outline-none focus:border-primary/40 transition-all" />
      </div>

      <div>
        <p className="text-[11px] text-white/40 uppercase tracking-wider mb-1">Details</p>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4}
          placeholder="Describe your issue in detail…"
          className="w-full px-4 py-2.5 rounded-xl bg-secondary/30 border border-white/8 text-sm text-foreground placeholder:text-white/20 focus:outline-none focus:border-primary/40 transition-all resize-none" />
      </div>

      <button type="submit" disabled={!ok || busy}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-all disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {busy ? 'Submitting…' : 'Submit Ticket'}
      </button>
      <p className="text-[10px] text-white/30 text-center">AI will first review your ticket. If unresolved, a section admin will respond.</p>
    </motion.form>
  );
}

export function TicketCenter() {
  const { user } = useAuthStore();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [success, setSuccess] = useState('');
  const [filter, setFilter]   = useState<'all'|'open'|'resolved'|'closed'>('all');

  const load = useCallback(async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      const d = await fetchUserTickets(user.email);
      setTickets(d.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch { /* silent */ } finally { setLoading(false); }
  }, [user?.email]);

  useEffect(() => { load(); }, [load]);

  const submit = async (data: { section: TicketSection; title: string; description: string; priority: TicketPriority }) => {
    if (!user) return;
    await createTicket({ ...data, userEmail: user.email, userName: user.displayName });
    setShowForm(false);
    setSuccess('Ticket submitted! Lynx AI will review it shortly.');
    setTimeout(() => setSuccess(''), 4000);
    load();
  };

  const handleClose = async (nodeId: string, rating: number) => {
    await closeTicket(nodeId, rating);
    setTickets(prev => prev.map(t => t.nodeId === nodeId ? { ...t, status: 'closed' as const, rating } : t));
  };

  const openCount = tickets.filter(t => ['open','ai_handling','admin_handling'].includes(t.status)).length;
  const resolvedCount = tickets.filter(t => t.status === 'resolved').length;
  const hasTickets = tickets.length > 0;

  const filtered = tickets.filter(t => {
    if (filter === 'open') return ['open','ai_handling','admin_handling'].includes(t.status);
    if (filter === 'resolved') return t.status === 'resolved';
    if (filter === 'closed') return t.status === 'closed';
    return true;
  });

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-foreground flex items-center gap-2">
            <HeadphonesIcon className="h-5 w-5 text-primary" /> Support Center
          </h2>
          <p className="text-xs text-white/40 mt-0.5">{openCount} open · {resolvedCount} awaiting review</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
          {!showForm && (
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all">
              <Plus className="h-4 w-4" /> New Ticket
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {success && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> {success}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && <NewTicketForm onSubmit={submit} onCancel={() => setShowForm(false)} />}
      </AnimatePresence>

      {hasTickets && (
        <div className="flex gap-2 flex-wrap">
          {(['all','open','resolved','closed'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all',
                filter===f ? 'bg-primary/15 text-primary' : 'bg-white/5 text-white/30 hover:text-white/60')}>
              {f}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-white/30">
          <Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Loading tickets…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <MessageCircle className="h-10 w-10 mx-auto mb-3 text-white/10" />
          <p className="text-sm text-white/30">{tickets.length === 0 ? 'No tickets yet — create one if you need help!' : 'No tickets match this filter.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => <TicketCard key={t.nodeId} ticket={t} onClose={handleClose} />)}
        </div>
      )}
    </div>
  );
}

