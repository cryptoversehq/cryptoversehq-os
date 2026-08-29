import { createConversation, sendMessage, AgentChatStream } from '@/lib/agent-chat';

const AGENT_ID = '01KW2BMZWB2VD152NK1ZEB4VPW'; // Lynx AI

export interface MatchOpponent {
  opponent: string;
  rank: number;
  stake: number;
  time: string;
}

export type MatchOutcome = 'win' | 'loss' | 'draw';

export interface SimulatedMatchResult {
  opponent: string;
  rank: number;
  stake: number;
  time: string;
  outcome: MatchOutcome;
  pnl: number;
  prizeEarned: number;
  yourScore: number;
  opponentScore: number;
  narrative: string;
  keyFactor: string;
}

/**
 * Calls the CryptoVerse Mentor agent to simulate a match result.
 * Opens a fresh one-shot conversation, sends a structured prompt,
 * accumulates all text-delta events, and parses the JSON response.
 */
export async function simulateMatch(
  twinName: string,
  riskTolerance: number,
  opponent: MatchOpponent,
  onProgress?: (delta: string) => void,
): Promise<SimulatedMatchResult> {
  // 1. Open a fresh conversation for this simulation
  const { conversationId } = await createConversation(AGENT_ID);

  // 2. Build the simulation prompt — precise so the agent returns valid JSON
  const prompt = `You are the CryptoVerse HQ simulation engine. Simulate a Twin League crypto trading match.

CONTEXT:
- My Twin: "${twinName}" | Risk Tolerance: ${riskTolerance}% (${riskTolerance < 30 ? 'Conservative' : riskTolerance < 70 ? 'Balanced' : 'Aggressive / Degen'})
- Opponent: "${opponent.opponent}" | Global Rank: #${opponent.rank}
- Stake: ${opponent.stake} CP each | Prize Pool: ${opponent.stake * 2} CP
- Scheduled: ${opponent.time}

SIMULATION RULES:
- Higher risk tolerance = higher potential gains but also higher drawdown risk
- If opponent rank is below 200 they are weaker, above 100 they are stronger
- Introduce realistic market volatility, news events, and strategy clashes
- Result must feel authentic and data-driven

Respond ONLY with a single JSON object (no markdown fences, no explanation) with this exact shape:
{
  "outcome": "win" | "loss" | "draw",
  "pnl": <number, positive if win, negative if loss, dollars>,
  "prizeEarned": <number, CP earned — full prize if win, 0 if loss, half if draw>,
  "yourScore": <number 0-100, trading performance score>,
  "opponentScore": <number 0-100, opponent performance score>,
  "narrative": "<2-3 sentence vivid story of how the match unfolded — include a market event>",
  "keyFactor": "<single decisive factor that determined the outcome, max 8 words>"
}`;

  // 3. Collect streaming response
  let fullText = '';

  await new Promise<void>((resolve, reject) => {
    const stream = new AgentChatStream(AGENT_ID, conversationId, {
      autoReconnect: false,
      onError: (err) => reject(err),
    });

    stream.on('text-delta', ({ delta }) => {
      fullText += delta;
      onProgress?.(delta);
    });

    stream.on('finish', () => {
      stream.disconnect();
      resolve();
    });

    stream.on('error', ({ errorText }) => {
      stream.disconnect();
      reject(new Error(errorText));
    });

    stream.connect();

    // Send message after stream is wired up
    sendMessage(AGENT_ID, conversationId, prompt).catch(reject);
  });

  // 4. Parse JSON — strip any accidental markdown fences the model may add
  const cleaned = fullText
    .trim()
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

  let parsed: Omit<SimulatedMatchResult, 'opponent' | 'rank' | 'stake' | 'time'>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse simulation result: ${cleaned.slice(0, 200)}`);
  }

  return {
    ...parsed,
    opponent: opponent.opponent,
    rank: opponent.rank,
    stake: opponent.stake,
    time: opponent.time,
  };
}
