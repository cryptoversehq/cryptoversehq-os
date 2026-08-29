import React from 'react';

export interface MobileTab {
  id:    string;
  label: string;
  emoji?: string;
}

interface Props {
  tabs:      MobileTab[];
  activeTab: string;
  onChange:  (id: string) => void;
}

/**
 * Horizontal, horizontally-scrollable tab bar used by ProDashboard's mobile
 * trading-terminal layout (<768px) to switch between Chart / Order Book /
 * Trade / More, since those panels can no longer sit side by side at phone
 * widths. Styled via the `.tab-bar` / `.tab-item` classes in index.css
 * (which already use the app's `--bg-secondary` / `--border-color` /
 * `--text-muted` / `--text-primary` / `--cv-dash-accent` theme tokens, so
 * this matches light/dark mode automatically).
 */
export function MobileTabBar({ tabs, activeTab, onChange }: Props) {
  return (
    <div className="tab-bar" role="tablist">
      {tabs.map(tab => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={isActive ? 'tab-item active' : 'tab-item'}
          >
            {tab.emoji && <span className="mr-1">{tab.emoji}</span>}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
