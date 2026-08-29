/**
 * AdminLynxButton.tsx - Lynx AI button for admin panel.
 * Dedicated admin AI that answers platform management questions.
 */

import React, { useState } from 'react';
import { X, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LynxLogo } from '@/components/LynxAI/LynxLogo';
import { useDeepSeekChat } from '@/hooks/useDeepSeekChat';

export function AdminLynxButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const { messages, status, sendMessage } = useDeepSeekChat();

  const isStreaming = status === 'streaming' || status === 'submitted';

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    setInput('');
    await sendMessage({
      id: crypto.randomUUID(),
      role: 'user',
      parts: [{ type: 'text', text: '[ADMIN COMMAND] ' + trimmed }],
    });
  };

  const visibleMessages = messages.filter((m: any) => m.role !== 'system');

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lynx-admin-btn fixed bottom-6 right-6 z-50 group"
        aria-label="Open Admin AI chat"
      >
        <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center justify-center overflow-hidden">
          <LynxLogo size={36} mode="default" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse border-2 border-white dark:border-gray-900" />
        </div>
        <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          Admin AI
        </span>
      </button>

      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 max-w-[calc(100vw-2rem)] bg-card rounded-2xl shadow-2xl border border-border z-50 flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 140px)' }}>
          <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-border bg-card rounded-t-2xl">
            <div className="flex items-center gap-3">
              <LynxLogo size={28} mode="default" />
              <div>
                <p className="font-bold text-sm">Admin AI</p>
                <p className="text-[10px] text-muted-foreground">{isStreaming ? 'Thinking...' : 'Online'}</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
            {visibleMessages.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">Ask me about system health, user stats, security threats, economy metrics...</p>
              </div>
            )}
            {visibleMessages.map((m: any) => (
              <div key={m.id} className={cn('max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm', m.role === 'user' ? 'bg-primary text-primary-foreground ml-auto rounded-br-md' : 'bg-secondary text-secondary-foreground mr-auto rounded-bl-md')}>
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>
            ))}
            {isStreaming && <div className="text-xs text-muted-foreground animate-pulse">Thinking...</div>}
          </div>

          <div className="flex-shrink-0 p-4 border-t border-border bg-card rounded-b-2xl flex gap-2">
            <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder="Ask about the platform..." className="flex-1 px-3 py-2 bg-secondary/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20" onKeyDown={e => e.key === 'Enter' && handleSend(input)} />
            <button onClick={() => handleSend(input)} disabled={isStreaming || !input.trim()} className="px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"><Send className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      )}
    </>
  );
}
