/** Named resistance potions (no generic potion_of_resistance in v1). */

export const FIRE_RESISTANCE_POTION_ITEM_ID = "potion_of_resistance_fire";
export const FIRE_RESISTANCE_INVENTORY = "potion_resistance_fire";
export const FIRE_RESISTANCE_ABILITY_ID = "use_potion_resistance_fire";
export const FIRE_RESISTANCE_EFFECT_ID = "potion_resistance_fire";
export const RESISTANCE_POTION_DURATION_PC_TURNS = 10;

export type ResistancePotionDef = {
  itemId: string;
  inventoryToken: string;
  abilityId: string;
  damageType: string;
  durationPcTurns: number;
};

export const FIRE_RESISTANCE_POTION: ResistancePotionDef = {
  itemId: FIRE_RESISTANCE_POTION_ITEM_ID,
  inventoryToken: FIRE_RESISTANCE_INVENTORY,
  abilityId: FIRE_RESISTANCE_ABILITY_ID,
  damageType: "fire",
  durationPcTurns: RESISTANCE_POTION_DURATION_PC_TURNS,
};

const BY_INVENTORY = new Map<string, ResistancePotionDef>([[FIRE_RESISTANCE_INVENTORY, FIRE_RESISTANCE_POTION]]);

export function resistancePotionByInventory(token: string): ResistancePotionDef | undefined {
  return BY_INVENTORY.get(token);
}

export function resistancePotionByAbility(abilityId: string): ResistancePotionDef | undefined {
  return abilityId === FIRE_RESISTANCE_ABILITY_ID ? FIRE_RESISTANCE_POTION : undefined;
}
