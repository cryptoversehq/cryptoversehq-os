# CryptoVerse HQ API documentation

## API model

CryptoVerse HQ exposes two related contracts:

- **Virtual application API** - typed routes registered in `src/api/*.ts`. Calls are dispatched through `apiGet`, `apiPost`, `apiPut`, and `apiDel` in `src/api/client.ts`. These routes operate on application stores and return an `ApiResponse` envelope.
- **Render service API** - server-authoritative authentication and payment endpoints. The current payment client uses `https://cryptoversehq-os.onrender.com` by default and sends credentials with browser requests.

The virtual API is not a public HTTP server by itself. Use the app client rather than issuing browser requests directly to these paths.

## Virtual API response envelope

Successful dispatches return:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "requestId": "req_1710000000000_1",
    "durationMs": 4,
    "version": "1.0"
  }
}
```

Errors return:

```json
{
  "ok": false,
  "error": "VALIDATION_ERROR",
  "message": "Invalid request.",
  "details": {
    "errorClass": ["client"]
  },
  "requestId": "req_1710000000000_2"
}
```

## Authentication flow

The primary CryptoVerse account flow is implemented in `src/lib/authApi.ts`:

1. Normalize the email address.
2. Read the Taskade Users project.
3. For signup, create a pending user with a PBKDF2 password hash and time-limited OTP.
4. For login or recovery, validate the password and update the user OTP.
5. Invoke the Taskade OTP automation flow.
6. The user submits the code to `verifyOtp`.
7. The user record is marked verified and the OTP fields are cleared.
8. `authStore` holds the active user context in memory for virtual API authorization.

The Taskade Users project is `3dMq65zUi1A7ayiC`. OTP delivery uses the Taskade flow `01KJE0M3TJC8FJSZM6DJ2JPFRY`.

The legacy `src/api/client.js` adapter also contains Render-style `/auth/send-otp`, `/auth/verify-otp`, `/auth/logout`, and `/auth/me` paths. Those paths are separate from the primary Taskade-backed auth implementation and should not be treated as interchangeable without a backend contract.

## Virtual endpoint catalog

### Strategies

| Method | Path | Auth | Purpose |
|---|---|---:|---|
| POST | `/api/strategies` | Yes | Create a strategy |
| GET | `/api/strategies` | No | List and filter marketplace strategies |
| GET | `/api/strategies/:id` | No | Read strategy details and current-user ownership/rating |
| PUT | `/api/strategies/:id` | Yes | Update an owned strategy or an admin-managed strategy |
| DELETE | `/api/strategies/:id` | Yes | Delete an owned strategy or an admin-managed strategy |
| POST | `/api/strategies/:id/purchase` | Yes | Purchase a strategy with CP coins |
| POST | `/api/strategies/:id/rate` | Yes | Add a rating and optional review |

Create example:

```ts
await apiPost('/api/strategies', {
  name: 'Momentum Pulse',
  shortDescription: 'Trend-following strategy',
  description: 'Uses momentum confirmation before entry.',
  type: 'custom',
  price: 0,
  tags: ['momentum'],
  requiredPlan: 'any',
  requiredLevel: 0,
  requiresKyc: false,
  code: 'return signal;',
  paramDocs: 'signal: number',
});
```

List query fields include `page`, `pageSize` up to 100, `type`, `minRating`, `maxPrice`, `search`, `isFree`, and `sortBy`.

### Trading bots

| Method | Path | Auth | Purpose |
|---|---|---:|---|
| GET | `/api/bots/templates` | No | List active bot templates |
| GET | `/api/bots/user` | Yes | List bots owned by the current user |
| POST | `/api/bots` | Yes | Create a bot from a template |
| PUT | `/api/bots/:id` | Yes | Update bot configuration or schedule |
| DELETE | `/api/bots/:id` | Yes | Delete a user bot |
| POST | `/api/bots/:id/start` | Yes | Start a bot |
| POST | `/api/bots/:id/stop` | Yes | Stop a bot |

Create example:

```json
{
  "templateId": "template-id",
  "name": "BTC Momentum Bot",
  "config": {"symbol": "BTC/USDT", "risk": "balanced"},
  "scheduleType": "continuous",
  "scheduleValue": ""
}
```

### Backtests

| Method | Path | Auth | Purpose |
|---|---|---:|---|
| POST | `/api/backtest/run` | Yes | Submit a backtest session |
| GET | `/api/backtest/sessions` | Yes | List the current user’s sessions |
| GET | `/api/backtest/sessions/:id` | Yes | Read metrics, trades, and parameters |
| POST | `/api/backtest/compare` | Yes | Compare completed strategy sessions |

Run example:

```json
{
  "coinId": "bitcoin",
  "symbol": "BTC/USDT",
  "timeframe": "1h",
  "startDate": "2025-01-01",
  "endDate": "2025-03-01",
  "initialBalance": 10000,
  "feeRate": 0.001,
  "strategyType": "momentum",
  "strategyConfig": {"lookback": 20},
  "sessionName": "BTC momentum test"
}
```

### Exchange connections

| Method | Path | Auth | Purpose |
|---|---|---:|---|
| POST | `/api/exchange/connect` | Yes | Create a demo or live exchange connection |
| GET | `/api/exchange/connections` | Yes | List the current user’s connections |
| DELETE | `/api/exchange/connections/:id` | Yes | Remove a connection |
| GET | `/api/exchange/balance/:id` | Yes | Read connection balance |
| POST | `/api/exchange/sync/:id` | Yes | Request a balance or account sync |
| POST | `/api/exchange/order` | Yes | Submit an exchange order |

Live connections require both credentials. Demo connections must not include live credentials. Order symbols use the form `BASE/QUOTE`, quantity must be positive, and non-market orders require a positive price.

### Copy trading

| Method | Path | Auth | Purpose |
|---|---|---:|---|
| GET | `/api/copy/following` | Yes | List traders followed by the current user |
| GET | `/api/copy/followers` | Yes | List the current user’s followers |
| POST | `/api/copy/follow/:traderId` | Yes | Follow a trader with copy settings |
| DELETE | `/api/copy/unfollow/:id` | Yes | Stop copying a relationship |
| PUT | `/api/copy/settings/:id` | Yes | Update copy percentage and limits |

### On-chain monitoring

| Method | Path | Auth | Purpose |
|---|---|---:|---|
| GET | `/api/onchain/whales` | No | Read whale transactions, with optional chain, minimum value, and limit filters |
| POST | `/api/onchain/alerts` | Yes | Create a whale or address alert |
| GET | `/api/onchain/alerts` | Yes | List the current user’s alerts |
| DELETE | `/api/onchain/alerts/:id` | Yes | Delete an alert |
| GET | `/api/onchain/events` | Yes | List triggered events for the current user |

Alert example:

```json
{
  "chain": "ethereum",
  "alertType": "whale_transaction",
  "minValueUsd": 100000,
  "maxValueUsd": null,
  "address": "0x...",
  "label": "High-value wallet"
}
```

### Sentiment

| Method | Path | Auth | Purpose |
|---|---|---:|---|
| GET | `/api/sentiment/current/:symbol` | No | Read the latest sentiment snapshot |
| GET | `/api/sentiment/historical/:symbol` | No | Read historical snapshots, with a `days` query value |
| POST | `/api/sentiment/alerts` | Yes | Create a sentiment threshold alert |

### NFT monitoring

| Method | Path | Auth | Purpose |
|---|---|---:|---|
| GET | `/api/nft/collections` | No | List collections, optionally filtered by chain, sort, and limit |
| GET | `/api/nft/collection/:slug` | No | Read collection details |
| POST | `/api/nft/wallet/track` | Yes | Track a wallet for the current user |
| GET | `/api/nft/wallet/:address` | Yes | Read a tracked wallet snapshot |

Track-wallet example:

```json
{
  "address": "0x1234...abcd",
  "chain": "ethereum",
  "label": "Main wallet"
}
```

### Events

| Method | Path | Auth | Purpose |
|---|---|---:|---|
| GET | `/api/events/upcoming` | No | List upcoming live events |
| GET | `/api/events/active` | No | List active live events |
| POST | `/api/events/:id/register` | Yes | Register the current user for an event |
| GET | `/api/events/:id/leaderboard` | No | Read the event leaderboard |

### Recommendations

| Method | Path | Auth | Purpose |
|---|---|---:|---|
| GET | `/api/recommendations` | Yes | Read personalized recommendations |
| POST | `/api/recommendations/:id/click` | Yes | Mark a recommendation as clicked |
| POST | `/api/recommendations/:id/dismiss` | Yes | Dismiss a recommendation |

Recommendation query fields include `types`, `minScore`, and `limit`.

## Render service endpoints

The server-authoritative payment client uses `VITE_API_BASE_URL`, defaulting to `https://cryptoversehq-os.onrender.com`.

| Method | Path | Auth and headers | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | Render service health check |
| GET | `/api/auth/csrf` | Cookie session | Initialize the CSRF token used by payment creation |
| POST | `/api/payments/create` | Authenticated cookie session, `X-CSRF-Token`, `Idempotency-Key` | Create a subscription or CP payment |
| GET | `/api/payments/verify/:paymentId` | Authenticated session | Ask the server to verify payment status |
| GET | `/api/payments/history` | Authenticated session | Read the current user’s payment history |

Create-payment example:

```json
{
  "purchaseType": "subscription",
  "productId": "pro-monthly",
  "payCurrency": "usdttrc20"
}
```

The client also sends `Accept: application/json` and a unique `X-Request-ID`. Payment creation adds an idempotency key. The browser never marks a plan or CP balance as paid; the server response is authoritative.

## Legacy Render-style adapter

`src/api/client.js` contains an optional adapter configured by `VITE_API_URL`:

| Method | Path | Purpose |
|---|---|---|
| POST | `/payments/create` | Legacy payment creation |
| GET | `/payments/verify/:id` | Legacy payment verification |
| GET | `/payments/history` | Legacy payment history |
| POST | `/auth/send-otp` | Legacy OTP request |
| POST | `/auth/verify-otp` | Legacy OTP verification and token storage |
| POST | `/auth/logout` | Legacy logout |
| GET | `/auth/me` | Legacy current-user lookup |
| GET | `/api/health` | Health check |
| GET | `/test` | Test endpoint |

Do not mix this adapter’s token flow with the Taskade-backed primary auth flow unless the Render backend explicitly supports both contracts.

## Error codes

| Code | HTTP meaning | Typical cause |
|---|---:|---|
| `UNAUTHORIZED` | 401 | No active user context or invalid session |
| `FORBIDDEN` | 403 | Authenticated user lacks permission |
| `NOT_FOUND` | 404 | Resource or route does not exist |
| `CONFLICT` | 409 | Duplicate or conflicting resource |
| `VALIDATION_ERROR` | 422 | Invalid request fields |
| `INSUFFICIENT_BALANCE` | 402 | Not enough CP coins |
| `PLAN_REQUIRED` | 403 | Feature requires a higher plan |
| `KYC_REQUIRED` | 403 | KYC verification is required |
| `LEVEL_REQUIRED` | 403 | User level is too low |
| `RATE_LIMITED` | 429 | Too many requests |
| `SERVER_ERROR` | 500 | Unexpected server failure |
| `STORE_ERROR` | 500 | Feature store operation failed |
| `NOT_IMPLEMENTED` | 501 | Route is not implemented |

For payment requests, the Render client surfaces the server’s `message` field when available and clears its cached CSRF token after a `401` response.
