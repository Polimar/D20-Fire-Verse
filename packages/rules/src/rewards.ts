/** Post-encounter rewards. Level does not change until the encounter is over. */

import { DEFAULT_ECONOMY, type EconomyConfig, type MilestoneRow } from "./economy-config.js";

export type RewardMode = "pve" | "ranked" | "arcade" | "test" | "story";

export function pveXp(monsterXp: readonly number[]): number {
  return monsterXp.reduce((n, xp) => n + Math.max(0, xp), 0);
}

export function rankedWinXp(
  heroLevel: number,
  opponentLevel: number,
  config: EconomyConfig = DEFAULT_ECONOMY,
): number {
  const r = config.xp.ranked;
  return r.winBase + r.winFlat + r.winLevelCoeff * (opponentLevel - heroLevel);
}

export function rankedLossDelta(opponentLevel: number, config: EconomyConfig = DEFAULT_ECONOMY): number {
  const r = config.xp.ranked;
  return r.lossBase + r.lossOppCoeff * opponentLevel;
}

export function arcadeXp(
  won: boolean,
  matchesAlreadyCounted: number,
  dailyCapOrConfig?: number | EconomyConfig,
  configMaybe: EconomyConfig = DEFAULT_ECONOMY,
): number {
  const config = typeof dailyCapOrConfig === "object" ? dailyCapOrConfig : configMaybe;
  const cap = typeof dailyCapOrConfig === "number" ? dailyCapOrConfig : config.xp.arcade.dailyCap;
  if (matchesAlreadyCounted >= cap) return 0;
  return won ? config.xp.arcade.win : config.xp.arcade.loss;
}

export function modeXp(
  mode: RewardMode,
  input: {
    monsterXp?: readonly number[];
    won?: boolean;
    heroLevel?: number;
    opponentLevel?: number;
    arcadeMatches?: number;
  },
  config: EconomyConfig = DEFAULT_ECONOMY,
): number {
  switch (mode) {
    case "pve":
    case "story":
      return pveXp(input.monsterXp ?? []);
    case "ranked":
      return input.won
        ? rankedWinXp(input.heroLevel ?? 1, input.opponentLevel ?? 1, config)
        : rankedLossDelta(input.opponentLevel ?? 1, config);
    case "arcade":
      return arcadeXp(Boolean(input.won), input.arcadeMatches ?? 0, config.xp.arcade.dailyCap, config);
    case "test":
      return 0;
    default: {
      const neverMode: never = mode;
      return neverMode;
    }
  }
}

/**
 * Gold awarded for a finished match. For FFA formats, callers pass the
 * finishing `placement` (1-indexed) and `playerCount`. When a placement
 * multiplier array is set, the player gets `round(win * multiplier[place-1])`;
 * otherwise 1st = win, everyone else = loss.
 */
export function matchGold(
  mode: RewardMode,
  input: {
    won?: boolean;
    placement?: number;
    playerCount?: number;
    matchesToday?: number;
  },
  config: EconomyConfig = DEFAULT_ECONOMY,
): number {
  if (mode === "test" || mode === "story") return 0;
  const bag = config.gold[mode];
  if (!bag) return 0;
  if (mode === "arcade" && (input.matchesToday ?? 0) >= config.xp.arcade.dailyCap) return 0;
  const multipliers = bag.placementMultipliers;
  if (multipliers && multipliers.length && input.placement && input.placement >= 1) {
    const mul = multipliers[input.placement - 1];
    if (mul != null && mul >= 0) return Math.max(0, Math.round(bag.win * mul));
  }
  if (input.placement != null) return input.placement === 1 ? bag.win : bag.loss;
  return input.won ? bag.win : bag.loss;
}

export const MILESTONES: readonly MilestoneRow[] = DEFAULT_ECONOMY.milestones;

export function milestoneReward(
  kind: string,
  count: number,
  config: EconomyConfig = DEFAULT_ECONOMY,
): { gold: number; cosmetic?: string } | null {
  const row = config.milestones.find((m) => m.kind === kind && count >= m.count);
  if (!row) return null;
  return { gold: row.gold, cosmetic: row.cosmetic };
}
