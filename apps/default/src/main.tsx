import './lib/suppressNoise';
import './index.css';
import './styles/rtl.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import { GenesisRoot } from './lib/genesis';
import { TranslationProvider } from './lib/TranslationProvider.tsx';

import './lib/leaflet-setup';

// Apply stored theme - respects user preference, defaults to light
const storedTheme = (() => { try { return localStorage.getItem('cv_theme') || 'light'; } catch { return 'light'; } })();
document.documentElement.classList.toggle('dark', storedTheme === 'dark');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GenesisRoot>
      <TranslationProvider sourceLocale="en">
        <App />
      </TranslationProvider>
    </GenesisRoot>
  </StrictMode>,
);
