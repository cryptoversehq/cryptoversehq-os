/**
 * FeedbackAdminPage.tsx — Admin page at /feedback showing all user feedback.
 * Admin & Super Admin only. Shows star ratings, feature requests, bug reports.
 */
import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/authStore';
import { Star, MessageSquare, Lightbulb, AlertTriangle, TrendingUp } from 'lucide-react';
import { getFeedback, getPopularFeatures, FeedbackEntry, FeatureRating } from '@/lib/feedbackStore';

export default function FeedbackAdminPage() {
  const { user } = useAuthStore();
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [popular, setPopular] = useState<FeatureRating[]>([]);

  useEffect(() => {
    setFeedback(getFeedback());
    setPopular(getPopularFeatures(10));
  }, []);

  const isAdmin = user?.role==='admin'||user?.role==='super_admin';
  if (!isAdmin) return <div className="p-10 text-center text-red-400">🔒 Admin access only</div>;

  const avgRating = feedback.length>0 ? Math.round(feedback.reduce((s,f)=>s+f.rating,0)/feedback.length*10)/10 : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" style={{background:'#0A1929',minHeight:'100vh'}}>
      <div>
        <h1 className="text-2xl font-black text-white">User Feedback</h1>
        <p className="text-sm text-white/40 mt-1">{feedback.length} entries · Avg rating: {avgRating} ⭐</p>
      </div>

      {/* Popular Features */}
      {popular.length>0 && (
        <div className="p-4 rounded-2xl border border-white/10 bg-white/5">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-3"><TrendingUp className="h-4 w-4 text-purple-400"/>Popular Features</h3>
          <div className="space-y-1.5">
            {popular.map((f,i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-white/70">{f.featureName}</span>
                <span className="flex gap-3 font-mono">
                  <span className="text-green-400">👍 {f.likes}</span>
                  <span className="text-red-400">👎 {f.dislikes}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feedback List */}
      <div className="space-y-2">
        {feedback.length===0 && <p className="text-sm text-white/30 text-center py-10">No feedback yet.</p>}
        {feedback.map(f => (
          <div key={f.id} className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white">{f.userName}</span>
                <span className="flex">{[...Array(5)].map((_,i)=><Star key={i} className="h-3 w-3" fill={i<f.rating?'#FFD700':'none'} stroke={i<f.rating?'#FFD700':'#444'}/>)}</span>
              </div>
              <span className="text-[10px] text-white/30">{new Date(f.timestamp).toLocaleDateString()}</span>
            </div>
            {f.feature && <div className="flex items-start gap-1.5"><Lightbulb className="h-3 w-3 text-yellow-400 mt-0.5 shrink-0"/><p className="text-xs text-white/60">{f.feature}</p></div>}
            {f.bugs && <div className="flex items-start gap-1.5"><AlertTriangle className="h-3 w-3 text-red-400 mt-0.5 shrink-0"/><p className="text-xs text-white/60">{f.bugs}</p></div>}
          </div>
        ))}
      </div>
    </div>
  );
}
