/** SRD healing potion tiers: catalog item, combat inventory token, and menu ability. */

export type HealingPotionDef = {
  itemId: string;
  inventoryToken: string;
  abilityId: string;
  dice: string;
  actionName: string;
};

export const HEALING_POTIONS: readonly HealingPotionDef[] = [
  {
    itemId: "potion_of_healing",
    inventoryToken: "potion_healing",
    abilityId: "use_potion_healing",
    dice: "2d4+2",
    actionName: "Use Object: Potion of Healing",
  },
  {
    itemId: "potion_of_healing_greater",
    inventoryToken: "potion_healing_greater",
    abilityId: "use_potion_healing_greater",
    dice: "4d4+4",
    actionName: "Use Object: Potion of Healing (Greater)",
  },
  {
    itemId: "potion_of_healing_superior",
    inventoryToken: "potion_healing_superior",
    abilityId: "use_potion_healing_superior",
    dice: "8d4+8",
    actionName: "Use Object: Potion of Healing (Superior)",
  },
  {
    itemId: "potion_of_healing_supreme",
    inventoryToken: "potion_healing_supreme",
    abilityId: "use_potion_healing_supreme",
    dice: "10d4+20",
    actionName: "Use Object: Potion of Healing (Supreme)",
  },
];

const BY_ITEM = new Map(HEALING_POTIONS.map((p) => [p.itemId, p]));
const BY_INVENTORY = new Map(HEALING_POTIONS.map((p) => [p.inventoryToken, p]));
const BY_ABILITY = new Map(HEALING_POTIONS.map((p) => [p.abilityId, p]));

export function healingPotionByItemId(itemId: string): HealingPotionDef | undefined {
  return BY_ITEM.get(itemId);
}

export function healingPotionByInventory(token: string): HealingPotionDef | undefined {
  return BY_INVENTORY.get(token);
}

export function healingPotionByAbility(abilityId: string): HealingPotionDef | undefined {
  return BY_ABILITY.get(abilityId);
}
