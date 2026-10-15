/**
 * EconomyConfig — single source of truth for every tunable number across
 * rewards, loot, Elo, matchmaking, vendor and milestones.
 *
 * Rules of the game code: do NOT hardcode literals for drop chances, prices,
 * XP, Elo, matchmaking windows or shop sizes. Read them from an EconomyConfig
 * (or DEFAULT_ECONOMY in tests). The backend stores one editable copy and the
 * admin Balance page writes to it.
 */

import type { RarityId } from "./requires.js";

export type EconomyRarityMap = Record<RarityId, number>;

export type EconomyModeGold = {
  /** Flat gold awarded to the winner (or 1st place in FFA). */
  win: number;
  /** Flat gold awarded to the losers. */
  loss: number;
  /**
   * Optional multipliers by placement (1-indexed). Overrides win/loss when set
   * for the given placement. Example for FFA 4: [1, 0.6, 0.3, 0] applied to
   * the "win" value, meaning 2nd gets 60% of the win payout.
   */
  placementMultipliers?: number[];
};

export type EconomyModeDrops = {
  /** Chance 0..1 to roll loot on a win. */
  win: number;
  /** Chance 0..1 to roll loot on a loss (0 for arcade today). */
  loss: number;
};

export type EconomyRankedXp = {
  /** rankedWinXp = winBase + winFlat + winLevelCoeff * (opponentLevel - heroLevel). */
  winBase: number;
  winFlat: number;
  winLevelCoeff: number;
  /** rankedLossDelta = lossBase + lossOppCoeff * opponentLevel. */
  lossBase: number;
  lossOppCoeff: number;
};

export type EconomyArcadeXp = {
  win: number;
  loss: number;
  dailyCap: number;
};

export type EconomyMatchmaking = {
  /** Base Elo window at 0 wait. */
  baseElo: number;
  /** Additional Elo window per step. */
  stepElo: number;
  /** Maximum Elo window. */
  maxElo: number;
  /** Base level window at 0 wait. */
  baseLevel: number;
  /** Additional level window per step. */
  stepLevel: number;
  /** Maximum level window. */
  maxLevel: number;
  /** Milliseconds per step of widening. */
  stepMs: number;
};

export type EconomyElo = {
  /** K factor used for Elo deltas. */
  k: number;
  /** Milliseconds of ranked absence that counts as a forfeit. */
  disconnectMs: number;
  /** Season length in days. */
  seasonDays: number;
  /** Soft-reset coefficients. new = reset * oldWeight + anchor * (1 - oldWeight). */
  seasonResetOldWeight: number;
  seasonResetAnchor: number;
};

export type EconomyVendor = {
  /** Default gold price per rarity when the item has no explicit priceGold. */
  priceByRarity: EconomyRarityMap;
  /** Automatic daily stock size — inclusive. */
  autoMin: number;
  autoMax: number;
  /** Max number of slots per day in the admin schedule. */
  maxSlots: number;
};

export type MilestoneRow = {
  kind: string;
  count: number;
  gold: number;
  cosmetic?: string;
};

export type EconomyConfig = {
  gold: {
    ranked: EconomyModeGold;
    arcade: EconomyModeGold;
    pve: EconomyModeGold;
    test: EconomyModeGold;
  };
  xp: {
    ranked: EconomyRankedXp;
    arcade: EconomyArcadeXp;
  };
  drops: {
    ranked: EconomyModeDrops & { overTier: number; keepOverTierUnequippable: boolean };
    arcade: EconomyModeDrops;
    pve: EconomyModeDrops;
  };
  rarityUnlock: EconomyRarityMap;
  vendor: EconomyVendor;
  elo: EconomyElo;
  matchmaking: EconomyMatchmaking;
  milestones: MilestoneRow[];
};

export const DEFAULT_ECONOMY: EconomyConfig = {
  gold: {
    ranked: { win: 60, loss: 20 },
    arcade: { win: 25, loss: 10 },
    pve: { win: 25, loss: 10 },
    test: { win: 0, loss: 0 },
  },
  xp: {
    ranked: {
      winBase: 100,
      winFlat: 200,
      winLevelCoeff: 10,
      lossBase: -50,
      lossOppCoeff: 5,
    },
    arcade: { win: 150, loss: 40, dailyCap: 10 },
  },
  drops: {
    ranked: { win: 1.0, loss: 0.0, overTier: 0.05, keepOverTierUnequippable: true },
    arcade: { win: 0.2, loss: 0.0 },
    pve: { win: 0.3, loss: 0.0 },
  },
  rarityUnlock: {
    common: 1,
    uncommon: 3,
    rare: 7,
    very_rare: 11,
    legendary: 17,
  },
  vendor: {
    priceByRarity: {
      common: 100,
      uncommon: 500,
      rare: 3000,
      very_rare: 20000,
      legendary: 100000,
    },
    autoMin: 6,
    autoMax: 10,
    maxSlots: 12,
  },
  elo: {
    k: 32,
    disconnectMs: 45_000,
    seasonDays: 60,
    seasonResetOldWeight: 0.6,
    seasonResetAnchor: 1000,
  },
  matchmaking: {
    baseElo: 100,
    stepElo: 50,
    maxElo: 300,
    baseLevel: 2,
    stepLevel: 1,
    maxLevel: 5,
    stepMs: 15_000,
  },
  milestones: [
    { kind: "games_10", count: 10, gold: 50, cosmetic: "title_regular" },
    { kind: "games_100", count: 100, gold: 200, cosmetic: "frame_iron" },
    { kind: "games_1000", count: 1000, gold: 1000, cosmetic: "banner_veteran" },
    { kind: "wins_10", count: 10, gold: 80, cosmetic: "title_winner" },
    { kind: "wins_100", count: 100, gold: 400, cosmetic: "frame_gold" },
    { kind: "wins_1000", count: 1000, gold: 2000, cosmetic: "skin_champion" },
  ],
};

/** Deep clone so callers that mutate (snapshots on fight start) cannot leak into DEFAULT_ECONOMY. */
export function cloneEconomy(config: EconomyConfig): EconomyConfig {
  return JSON.parse(JSON.stringify(config)) as EconomyConfig;
}

/**
 * Deep merge a partial patch onto a base. Arrays are replaced wholesale
 * (needed for milestones). Scalars from the patch replace scalars from base.
 */
export function mergeEconomy(base: EconomyConfig, patch: unknown): EconomyConfig {
  const out = cloneEconomy(base);
  if (!patch || typeof patch !== "object") return out;
  mergeInto(out as unknown as Record<string, unknown>, patch as Record<string, unknown>);
  return out;
}

function mergeInto(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (Array.isArray(value)) {
      target[key] = value.slice();
      continue;
    }
    if (value && typeof value === "object") {
      const existing = target[key];
      if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
        target[key] = {};
      }
      mergeInto(target[key] as Record<string, unknown>, value as Record<string, unknown>);
      continue;
    }
    target[key] = value;
  }
}

/**
 * Validate a config shape. Throws with a readable reason on the first problem.
 * Keeps schema cheap — the admin UI already groups fields, we just enforce ranges.
 */
export function validateEconomy(config: EconomyConfig): void {
  const positive = (name: string, value: number): void => {
    if (!Number.isFinite(value) || value < 0) throw new Error(`BAD_ECONOMY:${name}`);
  };
  const probability = (name: string, value: number): void => {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`BAD_ECONOMY:${name}`);
  };
  for (const mode of ["ranked", "arcade", "pve", "test"] as const) {
    positive(`gold.${mode}.win`, config.gold[mode].win);
    positive(`gold.${mode}.loss`, config.gold[mode].loss);
    if (config.gold[mode].placementMultipliers) {
      for (const m of config.gold[mode].placementMultipliers!) positive(`gold.${mode}.placement`, m);
    }
  }
  const finite = (name: string, value: number): void => {
    if (!Number.isFinite(value)) throw new Error(`BAD_ECONOMY:${name}`);
  };
  finite("xp.ranked.winBase", config.xp.ranked.winBase);
  finite("xp.ranked.winFlat", config.xp.ranked.winFlat);
  finite("xp.ranked.winLevelCoeff", config.xp.ranked.winLevelCoeff);
  finite("xp.ranked.lossBase", config.xp.ranked.lossBase);
  finite("xp.ranked.lossOppCoeff", config.xp.ranked.lossOppCoeff);
  positive("xp.arcade.win", config.xp.arcade.win);
  positive("xp.arcade.loss", config.xp.arcade.loss);
  positive("xp.arcade.dailyCap", config.xp.arcade.dailyCap);
  for (const mode of ["ranked", "arcade", "pve"] as const) {
    probability(`drops.${mode}.win`, config.drops[mode].win);
    probability(`drops.${mode}.loss`, config.drops[mode].loss);
  }
  probability("drops.ranked.overTier", config.drops.ranked.overTier);
  const unlocks = Object.values(config.rarityUnlock);
  for (let i = 1; i < unlocks.length; i += 1) {
    if (unlocks[i]! < unlocks[i - 1]!) throw new Error("BAD_ECONOMY:rarityUnlock.order");
  }
  for (const r of Object.keys(config.rarityUnlock)) positive(`rarityUnlock.${r}`, config.rarityUnlock[r as RarityId]);
  for (const r of Object.keys(config.vendor.priceByRarity)) positive(`vendor.priceByRarity.${r}`, config.vendor.priceByRarity[r as RarityId]);
  if (config.vendor.autoMin < 0 || config.vendor.autoMax < config.vendor.autoMin) throw new Error("BAD_ECONOMY:vendor.auto");
  positive("vendor.maxSlots", config.vendor.maxSlots);
  positive("elo.k", config.elo.k);
  positive("elo.disconnectMs", config.elo.disconnectMs);
  positive("elo.seasonDays", config.elo.seasonDays);
  probability("elo.seasonResetOldWeight", config.elo.seasonResetOldWeight);
  positive("elo.seasonResetAnchor", config.elo.seasonResetAnchor);
  for (const key of ["baseElo", "stepElo", "maxElo", "baseLevel", "stepLevel", "maxLevel", "stepMs"] as const) {
    positive(`matchmaking.${key}`, config.matchmaking[key]);
  }
  for (const row of config.milestones) {
    if (!row.kind) throw new Error("BAD_ECONOMY:milestones.kind");
    positive(`milestones.${row.kind}.count`, row.count);
    positive(`milestones.${row.kind}.gold`, row.gold);
  }
}
