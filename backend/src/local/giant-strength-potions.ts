/** SRD Giant Strength potions: drink to set Strength for a short combat duration. */

export const GIANT_STRENGTH_DURATION_PC_TURNS = 60;
export const GIANT_STRENGTH_EFFECT_ID = "giant_strength";

export type GiantStrengthPotionDef = {
  itemId: string;
  inventoryToken: string;
  abilityId: string;
  score: number;
  actionName: string;
};

export const GIANT_STRENGTH_POTIONS: readonly GiantStrengthPotionDef[] = [
  {
    itemId: "potion_of_giant_strength_hill",
    inventoryToken: "potion_giant_strength_hill",
    abilityId: "use_potion_giant_strength_hill",
    score: 21,
    actionName: "Use Object: Potion of Giant Strength (Hill)",
  },
  {
    itemId: "potion_of_giant_strength_frost_or_stone",
    inventoryToken: "potion_giant_strength_frost_or_stone",
    abilityId: "use_potion_giant_strength_frost_or_stone",
    score: 23,
    actionName: "Use Object: Potion of Giant Strength (Frost or Stone)",
  },
  {
    itemId: "potion_of_giant_strength_fire",
    inventoryToken: "potion_giant_strength_fire",
    abilityId: "use_potion_giant_strength_fire",
    score: 25,
    actionName: "Use Object: Potion of Giant Strength (Fire)",
  },
  {
    itemId: "potion_of_giant_strength_cloud",
    inventoryToken: "potion_giant_strength_cloud",
    abilityId: "use_potion_giant_strength_cloud",
    score: 27,
    actionName: "Use Object: Potion of Giant Strength (Cloud)",
  },
  {
    itemId: "potion_of_giant_strength_storm",
    inventoryToken: "potion_giant_strength_storm",
    abilityId: "use_potion_giant_strength_storm",
    score: 29,
    actionName: "Use Object: Potion of Giant Strength (Storm)",
  },
];

const BY_ITEM = new Map(GIANT_STRENGTH_POTIONS.map((p) => [p.itemId, p]));
const BY_INVENTORY = new Map(GIANT_STRENGTH_POTIONS.map((p) => [p.inventoryToken, p]));

export function giantStrengthPotionByItemId(itemId: string): GiantStrengthPotionDef | undefined {
  return BY_ITEM.get(itemId);
}

export function giantStrengthPotionByInventory(token: string): GiantStrengthPotionDef | undefined {
  return BY_INVENTORY.get(token);
}

export function combatInventoryToken(itemId: string): string | undefined {
  return giantStrengthPotionByItemId(itemId)?.inventoryToken ?? undefined;
}
