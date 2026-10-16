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

/** SRD armor: dexCap null means the full Dexterity modifier. */
const ARMOR: Record<string, { base: number; dexCap: number | null }> = {
  padded_armor: { base: 11, dexCap: null },
  leather_armor: { base: 11, dexCap: null },
  studded_leather_armor: { base: 12, dexCap: null },
  hide_armor: { base: 12, dexCap: 2 },
  chain_shirt: { base: 13, dexCap: 2 },
  scale_mail: { base: 14, dexCap: 2 },
  breastplate: { base: 14, dexCap: 2 },
  half_plate_armor: { base: 15, dexCap: 2 },
  ring_mail: { base: 14, dexCap: 0 },
  chain_mail: { base: 16, dexCap: 0 },
  splint_armor: { base: 17, dexCap: 0 },
  plate_armor: { base: 18, dexCap: 0 },
};

const WEAPONS = new Set([
  "greatsword", "longsword", "shortsword", "scimitar", "rapier", "dagger", "handaxe", "greataxe",
  "mace", "quarterstaff", "spear", "sickle", "flail", "javelin", "shortbow", "longbow", "light_crossbow",
]);
const FINESSE = new Set(["dagger", "scimitar", "rapier", "shortsword", "whip"]);
const RANGED = new Set(["shortbow", "longbow", "light_crossbow", "dart"]);

function labelItem(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function starterKit(cls: BuilderCatalog["classes"][number] | undefined, choice: BuilderDraft["equipChoice"]): string[] {
  const pick = cls?.equipChoices.find((row) => row.id === (choice ?? "A")) ?? cls?.equipChoices[0];
  return pick?.items ?? [];
}

function wornArmor(items: string[]): { armored: boolean; ac: number; dexCap: number | null; shield: boolean } {
  const piece = items.map((id) => ARMOR[id]).find(Boolean);
  return {
    armored: Boolean(piece),
    ac: piece?.base ?? 10,
    dexCap: piece?.dexCap ?? null,
    shield: items.includes("shield"),
  };
}

function dexModBonus(worn: { dexCap: number | null }, dexMod: number): number {
  if (worn.dexCap === null) return dexMod;
  return Math.min(dexMod, worn.dexCap);
}

function weaponAttack(
  itemId: string,
  name: string,
  scores: Record<AbilityKey, number>,
  prof: number,
  useDex: boolean,
): DerivedAttackRow {
  const mod = abilityMod(useDex ? scores.dex : scores.str);
  const dice = itemId.includes("greatsword") || itemId.includes("greataxe") ? "2d6" : itemId === "dagger" || itemId === "sickle" || itemId === "handaxe" ? "1d4" : itemId === "spear" || itemId === "javelin" || itemId === "mace" || itemId === "quarterstaff" ? "1d6" : "1d8";
  const type = RANGED.has(itemId) || itemId === "javelin" || itemId === "spear" ? "piercing" : itemId === "mace" || itemId === "quarterstaff" || itemId === "flail" ? "bludgeoning" : "slashing";
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

  const bgSkills =
    bgMeta?.custom ? [...(draft.customSkills ?? [])] : [...(bgMeta?.skills ?? [])];
  if (bgMeta?.custom) {
    if (bgSkills.length !== 2) errors.push("NEED_2_CUSTOM_SKILLS");
    if (!draft.customFeatId) errors.push("NEED_CUSTOM_FEAT");
    else if (!catalog.feats.some((f) => f.id === draft.customFeatId && f.category === "origin")) {
      errors.push("BAD_CUSTOM_FEAT");
    }
    if (!draft.customTool) errors.push("NEED_CUSTOM_TOOL");
  }

  const originFeatId = bgMeta?.custom ? draft.customFeatId : bgMeta?.featId;
  if (originFeatId === "skilled") {
    if ((draft.skilledPicks?.length ?? 0) !== 3) errors.push("NEED_3_SKILLED");
  }
  if (originFeatId === "magic_initiate") {
    if ((draft.magicInitiateCantrips?.length ?? 0) !== 2) errors.push("NEED_2_MI_CANTRIPS");
    if (!draft.magicInitiateSpell) errors.push("NEED_MI_SPELL");
    if (!draft.magicInitiateAbility) errors.push("NEED_MI_ABILITY");
  }

  const proficient = new Set<string>([...bgSkills, ...draft.classSkills, ...(draft.skilledPicks ?? [])]);
  if (draft.speciesSkill) proficient.add(draft.speciesSkill);

  if (clsMeta && draft.classSkills.length !== clsMeta.skillChoices) {
    errors.push(`NEED_${clsMeta.skillChoices}_CLASS_SKILLS`);
  }
  for (const sk of draft.classSkills) {
    if (!clsMeta?.skillList.includes(sk)) errors.push("BAD_CLASS_SKILL");
    if (bgSkills.includes(sk)) errors.push("SKILL_OVERLAP_BG");
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

  const spellCap = clsMeta?.maxSpellLevelAt[level] ?? 0;
  const spellById = new Map(catalog.spells.map((s) => [s.id, s]));
  const miList = bgMeta?.featChoice ?? "wizard";
  const assertCantrip = (id: string) => {
    const spell = spellById.get(id);
    if (!spell || spell.level !== 0 || !spell.classes.includes(draft.classId)) errors.push("BAD_SPELL");
  };
  const assertLeveled = (id: string) => {
    const spell = spellById.get(id);
    if (!spell || spell.level < 1 || spell.level > spellCap || !spell.classes.includes(draft.classId)) {
      errors.push("BAD_SPELL");
    }
  };
  const assertMi = (id: string, wantLevel: number) => {
    const spell = spellById.get(id);
    if (!spell || spell.level !== wantLevel || !spell.classes.includes(miList)) errors.push("BAD_MI_SPELL");
  };
  for (const id of draft.cantrips ?? []) assertCantrip(id);
  for (const id of draft.spellsPrepared ?? []) assertLeveled(id);
  for (const id of draft.spellsKnown ?? []) assertLeveled(id);
  for (const id of draft.spellbook ?? []) assertLeveled(id);
  for (const id of draft.magicInitiateCantrips ?? []) assertMi(id, 0);
  if (draft.magicInitiateSpell) assertMi(draft.magicInitiateSpell, 1);

  const hitDie = classHint?.hitDie ?? 10;
  let hp = hpAtLevelOne({ id: draft.classId, hitDie, caster: "none", primary: [], multiclass: {}, levels: [] }, scores.con);
  if (originFeatId === "tough") hp += 2 * level;

  const kit = starterKit(clsMeta, draft.equipChoice);
  const worn = wornArmor(kit);
  const dexMod = abilityMod(scores.dex);
  let ac = worn.armored ? worn.ac + dexModBonus(worn, dexMod) : 10 + dexMod;
  if (!worn.armored && draft.classId === "barbarian") ac += abilityMod(scores.con);
  if (!worn.armored && !worn.shield && draft.classId === "monk") ac += abilityMod(scores.wis);
  if (worn.shield) ac += 2;
  if (worn.armored && draft.fightingStyleFeatId === "defense") ac += 1;
  const attacks: DerivedAttackRow[] = [unarmedAttack(scores, prof)];
  const weaponId = kit.find((id) => WEAPONS.has(id));
  if (weaponId) {
    const useDex = RANGED.has(weaponId) || (FINESSE.has(weaponId) && abilityMod(scores.dex) >= abilityMod(scores.str));
    attacks.push(weaponAttack(weaponId, labelItem(weaponId), scores, prof, useDex));
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
  if (originFeatId) {
    const feat = catalog.feats.find((f) => f.id === originFeatId);
    if (feat) features.push(feat.name);
  }
  if (draft.originFeatId) {
    const feat = catalog.feats.find((f) => f.id === draft.originFeatId);
    if (feat) features.push(feat.name);
  }

  let speedFt = 30;
  if (originFeatId === "speedy" || draft.originFeatId === "speedy") speedFt += 10;

  const spellSlots = classHint?.spellSlotsL1 ?? (clsMeta?.caster === "full" && level === 1 ? { "1": 2 } : undefined);

  return {
    name: draft.name?.trim() || "Unnamed",
    level,
    className: clsMeta?.name ?? draft.classId,
    speciesName: speciesMeta?.name ?? draft.speciesId,
    backgroundName: bgMeta?.name ?? draft.backgroundId,
    hp,
    ac,
    speedFt,
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
