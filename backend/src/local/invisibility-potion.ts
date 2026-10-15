/** SRD Potion of Invisibility: drink for Invisible 1 hour (60 PC turns), breaks on attack, damage, or spell. */

export const INVISIBILITY_POTION_ITEM_ID = "potion_of_invisibility";
export const INVISIBILITY_POTION_INVENTORY = "potion_invisibility";
export const INVISIBILITY_POTION_ABILITY_ID = "use_potion_invisibility";
export const INVISIBILITY_POTION_EFFECT_ID = "potion_invisibility";
export const INVISIBILITY_POTION_DURATION_PC_TURNS = 60;

export type InvisibilityPotionDef = {
  itemId: string;
  inventoryToken: string;
  abilityId: string;
  durationPcTurns: number;
  actionName: string;
};

export const INVISIBILITY_POTION: InvisibilityPotionDef = {
  itemId: INVISIBILITY_POTION_ITEM_ID,
  inventoryToken: INVISIBILITY_POTION_INVENTORY,
  abilityId: INVISIBILITY_POTION_ABILITY_ID,
  durationPcTurns: INVISIBILITY_POTION_DURATION_PC_TURNS,
  actionName: "Use Object: Potion of Invisibility",
};

export function invisibilityPotionByItemId(itemId: string): InvisibilityPotionDef | undefined {
  return itemId === INVISIBILITY_POTION.itemId ? INVISIBILITY_POTION : undefined;
}

export function invisibilityPotionByInventory(token: string): InvisibilityPotionDef | undefined {
  return token === INVISIBILITY_POTION.inventoryToken ? INVISIBILITY_POTION : undefined;
}

export function invisibilityPotionByAbility(abilityId: string): InvisibilityPotionDef | undefined {
  return abilityId === INVISIBILITY_POTION.abilityId ? INVISIBILITY_POTION : undefined;
}

export function hasPotionInvisibility(token: { timedEffects?: Array<{ spellId?: string }> }): boolean {
  return token.timedEffects?.some((row) => row.spellId === INVISIBILITY_POTION_EFFECT_ID) ?? false;
}

/** Drop potion invisibility; keep invisible if a concentration Invisibility spell is still up on this token. */
export function endPotionInvisibility(token: {
  invisible?: boolean;
  concentrating?: { spellId: string; targetId?: string };
  timedEffects?: Array<{ label: string; pcTurnsLeft: number; spellId?: string }>;
  id?: string;
}): void {
  if (!hasPotionInvisibility(token)) return;
  const next = (token.timedEffects ?? []).filter((row) => row.spellId !== INVISIBILITY_POTION_EFFECT_ID);
  token.timedEffects = next.length ? next : undefined;
  const spellInvis =
    token.concentrating?.spellId === "spell_invisibility" &&
    (!token.concentrating.targetId || token.concentrating.targetId === token.id);
  if (!spellInvis) token.invisible = false;
}
