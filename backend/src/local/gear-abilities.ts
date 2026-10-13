/**
 * Weapon attacks built from the SRD 5.2.1 weapon table, so any catalog weapon a hero equips swings in a fight.
 * Ids look like gear_<itemId>_attack; the item's own row in the catalog is the source of truth.
 */

import type { ItemDef } from "@d20-fireverse/content-schema";
import type { AbilityDef } from "./campaign.js";
import { catalogEntry } from "./content-catalog.js";

const PREFIX = "gear_";
const SUFFIX = "_attack";
const FEET_PER_CELL = 5;

export function gearAttackId(itemId: string): string {
  return `${PREFIX}${itemId}${SUFFIX}`;
}

/** Ranged weapons shoot from their normal range; reach still swings at 1 cell because the engine reads range > 1 as ranged. */
export function weaponAbility(item: ItemDef): AbilityDef | undefined {
  const weapon = item.weapon;
  if (!weapon) return undefined;
  const ranged = weapon.category.endsWith("_ranged");
  const finesse = weapon.properties.some((p) => /^finesse\b/i.test(p));
  const ability = finesse ? "finesse" : ranged ? "dex" : "str";
  const effect: Record<string, unknown> = {
    type: "attack",
    ability,
    proficient: true,
    rangeCells: ranged ? Math.max(2, Math.floor((weapon.rangeFt?.normal ?? 80) / FEET_PER_CELL)) : 1,
    damage: [{ dice: weapon.damage, damageType: weapon.damageType, ability }],
  };
  if (ranged && weapon.rangeFt) effect.longRangeCells = Math.floor(weapon.rangeFt.long / FEET_PER_CELL);
  if (finesse || ranged) effect.sneakAttackEligible = true;
  return { id: gearAttackId(item.id), name: item.name, actionType: "action", needsTarget: true, effects: [effect] };
}

export function gearAbility(id: string): AbilityDef | undefined {
  if (!id.startsWith(PREFIX) || !id.endsWith(SUFFIX)) return undefined;
  const item = catalogEntry<ItemDef>("item", id.slice(PREFIX.length, -SUFFIX.length));
  return item ? weaponAbility(item) : undefined;
}
