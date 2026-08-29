// ─── Login History Store ──────────────────────────────────────────────────────
// Records every successful login event per user in CloudDataLayer.
import { cloudRecordStore } from './cloudData';
// Captures: method, timestamp, browser, OS, device type, timezone, language.
// No network calls — all info is derived from the browser's navigator/screen API.

export type LoginMethod = 'email' | 'google' | 'apple' | 'biometric' | 'register';

export interface LoginEvent {
  id:         string;         // unique event id
  userId:     string;
  method:     LoginMethod;
  timestamp:  string;         // ISO 8601
  // Device snapshot
  browser:    string;
  browserVersion: string;
  os:         string;
  deviceType: 'desktop' | 'tablet' | 'mobile';
  screenRes:  string;         // e.g. "1920×1080"
  timezone:   string;         // e.g. "Asia/Tehran"
  language:   string;         // e.g. "fa"
  // Optional extra
  isNewUser?: boolean;
}

const HISTORY_KEY = 'cryptoverse_login_history';
const MAX_ENTRIES = 100;

// ─── Parse helpers ────────────────────────────────────────────────────────────

interface ParsedUA {
  browser: string;
  browserVersion: string;
  os: string;
  deviceType: 'desktop' | 'tablet' | 'mobile';
}

function parseUserAgent(ua: string): ParsedUA {
  // ── OS detection ──
  let os = 'Unknown OS';
  if (/Windows NT 10/.test(ua))          os = 'Windows 11/10';
  else if (/Windows NT 6\.3/.test(ua))   os = 'Windows 8.1';
  else if (/Windows NT 6\.1/.test(ua))   os = 'Windows 7';
  else if (/Windows/.test(ua))           os = 'Windows';
  else if (/iPhone OS/.test(ua))         os = `iOS ${ua.match(/iPhone OS ([\d_]+)/)?.[1]?.replace(/_/g, '.') ?? ''}`.trim();
  else if (/iPad.*OS/.test(ua))          os = `iPadOS ${ua.match(/OS ([\d_]+)/)?.[1]?.replace(/_/g, '.') ?? ''}`.trim();
  else if (/Android/.test(ua))           os = `Android ${ua.match(/Android ([\d.]+)/)?.[1] ?? ''}`.trim();
  else if (/Mac OS X/.test(ua))          os = `macOS ${ua.match(/Mac OS X ([\d_]+)/)?.[1]?.replace(/_/g, '.') ?? ''}`.trim();
  else if (/Linux/.test(ua))             os = 'Linux';
  else if (/CrOS/.test(ua))             os = 'Chrome OS';

  // ── Browser detection (order matters) ──
  let browser = 'Unknown Browser';
  let browserVersion = '';

  if (/EdgA?\//.test(ua)) {
    browser = 'Edge';
    browserVersion = ua.match(/Edg[eA]?\/([\d.]+)/)?.[1] ?? '';
  } else if (/OPR\//.test(ua)) {
    browser = 'Opera';
    browserVersion = ua.match(/OPR\/([\d.]+)/)?.[1] ?? '';
  } else if (/YaBrowser\//.test(ua)) {
    browser = 'Yandex';
    browserVersion = ua.match(/YaBrowser\/([\d.]+)/)?.[1] ?? '';
  } else if (/SamsungBrowser\//.test(ua)) {
    browser = 'Samsung Internet';
    browserVersion = ua.match(/SamsungBrowser\/([\d.]+)/)?.[1] ?? '';
  } else if (/Firefox\//.test(ua)) {
    browser = 'Firefox';
    browserVersion = ua.match(/Firefox\/([\d.]+)/)?.[1] ?? '';
  } else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) {
    browser = 'Chrome';
    browserVersion = ua.match(/Chrome\/([\d.]+)/)?.[1] ?? '';
  } else if (/Chromium\//.test(ua)) {
    browser = 'Chromium';
    browserVersion = ua.match(/Chromium\/([\d.]+)/)?.[1] ?? '';
  } else if (/Safari\//.test(ua) && /Version\//.test(ua)) {
    browser = 'Safari';
    browserVersion = ua.match(/Version\/([\d.]+)/)?.[1] ?? '';
  }

  // ── Device type ──
  let deviceType: ParsedUA['deviceType'] = 'desktop';
  if (/iPad/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) {
    deviceType = 'tablet';
  } else if (/Mobi|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/.test(ua)) {
    deviceType = 'mobile';
  }

  return { browser, browserVersion, os, deviceType };
}

function getScreenRes(): string {
  return `${screen.width}×${screen.height}`;
}

function getTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'Unknown'; }
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

function loadAll(): LoginEvent[] {
  return cloudRecordStore.get<LoginEvent[]>('login_history', HISTORY_KEY, []);
}

function saveAll(events: LoginEvent[]): void {
  cloudRecordStore.set('login_history', HISTORY_KEY, events);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Record a new login event for the given user. */
export function recordLogin(params: {
  userId:    string;
  method:    LoginMethod;
  isNewUser?: boolean;
}): void {
  const ua     = navigator.userAgent;
  const parsed = parseUserAgent(ua);

  const event: LoginEvent = {
    id:             `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId:         params.userId,
    method:         params.method,
    timestamp:      new Date().toISOString(),
    browser:        parsed.browser,
    browserVersion: parsed.browserVersion,
    os:             parsed.os,
    deviceType:     parsed.deviceType,
    screenRes:      getScreenRes(),
    timezone:       getTimezone(),
    language:       navigator.language,
    isNewUser:      params.isNewUser,
  };

  const all = loadAll();
  // Prepend newest first, cap at MAX_ENTRIES per user
  const updated = [event, ...all].slice(0, MAX_ENTRIES);
  saveAll(updated);
}

/** Return all login events for a specific user, newest first. */
export function getLoginHistory(userId: string): LoginEvent[] {
  return loadAll().filter(e => e.userId === userId);
}

/** Clear all login history for a user. */
export function clearLoginHistory(userId: string): void {
  saveAll(loadAll().filter(e => e.userId !== userId));
}

/** Return aggregate stats for a user. */
export function getLoginStats(userId: string): {
  total:       number;
  byMethod:    Record<LoginMethod, number>;
  lastLogin:   LoginEvent | null;
  uniqueDays:  number;
} {
  const events = getLoginHistory(userId);
  const byMethod: Record<LoginMethod, number> = {
    email:     0,
    google:    0,
    apple:     0,
    biometric: 0,
    register:  0,
  };
  const days = new Set<string>();
  for (const e of events) {
    byMethod[e.method] = (byMethod[e.method] ?? 0) + 1;
    days.add(e.timestamp.slice(0, 10));
  }
  return {
    total:      events.length,
    byMethod,
    lastLogin:  events[0] ?? null,
    uniqueDays: days.size,
  };
}
