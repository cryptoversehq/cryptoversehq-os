import { Navigate, Route } from 'react-router-dom';
import { TradingTerminal } from '../components/mobileTrading/TradingTerminal';
import { DashboardHome } from '../components/DashboardHome';
import { Portfolio } from '../components/Portfolio';
import { Academy } from '../components/Academy';
import { Leaderboard } from '../components/Leaderboard';
import { Nations } from '../components/Nations';
import { TwinLeague } from '../components/TwinLeague';
import { BacktestPage } from '../components/backtest/BacktestPage';
import { BacktestHistoryPage } from '../components/backtest/BacktestHistoryPage';
import { LynxAISettings } from '../pages/Settings/LynxAISettings';
import AllFeaturesTest from '../components/debug/AllFeaturesTest';
import SecretsDebugPage from '../components/debug/SecretsDebugPage';
import WhatsNewPage from '../components/features/WhatsNewPage';
import FeedbackAdminPage from '../components/features/FeedbackAdminPage';
import FeaturesHelpPage from '../components/features/HelpPage';
import ChangelogPage from '../components/features/ChangelogPage';
import { NotFound } from '../pages/NotFound';
import { Gate, ScrollPage, WidePage } from './RouteWrappers';

export const DashboardRouteElements = (
  <>
    <Route path="/" element={<Navigate to="/dashboard" replace />} />
    <Route path="/settings" element={<Navigate to="/profile" replace />} />
    <Route path="/onchain" element={<Navigate to="/on-chain" replace />} />
    <Route path="/competitions" element={<Navigate to="/events" replace />} />
    <Route path="/trading" element={<div className="flex-1 flex flex-col overflow-hidden"><TradingTerminal /></div>} />
    <Route path="/dashboard" element={<div className="flex-1 flex flex-col overflow-hidden"><DashboardHome /></div>} />
    <Route path="/portfolio" element={<WidePage><Portfolio /></WidePage>} />
    <Route path="/backtest" element={<ScrollPage><Gate level="pro" feature="Strategy Backtest"><BacktestPage /></Gate></ScrollPage>} />
    <Route path="/backtest/history" element={<ScrollPage><Gate level="pro" feature="Strategy Backtest"><BacktestHistoryPage /></Gate></ScrollPage>} />
    <Route path="/academy" element={<WidePage><Academy /></WidePage>} />
    <Route path="/leaderboard" element={<WidePage><Leaderboard /></WidePage>} />
    <Route path="/nations" element={<WidePage><Nations /></WidePage>} />
    <Route path="/twin-league" element={<WidePage><Gate level="pro" feature="Twin League AI Competitions"><TwinLeague /></Gate></WidePage>} />
    <Route path="/settings/lynx-ai" element={<WidePage><LynxAISettings /></WidePage>} />
    <Route path="/debug/all-features" element={<AllFeaturesTest />} />
    <Route path="/debug/secrets" element={<SecretsDebugPage />} />
    <Route path="/whats-new" element={<WhatsNewPage />} />
    <Route path="/feedback" element={<FeedbackAdminPage />} />
    <Route path="/help" element={<FeaturesHelpPage />} />
    <Route path="/changelog" element={<ChangelogPage />} />
    <Route path="*" element={<div className="flex-1 flex items-center justify-center p-6 pb-24 lg:pb-6 overflow-y-auto"><NotFound /></div>} />
  </>
);
