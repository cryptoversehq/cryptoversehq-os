/**
 * sentry.ts — dependency-free bridge to the CDN-loaded Sentry browser client.
 *
 * WHY THIS DOES NOT `import * as Sentry from '@sentry/react'`:
 * app/package.json and src/main.tsx are template-owned protected files (the VFS
 * refuses both), so no npm dependency can be declared for the bundle — an import of
 * '@sentry/react' would fail to resolve and break the build. Sentry is therefore
 * loaded from the official CDN in app/index.html as a classic script (which runs
 * before the deferred module entry, so it is initialized before React renders), and
 * this module is the single typed accessor for it.
 *
 * NOTHING HERE IS REQUIRED for Sentry to work: init() already captures uncaught
 * errors, unhandled promise rejections and (with tracing) page loads. These helpers
 * exist so application code can report deliberately — and so a blocked/absent CDN
 * script degrades to a silent no-op instead of a crash.
 *
 * If app/package.json ever becomes editable, installing @sentry/react and adding
 * Sentry.ErrorBoundary is the next step (React render errors + a fallback UI). It is
 * NOT required for the DSN to receive errors.
 */

type SentryLevel = 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';

interface SentryLike {
  captureException?: (error: unknown, context?: { extra?: Record<string, unknown>; tags?: Record<string, string>; level?: SentryLevel }) => string;
  captureMessage?: (message: string, context?: { level?: SentryLevel; extra?: Record<string, unknown> }) => string;
  setUser?: (user: { id?: string } | null) => void;
  setTag?: (key: string, value: string) => void;
  addBreadcrumb?: (breadcrumb: { category?: string; message?: string; level?: SentryLevel; data?: Record<string, unknown> }) => void;
}

function client(): SentryLike | null {
  const s = (globalThis as { Sentry?: SentryLike }).Sentry;
  return s && typeof s.captureException === 'function' ? s : null;
}

/** True when the CDN script loaded and init() ran. */
export function isSentryEnabled(): boolean {
  return client() !== null;
}

/** Report an error, with optional non-PII context. Never throws. */
export function captureException(error: unknown, extra?: Record<string, unknown>): void {
  const s = client();
  if (!s?.captureException) return;
  try { s.captureException(error, extra ? { extra } : undefined); } catch { /* monitoring must never break the app */ }
}

/** Report a notable event (e.g. "admin view-as started"). Never throws. */
export function captureMessage(message: string, level: SentryLevel = 'info'): void {
  const s = client();
  if (!s?.captureMessage) return;
  try { s.captureMessage(message, { level }); } catch { /* ignore */ }
}

/**
 * Attribute events to a user by ID ONLY.
 *
 * Deliberately not the email or display name: an error tracker does not need PII to
 * group reports, and the app's own error monitor already keeps those locally.
 */
export function setSentryUser(userId: string | null): void {
  const s = client();
  if (!s?.setUser) return;
  try { s.setUser(userId ? { id: userId } : null); } catch { /* ignore */ }
}

/** Tag subsequent events (e.g. the acting role, or 'view-as'). Never throws. */
export function setSentryTag(key: string, value: string): void {
  const s = client();
  if (!s?.setTag) return;
  try { s.setTag(key, value); } catch { /* ignore */ }
}

/** Add a breadcrumb for the trail leading up to an error. Never throws. */
export function addSentryBreadcrumb(message: string, data?: Record<string, unknown>): void {
  const s = client();
  if (!s?.addBreadcrumb) return;
  try { s.addBreadcrumb({ category: 'app', message, level: 'info', data }); } catch { /* ignore */ }
}
