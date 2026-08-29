/**
 * API Response types
 */
import { platformTransport } from '../../platformTransport';
import { gatewayRequest } from '../../genesis-gateway';

export interface CreateConversationResponse {
  ok: boolean;
  conversationId: string;
}

/**
 * Configuration for API client
 */
export interface ClientOptions {
  /** Base URL for API requests (defaults to relative paths) */
  baseUrl?: string;
}

function isEmptyString(value: string | null | undefined): boolean {
  return value == null || value.trim().length === 0;
}

/**
 * Creates a new public agent conversation
 *
 * @param agentId - The agent ID
 * @param options - Optional client configuration
 * @returns Promise resolving to conversation ID
 * @throws Error if conversation creation fails
 *
 * @example
 * ```typescript
 * const { conversationId } = await createConversation('agent-456');
 * ```
 */
export async function createConversation(
  agentId: string,
  options?: ClientOptions,
): Promise<CreateConversationResponse> {
  if (isEmptyString(agentId)) {
    throw new Error('Agent ID cannot be empty');
  }

  const baseUrl = options?.baseUrl ?? '';
  const url = `${baseUrl}/api/taskade/agents/${encodeURIComponent(agentId)}/public-conversations`;

  return platformTransport.request<CreateConversationResponse>(url, { method: 'POST' });
}

export const PUBLIC_CONVERSATION_LIST_MAX_IDS = 50;
export const PUBLIC_TRANSCRIPT_MAX_LIMIT = 100;

export interface ConversationSummary {
  conversationId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListConversationsResponse {
  ok: true;
  conversations: ConversationSummary[];
}

export interface TranscriptMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
}

export interface GetConversationResponse {
  ok: true;
  conversationId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages: TranscriptMessage[];
  nextCursor: string | null;
}

export interface AgentPublicProfile {
  ok: true;
  id: string;
  publicAgentId: string;
  name: string;
  avatar: { type: 'emoji'; value: string } | { type: 'image'; url: string } | null;
  introduction: string | null;
  conversationStarters: { text: string; prompt: string }[];
  inputPlaceholder: string | null;
  footerText: string | null;
  dismissableNotice: string | null;
  preferences: {
    theme: 'light' | 'dark' | 'auto' | null;
    color: string | null;
    headerTitle: string | null;
    messageLayout: 'default' | 'bubble';
    showSuggestions: boolean;
  };
}

export interface GetConversationOptions extends ClientOptions {
  cursor?: string;
  limit?: number;
}

function uniqueNonEmptyIds(conversationIds: readonly string[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of conversationIds) {
    const id = value.trim();
    if (id === '' || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export async function listConversations(
  agentId: string,
  conversationIds: readonly string[],
  options?: ClientOptions,
): Promise<ListConversationsResponse> {
  if (isEmptyString(agentId)) {
    throw new Error('Agent ID cannot be empty');
  }

  const ids = uniqueNonEmptyIds(conversationIds);
  if (ids.length === 0) {
    throw new Error(
      'Pass conversation ids the client already stored. Listing every conversation for an agent is not supported because public conversations have no end-user identity.',
    );
  }
  if (ids.length > PUBLIC_CONVERSATION_LIST_MAX_IDS) {
    throw new Error(
      `A maximum of ${PUBLIC_CONVERSATION_LIST_MAX_IDS} conversation ids is allowed per request`,
    );
  }

  const query = `ids=${ids.map(encodeURIComponent).join(',')}`;
  return gatewayRequest<ListConversationsResponse>(
    `/agents/${encodeURIComponent(agentId)}/public-conversations?${query}`,
    { method: 'GET' },
    options,
  );
}

export async function getConversation(
  agentId: string,
  conversationId: string,
  options?: GetConversationOptions,
): Promise<GetConversationResponse> {
  if (isEmptyString(agentId)) {
    throw new Error('Agent ID cannot be empty');
  }
  if (isEmptyString(conversationId)) {
    throw new Error('Conversation ID cannot be empty');
  }

  const params = new URLSearchParams();
  const cursor = options?.cursor?.trim();
  if (cursor != null && cursor.length > 0) {
    params.set('cursor', cursor);
  }
  if (options?.limit != null) {
    const limit = options.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > PUBLIC_TRANSCRIPT_MAX_LIMIT) {
      throw new Error(`limit must be an integer between 1 and ${PUBLIC_TRANSCRIPT_MAX_LIMIT}`);
    }
    params.set('limit', String(limit));
  }
  const query = params.toString();
  const path = `/agents/${encodeURIComponent(agentId)}/public-conversations/${encodeURIComponent(conversationId)}`;

  return gatewayRequest<GetConversationResponse>(
    query === '' ? path : `${path}?${query}`,
    { method: 'GET' },
    options,
  );
}

export async function getAgentProfile(
  agentId: string,
  options?: ClientOptions,
): Promise<AgentPublicProfile> {
  if (isEmptyString(agentId)) {
    throw new Error('Agent ID cannot be empty');
  }
  return gatewayRequest<AgentPublicProfile>(
    `/agents/${encodeURIComponent(agentId)}/public-profile`,
    { method: 'GET' },
    options,
  );
}
