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
export type MetamagicSlice = { id: string; name: string; cost: number; minLevel?: number };
export type InvocationSlice = {
  id: string;
  name: string;
  minLevel: number;
  prereq?: string;
  repeatable?: boolean;
  combatTag?: string;
};
export type LanguageSlice = { id: string; name: string; rare?: boolean };

export type CatalogSlice = {
  classes: ClassSlice[];
  subclasses: SubclassSlice[];
  feats: FeatSlice[];
  spells: SpellSlice[];
  species?: SpeciesSlice[];
  metamagic?: MetamagicSlice[];
  invocations?: InvocationSlice[];
  languages?: LanguageSlice[];
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
      /** Highest spell level this class can prepare/copy at this class level (slot table). */
      maxSpellLevel: number;
      /** Magical Secrets / warrior cantrips: spell lists to pool from. */
      lists?: string[];
      /** Mystic Arcanum: exact spell level (6–9). */
      exactLevel?: number;
      /** How applyPick stores the pick. Default prepared/cantrips. */
      purpose?: "prepared" | "magical_secrets" | "arcanum" | "warrior_cantrips";
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
  | { kind: "feature_choice"; atLevel: number; classId: string; featureId: string; options: string[]; count: number }
  | { kind: "metamagic"; atLevel: number; classId: string; count: number }
  | { kind: "invocation"; atLevel: number; classId: string; count: number }
  | { kind: "language"; atLevel: number; classId: string; count: number }
  | { kind: "spell_mastery"; atLevel: number; classId: string }
  | { kind: "signature_spells"; atLevel: number; classId: string };

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
  | { kind: "feature_choice"; featureId: string; picks: string[] }
  | { kind: "metamagic"; options: string[] }
  | { kind: "invocation"; options: string[] }
  | { kind: "language"; languages: string[] }
  | { kind: "spell_mastery"; level1: string; level2: string }
  | { kind: "signature_spells"; spells: [string, string] };

/** Wizard Scholar: expertise in one of these skills (must already be proficient). */
export const SCHOLAR_SKILLS = ["arcana", "history", "investigation", "medicine", "nature", "religion"] as const;

export function expertiseFlag(skill: string): string {
  return `expertise:${skill}`;
}

export function hasExpertise(features: readonly string[], skill: string): boolean {
  return features.includes(expertiseFlag(skill));
}

export function metamagicFlag(id: string): string {
  return `metamagic:${id}`;
}

export function invocationFlag(id: string): string {
  return `invocation:${id}`;
}

export function languageFlag(id: string): string {
  return `language:${id}`;
}

export function orderFlag(id: string): string {
  return `order:${id}`;
}

export function arcanumFlag(spellLevel: number, spellId: string): string {
  return `arcanum:${spellLevel}:${spellId}`;
}

export function masteryFlag(spellLevel: 1 | 2, spellId: string): string {
  return `mastery:${spellLevel}:${spellId}`;
}

export function signatureFlag(spellId: string): string {
  return `signature:${spellId}`;
}

export function hasMetamagic(features: readonly string[], id: string): boolean {
  return features.includes(metamagicFlag(id));
}

export function hasInvocation(features: readonly string[], id: string): boolean {
  return features.includes(invocationFlag(id));
}

/** Divine Order / Primal Order options by class. */
export const ORDER_OPTIONS: Record<string, string[]> = {
  cleric: ["protector", "thaumaturge"],
  druid: ["magician", "warden"],
};

/** Magical Secrets: Bard 10+ prepared picks may come from these lists. */
export const MAGICAL_SECRETS_LISTS = ["bard", "cleric", "druid", "wizard"] as const;

export function fightingStyleFeats(
  catalog: CatalogSlice,
  classId: string,
  features: readonly string[],
): FeatSlice[] {
  return catalog.feats.filter((feat) => {
    if (featCategory(feat) !== "fighting_style") return false;
    if (features.includes(feat.id)) return false;
    if (feat.id === "blessed_warrior") return classId === "paladin";
    if (feat.id === "druidic_warrior") return classId === "ranger";
    return true;
  });
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

function orderOptionsFor(def: ClassSlice, features: string[]): string[] | null {
  if (features.some((feature) => /^divine order$/i.test(feature.trim()))) return ORDER_OPTIONS.cleric ?? null;
  if (features.some((feature) => /^primal order$/i.test(feature.trim()))) return ORDER_OPTIONS.druid ?? null;
  return null;
}

/** SRD Metamagic: 2 at Sorcerer 2, +2 at 10, +2 at 17. */
function metamagicGain(features: string[], classLevel: number): number {
  if (!features.some((feature) => /^metamagic$/i.test(feature.trim()))) return 0;
  if (classLevel === 2 || classLevel === 10 || classLevel === 17) return 2;
  return 0;
}

function invocationCap(def: ClassSlice, classLevel: number): number {
  const raw = levelRow(def, classLevel)?.columns?.eldritch_invocations;
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function invocationGain(def: ClassSlice, classLevel: number): number {
  return Math.max(0, invocationCap(def, classLevel) - invocationCap(def, classLevel - 1));
}

function languageGrant(features: string[]): number {
  if (features.some((feature) => /^deft explorer$/i.test(feature.trim()))) return 2;
  if (features.some((feature) => /^thieves'? cant$/i.test(feature.trim()))) return 1;
  return 0;
}

function arcanumSpellLevel(features: string[]): number | null {
  for (const feature of features) {
    const match = feature.match(/mystic arcanum \(level (\d+)/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function needsSpellMastery(features: string[]): boolean {
  return features.some((feature) => /^spell mastery$/i.test(feature.trim()));
}

function needsSignatureSpells(features: string[]): boolean {
  return features.some((feature) => /^signature spells$/i.test(feature.trim()));
}

function magicalSecretsActive(def: ClassSlice, classLevel: number): boolean {
  return def.id === "bard" && classLevel >= 10;
}

export function knownMetamagic(features: readonly string[]): string[] {
  return features.filter((f) => f.startsWith("metamagic:")).map((f) => f.slice("metamagic:".length));
}

export function knownInvocations(features: readonly string[]): string[] {
  return features.filter((f) => f.startsWith("invocation:")).map((f) => f.slice("invocation:".length));
}

export function knownLanguages(features: readonly string[]): string[] {
  return features.filter((f) => f.startsWith("language:")).map((f) => f.slice("language:".length));
}

export function metamagicCandidates(hero: ProgressionHero, catalog: CatalogSlice): string[] {
  const have = new Set(knownMetamagic(hero.features));
  return (catalog.metamagic ?? []).filter((row) => !have.has(row.id)).map((row) => row.id);
}

export function invocationCandidates(
  hero: ProgressionHero,
  catalog: CatalogSlice,
  classLevel: number,
): string[] {
  const have = new Set(knownInvocations(hero.features));
  return (catalog.invocations ?? [])
    .filter((row) => {
      if (!row.repeatable && have.has(row.id)) return false;
      if (row.minLevel > classLevel) return false;
      if (row.prereq?.startsWith("invocation:") && !have.has(row.prereq.slice("invocation:".length))) {
        return false;
      }
      return true;
    })
    .map((row) => row.id);
}

export function languageCandidates(hero: ProgressionHero, catalog: CatalogSlice): string[] {
  const have = new Set(knownLanguages(hero.features));
  return (catalog.languages ?? [])
    .filter((row) => !have.has(row.id) && row.id !== "common" && row.id !== "thieves_cant")
    .map((row) => row.id);
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
  if (orderOptionsFor(def, features)) asks.push("feature_choice");
  if (needsSubclass(features) && !hadSubclass) asks.push("subclass");
  if (needsFightingStyle(features)) asks.push("fighting_style");
  if (skillGrant(features)) asks.push("skill");
  if (expertiseGrant(features)) asks.push("expertise");
  if (languageGrant(features)) asks.push("language");
  if (metamagicGain(features, classLevel)) asks.push("metamagic");
  if (invocationGain(def, classLevel) > 0) asks.push("invocation");
  if (arcanumSpellLevel(features) != null) asks.push("spells"); // purpose set in followUps
  if (needsSpellMastery(features)) asks.push("spell_mastery");
  if (needsSignatureSpells(features)) asks.push("signature_spells");
  if (needsAsi(features)) asks.push("asi");
  const prev = levelRow(def, classLevel - 1);
  const spellGain = (row?.preparedSpells ?? row?.spellsKnown ?? 0) - (prev?.preparedSpells ?? prev?.spellsKnown ?? 0);
  const cantripGain = (row?.cantrips ?? 0) - (prev?.cantrips ?? 0);
  const bookGain = wizardSpellbookGain(def, classLevel);
  const hasPreparedGain =
    (spellGain > 0 || cantripGain > 0 || bookGain > 0 || classLevel === 1) && Boolean(def.spellProgression);
  if (hasPreparedGain && !asks.includes("spells")) asks.push("spells");
  // Warlock arcanum + prepared gain in the same level: followUps emits two spell asks.
  if (hasPreparedGain && arcanumSpellLevel(features) != null) {
    /* keep single "spells" kind; followUps doubles */
  }
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

/** Catch-up: Divine/Primal Order when the class feature is present but no order:* flag. */
export function catchUpOrderAsk(hero: ProgressionHero, catalog: CatalogSlice): PendingAsk | null {
  for (const progress of hero.classes) {
    const def = classDef(catalog, progress.id);
    if (!def) continue;
    for (let level = 1; level <= progress.level; level++) {
      const options = orderOptionsFor(def, levelRow(def, level)?.features ?? []);
      if (!options) continue;
      if (hero.features.some((f) => f.startsWith("order:"))) return null;
      return {
        kind: "feature_choice",
        atLevel: hero.level,
        classId: def.id,
        featureId: "order",
        options,
        count: 1,
      };
    }
  }
  return null;
}

export function catchUpMetamagicAsk(hero: ProgressionHero, catalog: CatalogSlice): PendingAsk | null {
  for (const progress of hero.classes) {
    const def = classDef(catalog, progress.id);
    if (!def || def.id !== "sorcerer") continue;
    let need = 0;
    for (let level = 1; level <= progress.level; level++) {
      need += metamagicGain(levelRow(def, level)?.features ?? [], level);
    }
    const have = knownMetamagic(hero.features).length;
    const deficit = need - have;
    if (deficit <= 0) continue;
    if (metamagicCandidates(hero, catalog).length < deficit) continue;
    return { kind: "metamagic", atLevel: hero.level, classId: def.id, count: deficit };
  }
  return null;
}

export function catchUpInvocationAsk(hero: ProgressionHero, catalog: CatalogSlice): PendingAsk | null {
  for (const progress of hero.classes) {
    const def = classDef(catalog, progress.id);
    if (!def || def.id !== "warlock") continue;
    const need = invocationCap(def, progress.level);
    const have = knownInvocations(hero.features).length;
    const deficit = need - have;
    if (deficit <= 0) continue;
    if (invocationCandidates(hero, catalog, progress.level).length < deficit) continue;
    return { kind: "invocation", atLevel: hero.level, classId: def.id, count: deficit };
  }
  return null;
}

export function catchUpLanguageAsk(hero: ProgressionHero, catalog: CatalogSlice): PendingAsk | null {
  for (const progress of hero.classes) {
    const def = classDef(catalog, progress.id);
    if (!def) continue;
    let need = 0;
    for (let level = 1; level <= progress.level; level++) {
      const features = levelRow(def, level)?.features ?? [];
      need += languageGrant(features);
      if (features.some((feature) => /^thieves'? cant$/i.test(feature.trim())) && !hero.features.includes(languageFlag("thieves_cant"))) {
        // Will be granted when the ask is answered or via a soft grant in nextAsk path.
      }
    }
    // Count only player-chosen languages (exclude thieves_cant auto grant for deficit math of "1 other").
    const chosen = knownLanguages(hero.features).filter((id) => id !== "thieves_cant" && id !== "common");
    const deficit = need - chosen.length;
    if (deficit <= 0) continue;
    if (languageCandidates(hero, catalog).length < deficit) continue;
    return { kind: "language", atLevel: hero.level, classId: def.id, count: deficit };
  }
  return null;
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
      maxSpellLevel: top,
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
  const catchUps = [
    catchUpOrderAsk(hero, catalog),
    catchUpSpellAsk(hero, catalog),
    catchUpExpertiseAsk(hero, catalog),
    catchUpMetamagicAsk(hero, catalog),
    catchUpInvocationAsk(hero, catalog),
    catchUpLanguageAsk(hero, catalog),
  ];
  for (const ask of catchUps) {
    if (ask) return ask;
  }
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
    const feat = fightingStyleFeats(catalog, ask.classId, hero.features)[0];
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
  if (ask.kind === "metamagic") {
    const open = metamagicCandidates(hero, catalog).slice(0, ask.count);
    if (open.length !== ask.count) return null;
    return { kind: "metamagic", options: open };
  }
  if (ask.kind === "invocation") {
    const classLevel = hero.classes.find((row) => row.id === ask.classId)?.level ?? 1;
    const open = invocationCandidates(hero, catalog, classLevel).slice(0, ask.count);
    if (open.length !== ask.count) return null;
    return { kind: "invocation", options: open };
  }
  if (ask.kind === "language") {
    const open = languageCandidates(hero, catalog).slice(0, ask.count);
    if (open.length !== ask.count) return null;
    return { kind: "language", languages: open };
  }
  if (ask.kind === "spell_mastery") {
    const book = new Set(hero.spellbook ?? []);
    const legal = legalSpells(catalog, ask.classId);
    const level1 = legal.find((s) => s.level === 1 && book.has(s.id))?.id;
    const level2 = legal.find((s) => s.level === 2 && book.has(s.id))?.id;
    if (!level1 || !level2) return null;
    return { kind: "spell_mastery", level1, level2 };
  }
  if (ask.kind === "signature_spells") {
    const book = new Set(hero.spellbook ?? []);
    const picks = legalSpells(catalog, ask.classId)
      .filter((s) => s.level === 3 && book.has(s.id))
      .slice(0, 2)
      .map((s) => s.id);
    if (picks.length !== 2) return null;
    return { kind: "signature_spells", spells: [picks[0]!, picks[1]!] };
  }
  if (ask.kind === "spells") {
    const book = new Set(hero.spellbook ?? []);
    const known = new Set([...hero.spells, ...hero.cantrips]);
    const def = catalog.classes.find((row) => row.id === ask.classId);
    const classLevel = hero.classes.find((row) => row.id === ask.classId)?.level ?? 1;
    const top = ask.maxSpellLevel || (def ? maxSpellLevel(def, classLevel) : 0);
    const legal = ask.lists?.length
      ? spellsFromLists(catalog, ask.lists)
      : catalog.spells.filter((spell) => spell.classes.includes(ask.classId));
    const cantrips = legal
      .filter((spell) => spell.level === 0 && !known.has(spell.id))
      .slice(0, ask.cantrips)
      .map((spell) => spell.id);
    const bookNeed = ask.spellbook ?? 0;
    const spellbook = legal
      .filter((spell) => spell.level > 0 && spell.level <= top && !book.has(spell.id))
      .slice(0, bookNeed)
      .map((spell) => spell.id);
    const afterBook = new Set([...book, ...spellbook]);
    const prepPool = ask.exactLevel != null
      ? legal.filter((spell) => spell.level === ask.exactLevel && !known.has(spell.id))
      : bookNeed
        ? legal.filter((spell) => spell.level > 0 && spell.level <= top && afterBook.has(spell.id) && !known.has(spell.id))
        : legal.filter((spell) => spell.level > 0 && spell.level <= top && !known.has(spell.id));
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

function spellsFromLists(catalog: CatalogSlice, lists: string[]): SpellSlice[] {
  const allow = new Set(lists);
  return catalog.spells.filter((spell) => spell.classes.some((cls) => allow.has(cls)));
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
  const secrets = magicalSecretsActive(def, classLevel);
  const lists = secrets ? [...MAGICAL_SECRETS_LISTS] : undefined;
  const legal = lists ? spellsFromLists(catalog, lists) : legalSpells(catalog, def.id);
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
    maxSpellLevel: top,
    ...(spellbook ? { spellbook } : {}),
    ...(lists ? { lists, purpose: "magical_secrets" as const } : {}),
  };
}

function arcanumAsk(def: ClassSlice, atLevel: number, spellLevel: number): PendingAsk {
  return {
    kind: "spells",
    atLevel,
    classId: def.id,
    cantrips: 0,
    spells: 1,
    maxSpellLevel: spellLevel,
    exactLevel: spellLevel,
    purpose: "arcanum",
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
  const features = row?.features ?? [];
  const known = new Set([...next.spells, ...next.cantrips]);
  const book = new Set(next.spellbook ?? []);
  const out: PendingAsk[] = [];
  let emittedPreparedSpells = false;
  let emittedArcanum = false;
  for (const kind of asksForClassLevel(def, progress.level, Boolean(progress.subclass))) {
    if (kind === "feature_choice") {
      const options = orderOptionsFor(def, features);
      if (options && !next.features.some((f) => f.startsWith("order:"))) {
        out.push({
          kind: "feature_choice",
          atLevel: next.level,
          classId: def.id,
          featureId: "order",
          options,
          count: 1,
        });
      }
    } else if (kind === "subclass") {
      if (catalog.subclasses.some((sub) => sub.classId === def.id)) out.push({ kind, atLevel: next.level, classId: def.id });
    } else if (kind === "asi") {
      out.push({ kind, atLevel: next.level, classId: def.id, epic: epic(features) });
    } else if (kind === "fighting_style") {
      if (fightingStyleFeats(catalog, def.id, next.features).length) {
        out.push({ kind, atLevel: next.level, classId: def.id });
      }
    } else if (kind === "skill") {
      const open = (def.skillList ?? []).filter((skill) => !next.proficiency.includes(skill));
      const count = Math.min(open.length, skillGrant(features));
      if (count) out.push({ kind, atLevel: next.level, classId: def.id, count });
    } else if (kind === "expertise") {
      const grant = expertiseGrant(features);
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
    } else if (kind === "language") {
      if (features.some((feature) => /^thieves'? cant$/i.test(feature.trim()))) {
        grant(next, [languageFlag("thieves_cant")]);
      }
      const count = languageGrant(features);
      if (count && languageCandidates(next, catalog).length >= count) {
        out.push({ kind: "language", atLevel: next.level, classId: def.id, count });
      }
    } else if (kind === "metamagic") {
      const count = metamagicGain(features, progress.level);
      if (count && metamagicCandidates(next, catalog).length >= count) {
        out.push({ kind: "metamagic", atLevel: next.level, classId: def.id, count });
      }
    } else if (kind === "invocation") {
      const count = invocationGain(def, progress.level);
      if (count && invocationCandidates(next, catalog, progress.level).length >= count) {
        out.push({ kind: "invocation", atLevel: next.level, classId: def.id, count });
      }
    } else if (kind === "spell_mastery") {
      out.push({ kind: "spell_mastery", atLevel: next.level, classId: def.id });
    } else if (kind === "signature_spells") {
      out.push({ kind: "signature_spells", atLevel: next.level, classId: def.id });
    } else if (kind === "spells") {
      const arc = arcanumSpellLevel(features);
      if (arc != null && !emittedArcanum) {
        out.push(arcanumAsk(def, next.level, arc));
        emittedArcanum = true;
      }
      if (!emittedPreparedSpells && def.spellProgression) {
        const ask = spellAsk(def, progress.level, next.level, known, catalog, book);
        if (ask) out.push(ask);
        emittedPreparedSpells = true;
      }
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
    if (ask.featureId === "order" && pick.picks.some((p) => p === "thaumaturge" || p === "magician")) {
      const list = ask.classId;
      next.pending = [
        {
          kind: "spells",
          atLevel: next.level,
          classId: ask.classId,
          cantrips: 1,
          spells: 0,
          maxSpellLevel: 0,
          lists: [list],
          purpose: "warrior_cantrips",
        },
        ...next.pending,
      ];
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
    const allowed = fightingStyleFeats(catalog, ask.classId, next.features);
    const feat = allowed.find((row) => row.id === pick.featId);
    if (!feat) throw new Error("BAD_FEAT");
    next.features.push(feat.id);
    if (feat.id === "blessed_warrior" || feat.id === "druidic_warrior") {
      const list = feat.id === "blessed_warrior" ? "cleric" : "druid";
      next.pending = [
        {
          kind: "spells",
          atLevel: next.level,
          classId: ask.classId,
          cantrips: 2,
          spells: 0,
          maxSpellLevel: 0,
          lists: [list],
          purpose: "warrior_cantrips",
        },
        ...next.pending,
      ];
    }
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
    const progress = next.classes.find((row) => row.id === ask.classId);
    const top = ask.maxSpellLevel || (def ? maxSpellLevel(def, progress?.level ?? 1) : 0);
    const pool = ask.lists?.length ? spellsFromLists(catalog, ask.lists) : legalSpells(catalog, ask.classId);
    const legal = new Map(pool.map((spell) => [spell.id, spell]));
    const bookNeed = ask.spellbook ?? 0;
    const bookPicks = pick.spellbook ?? [];
    if (ask.purpose === "arcanum") {
      if (pick.spells.length !== 1 || pick.cantrips.length || bookPicks.length) throw new Error("NEED_SPELLS");
      const spell = legal.get(pick.spells[0]!);
      if (!spell || spell.level !== (ask.exactLevel ?? ask.maxSpellLevel)) throw new Error("BAD_SPELL");
      next.features.push(arcanumFlag(spell.level, spell.id));
      if (!next.spells.includes(spell.id)) next.spells.push(spell.id);
      return next;
    }
    if (!def?.spellProgression && ask.purpose !== "warrior_cantrips") throw new Error("NO_SPELL_PROGRESSION");
    for (const id of pick.cantrips) {
      if (legal.get(id)?.level !== 0) throw new Error("BAD_SPELL");
    }
    for (const id of [...pick.spells, ...bookPicks]) {
      const spell = legal.get(id);
      if (!spell || spell.level === 0 || spell.level > top) throw new Error("BAD_SPELL");
      if (ask.exactLevel != null && spell.level !== ask.exactLevel) throw new Error("BAD_SPELL");
    }
    if (bookPicks.length !== bookNeed) throw new Error("NEED_SPELLS");
    if (bookPicks.some((id) => next.spellbook?.includes(id))) throw new Error("SPELL_TAKEN");
    if (new Set(bookPicks).size !== bookPicks.length) throw new Error("SPELL_TAKEN");
    const all = [...pick.spells, ...pick.cantrips];
    if (new Set(all).size !== all.length || all.some((id) => next.spells.includes(id) || next.cantrips.includes(id))) throw new Error("SPELL_TAKEN");
    if (pick.spells.length !== ask.spells || pick.cantrips.length !== ask.cantrips) throw new Error("NEED_SPELLS");
    if (bookNeed) {
      next.spellbook = [...(next.spellbook ?? []), ...bookPicks];
      const inBook = new Set(next.spellbook);
      if (pick.spells.some((id) => !inBook.has(id))) throw new Error("BAD_SPELL");
    }
    next.spells.push(...pick.spells);
    next.cantrips.push(...pick.cantrips);
    return next;
  }
  if (ask.kind === "metamagic" && pick.kind === "metamagic") {
    const open = metamagicCandidates(next, catalog);
    if (
      pick.options.length !== ask.count ||
      pick.options.some((id) => !open.includes(id)) ||
      new Set(pick.options).size !== pick.options.length
    ) {
      throw new Error("BAD_CHOICE");
    }
    for (const id of pick.options) next.features.push(metamagicFlag(id));
    return next;
  }
  if (ask.kind === "invocation" && pick.kind === "invocation") {
    const classLevel = next.classes.find((row) => row.id === ask.classId)?.level ?? 1;
    const open = invocationCandidates(next, catalog, classLevel);
    if (
      pick.options.length !== ask.count ||
      pick.options.some((id) => !open.includes(id)) ||
      new Set(pick.options).size !== pick.options.length
    ) {
      throw new Error("BAD_CHOICE");
    }
    for (const id of pick.options) next.features.push(invocationFlag(id));
    return next;
  }
  if (ask.kind === "language" && pick.kind === "language") {
    const open = languageCandidates(next, catalog);
    if (
      pick.languages.length !== ask.count ||
      pick.languages.some((id) => !open.includes(id)) ||
      new Set(pick.languages).size !== pick.languages.length
    ) {
      throw new Error("BAD_CHOICE");
    }
    for (const id of pick.languages) next.features.push(languageFlag(id));
    return next;
  }
  if (ask.kind === "spell_mastery" && pick.kind === "spell_mastery") {
    const book = new Set(next.spellbook ?? []);
    const legal = new Map(legalSpells(catalog, ask.classId).map((s) => [s.id, s]));
    const s1 = legal.get(pick.level1);
    const s2 = legal.get(pick.level2);
    if (!s1 || s1.level !== 1 || !book.has(s1.id)) throw new Error("BAD_SPELL");
    if (!s2 || s2.level !== 2 || !book.has(s2.id)) throw new Error("BAD_SPELL");
    next.features.push(masteryFlag(1, s1.id), masteryFlag(2, s2.id));
    for (const id of [s1.id, s2.id]) {
      if (!next.spells.includes(id)) next.spells.push(id);
    }
    return next;
  }
  if (ask.kind === "signature_spells" && pick.kind === "signature_spells") {
    const book = new Set(next.spellbook ?? []);
    const legal = new Map(legalSpells(catalog, ask.classId).map((s) => [s.id, s]));
    if (pick.spells.length !== 2 || new Set(pick.spells).size !== 2) throw new Error("NEED_SPELLS");
    for (const id of pick.spells) {
      const spell = legal.get(id);
      if (!spell || spell.level !== 3 || !book.has(id)) throw new Error("BAD_SPELL");
      next.features.push(signatureFlag(id));
      if (!next.spells.includes(id)) next.spells.push(id);
    }
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
