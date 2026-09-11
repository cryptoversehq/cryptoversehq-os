import { runFlow } from '@/lib/genesis-flows';
import { useAuthStore, type UserProfile, type UserRole } from '@/lib/authStore';
import { createTicket, type TicketPriority, type TicketSection } from '@/lib/ticketStore';

export const APPROVED_AUTOMATIONS = {
  weeklySummary: {
    flowId: '01M1W62CR6SFQG59RFBQ23J4DK',
    label: 'CryptoVerse weekly summary',
  },
} as const;

export type AssistantActionKey = 'create_ticket' | 'update_preferences' | 'run_approved_automation';

export interface ActionProposal {
  action: AssistantActionKey;
  title: string;
  description: string;
  payload: Record<string, string>;
}

const APP_TOPIC_TERMS = [
  'crypto', 'bitcoin', 'btc', 'ethereum', 'eth', 'token', 'nft', 'trade', 'trading',
  'market', 'portfolio', 'academy', 'course', 'xp', 'bot', 'copy trading', 'sentiment',
  'onchain', 'payment', 'ticket', 'support', 'settings', 'preference', 'language',
  'account', 'admin', 'developer', 'report', 'cryptoverse', 'lynx', 'summary', 'dashboard',
];
const GREETING_TERMS = ['hello', 'hi', 'hey', 'thanks', 'thank you', 'help'];
const BLOCKED_ACTION_TERMS = ['send money', 'withdraw', 'deposit', 'buy crypto', 'sell crypto', 'change password', 'delete account', 'change email'];
const ADMIN_ROLES: UserRole[] = ['admin', 'senior_admin', 'super_admin', 'founder', 'developer'];

function normalized(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function isAppTopic(text: string): boolean {
  const value = normalized(text);
  return GREETING_TERMS.some((term) => value.includes(term))
    || APP_TOPIC_TERMS.some((term) => value.includes(term));
}

export function isBlockedAction(text: string): boolean {
  const value = normalized(text);
  return BLOCKED_ACTION_TERMS.some((term) => value.includes(term));
}

export function topicBoundaryReply(text: string): string | null {
  if (isBlockedAction(text)) {
    return 'I can help with CryptoVerse learning, markets, portfolios, support, settings, reports, and approved app actions. I cannot move funds, trade on your behalf, change passwords, or change account access.';
  }
  if (!isAppTopic(text)) {
    return 'I’m focused on CryptoVerse HQ and crypto topics. I can help with the app, trading education, portfolios, bots, support, settings, and reports, but not unrelated topics.';
  }
  return null;
}

function canAct(user: UserProfile | null): boolean {
  const viewState = useAuthStore.getState().viewState;
  return Boolean(user && user.email && !viewState.isViewing);
}

export function canAccessAdminInformation(user: UserProfile | null): boolean {
  return Boolean(user && ADMIN_ROLES.includes(user.role));
}

export function detectActionProposal(text: string, user: UserProfile | null): ActionProposal | null {
  if (!canAct(user)) return null;
  const value = normalized(text);

  if (value.includes('ticket') && (value.includes('create') || value.includes('open') || value.includes('support'))) {
    return {
      action: 'create_ticket',
      title: 'Create a support ticket',
      description: 'This will send the request to CryptoVerse support for follow-up.',
      payload: {
        section: inferSection(value),
        title: 'Support request from the assistant',
        description: text.trim(),
        priority: value.includes('urgent') || value.includes('critical') ? 'high' : 'medium',
      },
    };
  }

  if (value.includes('weekly summary') || value.includes('weekly report') || value.includes('run the summary')) {
    return {
      action: 'run_approved_automation',
      title: 'Run the weekly summary',
      description: 'This will summarize the latest CryptoVerse report and file a new summary in the reports project.',
      payload: { automation: 'weeklySummary' },
    };
  }

  const language = value.match(/(?:language|in)\s+(english|persian|farsi)/)?.[1];
  if (language && (value.includes('set') || value.includes('change') || value.includes('switch'))) {
    return {
      action: 'update_preferences',
      title: 'Update your language preference',
      description: `This will change your assistant language to ${language === 'farsi' ? 'Persian' : language}.`,
      payload: { language: language === 'farsi' ? 'fa' : 'en' },
    };
  }

  return null;
}

function inferSection(text: string): TicketSection {
  const sections: TicketSection[] = ['trade', 'academy', 'marketplace', 'copy-trading', 'onchain', 'nft', 'sentiment', 'events'];
  return sections.find((section) => text.includes(section)) ?? 'general';
}

export async function executeAssistantAction(
  proposal: ActionProposal,
  user: UserProfile | null,
  confirmed: boolean,
): Promise<string> {
  if (!canAct(user)) throw new Error('Actions are unavailable until you sign in and exit View as User mode.');
  if (!confirmed) throw new Error('Confirmation is required before this action can run.');
  if (!user) throw new Error('Please sign in before using assistant actions.');

  if (proposal.action === 'create_ticket') {
    const nodeId = await createTicket({
      userEmail: user.email,
      userName: user.displayName || user.email.split('@')[0],
      section: (proposal.payload.section as TicketSection) || 'general',
      title: proposal.payload.title,
      description: proposal.payload.description,
      priority: (proposal.payload.priority as TicketPriority) || 'medium',
    });
    if (!nodeId) throw new Error('The ticket could not be saved. Please try again.');
    return 'Your support ticket was created and sent to the CryptoVerse support queue.';
  }

  if (proposal.action === 'update_preferences') {
    const language = proposal.payload.language;
    if (language !== 'en' && language !== 'fa') throw new Error('Only supported language preferences can be changed here.');
    await useAuthStore.getState().updateProfile({ language });
    return `Your language preference is now set to ${language === 'fa' ? 'Persian' : 'English'}.`;
  }

  if (proposal.action === 'run_approved_automation') {
    const automation = APPROVED_AUTOMATIONS[proposal.payload.automation as keyof typeof APPROVED_AUTOMATIONS];
    if (!automation) throw new Error('That automation is not approved for assistant use.');
    await runFlow(automation.flowId);
    return `${automation.label} started. The result will appear in the weekly reports project.`;
  }

  throw new Error('That assistant action is not available.');
}
