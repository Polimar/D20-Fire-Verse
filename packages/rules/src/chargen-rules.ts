import type { AbilityKey, ClassProgress, HeroRules } from "./content-types.js";

export type MulticlassGate = {
  allOf?: Array<{ ability: AbilityKey; min: number }>;
  anyOf?: Array<{ ability: AbilityKey; min: number }>;
};

export function meetsMulticlass(abilities: Record<AbilityKey, number>, gate: MulticlassGate): boolean {
  const all = (gate.allOf ?? []).every((row) => (abilities[row.ability] ?? 0) >= row.min);
  const any = !gate.anyOf?.length || gate.anyOf.some((row) => (abilities[row.ability] ?? 0) >= row.min);
  return all && any;
}

/** Level 1 is one class. A second class is only a level-up choice. */
export function canAddClass(hero: { level: number; classes: ClassProgress[] }, atLevelUp: boolean): boolean {
  if (hero.classes.length === 0) return true;
  if (hero.classes.length >= 1 && !atLevelUp) return false;
  return atLevelUp;
}

export function defaultLevelPicks(input: {
  classId: string;
  primary: AbilityKey;
  subclasses: string[];
  spells: string[];
  feats: string[];
}): { subclass?: string; ability: AbilityKey; spell?: string; feat?: string } {
  return {
    subclass: input.subclasses[0],
    ability: input.primary,
    spell: input.spells[0],
    feat: input.feats[0],
  };
}

export function heroSpellcaster(classes: ReadonlyArray<{ caster: string }>): boolean {
  return classes.some((c) => c.caster !== "none");
}

export function blankHero(partial: Pick<HeroRules, "id" | "name" | "species" | "alignment" | "classes" | "abilities">): HeroRules {
  return {
    xp: 0,
    level: 1,
    proficiency: [],
    features: [],
    spells: [],
    ...partial,
  };
}
