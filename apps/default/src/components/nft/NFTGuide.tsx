/**
 * NFTGuide.tsx — Beginner-friendly guided walkthrough of NFT concepts.
 *
 * Covers: What are NFTs, Rarity, Floor Price, Trading Simulator, Risk.
 * Persists seen state to localStorage so it only auto-shows once.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HelpCircle, ArrowRight, ArrowLeft, CheckCircle, Sparkles,
  Gem, TrendingUp, ShoppingBag, AlertTriangle, X,
  Landmark, Globe, Rocket,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const GUIDE_SEEN_KEY = 'cryptoverse_nft_guide_seen';

interface GuideStep {
  icon: React.ElementType;
  title: string;
  emoji: string;
  paragraphs: string[];
  tip?: string;
}

const STEPS: GuideStep[] = [
  {
    icon: Sparkles,
    title: 'What Are NFTs?',
    emoji: '🖼️',
    paragraphs: [
      'NFT stands for Non-Fungible Token — a unique digital asset on the blockchain. Unlike Bitcoin or Ethereum where every unit is identical, each NFT has distinct properties that make it one-of-a-kind.',
      'Think of NFTs as digital certificates of ownership. They can represent art, collectibles, game items, virtual land, music rights, and more. The blockchain proves you own it — no bank or government needed.',
      'Before NFTs, you could copy a digital file infinitely. NFTs solved this by making digital assets scarce and verifiable — creating real digital ownership for the first time.',
    ],
    tip: 'Think of NFTs as digital deeds to property — except the property is a unique digital item, and the deed lives forever on the blockchain.',
  },
  {
    icon: Landmark,
    title: 'Famous Collections',
    emoji: '🏛️',
    paragraphs: [
      'Bored Ape Yacht Club (BAYC): 10,000 unique ape NFTs on Ethereum. One of the most iconic collections, with celebrity holders like Eminem and Stephen Curry. Floor price has reached over $400K at peak.',
      'CryptoPunks: The OGs — 10,000 pixel characters launched in 2017. Considered the first NFT collection. Alien Punks (only 9 exist) have sold for over $23M each.',
      'Azuki: Anime-inspired 10K collection with strong community and storytelling. CloneX: 3D avatars by RTFKT (acquired by Nike). Doodles: colorful art-style collection bridging Web2/Web3.',
      'These blue-chip collections set market trends — when they move, the entire NFT market follows. CryptoVerse tracks all of them with live floor and volume data.',
    ],
    tip: 'Blue-chip collections are considered the safest NFT investments — like blue-chip stocks, they have the strongest brand recognition and liquidity.',
  },
  {
    icon: Gem,
    title: 'Understanding Rarity',
    emoji: '💎',
    paragraphs: [
      'Rarity determines how unique an NFT is within its collection. Each NFT has traits — background, accessories, expression — and each trait has a prevalence percentage (how many NFTs in the collection have it).',
      'CryptoVerse uses a 5-tier rarity system: Common (< 200), Uncommon (200-400), Rare (400-600), Epic (600-800), and Legendary (800+). Higher rarity typically means significantly higher value.',
      'A trait shared by only 1% of a collection is extremely rare. NFTs with multiple rare traits command premium prices — sometimes 10x to 100x the floor price.',
    ],
    tip: 'A legendary NFT can be worth 10x or more than a common one from the same collection. Rarity hunters look for underpriced rare NFTs before the market corrects.',
  },
  {
    icon: TrendingUp,
    title: 'Floor Price & Volume',
    emoji: '📊',
    paragraphs: [
      'Floor Price: The lowest-priced NFT in a collection currently listed for sale. It is the entry price for that collection. If you want to join BAYC, you need to pay at least the floor price.',
      'Trading Volume: The total value of NFTs traded in 24 hours. High volume = lots of buyers and sellers (good liquidity). Low volume = hard to sell quickly without taking a loss.',
      'CryptoVerse tracks floors and volumes across 6 marketplaces: OpenSea, Blur, LooksRare, Magic Eden, Rarible, and X2Y2 — giving you the most complete market picture.',
      'Key pattern: a rising floor price with increasing volume is often a bullish signal. A flat or falling floor with declining volume may indicate waning interest.',
    ],
    tip: 'Watch for "floor sweeps" — when someone buys many floor-priced NFTs at once. This often signals that a whale is accumulating before a price run-up.',
  },
  {
    icon: Globe,
    title: 'NFT Market Analysis',
    emoji: '🔍',
    paragraphs: [
      'Track three core metrics for any collection: Floor Price (your entry benchmark), Volume (liquidity gauge), and Unique Holders (distribution health).',
      'Whale watching: large wallet movements often precede major price moves. When a whale with a strong track record starts accumulating, it is a bullish signal worth paying attention to.',
      'Holder distribution matters: a collection with 40% of NFTs held by 3 wallets is risky — those whales could dump and crash the floor. Broad distribution (thousands of small holders) is healthier.',
      'Cross-reference on-chain data (whale alerts, holder stats) with marketplace data (floor, volume, listings) before making any trading decision.',
    ],
    tip: 'Set CryptoVerse alerts for whale activity on your watchlisted collections — this gives you early warning of major moves before they hit the floor.',
  },
  {
    icon: ShoppingBag,
    title: 'Trading Simulator',
    emoji: '🎮',
    paragraphs: [
      'Practice buying and selling NFTs with virtual currency — no real money involved. You start with $50,000 in virtual funds. Buy NFTs at or below floor price, track your portfolio, and sell for profit.',
      'Three strategies to practice: Floor Sweeping (buy cheapest listed when undervalued), Rarity Hunting (find underpriced rares), and Trend Trading (ride volume/community momentum).',
      'The simulator uses realistic price movements based on actual market patterns. Every trade is logged, and you can see your P&L, win rate, and portfolio value over time.',
      'This is the safest way to learn NFT trading. Build confidence and test strategies here before ever risking real cryptocurrency.',
    ],
    tip: 'Start with floor sweeping — buy 3-5 floor NFTs across different collections, set 20% profit targets, and track which collections perform best.',
  },
  {
    icon: Rocket,
    title: 'Getting Started',
    emoji: '🚀',
    paragraphs: [
      '1. Explore the Dashboard: browse top collections, filter by chain and category, sort by volume or floor change.',
      '2. Try the Simulator: visit /nft/simulate, pick a collection, and make your first virtual trade.',
      '3. Track Wallets: add wallets to watch (yours or whales\') on the Wallets tab.',
      '4. Set Alerts: configure price alerts for floor changes, whale sweeps, and rarity spikes.',
      '5. Complete the NFT Academy module to earn 600 XP and learn advanced strategies.',
      '6. Ask the NFT Assistant (bottom-right chat button) any questions — it knows all the collections, strategies, and market data.',
    ],
    tip: 'The NFT space rewards learning. Spend 30 minutes in the simulator before even thinking about real money — the market will still be there.',
  },
  {
    icon: AlertTriangle,
    title: 'Risks & Best Practices',
    emoji: '⚠️',
    paragraphs: [
      'NFTs are highly speculative — prices can and do go to zero. Never invest more than you can afford to lose. The market is more volatile than crypto, which is already volatile.',
      'Security essentials: never share your seed phrase or private key with anyone. Verify collection authenticity on official marketplaces. Be extremely wary of phishing links in Discord or Twitter DMs.',
      '\"Not your keys, not your NFTs\" — use a hardware wallet (Ledger, Trezor) for any collection worth more than a few hundred dollars.',
      'CryptoVerse provides simulated data for education and analysis. Real NFT trading involves significant financial risk. Always do your own research (DYOR) before buying.',
    ],
    tip: 'If a deal seems too good to be true, it IS too good to be true. There is no such thing as a free mint from a verified account that messages you first.',
  },
];

export function NFTGuide({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  const handleComplete = useCallback(() => {
    localStorage.setItem(GUIDE_SEEN_KEY, 'true');
    setIsVisible(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;
  const Icon = current.icon;

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-20 sm:w-full sm:max-w-lg z-[55] rounded-2xl overflow-hidden flex flex-col bg-card border border-border shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)' }}
                >
                  <HelpCircle className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="font-black text-sm">NFT Guide</h2>
                  <p className="text-[10px] text-muted-foreground">Step {step + 1} of {STEPS.length}</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Progress bar */}
            <div className="h-1 bg-white/5">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: `${(step / STEPS.length) * 100}%` }}
                animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>

            {/* Content */}
            <div className="p-6 flex-1">
              <div className="flex items-start gap-4 mb-5">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                  style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.18)' }}
                >
                  {current.emoji}
                </div>
                <div>
                  <h3 className="text-lg font-black text-foreground">{current.title}</h3>
                </div>
              </div>

              <div className="space-y-3">
                {current.paragraphs.map((p, i) => (
                  <p key={i} className="text-sm text-muted-foreground leading-relaxed">{p}</p>
                ))}
              </div>

              {current.tip && (
                <div
                  className="mt-4 p-3 rounded-xl flex items-start gap-2"
                  style={{ background: 'rgba(250,204,21,0.06)', border: '1px solid rgba(250,204,21,0.15)' }}
                >
                  <Sparkles className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-300/80">{current.tip}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-white/5">
              {/* Step dots */}
              <div className="flex items-center gap-1.5">
                {STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'w-2 h-2 rounded-full transition-all',
                      i === step ? 'bg-primary w-4' : i < step ? 'bg-primary/40' : 'bg-white/10',
                    )}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                {!isFirst && (
                  <button
                    onClick={() => setStep(s => s - 1)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border border-white/10 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                )}
                {isLast ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { handleComplete(); navigate('/nft/simulate'); }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 transition-colors"
                    >
                      <Rocket className="h-4 w-4" /> Start Trading
                    </button>
                    <button
                      onClick={handleComplete}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                    >
                      <CheckCircle className="h-4 w-4" /> Got it!
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setStep(s => s + 1)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    Next <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/** Returns true if the guide has been seen (for auto-show logic). */
export function hasSeenNFTGuide(): boolean {
  return localStorage.getItem(GUIDE_SEEN_KEY) === 'true';
}
