/**
 * deepSeekClient.ts — CryptoVerse HQ
 *
 * Calls DeepSeek API via GenesisClient.proxy().
 * The API key never enters the browser bundle — it's resolved server-side
 * from Space Settings → Secrets (alias: 'deepseek').
 *
 * Setup: Space Settings → Secrets → add key 'deepseek' with your DeepSeek API key.
 */

import { GenesisClient } from '@taskade/genesis-client';
import { isApiEnabled, markApiUsed } from './apiStatusService';

const SPACE_ID = 'rdem1z86swzzv7vq';
const DS_URL = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-chat';

let _client: GenesisClient | null = null;
function client(): GenesisClient {
  if (!_client) _client = new GenesisClient({ spaceId: SPACE_ID });
  return _client;
}

export interface DSMessage { role: 'system' | 'user' | 'assistant'; content: string; }
export interface DSResponse { ok: boolean; content: string; }

const FALLBACK: Record<string, string> = {
  trading: "I can help you with trading strategies.",
  academy: "The Academy section offers structured lessons.",
  'copy-trading': "Copy trading lets you follow successful traders.",
  bots: "Trading bots can automate your strategies.",
  sentiment: "Sentiment analysis helps gauge market mood.",
  risk: "Risk management is crucial in crypto trading.",
  general: "I'm your Lynx AI. Ask me anything!",
};

function fb(msg: string): string {
  const l = msg.toLowerCase();
  if (l.includes('trade')||l.includes('buy')||l.includes('sell')) return FALLBACK.trading;
  if (l.includes('academy')||l.includes('lesson')||l.includes('quiz')||l.includes('learn')) return FALLBACK.academy;
  if (l.includes('copy')) return FALLBACK['copy-trading'];
  if (l.includes('bot')||l.includes('automat')) return FALLBACK.bots;
  if (l.includes('sentiment')) return FALLBACK.sentiment;
  if (l.includes('risk')||l.includes('loss')||l.includes('manage')) return FALLBACK.risk;
  return FALLBACK.general;
}

export async function deepSeekChat(
  msgs: DSMessage[],
  opt?: { maxTokens?: number; temperature?: number; systemPrompt?: string },
): Promise<DSResponse> {
  const all = opt?.systemPrompt ? [{ role:'system', content:opt.systemPrompt } as DSMessage, ...msgs] : msgs;

  // Admin kill switch (Super Admin → API Management). Fallback keeps UX intact.
  if (!isApiEnabled('deepseek')) {
    const last = msgs.filter(m => m.role === 'user').pop();
    const t = last ? fb(last.content) : FALLBACK.general;
    return { ok: false, content: t + '\n\n*(Note: AI service has been disabled by the administrator.)*' };
  }

  try {
    markApiUsed('deepseek');
    console.group('🔍 [deepSeek] GenesisClient.proxy()');
    console.log('Space ID:', SPACE_ID);
    console.log('Target:', DS_URL);
    console.log('Secret alias: deepseek');
    console.log('Origin:', window.location.origin);
    console.groupEnd();
    const res = await client().proxy({
      secretAlias: 'deepseek',
      url: DS_URL,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer {{secret}}',
      },
      body: {
        model: MODEL,
        messages: all.slice(-12),
        max_tokens: opt?.maxTokens ?? 512,
        temperature: opt?.temperature ?? 0.7,
        stream: false,
      },
    });

    if (res.ok) {
      const data = await res.json() as { choices:Array<{ message:{ content:string } }> };
      return { ok: true, content: data.choices?.[0]?.message?.content ?? '' };
    }

    console.error('[CryptoVerse HQ] API error', res.status);
    // 401 = API key missing or invalid. 429 = rate limited.
    if (res.status === 401) {
      return { ok: false, content: '⚠️ DeepSeek API key is not configured or is invalid.\n\nTo enable Lynx AI:\n1. Go to Space Settings → Secrets\n2. Add a key with alias "deepseek"\n3. Paste your DeepSeek API key from https://platform.deepseek.com\n\nLynx AI will work automatically once the key is set.' };
    }
    if (res.status === 429) {
      return { ok: false, content: 'AI rate limit reached. Please try again in a moment.' };
    }
    return { ok: false, content: `AI error (${res.status}). Please try again.` };
  } catch (err) {
    console.warn('[CryptoVerse HQ] Proxy failed:', err);
  }

  const last = msgs.filter(m => m.role === 'user').pop();
  const t = last ? fb(last.content) : FALLBACK.general;
  return { ok: false, content: t + '\n\n*(Note: AI service is temporarily unavailable.)*' };
}

export async function deepSeekAsk(q: string, s?: string): Promise<string> {
  return (await deepSeekChat([{ role: 'user', content: q }], { systemPrompt: s })).content;
}

// ─── Streaming Chat ──────────────────────────────────────────────────────────
export async function* deepSeekStream(
  msgs: DSMessage[],
  opt?: { maxTokens?: number; temperature?: number; systemPrompt?: string },
): AsyncGenerator<string, void, undefined> {
  const all = opt?.systemPrompt ? [{ role:'system', content:opt.systemPrompt } as DSMessage, ...msgs] : msgs;

  // Admin kill switch (Super Admin → API Management)
  if (!isApiEnabled('deepseek')) {
    yield FALLBACK.general + '\n\n*(Note: AI service has been disabled by the administrator.)*';
    return;
  }

  let res: Response;
  try {
    markApiUsed('deepseek');
    res = await client().proxy({
      secretAlias: 'deepseek',
      url: DS_URL,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer {{secret}}',
      },
      body: {
        model: MODEL,
        messages: all.slice(-12),
        max_tokens: opt?.maxTokens ?? 512,
        temperature: opt?.temperature ?? 0.7,
        stream: true,
      },
    });
  } catch {
    yield FALLBACK.general;
    return;
  }

  if (!res.ok || !res.body) { yield 'AI error. Please try again.'; return; }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const j = JSON.parse(data) as { choices: Array<{ delta: { content?: string } }> };
          const text = j.choices?.[0]?.delta?.content;
          if (text) yield text;
        } catch {}
      }
    }
  }
}

export const MENTOR_SYSTEM_PROMPT = `You are CryptoVerse HQ Lynx AI. Professional cryptocurrency trainer. Be concise. Use markdown.`;
