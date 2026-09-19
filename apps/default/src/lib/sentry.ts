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

// ── Loader ────────────────────────────────────────────────────────────────────

const CDN_SRC = 'https://browser.sentry-cdn.com/10.75.0/bundle.min.js';

/** Public (send-only) DSN for the FRONTEND Sentry project. */
export const SENTRY_FRONTEND_DSN =
  'https://191d18ba9b7b563449f135803b4325da@o4512103258718208.ingest.de.sentry.io/4512103327531088';

let loadPromise: Promise<boolean> | null = null;

/**
 * Make sure the browser SDK is loaded AND initialized. Idempotent, safe to call from
 * anywhere (SentryBoot calls it once on mount).
 *
 * WHY THIS EXISTS IN ADDITION TO THE <script> TAGS IN app/index.html: the published
 * build did not carry those tags — `window.Sentry` was undefined in the deployed page —
 * so the HTML path cannot be relied on (the Genesis build emits its own shell). Loading
 * from the component layer works regardless of which HTML the runtime serves. If the
 * HTML script DID run, `client()` is already set and this returns immediately: no
 * double init.
 */
export function ensureSentryInit(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (client()) {
    console.info('[Sentry] Frontend SDK already initialised');
    return Promise.resolve(true);
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<boolean>(resolve => {
    let settled = false;
    const settle = (ok: boolean, why?: string) => {
      if (settled) return;
      settled = true;
      if (!ok && why) console.warn(`[Sentry] ${why}`);
      resolve(ok);
    };

    const initialize = (): boolean => {
      const s = (globalThis as { Sentry?: SentryLike & { init?: (options: Record<string, unknown>) => void } }).Sentry;
      if (!s || typeof s.init !== 'function') return false;
      try {
        const maybeTracing = s as unknown as { browserTracingIntegration?: () => unknown };
        const tracing = typeof maybeTracing.browserTracingIntegration === 'function'
          ? [maybeTracing.browserTracingIntegration()]
          : [];
        s.init({
          dsn: SENTRY_FRONTEND_DSN,
          environment: /^(localhost|127\.|\[::1\])/.test(location.hostname) ? 'development' : 'production',
          integrations: tracing,
          tracesSampleRate: 0.1,
        });
        return true;
      } catch (error) {
        console.warn('[Sentry] init() threw:', error);
        return false;
      }
    };

    // The SDK is already on the page (e.g. the index.html CDN tag ran) — just initialise.
    if ((globalThis as { Sentry?: unknown }).Sentry) {
      const ok = initialize();
      if (ok) console.info('[Sentry] Frontend SDK initialized (pre-existing script)');
      settle(ok, 'SDK present but Sentry.init is unavailable');
      return;
    }

    // A script tag for the bundle may already exist (index.html, or an earlier call).
    const selector = 'script[data-cv-sentry], script[src*="sentry-cdn"]';
    const existing = document.querySelector<HTMLScriptElement>(selector);
    const script = existing ?? document.createElement('script');

    if (existing) {
      console.info('[Sentry] Found an existing CDN script tag — waiting for it to load');
      const done = () => {
        const ok = initialize();
        if (ok) console.info('[Sentry] Frontend SDK initialized');
        settle(ok, 'CDN script loaded but Sentry.init is unavailable');
      };
      script.addEventListener('load', done, { once: true });
      script.addEventListener('error', () => settle(false, 'Failed to load CDN bundle (existing tag)'), { once: true });
      setTimeout(() => settle(!!client() || initialize(), 'CDN load timed out after 10s (existing tag)'), 10_000);
      return;
    }

    script.src = CDN_SRC;
    script.crossOrigin = 'anonymous';
    script.dataset.cvSentry = '1';
    script.async = true;

    script.onload = () => {
      const ok = initialize();
      if (ok) console.info('[Sentry] Frontend SDK initialized');
      settle(ok, 'CDN loaded but Sentry.init is unavailable — check the bundle version/URL');
    };
    script.onerror = () => {
      // Fires for a network failure, a blocked host, or a CSP violation. If the console
      // also shows "Refused to load the script … Content Security Policy", it is CSP.
      settle(false, 'Failed to load CDN bundle — blocked (CSP/offline) or unreachable');
    };

    document.head.appendChild(script);
    console.info('[Sentry] Injecting CDN bundle:', CDN_SRC);

    setTimeout(() => settle(!!client() || initialize(), 'CDN load timed out after 10s'), 10_000);
  });

  return loadPromise;
}
