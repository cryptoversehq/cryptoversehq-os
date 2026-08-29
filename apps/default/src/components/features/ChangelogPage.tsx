/**
 * ChangelogPage.tsx — /changelog page with version history.
 */
import React from 'react';
import { motion } from 'framer-motion';
import { History, Sparkles } from 'lucide-react';

const VERSIONS = [
  { v:'v2.0.0', date:'June 2026', changes:[
    '🚀 17 AI-powered features launched',
    '🛡️ Pre-Trade Risk Check (0-100 scoring, blocks >80 risk)',
    '📊 Smart Stop-Loss (ATR-based 3-level suggestions)',
    '🧠 Portfolio Health (daily analysis + history)',
    '🎯 Market Prediction Game (daily 3-coin XP challenge)',
    '📈 Social Sentiment Engine (10 coins, 0-100 scores)',
    '📚 Personalized Learning Path (questionnaire + badges)',
    '🔄 Trade Replay with AI coaching (3-phase analysis)',
    '📰 Weekly Sentiment & Psychology Reports',
    '💡 Context-Aware Guidance on every page',
    '🤖 9 Taskade AI Agents with smart routing',
    '🌐 RTL support (Arabic, Persian, Hebrew, Urdu)',
    '🗣️ Voice Assistant (Web Speech API)',
    '📋 Automated Trade Journal (monthly reports + CSV)',
    '⚔️ Strategy Battle Arena + Hall of Fame',
    '💬 Multi-Agent Debate (6 AI personas)',
    '🎙️ Personalized News Feed + Daily Digest',
    '😊 Emotional Detection + Trading Psychology reports',
    '📱 Responsive design for all screen sizes',
    '🔒 ProFeatureGate — all features visible, Pro+ gated',
    '📝 Feedback system + Feature ratings (👍/👎)',
    '⏱️ Lazy loading + DeepSeek streaming for performance',
    '🌍 Translation cache (7-day TTL, batch + parallel)',
  ]},
  { v:'v1.5.0', date:'May 2026', changes:[
    'Agent routing system with console verification',
    'Platform data commands (@platform report/users/trades)',
    'Real-time market data via CoinGecko API',
    'Enhanced translation with Google Translate fallback',
    'DeepSeek API integration with base64 key encoding',
    'Subscription system (Bronze/Silver/Gold/Platinum)',
  ]},
  { v:'v1.0.0', date:'April 2026', changes:[
    'Initial release: Trading Simulator, Academy, Copy Trading',
    'Strategy Marketplace, Backtest Engine',
    'On-Chain Analysis, NFT Analytics',
    'Live Events & Competitions',
    'Lynx AI Chat with DeepSeek',
  ]},
];

export default function ChangelogPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6 pb-20" style={{background:'#0A1929',minHeight:'100vh'}}>
      <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} className="text-center py-6">
        <History className="h-10 w-10 text-yellow-400 mx-auto mb-3"/>
        <h1 className="text-2xl font-black text-white">Changelog</h1>
        <p className="text-sm text-white/40 mt-1">CryptoVerse HQ version history</p>
      </motion.div>

      <div className="space-y-6">
        {VERSIONS.map((ver, vi)=>(
          <motion.div key={vi} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:vi*0.1}}
            className="p-5 rounded-2xl border border-white/10 bg-white/5">
            <div className="flex items-center gap-3 mb-4">
              <span className="px-3 py-1 rounded-lg bg-yellow-500/20 text-yellow-400 text-sm font-bold">{ver.v}</span>
              <span className="text-xs text-white/30">{ver.date}</span>
              {vi===0 && <Sparkles className="h-4 w-4 text-yellow-400"/>}
            </div>
            <div className="space-y-1">
              {ver.changes.map((c,ci)=>(
                <p key={ci} className="text-xs text-white/60 pl-2 border-l-2 border-white/10 hover:border-yellow-500/50 transition-colors">{c}</p>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
