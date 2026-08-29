import { UserManager, type User } from 'oidc-client-ts';
import type * as React from 'react';
import { AuthProvider } from 'react-oidc-context';

import { GatewayAuthSync } from './gateway-auth.jsx';

/** Query params the IdP appends to `redirect_uri` on the way back. */
const OIDC_CALLBACK_PARAMS = ['code', 'state', 'session_state', 'iss'];

/**
 * Drop the OIDC callback params once the auth code has been exchanged.
 *
 * `react-oidc-context` exchanges `?code=&state=` on mount but leaves them in
 * the URL, and the PKCE state it matched them against is deleted during that
 * exchange. Any later mount of the same URL (reload, back navigation, a shared
 * link) therefore retries the callback, finds no matching state, and surfaces
 * an auth error that hides an otherwise valid session. Other params (e.g. the
 * preview `accessToken`) and the hash are kept.
 */
function onSigninCallback(): void {
  const url = new URL(window.location.href);
  let changed = false;
  for (const name of OIDC_CALLBACK_PARAMS) {
    if (url.searchParams.has(name)) {
      url.searchParams.delete(name);
      changed = true;
    }
  }
  if (changed) {
    window.history.replaceState(window.history.state, document.title, url.toString());
  }
}

/**
 * Process-wide singletons, deliberately outside React.
 *
 * `main.tsx`'s ThemeGate renders the app bare on its first pass and re-renders
 * it wrapped in a next-themes provider once a layout effect confirms the app
 * did not bring its own. That moves the whole tree one level deeper, so React
 * unmounts and remounts it - `App`, `GenesisAuth` and `AuthProvider` included.
 *
 * `AuthProvider` guards its callback with a per-instance ref, so the remounted
 * instance runs `signinCallback()` again. On the first landing after sign-in
 * the URL still legitimately carries `?code=`, and the backend consumes auth
 * codes with GETDEL (single-use by design), so that second exchange fails and
 * latches an auth error over an otherwise valid, already-stored session - the
 * user sees "Sign-in could not be completed" until they refresh by hand.
 *
 * Keeping the `UserManager` here, and memoizing the in-flight exchange on it,
 * makes the second mount await the SAME exchange instead of starting a rival
 * one. This is correct independently of the remount: an auth code is
 * single-use, so two concurrent exchanges of one code are never valid.
 */
let cachedUserManager: UserManager | null = null;
let inflightSigninCallback: Promise<User | undefined> | null = null;

function getUserManager(): UserManager {
  if (cachedUserManager != null) {
    return cachedUserManager;
  }
  const origin = window.location.origin;
  const manager = new UserManager({
    authority: `${origin}/_genesis/auth`,
    client_id: 'default',
    redirect_uri: `${origin}/`,
    scope: 'openid profile email',
  });

  // Memoize the exchange itself rather than guarding at the call site: the
  // remount happens in a layout effect, long before the first exchange's
  // network round-trip resolves, so a "have we finished?" flag would still be
  // false and the second mount would race a second redemption.
  const signinCallback = manager.signinCallback.bind(manager);
  manager.signinCallback = (url?: string): Promise<User | undefined> => {
    inflightSigninCallback ??= signinCallback(url);
    return inflightSigninCallback;
  };

  cachedUserManager = manager;
  return manager;
}

/**
 * Pre-built Genesis OIDC auth wrapper.
 *
 * Points at the app's own realm under `/_genesis/auth`, which serves the
 * discovery document every other endpoint is derived from.
 *
 * Usage in App.tsx:
 * ```tsx
 * import { GenesisAuth } from '@/lib/genesis-auth';
 *
 * function App() {
 *   return (
 *     <GenesisAuth>
 *       <ProtectedApp />
 *     </GenesisAuth>
 *   );
 * }
 * ```
 *
 * Access user profile after login:
 * ```tsx
 * import { useAuth } from 'react-oidc-context';
 *
 * function Profile() {
 *   const auth = useAuth();
 *   const { email, name, preferred_username, sub } = auth.user?.profile ?? {};
 *   // ...
 * }
 * ```
 */
export function GenesisAuth({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider userManager={getUserManager()} onSigninCallback={onSigninCallback}>
      {/* Forwards the signed-in user's id_token to the data gateway (row scoping). */}
      <GatewayAuthSync />
      {children}
    </AuthProvider>
  );
}
