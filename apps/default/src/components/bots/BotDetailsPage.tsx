/**
 * BotDetailsPage.tsx — Route /bots/:id
 *
 * Deep-linked standalone page for a single bot.
 * Mirrors BotDetailModal's content but rendered as a full page,
 * with a breadcrumb back to /bots and the same tab structure.
 *
 * Used by:
 *  - Direct URL share: /bots/abc123
 *  - "Open Full Page" button inside BotDetailModal
 */

import React, { useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useBotStore } from '../../lib/botStore';
import { BotDetailModal } from './BotDetailModal';
import { CV, BOT_TYPE_META } from './BotConstants';

export function BotDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const getBot = useBotStore(s => s.getBot);

  const bot = useMemo(() => (id ? getBot(id) : null), [id, getBot]);

  if (!bot) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="text-5xl opacity-30">🤖</div>
        <p className="text-lg font-semibold text-muted-foreground">Bot not found</p>
        <Link
          to="/bots"
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
          style={{ background: 'rgba(255,215,0,0.10)', color: CV.gold, border: '1px solid rgba(255,215,0,0.25)' }}
        >
          <ArrowLeft className="h-4 w-4" /> Back to Bots
        </Link>
      </div>
    );
  }

  const meta = BOT_TYPE_META[bot.templateType];

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--background)' }}>
      {/* Breadcrumb */}
      <header
        className="flex items-center gap-3 px-6 py-3 border-b shrink-0"
        style={{ borderColor: 'rgba(255,215,0,0.08)', background: 'var(--bg-card)', backdropFilter: 'blur(12px)' }}
      >
        <Link
          to="/bots"
          className="flex items-center gap-1.5 text-xs font-semibold transition-colors hover:text-foreground"
          style={{ color: CV.gray }}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Trading Bots
        </Link>
        <span style={{ color: 'rgba(255,255,255,0.15)' }}>/</span>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <span>{meta.emoji}</span> {bot.name}
        </span>
      </header>

      {/* Render detail modal in page mode — it fills its container */}
      <div className="flex-1 overflow-hidden relative">
        {/* The modal renders fixed; wrap in a relative container that intercepts */}
        <BotDetailModal
          bot={bot}
          onClose={() => navigate('/bots')}
          pageMode
        />
      </div>
    </div>
  );
}
