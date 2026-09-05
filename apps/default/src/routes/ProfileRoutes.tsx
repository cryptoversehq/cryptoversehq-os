import { Route } from 'react-router-dom';
import { SubscriptionPage } from '../components/SubscriptionPage';
import { PaymentPage } from '../pages/PaymentPage';
import { WalletPage } from '../components/WalletPage';
import { BuyCPPage } from '../components/BuyCPPage';
import { CreatorEarningsPage } from '../components/CreatorEarningsPage';
import { Profile } from '../components/Profile';
import { ExchangePage } from '../components/exchange/ExchangePage';
import { Gate, ScrollPage, WidePage } from './RouteWrappers';

export const ProfileRouteElements = (
  <>
    <Route path="/exchange" element={<ScrollPage><Gate level="pro_plus" feature="Real Exchange"><ExchangePage /></Gate></ScrollPage>} />
    <Route path="/subscription" element={<ScrollPage><SubscriptionPage /></ScrollPage>} />
    <Route path="/payment/checkout" element={<ScrollPage><PaymentPage /></ScrollPage>} />
    <Route path="/wallet" element={<ScrollPage><WalletPage /></ScrollPage>} />
    <Route path="/buy-cp" element={<ScrollPage><BuyCPPage /></ScrollPage>} />
    <Route path="/creator/earnings" element={<ScrollPage><CreatorEarningsPage /></ScrollPage>} />
    <Route path="/profile" element={<WidePage><Profile /></WidePage>} />
  </>
);
