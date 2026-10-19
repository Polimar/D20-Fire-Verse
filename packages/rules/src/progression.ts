/**
 * One level at a time. Spell choices exist only when the class imported a spellProgression.
 * Hit points use the fixed average (hit die / 2 + 1) plus Constitution.
 * A class never rises past its `cap`: the highest level whose features the engine runs.
 */

import type { AbilityKey, ClassProgress, HeroRules } from "./content-types.js";
import { averageHitDie, levelForXp, thresholdForLevel } from "./xp.js";

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
export type FeatSlice = {
  id: string;
  name: string;
  prerequisites?: string[];
  description?: string;
  asiChoices?: AbilityKey[];
  repeatable?: boolean;
};
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
  | {
      kind: "spells";
      atLevel: number;
      classId: string;
      cantrips: number;
      /** New prepared / known spells for this level (table delta, or catch-up deficit). */
      spells: number;
      /** Wizard: new spells to copy into the spellbook (2 per wizard level after 1). */
      spellbook?: number;
    }
  | { kind: "fighting_style"; atLevel: number; classId: string }
  | { kind: "skill"; atLevel: number; classId: string; count: number }
  | {
      kind: "expertise";
      atLevel: number;
      classId: string;
      count: number;
      /** When set, only these proficient skills may be chosen (e.g. Wizard Scholar). */
      pool?: string[];
    }
  | { kind: "feature_choice"; atLevel: number; classId: string; featureId: string; options: string[]; count: number };

export type LevelPick =
  | { kind: "class"; classId: string }
  | { kind: "subclass"; subclassId: string }
  | { kind: "asi"; mode: "plus2"; ability: AbilityKey }
  | { kind: "asi"; mode: "plus1"; abilities: [AbilityKey, AbilityKey] }
  | { kind: "feat"; featId: string; ability?: AbilityKey }
  | { kind: "spells"; spells: string[]; cantrips: string[]; spellbook?: string[] }
  | { kind: "fighting_style"; featId: string }
  | { kind: "skill"; skills: string[] }
  | { kind: "expertise"; skills: string[] }
  | { kind: "feature_choice"; featureId: string; picks: string[] };

/** Wizard Scholar: expertise in one of these skills (must already be proficient). */
export const SCHOLAR_SKILLS = ["arcana", "history", "investigation", "medicine", "nature", "religion"] as const;

export function expertiseFlag(skill: string): string {
  return `expertise:${skill}`;
}

export function hasExpertise(features: readonly string[], skill: string): boolean {
  return features.includes(expertiseFlag(skill));
}

/** Subclass features that require a permanent pick (FireVerse pack). */
export const SUBCLASS_LEVEL_CHOICES: Record<string, string[]> = {
  aspect_of_the_wild: ["owl", "panther", "elephant"],
  hunters_prey: ["colossus_slayer", "horde_breaker"],
  defensive_tactics: ["escape_the_horde", "multiattack_defense"],
  dragon_ancestry: ["fire", "cold", "lightning", "acid", "poison"],
  circle_spells: ["arid", "polar", "temperate", "tropical"],
};

export type ProgressionHero = HeroRules & {
  cantrips: string[];
  /** Wizard (and similar) spellbook; prepared spells stay in `spells`. */
  spellbook?: string[];
  pending: PendingAsk[];
  maxHp: number;
};

/** SRD Wizard: 6 spells at 1st, +2 whenever you gain a Wizard level after 1. */
export function wizardSpellbookExpected(level: number): number {
  return 6 + Math.max(0, level - 1) * 2;
}

function wizardSpellbookGain(def: ClassSlice, classLevel: number): number {
  if (def.id !== "wizard" || !def.spellProgression || classLevel <= 1) return 0;
  return 2;
}

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

/**
 * Expertise picks at this level.
 * - Expertise (bard/rogue/ranger): 2 skills you are proficient in
 * - Deft Explorer (ranger 2): 1 skill
 * - Scholar (wizard 2): 1 skill from the Scholar list
 */
function expertiseGrant(features: string[]): { count: number; pool?: string[] } | null {
  if (features.some((feature) => /^expertise$/i.test(feature.trim()))) return { count: 2 };
  if (features.some((feature) => /^deft explorer$/i.test(feature.trim()))) return { count: 1 };
  if (features.some((feature) => /^scholar$/i.test(feature.trim()))) {
    return { count: 1, pool: [...SCHOLAR_SKILLS] };
  }
  return null;
}

/** Proficient skills eligible for a new Expertise pick. */
export function expertiseCandidates(
  hero: ProgressionHero,
  ask: Extract<PendingAsk, { kind: "expertise" }>,
): string[] {
  const base = ask.pool?.length
    ? ask.pool.filter((skill) => hero.proficiency.includes(skill))
    : [...hero.proficiency];
  return base.filter((skill) => !hasExpertise(hero.features, skill));
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
  if (expertiseGrant(features)) asks.push("expertise");
  if (needsAsi(features)) asks.push("asi");
  const prev = levelRow(def, classLevel - 1);
  const spellGain = (row?.preparedSpells ?? row?.spellsKnown ?? 0) - (prev?.preparedSpells ?? prev?.spellsKnown ?? 0);
  const cantripGain = (row?.cantrips ?? 0) - (prev?.cantrips ?? 0);
  const bookGain = wizardSpellbookGain(def, classLevel);
  if ((spellGain > 0 || cantripGain > 0 || bookGain > 0 || classLevel === 1) && def.spellProgression) asks.push("spells");
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

/**
 * Drop a stale L1 forge spell ask when the sheet already holds that full pick.
 * Level-up spell asks use *delta* counts (e.g. +1 prepared at wizard 2) — never prune those
 * by comparing against the hero's total known/prepared list.
 */
export function pruneSatisfiedPending(hero: ProgressionHero): PendingAsk[] {
  let pending = [...hero.pending];
  while (pending[0]?.kind === "spells") {
    const ask = pending[0];
    const forgeLeftover = ask.atLevel === 1 && hero.level <= 1;
    const bookNeed = ask.spellbook ?? 0;
    const bookHave = hero.spellbook?.length ?? 0;
    if (
      forgeLeftover &&
      hero.cantrips.length >= ask.cantrips &&
      hero.spells.length >= ask.spells &&
      (bookNeed === 0 || bookHave >= bookNeed)
    ) {
      pending = pending.slice(1);
      continue;
    }
    break;
  }
  return pending;
}

/**
 * Re-queue Expertise deficits (Scholar / Deft Explorer / Expertise features) when an older
 * level-up skipped the ask. Only when pending is empty.
 */
export function catchUpExpertiseAsk(hero: ProgressionHero, catalog: CatalogSlice): PendingAsk | null {
  for (const progress of hero.classes) {
    const def = classDef(catalog, progress.id);
    if (!def) continue;
    let need = 0;
    let pool: string[] | undefined;
    for (let level = 1; level <= progress.level; level++) {
      const grant = expertiseGrant(levelRow(def, level)?.features ?? []);
      if (!grant) continue;
      need += grant.count;
      if (grant.pool) pool = grant.pool;
    }
    const have = hero.features.filter((feature) => feature.startsWith("expertise:")).length;
    const deficit = need - have;
    if (deficit <= 0) continue;
    const ask: Extract<PendingAsk, { kind: "expertise" }> = {
      kind: "expertise",
      atLevel: hero.level,
      classId: def.id,
      count: deficit,
      ...(pool ? { pool } : {}),
    };
    if (expertiseCandidates(hero, ask).length >= deficit) return ask;
  }
  return null;
}

/**
 * Re-queue spell/spellbook deficits left behind when an older level-up skipped the ask
 * (e.g. prune bug). Uses table totals vs the sheet — only when pending is empty.
 */
export function catchUpSpellAsk(hero: ProgressionHero, catalog: CatalogSlice): PendingAsk | null {
  for (const progress of hero.classes) {
    const def = classDef(catalog, progress.id);
    if (!def?.spellProgression || progress.level < 1) continue;
    const row = levelRow(def, progress.level);
    const top = maxSpellLevel(def, progress.level);
    const book = new Set(hero.spellbook ?? []);
    const prepared = new Set(hero.spells);
    const cantrips = new Set(hero.cantrips);
    const legal = legalSpells(catalog, def.id);
    const openBook = legal.filter((s) => s.level > 0 && s.level <= top && !book.has(s.id)).length;
    const openPrep = legal.filter((s) => s.level > 0 && s.level <= top && !prepared.has(s.id)).length;
    const openCantrips = legal.filter((s) => s.level === 0 && !cantrips.has(s.id)).length;
    const bookNeed =
      def.id === "wizard"
        ? Math.min(openBook, Math.max(0, wizardSpellbookExpected(progress.level) - book.size))
        : 0;
    const prepNeed = Math.min(
      openPrep,
      Math.max(0, (row?.preparedSpells ?? row?.spellsKnown ?? 0) - hero.spells.length),
    );
    const cantripNeed = Math.min(openCantrips, Math.max(0, (row?.cantrips ?? 0) - hero.cantrips.length));
    if (!bookNeed && !prepNeed && !cantripNeed) continue;
    return {
      kind: "spells",
      atLevel: hero.level,
      classId: def.id,
      cantrips: cantripNeed,
      spells: prepNeed,
      ...(bookNeed ? { spellbook: bookNeed } : {}),
    };
  }
  return null;
}

export type NextAskOpts = {
  /** Admin testing: offer the next class level even when XP is short. */
  ignoreXp?: boolean;
};

/** Queue the next unanswered choice. Levels do not advance past an open choice or the class caps. */
export function nextAsk(hero: ProgressionHero, catalog: CatalogSlice, opts?: NextAskOpts): PendingAsk | null {
  const pending = pruneSatisfiedPending(hero);
  if (pending[0]) return pending[0];
  const spellCatchUp = catchUpSpellAsk(hero, catalog);
  if (spellCatchUp) return spellCatchUp;
  const expertiseCatchUp = catchUpExpertiseAsk(hero, catalog);
  if (expertiseCatchUp) return expertiseCatchUp;
  const target = opts?.ignoreXp ? hero.level + 1 : levelForXp(hero.xp, catalog.xpThresholds);
  if (hero.level >= target || hero.level >= 20) return null;
  if (!levelableClasses(hero, catalog).length) return null;
  return { kind: "class", atLevel: hero.level + 1 };
}

/** Default pick for a pending ask — used by profile / armory quick level-up and the rules lab. */
export function suggestLevelPick(hero: ProgressionHero, catalog: CatalogSlice, opts?: NextAskOpts): LevelPick | null {
  const ask = nextAsk(hero, catalog, opts);
  if (!ask) return null;
  if (ask.kind === "class") return { kind: "class", classId: hero.classes[0]?.id ?? catalog.classes[0]!.id };
  if (ask.kind === "subclass") {
    const sub = catalog.subclasses.find((row) => row.classId === ask.classId);
    if (!sub) return null;
    return { kind: "subclass", subclassId: sub.id };
  }
  if (ask.kind === "feature_choice") {
    return { kind: "feature_choice", featureId: ask.featureId, picks: ask.options.slice(0, ask.count) };
  }
  if (ask.kind === "asi") {
    const primary = catalog.classes.find((row) => row.id === ask.classId)?.primary[0] ?? "str";
    return { kind: "asi", mode: "plus2", ability: primary };
  }
  if (ask.kind === "fighting_style") {
    const feat = catalog.feats.find((row) => featCategory(row) === "fighting_style" && !hero.features.includes(row.id));
    if (!feat) return null;
    return { kind: "fighting_style", featId: feat.id };
  }
  if (ask.kind === "skill") {
    const list = catalog.classes.find((row) => row.id === ask.classId)?.skillList ?? [];
    const open = list.filter((skill) => !hero.proficiency.includes(skill)).slice(0, ask.count);
    if (open.length !== ask.count) return null;
    return { kind: "skill", skills: open };
  }
  if (ask.kind === "expertise") {
    const open = expertiseCandidates(hero, ask).slice(0, ask.count);
    if (open.length !== ask.count) return null;
    return { kind: "expertise", skills: open };
  }
  if (ask.kind === "spells") {
    const book = new Set(hero.spellbook ?? []);
    const known = new Set([...hero.spells, ...hero.cantrips]);
    const legal = catalog.spells.filter((spell) => spell.classes.includes(ask.classId));
    const cantrips = legal
      .filter((spell) => spell.level === 0 && !known.has(spell.id))
      .slice(0, ask.cantrips)
      .map((spell) => spell.id);
    const bookNeed = ask.spellbook ?? 0;
    const spellbook = legal
      .filter((spell) => spell.level > 0 && !book.has(spell.id) && !known.has(spell.id))
      .slice(0, bookNeed)
      .map((spell) => spell.id);
    const afterBook = new Set([...book, ...spellbook]);
    const prepPool = bookNeed
      ? legal.filter((spell) => spell.level > 0 && afterBook.has(spell.id) && !known.has(spell.id))
      : legal.filter((spell) => spell.level > 0 && !known.has(spell.id));
    const spells = prepPool.slice(0, ask.spells).map((spell) => spell.id);
    if (cantrips.length !== ask.cantrips || spells.length !== ask.spells || spellbook.length !== bookNeed) return null;
    return { kind: "spells", spells, cantrips, ...(bookNeed ? { spellbook } : {}) };
  }
  return null;
}

/** XP needed to unlock the next character level (or current floor). */
export function xpToReachLevel(level: number, thresholds: readonly number[]): number {
  return thresholdForLevel(level, thresholds);
}

function spellAsk(
  def: ClassSlice,
  classLevel: number,
  atLevel: number,
  known: Set<string>,
  catalog: CatalogSlice,
  book: Set<string> = new Set(),
): PendingAsk | null {
  const row = levelRow(def, classLevel);
  const prev = levelRow(def, classLevel - 1);
  const top = maxSpellLevel(def, classLevel);
  const legal = legalSpells(catalog, def.id);
  const openCantrips = legal.filter((spell) => spell.level === 0 && !known.has(spell.id)).length;
  const openSpells = legal.filter((spell) => spell.level > 0 && spell.level <= top && !known.has(spell.id)).length;
  const openBook = legal.filter((spell) => spell.level > 0 && spell.level <= top && !book.has(spell.id)).length;
  const cantrips = Math.min(openCantrips, Math.max(0, (row?.cantrips ?? 0) - (prev?.cantrips ?? 0)));
  const spells = Math.min(
    openSpells,
    Math.max(0, (row?.preparedSpells ?? row?.spellsKnown ?? 0) - (prev?.preparedSpells ?? prev?.spellsKnown ?? 0)),
  );
  const spellbook = Math.min(openBook, wizardSpellbookGain(def, classLevel));
  if (!cantrips && !spells && !spellbook) return null;
  return {
    kind: "spells",
    atLevel,
    classId: def.id,
    cantrips,
    spells,
    ...(spellbook ? { spellbook } : {}),
  };
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
  const book = new Set(next.spellbook ?? []);
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
    } else if (kind === "expertise") {
      const grant = expertiseGrant(row?.features ?? []);
      if (grant) {
        const ask: Extract<PendingAsk, { kind: "expertise" }> = {
          kind: "expertise",
          atLevel: next.level,
          classId: def.id,
          count: grant.count,
          ...(grant.pool ? { pool: grant.pool } : {}),
        };
        const open = expertiseCandidates(next, ask);
        if (open.length >= grant.count) out.push(ask);
      }
    } else if (def.spellProgression) {
      const ask = spellAsk(def, progress.level, next.level, known, catalog, book);
      if (ask) out.push(ask);
    }
  }
  return out;
}

export function applyPick(hero: ProgressionHero, pick: LevelPick, catalog: CatalogSlice, opts?: NextAskOpts): ProgressionHero {
  const pruned = pruneSatisfiedPending(hero);
  const base: ProgressionHero = pruned === hero.pending ? hero : { ...hero, pending: pruned };
  const ask = nextAsk(base, catalog, opts);
  if (!ask) throw new Error("NO_LEVEL");
  if (pick.kind !== ask.kind && !(ask.kind === "asi" && pick.kind === "feat")) throw new Error("LEVEL_CHOICE");
  const next: ProgressionHero = {
    ...base,
    classes: base.classes.map((row) => ({ ...row })),
    abilities: { ...base.abilities },
    proficiency: [...base.proficiency],
    features: [...base.features],
    spells: [...base.spells],
    cantrips: [...base.cantrips],
    spellbook: [...(base.spellbook ?? [])],
    // Catch-up asks are virtual (not queued in pending); only shift when the ask was pending.
    pending: base.pending[0]?.kind === ask.kind ? base.pending.slice(1) : [...base.pending],
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
    const newSubFeatures = sub ? subclassFeaturesAt(sub, progress.level) : [];
    if (sub) grant(next, newSubFeatures);
    next.maxHp += hpGain(def, next.abilities.con, species);
    next.level += 1;
    next.pending = followUps(next, def, progress, catalog);
    if (sub && newSubFeatures.some((feature) => /^additional fighting style$/i.test(feature))) {
      next.pending.push({ kind: "fighting_style", atLevel: next.level, classId: def.id });
    }
    for (const feature of newSubFeatures) {
      const key = feature.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const options = SUBCLASS_LEVEL_CHOICES[key];
      if (options) {
        next.pending.push({
          kind: "feature_choice",
          atLevel: next.level,
          classId: def.id,
          featureId: key,
          options,
          count: 1,
        });
      }
    }
    return next;
  }
  if (ask.kind === "subclass" && pick.kind === "subclass") {
    const sub = catalog.subclasses.find((row) => row.id === pick.subclassId && row.classId === ask.classId);
    if (!sub) throw new Error("BAD_SUBCLASS");
    const progress = next.classes.find((row) => row.id === ask.classId);
    if (progress) progress.subclass = sub.id;
    const granted = subclassFeaturesUpTo(sub, progress?.level ?? sub.level);
    grant(next, granted);
    for (const feature of granted) {
      const key = feature.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const options = SUBCLASS_LEVEL_CHOICES[key];
      if (options) {
        next.pending.push({
          kind: "feature_choice",
          atLevel: next.level,
          classId: ask.classId,
          featureId: key,
          options,
          count: 1,
        });
      }
    }
    return next;
  }
  if (ask.kind === "feature_choice" && pick.kind === "feature_choice") {
    if (pick.featureId !== ask.featureId) throw new Error("LEVEL_CHOICE");
    if (pick.picks.length !== ask.count) throw new Error("LEVEL_CHOICE");
    for (const value of pick.picks) {
      if (!ask.options.includes(value)) throw new Error("BAD_CHOICE");
      next.features.push(`${ask.featureId}:${value}`);
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
    const category = featCategory(feat);
    if (category === "epic" ? !ask.epic : category !== "general" && category !== "fighting_style") throw new Error("BAD_FEAT");
    if (featMinLevel(feat) > next.level) throw new Error("FEAT_LEVEL");
    if (!feat.repeatable && next.features.includes(feat.id)) throw new Error("FEAT_TAKEN");
    if (feat.asiChoices?.length) {
      if (!pick.ability || !feat.asiChoices.includes(pick.ability)) throw new Error("NEED_FEAT_ASI");
      const cap = category === "epic" ? 30 : 20;
      next.abilities[pick.ability] = Math.min(cap, next.abilities[pick.ability] + 1);
    }
    next.features.push(feat.id);
    if (feat.id === "tough") next.maxHp += 2 * next.level;
    if (feat.id === "boon_of_fortitude") next.maxHp += 40;
    if (feat.id === "boon_of_skill_mastery") {
      const allSkills = [
        "acrobatics", "animal_handling", "arcana", "athletics", "deception", "history", "insight",
        "intimidation", "investigation", "medicine", "nature", "perception", "performance",
        "persuasion", "religion", "sleight_of_hand", "stealth", "survival",
      ];
      next.proficiency = [...new Set([...next.proficiency, ...allSkills])];
    }
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
  if (ask.kind === "expertise" && pick.kind === "expertise") {
    const open = expertiseCandidates(next, ask);
    if (
      pick.skills.length !== ask.count ||
      pick.skills.some((skill) => !open.includes(skill)) ||
      new Set(pick.skills).size !== pick.skills.length
    ) {
      throw new Error("BAD_EXPERTISE");
    }
    for (const skill of pick.skills) next.features.push(expertiseFlag(skill));
    return next;
  }
  if (ask.kind === "spells" && pick.kind === "spells") {
    const def = classDef(catalog, ask.classId);
    if (!def?.spellProgression) throw new Error("NO_SPELL_PROGRESSION");
    const progress = next.classes.find((row) => row.id === ask.classId);
    const top = maxSpellLevel(def, progress?.level ?? 1);
    const legal = new Map(legalSpells(catalog, ask.classId).map((spell) => [spell.id, spell]));
    const bookNeed = ask.spellbook ?? 0;
    const bookPicks = pick.spellbook ?? [];
    for (const id of pick.cantrips) {
      if (legal.get(id)?.level !== 0) throw new Error("BAD_SPELL");
    }
    for (const id of [...pick.spells, ...bookPicks]) {
      const spell = legal.get(id);
      if (!spell || spell.level === 0 || spell.level > top) throw new Error("BAD_SPELL");
    }
    if (bookPicks.length !== bookNeed) throw new Error("NEED_SPELLS");
    if (bookPicks.some((id) => next.spellbook?.includes(id))) throw new Error("SPELL_TAKEN");
    if (new Set(bookPicks).size !== bookPicks.length) throw new Error("SPELL_TAKEN");
    const all = [...pick.spells, ...pick.cantrips];
    if (new Set(all).size !== all.length || all.some((id) => next.spells.includes(id) || next.cantrips.includes(id))) throw new Error("SPELL_TAKEN");
    if (pick.spells.length !== ask.spells || pick.cantrips.length !== ask.cantrips) throw new Error("NEED_SPELLS");
    if (bookNeed) {
      next.spellbook = [...(next.spellbook ?? []), ...bookPicks];
      // Prepared picks for a wizard must come from the spellbook (including just-added pages).
      const inBook = new Set(next.spellbook);
      if (pick.spells.some((id) => !inBook.has(id))) throw new Error("BAD_SPELL");
    }
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
