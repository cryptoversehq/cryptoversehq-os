/**
 * newsService.ts — crypto news via NewsAPI, keyed through Taskade Space Secrets.
 *
 * The API key lives ONLY in Space Settings → Secrets under alias `newsapi`;
 * requests go through GenesisClient.proxy() which injects the key server-side
 * (see lib/taskadeSecretsService.ts). This is also functionally required:
 * NewsAPI's free tier rejects browser-origin requests (HTTP 426) — the
 * server-side proxy is the only way it works from a deployed web app.
 *
 * Always falls back to simulated articles on ANY failure, so a missing or
 * invalid key can never break the UI.
 */
import { proxySecretFetch } from '../lib/taskadeSecretsService';

export interface NewsArticle {
  title:       string;
  description: string;
  url:         string;
  source:      string;
  publishedAt: string;
  /** true when the article came from the simulated fallback set */
  simulated?:  boolean;
}

interface NewsApiArticle {
  title:        string;
  description:  string | null;
  url:          string;
  source:       { name: string };
  publishedAt:  string;
}

export async function fetchCryptoNews(symbols?: string[]): Promise<NewsArticle[]> {
  try {
    const query = symbols && symbols.length > 0 ? symbols.join(' OR ') : 'cryptocurrency OR bitcoin';
    const url =
      'https://newsapi.org/v2/everything' +
      `?q=${encodeURIComponent(query)}&language=en&pageSize=10&sortBy=publishedAt`;

    const res = await proxySecretFetch('newsapi', {
      url,
      headers: { 'X-Api-Key': '{{secret}}' },
    });

    if (!res.ok) {
      console.warn(`[newsService] NewsAPI returned ${res.status} — using fallback data`);
      return getFallbackNews();
    }

    const data = await res.json() as { articles?: NewsApiArticle[] };
    if (!Array.isArray(data.articles)) return getFallbackNews();

    return data.articles
      .filter(a => a.title && a.title !== '[Removed]')
      .map(a => ({
        title:       a.title,
        description: a.description ?? '',
        url:         a.url,
        source:      a.source?.name ?? 'Unknown',
        publishedAt: a.publishedAt,
      }));
  } catch (err) {
    console.warn('[newsService] Failed to fetch news, using fallback:', err);
    return getFallbackNews();
  }
}

function getFallbackNews(): NewsArticle[] {
  const now = Date.now();
  const mk = (title: string, description: string, minsAgo: number): NewsArticle => ({
    title, description, url: '#',
    source: 'CryptoVerse HQ (simulated)',
    publishedAt: new Date(now - minsAgo * 60_000).toISOString(),
    simulated: true,
  });
  return [
    mk('Crypto markets show resilience amid macroeconomic uncertainty',
       'Digital assets continue to gain adoption despite regulatory challenges.', 12),
    mk('Institutional inflows into BTC products hit multi-week high',
       'Fund flow trackers report sustained allocations from asset managers.', 47),
    mk('Layer-2 activity climbs as fees on mainnet stay elevated',
       'Rollup throughput reaches new highs while costs per transaction fall.', 95),
    mk('Stablecoin supply expands for the fourth consecutive week',
       'Analysts read growing stablecoin float as dry powder for risk assets.', 160),
    mk('Exchange reserves drift lower, echoing accumulation patterns',
       'On-chain data shows coins moving to self-custody at a steady pace.', 240),
  ];
}
