/** Per-spell scroll consumables (generic spell_scroll stays Missing). */

export type SpellScrollDef = {
  itemId: string;
  inventoryToken: string;
  abilityId: string;
  spellId: string;
};

export const SPELL_SCROLLS: SpellScrollDef[] = [
  {
    itemId: "spell_scroll_fireball",
    inventoryToken: "scroll_fireball",
    abilityId: "use_scroll_fireball",
    spellId: "fireball",
  },
  {
    itemId: "spell_scroll_cure_wounds",
    inventoryToken: "scroll_cure_wounds",
    abilityId: "use_scroll_cure_wounds",
    spellId: "cure_wounds",
  },
];

const BY_INVENTORY = new Map(SPELL_SCROLLS.map((row) => [row.inventoryToken, row]));
const BY_ABILITY = new Map(SPELL_SCROLLS.map((row) => [row.abilityId, row]));

export function spellScrollByInventory(token: string): SpellScrollDef | undefined {
  return BY_INVENTORY.get(token);
}

export function spellScrollByAbility(abilityId: string): SpellScrollDef | undefined {
  return BY_ABILITY.get(abilityId);
}
