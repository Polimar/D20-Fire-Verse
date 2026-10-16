import type { HeroRules, ItemRules, LoadoutSlots } from "./content-types.js";

export type PassiveBonuses = {
  ac: number;
  attack: number;
  damage: number;
  saves: number;
  resistances: string[];
  immunities: string[];
  grantedSpells: string[];
  grantedFeatures: string[];
  onHit: Array<{ damage: string; damageType?: string }>;
};

export type LoadoutView = {
  ac: number;
  speed: number;
  actionsFromGear: string[];
  passiveBonuses: PassiveBonuses;
  masteriesAvailable: string[];
};

const emptyBonus = (): PassiveBonuses => ({
  ac: 0,
  attack: 0,
  damage: 0,
  saves: 0,
  resistances: [],
  immunities: [],
  grantedSpells: [],
  grantedFeatures: [],
  onHit: [],
});

function applyEffects(bonus: PassiveBonuses, item: ItemRules): void {
  for (const effect of item.effects) {
    switch (effect.kind) {
      case "ac_bonus":
        bonus.ac += effect.amount;
        break;
      case "save_bonus":
        bonus.saves += effect.amount;
        break;
      case "grant_aura":
      case "plant_aura":
      case "heal_drink":
      case "stat_drink":
      case "invisibility_drink":
        break;
      case "attack_bonus":
        bonus.attack += effect.amount;
        break;
      case "damage_bonus":
        bonus.damage += effect.amount;
        break;
      case "on_hit_rider":
        bonus.onHit.push(
          effect.damageType !== undefined
            ? { damage: effect.damage, damageType: effect.damageType }
            : { damage: effect.damage },
        );
        break;
      case "resistance":
        bonus.resistances.push(effect.damageType);
        break;
      case "immunity":
        bonus.immunities.push(effect.damageType);
        break;
      case "grant_spell":
        bonus.grantedSpells.push(effect.spellId);
        break;
      case "grant_feature":
        bonus.grantedFeatures.push(effect.featureId);
        break;
      case "stat_set":
      case "stat_increase_cap":
      case "heal_drink":
      case "stat_drink":
      case "invisibility_drink":
      case "haste_drink":
      case "resistance_drink":
      case "animated_shield":
      case "cloak_invisibility":
      case "scroll_cast":
      case "save_bonus":
        break;
      default: {
        const neverEffect: never = effect;
        return neverEffect;
      }
    }
  }
}

export function recomputeFromLoadout(
  hero: HeroRules,
  slots: LoadoutSlots,
  items: ReadonlyMap<string, ItemRules>,
  baseAc = 10,
  baseSpeed = 6,
  /** When set, only these weapon kinds (item ids) grant mastery riders. */
  knownMasteryWeaponIds?: readonly string[],
): LoadoutView {
  const bonus = emptyBonus();
  const masteries: string[] = [];
  const ids = [slots.armor, slots.shield, slots.mainhand, slots.offhand, ...slots.trinkets, ...slots.consumables];
  const knowsMastery = hero.features.includes("weapon_mastery");
  for (const id of ids) {
    if (!id) continue;
    const item = items.get(id);
    if (!item) continue;
    applyEffects(bonus, item);
    const kindAllowed = !knownMasteryWeaponIds || knownMasteryWeaponIds.includes(id);
    if (knowsMastery && item.weaponMastery && kindAllowed) masteries.push(item.weaponMastery);
  }
  const dex = Math.floor((hero.abilities.dex - 10) / 2);
  const armored = Boolean(slots.armor && items.get(slots.armor));
  const ac = armored ? baseAc + bonus.ac : baseAc + dex + bonus.ac;
  return {
    ac,
    speed: baseSpeed,
    actionsFromGear: bonus.grantedSpells.map((id) => `spell_${id}`),
    passiveBonuses: bonus,
    masteriesAvailable: [...new Set(masteries)],
  };
}
