/**
 * AllFeaturesTest.tsx — Debug page at /debug/all-features
 * Admin-only. Lists all 17 features, status, run tests, show JSON results.
 */
import React, { useState } from 'react';
import { useAuthStore } from '@/lib/authStore';
import { motion } from 'framer-motion';

type FeatureStatus = 'idle'|'testing'|'pass'|'fail';

interface FeatureInfo {
  id: string; name: string; category: string; test: () => Promise<{ok:boolean;detail:string}>;
}

const ALL_FEATURES: FeatureInfo[] = [
  // ── Original 10 ──
  { id:'social_sentiment', name:'Social Sentiment Engine', category:'Feature', test: async()=>{ const m=await import('@/features/socialSentimentEngine'); try{await m.fetchSentimentSnapshot();return{ok:true,detail:'Snapshot fetched'};}catch(e){return{ok:false,detail:String(e)};}} },
  { id:'trade_replay', name:'Trade Replay', category:'Feature', test: async()=>{ try{const m=await import('@/features/tradeReplay');return{ok:true,detail:`Replay speeds: ${m.REPLAY_SPEEDS.join(',')}`};}catch(e){return{ok:false,detail:String(e)};} } },
  { id:'prediction_game', name:'Prediction Game', category:'Feature', test: async()=>{ try{const m=await import('@/features/predictionGame'); const c=m.getDailyChallenge(); return{ok:!!c.coins.length,detail:`Coins: ${c.coins.join(',')}`};}catch(e){return{ok:false,detail:String(e)};} } },
  { id:'voice_assistant', name:'Voice Assistant', category:'Feature', test: async()=>{ try{const m=await import('@/features/voiceAssistant'); return{ok:true,detail:`Supported: ${m.isVoiceSupported()}`};}catch(e){return{ok:false,detail:String(e)};} } },
  { id:'personalized_news', name:'Personalized News', category:'Feature', test: async()=>{ try{const m=await import('@/features/personalizedNews'); const n=await m.fetchPortfolioNews(); return{ok:true,detail:`${n.length} news items`};}catch(e){return{ok:false,detail:String(e)};} } },
  { id:'social_feed', name:'Social Trading Feed', category:'Feature', test: async()=>{ try{const m=await import('@/features/socialTradingFeed'); const f=m.getFeed(); return{ok:true,detail:`${f.length} posts in feed`};}catch(e){return{ok:false,detail:String(e)};} } },
  { id:'emotional_detection', name:'Emotional Detection', category:'Feature', test: async()=>{ try{const m=await import('@/features/emotionalDetection'); const mood=m.getCurrentMoodMeter(); return{ok:true,detail:`Mood: ${mood.mood} (${mood.percentage}%)`};}catch(e){return{ok:false,detail:String(e)};} } },
  { id:'strategy_battle', name:'Strategy Battle', category:'Feature', test: async()=>{ try{const m=await import('@/features/strategyBattle'); return{ok:true,detail:`${m.PREMADE_STRATEGIES.length} premade strategies`};}catch(e){return{ok:false,detail:String(e)};} } },
  { id:'auto_journal', name:'Automated Journaling', category:'Feature', test: async()=>{ try{const m=await import('@/features/autoJournal'); const s=m.getJournalStats(); return{ok:true,detail:s?`${s.totalTrades} trades, ${s.winRate}% wins`:'No trades yet'};}catch(e){return{ok:false,detail:String(e)};} } },
  { id:'multi_agent', name:'Multi-Agent Debate', category:'Feature', test: async()=>{ try{const m=await import('@/features/multiAgentDebate'); return{ok:true,detail:`${Object.keys(m.PERSONAS).length} personas`};}catch(e){return{ok:false,detail:String(e)};} } },

  // ── Enhanced 7 ──
  { id:'risk_check', name:'Pre-Trade Risk Check (Enhanced)', category:'AI System', test: async()=>{ try{const m=await import('@/features/preTradeRiskCheckEnhanced'); return{ok:true,detail:'Risk analysis module loaded'};}catch(e){return{ok:false,detail:String(e)};} } },
  { id:'smart_sl', name:'Smart Stop-Loss (Enhanced)', category:'AI System', test: async()=>{ try{const m=await import('@/features/smartStopLossEnhanced'); return{ok:true,detail:'SL module loaded'};}catch(e){return{ok:false,detail:String(e)};} } },
  { id:'context_guide', name:'Context-Aware Guidance (Enhanced)', category:'AI System', test: async()=>{ try{const m=await import('@/features/contextAwareGuidanceEnhanced'); return{ok:true,detail:'Guidance module loaded'};}catch(e){return{ok:false,detail:String(e)};} } },
  { id:'error_monitor', name:'AI Error Detection (Enhanced)', category:'AI System', test: async()=>{ try{const m=await import('@/features/errorMonitorEnhanced'); return{ok:true,detail:'Error monitor loaded'};}catch(e){return{ok:false,detail:String(e)};} } },
  { id:'portfolio_health', name:'Portfolio Health (Enhanced)', category:'AI System', test: async()=>{ try{const m=await import('@/features/portfolioHealthEnhanced'); return{ok:true,detail:'Health module loaded'};}catch(e){return{ok:false,detail:String(e)};} } },
  { id:'learning_path', name:'Learning Path (Enhanced)', category:'AI System', test: async()=>{ try{const m=await import('@/features/learningPathEnhanced'); return{ok:true,detail:'Path module loaded'};}catch(e){return{ok:false,detail:String(e)};} } },
  { id:'weekly_sentiment', name:'Weekly Sentiment Report (Enhanced)', category:'AI System', test: async()=>{ try{const m=await import('@/features/weeklySentimentEnhanced'); return{ok:true,detail:'Report module loaded'};}catch(e){return{ok:false,detail:String(e)};} } },
];

export default function AllFeaturesTest() {
  const { user } = useAuthStore();
  const [results, setResults] = useState<Record<string,FeatureStatus>>({});
  const [details, setDetails] = useState<Record<string,string>>({});
  const [running, setRunning] = useState(false);

  const isAdmin = user?.role==='admin'||user?.role==='super_admin';
  if (!isAdmin) return <div className="p-10 text-center text-red-400">🔒 Admin access only</div>;

  async function runAll() {
    setRunning(true);
    for (const f of ALL_FEATURES) {
      setResults(p=>({...p,[f.id]:'testing'}));
      try {
        const r = await f.test();
        setResults(p=>({...p,[f.id]:r.ok?'pass':'fail'}));
        setDetails(p=>({...p,[f.id]:r.detail}));
      } catch(e) {
        setResults(p=>({...p,[f.id]:'fail'}));
        setDetails(p=>({...p,[f.id]:String(e)}));
      }
    }
    setRunning(false);
  }

  async function testOne(f: FeatureInfo) {
    setResults(p=>({...p,[f.id]:'testing'}));
    try {
      const r = await f.test();
      setResults(p=>({...p,[f.id]:r.ok?'pass':'fail'}));
      setDetails(p=>({...p,[f.id]:r.detail}));
    } catch(e) {
      setResults(p=>({...p,[f.id]:'fail'}));
      setDetails(p=>({...p,[f.id]:String(e)}));
    }
  }

  const passCount = Object.values(results).filter(v=>v==='pass').length;
  const failCount = Object.values(results).filter(v=>v==='fail').length;
  const icons: Record<FeatureStatus,string> = { idle:'⬜', testing:'⏳', pass:'✅', fail:'❌' };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" style={{background:'#0A1929',minHeight:'100vh'}}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Feature Test Dashboard</h1>
          <p className="text-sm text-white/40 mt-1">17 features · {passCount} pass · {failCount} fail · Admin only</p>
        </div>
        <button onClick={runAll} disabled={running}
          className="px-6 py-3 rounded-xl text-sm font-bold text-white transition-all"
          style={{background:running?'#555':'linear-gradient(135deg,#FFD700,#FF9500)',color:running?'#999':'#0A1929'}}>
          {running ? '⏳ Testing...' : '▶ Run All Tests'}
        </button>
      </div>

      <div className="space-y-2">
        {(['AI System','Feature'] as const).map(cat => (
          <div key={cat}>
            <h2 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-2">{cat}s ({ALL_FEATURES.filter(f=>f.category===cat).length})</h2>
            <div className="space-y-1">
              {ALL_FEATURES.filter(f=>f.category===cat).map(f => (
                <motion.div key={f.id} initial={{opacity:0}} animate={{opacity:1}}
                  className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/[0.07] transition-colors cursor-pointer"
                  onClick={() => !running && testOne(f)}>
                  <span className="text-lg">{icons[results[f.id]||'idle']}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{f.name}</p>
                    {details[f.id] && <p className="text-[10px] text-white/40 truncate">{details[f.id]}</p>}
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    results[f.id]==='pass'?'bg-green-500/20 text-green-400':
                    results[f.id]==='fail'?'bg-red-500/20 text-red-400':
                    results[f.id]==='testing'?'bg-yellow-500/20 text-yellow-400':
                    'bg-white/5 text-white/30'}`}>
                    {(results[f.id]||'idle').toUpperCase()}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* JSON export */}
      {Object.keys(results).length>0 && (
        <details className="mt-4">
          <summary className="text-xs text-white/40 cursor-pointer hover:text-white/60">View JSON Results</summary>
          <pre className="mt-2 p-4 rounded-xl bg-white/5 border border-white/10 text-[10px] text-white/60 overflow-auto max-h-96">
            {JSON.stringify({results:Object.fromEntries(Object.entries(results).map(([k,v])=>[ALL_FEATURES.find(f=>f.id===k)?.name||k,v])),details,timestamp:new Date().toISOString()},null,2)}
          </pre>
        </details>
      )}
    </div>
  );
}
