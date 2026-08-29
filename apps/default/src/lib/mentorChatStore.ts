/**
 * mentorChatStore.ts
 * 
 * Persists Lynx AI conversations to localStorage.
 * SUPER_ADMIN can view all logs in the admin panel.
 * Handles ticket escalation and admin-request evaluation.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MentorMessage {
  id:        string;
  role:      'user' | 'assistant';
  content:   string;
  timestamp: string;
}

export interface MentorConversation {
  id:        string;
  userId:    string;
  userEmail: string;
  userName:  string;
  messages:  MentorMessage[];
  startedAt: string;
  updatedAt: string;
  /** Set when the conversation led to a ticket escalation */
  escalatedTicketId?: string;
  escalatedSection?:  string;
  closed:    boolean;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

import { cloudRecordStore } from './cloudData';

const CONV_KEY = 'cryptoverse_mentor_conversations';
const MAX_CONV = 200;
// Reduced from 500: 500×10KB = 5MB → localStorage overflow risk. 200×3KB avg = 600KB.
const MAX_MESSAGES_PER_CONV = 100;

function loadConversations(): MentorConversation[] {
  return cloudRecordStore.get<MentorConversation[]>('mentor_chat', CONV_KEY, []);
}

function saveConversations(convs: MentorConversation[]): void {
  const trimmed = convs.slice(0, MAX_CONV).map(conv => {
    if (conv.messages.length <= MAX_MESSAGES_PER_CONV) return conv;
    return { ...conv, messages: conv.messages.slice(-MAX_MESSAGES_PER_CONV) };
  });
  cloudRecordStore.set('mentor_chat', CONV_KEY, trimmed);
}

function makeId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Conversation helpers ─────────────────────────────────────────────────────

export function createConversation(params: {
  userId:    string;
  userEmail: string;
  userName:  string;
}): MentorConversation {
  const conv: MentorConversation = {
    id:        makeId(),
    userId:    params.userId,
    userEmail: params.userEmail,
    userName:  params.userName,
    messages:  [],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    closed:    false,
  };
  const convs = [conv, ...loadConversations()];
  saveConversations(convs);
  return conv;
}

export function appendMessage(
  convId:  string,
  role:    'user' | 'assistant',
  content: string,
): MentorMessage {
  const msg: MentorMessage = {
    id:        makeId(),
    role,
    content,
    timestamp: new Date().toISOString(),
  };
  const convs = loadConversations().map(c => {
    if (c.id !== convId) return c;
    return {
      ...c,
      messages:  [...c.messages, msg],
      updatedAt: new Date().toISOString(),
    };
  });
  saveConversations(convs);
  return msg;
}

export function markEscalated(
  convId:   string,
  ticketId: string,
  section:  string,
): void {
  const convs = loadConversations().map(c =>
    c.id === convId
      ? { ...c, escalatedTicketId: ticketId, escalatedSection: section, closed: true, updatedAt: new Date().toISOString() }
      : c,
  );
  saveConversations(convs);
}

export function getConversation(convId: string): MentorConversation | null {
  return loadConversations().find(c => c.id === convId) ?? null;
}

export function getAllConversations(): MentorConversation[] {
  return loadConversations();
}

export function getUserConversations(userId: string): MentorConversation[] {
  return loadConversations().filter(c => c.userId === userId);
}

// ─── Escalation helper ────────────────────────────────────────────────────────

/**
 * Parse "ESCALATE_TO_ADMIN:[section]" directive from assistant response.
 * Returns section name if found, null otherwise.
 */
export function parseEscalation(content: string): string | null {
  const match = content.match(/ESCALATE_TO_ADMIN:([a-z\-]+)/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Summarise the last N messages into a ticket title (first 80 chars of user's last message).
 */
export function summariseForTicket(messages: MentorMessage[]): { title: string; description: string } {
  const userMessages = messages.filter(m => m.role === 'user');
  const lastUser     = userMessages[userMessages.length - 1]?.content ?? 'Support request';
  const title        = lastUser.slice(0, 80).trim();
  const description  = messages
    .map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
    .join('\n\n');
  return { title, description };
}

// ─── Admin request evaluator ──────────────────────────────────────────────────

/**
 * Generates an AI evaluation prompt for admin status request.
 * Returns a prompt string that deepSeekChat will use.
 */
export function buildAdminEvalPrompt(stats: {
  daysActive:   number;
  totalTrades:  number;
  winRate:      number;
  academyLevel: number;
  chatMessages?: number;
}): string {
  return `Please evaluate this user's eligibility for admin status on CryptoVerse HQ.

User Stats:
- Days Active: ${stats.daysActive}
- Total Trades: ${stats.totalTrades}
- Win Rate: ${stats.winRate.toFixed(1)}%
- Academy Level: ${stats.academyLevel}
- Chat Messages: ${stats.chatMessages ?? 0}

Minimum Requirements:
- At least 7 days of continuous activity ✓ threshold
- At least 30 useful interactions (trades + messages + academy completions) ✓ threshold

Provide a concise evaluation in 2-3 sentences: state whether they qualify (Yes/No/Borderline), list key strengths, and what they need to improve if not qualified. End with "VERDICT: [QUALIFIED|NOT_QUALIFIED|BORDERLINE]"`;
}
