/**
 * WhatsNewPage.tsx — Public release notes listing all 17 features.
 * Accessible to all users. Shows Pro+ gating on each feature.
 */
import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ALL = [
  { cat:'🛡 AI Trading Systems', items:[
    {icon:'🛡',name:'Pre-Trade Risk Check',desc:'0-100 risk score before every trade. Blocks trades over 80 risk. Checks position size, leverage, stop-loss, and correlation.',pro:true},
    {icon:'📊',name:'Smart Stop-Loss Suggestions',desc:'ATR-based 3-level stop-loss (conservative/moderate/aggressive). Forced for new users and high leverage trades.',pro:true},
    {icon:'🧠',name:'AI Portfolio Health Check',desc:'Daily portfolio analysis: diversification, concentration risk, volatility. Actionable improvement suggestions.',pro:true},
    {icon:'🎯',name:'Market Prediction Game',desc:'Daily 3-coin prediction challenge. Earn XP for correct predictions. Monthly leaderboard.',pro:true},
    {icon:'📈',name:'Social Sentiment Engine',desc:'Real-time sentiment scores (0-100) for all 10 major coins. Market mood widget on dashboard.',pro:true},
    {icon:'📚',name:'Personalized Learning Path',desc:'AI-generated lesson plan based on your goals, interests, and schedule. Adaptive difficulty with badges.',pro:true},
    {icon:'🔄',name:'Trade Replay with AI Coaching',desc:'Replay past trades at 1x/2x/5x speed. AI analysis at 3 moments: before entry, during, and after exit.',pro:true},
  ]},
  { cat:'🤖 AI Intelligence', items:[
    {icon:'📰',name:'Weekly Sentiment Reports',desc:'Comprehensive weekly market report with outlook, best/worst performers, and trading tips.',pro:true},
    {icon:'💡',name:'Context-Aware Guidance',desc:'Page-specific AI tips based on your current location, level, and behavior. Dismissible.',pro:true},
    {icon:'🔍',name:'AI Error Detection',desc:'Automatic frontend error capture with DeepSeek diagnosis. Severity classification and deduplication.',pro:false},
    {icon:'🎙',name:'Voice Assistant',desc:'Web Speech API voice commands for trading, portfolio queries, and navigation. Hands-free control.',pro:true},
    {icon:'📋',name:'Automated Trade Journal',desc:'Every trade auto-logged with AI analysis. Monthly reports with behavioral patterns. CSV export.',pro:true},
    {icon:'📡',name:'Personalized News Feed',desc:'AI-filtered crypto news based on your portfolio holdings. Daily digest. Breaking news alerts.',pro:true},
  ]},
  { cat:'👥 Social & Competitive', items:[
    {icon:'👥',name:'Social Trading Feed',desc:'Share trades, follow successful traders, AI quality scoring. Top Trader of the Week.',pro:true},
    {icon:'⚔',name:'Strategy Battle Arena',desc:'Pit two strategies against each other on 30-day historical data. Strategy Hall of Fame.',pro:true},
    {icon:'🗣',name:'Multi-Agent Debate',desc:'6 AI personas debate trading topics. Get bull/bear/analyst perspectives in one view.',pro:true},
    {icon:'😊',name:'Emotional Detection',desc:'AI mood analysis from chat text and trading behavior. Weekly psychology reports.',pro:true},
  ]},
];

export default function WhatsNewPage() {
  const navigate = useNavigate();
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8" style={{background:'#0A1929',minHeight:'100vh'}}>
      <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} className="text-center py-8">
        <Sparkles className="h-10 w-10 text-yellow-400 mx-auto mb-3"/>
        <h1 className="text-2xl font-black text-white">What's New in CryptoVerse HQ</h1>
        <p className="text-sm text-white/40 mt-2">17 AI-powered features to transform your crypto trading experience</p>
      </motion.div>

      {ALL.map((section,si)=>(
        <motion.div key={si} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:si*0.1}}>
          <h2 className="text-lg font-bold text-white/80 mb-3">{section.cat}</h2>
          <div className="space-y-2">
            {section.items.map((item,ii)=>(
              <div key={ii} className="flex items-start gap-3 p-3 rounded-xl border border-white/10 bg-white/5">
                <span className="text-2xl shrink-0">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">{item.name}</h3>
                    {item.pro && <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-semibold">PRO+</span>}
                  </div>
                  <p className="text-xs text-white/50 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      ))}

      <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.5}}
        className="text-center p-6 rounded-2xl border border-white/10"
        style={{background:'linear-gradient(135deg,rgba(255,215,0,0.08),rgba(255,149,0,0.04))'}}>
        <Crown className="h-8 w-8 text-yellow-400 mx-auto mb-2"/>
        <h3 className="text-lg font-bold text-white">Ready to unlock all features?</h3>
        <p className="text-sm text-white/40 mt-1 mb-4">Pro+ plans start at $9.99/month. Cancel anytime.</p>
        <button onClick={()=>navigate('/subscription')} className="px-6 py-3 rounded-xl text-sm font-bold text-white"
          style={{background:'linear-gradient(135deg,#FFD700,#FF9500)',color:'#0A1929'}}>Upgrade to Pro+</button>
      </motion.div>
    </div>
  );
}
