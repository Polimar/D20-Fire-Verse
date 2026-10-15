import type { ItemRules } from "./content-types.js";

export type ItemArmoryInput = ItemRules & {
  weapon?: {
    category: string;
    damage: string;
    damageType: string;
    properties: string[];
    rangeFt?: { normal: number; long: number };
    versatile?: string;
  };
  armor?: {
    category: "light" | "medium" | "heavy" | "shield";
    baseAc: number;
    dexCap: number | null;
    strength?: number;
    stealthDisadvantage: boolean;
  };
  charges?: number;
};

export type ItemArmoryCopy = {
  /** What the item is (type, damage, AC, requirements). */
  description: string;
  /** Bonuses while equipped (typed effects + mastery). */
  equippedBonus: string;
};

const MASTERY_LABEL: Record<string, string> = {
  cleave: "Cleave — splash damage to a second foe on a hit",
  graze: "Graze — chip damage on a miss (melee)",
  nick: "Nick — extra attack as part of the Attack action",
  push: "Push — shove the target on a hit",
  sap: "Sap — target has disadvantage on its next attack",
  slow: "Slow — reduce the target's speed on a hit",
  topple: "Topple — knock the target prone on a hit",
  vex: "Vex — advantage on your next attack against the target",
};

function prettyType(raw: string): string {
  return raw.replace(/_/g, " ");
}

function effectLine(effect: ItemRules["effects"][number]): string {
  switch (effect.kind) {
    case "ac_bonus":
      return `+${effect.amount} AC`;
    case "save_bonus":
      return `+${effect.amount} to saving throws`;
    case "grant_aura":
      return `Aura ${effect.radiusCells * 5} ft`;
    case "plant_aura":
      return `Plant aura ${effect.radiusCells * 5} ft`;
    case "attack_bonus":
      return `+${effect.amount} to attack rolls`;
    case "damage_bonus":
      return `+${effect.amount} damage${effect.damageType ? ` (${prettyType(effect.damageType)})` : ""}`;
    case "on_hit_rider":
      return effect.damageType
        ? `+${effect.damage} ${prettyType(effect.damageType)} on each hit`
        : `+${effect.damage} on each hit (weapon's damage type)`;
    case "heal_drink":
      return `Drink to regain ${effect.dice} HP`;
    case "invisibility_drink":
      return "Drink to become invisible for about an hour";
    case "resistance":
      return `Resistance to ${prettyType(effect.damageType)}`;
    case "immunity":
      return `Immunity to ${prettyType(effect.damageType)}`;
    case "grant_spell":
      return `Cast ${prettyType(effect.spellId)}`;
    case "grant_feature":
      return `Grants ${prettyType(effect.featureId)}`;
    case "stat_set":
      return `${effect.ability.toUpperCase()} becomes ${effect.score}`;
    case "stat_drink":
      return `Drink to set ${effect.ability.toUpperCase()} to ${effect.score}`;
    case "stat_increase_cap":
      return `${effect.ability.toUpperCase()} can rise to ${effect.cap}`;
    default:
      return "Special effect";
  }
}

function requirementBits(item: ItemArmoryInput): string[] {
  const req = item.requires;
  if (!req) return [];
  const bits: string[] = [];
  if (req.minLevel) bits.push(`level ${req.minLevel}+`);
  if (req.attunement) bits.push("attunement");
  if (req.class?.length) bits.push(req.class.map(prettyType).join(" or "));
  if (req.species?.length) bits.push(req.species.map(prettyType).join(" or "));
  if (req.spellcaster) bits.push("spellcaster");
  return bits;
}

function baseDescription(item: ItemArmoryInput): string {
  const req = requirementBits(item);
  const reqText = req.length ? ` · ${req.join(" · ")}` : "";
  if (item.weapon) {
    const w = item.weapon;
    const props = w.properties?.length ? w.properties.join(", ") : "no special properties";
    const range = w.rangeFt ? ` · range ${w.rangeFt.normal}/${w.rangeFt.long} ft` : "";
    const versatile = w.versatile ? ` · versatile ${w.versatile}` : "";
    return `${prettyType(w.category)} · ${w.damage} ${prettyType(w.damageType)} · ${props}${range}${versatile}${reqText}`;
  }
  if (item.armor) {
    const a = item.armor;
    if (a.category === "shield") {
      return `Shield · +${a.baseAc} AC${a.stealthDisadvantage ? " · stealth disadvantage" : ""}${reqText}`;
    }
    const dex =
      a.dexCap === null ? " + DEX" : a.dexCap > 0 ? ` + DEX (max ${a.dexCap})` : "";
    const str = a.strength ? ` · STR ${a.strength}+` : "";
    const stealth = a.stealthDisadvantage ? " · stealth disadvantage" : "";
    return `${prettyType(a.category)} armor · AC ${a.baseAc}${dex}${str}${stealth}${reqText}`;
  }
  const slot = prettyType(item.slot);
  const rarity = prettyType(item.rarity);
  const charges = item.charges ? ` · ${item.charges} charge${item.charges === 1 ? "" : "s"}` : "";
  return `${rarity} ${slot}${charges}${reqText}`;
}

/** Player-facing stash row copy (English UI). */
export function itemArmoryCopy(item: ItemArmoryInput): ItemArmoryCopy {
  const description = baseDescription(item);
  const bonusParts: string[] = item.effects.map(effectLine);
  if (item.weaponMastery) {
    bonusParts.push(MASTERY_LABEL[item.weaponMastery] ?? `Weapon mastery: ${item.weaponMastery}`);
  }
  if (!bonusParts.length && item.weapon) {
    bonusParts.push("Attack and damage use this weapon's dice and properties.");
  } else if (!bonusParts.length && item.armor) {
    bonusParts.push("Sets your armor class while worn.");
  } else if (!bonusParts.length && item.slot === "consumable") {
    bonusParts.push("Use from your loadout when the rules allow.");
  } else if (!bonusParts.length) {
    bonusParts.push("No extra numeric bonus — equip for the slot.");
  }
  return { description, equippedBonus: bonusParts.join(" · ") };
}
