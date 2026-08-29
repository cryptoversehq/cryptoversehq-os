/**
 * LynxAISettings.tsx - Lynx AI personalization settings page.
 * Greeting name, help level, proactive suggestions toggle, chat history.
 */

import React, { useState } from 'react';
import { useAuthStore } from '@/lib/authStore';

export function LynxAISettings() {
  const { user } = useAuthStore();

  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('lynx_ai_settings_v1');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      greetingName: 'first_name',
      customName: '',
      helpLevel: 'medium',
      proactiveSuggestions: true,
      chatHistory: true,
      guidanceSections: { trading: true, academy: true, portfolio: true },
    };
  });

  const updateSettings = (updates: Partial<typeof settings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    try {
      localStorage.setItem('lynx_ai_settings_v1', JSON.stringify(newSettings));
    } catch {}
  };

  return (
    <div className="space-y-6 p-6 max-w-2xl">
      <h2 className="text-xl font-bold">🦊 Lynx AI Settings</h2>

      {/* Greeting Name */}
      <div className="space-y-2">
        <label className="text-sm font-medium">How should Lynx AI address you?</label>
        <select
          value={settings.greetingName}
          onChange={(e) => updateSettings({ greetingName: e.target.value })}
          className="w-full p-2 rounded-lg border border-border bg-background"
        >
          <option value="first_name">First name</option>
          <option value="full_name">Full name</option>
          <option value="custom">Custom name</option>
        </select>
        {settings.greetingName === 'custom' && (
          <input
            type="text"
            value={settings.customName}
            onChange={(e) => updateSettings({ customName: e.target.value })}
            placeholder="Enter custom name..."
            className="w-full p-2 rounded-lg border border-border bg-background mt-2"
          />
        )}
        <p className="text-xs text-muted-foreground">
          Current user: {user?.name || user?.email || 'Unknown'}
        </p>
      </div>

      {/* Help Level */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Help Level</label>
        <p className="text-xs text-muted-foreground">
          How proactive should Lynx AI be with suggestions and guidance?
        </p>
        <div className="flex gap-2">
          {[
            { value: 'low', label: '🔇 Low', desc: 'Minimal suggestions' },
            { value: 'medium', label: '🔊 Medium', desc: 'Balanced guidance' },
            { value: 'high', label: '📢 High', desc: 'Full coaching' },
          ].map((level) => (
            <button
              key={level.value}
              className={`flex-1 p-3 rounded-lg border text-sm transition ${
                settings.helpLevel === level.value
                  ? 'border-primary bg-primary/10 font-semibold'
                  : 'border-border hover:bg-secondary/50'
              }`}
              onClick={() => updateSettings({ helpLevel: level.value })}
            >
              <div>{level.label}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{level.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Proactive Suggestions Toggle */}
      <div className="flex items-center justify-between py-3">
        <div>
          <p className="font-medium text-sm">Proactive Suggestions</p>
          <p className="text-xs text-muted-foreground">
            Lynx AI can automatically suggest tips based on what you're doing.
          </p>
        </div>
        <button
          className={`w-12 h-6 rounded-full transition-colors ${
            settings.proactiveSuggestions ? 'bg-primary' : 'bg-muted'
          }`}
          onClick={() => updateSettings({ proactiveSuggestions: !settings.proactiveSuggestions })}
          aria-label={settings.proactiveSuggestions ? 'Disable suggestions' : 'Enable suggestions'}
        >
          <span
            className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
              settings.proactiveSuggestions ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Chat History Toggle */}
      <div className="flex items-center justify-between py-3">
        <div>
          <p className="font-medium text-sm">Chat History</p>
          <p className="text-xs text-muted-foreground">
            Save your conversation history with Lynx AI between sessions.
          </p>
        </div>
        <button
          className={`w-12 h-6 rounded-full transition-colors ${
            settings.chatHistory ? 'bg-primary' : 'bg-muted'
          }`}
          onClick={() => updateSettings({ chatHistory: !settings.chatHistory })}
          aria-label={settings.chatHistory ? 'Disable chat history' : 'Enable chat history'}
        >
          <span
            className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
              settings.chatHistory ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Guidance Sections */}
      <div className="space-y-3 pt-2 border-t border-border">
        <div>
          <p className="font-medium text-sm">Guide In Sections</p>
          <p className="text-xs text-muted-foreground">
            Choose where Lynx AI provides proactive guidance.
          </p>
        </div>
        {[
          { key: 'trading', label: 'Trading Simulator', icon: '📈' },
          { key: 'academy', label: 'Academy', icon: '🎓' },
          { key: 'portfolio', label: 'Portfolio', icon: '💰' },
        ].map((section) => {
          const sections = settings.guidanceSections || { trading: true, academy: true, portfolio: true };
          return (
            <div key={section.key} className="flex items-center justify-between py-1">
              <span className="text-sm">{section.icon} {section.label}</span>
              <button
                className={`w-12 h-6 rounded-full transition-colors ${
                  sections[section.key as keyof typeof sections] ? 'bg-primary' : 'bg-muted'
                }`}
                onClick={() => updateSettings({
                  guidanceSections: {
                    ...sections,
                    [section.key]: !sections[section.key as keyof typeof sections],
                  },
                })}
                aria-label={`Toggle ${section.key} guidance`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    sections[section.key as keyof typeof sections] ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>

      {/* Reset Welcome */}
      <div className="pt-4 border-t border-border">
        <button
          onClick={() => {
            localStorage.removeItem('lynx_ai_welcome_dismissed_v1');
            localStorage.removeItem('lynx_ai_settings_v1');
            setSettings({
              greetingName: 'first_name',
              customName: '',
              helpLevel: 'medium',
              proactiveSuggestions: true,
              chatHistory: true,
              guidanceSections: { trading: true, academy: true, portfolio: true },
            });
          }}
          className="text-sm text-muted-foreground hover:text-foreground underline"
        >
          Reset all Lynx AI settings to defaults
        </button>
      </div>
    </div>
  );
}
