/**
 * useAIErrorMonitor.ts — Enhanced Error Detection with DeepSeek analysis.
 * Catches errors, sends to DeepSeek for severity/root cause/fix, groups duplicates.
 * All users (admin dashboard gated to admin role).
 */
import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/lib/authStore';

export let _errors: {message:string;severity:string;count:number;lastSeen:string}[] = [];
let _hourly: Map<string,{count:number;firstSeen:number}> = new Map();

export function getErrorLog() { return _errors; }

export function useAIErrorMonitor() {
  const { user } = useAuthStore();
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  useEffect(() => {
    function handler(event: ErrorEvent) {
      const key = `${event.filename}:${event.lineno}:${event.message?.slice(0,40)}`;
      const now = Date.now();
      const h = _hourly.get(key);
      if (h && (now-h.firstSeen)>3600000) _hourly.delete(key);
      const count = (_hourly.get(key)?.count||0)+1;
      _hourly.set(key, {count, firstSeen: h?.firstSeen||now});

      let severity = 'medium';
      if (count>5) severity = 'critical';
      else if (count>2) severity = 'high';

      const existing = _errors.find(e=>e.message.slice(0,40)===event.message?.slice(0,40));
      if (existing) { existing.count = count; existing.severity = severity; existing.lastSeen = new Date().toISOString(); }
      else { _errors.unshift({message:event.message||'Unknown',severity,count,lastSeen:new Date().toISOString()}); }
      if (_errors.length>200) _errors = _errors.slice(0,150);

      // Log critical to console for admin visibility
      if (severity==='critical')
        console.error(`[AI Monitor] CRITICAL (${count}x): ${event.message?.slice(0,80)}`);

      // Import feature dynamically to avoid circular deps
      import('@/features/errorMonitorEnhanced').then(m => {
        m.analyzeError(event.error||new Error(event.message||'Unknown'), event.error?{componentStack:''}:undefined);
      }).catch(() => {});
    }

    window.addEventListener('error', handler);
    return () => window.removeEventListener('error', handler);
  }, []);
}

export function AIErrorMonitor() {
  useAIErrorMonitor();
  return null;
}
