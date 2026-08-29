/**
 * SecretsDebugPage.tsx — /debug/secrets
 *
 * Step-by-step verification console for the Space Secrets → external API
 * rollout. Each API row runs a live test through GenesisClient.proxy():
 *   1. verifySecret(alias)  — one minimal proxied request, classifies result
 *   2. feature-level test   — e.g. fetchCryptoNews(), reporting whether the
 *      returned data is real or the simulated fallback
 *
 * Rollout order (do NOT skip ahead): newsapi → etherscan → (coingecko: keyless,
 * skipped) → deepseek LAST.
 */
import React, { useState } from 'react';
import { CheckCircle, XCircle, Clock, Loader2, PlayCircle, ShieldCheck } from 'lucide-react';
import { verifySecret, type SecretVerification } from '@/lib/taskadeSecretsService';
import { fetchCryptoNews, type NewsArticle } from '@/services/newsService';

type Phase = 'idle' | 'running' | 'done';

interface NewsTestResult {
  verification: SecretVerification;
  articles:     NewsArticle[];
  usedFallback: boolean;
}

export default function SecretsDebugPage() {
  const [phase,  setPhase]  = useState<Phase>('idle');
  const [result, setResult] = useState<NewsTestResult | null>(null);

  const runNewsTest = async () => {
    setPhase('running');
    setResult(null);
    const verification = await verifySecret('newsapi');
    const articles = await fetchCryptoNews(['bitcoin', 'ethereum']);
    const usedFallback = articles.every(a => a.simulated);
    setResult({ verification, articles, usedFallback });
    setPhase('done');
  };

  const v = result?.verification;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Space Secrets — Integration Console</h1>
            <p className="text-sm text-muted-foreground">
              Keys live in Space Settings → Secrets and are injected server-side via the Genesis proxy.
              They never reach the browser — this page can only test whether each API <em>accepts</em> its secret.
            </p>
          </div>
        </div>

        {/* ── Step 1: NewsAPI ── */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-foreground">1 · NewsAPI <span className="text-xs font-normal text-muted-foreground">(alias: <code>newsapi</code>)</span></h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Prerequisite: add your NewsAPI key in Space Settings → Secrets under the exact alias <code>newsapi</code>.
              </p>
            </div>
            <button
              onClick={runNewsTest}
              disabled={phase === 'running'}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              {phase === 'running'
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Testing…</>
                : <><PlayCircle className="w-4 h-4" /> Run test</>}
            </button>
          </div>

          {phase === 'done' && result && v && (
            <div className="space-y-3 text-sm">
              {/* Check 1: secret accepted */}
              <div className="flex items-start gap-2">
                {v.ok
                  ? <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  : <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />}
                <div>
                  <span className="font-semibold text-foreground">Secret check{v.status ? ` (HTTP ${v.status})` : ''}: </span>
                  <span className="text-muted-foreground">{v.message}</span>
                </div>
              </div>

              {/* Check 2: feature fetch */}
              <div className="flex items-start gap-2">
                {!result.usedFallback
                  ? <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  : <XCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />}
                <div>
                  <span className="font-semibold text-foreground">News fetch: </span>
                  <span className="text-muted-foreground">
                    {result.usedFallback
                      ? `Live fetch failed — UI is safely showing ${result.articles.length} simulated fallback articles.`
                      : `Fetched ${result.articles.length} LIVE articles from NewsAPI.`}
                  </span>
                </div>
              </div>

              {/* Sample articles */}
              <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                {result.articles.slice(0, 5).map((a, i) => (
                  <div key={i} className="px-3 py-2">
                    <p className="text-[13px] font-medium text-foreground leading-snug">{a.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {a.source} · {new Date(a.publishedAt).toLocaleString()}
                      {a.simulated && ' · SIMULATED'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Queued steps ── */}
        {[
          { n: '2', name: 'Etherscan',  alias: 'etherscan', note: 'On-chain data. Wired only after NewsAPI passes.' },
          { n: '3', name: 'CoinGecko',  alias: 'coingecko', note: 'Currently keyless (public endpoints) — no secret needed yet.' },
          { n: '4', name: 'DeepSeek',   alias: 'deepseek',  note: 'LAST, with extreme caution, only after all others pass.' },
        ].map(s => (
          <div key={s.alias} className="rounded-2xl border border-dashed border-border bg-card/50 p-4 flex items-center gap-3 opacity-70">
            <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div>
              <span className="text-sm font-semibold text-foreground">{s.n} · {s.name}</span>
              <span className="text-xs text-muted-foreground ml-2">(alias: <code>{s.alias}</code>) — queued. {s.note}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
