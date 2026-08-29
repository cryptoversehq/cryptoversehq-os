import React, { useState, useEffect } from 'react';
import { Lightbulb, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import ProFeatureGate from './ProFeatureGate';
import { generateTip, dismissTip, recordPageEntry } from '@/features/contextAwareGuidanceEnhanced';

/** Pages where Context Guidance should NOT appear. */
const HIDE_ON = ['/', '/dashboard', '/profile', '/trading', '/academy', '/portfolio', '/bots', '/events', '/nft', '/onchain', '/subscription', '/whats-new', '/feedback'];

/** Master kill-switch — set to true to hide on ALL pages. */
const DISABLE_GLOBALLY = true;

function GuidanceInner() {
  const [tip, setTip] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);
  const [closed, setClosed] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (DISABLE_GLOBALLY || HIDE_ON.includes(location.pathname)) { setTip(null); setLoading(false); return; }
    recordPageEntry(); setClosed(false); setLoading(true);
    generateTip(location.pathname).then(setTip).catch(()=>{}).finally(()=>setLoading(false));
  }, [location.pathname]);

  if (closed || (!loading && !tip)) return null;
  if (loading) return <Skeleton className="h-10 w-full rounded-xl"/>;

  return (
    <div className="px-4 py-2.5 rounded-xl border border-white/10 bg-yellow-500/5 flex items-center gap-2 group">
      <Lightbulb className="h-4 w-4 text-yellow-400 shrink-0"/>
      <p className="text-xs text-white/60 flex-1">{tip}</p>
      <button onClick={()=>{dismissTip(tip||'');setClosed(true);}} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10">
        <X className="h-3 w-3 text-white/30"/>
      </button>
    </div>
  );
}

export default function ContextAwareGuidance() {
  if (DISABLE_GLOBALLY) return null;
  return <ProFeatureGate featureName="Context Guidance" featureIcon="💡"><GuidanceInner/></ProFeatureGate>;
}
