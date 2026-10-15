import type { HeroRules, ItemRules } from "./content-types.js";
import { DEFAULT_ECONOMY, type EconomyConfig } from "./economy-config.js";

export const RARITY_ORDER = ["common", "uncommon", "rare", "very_rare", "legendary"] as const;
export type RarityId = (typeof RARITY_ORDER)[number];

/**
 * Fallback unlock table — mirrors DEFAULT_ECONOMY.rarityUnlock. Prefer
 * rarityUnlocked() with a live config; callers that pass no config get the
 * defaults, which is the same behaviour as before.
 */
export const RARITY_UNLOCK_LEVEL: Record<RarityId, number> = DEFAULT_ECONOMY.rarityUnlock;

export function rarityUnlocked(rarity: RarityId, level: number, config: EconomyConfig = DEFAULT_ECONOMY): boolean {
  return level >= config.rarityUnlock[rarity];
}

export function oneTierAbove(rarity: RarityId): RarityId {
  const i = RARITY_ORDER.indexOf(rarity);
  return RARITY_ORDER[Math.min(RARITY_ORDER.length - 1, i + 1)] ?? rarity;
}

export function placeholderPrice(rarity: RarityId, config: EconomyConfig = DEFAULT_ECONOMY): number {
  return config.vendor.priceByRarity[rarity];
}

export type EquipResult = { ok: true } | { ok: false; reason: string };

function classIds(hero: HeroRules): string[] {
  return hero.classes.map((c) => c.id);
}

function spellcaster(hero: HeroRules): boolean {
  return hero.features.includes("spellcasting") || hero.spells.length > 0;
}

export function canEquip(hero: HeroRules, item: ItemRules, attunementUsed: number, config: EconomyConfig = DEFAULT_ECONOMY): EquipResult {
  const req = item.requires;
  if (!rarityUnlocked(item.rarity, hero.level, config)) {
    return { ok: false, reason: `Requires level ${config.rarityUnlock[item.rarity]}.` };
  }
  if (req?.minLevel != null && hero.level < req.minLevel) {
    return { ok: false, reason: `Requires level ${req.minLevel}.` };
  }
  if (req?.species?.length && !req.species.includes(hero.species)) {
    return { ok: false, reason: "Requires a different species." };
  }
  if (req?.class?.length && !req.class.some((id) => classIds(hero).includes(id))) {
    const label = req.class[0] ?? "that class";
    return { ok: false, reason: `Requires the ${label} class.` };
  }
  if (req?.alignment?.length && !req.alignment.includes(hero.alignment)) {
    return { ok: false, reason: "Requires a different alignment." };
  }
  if (req?.minAbility) {
    for (const [ability, min] of Object.entries(req.minAbility)) {
      const key = ability as keyof HeroRules["abilities"];
      if (min != null && (hero.abilities[key] ?? 0) < min) {
        return { ok: false, reason: `Requires ${ability.toUpperCase()} ${min}.` };
      }
    }
  }
  if (req?.proficiency?.length && !req.proficiency.every((p) => hero.proficiency.includes(p))) {
    return { ok: false, reason: "Requires a proficiency you don't have." };
  }
  if (req?.spellcaster && !spellcaster(hero)) {
    return { ok: false, reason: "Requires a spellcaster." };
  }
  if (req?.attunement && attunementUsed >= 3) {
    return { ok: false, reason: "Attunement slots are full." };
  }
  return { ok: true };
}
