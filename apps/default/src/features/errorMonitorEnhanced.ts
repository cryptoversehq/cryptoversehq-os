/**
 * errorMonitorEnhanced.ts — CryptoVerse HQ Enhanced Error Detection
 * Severity analysis, admin alerts, duplicate grouping, Taskade webhook integration.
 */

import { deepSeekAsk } from '@/lib/deepSeekClient';

const ERR_KEY = 'cv_error_log';
const ERR_COUNT_KEY = 'cv_error_counts';

export interface ErrorEntry {
  id: string; message: string; stack?: string;
  componentStack?: string; timestamp: string;
  severity: 'low'|'medium'|'high'|'critical';
  diagnosis: string; fix: string; impact: string;
  url: string; userId?: string; browser: string;
  count: number;
}

let _reported: Map<string,number> = new Map();
let _hourlyCounts: Map<string,{count:number;firstSeen:number}> = new Map();

export function getUserId(): string {
  try {
    const raw = localStorage.getItem('cryptoverse_session');
    if (!raw) return 'anonymous';
    return (JSON.parse(raw) as {id:string}).id || 'anonymous';
  } catch { return 'anonymous'; }
}

export async function analyzeError(error: Error, errorInfo?: {componentStack:string}): Promise<ErrorEntry> {
  const key = `${error.message?.slice(0,60)}:${(error.stack||'').slice(0,60)}`;
  const prev = _reported.get(key)||0;
  _reported.set(key, prev+1);
  if (_reported.size>100) _reported = new Map([..._reported].slice(-50));

  // Hourly rate limiting
  const now = Date.now();
  const hourly = _hourlyCounts.get(key);
  if (hourly && (now-hourly.firstSeen)>3600000) { _hourlyCounts.delete(key); }
  const newCount = (hourly?.count||0)+1;
  _hourlyCounts.set(key, {count:newCount, firstSeen: hourly?.firstSeen||now});

  let severity: ErrorEntry['severity'] = 'medium';
  if (newCount>5) severity = 'critical';
  else if (newCount>2) severity = 'high';

  const entry: ErrorEntry = {
    id: `err_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    message: error.message, stack: error.stack,
    componentStack: errorInfo?.componentStack,
    timestamp: new Date().toISOString(),
    severity, diagnosis:'', fix:'', impact:'',
    url: typeof window!=='undefined'?window.location.href:'',
    userId: getUserId(), browser: typeof navigator!=='undefined'?navigator.userAgent:'',
    count: newCount,
  };

  try {
    const prompt = `Frontend error: "${error.message}". Analyze: severity (low/medium/high/critical), root cause diagnosis, suggested fix (code), impact on app. JSON: {"severity":"...","diagnosis":"...","fix":"...","impact":"..."}. Only JSON.`;
    const r = await deepSeekAsk(prompt);
    const j = JSON.parse(r.replace(/```json\n?/g,'').replace(/\n?```/g,'').trim());
    entry.severity = j.severity||entry.severity;
    entry.diagnosis = j.diagnosis||'Unknown';
    entry.fix = j.fix||'Reload the page and try again.';
    entry.impact = j.impact||'Unknown';
  } catch {}

  saveErrorLog(entry);
  return entry;
}

export function saveErrorLog(entry: ErrorEntry): void {
  try {
    const log = JSON.parse(localStorage.getItem(ERR_KEY)||'[]') as ErrorEntry[];
    log.push(entry);
    localStorage.setItem(ERR_KEY,JSON.stringify(log.slice(-200)));
  } catch {}
}

export function getErrorLog(): ErrorEntry[] {
  try { return JSON.parse(localStorage.getItem(ERR_KEY)||'[]'); } catch { return []; }
}

export function getErrorStats(): {total:number;bySeverity:Record<string,number>;criticalCount:number} {
  const log = getErrorLog();
  const bySeverity: Record<string,number> = {};
  let critical = 0;
  for (const e of log) { bySeverity[e.severity]=(bySeverity[e.severity]||0)+1; if (e.severity==='critical') critical++; }
  return { total:log.length, bySeverity, criticalCount:critical };
}

export function getGroupedErrors(): Map<string,ErrorEntry[]> {
  const log = getErrorLog();
  const groups = new Map<string,ErrorEntry[]>();
  for (const e of log) {
    const key = e.message.slice(0,40);
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key)!.push(e);
  }
  return groups;
}
