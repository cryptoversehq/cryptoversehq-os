/**
 * nftRarityCalculator.ts — §4.2 Rarity Score Calculator
 *
 * Implements the spec's RarityCalculator class logic as pure functions
 * so any component or engine can import them without coupling to React state.
 *
 * Algorithm:
 *   traitScore  = 100 × (1 − percentage/100)   (lower % → higher score)
 *   totalScore  = sum of all trait scores
 *   normalized  = totalScore / traitCount        (0–100 scale per-NFT)
 *
 * Collection ranking:
 *   1. Score every simulated NFT with its trait slot distribution
 *   2. Sort descending by score
 *   3. Assign rank (1 = rarest) and percentile
 *
 * Note: We never request the full on-chain metadata for every token (too slow).
 * Instead, we simulate each token's trait assignment using a seeded PRNG so
 * results are deterministic and consistent across page loads.
 */

import type { NFTCollection, NFTTrait, NFTTraitValue, RarityTier } from './nftTypes';
import { getRarityTier } from './nftTypes';

// ── Core trait types ──────────────────────────────────────────────────────────

/** A single trait (type + value) as reported by OpenSea / on-chain metadata. */
export interface TraitInput {
  type:  string;   // e.g. "Fur"
  value: string;   // e.g. "Solid Gold"
  count: number;   // how many NFTs in the collection have this exact trait value
}

/** Per-trait score breakdown for one NFT. */
export interface TraitScore {
  traitType:   string;
  traitValue:  string;
  percentage:  number;   // % of supply that has this trait value
  score:       number;   // individual contribution (0–100)
}

/** Full rarity result for one NFT. */
export interface RarityResult {
  score:       number;        // normalized 0–100 (higher = rarer)
  rank:        number;        // 1-based rank within collection (set after ranking)
  percentile:  number;        // 0–100 (set after ranking; lower = rarer)
  tier:        RarityTier;    // derived from score
  traitScores: TraitScore[];
}

/** Summary entry used during collection ranking. */
export interface ScoredToken {
  tokenId:    string;
  score:      number;
  rank:       number;
  percentile: number;
}

// ── PRNG ──────────────────────────────────────────────────────────────────────

function seededRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 4_294_967_296;
  };
}

function strHash(s: string): number {
  let h = 2_166_136_261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16_777_619); }
  return h >>> 0;
}

// ── §4.2 Core score calculator ────────────────────────────────────────────────

/**
 * calculateRarityScore
 *
 * Computes the rarity score for a single NFT given its trait list.
 * Mirrors the spec's RarityCalculator.calculateRarityScore() exactly.
 *
 * @param traits      - list of TraitInput (type + value + count)
 * @param totalSupply - total NFTs in the collection
 * @returns RarityResult with score + per-trait breakdown (rank/percentile = 0 until ranked)
 */
export function calculateRarityScore(traits: TraitInput[], totalSupply: number): RarityResult {
  if (traits.length === 0) {
    return { score: 0, rank: 0, percentile: 100, tier: 'common', traitScores: [] };
  }

  let totalScore = 0;
  const traitScores: TraitScore[] = [];

  for (const trait of traits) {
    const percentage = (trait.count / totalSupply) * 100;
    // Spec: score = 100 * (1 - percentage/100)
    const score = 100 * (1 - percentage / 100);

    traitScores.push({
      traitType:  trait.type,
      traitValue: trait.value,
      percentage: Math.round(percentage * 100) / 100,
      score:      Math.round(score * 100) / 100,
    });

    totalScore += score;
  }

  // Spec: normalized = totalScore / traits.length
  const normalizedScore = totalScore / traits.length;
  const tier = getRarityTier(normalizedScore * 10); // scale to 0–1000 for tier mapping

  return {
    score:       Math.round(normalizedScore * 100) / 100,
    rank:        0,         // assigned by rankCollection()
    percentile:  0,         // assigned by rankCollection()
    tier,
    traitScores,
  };
}

// ── §4.2 Collection ranking ───────────────────────────────────────────────────

/**
 * rankSimulatedCollection
 *
 * Generates a complete ranked token list for a collection using its trait
 * distribution (from the store's NFTTrait array). Each token's trait values
 * are assigned deterministically via PRNG so ranks are stable across renders.
 *
 * This mirrors the spec's RarityCalculator.rankCollection() but works
 * fully client-side without external API calls.
 *
 * @param col - the NFTCollection from the store
 * @param sampleSize - max tokens to score (default 200 for performance)
 * @returns sorted ScoredToken array (rank 1 = rarest)
 */
export function rankSimulatedCollection(col: NFTCollection, sampleSize = 200): ScoredToken[] {
  if (col.traits.length === 0) return [];

  const supply = Math.min(col.totalSupply, sampleSize);
  const tokens: { tokenId: string; score: number }[] = [];

  for (let i = 0; i < supply; i++) {
    const tokenId = `#${i + 1}`;
    const rng     = seededRng(strHash(`${col.slug}-${tokenId}`));

    // Pick one trait value per trait category
    const traits: TraitInput[] = col.traits.map(trait => {
      const pick = trait.values[Math.floor(rng() * trait.values.length)];
      return pick
        ? { type: trait.category, value: pick.value, count: Math.round(pick.percentage * col.totalSupply / 100) }
        : { type: trait.category, value: 'None', count: col.totalSupply };
    });

    const result = calculateRarityScore(traits, col.totalSupply);
    tokens.push({ tokenId, score: result.score });
  }

  // Sort by score descending (highest score = rarest)
  tokens.sort((a, b) => b.score - a.score);

  return tokens.map((t, i) => ({
    tokenId:   t.tokenId,
    score:     t.score,
    rank:      i + 1,
    percentile: Math.round(((i + 1) / supply) * 100),
  }));
}

/**
 * getTokenRarityInCollection
 *
 * Compute rarity rank + score for a SPECIFIC tokenId within a collection.
 * Returns null if the collection has no traits.
 */
export function getTokenRarityInCollection(
  col:     NFTCollection,
  tokenId: string,
): RarityResult | null {
  if (col.traits.length === 0) return null;

  const rng = seededRng(strHash(`${col.slug}-${tokenId}`));

  const traits: TraitInput[] = col.traits.map(trait => {
    const pick = trait.values[Math.floor(rng() * trait.values.length)];
    return pick
      ? { type: trait.category, value: pick.value, count: Math.round(pick.percentage * col.totalSupply / 100) }
      : { type: trait.category, value: 'None', count: col.totalSupply };
  });

  const base = calculateRarityScore(traits, col.totalSupply);

  // Approximate rank using score relative to collection's rarityScore
  const collectionAvg = col.rarityScore ?? 50;
  const relativeRank  = Math.max(1, Math.round(col.totalSupply * (1 - base.score / 100)));

  return {
    ...base,
    rank:      relativeRank,
    percentile: Math.round((relativeRank / col.totalSupply) * 100),
  };
}

// ── Trait-level helpers ───────────────────────────────────────────────────────

/**
 * getMostRareTraits
 *
 * Returns the rarest trait values in a collection sorted by rarity score.
 */
export function getMostRareTraits(col: NFTCollection, limit = 5): Array<{
  category:    string;
  value:       string;
  percentage:  number;
  rarityScore: number;
  tier:        RarityTier;
}> {
  const all = col.traits.flatMap(t =>
    t.values.map(v => ({
      category:    t.category,
      value:       v.value,
      percentage:  v.percentage,
      rarityScore: v.rarityScore,
      tier:        getRarityTier(v.rarityScore * 10),
    }))
  );

  return all
    .filter(t => t.percentage > 0)
    .sort((a, b) => b.rarityScore - a.rarityScore)
    .slice(0, limit);
}

/**
 * getTraitRarityBreakdown
 *
 * Returns rarity stats per trait category for a collection.
 */
export function getTraitRarityBreakdown(col: NFTCollection): Array<{
  category:    string;
  valueCount:  number;
  rarest:      NFTTraitValue | null;
  mostCommon:  NFTTraitValue | null;
  avgRarity:   number;
}> {
  return col.traits.map(trait => {
    const sorted     = [...trait.values].sort((a, b) => b.rarityScore - a.rarityScore);
    const totalScore = trait.values.reduce((s, v) => s + v.rarityScore, 0);
    return {
      category:   trait.category,
      valueCount: trait.values.length,
      rarest:     sorted[0] ?? null,
      mostCommon: sorted[sorted.length - 1] ?? null,
      avgRarity:  trait.values.length > 0 ? totalScore / trait.values.length : 0,
    };
  });
}

// ── Rarity distribution buckets ───────────────────────────────────────────────

export interface RarityDistribution {
  common:    number;   // count of traits/tokens in each tier
  uncommon:  number;
  rare:      number;
  epic:      number;
  legendary: number;
  total:     number;
}

/**
 * computeCollectionRarityDistribution
 *
 * Returns the count of trait values in each rarity tier bucket.
 */
export function computeCollectionRarityDistribution(col: NFTCollection): RarityDistribution {
  const dist: RarityDistribution = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, total: 0 };
  for (const trait of col.traits) {
    for (const v of trait.values) {
      const tier = getRarityTier(v.rarityScore * 10);
      dist[tier]++;
      dist.total++;
    }
  }
  return dist;
}
