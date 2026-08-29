/**
 * domTranslator.ts — DOM-level auto-translation engine.
 *
 * Uses Google Translate's free, no-API-key endpoint (same as translate.google.com).
 * Falls back to the paid API key if one is configured in localStorage.
 *
 * Design:
 *  1. TreeWalker collects every visible Text node in the DOM.
 *  2. WeakMap<Text, string> stores the original English text permanently.
 *  3. A two-level cache (memory Map + localStorage) stores translations.
 *     - On revisiting a page, nodes whose text already matches the cached
 *       translation are SKIPPED — no network call, instant display.
 *  4. Text nodes whose ancestors have data-notranslate are completely skipped.
 *  5. MutationObserver watches for new nodes and translates them automatically.
 */

import { LangCode } from './i18n';

// ─── Constants ────────────────────────────────────────────────────────────────

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'KBD', 'SAMP',
  'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'SVG', 'MATH',
]);

const MIN_LEN    = 2;
const CHUNK_SIZE = 80;
const DEBOUNCE   = 100;
const CACHE_TTL  = 7 * 24 * 60 * 60 * 1000; // 7 days
const LS_PREFIX  = 'cv_tr_v4_';

// ─── Module state ─────────────────────────────────────────────────────────────

/** Permanent store of every Text node's original English content */
const originals  = new WeakMap<Text, string>();

/** Two-level translation cache: lang:text → translated */
const memCache   = new Map<string, string>();

/** Queue for MutationObserver-detected new nodes */
const mutQueue: Text[] = [];

let activeLang: LangCode                       = 'en';
let observer:   MutationObserver | null        = null;
let debTimer:   ReturnType<typeof setTimeout> | null = null;
let _onDone:    (() => void) | null            = null;

// ─── localStorage cache ───────────────────────────────────────────────────────

function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function lsKey(lang: string, text: string): string {
  return `${LS_PREFIX}${lang}_${hashStr(text)}`;
}

function readLS(lang: string, text: string): string | null {
  try {
    const raw = localStorage.getItem(lsKey(lang, text));
    if (!raw) return null;
    const { t, ts } = JSON.parse(raw) as { t: string; ts: number };
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(lsKey(lang, text)); return null; }
    return t;
  } catch { return null; }
}

function writeLS(lang: string, text: string, tr: string) {
  const data = JSON.stringify({ t: tr, ts: Date.now() });
  try {
    localStorage.setItem(lsKey(lang, text), data);
  } catch {
    // Storage full — evict old entries then retry
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX)) toDelete.push(k);
    }
    toDelete.forEach(k => localStorage.removeItem(k));
    try { localStorage.setItem(lsKey(lang, text), data); } catch { /* give up */ }
  }
}

function getCached(lang: string, text: string): string | null {
  const mk = `${lang}:${text}`;
  const m = memCache.get(mk);
  if (m !== undefined) return m;
  const ls = readLS(lang, text);
  if (ls !== null) { memCache.set(mk, ls); return ls; }
  return null;
}

function setCached(lang: string, text: string, tr: string) {
  memCache.set(`${lang}:${text}`, tr);
  writeLS(lang, text, tr);
}

// ─── Network layer ────────────────────────────────────────────────────────────

const GL_MAP: Partial<Record<LangCode, string>> = { zh: 'zh-CN' };
const glCode = (lang: LangCode): string => GL_MAP[lang] ?? lang;

/**
 * Batch-translate using the free Google endpoint.
 * Texts are joined with a rare Unicode sentinel and split after translation.
 */
async function freeChunk(texts: string[], tl: string): Promise<string[] | null> {
  // Use a triple-pipe sentinel that Google reliably preserves
  const SEP = ' ||| ';
  const joined = texts.join(SEP);
  try {
    const params = new URLSearchParams({ client: 'gtx', sl: 'en', tl, dt: 't', q: joined });
    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?${params.toString()}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const full: string = (data[0] as [string][]).map(seg => seg[0]).join('');
    // Split by the sentinel (Google may add/remove spaces around it)
    const parts = full.split(/\s*\|\|\|\s*/);
    if (parts.length === texts.length) return parts.map(p => p.trim());
    // Count mismatch → fall back to per-item requests
    return Promise.all(texts.map(t => freeSingle(t, tl)));
  } catch { return null; }
}

async function freeSingle(text: string, tl: string): Promise<string> {
  try {
    const params = new URLSearchParams({ client: 'gtx', sl: 'en', tl, dt: 't', q: text });
    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?${params.toString()}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return text;
    const data = await res.json();
    return (data[0] as [string][]).map(seg => seg[0]).join('').trim() || text;
  } catch { return text; }
}

async function paidChunk(texts: string[], tl: string, apiKey: string): Promise<string[] | null> {
  try {
    const params = new URLSearchParams({ key: apiKey, source: 'en', target: tl, format: 'text' });
    texts.forEach(t => params.append('q', t));
    const res = await fetch(
      `https://translation.googleapis.com/language/translate/v2?${params.toString()}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const d = await res.json();
    return (d.data.translations as { translatedText: string }[]).map(t => t.translatedText);
  } catch { return null; }
}

function getPaidKey(): string | null {
  return (
    localStorage.getItem('cryptoverse_translate_api_key') ||
    localStorage.getItem('cryptoplay_translate_api_key') ||
    null
  );
}

/** Translate a list of unique English strings, returning one translation per input. */
async function translateTexts(texts: string[], lang: LangCode): Promise<string[]> {
  const tl = glCode(lang);
  const out: string[] = new Array(texts.length).fill('');
  const chunks: { i: number; texts: string[] }[] = [];
  for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
    chunks.push({ i, texts: texts.slice(i, i + CHUNK_SIZE) });
  }

  // Process chunks in parallel (max 4 concurrent)
  const CONCURRENCY = 4;
  for (let c = 0; c < chunks.length; c += CONCURRENCY) {
    if (activeLang !== lang) break;
    const batch = chunks.slice(c, c + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async ({ i, texts: chunk }) => {
        const free = await freeChunk(chunk, tl);
        if (free) { free.forEach((t, j) => { out[i + j] = t; }); return; }
        const key = getPaidKey();
        if (key) {
          const paid = await paidChunk(chunk, tl, key);
          if (paid) { paid.forEach((t: string, j: number) => { out[i + j] = t; }); return; }
        }
        // Both failed — keep originals
        chunk.forEach((t: string, j: number) => { out[i + j] = t; });
      })
    );
  }
  return out;
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

/** Returns true if the node (or any ancestor) should never be translated. */
function shouldSkip(node: Text): boolean {
  let el: Element | null = node.parentElement;
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.hasAttribute('data-notranslate')) return true;
    if ((el as HTMLElement).contentEditable === 'true') return true;
    // Skip hidden or off-screen elements
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
    el = el.parentElement;
  }
  return false;
}

/** Walk the subtree and return all translatable Text nodes. */
function collectNodes(root: Node = document.body): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const textNode = n as Text;
    const raw = textNode.textContent ?? '';
    if (raw.trim().length < MIN_LEN) continue;
    if (shouldSkip(textNode)) continue;
    // Capture original English text the very first time we see this node
    if (!originals.has(textNode)) originals.set(textNode, raw);
    out.push(textNode);
  }
  return out;
}

// ─── Core translation pass ────────────────────────────────────────────────────

async function translateNodes(nodes: Text[], lang: LangCode): Promise<void> {
  if (!nodes.length) return;

  if (lang === 'en') {
    // Restore every node to its original English text
    nodes.forEach(n => {
      const o = originals.get(n);
      if (o !== undefined && n.textContent !== o) n.textContent = o;
    });
    return;
  }

  // --- Step 1: Restore originals (handles lang-to-lang switching) ---
  nodes.forEach(n => {
    const o = originals.get(n);
    if (o !== undefined) n.textContent = o;
  });

  // --- Step 2: Apply cached translations SYNCHRONOUSLY, collect uncached ---
  const uniqueTexts = new Set<string>();
  nodes.forEach(n => {
    if (!originals.has(n)) originals.set(n, n.textContent ?? '');
    const orig = (originals.get(n) ?? '').trim();
    if (orig.length < MIN_LEN) return;
    uniqueTexts.add(orig);
    // Apply cached translation immediately
    const tr = getCached(lang, orig);
    if (tr && tr !== orig) { n.textContent = (originals.get(n) ?? '').replace(orig, tr); }
  });

  const uncached: string[] = [];
  for (const text of uniqueTexts) {
    if (getCached(lang, text) === null) uncached.push(text);
  }

  // --- Step 3: Fetch only uncached translations (API calls) ---
  if (uncached.length > 0) {
    try {
      const translations = await translateTexts(uncached, lang);
      uncached.forEach((text, i) => {
        const tr = translations[i];
        if (tr && tr !== text) setCached(lang, text, tr);
      });
    } catch { /* network failure — leave as English */ }
  }

  // --- Step 4: Apply translations to DOM (abort if lang switched) ---
  if (activeLang !== lang) return;

  nodes.forEach(node => {
    if (activeLang !== lang) return;
    const rawOriginal = originals.get(node) ?? node.textContent ?? '';
    const orig = rawOriginal.trim();
    if (orig.length < MIN_LEN) return;
    const tr = getCached(lang, orig);
    if (tr && tr !== orig) {
      // Replace the trimmed content while preserving surrounding whitespace
      node.textContent = rawOriginal.replace(orig, tr);
    }
  });
}

// ─── MutationObserver — handles new nodes added by React ─────────────────────

function handleMutations(mutations: MutationRecord[]) {
  if (activeLang === 'en') return;

  for (const m of mutations) {
    for (const added of m.addedNodes) {
      if (added.nodeType === Node.TEXT_NODE) {
        const t = added as Text;
        if (!originals.has(t)) originals.set(t, t.textContent ?? '');
        const orig = (originals.get(t) ?? '').trim();
        if (orig.length < MIN_LEN || shouldSkip(t)) continue;
        // Apply cached translation IMMEDIATELY if available
        const lang = activeLang;
        const tr = getCached(lang, orig);
        if (tr && tr !== orig) { t.textContent = t.textContent?.replace(orig, tr) ?? tr; }
        else { mutQueue.push(t); }
      } else if (added.nodeType === Node.ELEMENT_NODE) {
        collectNodes(added as Element).forEach(t => {
          if (!originals.has(t)) originals.set(t, t.textContent ?? '');
          const orig = (originals.get(t) ?? '').trim();
          if (orig.length < MIN_LEN || shouldSkip(t)) return;
          const lang = activeLang;
          const tr = getCached(lang, orig);
          if (tr && tr !== orig) { t.textContent = t.textContent?.replace(orig, tr) ?? tr; }
          else { mutQueue.push(t); }
        });
      }
    }
  }

  if (!mutQueue.length) return;

  if (debTimer) clearTimeout(debTimer);
  debTimer = setTimeout(() => {
    const batch = mutQueue.splice(0);
    const lang  = activeLang;
    if (lang !== 'en' && batch.length) translateNodes(batch, lang);
  }, DEBOUNCE);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface DomTranslatorOptions {
  onProgress?: (done: number, total: number) => void;
  onDone?: () => void;
}

/**
 * Call once on app mount.
 * Starts the MutationObserver so newly-rendered nodes are translated automatically.
 */
export function initDomTranslator(opts: DomTranslatorOptions = {}) {
  _onDone = opts.onDone ?? null;
  if (observer) observer.disconnect();
  observer = new MutationObserver(handleMutations);
  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Switch the active language and translate (or restore) the entire DOM.
 * Nodes whose translations are already cached are applied instantly without
 * any network request — making page revisits feel instant.
 */
export async function setDomLanguage(lang: LangCode): Promise<void> {
  activeLang = lang;
  // Pause observer to avoid feedback loops while we write to the DOM
  observer?.disconnect();
  try {
    const nodes = collectNodes(document.body);
    await translateNodes(nodes, lang);
    _onDone?.();
  } finally {
    // Always restart the observer
    if (observer) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }
}

/** Tear down — call on app unmount if needed. */
export function destroyDomTranslator() {
  observer?.disconnect();
  observer = null;
  if (debTimer) clearTimeout(debTimer);
}
