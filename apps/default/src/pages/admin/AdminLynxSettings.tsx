/**
 * AdminLynxSettings.tsx - Lynx AI intelligence settings for admins.
 * Controls: alert toggles, intelligence level, report scheduling.
 */

import React, { useState } from 'react';
import { Brain, Bell, Clock, Mail } from 'lucide-react';

export function AdminLynxSettings() {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('cv_admin_lynx_settings');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      alertsEnabled: true,
      securityAlerts: true,
      healthAlerts: true,
      businessAlerts: false,
      intelligenceLevel: 'high' as 'low' | 'medium' | 'high',
      reportFrequency: 'daily' as 'daily' | 'weekly' | 'realtime',
      reportTime: '08:00',
      autoEmailReports: false,
      adminEmail: '',
    };
  });

  const update = (updates: Partial<typeof settings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    localStorage.setItem('cv_admin_lynx_settings', JSON.stringify(newSettings));
  };

  return (
    <div className="space-y-6 p-6 max-w-2xl">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Brain className="h-6 w-6 text-purple-400" />
        Lynx AI Intelligence Settings
      </h1>
      <p className="text-sm text-muted-foreground">
        Configure how Lynx AI monitors, alerts, and reports on platform operations.
      </p>

      {/* Alert Toggles */}
      <div className="space-y-4 border border-border rounded-2xl p-4">
        <h3 className="font-bold text-sm flex items-center gap-2"><Bell className="h-4 w-4" />Alert Configuration</h3>

        {[
          { key: 'alertsEnabled', label: 'All Alerts', desc: 'Master switch for all Lynx AI alerts' },
          { key: 'securityAlerts', label: 'Security Alerts', desc: 'Suspicious logins, threats, fraud detection' },
          { key: 'healthAlerts', label: 'Health Alerts', desc: 'API downtime, service degradation, errors' },
          { key: 'businessAlerts', label: 'Business Alerts', desc: 'Revenue drops, churn spikes, conversion changes' },
        ].map((item) => (
          <div key={item.key} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
            <button
              className={`w-12 h-6 rounded-full transition-colors ${(settings as any)[item.key] ? 'bg-primary' : 'bg-muted'}`}
              onClick={() => update({ [item.key]: !(settings as any)[item.key] })}
            >
              <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${(settings as any)[item.key] ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        ))}
      </div>

      {/* Intelligence Level */}
      <div className="space-y-3 border border-border rounded-2xl p-4">
        <h3 className="font-bold text-sm flex items-center gap-2"><Brain className="h-4 w-4" />Intelligence Level</h3>
        <div className="flex gap-2">
          {[
            { value: 'low' as const, label: '🔇 Low', desc: 'Critical alerts only' },
            { value: 'medium' as const, label: '🔊 Medium', desc: 'Important alerts + daily summary' },
            { value: 'high' as const, label: '📢 High', desc: 'All alerts + real-time monitoring' },
          ].map((level) => (
            <button
              key={level.value}
              className={`flex-1 p-3 rounded-lg border text-sm transition ${settings.intelligenceLevel === level.value ? 'border-purple-500/50 bg-purple-500/10 font-semibold' : 'border-border hover:bg-secondary/50'}`}
              onClick={() => update({ intelligenceLevel: level.value })}
            >
              <div>{level.label}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{level.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Report Scheduling */}
      <div className="space-y-3 border border-border rounded-2xl p-4">
        <h3 className="font-bold text-sm flex items-center gap-2"><Clock className="h-4 w-4" />Report Scheduling</h3>

        <div className="flex gap-2">
          {(['daily', 'weekly', 'realtime'] as const).map((freq) => (
            <button
              key={freq}
              className={`flex-1 p-3 rounded-lg border text-sm capitalize ${settings.reportFrequency === freq ? 'border-primary bg-primary/10 font-semibold' : 'border-border hover:bg-secondary/50'}`}
              onClick={() => update({ reportFrequency: freq })}
            >
              {freq === 'daily' ? '📅 Daily' : freq === 'weekly' ? '📊 Weekly' : '⚡ Realtime'}
            </button>
          ))}
        </div>

        {settings.reportFrequency === 'daily' && (
          <div>
            <label className="text-xs font-medium">Report Time</label>
            <input
              type="time"
              value={settings.reportTime}
              onChange={(e) => update({ reportTime: e.target.value })}
              className="w-full px-3 py-2 bg-secondary/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 mt-1"
            />
          </div>
        )}
      </div>

      {/* Email Reports */}
      <div className="space-y-3 border border-border rounded-2xl p-4">
        <h3 className="font-bold text-sm flex items-center gap-2"><Mail className="h-4 w-4" />Email Reports</h3>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Auto Email Reports</p>
            <p className="text-xs text-muted-foreground">Send AI-generated reports to admin email</p>
          </div>
          <button
            className={`w-12 h-6 rounded-full transition-colors ${settings.autoEmailReports ? 'bg-primary' : 'bg-muted'}`}
            onClick={() => update({ autoEmailReports: !settings.autoEmailReports })}
          >
            <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.autoEmailReports ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {settings.autoEmailReports && (
          <input
            type="email"
            value={settings.adminEmail}
            onChange={(e) => update({ adminEmail: e.target.value })}
            placeholder="admin@cryptoverse.com"
            className="w-full px-3 py-2 bg-secondary/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        )}
      </div>

      {/* Reset */}
      <button
        onClick={() => {
          localStorage.removeItem('cv_admin_lynx_settings');
          setSettings({
            alertsEnabled: true, securityAlerts: true, healthAlerts: true, businessAlerts: false,
            intelligenceLevel: 'high', reportFrequency: 'daily', reportTime: '08:00',
            autoEmailReports: false, adminEmail: '',
          });
        }}
        className="text-sm text-muted-foreground hover:text-foreground underline"
      >
        Reset to defaults
      </button>
    </div>
  );
}
