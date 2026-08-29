import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, Key, Trash2, RefreshCw, CheckCircle, AlertCircle,
  Download, Upload, Edit3, Save, X, Eye, EyeOff,
  BarChart2, Zap, Clock, Shield, ChevronDown, ChevronUp, Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LANGUAGES, LangCode, TKey, EN_STRINGS } from '@/lib/i18n';
import {
  setApiKey,
  clearApiKey,
  isApiConfigured,
  getTranslationStats,
  clearCache,
  getCacheEntries,
  setManualTranslation,
  translateBatch,
  testApiKey,
  getLastError,
  TranslationCacheEntry,
} from '@/lib/translationService';
import { useI18nStore } from '@/lib/i18nStore';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CacheRow {
  key: string;
  entry: TranslationCacheEntry;
  editing: boolean;
  editValue: string;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color = 'text-primary' }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="bg-secondary/30 border border-white/5 rounded-xl p-4 flex items-center gap-3">
      <div className={cn('p-2 rounded-lg bg-secondary/50', color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: TranslationCacheEntry['source'] }) {
  const map = {
    static:  { label: 'Static',  cls: 'bg-blue-500/20 text-blue-400' },
    google:  { label: 'Google',  cls: 'bg-green-500/20 text-green-400' },
    manual:  { label: 'Manual',  cls: 'bg-amber-500/20 text-amber-400' },
  };
  const { label, cls } = map[source] ?? map.static;
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold', cls)}>
      {label}
    </span>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function TranslationAdmin() {
  const { lang, setLang, isTranslating, translationProgress } = useI18nStore();

  // API Key state
  const [apiKey, setApiKeyInput]     = useState('');
  const [showKey, setShowKey]        = useState(false);
  const [keySaved, setKeySaved]      = useState(isApiConfigured());
  const [keyError, setKeyError]      = useState('');
  const [keyTesting, setKeyTesting]  = useState(false);
  const [keyOk, setKeyOk]           = useState(false);
  const [fetchError, setFetchError]  = useState<string | null>(null);

  // Stats
  const [stats, setStats] = useState(getTranslationStats());

  // Batch translate
  const [batchLang, setBatchLang]     = useState<LangCode>('fa');
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchDone, setBatchDone]     = useState(false);

  // Cache browser
  const [viewLang, setViewLang]       = useState<LangCode>('fa');
  const [cacheRows, setCacheRows]     = useState<CacheRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSource, setFilterSource] = useState<'all' | 'static' | 'google' | 'manual'>('all');
  const [filterReview, setFilterReview] = useState(false);
  const [showCache, setShowCache]     = useState(false);

  // Export/Import
  const [importError, setImportError] = useState('');

  // ─── Effects ────────────────────────────────────────────────────────────────

  // Refresh stats every 3s
  useEffect(() => {
    const id = setInterval(() => setStats(getTranslationStats()), 3000);
    return () => clearInterval(id);
  }, []);

  // Load cache entries when viewLang changes
  const loadCacheEntries = useCallback(() => {
    const entries = getCacheEntries(viewLang);
    setCacheRows(entries.map(({ key, entry }) => ({
      key,
      entry,
      editing: false,
      editValue: entry.text,
    })));
  }, [viewLang]);

  useEffect(() => { loadCacheEntries(); }, [loadCacheEntries]);

  // ─── API Key ─────────────────────────────────────────────────────────────────

  async function handleSaveKey() {
    if (!apiKey.trim()) { setKeyError('API key cannot be empty'); return; }
    setKeyError('');
    setKeyOk(false);
    setKeyTesting(true);
    const result = await testApiKey(apiKey.trim());
    setKeyTesting(false);
    if (!result.ok) {
      setKeyError(result.error ?? 'API key test failed — check key and try again');
      return;
    }
    setApiKey(apiKey.trim());
    setKeySaved(true);
    setKeyOk(true);
    setApiKeyInput('');
    setStats(getTranslationStats());
    setTimeout(() => setKeyOk(false), 3000);
  }

  function handleClearKey() {
    clearApiKey();
    setKeySaved(false);
    setStats(getTranslationStats());
  }

  // ─── Batch Translate ──────────────────────────────────────────────────────────

  async function handleBatchTranslate() {
    if (!isApiConfigured()) return;
    setBatchRunning(true);
    setBatchProgress(0);
    setBatchDone(false);
    setFetchError(null);

    const entries = Object.entries(EN_STRINGS).map(([key, en]) => ({ key, en }));
    try {
      await translateBatch(entries, batchLang, (done, total) => {
        setBatchProgress(Math.round((done / total) * 100));
      });
      // Check if any fetch errors occurred during batch
      const err = getLastError();
      if (err) {
        setFetchError(err);
      } else {
        setBatchDone(true);
      }
      loadCacheEntries();
      setStats(getTranslationStats());
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBatchRunning(false);
    }
  }

  // ─── Cache Management ─────────────────────────────────────────────────────────

  function handleClearCache(langCode?: LangCode) {
    clearCache(langCode);
    loadCacheEntries();
    setStats(getTranslationStats());
  }

  function startEdit(key: string) {
    setCacheRows(rows => rows.map(r =>
      r.key === key ? { ...r, editing: true, editValue: r.entry.text } : r
    ));
  }

  function cancelEdit(key: string) {
    setCacheRows(rows => rows.map(r =>
      r.key === key ? { ...r, editing: false } : r
    ));
  }

  function saveEdit(key: string, value: string) {
    setManualTranslation(viewLang, key as TKey, value);
    setCacheRows(rows => rows.map(r =>
      r.key === key
        ? { ...r, editing: false, entry: { ...r.entry, text: value, source: 'manual', needsReview: false } }
        : r
    ));
  }

  // ─── Export / Import ──────────────────────────────────────────────────────────

  function handleExport() {
    const data: Record<string, Record<string, string>> = {};
    for (const l of LANGUAGES) {
      const entries = getCacheEntries(l.code);
      if (entries.length > 0) {
        data[l.code] = {};
        entries.forEach(({ key, entry }) => { data[l.code][key] = entry.text; });
      }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cryptoverse-translations-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as Record<string, Record<string, string>>;
        let count = 0;
        for (const [langCode, translations] of Object.entries(data)) {
          for (const [key, text] of Object.entries(translations)) {
            setManualTranslation(langCode as LangCode, key, text);
            count++;
          }
        }
        loadCacheEntries();
        setStats(getTranslationStats());
        alert(`✅ Imported ${count} translations successfully!`);
      } catch {
        setImportError('Invalid JSON file. Please export a valid translation file first.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // ─── Filtered rows ────────────────────────────────────────────────────────────

  const filteredRows = cacheRows.filter(r => {
    const matchSearch =
      r.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.entry.text.toLowerCase().includes(searchQuery.toLowerCase());
    const matchSource = filterSource === 'all' || r.entry.source === filterSource;
    const matchReview = !filterReview || r.entry.needsReview;
    return matchSearch && matchSource && matchReview;
  });

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/20 text-primary">
          <Globe className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Translation System</h2>
          <p className="text-sm text-muted-foreground">
            Google Cloud Translation API · {Object.keys(EN_STRINGS).length} keys · {LANGUAGES.length} languages
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={BarChart2} label="Cached Strings" value={stats.totalCached} />
        <StatCard icon={Zap}      label="API Calls"      value={stats.googleApiCalls} color="text-green-400" />
        <StatCard icon={Shield}   label="Cache Hit Rate" value={`${stats.cacheHitRate}%`} color="text-blue-400" />
        <StatCard icon={Clock}    label="Fallbacks"      value={stats.fallbacks}   color="text-amber-400" />
      </div>

      {/* API Key Setup */}
      <div className="bg-card border border-white/5 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Google Translate API Key</h3>
          </div>
          {keySaved && (
            <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 px-2.5 py-1 rounded-full">
              <CheckCircle className="h-3.5 w-3.5" /> Configured
            </span>
          )}
        </div>

        <div className="bg-secondary/20 border border-white/5 rounded-xl p-4 text-xs text-muted-foreground space-y-1.5">
          <p className="font-medium text-foreground">Setup Instructions:</p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li>Go to <span className="font-mono text-primary">console.cloud.google.com</span></li>
            <li>Create or select a project → go to <strong>APIs &amp; Services → Library</strong></li>
            <li>Search for and enable <span className="font-mono font-semibold">Cloud Translation API</span></li>
            <li>Go to <strong>APIs &amp; Services → Credentials → Create API Key</strong></li>
            <li>Restrict the key to <span className="font-mono">Cloud Translation API</span> only (recommended)</li>
            <li>Paste the key below — it's tested live and saved in your browser</li>
          </ol>
          <p className="mt-2 text-muted-foreground/60">
            ℹ️ The key is stored in <span className="font-mono">localStorage</span> and persists across sessions. It is never sent anywhere except Google's Translation API.
          </p>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => { setApiKeyInput(e.target.value); setKeyError(''); setKeyOk(false); }}
              onKeyDown={e => { if (e.key === 'Enter' && apiKey.trim()) handleSaveKey(); }}
              placeholder={keySaved ? '••••••••••••••••• (key saved — paste new to replace)' : 'Paste your Google Cloud API key…'}
              className={cn(
                'w-full bg-secondary/40 border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 font-mono pr-10 transition-colors',
                keyError  ? 'border-red-500/50 focus:ring-red-500/30'   :
                keyOk     ? 'border-green-500/50 focus:ring-green-500/30' :
                            'border-white/10 focus:ring-primary',
              )}
              disabled={keyTesting}
            />
            <button
              onClick={() => setShowKey(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <button
            onClick={handleSaveKey}
            disabled={!apiKey.trim() || keyTesting}
            className={cn(
              'px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 min-w-[100px] justify-center',
              keyOk
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40',
            )}
          >
            {keyTesting ? (
              <><RefreshCw className="h-4 w-4 animate-spin" /> Testing…</>
            ) : keyOk ? (
              <><CheckCircle className="h-4 w-4" /> Verified!</>
            ) : (
              'Test & Save'
            )}
          </button>
          {keySaved && (
            <button
              onClick={handleClearKey}
              className="px-4 py-2.5 bg-red-500/20 text-red-400 rounded-xl text-sm font-medium hover:bg-red-500/30 transition-colors"
            >
              Remove
            </button>
          )}
        </div>
        {keyError && (
          <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/8 border border-red-500/15 rounded-xl px-3 py-2.5">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>{keyError}</span>
          </div>
        )}
        {keyOk && (
          <p className="flex items-center gap-1.5 text-xs text-green-400">
            <CheckCircle className="h-3.5 w-3.5" /> API key verified and saved — translation is ready!
          </p>
        )}
      </div>

      {/* Batch Translation */}
      <div className="bg-card border border-white/5 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Batch Translate All Keys</h3>
        </div>

        {!isApiConfigured() && (
          <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 rounded-xl px-4 py-3">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            Configure your API key above to enable batch translation.
          </div>
        )}

        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1.5 block">Target Language</label>
            <select
              value={batchLang}
              onChange={e => setBatchLang(e.target.value as LangCode)}
              className="w-full bg-secondary/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {LANGUAGES.filter(l => l.code !== 'en').map(l => (
                <option key={l.code} value={l.code}>
                  {l.flag} {l.name} ({l.english})
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleBatchTranslate}
            disabled={batchRunning || !isApiConfigured()}
            className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-all flex items-center gap-2"
          >
            {batchRunning
              ? <><RefreshCw className="h-4 w-4 animate-spin" /> Translating…</>
              : <><Zap className="h-4 w-4" /> Translate All</>}
          </button>
        </div>

        {/* Progress Bar */}
        <AnimatePresence>
          {(batchRunning || isTranslating) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2"
            >
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Translating {Object.keys(EN_STRINGS).length} strings via Google Cloud…</span>
                <span>{batchRunning ? batchProgress : translationProgress}%</span>
              </div>
              <div className="h-1.5 bg-secondary/50 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  animate={{ width: `${batchRunning ? batchProgress : translationProgress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {batchDone && !batchRunning && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 text-sm text-green-400 bg-green-500/10 rounded-xl px-4 py-3"
          >
            <CheckCircle className="h-4 w-4" />
            All strings translated and cached successfully!
          </motion.div>
        )}
        {fetchError && !batchRunning && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2.5 text-sm text-red-400 bg-red-500/8 border border-red-500/15 rounded-xl px-4 py-3"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Translation failed</p>
              <p className="text-xs text-red-400/70 mt-0.5">{fetchError}</p>
              <p className="text-xs text-muted-foreground mt-1.5">
                Make sure your API key is valid, the <strong>Cloud Translation API</strong> is enabled in Google Cloud Console, and billing is active on your project.
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Export / Import */}
      <div className="bg-card border border-white/5 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Export / Import Translations</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Export all cached translations as JSON. Import to populate cache from a previously exported file or manual translation work.
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2.5 bg-secondary/50 border border-white/10 rounded-xl text-sm font-medium hover:bg-secondary/70 transition-colors"
          >
            <Download className="h-4 w-4" /> Export JSON
          </button>
          <label className="flex items-center gap-2 px-4 py-2.5 bg-secondary/50 border border-white/10 rounded-xl text-sm font-medium hover:bg-secondary/70 transition-colors cursor-pointer">
            <Upload className="h-4 w-4" /> Import JSON
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
        </div>
        {importError && (
          <p className="flex items-center gap-1.5 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5" /> {importError}
          </p>
        )}
      </div>

      {/* Cache Browser */}
      <div className="bg-card border border-white/5 rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowCache(s => !s)}
          className="w-full flex items-center justify-between p-5 hover:bg-secondary/20 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Translation Cache Browser</h3>
            <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">
              {cacheRows.length} entries
            </span>
          </div>
          {showCache ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        <AnimatePresence>
          {showCache && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-5 space-y-4 border-t border-white/5 pt-4">
                {/* Controls */}
                <div className="flex flex-wrap gap-3">
                  <select
                    value={viewLang}
                    onChange={e => setViewLang(e.target.value as LangCode)}
                    className="bg-secondary/40 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {LANGUAGES.filter(l => l.code !== 'en').map(l => (
                      <option key={l.code} value={l.code}>
                        {l.flag} {l.name}
                      </option>
                    ))}
                  </select>

                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search key or translation…"
                    className="flex-1 bg-secondary/40 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />

                  <select
                    value={filterSource}
                    onChange={e => setFilterSource(e.target.value as typeof filterSource)}
                    className="bg-secondary/40 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="all">All Sources</option>
                    <option value="static">Static</option>
                    <option value="google">Google</option>
                    <option value="manual">Manual</option>
                  </select>

                  <button
                    onClick={() => setFilterReview(s => !s)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition-colors',
                      filterReview
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                        : 'bg-secondary/40 border-white/10 text-muted-foreground',
                    )}
                  >
                    <AlertCircle className="h-3.5 w-3.5" />
                    Needs Review
                  </button>

                  <button
                    onClick={() => handleClearCache(viewLang)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear {LANGUAGES.find(l => l.code === viewLang)?.name}
                  </button>
                </div>

                {/* Table */}
                {filteredRows.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Globe className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No cached translations found.</p>
                    <p className="text-xs mt-1">Run batch translation or switch languages.</p>
                  </div>
                ) : (
                  <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
                    {filteredRows.map(row => (
                      <div
                        key={row.key}
                        className={cn(
                          'flex items-start gap-3 p-3 rounded-xl text-sm transition-colors',
                          row.entry.needsReview
                            ? 'bg-amber-500/5 border border-amber-500/10'
                            : 'hover:bg-secondary/30',
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <code className="text-xs text-primary/80 font-mono">{row.key}</code>
                            <SourceBadge source={row.entry.source} />
                            {row.entry.needsReview && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-semibold">
                                REVIEW
                              </span>
                            )}
                          </div>
                          {row.editing ? (
                            <div className="flex gap-2 mt-1.5">
                              <input
                                autoFocus
                                value={row.editValue}
                                onChange={e => setCacheRows(rows => rows.map(r =>
                                  r.key === row.key ? { ...r, editValue: e.target.value } : r
                                ))}
                                className="flex-1 bg-secondary/50 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                dir={LANGUAGES.find(l => l.code === viewLang)?.rtl ? 'rtl' : 'ltr'}
                              />
                              <button
                                onClick={() => saveEdit(row.key, row.editValue)}
                                className="p-1.5 text-green-400 hover:bg-green-500/10 rounded-lg transition-colors"
                              >
                                <Save className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => cancelEdit(row.key)}
                                className="p-1.5 text-muted-foreground hover:bg-secondary/50 rounded-lg transition-colors"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <p
                              className="text-foreground/80 truncate"
                              dir={LANGUAGES.find(l => l.code === viewLang)?.rtl ? 'rtl' : 'ltr'}
                            >
                              {row.entry.text}
                            </p>
                          )}
                        </div>
                        {!row.editing && (
                          <button
                            onClick={() => startEdit(row.key)}
                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-lg transition-colors flex-shrink-0"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Danger Zone */}
      <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-5 space-y-3">
        <h3 className="font-semibold text-red-400 text-sm flex items-center gap-2">
          <Trash2 className="h-4 w-4" /> Danger Zone
        </h3>
        <p className="text-xs text-muted-foreground">
          Clear all cached translations across all languages. The app will fall back to static translations until the cache is rebuilt.
        </p>
        <button
          onClick={() => {
            if (confirm('Clear ALL cached translations? This cannot be undone.')) {
              handleClearCache();
            }
          }}
          className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-xl text-sm font-medium hover:bg-red-500/30 transition-colors"
        >
          <Trash2 className="h-4 w-4" /> Clear All Translation Cache
        </button>
      </div>
    </div>
  );
}
