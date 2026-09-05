import { Route } from 'react-router-dom';
import { OnChainPage } from '../components/onChain/OnChainPage';
import { SmartMoneyPage } from '../components/onChain/SmartMoneyPage';
import { ExchangeFlowPage } from '../components/onChain/ExchangeFlowPage';
import { AlertsPage } from '../components/onChain/AlertsPage';
import { WalletTrackerPage } from '../components/onChain/WalletTrackerPage';
import { TransactionDetailsPage } from '../components/onChain/TransactionDetailsPage';
import { NFTPage } from '../components/nft/NFTPage';
import { Gate, ScrollPage } from './RouteWrappers';

export const NFTRouteElements = (
  <>
    <Route path="/on-chain" element={<ScrollPage><Gate level="pro" feature="On-Chain Analytics"><OnChainPage /></Gate></ScrollPage>} />
    <Route path="/on-chain/smart-money" element={<ScrollPage><Gate level="pro" feature="On-Chain Analytics"><SmartMoneyPage /></Gate></ScrollPage>} />
    <Route path="/on-chain/exchange-flow" element={<ScrollPage><Gate level="pro" feature="On-Chain Analytics"><ExchangeFlowPage /></Gate></ScrollPage>} />
    <Route path="/on-chain/alerts" element={<ScrollPage><Gate level="pro" feature="On-Chain Analytics"><AlertsPage /></Gate></ScrollPage>} />
    <Route path="/on-chain/wallet/:address" element={<ScrollPage><Gate level="pro" feature="On-Chain Analytics"><WalletTrackerPage /></Gate></ScrollPage>} />
    <Route path="/on-chain/transaction/:hash" element={<ScrollPage><Gate level="pro" feature="On-Chain Analytics"><TransactionDetailsPage /></Gate></ScrollPage>} />
    <Route path="/nft/*" element={<ScrollPage><Gate level="pro" feature="NFT Analytics"><NFTPage /></Gate></ScrollPage>} />
  </>
);
