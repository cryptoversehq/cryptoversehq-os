# CryptoVerse HQ

CryptoVerse HQ is a React-based crypto intelligence and trading workspace. It combines portfolio views, simulated and connected exchange workflows, strategy research, backtesting, NFT and on-chain monitoring, sentiment analysis, live events, copy trading, and account payments in one responsive application.

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Documentation map](#documentation-map)

## Features

### Trading and portfolio

- Dashboard and portfolio views
- Exchange connection management for supported exchanges
- Demo exchange connections without live credentials
- Balance refresh and exchange synchronization
- Market and simulated trading workflows
- Risk controls, trade history, and trading guidance

### Strategies and automation

- Strategy marketplace with search, filters, ratings, purchases, and creator tools
- User trading bots with templates, schedules, start, stop, and update actions
- Backtest submission, session history, result inspection, and strategy comparison
- Copy trading relationships, follower management, and copy settings

### Intelligence and monitoring

- On-chain whale activity, wallet monitoring, alerts, and triggered events
- Current and historical sentiment views with alert creation
- NFT collection discovery and tracked-wallet snapshots
- Personalized recommendations with click and dismiss tracking
- Live events, registration, and event leaderboards
- AI assistant and guidance surfaces

### Accounts and payments

- Email and password account registration and login
- One-time-password verification for signup, login, and recovery flows
- User roles, account status, and section permissions
- Server-authoritative NOWPayments checkout, verification, and history
- Subscription and CP purchase flows

## Architecture

The application has four practical layers:

1. **React UI** - routes and feature pages under `src/`, composed by `src/App.tsx` and grouped route files.
2. **Virtual API** - route handlers under `src/api/` dispatch typed requests to Zustand-backed stores. These handlers provide a REST-shaped contract without requiring a separate API server for local state domains.
3. **Cloud integrations** - Taskade project and flow calls provide user records and OTP delivery. Payment operations use the Render service configured by `VITE_API_BASE_URL`.
4. **Persistence and state** - feature stores own local and cloud-backed state according to each feature’s adapter. Do not assume every virtual endpoint is a remote HTTP endpoint.

The current Render service is `https://cryptoversehq-os.onrender.com` unless overridden by `VITE_API_BASE_URL`.

## Tech stack

- React 18.3 and TypeScript
- Vite-compatible Taskade Genesis app runtime
- React Router
- Zustand state management
- Tailwind CSS 3 and Radix UI primitives
- Recharts, Framer Motion, Leaflet, React Hook Form, Zod
- Taskade CloudDataLayer and automation flows
- NOWPayments through the server-side Render API

## Installation

### Prerequisites

- Node.js compatible with the repository toolchain
- npm
- Access to the CryptoVerse HQ Taskade space for cloud-backed features
- Optional Render, exchange, chain-indexer, sentiment, or NFT credentials for live integrations

### Steps

```bash
cd app
npm install
npm run dev
```

The repository also exposes these scripts:

```bash
npm run build   # build the app with the Taskade template builder
npm test        # run the Vitest suite
```

The app can run in simulation mode when optional provider configuration is absent. This is expected for local development and does not imply that a third-party integration is connected.

## Usage

1. Open the application and create an account or sign in.
2. Complete the email OTP step when requested.
3. Start from the dashboard to review portfolio, market, strategy, and account state.
4. Use demo exchange mode to explore trading screens without live exchange keys.
5. Open Strategies, Bots, Backtests, Copy Trading, NFT, On-Chain, Sentiment, or Events from the application navigation.
6. Configure optional integrations only when the corresponding provider account and credentials are ready.
7. Use the payment page for subscription or CP purchases. Payment status is confirmed by the Render service, not by client-side plan changes.

## Configuration

Environment variables are optional unless a feature explicitly requires them. See [DEPLOYMENT.md](./DEPLOYMENT.md) for the complete matrix.

Important defaults:

- `VITE_API_BASE_URL` defaults to `https://cryptoversehq-os.onrender.com` for NOWPayments calls.
- `VITE_API_URL` is used by the legacy `src/api/client.js` adapter when that adapter is enabled.
- Provider keys are read through `src/lib/env.ts` and should not be committed to source control.

## Deployment

Use the [deployment guide](./DEPLOYMENT.md) for Render configuration, optional Supabase setup, environment variables, health checks, and post-deploy verification.

The expected Render health endpoint is:

```text
GET https://cryptoversehq-os.onrender.com/api/health
```

The root path `/` is an API service path, not the application UI, so a `404` response there is not a service health failure.

## Documentation map

- [API.md](./API.md) - virtual API routes, Render payment routes, examples, authentication, and error codes
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Render, optional Supabase, environment variables, and verification
- `../../docs/01_data_layer.md` - Taskade data and automation conventions
- `../../docs/03_routing_pages.md` - route and page organization
- `../../docs/05_deployment_publish.md` - Taskade preview and published app behavior
