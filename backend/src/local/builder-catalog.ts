import type { ClassDef, ItemDef, SpeciesDef, SpellDef, backgroundDef, featDef } from "@d20-fireverse/content-schema";
import type { z } from "zod";

type BackgroundDef = z.infer<typeof backgroundDef>;
type FeatDef = z.infer<typeof featDef>;
import type { AbilityKey, BuilderCatalog, BuilderMasteryWeapon } from "@d20-fireverse/protocol/builder";
import {
  CLASS_MASTERY_MELEE_ONLY,
  featCategory,
  filterMasteryWeaponsForClass,
  maxSpellLevel,
  wizardSpellbookSize,
  type ClassSlice,
  type MasteryWeaponOption,
} from "@d20-fireverse/rules";
import { enabledById, enabledClasses, enabledSpells, listCatalog } from "./content-catalog.js";
import { classFeatureBlurbs } from "./class-feature-blurbs.js";
import { listForgePortraitsOnDisk } from "./forge-portraits.js";
import { PORTRAITS, portraitUrl } from "./portraits.js";
import { backgroundStarters, classStarters } from "./starter-equipment.js";

const SKILL_ABILITY: Record<string, AbilityKey> = {
  acrobatics: "dex",
  animal_handling: "wis",
  arcana: "int",
  athletics: "str",
  deception: "cha",
  history: "int",
  insight: "wis",
  intimidation: "cha",
  investigation: "int",
  medicine: "wis",
  nature: "int",
  perception: "wis",
  performance: "cha",
  persuasion: "cha",
  religion: "int",
  sleight_of_hand: "dex",
  stealth: "dex",
  survival: "wis",
};

const MASTERY_NAMES: Record<string, string> = {
  cleave: "Cleave",
  graze: "Graze",
  nick: "Nick",
  push: "Push",
  sap: "Sap",
  slow: "Slow",
  topple: "Topple",
  vex: "Vex",
};

function classEquipChoices(classId: string): Array<{ id: "A" | "B" | "C"; label: string; items: string[] }> {
  const row = classStarters().find((c) => c.classId === classId);
  if (!row?.options.length) return [{ id: "A", label: "Class starter gear", items: [] }];
  return row.options.map((o) => ({ id: o.id, label: o.label.slice(0, 96), items: o.items }));
}

function backgroundEquipChoices(backgroundId: string): Array<{ id: "A" | "B"; label: string }> {
  const row = backgroundStarters().find((b) => b.backgroundId === backgroundId);
  if (!row?.options.length) return [{ id: "A", label: "Background kit" }, { id: "B", label: "50 GP" }];
  return row.options.map((o) => ({ id: o.id as "A" | "B", label: o.label.slice(0, 96) }));
}

function fightingStyles(): string[] {
  return listCatalog()
    .filter((row) => row.kind === "feat" && row.inPlay)
    .map((row) => enabledById<FeatDef>("feat", row.id))
    .filter((f): f is FeatDef => Boolean(f))
    .filter((f) => featCategory(f) === "fighting_style")
    .map((f) => f.id);
}

function allMasteryWeapons(): MasteryWeaponOption[] {
  const out: MasteryWeaponOption[] = [];
  for (const row of listCatalog()) {
    if (row.kind !== "item" || !row.inPlay) continue;
    const item = enabledById<ItemDef>("item", row.id);
    if (!item?.weaponMastery || !item.weapon?.category) continue;
    out.push({
      id: item.id,
      name: item.name,
      masteryId: item.weaponMastery,
      masteryName: MASTERY_NAMES[item.weaponMastery] ?? item.weaponMastery,
      category: item.weapon.category,
      properties: item.weapon.properties ?? [],
    });
  }
  return out;
}

function toCatalogWeapon(w: MasteryWeaponOption): BuilderMasteryWeapon {
  return {
    id: w.id,
    name: w.name,
    masteryId: w.masteryId,
    masteryName: w.masteryName,
    category: w.category,
  };
}

export function builderCatalog(): BuilderCatalog {
  const species = listCatalog()
    .filter((row) => row.kind === "species" && row.inPlay)
    .map((row) => enabledById<SpeciesDef>("species", row.id))
    .filter((s): s is SpeciesDef => Boolean(s))
    .map((s) => ({
      id: s.id,
      name: s.name,
      traits: s.traits,
      speedFt: s.speedFt,
      size: s.size,
      traitDetails:
        s.traitDetails?.map((t) => ({
          name: t.name,
          summary: t.summary,
          ...(t.unlockLevel != null ? { unlockLevel: t.unlockLevel } : {}),
        })) ??
        s.traits.map((name) => ({ name, summary: name })),
    }));

  const backgrounds = listCatalog()
    .filter((row) => row.kind === "background" && row.inPlay)
    .map((row) => enabledById<BackgroundDef>("background", row.id))
    .filter((b): b is BackgroundDef => Boolean(b))
    .map((b) => ({
      id: b.id,
      name: b.name,
      skills: b.skills,
      featId: b.feat,
      featChoice: b.featChoice,
      tools: b.tools,
      custom: b.custom,
      abilityOptions: b.abilityOptions ?? (["str", "dex", "con", "int", "wis", "cha"] as AbilityKey[]),
      equipChoices: backgroundEquipChoices(b.id),
    }));

  const styleIds = fightingStyles();
  const masteryPool = allMasteryWeapons();
  const masteryWeaponsByClass: Record<string, BuilderMasteryWeapon[]> = {};

  const classes = enabledClasses().map((c) => {
    const l1 = c.levels.find((row) => row.level === 1);
    const needsStyle = l1?.features.some((f) => /fighting style/i.test(f)) ?? false;
    const slice = c as ClassSlice;
    const maxSpellLevelAt = Array.from({ length: 21 }, (_, level) => (level === 0 ? 0 : maxSpellLevel(slice, level)));
    const masteryCount = Number(l1?.columns?.weapon_mastery ?? 0) || (c.weaponMastery ? 2 : 0);
    const filtered = filterMasteryWeaponsForClass(c.id, masteryPool).map(toCatalogWeapon);
    masteryWeaponsByClass[c.id] = filtered;
    return {
      id: c.id,
      name: c.name,
      hitDie: c.hitDie,
      saves: c.saves as AbilityKey[],
      skillChoices: c.skillChoices,
      skillList: c.skillList,
      caster: c.caster,
      spellAbility: c.spellAbility,
      level1: {
        cantrips: l1?.cantrips,
        preparedSpells: l1?.preparedSpells,
        spellsKnown: l1?.spellsKnown,
        spellbookSize: c.spellProgression?.mode === "prepared" ? wizardSpellbookSize(1) : undefined,
      },
      maxSpellLevelAt,
      fightingStyleRequired: needsStyle,
      fightingStyleFeatIds: needsStyle ? styleIds : [],
      weaponMastery: Boolean(c.weaponMastery),
      weaponMasteryCountL1: c.weaponMastery ? masteryCount : 0,
      weaponMasteryMeleeOnly: CLASS_MASTERY_MELEE_ONLY.has(c.id),
      levels: c.levels.map((row) => ({ level: row.level, features: row.features })),
      featureBlurbs: classFeatureBlurbs(c.id, 3),
      equipChoices: classEquipChoices(c.id),
    };
  });

  const feats = listCatalog()
    .filter((row) => row.kind === "feat" && row.inPlay)
    .map((row) => enabledById<FeatDef>("feat", row.id))
    .filter((f): f is FeatDef => Boolean(f))
    .map((f) => ({
      id: f.id,
      name: f.name,
      category: featCategory(f),
      asiChoices: f.asiChoices,
      repeatable: f.repeatable,
    }));

  const spells = enabledSpells().map((s) => ({ id: s.id, name: s.name, level: s.level, classes: s.classes }));

  const skills: BuilderCatalog["skills"] = {};
  for (const [id, ability] of Object.entries(SKILL_ABILITY)) {
    skills[id] = { label: id.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()), ability };
  }

  return {
    standardArray: [15, 14, 13, 12, 10, 8],
    pointBuy: { budget: 27, min: 8, max: 15 },
    species,
    backgrounds,
    classes,
    feats,
    spells,
    skills,
    portraits: [
      ...PORTRAITS.map((id) => ({ id, url: portraitUrl(id) })),
      ...listForgePortraitsOnDisk().map((p) => ({
        id: p.id,
        url: p.url,
        speciesId: p.speciesId,
        classId: p.classId,
        sex: p.sex,
        variant: p.variant,
      })),
    ],
    masteryWeapons: masteryPool.map(toCatalogWeapon),
    masteryWeaponsByClass,
  };
}

export function classDefForBuilder(classId: string): ClassDef | undefined {
  return enabledById<ClassDef>("class", classId);
}

export function spellsForClass(classId: string): SpellDef[] {
  return enabledSpells().filter((s) => s.classes.includes(classId));
}
