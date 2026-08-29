import axios from 'axios';
const BASE = 'https://api.coingecko.com/api/v3';

export interface LiveCoin { id: string; symbol: string; name: string; }
export interface OHLCCandle { time: number; open: number; high: number; low: number; close: number; }
export interface LivePrice { usd: number; usd_24h_change: number; usd_24h_vol: number; usd_market_cap: number; }

const COIN_LIST_KEY = 'cv_coinlist_v4';
const COIN_LIST_TTL = 24 * 60 * 60 * 1000;
let _coinListPromise: Promise<LiveCoin[]> | null = null;

export async function fetchCoinList(): Promise<LiveCoin[]> {
  if (_coinListPromise) return _coinListPromise;
  try {
    const cached = localStorage.getItem(COIN_LIST_KEY);
    if (cached) {
      const p = JSON.parse(cached) as { data: LiveCoin[]; ts: number };
      if (Date.now() - p.ts < COIN_LIST_TTL) { _coinListPromise = Promise.resolve(p.data); return p.data; }
    }
  } catch { /**/ }
  _coinListPromise = axios.get<{ id: string; symbol: string; name: string }[]>(
    BASE + '/coins/list', { timeout: 15000 }
  ).then(r => {
    const data: LiveCoin[] = r.data.map(c => ({ id: c.id, symbol: c.symbol.toUpperCase(), name: c.name }));
    try { localStorage.setItem(COIN_LIST_KEY, JSON.stringify({ data, ts: Date.now() })); } catch { /**/ }
    return data;
  }).catch(() => { _coinListPromise = null; return FALLBACK_COINS; });
  return _coinListPromise;
}

// In-memory cache for live prices to avoid repeated CORS-blocked requests.
// CoinGecko API is CORS-restricted from taskade.app — we cache aggressively.
const _priceCache: { data: Record<string, LivePrice>; ts: number } = { data: {}, ts: 0 };
const PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchLivePrices(coinIds: string[]): Promise<Record<string, LivePrice>> {
  if (!coinIds.length) return {};

  // Return cached data if still fresh
  const now = Date.now();
  if (now - _priceCache.ts < PRICE_CACHE_TTL) {
    // Filter cache to only requested coin IDs
    const cached: Record<string, LivePrice> = {};
    let allCached = true;
    for (const id of coinIds) {
      if (_priceCache.data[id]) {
        cached[id] = _priceCache.data[id];
      } else {
        allCached = false;
        break;
      }
    }
    if (allCached) return cached;
  }

  try {
    const r = await axios.get<Record<string, { usd: number; usd_24h_change: number; usd_24h_vol: number; usd_market_cap: number; }>>(
      BASE + '/simple/price',
      { params: { ids: coinIds.join(','), vs_currencies: 'usd', include_24hr_change: true, include_24hr_vol: true, include_market_cap: true }, timeout: 8000 }
    );
    const data = r.data as Record<string, LivePrice>;
    // Update cache on successful fetch
    _priceCache.data = { ..._priceCache.data, ...data };
    _priceCache.ts = now;
    return data;
  } catch {
    // CoinGecko is CORS-blocked from taskade.app — return cached data if available, else empty.
    // If cache has some data even if expired, return it as a fallback.
    if (Object.keys(_priceCache.data).length > 0) {
      const fallback: Record<string, LivePrice> = {};
      for (const id of coinIds) {
        if (_priceCache.data[id]) fallback[id] = _priceCache.data[id];
      }
      return fallback;
    }
    return {};
  }
}

const DAYS_FOR_TF: Record<string, number> = { '1m':1,'5m':1,'15m':7,'1h':30,'4h':90,'1D':365,'1W':730 };
const OHLC_CACHE: Record<string, { data: OHLCCandle[]; ts: number }> = {};

export async function fetchOHLC(coinId: string, timeframe: string): Promise<OHLCCandle[]> {
  const key = coinId + '_' + timeframe;
  const cached = OHLC_CACHE[key];
  if (cached && Date.now() - cached.ts < 60000) return cached.data;
  const days = DAYS_FOR_TF[timeframe] ?? 7;
  try {
    const r = await axios.get<number[][]>(BASE + '/coins/' + coinId + '/ohlc', { params: { vs_currency: 'usd', days }, timeout: 10000 });
    const seen = new Set<number>();
    const candles = r.data.map(a => ({ time: Math.floor(a[0] / 1000), open: a[1], high: a[2], low: a[3], close: a[4] }))
      .filter(c => { if (seen.has(c.time)) return false; seen.add(c.time); return true; })
      .sort((a, b) => a.time - b.time);
    OHLC_CACHE[key] = { data: candles, ts: Date.now() };
    return candles;
  } catch { return []; }
}

const FALLBACK_COINS: LiveCoin[] = [
  { id:'bitcoin',symbol:'BTC',name:'Bitcoin' },{ id:'ethereum',symbol:'ETH',name:'Ethereum' },
  { id:'binancecoin',symbol:'BNB',name:'BNB' },{ id:'solana',symbol:'SOL',name:'Solana' },
  { id:'ripple',symbol:'XRP',name:'XRP' },{ id:'dogecoin',symbol:'DOGE',name:'Dogecoin' },
  { id:'cardano',symbol:'ADA',name:'Cardano' },{ id:'avalanche-2',symbol:'AVAX',name:'Avalanche' },
  { id:'polkadot',symbol:'DOT',name:'Polkadot' },{ id:'chainlink',symbol:'LINK',name:'Chainlink' },
  { id:'uniswap',symbol:'UNI',name:'Uniswap' },{ id:'litecoin',symbol:'LTC',name:'Litecoin' },
  { id:'near',symbol:'NEAR',name:'NEAR Protocol' },{ id:'matic-network',symbol:'MATIC',name:'Polygon' },
  { id:'cosmos',symbol:'ATOM',name:'Cosmos' },{ id:'tron',symbol:'TRX',name:'TRON' },
  { id:'stellar',symbol:'XLM',name:'Stellar' },{ id:'shiba-inu',symbol:'SHIB',name:'Shiba Inu' },
  { id:'pepe',symbol:'PEPE',name:'Pepe' },{ id:'sui',symbol:'SUI',name:'Sui' },
  { id:'arbitrum',symbol:'ARB',name:'Arbitrum' },{ id:'optimism',symbol:'OP',name:'Optimism' },
  { id:'aave',symbol:'AAVE',name:'Aave' },{ id:'maker',symbol:'MKR',name:'Maker' },
  { id:'fantom',symbol:'FTM',name:'Fantom' },
];
