/**
 * MessageBubble.tsx - Chat message bubble component.
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { LynxLogo } from './LynxLogo';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Props {
  message: Message;
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-7 h-7 flex items-center justify-center flex-shrink-0 mt-1">
          <LynxLogo size={24} state="idle" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-secondary text-secondary-foreground rounded-bl-md',
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
        <span className={cn('text-[10px] mt-1 block opacity-60', isUser ? 'text-right' : 'text-left')}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-1">
          <span className="text-sm text-primary-foreground">👤</span>
        </div>
      )}
    </div>
  );
}
