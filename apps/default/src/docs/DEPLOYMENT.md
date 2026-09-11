# CryptoVerse HQ deployment guide

## Deployment model

CryptoVerse HQ has two deployable pieces:

1. The React application, built by the Taskade Genesis app runtime.
2. The server-authoritative Render service at `https://cryptoversehq-os.onrender.com`, which currently handles payment operations and exposes the health endpoint.

Taskade-backed user records and OTP delivery are configured in the workspace. Supabase is optional and is not the primary data or authentication provider in the current source.

## Render setup

### 1. Create or select the service

Use the existing Render web service for the CryptoVerse backend. The current default host is:

```text
https://cryptoversehq-os.onrender.com
```

If the service is recreated with another host, set `VITE_API_BASE_URL` to that origin before building the app.

### 2. Configure the health check

The correct health path is:

```text
/api/health
```

Configure Render’s health-check path as `/api/health`, not `/health`. Verify it after deployment:

```bash
curl -i https://cryptoversehq-os.onrender.com/api/health
```

A healthy response should be a successful HTTP response with the service status payload. The API root `/` is not the health endpoint and may return `404`.

### 3. Configure backend secrets

Store payment-provider credentials and server-only secrets in Render’s Environment settings. Do not put provider secrets in a `VITE_*` variable or commit them to the repository.

The browser should receive only safe response data such as payment identifiers, status, checkout URL, and request ID.

### 4. Configure service behavior

Before promoting a Render deployment:

- Confirm CORS allows the Taskade preview and published app origins.
- Keep cookie credentials enabled for authenticated payment requests.
- Keep CSRF protection enabled for payment creation.
- Accept and log `X-Request-ID` without logging passwords, tokens, payment secrets, or provider credentials.
- Preserve idempotency handling for payment creation.

## Taskade app setup

The app is previewed inside Taskade and can be published from the app’s Share controls. The Genesis runtime supplies the app origin, OIDC configuration, theme bridge, and Taskade gateway.

Important runtime facts:

- Taskade gateway calls use relative `/api/taskade/*` paths.
- The app’s primary account records live in the Taskade Users project `3dMq65zUi1A7ayiC`.
- OTP email delivery uses Taskade flow `01KJE0M3TJC8FJSZM6DJ2JPFRY`.
- The app’s payment client uses the Render host, not the Taskade gateway.
- Published apps do not have runtime environment-variable injection. Values used by the client must be configured at build time or represented by workspace resources.

## Supabase setup, optional

The current CryptoVerse source does not use Supabase as its primary auth or data provider. If a future deployment enables the optional Supabase/Render adapter, configure it on the server side and keep its service-role key out of the browser.

Recommended setup:

1. Create a Supabase project in the intended region.
2. Apply the backend schema and row-level security policies before exposing a client.
3. Create server-side environment variables for the Supabase URL and service-role key.
4. Use a publishable client key only for explicitly public browser operations.
5. Keep service-role operations behind the Render server.
6. Configure the Render service to reach Supabase over TLS.
7. Test signup, OTP verification, session expiry, payment ownership, and row isolation before switching the app away from Taskade-backed auth.

Do not document or configure Supabase as active production infrastructure until the backend adapter is actually enabled and tested.

## Environment variables

### Core Render and API variables

| Variable | Required | Used by | Notes |
|---|---:|---|---|
| `VITE_API_BASE_URL` | Optional | `src/lib/nowPaymentsClient.ts` | Render API origin. Defaults to `https://cryptoversehq-os.onrender.com`. |
| `VITE_API_URL` | Optional | `src/api/client.js` | Legacy Render/Supabase-style adapter origin. Keep aligned with the backend if that adapter is enabled. |

### On-chain variables

| Variable | Required | Purpose |
|---|---:|---|
| `VITE_ETHERSCAN_API_KEY` | Optional | Ethereum explorer integration |
| `VITE_BSCSCAN_API_KEY` | Optional | BNB Chain explorer integration |
| `VITE_POLYGONSCAN_API_KEY` | Optional | Polygon explorer integration |
| `VITE_ARBISCAN_API_KEY` | Optional | Arbitrum explorer integration |
| `VITE_SOLANA_RPC_URL` | Optional | Solana RPC endpoint |
| `VITE_MEMPOOL_API_BASE_URL` | Optional | Self-hosted Mempool endpoint; public Mempool access is the fallback |

### Sentiment variables

| Variable | Required | Purpose |
|---|---:|---|
| `VITE_TWITTER_BEARER_TOKEN` | Optional | X/Twitter sentiment integration |
| `VITE_REDDIT_CLIENT_ID` | Optional | Reddit integration |
| `VITE_REDDIT_CLIENT_SECRET` | Optional | Reddit integration |
| `VITE_NEWS_API_KEY` | Optional | News sentiment integration |

### NFT variables

| Variable | Required | Purpose |
|---|---:|---|
| `VITE_OPENSEA_API_KEY` | Optional | Enables OpenSea integration flag; keep the actual secret in the workspace secret proxy when applicable |
| `VITE_BLUR_API_KEY` | Optional | Blur integration flag |

### Exchange variables

| Variable | Required | Purpose |
|---|---:|---|
| `VITE_BINANCE_API_KEY` | Optional | Binance connection configuration |
| `VITE_BINANCE_API_SECRET` | Optional | Binance connection configuration |
| `VITE_COINBASE_API_KEY` | Optional | Coinbase connection configuration |
| `VITE_COINBASE_API_SECRET` | Optional | Coinbase connection configuration |

### AI variables

| Variable | Required | Purpose |
|---|---:|---|
| `VITE_DEEPSEEK_API_KEY` | Optional | DeepSeek integration flag/configuration |

### Secret safety

Any value prefixed with `VITE_` is available to browser code after build. Never place a production exchange secret, payment-provider secret, Supabase service-role key, or private signing key in a `VITE_*` variable. Prefer a server-side Render variable or the Taskade workspace secret proxy for keyed third-party calls.

## Deployment checklist

### Before deploy

- Run `npm test`.
- Run `npm run build`.
- Confirm the app uses `/api/health` for health checks.
- Confirm `VITE_API_BASE_URL` points to the intended Render origin.
- Confirm no real credentials are committed.
- Confirm Taskade Users project and OTP flow are available.

### After deploy

```bash
curl -i "$VITE_API_BASE_URL/api/health"
```

Then verify in the app:

1. The preview or published shell renders.
2. Signup or login can find the Taskade-backed user record.
3. OTP delivery and verification complete.
4. Protected virtual routes reject unauthenticated access.
5. A demo exchange connection can be created without live credentials.
6. Payment history returns an authentication error when signed out and user data when signed in.
7. Payment creation requests receive CSRF and idempotency headers.
8. Payment verification reflects the server status.
9. Browser console and Render logs contain no secrets.

## Troubleshooting

### `/health` returns 404

Use `/api/health`. Update the Render health-check setting and any client reference. The current client reference is already `/api/health`.

### Payment history returns 401

This is expected when no authenticated Render session is present. Confirm the user session and cookie configuration before treating it as a backend outage.

### The app shows simulated data

Optional provider variables are empty. This is the intended fallback. Configure the relevant integration only after its server-side security path is ready.

### OTP does not arrive

Check the Taskade OTP flow, its connected email credential, the Users project, and the webhook request. Do not create a second user row as a workaround; the signup and login paths are designed around the existing user record.
