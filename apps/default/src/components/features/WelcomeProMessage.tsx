/**
 * WelcomeProMessage.tsx — First-login welcome highlighting 17 Pro+ AI features.
 * Shown once to new users after registration.
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Crown, ArrowRight, X, Zap, Shield, Brain, Target, TrendingUp, BookOpen, RefreshCw, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/lib/authStore';

const FEATURES = [
  { icon: Shield,    title: 'AI Risk Check',          desc: 'Get risk scores before every trade' },
  { icon: Zap,       title: 'Smart Stop-Loss',        desc: 'AI-suggested stop-loss levels' },
  { icon: Brain,     title: 'Portfolio Health',       desc: 'Daily health analysis & tips' },
  { icon: Target,    title: 'Prediction Game',         desc: 'Daily coin predictions for XP' },
  { icon: TrendingUp,title: 'Sentiment Engine',        desc: '10-coin social sentiment tracking' },
  { icon: BookOpen,  title: 'Learning Path',          desc: 'Personalized lesson recommendations' },
  { icon: RefreshCw, title: 'Trade Replay',           desc: 'Replay & learn from past trades' },
  { icon: Calendar,  title: 'Weekly Reports',          desc: 'Market & psychology weekly reports' },
];

export default function WelcomeProMessage() {
  const [open, setOpen] = useState(true);
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const isNew = user?.isFirstLogin;

  if (!isNew || !open) return null;

  return (
    <AnimatePresence>
      <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <motion.div initial={{scale:0.9,y:20}} animate={{scale:1,y:0}} exit={{scale:0.9,y:20}}
          className="w-full max-w-lg rounded-3xl border border-white/10 shadow-2xl overflow-hidden"
          style={{background:'#0A1929'}}>
          {/* Header */}
          <div className="p-6 text-center" style={{background:'linear-gradient(135deg,rgba(255,215,0,0.15),rgba(255,149,0,0.1))'}}>
            <button onClick={()=>setOpen(false)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/80"><X className="h-4 w-4"/></button>
            <div className="text-4xl mb-3">🚀</div>
            <h2 className="text-xl font-bold text-white">Welcome to CryptoVerse HQ!</h2>
            <p className="text-sm text-white/50 mt-2">Your account is ready. Explore 17 AI-powered features to level up your trading.</p>
          </div>

          {/* Features grid */}
          <div className="p-6 grid grid-cols-2 gap-2">
            {FEATURES.map((f,i)=>(
              <motion.div key={i} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}}
                className="flex items-start gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors">
                <f.icon className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5"/>
                <div>
                  <p className="text-xs font-bold text-white">{f.title}</p>
                  <p className="text-[10px] text-white/40">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* CTA */}
          <div className="p-6 border-t border-white/10 flex gap-3">
            <button onClick={()=>{setOpen(false);}} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-colors">
              Explore App
            </button>
            <button onClick={()=>{setOpen(false);navigate('/subscription');}}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
              style={{background:'linear-gradient(135deg,#FFD700,#FF9500)',color:'#0A1929'}}>
              <Crown className="h-4 w-4"/>Upgrade to Pro+
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
