/**
 * Weapon mastery property swap. A long rest arms one swap; the hero then replaces one known property.
 */

import type { ItemDef } from "@d20-fireverse/content-schema";
import { accountDb } from "./auth.js";
import { catalogEntry } from "./content-catalog.js";
import { getHero, unequip } from "./hero.js";

const PROPERTIES = ["cleave", "graze", "nick", "push", "sap", "slow", "topple", "vex"] as const;

type Meta = { masteryReady?: boolean; masteries?: string[]; loadoutNote?: string };

function readMeta(heroId: string): Meta {
  const row = accountDb().prepare("SELECT builder_meta_json FROM heroes WHERE id = ?").get(heroId) as { builder_meta_json?: string } | undefined;
  if (!row?.builder_meta_json) return {};
  try {
    return JSON.parse(row.builder_meta_json) as Meta;
  } catch {
    return {};
  }
}

function writeMeta(heroId: string, meta: Meta): void {
  accountDb().prepare("UPDATE heroes SET builder_meta_json = ? WHERE id = ?").run(JSON.stringify(meta), heroId);
}

export function markMasterySwapReady(heroId: string): void {
  if (!heroId.startsWith("hero_")) return;
  const meta = readMeta(heroId);
  meta.masteryReady = true;
  writeMeta(heroId, meta);
}

export function swapWeaponMastery(userId: string, heroId: string, drop: string, take: string): { masteries: string[] } {
  const hero = getHero(heroId);
  if (!hero || hero.userId !== userId) throw new Error("BAD_CHARACTER");
  if (!PROPERTIES.includes(drop as (typeof PROPERTIES)[number]) || !PROPERTIES.includes(take as (typeof PROPERTIES)[number])) {
    throw new Error("BAD_MASTERY");
  }
  if (drop === take) throw new Error("BAD_MASTERY");
  const meta = readMeta(heroId);
  if (!meta.masteryReady) throw new Error("MASTERY_LOCKED");
  const known = meta.masteries?.length ? [...meta.masteries] : [...PROPERTIES.slice(0, 2)];
  if (!known.includes(drop)) throw new Error("BAD_MASTERY");
  meta.masteries = known.map((id) => (id === drop ? take : id));
  meta.masteryReady = false;
  meta.loadoutNote = "Weapon mastery changed — adjust equipped gear in your stash.";
  writeMeta(heroId, meta);
  const rows = accountDb()
    .prepare("SELECT id, item_def_id FROM account_stash WHERE user_id = ? AND equipped_by_hero_id = ?")
    .all(userId, heroId) as Array<{ id: string; item_def_id: string }>;
  for (const row of rows) {
    const def = catalogEntry<ItemDef>("item", row.item_def_id);
    if (def?.weaponMastery === drop) unequip(userId, heroId, row.id);
  }
  return { masteries: meta.masteries };
}
