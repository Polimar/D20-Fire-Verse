/**
 * Drops land in the account stash. PvP does not trade items between accounts.
 * Ranked's over-tier is one rarity step above the gate: it can be stored, not equipped.
 */

import { oneTierAbove, rarityUnlocked, type RarityId } from "@d20-fireverse/rules";
import type { ItemDef } from "@d20-fireverse/content-schema";
import { enabledItems } from "./content-catalog.js";
import { recordEvent } from "./events.js";
import { giveItemOwned } from "./stash-mut.js";
import { getEconomyConfig } from "./economy-config.js";

const ORDER: RarityId[] = ["common", "uncommon", "rare", "very_rare", "legendary"];

function pickWeighted(items: ItemDef[], rarity: RarityId, rng: () => number): ItemDef | undefined {
  const pool = items.filter((item) => item.rarity === rarity);
  if (!pool.length) return undefined;
  return pool[Math.floor(rng() * pool.length)];
}

export function rollLoot(input: {
  userId: string;
  mode: "pve" | "ranked" | "arcade" | "test";
  level: number;
  encounterCr?: number;
  opponentLevel?: number;
  won?: boolean;
  rng?: () => number;
}): { item?: ItemDef; overTier: boolean } {
  if (input.mode === "test") return { overTier: false };
  const config = getEconomyConfig();
  const dropsForMode = config.drops[input.mode];
  if (!dropsForMode) return { overTier: false };
  const chance = input.won ? dropsForMode.win : dropsForMode.loss;
  if (chance <= 0) return { overTier: false };
  const rng = input.rng ?? Math.random;
  if (rng() >= chance) return { overTier: false };
  const items = enabledItems();
  const quality = input.mode === "ranked" ? Math.max(1, input.opponentLevel ?? input.level) : input.level;
  const legal = ORDER.filter((rarity) => rarityUnlocked(rarity, quality, config));
  let rarity = legal[legal.length - 1] ?? "common";
  if (input.mode === "ranked" && input.encounterCr != null && input.encounterCr >= config.rarityUnlock.rare) {
    rarity = legal.includes("rare") ? "rare" : rarity;
  }
  let overTier = false;
  if (input.mode === "ranked" && rng() < config.drops.ranked.overTier) {
    rarity = oneTierAbove(rarity);
    overTier = !rarityUnlocked(rarity, input.level, config);
  }
  const item = pickWeighted(items, rarity, rng) ?? pickWeighted(items, "common", rng);
  if (!item) return { overTier };
  giveItemOwned(input.userId, item.id);
  recordEvent(input.userId, null, "drop", { rarity: item.rarity, mode: input.mode, itemId: item.id, overTier });
  return { item, overTier };
}
