/**
 * useDeepSeekChat.ts — CryptoVerse HQ
 *
 * A custom hook that mimics the @ai-sdk/react useChat interface
 * but routes messages through the CryptoVerse agent system.
 *
 * Features:
 * - Multi-agent routing via agentRouter
 * - Taskade Agent → DeepSeek fallback
 * - Agent name/emoji tracking for UI display
 * - Messages array management
 * - Loading state
 * - Error handling
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { Message } from 'ai';
import { MENTOR_SYSTEM_PROMPT } from '@/lib/deepSeekClient';
import { routedChat } from '@/lib/agentRouter';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseDeepSeekChatOptions {
  initialMessages?: Message[];
}

export type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error';

export interface UseDeepSeekChatReturn {
  messages: Message[];
  status: ChatStatus;
  error: Error | null;
  sendMessage: (message: { id: string; role: 'user'; parts: Array<{ type: string; text: string }> }) => Promise<void>;
  reload: () => Promise<void>;
  addToolApprovalResponse: (response: { id: string; approved: boolean }) => void;
  id: string;
  /** Name of the active agent handling the current conversation */
  agentName: string;
  /** Emoji of the active agent */
  agentEmoji: string;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function extractTextFromParts(parts: Array<{ type: string; text?: string }>): string {
  return parts.filter(p => p.type === 'text').map(p => p.text || '').join('');
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// ─── Main Hook ────────────────────────────────────────────────────────────────

export function useDeepSeekChat(options: UseDeepSeekChatOptions = {}): UseDeepSeekChatReturn {
  const { initialMessages = [] } = options;

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [status, setStatus] = useState<ChatStatus>('ready');
  const [error, setError] = useState<Error | null>(null);
  const [agentName, setAgentName] = useState<string>('Lynx AI Router');
  const [agentEmoji, setAgentEmoji] = useState<string>('🤖');
  const chatIdRef = useRef<string>(generateId());
  const mountedRef = useRef(true);

  // Cleanup on unmount — prevent state updates after component is gone
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const sendMessage = useCallback(async (message: {
    id: string;
    role: 'user';
    parts: Array<{ type: string; text: string }>;
  }) => {
    const userText = extractTextFromParts(message.parts);
    if (!userText.trim()) return;

    // Add user message to state
    const userMessage: Message = {
      id: message.id,
      role: 'user',
      content: userText,
    };

    setMessages(prev => [...prev, userMessage]);
    setStatus('streaming');
    setError(null);

    try {
      // Use routedChat which handles agent routing + fallback
      const allMessages = [
        { role: 'system' as const, content: MENTOR_SYSTEM_PROMPT },
        ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content || '' })),
        { role: 'user' as const, content: userText },
      ];

      const response = await routedChat(allMessages);

      // Guard against stale updates if component unmounted during API call
      if (!mountedRef.current) return;

      // Update agent info for UI display
      setAgentName(response.agentName);
      setAgentEmoji(response.agentEmoji);

      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: response.content || 'I apologize, but I encountered an error processing your request. Please try again.',
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (!response.ok) {
        setError(new Error('AI is currently using offline responses — API service unavailable.'));
        setStatus('error');
      } else {
        setStatus('ready');
      }
    } catch (err) {
      console.error('[useDeepSeekChat] Error:', err);

      if (!mountedRef.current) return;

      setError(err instanceof Error ? err : new Error('Failed to get response from AI'));
      setStatus('error');

      const errorMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error processing your request. Please try again.',
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  }, [messages]);

  const reload = useCallback(async () => {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMessage) return;

    const lastUserIndex = messages.findIndex(m => m.id === lastUserMessage.id);
    const trimmedMessages = messages.slice(0, lastUserIndex + 1);

    setMessages(trimmedMessages);

    await sendMessage({
      id: lastUserMessage.id,
      role: 'user',
      parts: [{ type: 'text', text: lastUserMessage.content || '' }],
    });
  }, [messages, sendMessage]);

  const addToolApprovalResponse = useCallback((_response: { id: string; approved: boolean }) => {
    console.warn('[useDeepSeekChat] Tool approval not yet implemented');
  }, []);

  return {
    messages,
    status,
    error,
    sendMessage,
    reload,
    addToolApprovalResponse,
    id: chatIdRef.current,
    agentName,
    agentEmoji,
  };
}

export default useDeepSeekChat;
