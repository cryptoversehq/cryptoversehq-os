/**
 * FeedbackWidget.tsx — Feedback button + modal.
 * Star rating (1-5), feature suggestion, bug report. Stores to Taskade DB.
 * Theme-aware: uses Tailwind semantic classes for light/dark compatibility.
 */
import React, { useState } from 'react';
import { MessageSquare, X, Star, Send, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/lib/authStore';
import { submitFeedback } from '@/lib/feedbackStore';

export default function FeedbackWidget({ inline }: { inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [feature, setFeature] = useState('');
  const [bugs, setBugs] = useState('');
  const [sent, setSent] = useState(false);
  const [hoverStar, setHoverStar] = useState(0);
  const { user } = useAuthStore();

  async function submit() {
    if (rating === 0) return;
    await submitFeedback({
      userId: user?.id || 'anonymous',
      userName: user?.displayName || 'Guest',
      rating,
      feature: feature.trim(),
      bugs: bugs.trim(),
    });
    setSent(true);
    setTimeout(() => { setOpen(false); setSent(false); setRating(0); setFeature(''); setBugs(''); }, 2000);
  }

  return (
    <>
      {inline ? (
        <button onClick={() => setOpen(true)}
          className="w-full py-3 rounded-2xl text-sm font-bold transition-all hover:brightness-110 active:scale-95 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}>
          <MessageSquare className="h-4 w-4" /> Share Feedback
        </button>
      ) : (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-24 right-6 w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg shadow-black/40 transition-all hover:scale-105 active:scale-95 z-30"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 20px rgba(99,102,241,0.35)' }}>
          <MessageSquare className="h-5 w-5 text-white" />
        </button>
      )}

      {/* Modal */}
      <AnimatePresence>
        {open && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 dark:bg-black/70 bg-gray-800/70 backdrop-blur-sm p-4"
            onClick={() => setOpen(false)}>
            <motion.div initial={{scale:0.9,y:20}} animate={{scale:1,y:0}} exit={{scale:0.9,y:20}}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl border shadow-2xl overflow-hidden bg-card border-border">
              {/* Header */}
              <div className="p-5 text-center bg-primary/5 dark:bg-indigo-500/10">
                <button onClick={() => setOpen(false)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"><X className="h-4 w-4"/></button>
                <div className="text-3xl mb-2">💬</div>
                <h3 className="text-lg font-bold text-foreground">Share Your Feedback</h3>
                <p className="text-xs text-muted-foreground mt-1">Help us improve CryptoVerse HQ</p>
              </div>

              {sent ? (
                <div className="p-8 text-center">
                  <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3"/>
                  <p className="text-sm font-bold text-foreground">Thank You!</p>
                  <p className="text-xs text-muted-foreground mt-1">Your feedback has been submitted.</p>
                </div>
              ) : (
                <div className="p-5 space-y-4">
                  {/* Star Rating */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">How satisfied are you?</p>
                    <div className="flex justify-center gap-2">
                      {[1,2,3,4,5].map(s => (
                        <button key={s} onClick={() => setRating(s)} onMouseEnter={() => setHoverStar(s)} onMouseLeave={() => setHoverStar(0)}
                          className={`text-2xl transition-all ${s <= (hoverStar || rating) ? 'scale-110' : 'grayscale opacity-30'}`}>
                          <Star className="h-7 w-7" fill={s <= (hoverStar||rating) ? '#FFD700' : 'none'} stroke={s <= (hoverStar||rating) ? '#FFD700' : '#9CA3AF'}/>
                        </button>
                      ))}
                    </div>
                    {rating > 0 && <p className="text-[10px] text-muted-foreground text-center mt-1">{['Poor','Okay','Good','Great','Excellent'][rating-1]}</p>}
                  </div>

                  {/* Feature Request */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">What feature would you like to see?</p>
                    <textarea value={feature} onChange={e => setFeature(e.target.value)}
                      placeholder="E.g. Dark mode, mobile notifications..."
                      className="w-full bg-muted border border-border rounded-xl p-3 text-xs text-foreground placeholder:text-muted-foreground resize-none h-16 focus:outline-none focus:border-indigo-500/50"/>
                  </div>

                  {/* Bug Report */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Did you find any bugs?</p>
                    <textarea value={bugs} onChange={e => setBugs(e.target.value)}
                      placeholder="Describe what happened..."
                      className="w-full bg-muted border border-border rounded-xl p-3 text-xs text-foreground placeholder:text-muted-foreground resize-none h-16 focus:outline-none focus:border-indigo-500/50"/>
                  </div>

                  <button onClick={submit} disabled={rating===0}
                    className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-30 transition-all hover:scale-[1.02] flex items-center justify-center gap-2 text-white"
                    style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>
                    <Send className="h-4 w-4"/> Submit Feedback
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
