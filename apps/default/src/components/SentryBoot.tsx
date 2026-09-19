/**
 * SentryBoot.tsx — loads and initializes the frontend Sentry SDK at runtime.
 *
 * WHY RUNTIME INJECTION: the `<script>` tags added to app/index.html never reached
 * the published page (`window.Sentry === undefined` in the console), because the
 * Taskade Genesis build emits its own HTML shell. Injecting the CDN bundle from
 * inside the app works regardless of which HTML the runtime serves.
 *
 * Mounted once from App.tsx — NOT from main.tsx, which is a protected template file
 * (the VFS refuses edits to it, and its module body would run after its imports
 * anyway, so bootstrap crashes would be missed). The loader is idempotent: if the
 * HTML tags ever do survive a build, it finds the existing script/SDK and does not
 * double-init.
 */
import { useEffect, useRef } from 'react';
import { ensureSentryInit, isSentryEnabled } from '@/lib/sentry';

export function SentryBoot() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    void ensureSentryInit().then(ok => {
      // Exactly one line, and only on failure: a blocked CDN (offline, CSP, privacy
      // extension) must not look like a broken app in the console.
      if (!ok && !isSentryEnabled()) {
        console.warn('[Sentry] frontend SDK could not be loaded — error reporting is off for this session.');
      }
    });
  }, []);

  return null;
}

export default SentryBoot;
