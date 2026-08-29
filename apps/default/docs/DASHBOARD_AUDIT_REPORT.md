# 🔍 Cryptoverse Dashboard — Comprehensive Audit Report

**Date:** 2026-06-30  
**Auditor:** AI Code Review  
**Scope:** Full Dashboard section (Dashboard.tsx, DashboardHome.tsx, all trading sub-components, stores, and market engine)

---

## 📁 1. Files Related to Dashboard

### A. Main Component Files (JSX/TSX)

| File | Role |
|------|------|
| `app/src/components/Dashboard.tsx` | **Live Trading Dashboard** — Real-time trading interface with chart, order book, watchlist, trade panel, price alerts. This is the `/trading` route. |
| `app/src/components/DashboardHome.tsx` | **Home/Overview Dashboard** — Landing page after login. Shows account summary, market overview, recent trades, events, daily rewards, sentiment widget, finance panel. This is the `/dashboard` (and `/`) route. |
| `app/src/components/trading/TradingChart.tsx` | Full TradingView-style chart — candlestick SVG renderer, line chart (Recharts), depth chart, SMA/RSI/MACD indicators, drawing tools (horizontal line, trendline, fibonacci), volume profile, pattern detection, multi-timeframe panel. |
| `app/src/components/trading/TradePanel.tsx` | Order placement panel — Limit/Market/Stop-Limit tabs, Buy/Sell switch, amount/price inputs, leverage slider, TP/SL, quick-fill percentages, AI risk check, flash messages. |
| `app/src/components/trading/BottomPanel.tsx` | Bottom data panel with 4 tabs: Open Positions, Order History, Trade History, Funds. Shows P&L, liquidation prices, TP/SL levels. |
| `app/src/components/trading/OrderBook.tsx` | Order book visualization with bid/ask walls. |
| `app/src/components/trading/PriceAlertPanel.tsx` | Price alert configuration panel + toast stack overlay. |
| `app/src/components/trading/MultiTimeframePanel.tsx` | Multi-timeframe analysis preview across 1m → 1W. |
| `app/src/components/trading/WatchlistPanel.tsx` | Alternative watchlist component. |
| `app/src/components/trading/CoinSearchModal.tsx` | Coin search modal. |
| `app/src/components/trading/VolumeProfile.tsx` | Volume profile bars overlay on chart. |
| `app/src/components/trading/PatternOverlay.tsx` | Candlestick pattern detection overlay (engulfing, doji, hammer, etc.). |
| `app/src/components/trading/DrawingOverlay.tsx` | SVG overlay for drawing tools. |
| `app/src/components/trading/DrawingToolbar.tsx` | Toolbar for drawing tools. |
| `app/src/components/trading/LWChart.tsx` | Lightweight chart wrapper. |
| `app/src/components/trading/Sparkline.tsx` | Mini sparkline chart. |
| `app/src/components/trading/TradingSchool.tsx` | Trading education component. |
| `app/src/components/trading/GuidedPractice.tsx` | Guided trading practice. |
| `app/src/components/AnimatedNumber.tsx` | Animated number display component. |
| `app/src/components/OnboardingChecklist.tsx` | New user onboarding checklist. |
| `app/src/components/QuickTradeModal.tsx` | Quick trade modal popup. |
| `app/src/components/WelcomeGuide.tsx` | Welcome guide for new users. |
| `app/src/components/features/AIPortfolioHealth.tsx` | AI portfolio health score widget. |
| `app/src/components/features/PredictionGameWidget.tsx` | Price prediction game widget. |
| `app/src/components/features/SocialSentimentWidget.tsx` | Social sentiment widget. |
| `app/src/components/features/PreTradeRiskCheck.tsx` | Pre-trade risk check AI modal. |
| `app/src/components/features/SmartStopLoss.tsx` | AI smart stop-loss suggester. |
| `app/src/components/sentiment/sentimentUtils.ts` | Sentiment color/utility functions. |

### B. Logic / Store / Service Files

| File | Role |
|------|------|
| `app/src/lib/tradingStore.ts` | **Core trading store** (Zustand + persist). Manages balance ($100K initial), positions, trade history, open/close position logic, TP/SL auto-close, fee calculations. |
| `app/src/lib/marketEngine.ts` | **Market simulation engine**. Generates realistic OHLCV candles (GBM model), order book depth, trade feed, calculates SMA/RSI/MACD indicators. All simulated — no external API needed for chart data. |
| `app/src/lib/watchlistStore.ts` | **Watchlist store** (Zustand). Manages tracked coins, price ticks, 24h change tracking, sparkline data. |
| `app/src/lib/priceAlertStore.ts` | **Price alert store** (Zustand). Alert creation, condition checking (above/below/cross), Web Audio sound synthesis on trigger, toast management. |
| `app/src/lib/coins.ts` | **Coin metadata**. 100+ coins with CoinGecko ID, symbol, name, brand color. |
| `app/src/lib/liveMarketService.ts` | **CoinGecko API service**. Fetches coin list and live prices with 5-min caching. Falls back to simulated data on API failure. |
| `app/src/lib/drawingStore.ts` | **Drawing tools store**. Manages chart drawings (horizontal lines, trendlines, fibonacci). |
| `app/src/lib/sentimentStore.ts` | **Sentiment analysis store**. Fear & Greed index, social sentiment aggregates. |
| `app/src/lib/liveEventStore.ts` | **Live events store**. Trading competitions, prediction challenges, etc. |
| `app/src/lib/sentimentTypes.ts` | Sentiment type definitions (Fear & Greed zones). |
| `app/src/lib/authStore.ts` | Authentication store (user profile, plan). |
| `app/src/lib/academyStore.ts` | Academy/trading school XP tracking. |
| `app/src/lib/cpCoinsStore.ts` | CP Coins (in-app currency) balance. |
| `app/src/lib/monetizationStore.ts` | Creator earnings/pending payouts. |
| `app/src/lib/subscriptionStore.ts` | Subscription plan management. |
| `app/src/lib/appStore.ts` | Global app store with notification handler bridge. |
| `app/src/hooks/useMarketOverview.ts` | Market overview hook (market cap, volume). |

### C. Style Files

| File | Role |
|------|------|
| `app/src/index.css` | Global CSS (likely Tailwind + custom styles). |
| `app/src/styles/rtl.css` | RTL layout support. |
| Inline styles + Tailwind classes | Dashboard.tsx and DashboardHome.tsx both use extensive inline `style={{}}` objects and Tailwind `className` utilities. No separate CSS module files exist for dashboard components. |

---

## 🏗️ 2. Structure and Layout Analysis

### DashboardHome.tsx Layout (Overview Page)
```
┌─────────────────────────────────────────────────┐
│ ① Greeting Banner (user avatar, name, plan, XP) │
├─────────────────────────────────────────────────┤
│ ② Onboarding Checklist                          │
├─────────────────────────────────────────────────┤
│ ③ Account Summary Cards (4 cards)               │
│  [Balance] [Today's P&L] [Win Rate] [XP Points] │
├─────────────────────────────────────────────────┤
│ ④ Market Overview (3 quick stat cards)          │
│  [Market Cap] [24h Volume] [Fear & Greed]       │
├─────────────────────────────────────────────────┤
│ ⑤ Moving Markets (10 coins) + Recent Trades     │
│  (5-col grid: 3 for markets, 2 for trades)      │
├─────────────────────────────────────────────────┤
│ ⑥ Portfolio Allocation (conditional: if pos>0) │
├─────────────────────────────────────────────────┤
│ ⑦ Upcoming Events + Daily Reward (3-col grid)  │
├─────────────────────────────────────────────────┤
│ ⑧ Market Sentiment Widget (full width)          │
│  [Mini gauge] [Overall bar] [Coin pills] [CTAs] │
├─────────────────────────────────────────────────┤
│ ⑨ Finance Quick Actions (4 tiles)               │
│  [Wallet] [Buy CP] [Earnings] [Subscription]    │
├─────────────────────────────────────────────────┤
│ ⑩ AI Feature Widgets (3-col grid)               │
│  [Portfolio Health] [Prediction] [Social]       │
├─────────────────────────────────────────────────┤
│ ⑪ Quick Actions (4 buttons)                     │
│  [Trade Now] [Portfolio] [Academy] [Leaderboard]│
└─────────────────────────────────────────────────┘
```
**Assessment:** The layout is logically ordered, moving from personal overview → market data → actionable items. However, the page is extremely long (11 distinct sections) and may overwhelm new users. The order is generally good: greeting first, then key metrics, then market data, then actions.

### Dashboard.tsx Layout (Trading Page)
```
┌──────────────────────────────────────────────────────┐
│ HEADER: Coin Selector | Live Price | 24h Stats | Alerts│
├──────────────────────┬───────────────┬───────────────┤
│                      │               │               │
│    TRADING CHART     │  Order Panel  │  WATCHLIST    │
│    (Candlestick /    │  / Order Book │  SIDEBAR      │
│     Line / Depth)    │  (tabbed)     │  (200px)      │
│    + Indicators      │  (280px)      │               │
│    + Drawing Tools   │               │               │
│    + Volume Profile  │               │               │
│                      │               │               │
│    Flex: 1           │  Flex-shrink  │  Flex-shrink  │
│                      │               │               │
├──────────────────────┴───────────────┴───────────────┤
│ BOTTOM PANEL: Positions | Orders | Trades | Funds    │
│ (210px height)                                      │
└──────────────────────────────────────────────────────┘
```
**Assessment:** Professional trading terminal layout, similar to Binance/Bybit. The 3-panel layout (chart center, order book right, watchlist far right) is industry standard. The bottom panel provides position management. Well organized.

---

## ⚙️ 3. Functions and Data Analysis

### Data Displayed

**DashboardHome.tsx:**
- User greeting, avatar, plan level, XP progress
- Account balance, today's P&L, win rate, XP points
- Market overview (cap, volume, fear & greed)
- Live market prices for 10 coins (BTC, ETH, BNB, SOL, XRP, ADA, DOGE, DOT, LINK, MATIC)
- Recent closed trades (last 5)
- Portfolio allocation (position breakdown)
- Upcoming events (max 3)
- Daily reward streak + claim button
- Market sentiment (Fear & Greed mini-gauge + social sentiment)
- Finance overview (wallet, buy CP, earnings, subscription)
- AI widgets (portfolio health, prediction game, social sentiment)

**Dashboard.tsx:**
- Live price ticker for selected coin
- 24h stats (change, high, low, volume)
- OHLCV candlestick chart (with SMA/RSI/MACD indicators)
- Order book depth (bids/asks visualization)
- Trade feed (simulated)
- Position management (open, close, TP/SL)
- Trade history
- Watchlist with live price updates
- Price alerts (configurable with sound)
- Drawing tools (horizontal lines, trendlines, fibonacci)
- Volume profile overlay
- Pattern detection (engulfing, doji, hammer, etc.)
- Multi-timeframe analysis (1m → 1W)

### Data Sources

| Data | Source | Real/Fake |
|------|--------|-----------|
| Coin metadata | `coins.ts` (hardcoded) | Static real coin data |
| Live prices (DashboardHome) | `useTickingPrices()` → CoinGecko API / simulated fallback | **Hybrid** — Tries CoinGecko first, falls back to GBM simulation |
| Chart OHLCV candles | `marketEngine.ts` → `generateCandles()` | **100% simulated** (Geometric Brownian Motion model) |
| Order book depth | `marketEngine.ts` → `generateOrderBook()` | **100% simulated** |
| Trade feed | `marketEngine.ts` → `generateTrade()` | **100% simulated** |
| Account balance | `tradingStore.ts` (Zustand + localStorage persist) | Real user data (persisted) |
| Positions & history | `tradingStore.ts` (Zustand + localStorage persist) | Real user data (persisted) |
| Watchlist | `watchlistStore.ts` (Zustand) | Real user data (in-memory, seeded on mount) |
| Price alerts | `priceAlertStore.ts` (Zustand) | Real user data (in-memory) |
| Sentiment data | `sentimentStore.ts` | **Simulated** — Fear & Greed index + social sentiment |
| Events | `liveEventStore.ts` → `seedEvents()` | **Simulated** events |
| User profile | `authStore.ts` | Real/simulated user data |
| XP / Academy | `academyStore.ts` | Real user progress |
| CP Coins | `cpCoinsStore.ts` | Real in-app currency |
| Subscription | `subscriptionStore.ts` | Real plan data |
| Daily reward | `localStorage` | Real user data (daily streak) |

### Automatic Updates

| Mechanism | Interval | Details |
|-----------|----------|---------|
| Dashboard.tsx price tick | **1 second** | `setInterval` updates currentPrice, regenerates order book, creates trade, updates watchlist ticks, checks price alerts |
| DashboardHome.tsx price tick | **1.2 seconds** | Simulated price ticks between CoinGecko fetches for smooth UI |
| DashboardHome.tsx CoinGecko fetch | **30 seconds** | Real API call to CoinGecko for live prices |
| Chart candle ticks | **Every price update** | `tickCandles()` updates the last candle or appends a new one |
| Price alert checking | **Every price tick (1s)** | `checkAlerts()` compares current price against all active alerts |
| TP/SL auto-close | **Every price tick (1s)** | `checkPriceAlerts()` in tradingStore auto-closes triggered positions |

### Error Handling

- **CoinGecko API failures:** `useTickingPrices()` has a try/catch that silently falls back to simulated data. The comment says "CoinGecko down — keep simulated". ✅ Good graceful degradation.
- **Trading errors:** `openPosition()` returns `{ success: false, error: string }` for insufficient balance, invalid amount, or invalid price. Flash messages show errors to user. ✅ Good.
- **Position close:** Guards against non-existent positions. ✅ Good.
- **localStorage corruption:** `getDailyState()` has try/catch with fallback defaults. ✅ Good.
- **Watchlist seeding:** Uses `getBasePrice()` with random fallback for unknown coins. ✅ Good.
- **NO error boundaries:** There are no React Error Boundary components wrapping the dashboard. A single chart rendering crash could take down the entire page. ❌ Missing.
- **NO loading states:** The dashboard components have no loading/skeleton states. ❌ Missing.
- **NO empty state handling for API failures:** If CoinGecko is down, users see simulated data with no indication it's simulated. ❌ Missing transparency.

---

## 👤 4. User Experience Analysis

### Information Findability
- **DashboardHome:** The sheer number of sections (11) makes it difficult to find specific information. A new user would be overwhelmed.
- **Dashboard (Trading):** Professional terminal layout is good for experienced traders but intimidating for beginners. No progressive disclosure.
- **No search/filter on DashboardHome:** Users cannot filter the market list or search for specific coins on the home page. They must navigate to Trading.

### Tooltips / Help
- **TradePanel:** Has a title tooltip on the "Mkt" button ("Use market price"). Minimal.
- **Drawing tools:** Has a hint bar showing instructions when a tool is active. ✅ Good.
- **No general tooltips:** Most elements lack tooltips. New users won't know what "24h Vol", "Leverage", "TP/SL", "Limit vs Market" orders mean.
- **No onboarding flow on Trading page:** The Trading page has no guided tour or first-time help.

### Suitability for Novice Users
- **DashboardHome is moderately beginner-friendly:** The greeting, onboarding checklist, and daily reward are welcoming. But the density of information is too high.
- **Dashboard (Trading) is NOT beginner-friendly:** It's a full professional trading terminal with leverage up to 100x, complex order types, indicators, and drawing tools. A novice could easily lose their entire balance.
- **The TradingSchool component exists** but is a separate page — there's no "Learn" link from the Trading dashboard.

### Feedback Appropriateness
- **Flash messages:** ✅ Good — success/error messages appear for 2.5 seconds.
- **Price alert notifications:** ✅ Excellent — toast stack with sound synthesis.
- **TP/SL notifications:** ✅ Good — liquidation and take-profit notifications.
- **Button press feedback:** ✅ Good — `active:scale-95` on most buttons.
- **No transaction confirmation dialogs:** Positions open immediately on button click with no confirmation step. ❌ Risky.

---

## 🐛 5. Identified Problems

### A. Appearance / Visual Bugs

1. **Inconsistent color scheme usage:** `Dashboard.tsx` uses hardcoded hex colors (`#0f1117`, `#1e2026`) while `DashboardHome.tsx` uses Tailwind classes (`bg-card`, `text-foreground`). The trading page doesn't respond to theme changes.
2. **Dark text on dark backgrounds risk:** The daily reward claimed state uses `text-black` on `bg-amber-400`, which works in light mode but breaks if the theme were to change.
3. **No responsive breakpoints in Dashboard.tsx:** The trading page has fixed widths (280px right panel, 200px watchlist). On smaller screens, these will overflow or be cut off.
4. **Scrollbar inconsistency:** `Dashboard.tsx` uses `scrollbar-thin scrollbar-thumb-white/10` while `DashboardHome.tsx` doesn't customize scrollbars at all.
5. **The CandlestickSVG component lacks a fallback when `svgSize.w === 0`:** During initial render, the chart area shows nothing until ResizeObserver fires.
6. **The `fontFamily: 'Inter, system-ui, sans-serif'` in Dashboard.tsx inline style** overrides any global font settings inconsistently.

### B. Functional Problems

1. **✅ FIXED: Memory leak in Dashboard.tsx useEffect — missing cleanup for watchlist ticks.** The cleanup function now calls `Object.keys(watchPrices).forEach(k => delete watchPrices[k])` to clear all stale price data when the component unmounts, preventing stale base prices on remount.
2. **✅ FIXED: `handleCoinChange` / 24h stats were incorrect.** `change24h` is now calculated as `((price - open24h) / open24h) * 100` using a rolling open price stored in `openPrice24hRef`. High/low/volume accumulate over a true 24h window (86,400,000ms) and reset when the window expires.
3. **✅ FIXED: Duplicate logic between `handleCoinChange` and `handleWatchlistSelect`.** Both now delegate to a single `switchCoin(c, price)` callback that handles all state initialization, eliminating the duplication risk.
4. **✅ FIXED: `useTickingPrices()` race condition.** Added `realFetchPending` lock and `lastRealFetchTs` timestamp guard. Simulated ticks now skip when a CoinGecko fetch is in-flight or just completed (within 2 seconds), preventing simulated prices from momentarily overriding real data.
5. **✅ FIXED (in Critical Fix 2 above): 24h high/low/change now uses proper rolling 24h window.**
6. **✅ FIXED: `TradingChart` duplicate ticker bar removed.** The chart no longer shows its own price + 24h stats header — the Dashboard header bar serves as the single source of truth. This reclaims ~50px of vertical space for the chart.
7. **🟡 No deduplication of CoinGecko requests:** `DashboardHome` and other parts of the app may concurrently call CoinGecko. The `liveMarketService.ts` has some caching but could still cause rate limiting.
8. **✅ FIXED: Input validation in TradePanel.** Added comprehensive validation before `openPosition()` call: checks for finite positive numbers on amount, price, stop price, TP, and SL inputs. Also rejects amounts exceeding 2× balance. Each validation shows a specific flash error message.

### C. User Experience Flaws

1. **✅ FIXED: DashboardHome information overload.** Added `CollapsibleSection` component with localStorage-persisted collapse state for all major sections (account, market overview, moving markets, portfolio, events, sentiment, finance, AI widgets, quick actions). Users can now hide sections they don't need.
2. **✅ FIXED: Trading page inaccessible to beginners.** Added Beginner/Advanced mode toggle in the Dashboard header (persisted to `cv_trading_mode` in localStorage). Beginner mode: max 3× leverage (vs 100×), trade confirmation dialog before every order, green-themed UI indicator. Advanced mode: full professional terminal.
3. **✅ FIXED: No tooltips.** Added `?` help icon on the Leverage slider with hover tooltip explaining what leverage does. Additional tooltips are added via the `title` attribute on key UI elements.
4. **✅ FIXED: No confirmation dialogs for trades.** TradePanel now calls `onRequestConfirm()` in beginner mode, which triggers a full-screen Trade Confirmation Dialog in Dashboard.tsx showing pair, side, amount, price, leverage, and a high-leverage warning. Users must click "Confirm Buy/Sell" before the order executes.
5. **✅ FIXED: No responsive design for trading terminal.** Added mobile panel toggle buttons (📋 for order panel, ⭐ for watchlist) in the Dashboard header. Both the 280px right panel and 200px watchlist now support `hidden` class via toggle, and use `maxWidth: '100%'` to prevent overflow on narrow screens. The header also uses `flex-wrap` for small viewports.

### D. Integration Flaws

1. **Two separate "Dashboard" components serve different purposes** but share no common layout context. `Dashboard.tsx` (trading) and `DashboardHome.tsx` (overview) have completely different visual designs.
2. **The `appStore` notification bridge pattern is fragile:** `registerNotifyHandler()` must be called before any trading action, but there's no guarantee of initialization order.
3. **CoinGecko API key is optional but handled inconsistently:** `useTickingPrices()` reads `VITE_COINGECKO_API_KEY` from env, but `liveMarketService.ts` doesn't use it in the same way.
4. **✅ FIXED: Sentiment data subscription bypass.** `DashboardHome.tsx` now uses `useSentimentStore(s => s.getMarketFearGreed()?.index ?? 50)` (hook selector) instead of `useSentimentStore.getState()` inside JSX. The component properly re-renders when sentiment data updates.

---

## 💡 6. Improvement Suggestions

### A. Appearance Improvements (3)

1. **Unify the design system across both dashboards.** Replace hardcoded colors in `Dashboard.tsx` (`#0f1117`, `#1e2026`, `#848e9c`) with CSS variables that respond to the app's theme. Create a `dashboard-theme.css` with `--cv-chart-bg`, `--cv-panel-bg`, `--cv-text-secondary`, etc. This ensures consistency and enables future dark/light mode support.

2. **Add skeleton loading states to DashboardHome.** When CoinGecko data is loading (first 2-3 seconds), show animated skeleton cards instead of the initial simulated prices. This improves perceived performance and shows users that real data is being fetched.

3. **Implement collapsible sections on DashboardHome.** Add chevron toggle buttons to each section (Market Overview, Moving Markets, Portfolio Allocation, Events, Sentiment, Finance, AI Widgets). Save collapse state to localStorage so returning users see their preferred layout.

### B. Performance Improvements (3)

1. **Reduce the tick interval or batch updates.** The 1-second `setInterval` in Dashboard.tsx triggers: price update, order book regeneration, trade generation, watchlist tick (for ALL coins), and alert checking — all in a single tick. This is up to 60+ state updates per second across multiple stores. **Suggestion:** Increase to 2-3 second intervals, or use `requestAnimationFrame` + `useMemo` to batch price-dependent calculations.

2. **Memoize the CandlestickSVG rendering.** The SVG component recalculates all candle positions, Y-axis labels, and SMA paths on every render. Use `React.memo` with proper prop comparison, and move the `toY`, `toX` calculation functions outside the render with `useMemo`.

3. **Lazy-load the Trading page sub-components.** `TradingChart`, `TradePanel`, `OrderBook`, `BottomPanel`, and all indicator panels are imported eagerly. Use `React.lazy()` + `Suspense` to code-split the trading dashboard, reducing the initial bundle size for users who never visit the trading page.

### C. User Experience Improvements (3)

1. **Add a "Trading Mode" toggle: Beginner / Advanced.** In Beginner mode: hide leverage slider (fixed at 1x), show only Market orders, add confirmation dialogs before trades, show tooltips on every UI element, highlight the TradingSchool link. In Advanced mode: show the full current UI.

2. **Add an "Explain This" help system.** Place a small `?` icon next to complex elements (leverage, TP/SL, limit vs market, RSI, MACD, volume profile). Clicking it opens a small tooltip with a 2-sentence plain-English explanation. Store seen tooltips so they don't annoy repeat users.

3. **Implement a customizable dashboard layout.** Let users drag-and-drop sections to reorder them, choose which sections to show/hide, and save their layout to localStorage. Power users want different information than beginners.

### D. Additional Enhancement Ideas

1. **Add a "Market Status" indicator bar** at the top showing whether markets are currently open (traditional markets), Bitcoin dominance, total crypto market cap, and the Fear & Greed index as a persistent top bar across all pages.

2. **Implement a real-time P&L counter** next to each position row that animates the number changes (similar to crypto exchanges). Currently P&L only updates when the component re-renders.

3. **Add trade notes/journaling.** Let users attach a note to each trade ("FOMO buy", "Followed signal from X", "Testing new strategy"). Display these in the trade history. This builds a learning loop for traders.

4. **Create a "Market Heatmap" widget** for DashboardHome — a treemap showing top 50 coins colored by 24h change, similar to Coin360. This gives an at-a-glance market overview better than the current 10-row list.

5. **Add social/community features to the dashboard:** Show what other traders are buying/selling (anonymized), trending coins, and "Top Movers" in the last hour.

6. **Implement price prediction accuracy tracking.** The `PredictionGameWidget` exists — show users their historical prediction accuracy and streak on the dashboard to gamify engagement.

7. **Add a "Risk Score" for each open position** that combines leverage, position size relative to balance, market volatility, and current drawdown into a simple 1-10 score with color coding.

8. **Create a mobile-responsive trading view.** The current `Dashboard.tsx` is unusable on mobile with its fixed 280px + 200px side panels. A mobile version could stack vertically: chart on top, swipeable panels below.

9. **Add trade notifications to the browser** via the Web Notification API. When a TP/SL is hit or a price alert triggers, show a system notification even when the tab is in the background.

10. **Implement a "Replay Mode"** for the trading chart — let users scroll back in time to review past price action and their own trades overlaid on the chart.

11. **Add a watchlist import/export feature** — let users share watchlists via URL or JSON, and import popular trader watchlists.

12. **Create a "Daily Briefing" modal** that shows on first login: yesterday's P&L summary, top market movers, upcoming events today, and a motivational trading tip.

---

## 📊 Summary

The Cryptoverse Dashboard is a feature-rich, professionally structured trading application with two main views:

- **DashboardHome.tsx** — A comprehensive overview page with 11 sections covering account status, markets, events, sentiment, and quick actions. It attempts to serve both novice and experienced users but leans toward information overload.
- **Dashboard.tsx** — A full-featured trading terminal with real-time simulated market data, professional charting, order management, and advanced tools (drawings, pattern detection, volume profile, multi-timeframe analysis).

**Key Strengths:**
- Professional-grade trading terminal layout
- Comprehensive feature set (indicators, drawing tools, pattern detection, alerts)
- Good error handling for trading operations
- Real-time price simulation with smooth fallback when API is unavailable
- Sound synthesis for price alerts (creative use of Web Audio API)
- Zustand stores are well-structured with clear separation of concerns

**Critical Issues Found & Fixed:**
- ✅ **Memory leak** — FIXED: `watchPrices` module-scope object is now cleaned up on unmount via `Object.keys(watchPrices).forEach(k => delete watchPrices[k])` in the interval cleanup return
- ✅ **24h high/low/change calculations** — FIXED: Now uses proper rolling window logic. `openPrice24hRef` tracks the opening price, 24h change is calculated as `((current - open) / open) * 100`, highs/lows accumulate over the window, and everything resets every 86,400,000ms (true 24h). On coin switch, values are seeded from the switch price or existing `watchPrices` entry.
- ✅ **Duplicate code** — FIXED: Extracted shared logic into single `switchCoin(c, price)` callback. Both `handleCoinChange` and `handleWatchlistSelect` now delegate to `switchCoin`, eliminating duplicate price initialization code.

**Remaining Issues:**
- No error boundaries, loading states, or simulated data transparency
- Trading dashboard is inaccessible to beginners
- Missing persist middleware on watchlist store (data lost on refresh)
- Design inconsistency between the two dashboard pages

**Priority Fixes (remaining):**
1. Add error boundaries around chart and trading components
2. Add beginner/advanced mode toggle to trading page
3. Unify design tokens across both dashboards
4. Add skeleton loading states
5. Implement collapsible sections on DashboardHome
6. Lazy-load trading page components
