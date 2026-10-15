import type {
  BackgroundAsi,
  BuilderCatalog,
  BuilderDraft,
  DerivedAttackRow,
  DerivedSheet,
  DerivedSkillRow,
  AbilityKey,
} from "@d20-fireverse/protocol/builder";
import { abilityMod, validateBaseAbilities } from "./builder-validate.js";
import { hpAtLevelOne } from "./progression.js";

const ABILITIES: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

/** PHB 2024 mechanical reference — not SRD text. */
const SPELLBOOK_AT_LEVEL: Record<string, number> = { "1": 6 };

function applyBackgroundAsi(scores: Record<AbilityKey, number>, asi?: BackgroundAsi): void {
  if (!asi) return;
  if (asi.mode === "plus2plus1") {
    scores[asi.plus2] = Math.min(20, scores[asi.plus2] + 2);
    scores[asi.plus1] = Math.min(20, scores[asi.plus1] + 1);
    return;
  }
  for (const key of asi.abilities) scores[key] = Math.min(20, scores[key] + 1);
}

function skillRows(
  scores: Record<AbilityKey, number>,
  prof: number,
  proficient: Set<string>,
  catalog: BuilderCatalog,
  expertise: Set<string> = new Set(),
): DerivedSkillRow[] {
  return Object.entries(catalog.skills).map(([id, meta]) => {
    const isProf = proficient.has(id);
    const isExp = expertise.has(id);
    const mod = abilityMod(scores[meta.ability]) + (isProf ? prof * (isExp ? 2 : 1) : 0);
    return { id, label: meta.label, mod, proficient: isProf, ...(isExp ? { expertise: true } : {}) };
  });
}

function unarmedAttack(scores: Record<AbilityKey, number>, prof: number): DerivedAttackRow {
  const mod = abilityMod(scores.str);
  return {
    id: "unarmed",
    name: "Unarmed Strike",
    attackBonus: prof + mod,
    damage: `1 + ${mod} bludgeoning`,
  };
}

function weaponAttack(
  itemId: string,
  name: string,
  scores: Record<AbilityKey, number>,
  prof: number,
  useDex: boolean,
): DerivedAttackRow {
  const mod = abilityMod(useDex ? scores.dex : scores.str);
  const dice = itemId.includes("greatsword") ? "2d6" : itemId.includes("longbow") || itemId.includes("shortbow") ? "1d8" : "1d8";
  const type = itemId.includes("bow") ? "piercing" : "slashing";
  return {
    id: itemId,
    name,
    attackBonus: prof + mod,
    damage: `${dice} + ${mod} ${type}`,
  };
}

export type DeriveClassHint = { hitDie: number; saves: AbilityKey[]; spellSlotsL1?: Record<string, number> };

export function deriveHero(draft: BuilderDraft, catalog: BuilderCatalog, classHint?: DeriveClassHint): DerivedSheet {
  const errors: string[] = [];
  const warnings: string[] = [];
  const clsMeta = catalog.classes.find((c) => c.id === draft.classId);
  const speciesMeta = catalog.species.find((s) => s.id === draft.speciesId);
  const bgMeta = catalog.backgrounds.find((b) => b.id === draft.backgroundId);
  if (!clsMeta) errors.push("CLASS_DISABLED");
  if (!speciesMeta) errors.push("SPECIES_DISABLED");
  if (!bgMeta) errors.push("BACKGROUND_DISABLED");

  const abilityErr = validateBaseAbilities(draft.method, draft.baseAbilities);
  if (abilityErr) errors.push(abilityErr);

  const scores = { ...draft.baseAbilities };
  if (draft.backgroundAsi) {
    const keys =
      draft.backgroundAsi.mode === "plus2plus1"
        ? [draft.backgroundAsi.plus2, draft.backgroundAsi.plus1]
        : draft.backgroundAsi.abilities;
    if (new Set(keys).size !== keys.length) errors.push("FLEXIBLE_DUP");
    for (const k of keys) {
      if (!bgMeta?.abilityOptions.includes(k)) errors.push("BAD_FLEXIBLE");
    }
    applyBackgroundAsi(scores, draft.backgroundAsi);
  }

  const level = Math.max(1, Math.min(20, draft.level ?? 1));
  const prof = 2 + Math.floor((level - 1) / 4);

  const proficient = new Set<string>([...bgMeta?.skills ?? [], ...draft.classSkills]);
  if (draft.speciesSkill) proficient.add(draft.speciesSkill);

  if (clsMeta && draft.classSkills.length !== clsMeta.skillChoices) {
    errors.push(`NEED_${clsMeta.skillChoices}_CLASS_SKILLS`);
  }
  for (const sk of draft.classSkills) {
    if (!clsMeta?.skillList.includes(sk)) errors.push("BAD_CLASS_SKILL");
    if (bgMeta?.skills.includes(sk)) errors.push("SKILL_OVERLAP_BG");
  }

  if (clsMeta?.fightingStyleRequired && !draft.fightingStyleFeatId) errors.push("NEED_FIGHTING_STYLE");

  const cantripNeed = clsMeta?.level1.cantrips ?? 0;
  const preparedNeed = clsMeta?.level1.preparedSpells ?? 0;
  const knownNeed = clsMeta?.level1.spellsKnown ?? 0;
  const bookNeed = clsMeta?.level1.spellbookSize ?? 0;

  if (cantripNeed && (draft.cantrips?.length ?? 0) !== cantripNeed) errors.push(`NEED_${cantripNeed}_CANTRIPS`);
  if (preparedNeed && (draft.spellsPrepared?.length ?? 0) !== preparedNeed) errors.push(`NEED_${preparedNeed}_SPELLS`);
  if (knownNeed && (draft.spellsKnown?.length ?? 0) !== knownNeed) errors.push(`NEED_${knownNeed}_SPELLS`);
  if (bookNeed) {
    const book = draft.spellbook ?? [];
    if (book.length !== bookNeed) errors.push(`NEED_${bookNeed}_SPELLS`);
    for (const id of draft.spellsPrepared ?? []) {
      if (!book.includes(id)) errors.push("BAD_SPELL");
    }
  }

  const hitDie = classHint?.hitDie ?? 10;
  const hp = hpAtLevelOne({ id: draft.classId, hitDie, caster: "none", primary: [], multiclass: {}, levels: [] }, scores.con);

  let ac = 10 + abilityMod(scores.dex);
  if (draft.classId === "barbarian") ac += abilityMod(scores.con);
  if (draft.classId === "monk") ac += abilityMod(scores.wis);
  const attacks: DerivedAttackRow[] = [unarmedAttack(scores, prof)];
  if (draft.classId === "fighter" && draft.equipChoice === "A") {
    ac = 16;
    attacks.push(weaponAttack("greatsword", "Greatsword", scores, prof, false));
  } else if (draft.classId === "fighter" && draft.equipChoice === "B") {
    ac = 12 + Math.min(abilityMod(scores.dex), 2);
    attacks.push(weaponAttack("longbow", "Longbow", scores, prof, true));
  }

  const saves = (classHint?.saves ?? ["str", "con"]).map((ability) => ({
    ability,
    mod: abilityMod(scores[ability]) + prof,
    proficient: true,
  }));

  const expertise = new Set(draft.expertiseSkills ?? []);
  if (draft.classId === "rogue") {
    if (expertise.size !== 2) errors.push("NEED_2_EXPERTISE");
    for (const id of expertise) {
      if (!proficient.has(id)) errors.push("BAD_EXPERTISE");
    }
  }
  const skills = skillRows(scores, prof, proficient, catalog, expertise);
  const perception = skills.find((s) => s.id === "perception");
  const passivePerception = 10 + (perception?.mod ?? abilityMod(scores.wis));

  const features: string[] = [];
  if (draft.fightingStyleFeatId) {
    const feat = catalog.feats.find((f) => f.id === draft.fightingStyleFeatId);
    if (feat) features.push(feat.name);
  }
  if (bgMeta?.featId) {
    const feat = catalog.feats.find((f) => f.id === bgMeta.featId);
    if (feat) features.push(feat.name);
  }
  if (draft.originFeatId) {
    const feat = catalog.feats.find((f) => f.id === draft.originFeatId);
    if (feat) features.push(feat.name);
  }

  const spellSlots = classHint?.spellSlotsL1 ?? (clsMeta?.caster === "full" && level === 1 ? { "1": 2 } : undefined);

  return {
    name: draft.name?.trim() || "Unnamed",
    level,
    className: clsMeta?.name ?? draft.classId,
    speciesName: speciesMeta?.name ?? draft.speciesId,
    backgroundName: bgMeta?.name ?? draft.backgroundId,
    hp,
    ac,
    speedFt: 30,
    proficiencyBonus: prof,
    abilities: Object.fromEntries(ABILITIES.map((a) => [a, { score: scores[a], mod: abilityMod(scores[a]) }])) as DerivedSheet["abilities"],
    savingThrows: saves,
    skills,
    passivePerception,
    attacks,
    ...(spellSlots ? { spellSlots } : {}),
    cantripIds: draft.cantrips,
    preparedSpellIds: draft.spellsPrepared ?? draft.spellsKnown,
    features,
    warnings,
    ok: errors.length === 0,
    errors,
  };
}

export function wizardSpellbookSize(level: number): number {
  return SPELLBOOK_AT_LEVEL[String(level)] ?? 6 + Math.max(0, level - 1) * 2;
}
