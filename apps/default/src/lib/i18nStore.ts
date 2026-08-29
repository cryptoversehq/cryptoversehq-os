import { create } from 'zustand';
import { LangCode, detectLang, isRTL, t as translate, TKey, EN_STRINGS } from './i18n';
import { getFromCache, translateBatch, isApiConfigured } from './translationService';
import { setDomLanguage } from './domTranslator';
import { cloudRecordStore } from './cloudData';

const LANG_SYNC_KEY = 'lang';

interface I18nState {
  lang: LangCode;
  isTranslating: boolean;
  translationProgress: number;
  setLang: (lang: LangCode) => void;
  t: (key: TKey) => string;
  preloadTranslations: (lang: LangCode) => Promise<void>;
}

function applyLang(lang: LangCode) {
  cloudRecordStore.set('localization', LANG_SYNC_KEY, { lang, updatedAt: new Date().toISOString() });
  const rtl = isRTL(lang);
  document.documentElement.setAttribute('dir', rtl ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', lang);
}

const initialLang = detectLang();
applyLang(initialLang);

export const useI18nStore = create<I18nState>((set, get) => ({
  lang: initialLang,
  isTranslating: false,
  translationProgress: 0,

  setLang: (lang) => {
    applyLang(lang);
    set({ lang, isTranslating: true, translationProgress: 0 });

    // Push the choice to the cross-device DB (same syncStorage layer used by
    // trading/bots/academy) so the language follows the user to their next
    // device instead of staying stuck in this browser's localStorage.
    // Dynamic import avoids a static circular dependency with authStore.ts,
    // which itself calls back into this module to hydrate the language on login.
    import('./authStore').then(({ useAuthStore }) => {
      const email = useAuthStore.getState().user?.email;
      if (email) cloudRecordStore.set('localization', LANG_SYNC_KEY, { lang, updatedAt: new Date().toISOString() });
    }).catch(() => {/* not logged in / module not ready — local change still applies */});

    // Run the DOM translator immediately — it handles all text nodes on the page
    setDomLanguage(lang).then(() => {
      set({ isTranslating: false, translationProgress: 100 });
    }).catch(() => {
      set({ isTranslating: false, translationProgress: 100 });
    });
  },

  t: (key: TKey): string => {
    const { lang } = get();
    if (lang === 'en') return translate(key, 'en');
    const cached = getFromCache(lang, key);
    if (cached) return cached.text;
    return translate(key, lang);
  },

  preloadTranslations: async (lang: LangCode) => {
    if (lang === 'en') return;
    if (!isApiConfigured()) return;
    const { isTranslating } = get();
    if (isTranslating) return;
    set({ isTranslating: true, translationProgress: 0 });
    const entries = Object.entries(EN_STRINGS).map(([key, en]) => ({ key, en }));
    const uncached = entries.filter((e) => !getFromCache(lang, e.key));
    if (uncached.length === 0) { set({ isTranslating: false, translationProgress: 100 }); return; }
    try {
      await translateBatch(uncached, lang, (done, total) => {
        set({ translationProgress: Math.round((done / total) * 100) });
      });
    } catch (err) {
      console.warn('[i18nStore] Preload failed:', err);
    } finally {
      set({ isTranslating: false, translationProgress: 100 });
    }
  },
}));

/**
 * Pull this user's saved language preference from the cross-device DB
 * (synced via syncStorage.ts's syncKey/localCache — the same mechanism
 * academyStore and tradingMigrationService use) and apply it locally.
 *
 * Call once right after login/on session restore — mirrors
 * `tradingMigrationService.hydrateTradingData` and `academyStore.hydrate`,
 * which are already wired into authStore.ts's login/loginFromSession/initial
 * -load paths. This is what lets a language chosen on one device (e.g.
 * Persian on a phone) show up automatically the next time the same account
 * logs in on another device (e.g. a desktop that still had English).
 *
 * Only overrides the local language if the remote value differs, so it
 * never fights a change the user is actively making in this same tab.
 */
export async function hydrateLang(email: string): Promise<void> {
  if (!email) return;
  try {
    const remote = cloudRecordStore.get<{ lang: LangCode; updatedAt: string }>('localization', LANG_SYNC_KEY, { lang: useI18nStore.getState().lang, updatedAt: '' });
    if (remote?.lang && remote.lang !== useI18nStore.getState().lang) {
      useI18nStore.getState().setLang(remote.lang);
    }
  } catch {
    // DB unreachable — keep whatever language is already active locally
  }
}
