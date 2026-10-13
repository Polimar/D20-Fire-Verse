/** Shapes the rules engine reads. Stats stay in JSON; these are just the fields the math needs. */

export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export type ClassProgress = { id: string; level: number; subclass?: string };

export type HeroRules = {
  id: string;
  name: string;
  level: number;
  xp: number;
  species: string;
  alignment: string;
  classes: ClassProgress[];
  abilities: Record<AbilityKey, number>;
  proficiency: string[];
  features: string[];
  spells: string[];
};

export type ItemRules = {
  id: string;
  name: string;
  rarity: "common" | "uncommon" | "rare" | "very_rare" | "legendary";
  slot: "armor" | "shield" | "mainhand" | "offhand" | "trinket" | "consumable";
  weaponId?: string;
  weaponMastery?: "cleave" | "graze" | "nick" | "push" | "sap" | "slow" | "topple" | "vex";
  requires?: {
    species?: string[];
    class?: string[];
    alignment?: string[];
    minLevel?: number;
    minAbility?: Partial<Record<AbilityKey, number>>;
    proficiency?: string[];
    spellcaster?: boolean;
    attunement?: boolean;
  };
  effects: Array<
    | { kind: "ac_bonus"; amount: number }
    | { kind: "attack_bonus"; amount: number }
    | { kind: "damage_bonus"; amount: number; damageType?: string }
    | { kind: "on_hit_rider"; damage: string; damageType: string }
    | { kind: "resistance"; damageType: string }
    | { kind: "immunity"; damageType: string }
    | { kind: "grant_spell"; spellId: string }
    | { kind: "grant_feature"; featureId: string }
    | { kind: "stat_set"; ability: AbilityKey; score: number }
    | { kind: "stat_increase_cap"; ability: AbilityKey; cap: number }
  >;
};

export type LoadoutSlots = {
  armor?: string;
  shield?: string;
  mainhand?: string;
  offhand?: string;
  trinkets: string[];
  consumables: string[];
};
