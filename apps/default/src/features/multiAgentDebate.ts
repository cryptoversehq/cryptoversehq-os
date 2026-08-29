/**
 * multiAgentDebate.ts — CryptoVerse HQ Feature #10
 * Simulates a debate between multiple AI agents on a trading/crypto topic.
 * Each agent argues from their domain perspective. Pro+ only.
 * Integrates with all Taskade Agents via DeepSeek.
 */
import { deepSeekChat, DSMessage } from '@/lib/deepSeekClient';

// ─── Agent Personas ────────────────────────────────────────────────────────

const PERSONAS = {
  trader:   { name: 'Lynx AI', emoji: '📈', prompt: 'You are a professional crypto trader focused on technical analysis.' },
  analyst:  { name: 'On-Chain Analyst', emoji: '⛓', prompt: 'You are an on-chain data expert focused on blockchain metrics.' },
  risk:     { name: 'Risk Manager', emoji: '🛡', prompt: 'You are a conservative risk manager focused on capital preservation.' },
  optimist: { name: 'Bullish Advocate', emoji: '🐂', prompt: 'You see upside potential and growth opportunities in every scenario.' },
  pessimist:{ name: 'Bearish Skeptic', emoji: '🐻', prompt: 'You identify risks, downsides, and reasons for caution in every scenario.' },
  educator: { name: 'Lynx AI', emoji: '🎓', prompt: 'You explain concepts clearly for learners of all levels.' },
} as const;

type PersonaKey = keyof typeof PERSONAS;

export interface DebateTurn {
  persona: PersonaKey; name: string; emoji: string; argument: string;
}

export interface DebateResult {
  topic: string; turns: DebateTurn[]; consensus: string; summary: string;
}

// ─── Run a debate ──────────────────────────────────────────────────────────

export async function runDebate(
  topic: string,
  participants: PersonaKey[] = ['trader', 'analyst', 'risk', 'optimist'],
): Promise<DebateResult> {
  const turns: DebateTurn[] = [];
  let context = `TOPIC: ${topic}\n\n`;

  // Each participant speaks
  for (const key of participants) {
    const persona = PERSONAS[key];
    const prompt = `${persona.prompt}\n\n${context}Now give your perspective on this topic as ${persona.name}. 2-3 sentences. Be concise.`;
    const res = await deepSeekChat([{ role:'system', content:persona.prompt }, { role:'user', content:prompt }]);
    const arg = res.content || `${persona.name} has no response.`;
    turns.push({ persona: key, name: persona.name, emoji: persona.emoji, argument: arg });
    context += `\n${persona.emoji} ${persona.name}: ${arg}`;
  }

  // Consensus
  const consensus = await deepSeekChat([{ role:'user', content:`${context}\n\nBased on the above debate, give a 1-sentence consensus. Be concise.` }]);

  // Summary
  const summary = await deepSeekChat([{ role:'user', content:`${context}\n\nSummarize this debate in 2 sentences for a trader. Be concise.` }]);

  return {
    topic,
    turns,
    consensus: consensus.content || 'No consensus reached.',
    summary: summary.content || 'Debate completed.',
  };
}

export async function quickDebate(topic: string): Promise<string> {
  const res = await runDebate(topic, ['trader', 'risk']);
  return `${res.turns.map(t => `${t.emoji} **${t.name}**: ${t.argument}`).join('\n\n')}\n\n---\n${res.summary}`;
}

export function getPersonaKeys(): PersonaKey[] {
  return Object.keys(PERSONAS) as PersonaKey[];
}

export { PERSONAS };
