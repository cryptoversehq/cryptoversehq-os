import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Eye } from 'lucide-react';
import { useSubscriptionAccess, useFeaturePreview } from '@/hooks/useSubscriptionAccess';
import { markPreviewed } from '@/lib/featurePreviewStore';
import { toast } from 'sonner';
import type { PlanId } from '@/lib/monetizationStore';

interface SubscriptionGateProps {
  requiredLevel: PlanId;
  children: React.ReactNode;
  featureName: string;
  fallback?: React.ReactNode;
  /** Feature key for one-free-preview tracking */
  featureKey?: string;
}

/**
 * Inline gate for individual action buttons.
 * When no access: renders a disabled-looking button that shows an upgrade toast on click.
 * When access granted: renders children normally.
 */
export function SubscriptionGate({ requiredLevel, children, featureName, fallback, featureKey }: SubscriptionGateProps) {
  const { hasAccess, getUpgradeMessage } = useSubscriptionAccess(requiredLevel);
  const { canPreview } = useFeaturePreview(featureKey ?? featureName);
  const [previewing, setPreviewing] = useState(false);

  // Full access
  if (hasAccess) return <>{children}</>;
  if (fallback) return <>{fallback}</>;

  // Feature Preview active
  if (canPreview && previewing) return <>{children}</>;

  const handleLockedClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (canPreview) {
      markPreviewed(featureKey ?? featureName);
      setPreviewing(true);
      toast.success(`Preview unlocked! You can try "${featureName}" once for free.`);
      return;
    }

    toast(getUpgradeMessage(), {
      description: 'Upgrade to Pro or Pro+ to unlock this feature.',
      action: {
        label: 'Upgrade',
        onClick: () => window.location.href = '/subscription',
      },
      duration: 6000,
    });
  };

  // Clone the child and overlay a lock
  return (
    <span className="inline-block relative group" onClick={handleLockedClick}>
      <span className="opacity-50 pointer-events-none">
        {children}
      </span>
      <span className="absolute inset-0 flex items-center justify-center gap-1 rounded-inherit cursor-pointer">
        <Lock className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-[10px] font-bold text-amber-400">Pro</span>
      </span>
    </span>
  );
}

// ── Page-level gate ────────────────────────────────────────────────────────
/**
 * Transparent page wrapper — always renders children at full visibility.
 * When access is denied, shows a slim dismissible upgrade banner at the top.
 * Content is fully visible and readable; only action buttons are individually gated.
 */
export function SubscriptionGatePage({ requiredLevel, children, featureName, fallback, featureKey }: Omit<SubscriptionGateProps, 'soft'>) {
  const { hasAccess, getUpgradeMessage } = useSubscriptionAccess(requiredLevel);
  const { canPreview } = useFeaturePreview(featureKey ?? featureName);
  const [previewing, setPreviewing] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (fallback) return <>{fallback}</>;

  const showFull = hasAccess || (canPreview && previewing);

  const handleTryFree = () => {
    markPreviewed(featureKey ?? featureName);
    setPreviewing(true);
    toast.success('Preview unlocked! You can explore this feature once for free.');
  };

  return (
    <div>
      {/* Slim upgrade banner — only when locked and not dismissed */}
      {!showFull && !dismissed && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 mb-1 rounded-lg border border-amber-500/20 bg-amber-500/5">
          <div className="flex items-center gap-2 min-w-0">
            <Lock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300/80 truncate">
              <span className="font-semibold">{featureName}</span>
              <span className="text-amber-400/50 mx-1">—</span>
              {getUpgradeMessage()}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canPreview && (
              <button
                onClick={handleTryFree}
                className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors whitespace-nowrap"
              >
                <Eye className="h-3 w-3 inline mr-1" />
                Try Free
              </button>
            )}
            <Link
              to="/subscription"
              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-amber-500 text-black text-[10px] font-bold hover:bg-amber-400 transition-colors whitespace-nowrap"
            >
              <Lock className="h-3 w-3" />
              Upgrade
            </Link>
            <button
              onClick={() => setDismissed(true)}
              className="text-white/20 hover:text-white/50 transition-colors"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* Content always visible at full opacity */}
      {children}
    </div>
  );
}
