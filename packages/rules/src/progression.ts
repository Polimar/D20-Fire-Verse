/**
 * One level at a time. Spell choices exist only when the class imported a spellProgression.
 * Hit points use the fixed average (hit die / 2 + 1) plus Constitution.
 */

import type { AbilityKey, ClassProgress, HeroRules } from "./content-types.js";
import { averageHitDie, levelForXp } from "./xp.js";

export type ClassSlice = {
  id: string;
  hitDie: number;
  caster: "none" | "full" | "half" | "pact" | "third";
  spellProgression?: { mode: "prepared" | "known" | "pact" };
  primary: AbilityKey[];
  multiclass: { allOf?: Array<{ ability: AbilityKey; min: number }>; anyOf?: Array<{ ability: AbilityKey; min: number }> };
  levels: Array<{
    level: number;
    proficiencyBonus: number;
    features: string[];
    spellSlots?: Record<string, number>;
    pactSlots?: { slotLevel: number; count: number };
    cantrips?: number;
    preparedSpells?: number;
    spellsKnown?: number;
  }>;
};

export type SubclassSlice = { id: string; classId: string; name: string; level: number; features: string[] };
export type FeatSlice = { id: string; name: string; prerequisites?: string[] };
export type SpellSlice = { id: string; name: string; level: number; classes: string[] };
export type SpeciesSlice = { id: string; hpPerLevel?: number; speedFt?: number };

export type CatalogSlice = {
  classes: ClassSlice[];
  subclasses: SubclassSlice[];
  feats: FeatSlice[];
  spells: SpellSlice[];
  species?: SpeciesSlice[];
  xpThresholds: number[];
};

export type PendingAsk =
  | { kind: "class"; atLevel: number }
  | { kind: "subclass"; atLevel: number; classId: string }
  | { kind: "asi"; atLevel: number; classId: string; epic: boolean }
  | { kind: "spells"; atLevel: number; classId: string; cantrips: number; spells: number };

export type LevelPick =
  | { kind: "class"; classId: string }
  | { kind: "subclass"; subclassId: string }
  | { kind: "asi"; mode: "plus2"; ability: AbilityKey }
  | { kind: "asi"; mode: "plus1"; abilities: [AbilityKey, AbilityKey] }
  | { kind: "feat"; featId: string }
  | { kind: "spells"; spells: string[]; cantrips: string[] };

export type ProgressionHero = HeroRules & {
  cantrips: string[];
  pending: PendingAsk[];
  maxHp: number;
};

function classDef(catalog: CatalogSlice, id: string): ClassSlice | undefined {
  return catalog.classes.find((row) => row.id === id);
}

function levelRow(def: ClassSlice, classLevel: number) {
  return def.levels.find((row) => row.level === classLevel);
}

function mod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function hpAtLevelOne(def: ClassSlice, conScore: number, species?: SpeciesSlice): number {
  return Math.max(1, def.hitDie + mod(conScore) + (species?.hpPerLevel ?? 0));
}

export function hpGain(def: ClassSlice, conScore: number, species?: SpeciesSlice): number {
  return Math.max(1, averageHitDie(def.hitDie) + mod(conScore) + (species?.hpPerLevel ?? 0));
}

function needsSubclass(features: string[]): boolean {
  return features.some((feature) => /subclass/i.test(feature));
}

function needsAsi(features: string[]): boolean {
  return features.some((feature) => /ability score improvement|epic boon/i.test(feature));
}

function epic(features: string[]): boolean {
  return features.some((feature) => /epic boon/i.test(feature));
}

export function multiclassSlots(hero: ProgressionHero, catalog: CatalogSlice): { slots: Record<string, number>; pact?: { slotLevel: number; count: number } } {
  let levels = 0;
  let pact: { slotLevel: number; count: number } | undefined;
  for (const progress of hero.classes) {
    const def = classDef(catalog, progress.id);
    if (!def) continue;
    if (def.caster === "full") levels += progress.level;
    else if (def.caster === "half") levels += Math.floor(progress.level / 2);
    else if (def.caster === "pact") pact = levelRow(def, progress.level)?.pactSlots ?? pact;
  }
  const wizard = catalog.classes.find((row) => row.caster === "full" && row.levels.some((level) => level.spellSlots));
  const slots = levels > 0 ? { ...(wizard ? levelRow(wizard, Math.min(20, levels))?.spellSlots ?? {} : {}) } : {};
  return { slots, ...(pact ? { pact } : {}) };
}

export function asksForClassLevel(def: ClassSlice, classLevel: number, hadSubclass: boolean): PendingAsk["kind"][] {
  const row = levelRow(def, classLevel);
  const features = row?.features ?? [];
  const asks: PendingAsk["kind"][] = [];
  if (needsSubclass(features) && !hadSubclass) asks.push("subclass");
  if (needsAsi(features)) asks.push("asi");
  const prev = levelRow(def, classLevel - 1);
  const spellGain = (row?.preparedSpells ?? row?.spellsKnown ?? 0) - (prev?.preparedSpells ?? prev?.spellsKnown ?? 0);
  const cantripGain = (row?.cantrips ?? 0) - (prev?.cantrips ?? 0);
  if ((spellGain > 0 || cantripGain > 0) && def.spellProgression) asks.push("spells");
  return asks;
}

/** Queue the next unanswered choice. Levels do not advance past an open choice. */
export function nextAsk(hero: ProgressionHero, catalog: CatalogSlice): PendingAsk | null {
  if (hero.pending[0]) return hero.pending[0];
  const target = levelForXp(hero.xp, catalog.xpThresholds);
  if (hero.level >= target || hero.level >= 20) return null;
  return { kind: "class", atLevel: hero.level + 1 };
}

export function applyPick(hero: ProgressionHero, pick: LevelPick, catalog: CatalogSlice): ProgressionHero {
  const ask = nextAsk(hero, catalog);
  if (!ask) throw new Error("NO_LEVEL");
  if (pick.kind !== ask.kind && !(ask.kind === "asi" && pick.kind === "feat")) throw new Error("LEVEL_CHOICE");
  const next: ProgressionHero = {
    ...hero,
    classes: hero.classes.map((row) => ({ ...row })),
    abilities: { ...hero.abilities },
    features: [...hero.features],
    spells: [...hero.spells],
    cantrips: [...hero.cantrips],
    pending: hero.pending.slice(1),
  };
  const species = catalog.species?.find((row) => row.id === hero.species);
  if (pick.kind === "class") {
    const def = classDef(catalog, pick.classId);
    if (!def) throw new Error("CLASS_DISABLED");
    const existing = next.classes.find((row) => row.id === pick.classId);
    if (!existing) {
      const gate = def.multiclass;
      const okAll = (gate.allOf ?? []).every((row) => next.abilities[row.ability] >= row.min);
      const okAny = !gate.anyOf?.length || gate.anyOf.some((row) => next.abilities[row.ability] >= row.min);
      if (!okAll || !okAny) throw new Error("MULTICLASS_PREREQ");
      next.classes.push({ id: pick.classId, level: 1 });
    } else {
      existing.level += 1;
    }
    const progress = next.classes.find((row) => row.id === pick.classId)!;
    const row = levelRow(def, progress.level);
    for (const feature of row?.features ?? []) {
      if (!next.features.includes(feature)) next.features.push(feature);
    }
    next.maxHp += progress.level === 1 && next.classes.length > 1 ? hpGain(def, next.abilities.con, species) : hpGain(def, next.abilities.con, species);
    next.level += 1;
    const follow = asksForClassLevel(def, progress.level, Boolean(progress.subclass)).map((kind): PendingAsk => {
      if (kind === "subclass") return { kind, atLevel: next.level, classId: pick.classId };
      if (kind === "asi") return { kind, atLevel: next.level, classId: pick.classId, epic: epic(row?.features ?? []) };
      const current = levelRow(def, progress.level);
      const prev = levelRow(def, progress.level - 1);
      return {
        kind: "spells",
        atLevel: next.level,
        classId: pick.classId,
        cantrips: Math.max(0, (current?.cantrips ?? 0) - (prev?.cantrips ?? 0)),
        spells: Math.max(0, (current?.preparedSpells ?? current?.spellsKnown ?? 0) - (prev?.preparedSpells ?? prev?.spellsKnown ?? 0)),
      };
    });
    next.pending = follow;
    return next;
  }
  if (ask.kind === "subclass" && pick.kind === "subclass") {
    const sub = catalog.subclasses.find((row) => row.id === pick.subclassId && row.classId === ask.classId);
    if (!sub) throw new Error("BAD_SUBCLASS");
    const progress = next.classes.find((row) => row.id === ask.classId);
    if (progress) progress.subclass = sub.id;
    for (const feature of sub.features) {
      if (!next.features.includes(feature)) next.features.push(feature);
    }
    return next;
  }
  if (ask.kind === "asi" && pick.kind === "asi") {
    if (pick.mode === "plus2") next.abilities[pick.ability] = Math.min(20, next.abilities[pick.ability] + 2);
    else {
      if (pick.abilities[0] === pick.abilities[1]) throw new Error("ASI_DUP");
      for (const ability of pick.abilities) next.abilities[ability] = Math.min(20, next.abilities[ability] + 1);
    }
    return next;
  }
  if (ask.kind === "asi" && pick.kind === "feat") {
    const feat = catalog.feats.find((row) => row.id === pick.featId);
    if (!feat) throw new Error("BAD_FEAT");
    if (!next.features.includes(feat.id)) next.features.push(feat.id);
    return next;
  }
  if (ask.kind === "spells" && pick.kind === "spells") {
    const def = classDef(catalog, ask.classId);
    if (!def?.spellProgression) throw new Error("NO_SPELL_PROGRESSION");
    const legal = new Set(catalog.spells.filter((spell) => spell.classes.includes(ask.classId)).map((spell) => spell.id));
    for (const id of [...pick.spells, ...pick.cantrips]) {
      if (!legal.has(id)) throw new Error("BAD_SPELL");
    }
    if (pick.spells.length < ask.spells || pick.cantrips.length < ask.cantrips) throw new Error("NEED_SPELLS");
    next.spells.push(...pick.spells);
    next.cantrips.push(...pick.cantrips);
    return next;
  }
  throw new Error("LEVEL_CHOICE");
}

export function blankProgress(hero: HeroRules, catalog: CatalogSlice): ProgressionHero {
  const def = classDef(catalog, hero.classes[0]?.id ?? "");
  const species = catalog.species?.find((row) => row.id === hero.species);
  return {
    ...hero,
    cantrips: [],
    pending: [],
    maxHp: def ? hpAtLevelOne(def, hero.abilities.con, species) : hero.level,
  };
}
