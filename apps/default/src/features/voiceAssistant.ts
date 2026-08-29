/**
 * voiceAssistant.ts — CryptoVerse HQ Feature #4
 * Web Speech API based voice assistant. Speech→text→DeepSeek→text→speech.
 * Free browser API — no external key needed. Pro+ only.
 */
import { deepSeekAsk } from '@/lib/deepSeekClient';

const LANG = 'en-US';

export function isVoiceSupported(): boolean {
  return typeof window !== 'undefined' && !!window.SpeechRecognition ||
    !!(window as unknown as Record<string,unknown>)['webkitSpeechRecognition'];
}

export function startListening(onResult: (text: string) => void, onError?: (e: string) => void): () => void {
  const Ctor = (window as unknown as Record<string,{new():SpeechRecognition}>).SpeechRecognition
    || (window as unknown as Record<string,{new():SpeechRecognition}>).webkitSpeechRecognition;
  if (!Ctor) { onError?.('Speech recognition not supported'); return () => {}; }
  const rec = new Ctor();
  rec.lang = LANG; rec.interimResults = false; rec.maxAlternatives = 1;
  rec.onresult = (e: SpeechRecognitionEvent) => { const t = e.results[0]?.[0]?.transcript; if (t) onResult(t); };
  rec.onerror = () => onError?.('Speech recognition error');
  rec.start();
  return () => rec.stop();
}

export function speak(text: string): void {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = LANG; u.rate = 1.0; u.pitch = 1.0;
  window.speechSynthesis.speak(u);
}

const TRADE_CMD = /(?:buy|sell)\s+(\w+)\s+(?:with|for)?\s*\$?(\d+)/i;
const PORTFOLIO_CMD = /portfolio\s*(value|worth|balance)?/i;
const ACADEMY_CMD = /(?:show|open)\s+academy\s+(?:lesson|module)?\s*(\d+)/i;
const SENTIMENT_CMD = /market\s+sentiment/i;

export function parseVoiceCommand(text: string): { action: string; params?: Record<string,unknown> } | null {
  if (TRADE_CMD.test(text)) {
    const m = text.match(TRADE_CMD)!;
    return { action: 'trade', params: { side: m[1].toLowerCase()==='buy'?'buy':'sell', coin: m[2].toUpperCase(), amount: parseInt(m[3]) } };
  }
  if (PORTFOLIO_CMD.test(text)) return { action: 'portfolio' };
  if (ACADEMY_CMD.test(text)) { const m = text.match(ACADEMY_CMD)!; return { action: 'academy', params: { lesson: parseInt(m[1]) } }; }
  if (SENTIMENT_CMD.test(text)) return { action: 'sentiment' };
  return null;
}

export async function voiceChat(transcript: string): Promise<string> {
  const cmd = parseVoiceCommand(transcript);
  if (cmd) return `Voice command recognized: ${cmd.action} ${JSON.stringify(cmd.params||{})}. Processing...`;
  return deepSeekAsk(transcript);
}
