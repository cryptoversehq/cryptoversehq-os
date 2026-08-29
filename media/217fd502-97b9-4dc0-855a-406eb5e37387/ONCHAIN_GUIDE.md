# CryptoVerse AI — On-Chain Analysis Guide (for On-Chain Analyst Agent)

## Supported Blockchains
| Chain | Symbol | Avg Block Time | Explorer | Native Price (sim) |
|-------|--------|---------------|----------|---------------------|
| Ethereum | ETH | 12 sec | etherscan.io | ~$3,400 |
| Bitcoin | BTC | 600 sec | mempool.space | ~$65,000 |
| BNB Chain | BNB | 3 sec | bscscan.com | ~$590 |
| Solana | SOL | 0.4 sec | solscan.io | ~$170 |
| Polygon | MATIC | 2 sec | polygonscan.com | ~$0.85 |

## Alert Types
1. **Whale Transaction** — Large value movement on a chain (>= minimum USD threshold)
2. **Wallet Activity** — Any transaction from a specific tracked wallet address
3. **Exchange Flow** — Inflow/outflow crossing thresholds on exchange addresses

## Whale Tier Classification
| Tier | Value Range | Icon | Significance |
|------|------------|------|-------------|
| Shrimp | < $10K | 🦐 | Low |
| Fish | $10K – $100K | 🐟 | Moderate |
| Dolphin | $100K – $1M | 🐬 | Notable |
| Whale | $1M – $10M | 🐋 | High |
| Mega | > $10M | 🔱 | Critical |

## Alert Templates (Pre-configured)
| Template | Chain | Min Value | Type |
|----------|-------|-----------|------|
| Mega Whale Move | Ethereum | $5,000,000 | whale_transaction |
| BTC Whale Alert | Bitcoin | $1,000,000 | whale_transaction |
| SOL Dolphin | Solana | $100,000 | whale_transaction |
| BNB Tracker | BNB Chain | $500,000 | whale_transaction |
| Exchange Inflow Alert | Bitcoin | $500,000 | exchange_flow |
| Wallet Activity Monitor | Ethereum | $10,000 | wallet_activity |
| Small Fish Detector | Ethereum | < $10K | whale_transaction |

## Known Address Labels
- **Binance Cold Wallet** — 0xbe0eb53f46cd790cd13851d5eff43d12404d33e8 (Ethereum)
- **Binance Hot Wallet** — 0x28c6c06298d514db089934071355e5743bf21d60 (Ethereum)
- **Binance BTC Hot** — 34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo (Bitcoin)
- **Coinbase Custody** — 0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43 (Ethereum)
- **Uniswap V2 Router** — 0x7a250d5630b4cf539739df2c5dacb4c659f2488d
- **Kraken Exchange** — 0x98c3d3183c4b8a650614ad179a1a98be0a8d6b8e
- **Mt. Gox Trustee** — 1P5ZEDWTKTFGxQjZphgWPQUpe554WKDfHQ (Bitcoin)
- **Polygon Bridge** — 0xf3938337f7294fef84e9b2c6d548a93f956cc281
- **QuickSwap Router** — 0x5757371414417b8c6caad45baef941abc7d3ab32 (Polygon)
- **Polygon Staking** — 0xab45bf58c6482b87da85d6688c4d9640e093be98

## Significance Scoring (0-1 scale)
- **sizePart** (up to 0.4): Based on transaction USD value
- **destinationPart** (up to 0.3): Exchange deposit = higher significance
- **sourcePart** (up to 0.3): Known whale source = higher significance
- **patternPart** (up to 0.2): Unusual or rare patterns

## Smart Wallet Scoring (0-100, >=70 = "smart wallet")
Metrics tracked:
- Win Rate (0-100%)
- Total Profit %
- Sharpe Ratio (risk-adjusted return)
- Trade Consistency (0-1)
- Max Drawdown %
- Total Trades
- Average Trade Size (USD)

## Exchange Flow Analysis
- **Inflow** = Coins moving INTO exchanges → bearish signal (selling pressure)
- **Outflow** = Coins moving OUT of exchanges → bullish signal (holding/accumulation)
- **Net Flow** = Inflow - Outflow (positive = net inflow)
- Signals: bullish | bearish | neutral

## Token Standards Supported
- **native** — ETH, BTC, BNB, SOL
- **ERC-20** — Ethereum tokens
- **BEP-20** — BNB Chain tokens
- **SPL** — Solana Program Library tokens
- **BRC-20** — Bitcoin Ordinals tokens

## Alert Configuration Limits
- Max active alerts per user: **50**
- Min alert value: **$100 USD**
- Max alert value: **$1,000,000,000 USD**
- Simulation fires events every **~12 seconds**
- Event retention: **30 days**
- Max events per user: **500** (ring buffer)
- Max total events: **5,000**

## AI On-Chain Analyst Rules
- Explain whale movements and market implications
- Help users set up alerts with appropriate thresholds
- Guide smart money wallet discovery
- Interpret exchange flow data (inflow = bearish, outflow = bullish)
- Connect on-chain signals to trading implications WITHOUT telling users to trade
- Use accurate blockchain terminology
- Reference block explorers for verification
- Warn: on-chain data is one input among many for trading decisions