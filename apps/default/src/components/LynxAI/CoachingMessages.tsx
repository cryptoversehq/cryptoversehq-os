import { useState, useEffect } from 'react';
import { lynxCoach, type CoachingMessage } from '@/lib/coachEngine';

export function CoachingMessages() {
  const [messages, setMessages] = useState<CoachingMessage[]>([]);

  useEffect(() => {
    setMessages(lynxCoach.getActiveMessages());
    const unsub = lynxCoach.subscribe((state) => {
      setMessages(state.messages);
    });
    return unsub;
  }, []);

  if (messages.length === 0) return null;

  return (
    <div className="fixed bottom-28 right-6 z-40 space-y-2 max-w-sm w-full pointer-events-none">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`pointer-events-auto p-4 bg-card rounded-2xl shadow-xl border animate-in slide-in-from-right-4 fade-in ${
            msg.type === 'warning' ? 'border-red-500/30' :
            msg.type === 'celebration' ? 'border-green-500/30' :
            'border-border'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 text-2xl">{msg.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{msg.title}</div>
              <div className="text-sm text-muted-foreground">{msg.message}</div>
            </div>
            {msg.dismissible && (
              <button
                onClick={() => lynxCoach.dismissMessage(msg.id)}
                className="text-muted-foreground hover:text-foreground flex-shrink-0"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
