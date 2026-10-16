/**
 * One level at a time. Spell choices exist only when the class imported a spellProgression.
 * Hit points use the fixed average (hit die / 2 + 1) plus Constitution.
 * A class never rises past its `cap`: the highest level whose features the engine runs.
 */

import type { AbilityKey, ClassProgress, HeroRules } from "./content-types.js";
import { averageHitDie, levelForXp } from "./xp.js";

export type ClassSlice = {
  id: string;
  name?: string;
  hitDie: number;
  caster: "none" | "full" | "half" | "pact" | "third";
  spellProgression?: { mode: "prepared" | "known" | "pact" };
  primary: AbilityKey[];
  multiclass: { allOf?: Array<{ ability: AbilityKey; min: number }>; anyOf?: Array<{ ability: AbilityKey; min: number }> };
  skillList?: string[];
  /** Highest class level a hero may reach. Missing means 20. */
  cap?: number;
  levels: Array<{
    level: number;
    proficiencyBonus: number;
    features: string[];
    spellSlots?: Record<string, number>;
    pactSlots?: { slotLevel: number; count: number };
    cantrips?: number;
    preparedSpells?: number;
    spellsKnown?: number;
    columns?: Record<string, string>;
  }>;
};

export type SubclassSlice = {
  id: string;
  classId: string;
  name: string;
  level: number;
  features: string[];
  featuresByLevel?: Array<{ level: number; features: string[] }>;
};
export type FeatSlice = { id: string; name: string; prerequisites?: string[]; description?: string };
export type SpellSlice = { id: string; name: string; level: number; classes: string[] };
export type SpeciesSlice = { id: string; name?: string; hpPerLevel?: number; speedFt?: number };

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
  | { kind: "spells"; atLevel: number; classId: string; cantrips: number; spells: number }
  | { kind: "fighting_style"; atLevel: number; classId: string }
  | { kind: "skill"; atLevel: number; classId: string; count: number };

export type LevelPick =
  | { kind: "class"; classId: string }
  | { kind: "subclass"; subclassId: string }
  | { kind: "asi"; mode: "plus2"; ability: AbilityKey }
  | { kind: "asi"; mode: "plus1"; abilities: [AbilityKey, AbilityKey] }
  | { kind: "feat"; featId: string }
  | { kind: "spells"; spells: string[]; cantrips: string[] }
  | { kind: "fighting_style"; featId: string }
  | { kind: "skill"; skills: string[] };

export type ProgressionHero = HeroRules & {
  cantrips: string[];
  pending: PendingAsk[];
  maxHp: number;
};

export type FeatCategory = "origin" | "general" | "fighting_style" | "epic";

/** The SRD opens every feat with its category in italics, e.g. "_General Feat (Prerequisite: Level 4+)_". */
export function featCategory(feat: FeatSlice): FeatCategory {
  const head = feat.description ?? "";
  if (/^_?Origin Feat/i.test(head)) return "origin";
  if (/^_?Fighting Style Feat/i.test(head)) return "fighting_style";
  if (/^_?Epic Boon Feat/i.test(head)) return "epic";
  return "general";
}

/** Minimum character level a feat names, 1 when it names none. */
export function featMinLevel(feat: FeatSlice): number {
  const text = [feat.description ?? "", ...(feat.prerequisites ?? [])].join(" ");
  return Number(text.match(/Level (\d+)\+/i)?.[1] ?? 1);
}

function classDef(catalog: CatalogSlice, id: string): ClassSlice | undefined {
  return catalog.classes.find((row) => row.id === id);
}

function levelRow(def: ClassSlice, classLevel: number) {
  return def.levels.find((row) => row.level === classLevel);
}

function mod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function classCap(def: ClassSlice): number {
  return Math.max(0, Math.min(20, def.cap ?? 20));
}

export function hpAtLevelOne(def: ClassSlice, conScore: number, species?: SpeciesSlice): number {
  return Math.max(1, def.hitDie + mod(conScore) + (species?.hpPerLevel ?? 0));
}

export function hpGain(def: ClassSlice, conScore: number, species?: SpeciesSlice): number {
  return Math.max(1, averageHitDie(def.hitDie) + mod(conScore) + (species?.hpPerLevel ?? 0));
}

/** "Barbarian Subclass" opens the choice; "Subclass feature" is a later grant. */
function needsSubclass(features: string[]): boolean {
  return features.some((feature) => /\bsubclass$/i.test(feature.trim()));
}

function needsAsi(features: string[]): boolean {
  return features.some((feature) => /ability score improvement|epic boon/i.test(feature));
}

function needsFightingStyle(features: string[]): boolean {
  return features.some((feature) => /^(additional )?fighting style$/i.test(feature.trim()));
}

/** Features that hand out skill proficiencies from the class list at a later level. */
function skillGrant(features: string[]): number {
  return features.some((feature) => /^primal knowledge$/i.test(feature.trim())) ? 1 : 0;
}

function epic(features: string[]): boolean {
  return features.some((feature) => /epic boon/i.test(feature));
}

/** Subclass features granted at exactly this class level. */
export function subclassFeaturesAt(sub: SubclassSlice, classLevel: number): string[] {
  if (sub.featuresByLevel?.length) {
    return sub.featuresByLevel.filter((row) => row.level === classLevel).flatMap((row) => row.features);
  }
  return classLevel === sub.level ? sub.features : [];
}

/** Subclass features granted at or under this class level. */
export function subclassFeaturesUpTo(sub: SubclassSlice, classLevel: number): string[] {
  if (sub.featuresByLevel?.length) {
    return sub.featuresByLevel.filter((row) => row.level <= classLevel).flatMap((row) => row.features);
  }
  return classLevel >= sub.level ? sub.features : [];
}

export function multiclassSlots(hero: ProgressionHero, catalog: CatalogSlice): { slots: Record<string, number>; pact?: { slotLevel: number; count: number } } {
  let levels = 0;
  let pact: { slotLevel: number; count: number } | undefined;
  for (const progress of hero.classes) {
    const def = classDef(catalog, progress.id);
    if (!def) continue;
    if (def.caster === "full") levels += progress.level;
    else if (def.caster === "half") levels += Math.ceil(progress.level / 2);
    else if (def.caster === "pact") pact = levelRow(def, progress.level)?.pactSlots ?? pact;
  }
  const wizard = catalog.classes.find((row) => row.caster === "full" && row.levels.some((level) => level.spellSlots));
  const slots = levels > 0 ? { ...(wizard ? levelRow(wizard, Math.min(20, levels))?.spellSlots ?? {} : {}) } : {};
  return { slots, ...(pact ? { pact } : {}) };
}

function legalSpells(catalog: CatalogSlice, classId: string): SpellSlice[] {
  return catalog.spells.filter((spell) => spell.classes.includes(classId));
}

/** Highest spell level the class can cast at this class level. */
export function maxSpellLevel(def: ClassSlice, classLevel: number): number {
  const row = levelRow(def, classLevel);
  if (row?.pactSlots) return row.pactSlots.slotLevel;
  return Math.max(0, ...Object.entries(row?.spellSlots ?? {}).filter(([, n]) => n > 0).map(([slot]) => Number(slot)));
}

export function asksForClassLevel(def: ClassSlice, classLevel: number, hadSubclass: boolean): PendingAsk["kind"][] {
  const row = levelRow(def, classLevel);
  const features = row?.features ?? [];
  const asks: PendingAsk["kind"][] = [];
  if (needsSubclass(features) && !hadSubclass) asks.push("subclass");
  if (needsFightingStyle(features)) asks.push("fighting_style");
  if (skillGrant(features)) asks.push("skill");
  if (needsAsi(features)) asks.push("asi");
  const prev = levelRow(def, classLevel - 1);
  const spellGain = (row?.preparedSpells ?? row?.spellsKnown ?? 0) - (prev?.preparedSpells ?? prev?.spellsKnown ?? 0);
  const cantripGain = (row?.cantrips ?? 0) - (prev?.cantrips ?? 0);
  if ((spellGain > 0 || cantripGain > 0 || classLevel === 1) && def.spellProgression) asks.push("spells");
  return asks;
}

/** Classes this hero may take its next level in: under the class cap, and past the multiclass gate when new. */
export function levelableClasses(hero: ProgressionHero, catalog: CatalogSlice): string[] {
  return catalog.classes
    .filter((def) => {
      const current = hero.classes.find((row) => row.id === def.id);
      if ((current?.level ?? 0) + 1 > classCap(def)) return false;
      if (current) return true;
      if (!hero.classes.length) return true;
      const gate = def.multiclass;
      const okAll = (gate.allOf ?? []).every((row) => hero.abilities[row.ability] >= row.min);
      const okAny = !gate.anyOf?.length || gate.anyOf.some((row) => hero.abilities[row.ability] >= row.min);
      return okAll && okAny;
    })
    .map((def) => def.id);
}

/** Queue the next unanswered choice. Levels do not advance past an open choice or the class caps. */
export function nextAsk(hero: ProgressionHero, catalog: CatalogSlice): PendingAsk | null {
  if (hero.pending[0]) return hero.pending[0];
  const target = levelForXp(hero.xp, catalog.xpThresholds);
  if (hero.level >= target || hero.level >= 20) return null;
  if (!levelableClasses(hero, catalog).length) return null;
  return { kind: "class", atLevel: hero.level + 1 };
}

function spellAsk(def: ClassSlice, classLevel: number, atLevel: number, known: Set<string>, catalog: CatalogSlice): PendingAsk | null {
  const row = levelRow(def, classLevel);
  const prev = levelRow(def, classLevel - 1);
  const top = maxSpellLevel(def, classLevel);
  const legal = legalSpells(catalog, def.id).filter((spell) => !known.has(spell.id));
  const openCantrips = legal.filter((spell) => spell.level === 0).length;
  const openSpells = legal.filter((spell) => spell.level > 0 && spell.level <= top).length;
  const cantrips = Math.min(openCantrips, Math.max(0, (row?.cantrips ?? 0) - (prev?.cantrips ?? 0)));
  const spells = Math.min(openSpells, Math.max(0, (row?.preparedSpells ?? row?.spellsKnown ?? 0) - (prev?.preparedSpells ?? prev?.spellsKnown ?? 0)));
  if (!cantrips && !spells) return null;
  return { kind: "spells", atLevel, classId: def.id, cantrips, spells };
}

function grant(next: ProgressionHero, features: string[]): void {
  for (const feature of features) {
    if (!next.features.includes(feature)) next.features.push(feature);
  }
}

/** The choices one class level opens, in the order the hero answers them. */
function followUps(next: ProgressionHero, def: ClassSlice, progress: ClassProgress, catalog: CatalogSlice): PendingAsk[] {
  const row = levelRow(def, progress.level);
  const known = new Set([...next.spells, ...next.cantrips]);
  const out: PendingAsk[] = [];
  for (const kind of asksForClassLevel(def, progress.level, Boolean(progress.subclass))) {
    if (kind === "subclass") {
      if (catalog.subclasses.some((sub) => sub.classId === def.id)) out.push({ kind, atLevel: next.level, classId: def.id });
    } else if (kind === "asi") {
      out.push({ kind, atLevel: next.level, classId: def.id, epic: epic(row?.features ?? []) });
    } else if (kind === "fighting_style") {
      if (catalog.feats.some((feat) => featCategory(feat) === "fighting_style" && !next.features.includes(feat.id))) {
        out.push({ kind, atLevel: next.level, classId: def.id });
      }
    } else if (kind === "skill") {
      const open = (def.skillList ?? []).filter((skill) => !next.proficiency.includes(skill));
      const count = Math.min(open.length, skillGrant(row?.features ?? []));
      if (count) out.push({ kind, atLevel: next.level, classId: def.id, count });
    } else if (def.spellProgression) {
      const ask = spellAsk(def, progress.level, next.level, known, catalog);
      if (ask) out.push(ask);
    }
  }
  return out;
}

export function applyPick(hero: ProgressionHero, pick: LevelPick, catalog: CatalogSlice): ProgressionHero {
  const ask = nextAsk(hero, catalog);
  if (!ask) throw new Error("NO_LEVEL");
  if (pick.kind !== ask.kind && !(ask.kind === "asi" && pick.kind === "feat")) throw new Error("LEVEL_CHOICE");
  const next: ProgressionHero = {
    ...hero,
    classes: hero.classes.map((row) => ({ ...row })),
    abilities: { ...hero.abilities },
    proficiency: [...hero.proficiency],
    features: [...hero.features],
    spells: [...hero.spells],
    cantrips: [...hero.cantrips],
    pending: hero.pending.slice(1),
  };
  const species = catalog.species?.find((row) => row.id === hero.species);
  if (pick.kind === "class") {
    const def = classDef(catalog, pick.classId);
    if (!def) throw new Error("CLASS_DISABLED");
    if (!levelableClasses(hero, catalog).includes(def.id)) {
      const current = hero.classes.find((row) => row.id === def.id);
      throw new Error((current?.level ?? 0) + 1 > classCap(def) ? "CLASS_LEVEL_CAP" : "MULTICLASS_PREREQ");
    }
    const existing = next.classes.find((row) => row.id === pick.classId);
    if (!existing) next.classes.push({ id: pick.classId, level: 1 });
    else existing.level += 1;
    const progress = next.classes.find((row) => row.id === pick.classId)!;
    grant(next, levelRow(def, progress.level)?.features ?? []);
    const sub = progress.subclass ? catalog.subclasses.find((row) => row.id === progress.subclass) : undefined;
    if (sub) grant(next, subclassFeaturesAt(sub, progress.level));
    next.maxHp += hpGain(def, next.abilities.con, species);
    next.level += 1;
    next.pending = followUps(next, def, progress, catalog);
    if (sub && subclassFeaturesAt(sub, progress.level).some((feature) => /^additional fighting style$/i.test(feature))) {
      next.pending.push({ kind: "fighting_style", atLevel: next.level, classId: def.id });
    }
    return next;
  }
  if (ask.kind === "subclass" && pick.kind === "subclass") {
    const sub = catalog.subclasses.find((row) => row.id === pick.subclassId && row.classId === ask.classId);
    if (!sub) throw new Error("BAD_SUBCLASS");
    const progress = next.classes.find((row) => row.id === ask.classId);
    if (progress) progress.subclass = sub.id;
    grant(next, subclassFeaturesUpTo(sub, progress?.level ?? sub.level));
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
    const category = featCategory(feat);
    if (category === "epic" ? !ask.epic : category !== "general" && category !== "fighting_style") throw new Error("BAD_FEAT");
    if (featMinLevel(feat) > next.level) throw new Error("FEAT_LEVEL");
    if (next.features.includes(feat.id)) throw new Error("FEAT_TAKEN");
    next.features.push(feat.id);
    return next;
  }
  if (ask.kind === "fighting_style" && pick.kind === "fighting_style") {
    const feat = catalog.feats.find((row) => row.id === pick.featId);
    if (!feat || featCategory(feat) !== "fighting_style") throw new Error("BAD_FEAT");
    if (next.features.includes(feat.id)) throw new Error("FEAT_TAKEN");
    next.features.push(feat.id);
    return next;
  }
  if (ask.kind === "skill" && pick.kind === "skill") {
    const def = classDef(catalog, ask.classId);
    const open = (def?.skillList ?? []).filter((skill) => !next.proficiency.includes(skill));
    if (pick.skills.length !== ask.count || pick.skills.some((skill) => !open.includes(skill)) || new Set(pick.skills).size !== pick.skills.length) {
      throw new Error("BAD_SKILL");
    }
    next.proficiency.push(...pick.skills);
    return next;
  }
  if (ask.kind === "spells" && pick.kind === "spells") {
    const def = classDef(catalog, ask.classId);
    if (!def?.spellProgression) throw new Error("NO_SPELL_PROGRESSION");
    const progress = next.classes.find((row) => row.id === ask.classId);
    const top = maxSpellLevel(def, progress?.level ?? 1);
    const legal = new Map(legalSpells(catalog, ask.classId).map((spell) => [spell.id, spell]));
    for (const id of pick.cantrips) {
      if (legal.get(id)?.level !== 0) throw new Error("BAD_SPELL");
    }
    for (const id of pick.spells) {
      const spell = legal.get(id);
      if (!spell || spell.level === 0 || spell.level > top) throw new Error("BAD_SPELL");
    }
    const all = [...pick.spells, ...pick.cantrips];
    if (new Set(all).size !== all.length || all.some((id) => next.spells.includes(id) || next.cantrips.includes(id))) throw new Error("SPELL_TAKEN");
    if (pick.spells.length !== ask.spells || pick.cantrips.length !== ask.cantrips) throw new Error("NEED_SPELLS");
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

/** Level 1 grants and choices for a brand-new hero of this class. */
export function firstLevel(hero: ProgressionHero, catalog: CatalogSlice): ProgressionHero {
  const def = classDef(catalog, hero.classes[0]?.id ?? "");
  if (!def) return hero;
  const next: ProgressionHero = { ...hero, features: [...hero.features], pending: [] };
  grant(next, levelRow(def, 1)?.features ?? []);
  next.pending = followUps(next, def, next.classes[0]!, catalog);
  return next;
}
