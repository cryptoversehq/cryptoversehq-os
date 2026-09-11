const RENDER_ORIGIN = 'https://cryptoversehq-os.onrender.com';

export const COINGECKO_PROXY_BASE = `${RENDER_ORIGIN}/api/market/coingecko`;

export function coinGeckoProxyUrl(path: string, params?: Record<string, string | number>): string {
  const normalizedPath = path.replace(/^\/+/, '');
  const url = new URL(`${COINGECKO_PROXY_BASE}/${normalizedPath}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}
