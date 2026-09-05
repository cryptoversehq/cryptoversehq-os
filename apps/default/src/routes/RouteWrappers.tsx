import type { ReactNode } from 'react';
import { SubscriptionGatePage } from '../components/SubscriptionGate';

export const ScrollPage = ({ children }: { children: ReactNode }) => (
  <div className="flex-1 flex flex-col overflow-y-auto pb-16 lg:pb-0">{children}</div>
);

export const WidePage = ({ children }: { children: ReactNode }) => (
  <div className="flex-1 p-6 pb-24 lg:pb-6 overflow-y-auto bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-background to-background">
    <div className="max-w-7xl mx-auto">{children}</div>
  </div>
);

export const Gate = ({ level, feature, children }: { level: 'pro' | 'pro_plus'; feature: string; children: ReactNode }) => (
  <SubscriptionGatePage requiredLevel={level} featureName={feature}>{children}</SubscriptionGatePage>
);
