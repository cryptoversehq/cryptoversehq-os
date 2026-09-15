import { ErrorResponse, UserManager, type User } from 'oidc-client-ts';
import * as React from 'react';
import { AuthProvider, useAuth } from 'react-oidc-context';

import { GatewayAuthSync } from './gateway-auth';

/** Query params the IdP appends to `redirect_uri` on the way back. */
const OIDC_CALLBACK_PARAMS = ['code', 'state', 'session_state', 'iss'];

/**
 * An in-app path (`/admin?tab=2#top`) is safe to return to after sign-in; a
 * destination taken from a query parameter is not. Only a single leading `/`
 * qualifies: `//host` and `/\host` are protocol-relative and would leave the
 * app, and anything with a scheme is refused by the same rule.
 */
export function isSafeAppPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith('/\\')
  );
}

/** The path the OIDC `state` carries through the sign-in round trip. */
type SigninState = { returnTo: string };

/**
 * Where a sign-in started, minus any stale callback params, so a sign-in
 * clicked on a not-yet-cleaned callback URL does not carry them back.
 */
function currentAppPath(): string {
  const url = new URL(window.location.href);
  for (const name of OIDC_CALLBACK_PARAMS) {
    url.searchParams.delete(name);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * The in-app path a completed sign-in should land on, read off the round
 * tripped OIDC `state`, or null when there is none worth honouring.
 */
export function readReturnTo(state: unknown): string | null {
  if (typeof state !== 'object' || state == null) {
    return null;
  }
  const { returnTo } = state as Partial<SigninState>;
  return isSafeAppPath(returnTo) ? returnTo : null;
}

/**
 * The URL the app should show once the auth code has been exchanged:
 * `current` with the OIDC callback params dropped, moved to `returnTo` when
 * the sign-in carried one. Pure, so it can be tested without a browser.
 */
export function signinLandingUrl(current: URL, returnTo: string | null): URL {
  const url = new URL(current.href);
  for (const name of OIDC_CALLBACK_PARAMS) {
    url.searchParams.delete(name);
  }
  if (returnTo != null) {
    const target = new URL(returnTo, url.origin);
    url.pathname = target.pathname;
    url.search = target.search;
    url.hash = target.hash;
  }
  return url;
}

/**
 * Finish the sign-in on the page the user started from.
 *
 * Two jobs, both on the URL. First, drop the OIDC callback params once the
 * auth code has been exchanged: `react-oidc-context` exchanges `?code=&state=`
 * on mount but leaves them in the URL, and the PKCE state it matched them
 * against is deleted during that exchange, so any later mount of the same URL
 * (reload, back navigation, a shared link) would retry the callback, find no
 * matching state, and surface an auth error that hides a valid session. Other
 * params (e.g. the preview `accessToken`) and the hash are kept.
 *
 * Second, return to where the sign-in began. `redirect_uri` is the app root,
 * so every sign-in used to land on `/`, whatever the user was trying to reach
 * (#28786: an owner signing in for `/admin` landed on the public page with no
 * path onward, and apps compensated with a `sessionStorage` flag written by
 * exactly one button). The path now rides in the OIDC `state`, which
 * `signinRedirect` below fills in for every entry point. `replaceState` alone
 * is invisible to React Router, which reads the location on `popstate`, so
 * one is dispatched when the path moved.
 */
function onSigninCallback(user: User | undefined): void {
  const current = new URL(window.location.href);
  const next = signinLandingUrl(current, readReturnTo(user?.state));
  if (next.href === current.href) {
    return;
  }
  const pathMoved =
    next.pathname !== current.pathname ||
    next.search !== current.search ||
    next.hash !== current.hash;
  window.history.replaceState(window.history.state, document.title, next.toString());
  if (pathMoved) {
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
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
/** One silent sign-in attempt per page load, remounts included (see above). */
let silentSigninAttempted = false;

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

  // Every sign-in remembers where it started (see `onSigninCallback`), from
  // whichever button or gate triggered it. A caller's own `state` wins.
  const signinRedirect = manager.signinRedirect.bind(manager);
  manager.signinRedirect = (args = {}): Promise<void> => {
    const state: SigninState | unknown =
      args.state === undefined ? { returnTo: currentAppPath() } : args.state;
    return signinRedirect({ ...args, state });
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
 *
 * `auth.signinRedirect()` brings the user back to the page it was called from
 * (path, query and hash), so a gate on `/admin` needs no return flag of its own.
 */
export function GenesisAuth({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider userManager={getUserManager()} onSigninCallback={onSigninCallback}>
      {/* Forwards the signed-in user's id_token to the data gateway (row scoping). */}
      <GatewayAuthSync />
      <SessionRenewal />
      {children}
    </AuthProvider>
  );
}

/**
 * Keeps a signed-in user signed in (#26083). Renders nothing.
 *
 * Token renewal itself needs no code here: the auth server now hands out a
 * refresh token and `oidc-client-ts` uses it automatically before the
 * 15-minute access token expires. Two gaps remain that the library leaves to
 * the app:
 *
 *  1. A new tab (or a reload after the tab's sessionStorage is gone) starts
 *     with no stored user, and nothing in `react-oidc-context` tries to sign
 *     in silently on mount. The auth server keeps a session cookie for this
 *     app, so ONE `signinSilent()` attempt at mount signs the user back in
 *     without the login form. `login_required` (no session) is the normal
 *     signed-out state and is swallowed; the app's own sign-in button remains
 *     the visible path.
 *  2. When a refresh is refused (`invalid_grant`: the chain was revoked,
 *     replayed, expired, or the account was disabled) the library raises
 *     `silentRenewError` but leaves `isAuthenticated` true with a dead token.
 *     Dropping the user here flips the app to signed-out so it shows sign-in
 *     instead of failing every gateway call with 401 until a manual refresh.
 *     Timeouts and 5xx are left alone: the library retries those itself.
 */
function SessionRenewal(): null {
  const auth = useAuth();
  const { events, removeUser, signinSilent, isLoading, user } = auth;

  React.useEffect(() => {
    if (silentSigninAttempted || isLoading || user != null) {
      return;
    }
    const url = new URL(window.location.href);
    if (OIDC_CALLBACK_PARAMS.some((name) => url.searchParams.has(name))) {
      // A callback is in flight; AuthProvider is exchanging the code.
      return;
    }
    silentSigninAttempted = true;
    signinSilent().catch(() => {
      // login_required, timeout, or an auth server without sessions: signed out.
    });
  }, [isLoading, user, signinSilent]);

  React.useEffect(() => {
    return events.addSilentRenewError((error) => {
      if (error instanceof ErrorResponse && error.error === 'invalid_grant') {
        void removeUser();
      }
    });
  }, [events, removeUser]);

  return null;
}
