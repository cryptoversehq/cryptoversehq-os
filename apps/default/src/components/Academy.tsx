import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, CheckCircle, Lock, PlayCircle, ArrowRight, Star, Zap, Shield, TrendingUp, BarChart2, Award, ChevronLeft, FlaskConical, ShoppingBag, Trophy, Sparkles, Globe, Gem, Image, Link2, BrainCircuit } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAcademyStore, getLevelInfo } from '@/lib/academyStore';
import { useAuthStore } from '@/lib/authStore';
import { useStrategyStore } from '@/lib/strategyStore';
import LearningPath from '@/components/features/LearningPath';
import { AcademyGuide } from '@/components/AcademyGuide';

// ── §4.3 Academy × Marketplace section ───────────────────────────────────────

const XP_FIRST_PUBLISH = 500;
const XP_FIRST_PURCHASE = 150;
const XP_TUTORIAL_READ  = 100;

const TUTORIAL_STEPS = [
  { icon: '📋', title: 'Define your strategy', desc: 'Name, type (Grid/DCA/Martingale), risk level and tags' },
  { icon: '💻', title: 'Write your configuration', desc: 'Use JSON to define entry/exit conditions and parameters' },
  { icon: '🔬', title: 'Run a backtest', desc: 'Validate performance: must be ≥50% win rate & ≤30% drawdown' },
  { icon: '💰', title: 'Set your price', desc: 'Free to 2,500 CP. You earn 80% of every sale' },
  { icon: '🚀', title: 'Submit for review', desc: 'Admins review within 24–48h. Once approved you earn from every sale!' },
];

function AcademyMarketplaceSection({ totalXP, awardXP }: { totalXP: number; awardXP: (id: string, xp: number) => void }) {
  const navigate = useNavigate();
  const strategies = useStrategyStore(s => s.strategies);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialXPClaimed, setTutorialXPClaimed] = useState(false);

  // Pick "strategy of the week" — best rated published strategy
  const sotw = useMemo(() =>
    Object.values(strategies)
      .filter(s => s.isPublished)
      .sort((a, b) => b.rating - a.rating || b.totalSales - a.totalSales)[0] ?? null,
    [strategies]
  );

  const handleTutorialComplete = () => {
    if (!tutorialXPClaimed) {
      awardXP('mkt_tutorial', XP_TUTORIAL_READ);
      setTutorialXPClaimed(true);
    }
  };

  return (
    <div className="space-y-4">
      {/* §4.3.1 Strategy of the Week */}
      {sotw && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-lg">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border"
            style={{ background: 'linear-gradient(135deg,rgba(255,215,0,0.08),transparent)' }}>
            <Sparkles className="h-4 w-4 text-yellow-400" />
            <span className="font-bold text-sm">Strategy of the Week</span>
            <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}>
              ⭐ Featured
            </span>
          </div>
          <div className="flex items-center gap-4 p-5">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
              style={{ background: 'rgba(255,215,0,0.10)', border: '1px solid rgba(255,215,0,0.18)' }}>
              📊
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-foreground truncate">{sotw.name}</p>
              <p className="text-xs text-muted-foreground">by {sotw.creatorName}</p>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="flex items-center gap-1 text-xs text-yellow-400">
                  <Star className="h-3 w-3 fill-yellow-400" /> {sotw.rating.toFixed(1)}
                </span>
                <span className="text-xs text-muted-foreground">WR: {sotw.winRate.toFixed(1)}%</span>
                <span className="text-xs text-muted-foreground">+{sotw.totalProfitPct.toFixed(1)}% return</span>
                <span className="text-xs font-bold" style={{ color: sotw.isFree ? '#34d399' : '#FFD700' }}>
                  {sotw.isFree ? 'FREE' : `${sotw.price.toLocaleString()} CP`}
                </span>
              </div>
            </div>
            <button
              onClick={() => navigate(`/marketplace/${sotw.id}`)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold shrink-0 transition-all"
              style={{ background: 'rgba(255,215,0,0.10)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.20)' }}
            >
              <ShoppingBag className="h-4 w-4" /> View
            </button>
          </div>
        </div>
      )}

      {/* §4.3.2 Publish tutorial + XP reward */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">How to Publish a Strategy</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)' }}>
              +{XP_TUTORIAL_READ} XP
            </span>
            <button
              onClick={() => { setShowTutorial(v => !v); if (!showTutorial) handleTutorialComplete(); }}
              className="text-xs font-semibold text-primary"
            >
              {showTutorial ? 'Collapse' : 'Read Guide →'}
            </button>
          </div>
        </div>

        {showTutorial && (
          <div className="p-5 space-y-3">
            {TUTORIAL_STEPS.map((step, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card/50">
                <span className="text-xl shrink-0">{step.icon}</span>
                <div>
                  <p className="font-semibold text-sm">
                    <span className="text-muted-foreground mr-2">Step {i + 1}.</span>{step.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between p-3 rounded-xl"
              style={{ background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.15)' }}>
              <div>
                <p className="font-bold text-sm" style={{ color: '#FFD700' }}>🎉 First Strategy Published</p>
                <p className="text-xs text-muted-foreground">Earn {XP_FIRST_PUBLISH} XP when your first strategy gets approved</p>
              </div>
              <span className="font-bold text-sm" style={{ color: '#FFD700' }}>+{XP_FIRST_PUBLISH} XP</span>
            </div>

            <button
              onClick={() => navigate('/marketplace/create')}
              className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
              style={{ background: 'linear-gradient(135deg,#FFD700,#FFA800)', color: '#0A1929' }}
            >
              <ShoppingBag className="h-4 w-4" /> Start Creating Your Strategy
            </button>
          </div>
        )}
      </div>

      {/* §4.3.3 XP milestones for marketplace activity */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <p className="font-bold text-sm mb-3 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" /> Marketplace XP Rewards
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'First Purchase', xp: XP_FIRST_PURCHASE, emoji: '🛒' },
            { label: 'Tutorial Read',  xp: XP_TUTORIAL_READ,  emoji: '📚' },
            { label: 'First Publish',  xp: XP_FIRST_PUBLISH,  emoji: '🚀' },
            { label: 'First Review',   xp: 50,                 emoji: '⭐' },
          ].map(r => (
            <div key={r.label} className="flex flex-col items-center gap-1 p-3 rounded-xl border border-border text-center">
              <span className="text-xl">{r.emoji}</span>
              <span className="text-[10px] text-muted-foreground">{r.label}</span>
              <span className="text-xs font-bold text-primary">+{r.xp} XP</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
}

export interface Lesson {
  id: string;
  title: string;
  content: string;
  quiz: QuizQuestion;
}

export interface Module {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  xp: number;
  cp: number;
  lessons: Lesson[];
  requiredXP: number;
}

export const MODULES: Module[] = [
  {
    id: 'blockchain-basics',
    title: 'Blockchain Basics',
    description: 'Understand the foundational technology powering all cryptocurrencies.',
    icon: Shield,
    color: 'from-blue-500/20 to-cyan-500/10',
    xp: 500,
    cp: 30,
    requiredXP: 0,
    lessons: [
      {
        id: 'l1', title: 'What is a Blockchain?',
        content: 'A blockchain is a distributed ledger — a chain of blocks, each containing transaction data. No single entity controls it. Once data is written, it cannot be altered without consensus from the network. This immutability is what gives Bitcoin and other cryptocurrencies their trustless security.',
        quiz: { question: 'What makes blockchain data immutable?', options: ['A central server protects it', 'Network consensus and cryptographic hashing', 'Government regulation', 'The blockchain company controls it'], correct: 1, explanation: 'Blockchain data is secured through cryptographic hashing and requires network-wide consensus to alter, making it nearly impossible to tamper with.' }
      },
      {
        id: 'l2', title: 'How Mining Works',
        content: 'Mining is the process of validating new transactions and adding them to the blockchain. Miners compete to solve a cryptographic puzzle (Proof of Work). The winner adds the next block and receives a block reward. This process is energy-intensive by design — it makes attacks economically prohibitive.',
        quiz: { question: 'What do miners receive for successfully adding a block?', options: ['Government subsidy', 'Block reward (new coins + fees)', 'Access to private keys', 'A faster internet connection'], correct: 1, explanation: 'Miners earn newly minted cryptocurrency plus transaction fees from all transactions included in their block — this is their economic incentive.' }
      },
      {
        id: 'l3', title: 'Public & Private Keys',
        content: 'Every wallet has a public key (your address, safe to share) and a private key (your secret, never share). The private key signs transactions to prove ownership. If you lose your private key, you lose access forever. "Not your keys, not your coins" is the golden rule of self-custody.',
        quiz: { question: 'Which key should NEVER be shared?', options: ['Public key', 'Both keys', 'Private key', 'Wallet address'], correct: 2, explanation: 'Your private key is the master password to your funds. Anyone with it can move your crypto. Your public key/address is safe to share — it\'s how others send you funds.' }
      },
    ]
  },
  {
    id: 'market-analysis',
    title: 'Market Analysis',
    description: 'Read charts, identify trends and make data-driven trading decisions.',
    icon: TrendingUp,
    color: 'from-green-500/20 to-emerald-500/10',
    xp: 750,
    cp: 30,
    requiredXP: 500,
    lessons: [
      {
        id: 'l4', title: 'Reading Candlestick Charts',
        content: 'Each candle shows 4 prices: Open, High, Low, Close. A green candle means price closed higher than it opened (bullish). A red candle means it closed lower (bearish). The wicks show the full range of price movement. Patterns like Doji, Hammer, and Engulfing are signals traders use to predict reversals.',
        quiz: { question: 'What does a long lower wick on a candle suggest?', options: ['Strong selling pressure', 'Buyers rejected lower prices — bullish signal', 'Price did not move', 'High trading volume'], correct: 1, explanation: 'A long lower wick means sellers pushed price down significantly, but buyers stepped in and pushed it back up — a sign of buyer strength at that level.' }
      },
      {
        id: 'l5', title: 'Support & Resistance',
        content: 'Support is a price level where buying pressure historically exceeds selling — price tends to bounce. Resistance is the opposite — where selling pressure dominates. When price breaks through resistance, that level often becomes new support. These zones are the backbone of most trading strategies.',
        quiz: { question: 'What happens when price breaks through a resistance level?', options: ['The market crashes', 'Resistance often becomes new support', 'Trading volume drops to zero', 'The exchange halts trading'], correct: 1, explanation: 'When price breaks a resistance level, market psychology shifts — that price that was once a ceiling now acts as a floor (support), as traders view it as a fair value zone.' }
      },
      {
        id: 'l6', title: 'RSI & MACD Indicators',
        content: 'RSI (Relative Strength Index) measures momentum on a 0-100 scale. Above 70 = overbought (potential sell signal). Below 30 = oversold (potential buy signal). MACD shows the relationship between two moving averages — a MACD line crossing above the signal line is bullish. These are confirmation tools, not standalone signals.',
        quiz: { question: 'An RSI reading of 25 suggests the asset is...', options: ['Overbought', 'Oversold — a potential buying opportunity', 'At fair value', 'About to crash'], correct: 1, explanation: 'RSI below 30 indicates oversold conditions — the asset may have been sold too aggressively and could be due for a reversal upward. Always confirm with other signals.' }
      },
    ]
  },
  {
    id: 'risk-management',
    title: 'Risk Management',
    description: 'Protect your capital with stop-losses, position sizing and leverage rules.',
    icon: BarChart2,
    color: 'from-orange-500/20 to-red-500/10',
    xp: 1000,
    requiredXP: 1250,
    lessons: [
      {
        id: 'l7', title: 'The 1% Rule',
        content: 'Never risk more than 1-2% of your total capital on a single trade. With $10,000, that means your maximum loss per trade is $100-$200. This sounds small, but it means you can absorb 50+ consecutive losses before going broke — giving your strategy time to prove itself. Professional traders live by this rule.',
        quiz: { question: 'With $50,000 capital, the max 1% risk per trade is?', options: ['$5,000', '$500', '$50', '$5'], correct: 1, explanation: '1% of $50,000 is $500. This means your stop-loss should be placed such that if hit, you lose no more than $500 on that position.' }
      },
      {
        id: 'l8', title: 'Leverage: A Double-Edged Sword',
        content: '10x leverage on $1,000 controls $10,000 of BTC. A 10% move in your favor = $1,000 profit (100% return). But a 10% move against you = $1,000 loss (liquidation). High leverage amplifies both wins and losses symmetrically. The higher the leverage, the smaller the price move needed to wipe you out. Start with 2-3x maximum.',
        quiz: { question: 'At 20x leverage, what % price move causes liquidation?', options: ['20%', '5%', '50%', '1%'], correct: 1, explanation: 'At 20x leverage, a 5% adverse price move will liquidate your position (1/20 = 5%). This is why extreme leverage is extremely dangerous.' }
      },
      {
        id: 'l9', title: 'Stop-Loss Strategies',
        content: 'A stop-loss is an automatic order to sell when price reaches a certain level — it caps your loss. Always set it before entering a trade, never move it further against you. Common placements: below the recent swing low (for longs), above the swing high (for shorts). The distance from entry to stop-loss defines your actual risk per trade.',
        quiz: { question: 'When should you set your stop-loss?', options: ['After the trade goes against you', 'Before entering the trade', 'When you feel worried', 'Stop-losses are optional'], correct: 1, explanation: 'Stop-losses must be set BEFORE entering a trade. Setting them after introduces emotional bias — you\'ll tend to move them further away instead of cutting losses early.' }
      },
    ]
  },
  {
    id: 'defi-advanced',
    title: 'DeFi & Advanced',
    description: 'Dive into DeFi protocols, yield farming, and advanced on-chain strategies.',
    icon: Zap,
    color: 'from-purple-500/20 to-pink-500/10',
    xp: 1500,
    requiredXP: 2250,
    lessons: [
      {
        id: 'l10', title: 'What is DeFi?',
        content: 'Decentralized Finance (DeFi) replaces traditional financial intermediaries (banks, brokers) with smart contracts on a blockchain. You can lend, borrow, trade, and earn yield without a bank account or credit check. Total Value Locked (TVL) in DeFi protocols has reached hundreds of billions of dollars, representing an entirely parallel financial system.',
        quiz: { question: 'What do smart contracts replace in DeFi?', options: ['Cryptocurrencies', 'Traditional financial intermediaries like banks', 'The internet', 'Government currency'], correct: 1, explanation: 'Smart contracts are self-executing programs on the blockchain that automate financial agreements — eliminating the need for banks, brokers, and other intermediaries.' }
      },
      { id: 'l11', title: 'Liquidity Pools & AMMs', content: 'Automated Market Makers (AMMs) use liquidity pools instead of order books. Providers deposit token pairs and earn fees from every swap. Price is determined by a formula (e.g., x*y=k). Impermanent loss occurs when token ratios shift — your LP position may be worth less than simply holding the tokens separately.', quiz: { question: 'What is impermanent loss?', options: ['Losing your private key', 'LP value loss due to token ratio shifts vs. holding', 'Exchange hack losses', 'Gas fee accumulation'], correct: 1, explanation: 'Impermanent loss happens when the price ratio of your deposited tokens changes after you provide liquidity. If BTC doubles vs ETH, you\'d have been better off just holding.' } },
      { id: 'l12', title: 'Yield Farming Strategies', content: 'Yield farming involves maximizing returns by moving capital between DeFi protocols. Strategies include: providing liquidity for fee income, staking governance tokens for additional rewards, leveraged farming (borrowing to farm with more capital), and auto-compounding vaults that reinvest rewards automatically. Always assess smart contract risk.', quiz: { question: 'What is auto-compounding in yield farming?', options: ['Manually claiming rewards daily', 'Automatic reinvestment of earned rewards to maximize APY', 'A government tax strategy', 'Staking in government bonds'], correct: 1, explanation: 'Auto-compounding vaults automatically reinvest your earned rewards back into the farming strategy, applying compound interest continuously to maximize your Annual Percentage Yield.' } },
    ]
  },
  {
    id: 'backtest-101',
    title: 'Backtest 101',
    description: 'Learn what backtesting is, how to read metrics, choose the right strategy, and go from simulation to real trading.',
    icon: FlaskConical,
    color: 'from-orange-500/20 to-amber-500/10',
    xp: 800,
    requiredXP: 2250,
    lessons: [
      {
        id: 'l13', title: 'What is a Backtest?',
        content: 'A backtest simulates how a trading strategy would have performed on historical market data. CryptoVerse HQ generates synthetic price data using Geometric Brownian Motion — statistically realistic candle sequences. Every backtest is deterministic: the same coin + date range + strategy always produces identical results, so you can confidently compare strategy variants.',
        quiz: { question: 'What is the primary purpose of a backtest?', options: ['To make guaranteed profits', 'To evaluate a strategy on historical data before risking real money', 'To predict exact future prices', 'To replace a trading simulator'], correct: 1, explanation: 'Backtesting lets you test a strategy against historical data to see how it would have performed, without risking any real capital.' }
      },
      {
        id: 'l14', title: 'How to Read Indicators',
        content: 'Win Rate: The percentage of trades that were profitable. Above 50% is generally good. Profit Factor: Total profit of winning trades divided by total loss of losing trades. Above 1.5 is good. Sharpe Ratio: Measures return per unit of risk. Above 1 is acceptable, above 2 is excellent. Max Drawdown: The biggest peak-to-trough decline. Keep it under 30%. No single metric tells the full story — always evaluate them together.',
        quiz: { question: 'What does a Sharpe ratio of 2.0 indicate?', options: ['High risk', '2 units of return per unit of risk', 'The strategy is broken', 'The market is crashing'], correct: 1, explanation: 'Sharpe ratio of 2.0 means the strategy returns 2 units of profit for every 1 unit of risk. It is considered an excellent risk-adjusted return.' }
      },
      {
        id: 'l15', title: 'Choosing the Right Strategy',
        content: 'Different strategies suit different market conditions. Grid trading works best in ranging (sideways) markets. DCA works in volatile markets — it automatically buys more as price drops. Martingale recovers losses by increasing position size after each loss — high risk, high reward. Use the optimizer tab to automatically test thousands of parameter combinations.',
        quiz: { question: 'Which strategy type is best for a sideways market?', options: ['Martingale', 'Grid trading', 'DCA', 'All equally'], correct: 1, explanation: 'Grid trading is designed for ranging markets — it places buy and sell orders at predetermined levels within a price corridor.' }
      },
      {
        id: 'l16', title: 'From Backtest to Real Trading',
        content: 'A winning backtest doesn\'t guarantee future profits — it only proves the strategy worked on past data. Validate by running on multiple time frames and coins (cross-validation). Then deploy in the Live Simulator (paper trade) for at least a month. Only after consistent simulator profits should you consider real trading. Always use stop-losses and risk no more than 1-2% per trade.',
        quiz: { question: 'What should you do AFTER a successful backtest?', options: ['Immediately invest all capital', 'Paper trade in the simulator for at least a month', 'Ignore the results', 'Double the leverage'], correct: 1, explanation: 'A successful backtest is step one. You must forward-test (paper trade) the strategy in live market conditions to confirm it works before risking real capital.' }
      },
    ]
  },
  {
    id: 'nft-fundamentals',
    title: 'NFT Fundamentals',
    description: 'Master NFTs: valuation, rarity, trading strategies and market analysis.',
    icon: Gem,
    color: 'from-pink-500/20 to-rose-500/10',
    xp: 600,
    requiredXP: 1250,
    lessons: [
      {
        id: 'l17', title: 'What Are NFTs?',
        content: 'NFT stands for Non-Fungible Token — a unique digital asset verified on the blockchain. Unlike Bitcoin or Ethereum where every unit is identical, each NFT has distinct properties that make it one-of-a-kind. NFTs can represent digital art, collectibles, virtual land, game items, music rights, and more. They solve the digital ownership problem: before NFTs, you could copy a digital file infinitely. With NFTs, ownership is cryptographically proven on-chain. Collections like Bored Ape Yacht Club and CryptoPunks have sold for millions, establishing NFTs as a new asset class.',
        quiz: { question: 'What problem do NFTs primarily solve?', options: ['Slow internet speeds', 'Digital ownership and authenticity verification', 'Energy consumption', 'File compression'], correct: 1, explanation: 'NFTs provide cryptographic proof of ownership and authenticity for digital assets, solving the problem of proving who owns a unique digital item.' }
      },
      {
        id: 'l18', title: 'How to Value NFTs',
        content: 'NFT valuation depends on five key factors: Rarity (how unique are its traits?), Utility (what can you do with it — game use, access, staking?), Community (how strong and engaged is the holder community?), Creator (who made it and what is their reputation?), and Market Data (floor price trend, volume, holder distribution). CryptoVerse analyzes all five dimensions using real marketplace data from OpenSea, Blur, and other platforms. Rarity is calculated by trait prevalence — a trait shared by only 1% of the collection is highly valuable.',
        quiz: { question: 'Which of these is NOT a key NFT valuation factor?', options: ['Rarity of traits', 'Gas fees on the network', 'Creator reputation', 'Community strength'], correct: 1, explanation: 'While gas fees affect transaction costs, they are not a valuation factor for the NFT itself. Rarity, creator reputation, and community strength all directly impact an NFT\'s market value.' }
      },
      {
        id: 'l19', title: 'NFT Trading Strategies',
        content: 'Three common approaches: Floor sweeping (buy the cheapest listed NFTs when a collection is undervalued), Rarity hunting (buy underpriced rare NFTs before the market prices them correctly), and Trend trading (buy collections gaining volume and community momentum, sell when hype peaks). CryptoVerse\'s Trading Simulator lets you practice all three with $50,000 in virtual funds. Key rules: never FOMO buy at peaks, always check the holder distribution (too concentrated = risk of coordinated dumps), and set profit targets before entering.',
        quiz: { question: 'What is "floor sweeping"?', options: ['Cleaning your computer', 'Buying the cheapest listed NFTs in an undervalued collection', 'Selling all NFTs at once', 'A blockchain cleaning process'], correct: 1, explanation: 'Floor sweeping is a strategy where traders buy up the cheapest (floor-priced) NFTs in a collection they believe is undervalued, expecting the floor to rise as supply decreases.' }
      },
      {
        id: 'l20', title: 'NFT Market Analysis',
        content: 'Track three core metrics: Floor price (lowest listed price — your entry benchmark), Volume (24h/7d trading activity — higher = more liquid), and Unique holders (how many wallets own the collection — more = healthier distribution). CryptoVerse HQ tracks these across 6 marketplaces with real-time alerts. Whale activity (large wallet movements) often precedes major price moves: when a whale with a strong track record starts accumulating, it is a bullish signal. Always cross-reference on-chain data with marketplace data before making decisions.',
        quiz: { question: 'Why is a high number of unique holders a positive signal?', options: ['It looks better on social media', 'Healthier distribution means less risk of coordinated sell-offs', 'More holders means higher gas fees', 'It guarantees price increases'], correct: 1, explanation: 'A broad holder distribution reduces the risk that a single whale or small group can crash the floor price by dumping many NFTs at once.' }
      },
    ]
  },
  {
    id: 'onchain-analysis',
    title: 'On-Chain Analysis',
    description: 'Master blockchain data analysis: whale tracking, smart money, exchange flows and on-chain signals for trading.',
    icon: Globe,
    color: 'from-violet-500/20 to-indigo-500/10',
    xp: 1000,
    requiredXP: 2250,
    lessons: [
      {
        id: 'l21', title: 'What is On-Chain Analysis?',
        content: 'On-chain analysis examines blockchain data directly -- transactions, wallet activity, and fund flows -- to understand market sentiment, whale behavior, and capital movement. Unlike price charts which show what happened, on-chain data reveals what money is actually doing in real-time across Ethereum, Bitcoin, BNB Chain, Solana, and Polygon. Key metrics include whale transactions, smart money wallet performance, and exchange inflows/outflows.',
        quiz: { question: 'What advantage does on-chain data have over price charts?', options: ['It predicts exact future prices', 'It shows capital movement in real-time before price reflects it', 'It guarantees profitable trades', 'It replaces technical analysis'], correct: 1, explanation: 'On-chain data is a leading indicator -- it shows where capital is moving in real-time, often before those moves are reflected in price charts.' }
      },
      {
        id: 'l22', title: 'Understanding Whale Activity',
        content: 'Whales are wallets holding or moving large amounts of crypto (typically $1M+ per transaction). When a whale moves $5M+ in a single transaction, it often signals an upcoming market move. Key patterns: large exchange deposits often precede selling (bearish), large withdrawals suggest accumulation (bullish), and wallet-to-wallet transfers may indicate OTC deals. CryptoVerse HQ tracks whales across 5 blockchains with real-time alerts.',
        quiz: { question: 'What does a large exchange deposit by a whale typically signal?', options: ['Bullish -- price will rise', 'Bearish -- whale may be preparing to sell', 'Nothing -- it is random', 'New exchange listing'], correct: 1, explanation: 'When whales move large amounts to an exchange, they often intend to sell. This creates selling pressure and can signal a local price top.' }
      },
      {
        id: 'l19', title: 'Smart Money Tracking',
        content: 'Smart money wallets belong to consistently profitable traders and institutions. CryptoVerse identifies these wallets using metrics like win rate (80%+ is excellent), total PnL, Sharpe ratio, and trade consistency. Following their moves can give you an edge -- if multiple smart wallets with high win rates are buying the same token, it may be worth investigating. The Smart Money table ranks top wallets across all chains.',
        quiz: { question: 'What win rate qualifies a wallet as smart money?', options: ['50%+', '70%+ with high trade consistency', '30%+', 'Any win rate'], correct: 1, explanation: 'Smart money wallets typically maintain 70%+ win rates with consistent profitability and low drawdowns, making their moves worth tracking.' }
      },
      {
        id: 'l20', title: 'Exchange Flow Analysis',
        content: 'Exchange flows measure how much crypto moves into or out of centralized exchanges. High inflows typically mean selling pressure (bearish -- users deposit to sell), while high outflows suggest accumulation and holding (bullish -- users withdraw to cold storage). Net flow (inflow minus outflow) is a powerful sentiment indicator. When combined with whale alerts, exchange flows provide a comprehensive view of market dynamics.',
        quiz: { question: 'High exchange outflows typically indicate what market sentiment?', options: ['Bearish -- users are selling', 'Bullish -- users are withdrawing to hold long-term', 'Neutral -- no information', 'Exchange is being hacked'], correct: 1, explanation: 'When large amounts flow out of exchanges, it suggests users are moving crypto to cold storage for long-term holding -- a bullish signal.' }
      },
      {
        id: 'l21', title: 'Using On-Chain Data for Trading',
        content: 'Combine on-chain signals with technical analysis for higher-confidence entries: 1) Set whale alerts for your tracked chains. 2) Watch for clusters of exchange inflows or outflows. 3) Track smart money wallets to see what they are buying. 4) Use trending tokens with high whale activity for momentum plays. 5) Cross-reference with market sentiment analysis. Remember: no single signal is enough -- always confirm with multiple data sources before trading.',
        quiz: { question: 'What is the best approach to using on-chain signals?', options: ['Use only on-chain data', 'Combine with technical analysis and market sentiment', 'Ignore on-chain data completely', 'Only track one whale wallet'], correct: 1, explanation: 'The most reliable approach combines on-chain signals with technical analysis and market sentiment -- no single data source tells the complete story.' }
      },
    ]
  },
  {
    id: 'sentiment-analysis',
    title: 'Sentiment Analysis',
    description: 'Master market psychology: Fear & Greed Index, social media sentiment, news analysis and trading signals.',
    icon: TrendingUp,
    color: 'from-amber-500/20 to-yellow-500/10',
    xp: 1000,
    requiredXP: 2250,
    lessons: [
      { id: 'l26', title: 'What is Sentiment Analysis?', content: 'Sentiment analysis measures the overall mood of the crypto market by analyzing social media, news, and community discussions. Scores range from 0-100 across 8 major cryptocurrencies in real-time.', quiz: { question: 'A sentiment score of 85 indicates what?', options: ['Extreme Fear', 'Neutral', 'Extreme Greed / Bullish', 'Market closed'], correct: 2, explanation: 'Scores above 75 indicate Extreme Greed -- market may be overbought and due for a correction.' } },
      { id: 'l27', title: 'Fear & Greed Index', content: 'The Fear & Greed Index (0-100): below 25 = Extreme Fear (buying opportunity), 26-40 = Fear, 41-60 = Neutral, 61-75 = Greed, 76-100 = Extreme Greed (selling signal). Warren Buffett: "Be fearful when others are greedy, and greedy when others are fearful."', quiz: { question: 'Best time to buy per Fear & Greed?', options: ['Extreme Greed (76-100)', 'Neutral (41-60)', 'Extreme Fear (0-25)', 'Greed (61-75)'], correct: 2, explanation: 'Extreme Fear often presents buying opportunities as markets overreact to negative news, creating discounts.' } },
      { id: 'l28', title: 'Social Media Sentiment', content: 'Social media platforms generate massive crypto discussion. High volume + negative sentiment can signal a local bottom. Excessive hype often precedes a correction. Filter by platform (Twitter/X, Reddit, Telegram) and symbol.', quiz: { question: 'Excessive social media hype indicates what?', options: ['Great buying opportunity', 'Potential market top or correction', 'Nothing', 'Flat market'], correct: 1, explanation: 'When social media is excessively excited about a coin, most buyers are already in -- leaving few new buyers to push prices higher.' } },
      { id: 'l29', title: 'News Sentiment Analysis', content: 'Crypto news moves markets. Pay attention to news clusters -- multiple bullish articles about the same coin often precede price rallies. The News tab shows headlines with AI-assigned sentiment labels (Bullish/Bearish/Neutral).', quiz: { question: 'What to look for in news sentiment?', options: ['Only positive news', 'News clusters with similar sentiment', 'Ignore all news', 'Only Bitcoin headlines'], correct: 1, explanation: 'News clusters with consistent sentiment direction are more reliable signals than isolated headlines.' } },
      { id: 'l30', title: 'Using Sentiment for Trading', content: '1) Check F&G gauge before every trade. 2) Look for price-sentiment divergence. 3) Set sentiment alerts for Extreme Fear/Greed. 4) Cross-reference social and news sentiment. 5) Combine with technical analysis and on-chain data for highest confidence.', quiz: { question: 'Should you rely on sentiment alone for trading?', options: ['Yes, it is all you need', 'No -- combine with technical analysis and on-chain data', 'Only for Bitcoin', 'Sentiment is useless'], correct: 1, explanation: 'Sentiment is a powerful tool but is most effective when combined with technical analysis and on-chain data for confirmation.' } },
    ]
  },
  {
    id: 'live-events',
    title: 'Live Events & Competitions',
    description: 'Compete in trading competitions, team battles, webinars and win real rewards.',
    icon: Trophy,
    color: 'from-purple-500/20 to-amber-500/10',
    xp: 1000,
    requiredXP: 2250,
    lessons: [
      { id: 'l31', title: 'What are Live Events?', content: 'CryptoVerse Events are live competitions, webinars, and challenges where you compete against other traders, learn from experts, and win CP coins, XP, badges, and virtual cash. Events run on a schedule -- some are weekend-long, others are quick 2-hour flash challenges.', quiz: { question: 'What rewards can you win from Events?', options: ['Only XP', 'CP coins, XP, badges, and virtual cash', 'Only virtual cash', 'Nothing'], correct: 1, explanation: 'Events offer CP coins, Academy XP, exclusive badges, and virtual cash for your simulator account.' } },
      { id: 'l32', title: 'Trading Competitions', content: 'Weekend Warrior (48-hour) and Monthly Championship (30-day) competitions track your trading PnL, win rate, and volume. Top performers win tiered prizes. Entry is usually free, and your simulator trades are automatically tracked during the event.', quiz: { question: 'What metrics are tracked in trading competitions?', options: ['Only PnL', 'PnL, win rate, and volume', 'Only trade count', 'Account balance'], correct: 1, explanation: 'Competitions track your PnL, win rate, and trading volume to determine rankings.' } },
      { id: 'l33', title: 'Team Battles', content: 'Team Battles pit groups of traders against each other. Join or create a team, coordinate via event chat, and compete for team prizes. Team performance is the sum of all member PnLs.', quiz: { question: 'How is team performance calculated?', options: ['Only the captain counts', 'Sum of all member PnLs', 'Average win rate', 'Total trade count'], correct: 1, explanation: 'Team performance equals the combined PnL of all team members.' } },
      { id: 'l34', title: 'Live Webinars', content: 'Live Webinars feature expert speakers covering trading strategies, market analysis, and crypto fundamentals. Tune in at the scheduled time, participate in Q&A, and earn XP just for attending.', quiz: { question: 'What do Live Webinars feature?', options: ['Only slides', 'Expert speakers with Q&A sessions', 'Only pre-recorded videos', 'Automated bots'], correct: 1, explanation: 'Live Webinars feature expert speakers who present and answer your questions in real-time.' } },
      { id: 'l35', title: 'How to Win Events', content: '1) Check the Events Dashboard regularly for new competitions. 2) Prepare before the event starts. 3) Trade consistently during the event period. 4) Monitor the live leaderboard to track your position. 5) Team up with strong traders for team battles.', quiz: { question: 'What is the best strategy for winning events?', options: ['Trade only once', 'Trade consistently and monitor the leaderboard', 'Wait until the last hour', 'Only join team battles'], correct: 1, explanation: 'Consistent trading throughout the event period and monitoring your leaderboard position gives you the best chance to win.' } },
    ]
  },
  {
    id: 'real-exchange',
    title: 'Real Exchange Trading',
    description: 'Connect real exchange accounts, manage your portfolio, execute live trades and deploy automated strategies.',
    icon: Link2,
    color: 'from-blue-500/20 to-cyan-500/10',
    xp: 1000,
    requiredXP: 2250,
    lessons: [
      { id: 'l36', title: 'What is Real Exchange Trading?', content: 'Real Exchange Trading connects your actual exchange accounts (Binance, Coinbase, Kraken, OKX) to CryptoVerse, allowing you to manage your real portfolio, execute trades, and deploy strategies from one platform. This requires Academy Level 10+ because real money is involved.', quiz: { question: 'Why does Real Exchange require Level 10+?', options: ['It is just for fun', 'Real funds are involved -- you need experience first', 'The app is slow', 'Exchanges require it'], correct: 1, explanation: 'The Level 10+ requirement ensures you have enough trading knowledge before risking real funds.' } },
      { id: 'l37', title: 'API Keys and Security', content: 'API keys allow programmatic access to your exchange. Always create a dedicated key with ONLY Read and Trade permissions -- NEVER enable Withdraw. CryptoVerse masks your keys and uses HTTPS encryption. Revoke keys immediately if compromised.', quiz: { question: 'Which permission should you NEVER enable on your API key?', options: ['Read', 'Trade', 'Withdraw', 'All are safe'], correct: 2, explanation: 'Withdraw permission allows funds to be moved out of your account. Never enable it for API keys used with third-party platforms.' } },
      { id: 'l38', title: 'Order Types and Execution', content: 'Three main order types: Market (executes immediately at current price), Limit (executes only at your specified price or better), and Stop-Limit (triggers a limit order when price reaches your stop price). Market orders are fastest but may slip. Limit orders give price control but may not fill.', quiz: { question: 'Which order type guarantees your price but not execution?', options: ['Market order', 'Limit order', 'Stop order', 'All orders'], correct: 1, explanation: 'Limit orders guarantee your price but may not execute if the market never reaches your specified price.' } },
      { id: 'l39', title: 'Risk Management', content: 'Configure these controls before trading real funds: Daily Loss Limit (stops all trading if exceeded), Max Position Size (caps single trade as % of portfolio), Max Leverage (prevents dangerous over-leveraging), and Stop-Loss Automatic. These are enforced at platform level and cannot be bypassed.', quiz: { question: 'What happens when you hit your Daily Loss Limit?', options: ['Nothing', 'All trading is stopped for the day', 'You get a warning', 'Leverage increases'], correct: 1, explanation: 'The Daily Loss Limit automatically stops all trading for the remainder of the day to prevent further losses.' } },
      { id: 'l40', title: 'Live Trading Strategies', content: '1) Start with small position sizes. 2) Always use stop-losses. 3) Deploy backtested bot strategies to automate trading. 4) Monitor your portfolio sync regularly. 5) Review trade history to learn from wins and losses. Never risk more than you can afford to lose.', quiz: { question: 'What should you do before deploying a bot strategy?', options: ['Deploy immediately', 'Backtest thoroughly and paper trade first', 'Use maximum leverage', 'Skip risk controls'], correct: 1, explanation: 'Always backtest and paper trade a strategy before deploying it to a real exchange with real funds.' } },
    ]
  },
  {
    id: 'nations-team-trading',
    title: 'Nations & Team Trading',
    description: 'Join nations, compete in faction wars, earn team-based rewards and master collaborative trading.',
    icon: Globe,
    color: 'from-purple-500/20 to-blue-500/10',
    xp: 1000,
    requiredXP: 2250,
    lessons: [
      { id: 'l41', title: 'What are Nations?', content: 'Nations are competitive teams of traders on CryptoVerse HQ. There are four nations: Alpha Republic (quant traders), Bull Empire (long-only optimists), Sigma Order (arbitrage traders), and Bear Collective (short sellers). Each nation has unique perks, stats, and a distinct trading philosophy.', quiz: { question: 'How many nations are there in CryptoVerse HQ?', options: ['2', '4', '6', '8'], correct: 1, explanation: 'CryptoVerse HQ has four nations: Alpha Republic, Bull Empire, Sigma Order, and Bear Collective.' } },
      { id: 'l42', title: 'Joining a Nation', content: 'Click Join on any nation card to become a member. You can only be in one nation at a time. There are no level restrictions — anyone can join any nation. Your nation appears on your profile and leaderboard entries.', quiz: { question: 'Can you join more than one nation?', options: ['Yes, you can join multiple', 'No, only one at a time', 'Only with premium', 'Only team battles allow multiple'], correct: 1, explanation: 'You can only be a member of one nation at a time. To switch, leave your current nation first.' } },
      { id: 'l43', title: 'Nation Perks and Benefits', content: 'Each nation offers unique benefits: Alpha Republic grants 5% daily XP boost and quant tools. Bull Empire provides position fee rebates and monthly tournaments. Sigma Order gives arbitrage scanners and flash tournament invites. Bear Collective offers volatility tools and short signal channels.', quiz: { question: 'Which nation offers a 5% daily XP boost?', options: ['Bull Empire', 'Alpha Republic', 'Sigma Order', 'Bear Collective'], correct: 1, explanation: 'Alpha Republic offers the highest XP boost (5% daily) along with exclusive quant tools.' } },
      { id: 'l44', title: 'Faction Wars', content: 'Faction Wars are periodic competitions where nations compete for dominance. Your trades automatically contribute War Points based on P&L, volume, and win streaks. The war countdown timer shows time remaining. Your nation ranking determines bragging rights and special event access.', quiz: { question: 'How do you contribute to Faction Wars?', options: ['By paying CP', 'By trading — P&L and volume earn War Points', 'By chatting', 'Only team captains can contribute'], correct: 1, explanation: 'Every trade with positive P&L contributes War Points to your nation automatically.' } },
      { id: 'l45', title: 'Team Trading Strategies', content: '1) Coordinate with nation members via nation chat. 2) Focus on win rate over volume for better War Point efficiency. 3) Build trading streaks for bonus War Points. 4) Diversify across assets to maximize team coverage. 5) Track nation leaderboard to adjust strategy mid-war.', quiz: { question: 'What is the most efficient way to earn War Points?', options: ['High volume only', 'High win rate with consistent streaks', 'Only long positions', 'Only short positions'], correct: 1, explanation: 'Consistent win streaks with high win rate earn the most efficient War Points for your nation.' } },
    ]
  },
  {
    id: 'ai-twin-trading',
    title: 'AI Twin Trading',
    description: 'Master AI-vs-AI trading competitions: create your twin, simulate matches, earn CP prizes and climb ELO rankings.',
    icon: BrainCircuit,
    color: 'from-violet-500/20 to-purple-500/10',
    xp: 1000,
    requiredXP: 2250,
    lessons: [
      { id: 'l46', title: 'What is AI Twin Trading?', content: 'Twin League is an AI-vs-AI trading competition where your personal AI Twin (created from your trading history) competes against other AI traders. Matches simulate real trading scenarios with CP stakes and prizes. Your twin learns from your trading patterns.', quiz: { question: 'What is your AI Twin based on?', options: ['Random AI', 'Your trading history and performance', 'Pre-built templates', 'Social media data'], correct: 1, explanation: 'Your AI Twin is automatically created from your trading data — win rate, PnL, and asset preferences all shape how your twin trades.' } },
      { id: 'l47', title: 'How Matches Work', content: 'Each match pairs your twin against an opponent AI with a specific rank and strategy. Click Simulate to run the match. You will see streaming progress, score comparisons, and a narrative explaining the outcome. Each match has a CP stake, and the winner takes the prize pool.', quiz: { question: 'What happens when you click Simulate?', options: ['Nothing', 'The match runs with streaming progress and scores', 'You trade manually', 'You pay real money'], correct: 1, explanation: 'Simulate runs the AI-vs-AI match, showing streaming progress text, score bars, and a narrative explaining why your twin won or lost.' } },
      { id: 'l48', title: 'CP Stakes and Prizes', content: 'Each match has a CP stake (250-1000 CP). Win and you earn the prize pool. Higher stakes mean tougher opponents with better AI strategies. Prizes are credited to your CP wallet automatically. Track your total CP earnings in the match history.', quiz: { question: 'What determines the opponent difficulty?', options: ['Random chance', 'Higher stakes mean tougher opponents', 'Your level', 'Time of day'], correct: 1, explanation: 'Higher CP stakes pair you against higher-ranked opponents with better AI strategies — risk and reward increase together.' } },
      { id: 'l49', title: 'ELO Ratings and Rankings', content: 'Your twin has an ELO rating (starting at 1200) that adjusts after each match. Win against higher-ranked opponents to gain more ELO points. Lose against lower-ranked opponents and lose more. Your ELO determines your global Twin League ranking.', quiz: { question: 'What is your starting ELO rating?', options: ['0', '1200', '2000', '500'], correct: 1, explanation: 'All new twins start at 1200 ELO. This rating adjusts up or down based on match outcomes and opponent strength.' } },
      { id: 'l50', title: 'Improving Your Twin', content: '1) Trade consistently in the simulator to improve your twin base stats. 2) Focus on win rate — your twin inherits your trading consistency. 3) Try different asset pairs to diversify strategies. 4) Review match narratives to learn from losses. 5) Aim for higher-stakes matches as your twin improves.', quiz: { question: 'How do you improve your AI Twin?', options: ['Pay CP', 'Trade consistently in the simulator', 'Wait for updates', 'Only by winning matches'], correct: 1, explanation: 'Your twin learns from your simulator trading — consistent profitable trading makes your twin smarter and more competitive.' } },
    ]
  },
];

type View = 'modules' | 'lesson' | 'quiz' | 'result';

export function Academy() {
  // Persistent XP + progress from Zustand store (P3-A)
  const { totalXP, completedLessons, awardXP, submitQuiz, generateCertificate, certificates } = useAcademyStore();

  // ── P1: Beginner education guide on first visit ──
  const ACADEMY_GUIDE_KEY = 'cv_academy_guide_dismissed';
  const [showGuide, setShowGuide] = useState(() => {
    try { return localStorage.getItem(ACADEMY_GUIDE_KEY) !== 'true'; } catch { return true; }
  });
  function dismissGuide() {
    try { localStorage.setItem(ACADEMY_GUIDE_KEY, 'true'); } catch {}
    setShowGuide(false);
  }

  const [activeModule, setActiveModule] = useState<Module | null>(null);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [view, setView] = useState<View>('modules');
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [xpGained, setXpGained] = useState(0);

  const levelInfo     = getLevelInfo(totalXP);
  const levelProgress = levelInfo.progress;

  const openLesson = (mod: Module, lesson: Lesson) => {
    setActiveModule(mod);
    setActiveLesson(lesson);
    setSelectedAnswer(null);
    setShowResult(false);
    setView('lesson');
  };

  const startQuiz = () => setView('quiz');

  const submitAnswer = (idx: number) => {
    if (showResult) return;
    setSelectedAnswer(idx);
    setShowResult(true);

    const correct = idx === activeLesson!.quiz.correct;
    const score = correct ? 100 : 0;

    // Record quiz attempt with best-score tracking
    void submitQuiz(activeLesson!.id, score);

    if (correct) {
      const gained = Math.floor(activeModule!.xp / activeModule!.lessons.length);
      const isFirstTime = !completedLessons.includes(activeLesson!.id);
      // awardXP is idempotent — safe to call; XP only added on first correct answer
      awardXP(activeLesson!.id, gained);
      setXpGained(isFirstTime ? gained : 0);
    } else {
      setXpGained(0);
    }
  };

  const goBackToModule = () => {
    setView('modules');
    setActiveModule(null);
    setActiveLesson(null);
  };

  // — QUIZ VIEW —
  if (view === 'quiz' && activeLesson) {
    const q = activeLesson.quiz;
    const isCorrect = selectedAnswer === q.correct;

    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <button onClick={() => setView('lesson')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm">
          <ChevronLeft className="h-4 w-4" /> Back to lesson
        </button>
        <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
          <div className="mb-8">
            <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Knowledge Check</p>
            <h3 className="text-xl font-bold">{q.question}</h3>
          </div>
          <div className="space-y-3">
            {q.options.map((opt, idx) => {
              const isSelected = selectedAnswer === idx;
              const isCorrectOpt = idx === q.correct;
              return (
                <button
                  key={idx}
                  onClick={() => submitAnswer(idx)}
                  disabled={showResult}
                  className={cn(
                    "w-full text-left p-4 rounded-xl border transition-all duration-300 text-sm font-medium",
                    !showResult && "hover:border-primary/50 hover:bg-primary/5",
                    !showResult && "bg-secondary/20 border-border",
                    showResult && isCorrectOpt && "bg-green-500/20 border-green-500/50 text-green-300",
                    showResult && isSelected && !isCorrectOpt && "bg-red-500/20 border-red-500/50 text-red-300",
                    showResult && !isSelected && !isCorrectOpt && "bg-secondary/10 border-border opacity-50"
                  )}
                >
                  <span className="flex items-center gap-3">
                    <span className={cn("w-6 h-6 rounded-full border flex items-center justify-center text-xs flex-shrink-0",
                      showResult && isCorrectOpt ? "border-green-500 text-green-400" : showResult && isSelected && !isCorrectOpt ? "border-red-500 text-red-400" : "border-border"
                    )}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    {opt}
                  </span>
                </button>
              );
            })}
          </div>

          {showResult && (
            <div className={cn("mt-6 p-4 rounded-xl border animate-in fade-in duration-300", isCorrect ? "bg-green-500/10 border-green-500/20" : "bg-orange-500/10 border-orange-500/20")}>
              <p className={cn("font-semibold mb-1", isCorrect ? "text-green-400" : "text-orange-400")}>
                {isCorrect ? `✓ Correct! ${xpGained > 0 ? `+${xpGained} XP earned!` : 'Already completed.'}` : '✗ Not quite — but you can learn from this.'}
              </p>
              <p className="text-sm text-muted-foreground">{q.explanation}</p>
              <button
                onClick={goBackToModule}
                className="mt-4 w-full bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-xl font-semibold transition-all active:scale-95"
              >
                Back to Modules
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // — LESSON VIEW —
  if (view === 'lesson' && activeLesson && activeModule) {
    const isDone = completedLessons.includes(activeLesson.id);
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <button onClick={goBackToModule} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm">
          <ChevronLeft className="h-4 w-4" /> Back to Modules
        </button>
        <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">{activeModule.title}</span>
            {isDone && <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full border border-green-500/20">✓ Completed</span>}
          </div>
          <h2 className="text-2xl font-bold mb-6">{activeLesson.title}</h2>
          <p className="text-muted-foreground leading-relaxed text-[15px]">{activeLesson.content}</p>

          {/* 9.3 — Backtest CTA: appears on market-analysis + risk-management modules */}
          {(activeModule.id === 'market-analysis' || activeModule.id === 'risk-management' || activeModule.id === 'defi-advanced' || activeModule.id === 'nft-fundamentals') && (
            <div className="mt-6 p-4 rounded-xl bg-primary/5 border border-primary/15 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                {activeModule.id === 'nft-fundamentals' ? <Gem className="h-4 w-4 text-primary" /> : <FlaskConical className="h-4 w-4 text-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-primary uppercase tracking-wide">
                  {activeModule.id === 'nft-fundamentals' ? 'Practice Challenge' : 'Backtest Challenge'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                  {activeModule.id === 'nft-fundamentals'
                    ? <>Try your skills in the NFT Trading Simulator with <strong className="text-foreground">$50,000 virtual funds</strong>.</>
                    : <>Apply what you've learned — run a real backtest and earn up to <strong className="text-foreground">+500 XP</strong>.</>}
                </p>
                <Link
                  to={activeModule.id === 'nft-fundamentals' ? '/nft/simulate' : '/backtest'}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/15 border border-primary/25 text-primary hover:bg-primary/25 transition-all"
                >
                  {activeModule.id === 'nft-fundamentals' ? <Gem className="h-3.5 w-3.5" /> : <FlaskConical className="h-3.5 w-3.5" />}
                  {activeModule.id === 'nft-fundamentals' ? 'Try NFT Trading Simulator' : 'Try this strategy in Backtest'}
                </Link>
              </div>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-border flex justify-end">
            <button
              onClick={startQuiz}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-3 rounded-xl font-semibold transition-all active:scale-95 shadow-lg shadow-primary/20"
            >
              Take Knowledge Check <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // — MODULES VIEW —
  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-primary/10 blur-3xl rounded-full pointer-events-none" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-3">
              <BookOpen className="h-6 w-6 text-primary" />
              CryptoVerse HQ Academy
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">Earn XP to unlock higher leverage tiers and exclusive rewards.</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Level</p>
              <p className="text-lg font-bold text-primary">{levelInfo.name}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Total XP</p>
              <p className="text-lg font-bold">{totalXP.toLocaleString()}</p>
            </div>
            <div className="w-32">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Progress</span>
                <span>{Math.round(levelProgress)}%</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-1000"
                  style={{ width: `${levelProgress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── AI Learning Path (Pro+) ── */}
      <section className="bg-card border border-border rounded-2xl p-6">
        <LearningPath />
      </section>

      {/* §4.3 Strategy of the Week + Create Tutorial + XP rewards */}
      <AcademyMarketplaceSection totalXP={totalXP} awardXP={awardXP} />

      {/* §P1: Academy beginner guide on first visit */}
      {showGuide && <AcademyGuide onDismiss={dismissGuide} />}

      {/* Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {MODULES.map((mod, idx) => {
          const userPlan = useAuthStore.getState().user?.plan ?? 'free';
          const freeLimited = userPlan === 'free' && idx >= 5;
          const isUnlocked = !freeLimited && totalXP >= mod.requiredXP;
          const completedCount = mod.lessons.filter(l => completedLessons.includes(l.id)).length;
          const progress = (completedCount / mod.lessons.length) * 100;
          const allDone = completedCount === mod.lessons.length;
          const cert = certificates.find(c => c.moduleId === mod.id) ?? null;
          const Icon = mod.icon;

          return (
            <div
              key={mod.id}
              className={cn(
                "relative bg-card border rounded-2xl overflow-hidden transition-all duration-300",
                isUnlocked
                  ? "border-border hover:border-primary/40 shadow-lg group cursor-pointer hover:-translate-y-1"
                  : "border-border opacity-60 cursor-not-allowed"
              )}
            >
              {/* Gradient bg */}
              <div className={cn("absolute inset-0 bg-gradient-to-br opacity-30 pointer-events-none", mod.color)} />

              {/* Progress bar */}
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-secondary/30">
                <div className="h-full bg-primary transition-all duration-700" style={{ width: `${progress}%` }} />
              </div>

              <div className="p-6 relative z-10">
                <div className="flex justify-between items-start mb-5">
                  <div className="p-3 bg-secondary/20 rounded-xl border border-border">
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-right">
                    {!isUnlocked ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-2.5 py-1 rounded-full">
                        <Lock className="h-3 w-3" />
                        {freeLimited ? 'Pro Plan Required' : `${mod.requiredXP.toLocaleString()} XP`}
                      </span>
                    ) : cert ? (
                      <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-2.5 py-1 rounded-full">
                        <Award className="h-3 w-3" /> Certified
                      </span>
                    ) : completedCount === mod.lessons.length ? (
                      <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-full">
                        <Award className="h-3 w-3" /> Complete
                      </span>
                    ) : (
                      <span className="text-xs text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full">
                        {completedCount}/{mod.lessons.length} done
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="text-lg font-bold mb-1">{mod.title}</h3>
                <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{mod.description}</p>

                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-semibold text-amber-500 flex items-center gap-1">
                    <Star className="h-4 w-4" /> +{mod.xp} XP
                  </span>
                  <span className="text-sm font-semibold text-emerald-400 flex items-center gap-1">
                    💰 +{mod.cp || mod.lessons.length * 10} CP
                  </span>
                </div>

                {/* Lesson List */}
                {isUnlocked && (
                  <div className="space-y-2">
                    {mod.lessons.map((lesson, idx) => {
                      const done = completedLessons.includes(lesson.id);
                      return (
                        <button
                          key={lesson.id}
                          onClick={() => openLesson(mod, lesson)}
                          className={cn(
                            "w-full text-left flex items-center gap-3 p-3 rounded-xl transition-all border text-sm",
                            done
                              ? "bg-green-500/10 border-green-500/20 hover:bg-green-500/20"
                              : "bg-secondary/20 border-border hover:bg-secondary/40 hover:border-border"
                          )}
                        >
                          {done
                            ? <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
                            : <PlayCircle className="h-4 w-4 text-primary/70 flex-shrink-0" />}
                          <span className={cn("flex-1", done ? "text-green-300" : "text-foreground")}>
                            {idx + 1}. {lesson.title}
                          </span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      );
                    })}

                    {/* Certificate generation */}
                    {allDone && !cert && (
                      <button
                        onClick={(e) => { e.stopPropagation(); generateCertificate(mod.id, mod.title, mod.lessons.map(l => l.id)); }}
                        className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 font-semibold text-sm hover:bg-yellow-500/25 transition-all active:scale-95"
                      >
                        <Award className="h-4 w-4" /> Generate Certificate
                      </button>
                    )}
                    {cert && (
                      <div className="mt-3 flex items-center gap-2 py-2.5 px-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
                        <Award className="h-4 w-4" /> Certificate earned — Score: {cert.score}%
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}