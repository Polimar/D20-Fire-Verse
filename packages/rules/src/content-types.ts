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
    | { kind: "on_hit_rider"; damage: string; damageType?: string }
    | { kind: "resistance"; damageType: string }
    | { kind: "immunity"; damageType: string }
    | { kind: "grant_spell"; spellId: string }
    | { kind: "grant_feature"; featureId: string }
    | { kind: "stat_set"; ability: AbilityKey; score: number }
    | { kind: "stat_drink"; ability: AbilityKey; score: number; durationPcTurns?: number }
    | { kind: "stat_increase_cap"; ability: AbilityKey; cap: number }
    | { kind: "save_bonus"; amount: number }
    | { kind: "heal_drink"; dice: string }
    | { kind: "invisibility_drink"; durationPcTurns?: number }
    | {
        kind: "grant_aura" | "plant_aura";
        radiusCells: number;
        filter: "ally" | "enemy" | "all";
        excludeSource?: boolean;
        creatureTypes?: string[];
        ac?: number;
        saves?: number;
        stealth?: number;
        saveAdv?: "all" | "vs_magic";
        attackDisadvAgainst?: boolean;
        resistances?: string[];
        speedMult?: number;
        strip?: Array<"frightened" | "charmed">;
        heavilyObscured?: boolean;
        difficultTerrainFor?: "enemy";
        onStartTurn?: { dice?: string; damageType?: string; heal?: number; saveAbility?: AbilityKey; saveDc?: number };
        onEnterOrEndTurn?: { dice?: string; damageType?: string; heal?: number; saveAbility?: AbilityKey; saveDc?: number };
        blocksMovement?: boolean;
        blocksSpellsFromOutside?: boolean;
      }
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
