/**
 * contextAwareGuidanceEnhanced.ts — CryptoVerse HQ Enhanced Guidance System
 * Detects page, time-on-page, user behavior, level. Personalized tips with DeepSeek.
 * Falls back to pre-written tips per page. "Don't show again" support.
 */
import { deepSeekAsk } from '@/lib/deepSeekClient';
import { useAcademyStore } from '@/lib/academyStore';
import { useTradingStore } from '@/lib/tradingStore';

const PAGE_FALLBACKS: Record<string,string[]> = {
  '/': ['Welcome to CryptoVerse! Start exploring the dashboard.','Check out the Market Sentiment widget below.'],
  '/trading': ['Welcome to Trading! Start with a small trade to learn the platform.','Always set a stop-loss to protect your capital.'],
  '/academy': ['Ready for the quiz? You need 80% to pass.','Complete lessons to earn XP and unlock new features.'],
  '/portfolio': ['Your portfolio hasn\'t changed in 2 days. Check the market.','Diversification reduces risk — consider adding more coins.'],
  '/profile': ['Update your profile to get a personalized experience.','Check your subscription status in the profile.'],
  '/bots': ['Bots can automate your strategies 24/7.','Start with a conservative bot configuration.'],
  '/events': ['The Weekend Warrior competition is active! Join now.','Check the leaderboard to see how you rank.'],
  '/onchain': ['Whale alerts can help you spot big market moves.','Set up alerts for the chains you trade most.'],
  '/nft': ['Remember: NFTs are speculative. This is a simulation.','Track collections on your watchlist.'],
};

const DISMISS_KEY = 'cv_guide_dismissed';

function getPageKey(path: string): string {
  if (path==='/'||path==='/dashboard') return '/';
  for (const key of Object.keys(PAGE_FALLBACKS)) { if (path.includes(key.replace('/',''))) return key; }
  return '/';
}

export function isTipDismissed(tip: string): boolean {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY)||'[]').includes(tip.slice(0,30)); } catch { return false; }
}

export function dismissTip(tip: string): void {
  try {
    const d = JSON.parse(localStorage.getItem(DISMISS_KEY)||'[]') as string[];
    d.push(tip.slice(0,30));
    localStorage.setItem(DISMISS_KEY,JSON.stringify(d.slice(-50)));
  } catch {}
}

export function getBehaviorContext(): { minutesOnPage:number; recentTrade:boolean; level:string; levelNum:number } {
  const xp = useAcademyStore.getState().totalXP;
  const levelNum = xp<500?1:xp<1250?2:xp<2250?3:4;
  const level = ['Novice','Apprentice','Analyst','Pro'][levelNum-1];
  try {
    const t = useTradingStore.getState();
    const lastTrade = (t.history||[]).sort((a,b)=>new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime())[0];
    const recentTrade = lastTrade ? (Date.now()-new Date(lastTrade.timestamp).getTime())<2*60*60_000 : false;
    const entry = JSON.parse(sessionStorage.getItem('cv_page_entry')||'0');
    const minutesOnPage = entry ? Math.floor((Date.now()-entry)/60000) : 0;
    return { minutesOnPage, recentTrade, level, levelNum };
  } catch { return { minutesOnPage:0, recentTrade:false, level:'Novice', levelNum:1 }; }
}

export function recordPageEntry(): void {
  try { sessionStorage.setItem('cv_page_entry',String(Date.now())); } catch {}
}

export async function generateTip(pagePath: string): Promise<string> {
  const ctx = getBehaviorContext();
  const fallbacks = PAGE_FALLBACKS[getPageKey(pagePath)]||PAGE_FALLBACKS['/'];

  try {
    const prompt = `User on ${pagePath} page, level: ${ctx.level}, ${ctx.minutesOnPage}min on page, recent trade: ${ctx.recentTrade}. Give ONE personalized 1-sentence tip for CryptoVerse HQ platform. Be concise.`;
    const tip = await deepSeekAsk(prompt);
    if (tip && !isTipDismissed(tip)) return tip;
  } catch {}

  for (const f of fallbacks) { if (!isTipDismissed(f)) return f; }
  return fallbacks[0];
}
