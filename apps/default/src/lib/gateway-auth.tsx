import * as React from 'react';
import { useAuth } from 'react-oidc-context';

/**
 * Forwards the signed-in Genesis end-user's OIDC `id_token` to the Taskade data
 * gateway so the backend can enforce per-user row scoping.
 *
 * Why this exists: the headless data gateway (`/api/taskade/.../nodes/*`, which
 * Director proxies to `/web-api/v1/gateways/<token>/...`) can optionally restrict
 * each request to the rows owned by the *verified* end-user (`SpaceApp` row
 * scoping — opt-in, default-OFF). That enforcement only works if the app actually
 * presents the user's identity. Generated app code calls the gateway in many
 * styles (raw `fetch`, the global `axios`, `axios.create()` instances), so instead
 * of a shared client we attach the token at the network-primitive layer: we patch
 * `fetch` and `XMLHttpRequest` once. Any request to the gateway gets
 * `Authorization: Bearer <id_token>`; every other request (third-party APIs,
 * static assets) is left untouched.
 *
 * Inert when no user is signed in (the token stays null → no header is added), so
 * apps that don't use row scoping behave exactly as before.
 */

// The latest verified end-user `id_token`, kept outside React so the patched
// network primitives — which run outside the component tree — can read it.
let currentIdToken: string | null = null;

/** Sync point for the React side — see {@link GatewayAuthSync}. */
export function setGatewayIdToken(token: string | null): void {
  currentIdToken = token;
}

/**
 * True only for requests to OUR first-party data gateway — never third-party
 * APIs. The token must never leak off-site, so this guard is load-bearing.
 *  - published: same-origin `/api/taskade/*` (Director proxies it to the gateway)
 *  - dev/preview: a same-origin `/web-api/v1/gateways/*` path
 *
 * The same-origin check is essential: matching on pathname alone would attach
 * the token to a cross-origin URL whose path merely starts with a gateway prefix
 * (e.g. `https://evil.example/api/taskade/x` or `//evil.example/...`), leaking it.
 */
function isGatewayRequest(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl, window.location.origin);
    if (url.origin !== window.location.origin) {
      return false;
    }
    return (
      url.pathname.startsWith('/api/taskade/') || url.pathname.includes('/web-api/v1/gateways/')
    );
  } catch {
    return false;
  }
}

interface XHRWithGatewayUrl extends XMLHttpRequest {
  __taskadeGatewayUrl?: string;
}

type GatewayAuthWindow = Window & { __taskadeGatewayAuthInstalled__?: boolean };

/**
 * Patches `fetch` + `XMLHttpRequest` once to attach the end-user `id_token` to
 * gateway requests. Idempotent (safe under hot-reload / double-import); a no-op
 * outside the browser.
 */
function installGatewayAuthInterceptors(): void {
  if (typeof window === 'undefined') {
    return;
  }
  const w = window as GatewayAuthWindow;
  if (w.__taskadeGatewayAuthInstalled__ === true) {
    return;
  }
  w.__taskadeGatewayAuthInstalled__ = true;

  // --- fetch (native fetch calls + libraries using the fetch adapter) ---
  const realFetch = window.fetch.bind(window);
  window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (currentIdToken != null && isGatewayRequest(url)) {
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${currentIdToken}`);
      }
      return realFetch(input, { ...init, headers });
    }
    return realFetch(input, init);
  };

  // --- XMLHttpRequest (the default axios adapter + axios.create() instances) ---
  const realOpen = window.XMLHttpRequest.prototype.open;
  const realSend = window.XMLHttpRequest.prototype.send;
  window.XMLHttpRequest.prototype.open = function patchedOpen(
    this: XHRWithGatewayUrl,
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) {
    this.__taskadeGatewayUrl = typeof url === 'string' ? url : url.href;
    return realOpen.call(this, method, url, async ?? true, username, password);
  };
  window.XMLHttpRequest.prototype.send = function patchedSend(
    this: XHRWithGatewayUrl,
    body?: Document | XMLHttpRequestBodyInit | null,
  ) {
    const url = this.__taskadeGatewayUrl;
    if (currentIdToken != null && url != null && isGatewayRequest(url)) {
      try {
        this.setRequestHeader('Authorization', `Bearer ${currentIdToken}`);
      } catch {
        // setRequestHeader throws if the request isn't OPENED — ignore and let
        // it proceed unscoped rather than break the call.
      }
    }
    return realSend.call(this, body);
  };
}

// Install as a module side-effect so a bare `import './lib/gateway-auth'` in the
// entry point is enough. Idempotent, so importing it elsewhere is harmless.
installGatewayAuthInterceptors();

/**
 * Bridges the OIDC user's `id_token` into the network interceptors above.
 * Renders nothing. Must live inside the OIDC `<AuthProvider>` — {@link GenesisAuth}
 * mounts it automatically, so app authors don't need to wire it up.
 */
export function GatewayAuthSync(): null {
  const auth = useAuth();
  const idToken = auth.user?.id_token ?? null;
  React.useEffect(() => {
    setGatewayIdToken(idToken);
    return () => setGatewayIdToken(null);
  }, [idToken]);
  return null;
}
