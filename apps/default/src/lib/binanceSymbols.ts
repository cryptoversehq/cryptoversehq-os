/**
 * binanceSymbols.ts
 *
 * CoinGecko coin-id → Binance ticker-symbol map, for the optional live
 * WebSocket feed (useBinanceLiveFeed). Only covers pairs that are actually
 * listed on Binance as a USDT market — unmapped coins simply don't get a
 * "Live Feed" option and silently keep using the simulator, exactly like
 * every other optional data source in this app.
 */

export const BINANCE_SYMBOLS: Record<string, string> = {
  bitcoin: 'btcusdt', ethereum: 'ethusdt', binancecoin: 'bnbusdt', solana: 'solusdt',
  ripple: 'xrpusdt', dogecoin: 'dogeusdt', cardano: 'adausdt', tron: 'trxusdt',
  'avalanche-2': 'avaxusdt', polkadot: 'dotusdt', chainlink: 'linkusdt', litecoin: 'ltcusdt',
  near: 'nearusdt', 'matic-network': 'maticusdt', uniswap: 'uniusdt', cosmos: 'atomusdt',
  fantom: 'ftmusdt', 'the-graph': 'grtusdt', sui: 'suiusdt', pepe: 'pepeusdt',
  'shiba-inu': 'shibusdt', arbitrum: 'arbusdt', optimism: 'opusdt', aave: 'aaveusdt',
};

/** Returns a lowercase Binance stream symbol (e.g. "btcusdt"), or null if unlisted. */
export function getBinanceSymbol(coinId: string): string | null {
  return BINANCE_SYMBOLS[coinId] ?? null;
}
