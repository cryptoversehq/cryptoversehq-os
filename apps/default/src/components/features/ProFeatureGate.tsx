/**
 * ProFeatureGate.tsx — Wraps AI features, shows upgrade prompt for non-Pro+ users.
 * All features are visible to all users, but gated behind Pro+ with an upgrade link.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/lib/authStore';
import { Lock, Crown, Sparkles, ArrowRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  children: React.ReactNode;
  featureName: string;
  featureIcon?: string;
}

export default function ProFeatureGate({ children, featureName, featureIcon = '🔒' }: Props) {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);

  const isProPlus = user?.plan !== 'bronze';

  if (isProPlus) return <>{children}</>;

  const benefits = [
    { icon: '🛡️', text: 'AI Risk Check before every trade' },
    { icon: '📊', text: 'Smart Stop-Loss & Take-Profit suggestions' },
    { icon: '🧠', text: 'Portfolio Health analysis & alerts' },
    { icon: '🎯', text: 'Daily Prediction Game with XP rewards' },
    { icon: '📈', text: 'Social Sentiment Engine for all 10 coins' },
    { icon: '📚', text: 'Personalized AI Learning Path' },
    { icon: '🔄', text: 'Trade Replay with AI coaching' },
    { icon: '📰', text: 'Weekly Psychology & Sentiment Reports' },
    { icon: '💡', text: 'Context-Aware Guidance on every page' },
    { icon: '🤖', text: 'Full access to all Taskade AI Agents' },
  ];

  return (
    <>
      {/* Locked feature banner */}
      <div className="relative rounded-xl border border-white/10 bg-gradient-to-br from-amber-500/5 to-orange-500/5 p-4 overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl -mt-8 -mr-8 pointer-events-none" />
        <div className="relative z-10 text-center space-y-3">
          <div className="text-3xl">{featureIcon}</div>
          <div>
            <p className="text-sm font-bold text-white/80">{featureName}</p>
            <p className="text-xs text-white/40 mt-1">
              🌟 This feature is available for Pro+ members. Upgrade now to unlock AI-powered trading insights!
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95"
            style={{ background: 'linear-gradient(135deg, #FFD700, #FF9500)', color: '#0A1929' }}
          >
            <Crown className="h-4 w-4" />
            Upgrade to Pro+
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md rounded-3xl border border-white/10 shadow-2xl overflow-hidden"
              style={{ background: '#0A1929' }}
            >
              {/* Header */}
              <div className="p-6 text-center" style={{ background: 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,149,0,0.1))' }}>
                <button
                  onClick={() => setShowModal(false)}
                  className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/40 hover:text-white/80"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="text-4xl mb-3">🚀</div>
                <h3 className="text-xl font-bold text-white">Want to unlock this AI feature?</h3>
                <p className="text-sm text-white/50 mt-1">Join Pro+ and transform your trading with AI</p>
              </div>

              {/* Benefits */}
              <div className="p-6 space-y-2">
                {benefits.map((b, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                    <span className="text-lg">{b.icon}</span>
                    <span className="text-sm text-white/70">{b.text}</span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="p-6 border-t border-white/10">
                <button
                  onClick={() => { setShowModal(false); navigate('/subscription'); }}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #FFD700, #FF9500)', color: '#0A1929' }}
                >
                  <Crown className="h-5 w-5" />
                  Upgrade Now
                  <ArrowRight className="h-4 w-4" />
                </button>
                <p className="text-[10px] text-white/30 text-center mt-3">
                  Plans start at $9.99/month · Cancel anytime
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
