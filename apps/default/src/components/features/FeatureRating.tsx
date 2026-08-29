/**
 * FeatureRating.tsx — 👍/👎 rating buttons for each feature.
 * Used across feature components. Per-user dedup (click again to remove vote).
 */
import React, { useState, useEffect } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { useAuthStore } from '@/lib/authStore';
import { voteFeature } from '@/lib/feedbackStore';

interface Props { featureId: string; featureName: string; }

export default function FeatureRating({ featureId, featureName }: Props) {
  const { user } = useAuthStore();
  const [likes, setLikes] = useState(0);
  const [dislikes, setDislikes] = useState(0);
  const [myVote, setMyVote] = useState<'like'|'dislike'|null>(null);

  useEffect(() => {
    const { voteFeature, getRatings } = require('@/lib/feedbackStore');
    const ratings = getRatings();
    const r = ratings[featureId];
    if (r) { setLikes(r.likes); setDislikes(r.dislikes); setMyVote(r.userVotes[user?.id||'']||null); }
  }, [featureId, user?.id]);

  function handle(vote: 'like'|'dislike') {
    const result = voteFeature(featureId, featureName, user?.id||'anonymous', vote);
    setLikes(result.likes); setDislikes(result.dislikes);
    setMyVote(result.userVotes[user?.id||'anonymous']||null);
  }

  return (
    <div className="flex items-center gap-3 mt-2">
      <button onClick={() => handle('like')}
        className={`flex items-center gap-1 text-[11px] transition-colors ${myVote==='like'?'text-green-400':'text-white/30 hover:text-green-400'}`}>
        <ThumbsUp className="h-3.5 w-3.5"/>{likes}
      </button>
      <button onClick={() => handle('dislike')}
        className={`flex items-center gap-1 text-[11px] transition-colors ${myVote==='dislike'?'text-red-400':'text-white/30 hover:text-red-400'}`}>
        <ThumbsDown className="h-3.5 w-3.5"/>{dislikes}
      </button>
    </div>
  );
}
