import { Route } from 'react-router-dom';
import { BotsPage } from '../components/bots/BotsPage';
import { BotDetailsPage } from '../components/bots/BotDetailsPage';
import { MarketplacePage } from '../components/marketplace/MarketplacePage';
import { StrategyDetailPage } from '../components/marketplace/StrategyDetailPage';
import { MyStrategiesPage } from '../components/marketplace/MyStrategiesPage';
import { CreateStrategyPage } from '../components/marketplace/CreateStrategyPage';
import { StrategyAnalyticsPage } from '../components/marketplace/StrategyAnalyticsPage';
import { MarketplaceReportPage } from '../components/marketplace/MarketplaceReportPage';
import { CopyTradingPage } from '../components/copyTrading/CopyTradingPage';
import { MyFollowingPage } from '../components/copyTrading/MyFollowingPage';
import { MyFollowersPage } from '../components/copyTrading/MyFollowersPage';
import { CopyHistoryPage } from '../components/copyTrading/CopyHistoryPage';
import { TraderDetailsPage } from '../components/copyTrading/TraderDetailsPage';
import { Gate, ScrollPage } from './RouteWrappers';

export const ExchangeRouteElements = (
  <>
    <Route path="/bots" element={<ScrollPage><Gate level="pro" feature="AI Trading Bots"><BotsPage /></Gate></ScrollPage>} />
    <Route path="/bots/:id" element={<ScrollPage><Gate level="pro" feature="AI Trading Bots"><BotDetailsPage /></Gate></ScrollPage>} />
    <Route path="/marketplace" element={<ScrollPage><Gate level="pro" feature="Strategy Marketplace"><MarketplacePage /></Gate></ScrollPage>} />
    <Route path="/marketplace/my-strategies" element={<ScrollPage><Gate level="pro" feature="Strategy Marketplace"><MyStrategiesPage /></Gate></ScrollPage>} />
    <Route path="/marketplace/create" element={<ScrollPage><Gate level="pro" feature="Strategy Marketplace"><CreateStrategyPage /></Gate></ScrollPage>} />
    <Route path="/marketplace/edit/:id" element={<ScrollPage><Gate level="pro" feature="Strategy Marketplace"><CreateStrategyPage /></Gate></ScrollPage>} />
    <Route path="/marketplace/analytics/:id" element={<ScrollPage><Gate level="pro" feature="Strategy Analytics"><StrategyAnalyticsPage /></Gate></ScrollPage>} />
    <Route path="/marketplace/report" element={<ScrollPage><Gate level="pro" feature="Marketplace Report"><MarketplaceReportPage /></Gate></ScrollPage>} />
    <Route path="/marketplace/:id" element={<ScrollPage><StrategyDetailPage /></ScrollPage>} />
    <Route path="/copy-trading" element={<ScrollPage><Gate level="pro" feature="Copy Trading"><CopyTradingPage /></Gate></ScrollPage>} />
    <Route path="/copy-trading/following" element={<ScrollPage><Gate level="pro" feature="Copy Trading"><MyFollowingPage /></Gate></ScrollPage>} />
    <Route path="/copy-trading/followers" element={<ScrollPage><Gate level="pro" feature="Copy Trading"><MyFollowersPage /></Gate></ScrollPage>} />
    <Route path="/copy-trading/history" element={<ScrollPage><Gate level="pro" feature="Copy Trading"><CopyHistoryPage /></Gate></ScrollPage>} />
    <Route path="/copy-trading/trader/:id" element={<ScrollPage><TraderDetailsPage /></ScrollPage>} />
  </>
);
