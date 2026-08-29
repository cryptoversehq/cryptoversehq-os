/**
 * HelpPage.tsx — /help documentation page
 * Quick Start, Feature Guide, FAQ sections.
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Zap, HelpCircle, ChevronDown, ChevronRight, Rocket, Shield, Brain, Target, TrendingUp, Sparkles } from 'lucide-react';

const FAQ = [
  { q:'How do I start trading?', a:'Click "Trade" in the sidebar, select a coin, choose Market/Limit order, enter amount, and click Buy/Sell. You start with $100,000 virtual USD.' },
  { q:'What are the AI features?', a:'AI Risk Check, Smart Stop-Loss, Portfolio Health, Prediction Game, Sentiment Engine, Learning Path, Trade Replay, Weekly Reports, and Context Guidance. All Pro+ features are visible to all users with upgrade prompts.' },
  { q:'How do I upgrade to Pro+?', a:'Go to /subscription or click "Upgrade to Pro+" on any locked feature. Plans: Silver ($9.99/mo), Gold ($19.99/mo), Platinum ($29.99/mo).' },
  { q:'How is my portfolio health calculated?', a:'AI analyzes diversification, concentration risk, win rate, P&L, and volatility. Score 0-100 with grade Excellent/Good/Moderate/Poor.' },
  { q:'Can I use a stop-loss?', a:'Yes! Click "TP/SL" in the trading panel. AI can suggest stop-loss levels based on ATR and volatility. Mandatory for new users & high leverage.' },
  { q:'How do I earn XP?', a:'Complete Academy lessons (32 total, 4 per module), make successful trades, and participate in daily prediction games.' },
  { q:'Is my data saved across devices?', a:'Data is stored in localStorage with Taskade DB sync. Login with the same email on any device to access your portfolio.' },
  { q:'What languages are supported?', a:'All languages via Google Translate + DeepSeek. RTL support for Arabic, Persian, Hebrew, Urdu. Translation cache prevents re-translating.' },
];

const FEATURES = [
  { icon: Shield, title:'AI Risk Check', desc:'0-100 risk score before every trade. Blocks dangerous trades.', plan:'Pro+' },
  { icon: Brain, title:'Portfolio Health', desc:'Daily AI analysis of diversification, risk, suggestions.', plan:'Pro+' },
  { icon: Target, title:'Prediction Game', desc:'Predict 3 coins daily. Earn XP. Monthly leaderboard.', plan:'Pro+' },
  { icon: TrendingUp, title:'Sentiment Engine', desc:'10-coin social sentiment with 0-100 mood scores.', plan:'Pro+' },
  { icon: BookOpen, title:'Learning Path', desc:'32 Academy lessons. Personalized path based on your goals.', plan:'All' },
  { icon: Sparkles, title:'Smart Stop-Loss', desc:'ATR-based 3-level SL suggestions. Forced for new users.', plan:'Pro+' },
];

export default function HelpPage() {
  const [openFaq, setOpenFaq] = useState<number|null>(null);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8 pb-20" style={{background:'#0A1929',minHeight:'100vh'}}>
      <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} className="text-center py-6">
        <BookOpen className="h-10 w-10 text-yellow-400 mx-auto mb-3"/>
        <h1 className="text-2xl font-black text-white">Help Center</h1>
      </motion.div>

      {/* Quick Start */}
      <section className="p-5 rounded-2xl border border-white/10 bg-white/5">
        <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><Rocket className="h-5 w-5 text-yellow-400"/>Quick Start</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { step:'1', title:'Create Account', desc:'Sign up with email or Google. You get $100,000 virtual USD instantly.' },
            { step:'2', title:'Explore Dashboard', desc:'Check market sentiment, portfolio health, and daily predictions.' },
            { step:'3', title:'Place First Trade', desc:'Go to Trading, pick a coin, use AI Risk Check, and place your order.' },
          ].map(s=>(
            <div key={s.step} className="p-3 rounded-xl border border-white/10 bg-white/5 text-center">
              <div className="w-8 h-8 rounded-full bg-yellow-500/20 text-yellow-400 font-bold flex items-center justify-center mx-auto mb-2 text-sm">{s.step}</div>
              <p className="text-sm font-bold text-white">{s.title}</p>
              <p className="text-[10px] text-white/40 mt-1">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Feature Guide */}
      <section className="p-5 rounded-2xl border border-white/10 bg-white/5">
        <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><Zap className="h-5 w-5 text-yellow-400"/>Feature Guide</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {FEATURES.map((f,i)=>(
            <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-white/10 bg-white/5">
              <f.icon className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5"/>
              <div>
                <div className="flex items-center gap-2"><p className="text-sm font-bold text-white">{f.title}</p><span className={`text-[9px] px-1.5 py-0.5 rounded ${f.plan==='Pro+'?'bg-yellow-500/20 text-yellow-400':'bg-green-500/20 text-green-400'}`}>{f.plan}</span></div>
                <p className="text-[11px] text-white/50 mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="p-5 rounded-2xl border border-white/10 bg-white/5">
        <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><HelpCircle className="h-5 w-5 text-yellow-400"/>FAQ</h2>
        <div className="space-y-1">
          {FAQ.map((item,i)=>(
            <div key={i} className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <button onClick={()=>setOpenFaq(openFaq===i?null:i)} className="w-full flex items-center justify-between p-3 text-left hover:bg-white/[0.03] transition-colors">
                <span className="text-sm text-white/80">{item.q}</span>
                {openFaq===i?<ChevronDown className="h-4 w-4 text-white/40"/>:<ChevronRight className="h-4 w-4 text-white/40"/>}
              </button>
              {openFaq===i && <div className="px-3 pb-3"><p className="text-xs text-white/50 leading-relaxed">{item.a}</p></div>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
