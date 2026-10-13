import type { HeroRules, ItemRules } from "./content-types.js";

export const RARITY_UNLOCK_LEVEL = {
  common: 1,
  uncommon: 3,
  rare: 7,
  very_rare: 11,
  legendary: 17,
} as const;

export const RARITY_ORDER = ["common", "uncommon", "rare", "very_rare", "legendary"] as const;
export type RarityId = (typeof RARITY_ORDER)[number];

export function rarityUnlocked(rarity: RarityId, level: number): boolean {
  return level >= RARITY_UNLOCK_LEVEL[rarity];
}

export function oneTierAbove(rarity: RarityId): RarityId {
  const i = RARITY_ORDER.indexOf(rarity);
  return RARITY_ORDER[Math.min(RARITY_ORDER.length - 1, i + 1)] ?? rarity;
}

const PRICE: Record<RarityId, number> = {
  common: 100,
  uncommon: 500,
  rare: 3000,
  very_rare: 20000,
  legendary: 100000,
};

export function placeholderPrice(rarity: RarityId): number {
  return PRICE[rarity];
}

export type EquipResult = { ok: true } | { ok: false; reason: string };

function classIds(hero: HeroRules): string[] {
  return hero.classes.map((c) => c.id);
}

function spellcaster(hero: HeroRules): boolean {
  return hero.features.includes("spellcasting") || hero.spells.length > 0;
}

export function canEquip(hero: HeroRules, item: ItemRules, attunementUsed: number): EquipResult {
  const req = item.requires;
  if (!rarityUnlocked(item.rarity, hero.level)) {
    return { ok: false, reason: `Requires level ${RARITY_UNLOCK_LEVEL[item.rarity]}.` };
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
