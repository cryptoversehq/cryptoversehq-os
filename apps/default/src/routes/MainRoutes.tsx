import type { ReactNode } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { SubscriptionGatePage } from '../components/SubscriptionGate';
import { TradingTerminal } from '../components/mobileTrading/TradingTerminal';
import { DashboardHome } from '../components/DashboardHome';
import { Portfolio } from '../components/Portfolio';
import { Academy } from '../components/Academy';
import { Leaderboard } from '../components/Leaderboard';
import { Nations } from '../components/Nations';
import { TwinLeague } from '../components/TwinLeague';
import { Profile } from '../components/Profile';
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
import { OnChainPage } from '../components/onChain/OnChainPage';
import { SmartMoneyPage } from '../components/onChain/SmartMoneyPage';
import { ExchangeFlowPage } from '../components/onChain/ExchangeFlowPage';
import { AlertsPage } from '../components/onChain/AlertsPage';
import { WalletTrackerPage } from '../components/onChain/WalletTrackerPage';
import { TransactionDetailsPage } from '../components/onChain/TransactionDetailsPage';
import { NFTPage } from '../components/nft/NFTPage';
import { SentimentPage } from '../components/sentiment/SentimentPage';
import { EventsPage } from '../components/events/EventsPage';
import { ExchangePage } from '../components/exchange/ExchangePage';
import { SubscriptionPage } from '../components/SubscriptionPage';
import { PaymentPage } from '../pages/PaymentPage';
import { WalletPage } from '../components/WalletPage';
import { BuyCPPage } from '../components/BuyCPPage';
import { CreatorEarningsPage } from '../components/CreatorEarningsPage';
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

const ScrollPage = ({ children }: { children: ReactNode }) => <div className="flex-1 flex flex-col overflow-y-auto pb-16 lg:pb-0">{children}</div>;
const WidePage = ({ children }: { children: ReactNode }) => <div className="flex-1 p-6 pb-24 lg:pb-6 overflow-y-auto bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-background to-background"><div className="max-w-7xl mx-auto">{children}</div></div>;
const Gate = ({ level, feature, children }: { level: 'pro' | 'pro_plus'; feature: string; children: ReactNode }) => <SubscriptionGatePage requiredLevel={level} featureName={feature}>{children}</SubscriptionGatePage>;

export function MainRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/settings" element={<Navigate to="/profile" replace />} />
      <Route path="/onchain" element={<Navigate to="/on-chain" replace />} />
      <Route path="/competitions" element={<Navigate to="/events" replace />} />
      <Route path="/trading" element={<div className="flex-1 flex flex-col overflow-hidden"><TradingTerminal /></div>} />
      <Route path="/dashboard" element={<div className="flex-1 flex flex-col overflow-hidden"><DashboardHome /></div>} />
      <Route path="/portfolio" element={<WidePage><Portfolio /></WidePage>} />
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
      <Route path="/on-chain" element={<ScrollPage><Gate level="pro" feature="On-Chain Analytics"><OnChainPage /></Gate></ScrollPage>} />
      <Route path="/on-chain/smart-money" element={<ScrollPage><Gate level="pro" feature="On-Chain Analytics"><SmartMoneyPage /></Gate></ScrollPage>} />
      <Route path="/on-chain/exchange-flow" element={<ScrollPage><Gate level="pro" feature="On-Chain Analytics"><ExchangeFlowPage /></Gate></ScrollPage>} />
      <Route path="/on-chain/alerts" element={<ScrollPage><Gate level="pro" feature="On-Chain Analytics"><AlertsPage /></Gate></ScrollPage>} />
      <Route path="/on-chain/wallet/:address" element={<ScrollPage><Gate level="pro" feature="On-Chain Analytics"><WalletTrackerPage /></Gate></ScrollPage>} />
      <Route path="/on-chain/transaction/:hash" element={<ScrollPage><Gate level="pro" feature="On-Chain Analytics"><TransactionDetailsPage /></Gate></ScrollPage>} />
      <Route path="/nft/*" element={<ScrollPage><Gate level="pro" feature="NFT Analytics"><NFTPage /></Gate></ScrollPage>} />
      <Route path="/sentiment" element={<ScrollPage><Gate level="pro" feature="Sentiment Analysis"><SentimentPage /></Gate></ScrollPage>} />
      <Route path="/sentiment/fear-greed" element={<ScrollPage><Gate level="pro" feature="Sentiment Analysis"><SentimentPage /></Gate></ScrollPage>} />
      <Route path="/sentiment/social" element={<ScrollPage><Gate level="pro" feature="Sentiment Analysis"><SentimentPage /></Gate></ScrollPage>} />
      <Route path="/sentiment/news" element={<ScrollPage><Gate level="pro" feature="Sentiment Analysis"><SentimentPage /></Gate></ScrollPage>} />
      <Route path="/sentiment/alerts" element={<ScrollPage><Gate level="pro" feature="Sentiment Analysis"><SentimentPage /></Gate></ScrollPage>} />
      <Route path="/sentiment/signals" element={<ScrollPage><Gate level="pro" feature="Sentiment Analysis"><SentimentPage /></Gate></ScrollPage>} />
      <Route path="/sentiment/checklist" element={<ScrollPage><Gate level="pro" feature="Sentiment Analysis"><SentimentPage /></Gate></ScrollPage>} />
      <Route path="/sentiment/report" element={<ScrollPage><SentimentPage /></ScrollPage>} />
      <Route path="/events/*" element={<ScrollPage><Gate level="pro" feature="Live Events"><EventsPage /></Gate></ScrollPage>} />
      <Route path="/exchange" element={<ScrollPage><Gate level="pro_plus" feature="Real Exchange"><ExchangePage /></Gate></ScrollPage>} />
      <Route path="/subscription" element={<ScrollPage><SubscriptionPage /></ScrollPage>} />
      <Route path="/payment/checkout" element={<ScrollPage><PaymentPage /></ScrollPage>} />
      <Route path="/wallet" element={<ScrollPage><WalletPage /></ScrollPage>} />
      <Route path="/buy-cp" element={<ScrollPage><BuyCPPage /></ScrollPage>} />
      <Route path="/creator/earnings" element={<ScrollPage><CreatorEarningsPage /></ScrollPage>} />
      <Route path="/backtest" element={<ScrollPage><Gate level="pro" feature="Strategy Backtest"><BacktestPage /></Gate></ScrollPage>} />
      <Route path="/backtest/history" element={<ScrollPage><Gate level="pro" feature="Strategy Backtest"><BacktestHistoryPage /></Gate></ScrollPage>} />
      <Route path="/academy" element={<WidePage><Academy /></WidePage>} />
      <Route path="/leaderboard" element={<WidePage><Leaderboard /></WidePage>} />
      <Route path="/nations" element={<WidePage><Nations /></WidePage>} />
      <Route path="/twin-league" element={<WidePage><Gate level="pro" feature="Twin League AI Competitions"><TwinLeague /></Gate></WidePage>} />
      <Route path="/profile" element={<WidePage><Profile /></WidePage>} />
      <Route path="/settings/lynx-ai" element={<WidePage><LynxAISettings /></WidePage>} />
      <Route path="/debug/all-features" element={<AllFeaturesTest />} />
      <Route path="/debug/secrets" element={<SecretsDebugPage />} />
      <Route path="/whats-new" element={<WhatsNewPage />} />
      <Route path="/feedback" element={<FeedbackAdminPage />} />
      <Route path="/help" element={<FeaturesHelpPage />} />
      <Route path="/changelog" element={<ChangelogPage />} />
      <Route path="*" element={<div className="flex-1 flex items-center justify-center p-6 pb-24 lg:pb-6 overflow-y-auto"><NotFound /></div>} />
    </Routes>
  );
}
