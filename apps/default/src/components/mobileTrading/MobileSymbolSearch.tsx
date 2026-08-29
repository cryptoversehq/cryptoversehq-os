/**
 * MobileSymbolSearch.tsx
 * Full-screen symbol search for mobile - wraps CoinSearchModal.
 */

import React from 'react';
import { CoinSearchModal } from '@/components/trading/CoinSearchModal';

type CoinInfo = { id: string; symbol: string; name: string; color: string };

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (coin: CoinInfo) => void;
}

export function MobileSymbolSearch({ open, onClose, onSelect }: Props) {
  return (
    <CoinSearchModal
      open={open}
      onClose={onClose}
      onSelect={onSelect as any}
    />
  );
}
