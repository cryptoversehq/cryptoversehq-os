/**
 * botBacktestContext.tsx — Spec 6.1
 *
 * A tiny React context that lets the Bot Create Wizard hand off a
 * pre-built BacktestConfig to the BacktestPage without prop-drilling
 * through the router or using URL params.
 *
 * Usage
 * -----
 * 1. Wrap the app (or router) with <BotBacktestProvider>
 * 2. In BotCreateWizard:  const { setBotBacktestConfig } = useBotBacktestContext()
 *    then call setBotBacktestConfig(config) before navigating to /backtest
 * 3. In BacktestPage:     const { botBacktestConfig, clearBotBacktestConfig } = useBotBacktestContext()
 *    On mount, if botBacktestConfig is set → load it then clearBotBacktestConfig()
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import type { BacktestConfig } from '../components/backtest/BacktestConfigPanel';

interface BotBacktestContextValue {
  /** The BacktestConfig injected from the Bot Wizard; null when not set */
  botBacktestConfig:    BacktestConfig | null;
  /** Called by the Bot Wizard right before navigating */
  setBotBacktestConfig: (config: BacktestConfig) => void;
  /** Called by BacktestPage once it has consumed the config */
  clearBotBacktestConfig: () => void;
  /** Optional: name of the originating bot */
  botOriginName:        string | null;
  setBotOriginName:     (name: string | null) => void;
}

const BotBacktestContext = createContext<BotBacktestContextValue>({
  botBacktestConfig:      null,
  setBotBacktestConfig:   () => {},
  clearBotBacktestConfig: () => {},
  botOriginName:          null,
  setBotOriginName:       () => {},
});

export function BotBacktestProvider({ children }: { children: React.ReactNode }) {
  const [config,     setConfig]     = useState<BacktestConfig | null>(null);
  const [originName, setOriginName] = useState<string | null>(null);

  const set   = useCallback((c: BacktestConfig) => setConfig(c), []);
  const clear = useCallback(() => { setConfig(null); setOriginName(null); }, []);

  return (
    <BotBacktestContext.Provider value={{
      botBacktestConfig:      config,
      setBotBacktestConfig:   set,
      clearBotBacktestConfig: clear,
      botOriginName:          originName,
      setBotOriginName:       setOriginName,
    }}>
      {children}
    </BotBacktestContext.Provider>
  );
}

export function useBotBacktestContext() {
  return useContext(BotBacktestContext);
}
