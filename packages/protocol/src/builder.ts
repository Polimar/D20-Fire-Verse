/** PG Builder V2 — draft and derived sheet shapes shared by API and clients. */

export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export type BuilderAbilityMethod = "standard_array" | "point_buy" | "roll";

export type BackgroundAsi =
  | { mode: "plus2plus1"; plus2: AbilityKey; plus1: AbilityKey }
  | { mode: "plus1x3"; abilities: [AbilityKey, AbilityKey, AbilityKey] };

export type BuilderDraft = {
  name?: string;
  classId: string;
  speciesId: string;
  backgroundId: string;
  alignment?: string;
  /** Players are forced to 1; admins may set higher in commit. */
  level?: number;
  method: BuilderAbilityMethod;
  baseAbilities: Record<AbilityKey, number>;
  backgroundAsi?: BackgroundAsi;
  /** Human Skillful — one skill proficiency. */
  speciesSkill?: string;
  /** Human Versatile — origin feat id. */
  originFeatId?: string;
  classSkills: string[];
  fightingStyleFeatId?: string;
  cantrips?: string[];
  spellsPrepared?: string[];
  spellsKnown?: string[];
  /** Wizard spellbook picks (must include prepared). */
  spellbook?: string[];
  equipChoice?: "A" | "B" | "C";
  about?: string;
  languages?: string[];
  portraitId?: string;
};

export type DerivedSkillRow = {
  id: string;
  label: string;
  mod: number;
  proficient: boolean;
  expertise?: boolean;
};

export type DerivedAttackRow = {
  id: string;
  name: string;
  attackBonus: number;
  damage: string;
};

export type DerivedSheet = {
  name: string;
  level: number;
  className: string;
  speciesName: string;
  backgroundName: string;
  hp: number;
  ac: number;
  speedFt: number;
  proficiencyBonus: number;
  abilities: Record<AbilityKey, { score: number; mod: number }>;
  savingThrows: Array<{ ability: AbilityKey; mod: number; proficient: boolean }>;
  skills: DerivedSkillRow[];
  passivePerception: number;
  attacks: DerivedAttackRow[];
  spellSlots?: Record<string, number>;
  cantripIds?: string[];
  preparedSpellIds?: string[];
  features: string[];
  warnings: string[];
  ok: boolean;
  errors: string[];
};

export type BuilderCatalogClass = {
  id: string;
  name: string;
  skillChoices: number;
  skillList: string[];
  caster: string;
  spellAbility?: AbilityKey;
  level1: {
    cantrips?: number;
    preparedSpells?: number;
    spellsKnown?: number;
    spellbookSize?: number;
  };
  fightingStyleRequired?: boolean;
  fightingStyleFeatIds: string[];
  equipChoices: Array<{ id: "A" | "B" | "C"; label: string }>;
};

export type BuilderCatalog = {
  standardArray: number[];
  pointBuy: { budget: number; min: number; max: number };
  species: Array<{ id: string; name: string; traits: string[] }>;
  backgrounds: Array<{
    id: string;
    name: string;
    skills: string[];
    featId?: string;
    abilityOptions: AbilityKey[];
  }>;
  classes: BuilderCatalogClass[];
  feats: Array<{ id: string; name: string; category: string }>;
  spells: Array<{ id: string; name: string; level: number; classes: string[] }>;
  skills: Record<string, { label: string; ability: AbilityKey }>;
  portraits: Array<{ id: string; url: string }>;
};
