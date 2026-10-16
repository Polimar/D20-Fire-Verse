import type { ClassDef, SpeciesDef, SpellDef, backgroundDef, featDef } from "@d20-fireverse/content-schema";
import type { z } from "zod";

type BackgroundDef = z.infer<typeof backgroundDef>;
type FeatDef = z.infer<typeof featDef>;
import type { BuilderCatalog, AbilityKey } from "@d20-fireverse/protocol/builder";
import { featCategory, maxSpellLevel, wizardSpellbookSize, type ClassSlice } from "@d20-fireverse/rules";
import { enabledById, enabledClasses, enabledSpells, listCatalog } from "./content-catalog.js";
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

export function builderCatalog(): BuilderCatalog {
  const species = listCatalog()
    .filter((row) => row.kind === "species" && row.inPlay)
    .map((row) => enabledById<SpeciesDef>("species", row.id))
    .filter((s): s is SpeciesDef => Boolean(s))
    .map((s) => ({ id: s.id, name: s.name, traits: s.traits }));

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
  const classes = enabledClasses().map((c) => {
    const l1 = c.levels.find((row) => row.level === 1);
    const needsStyle = l1?.features.some((f) => /fighting style/i.test(f)) ?? false;
    const slice = c as ClassSlice;
    const maxSpellLevelAt = Array.from({ length: 21 }, (_, level) => (level === 0 ? 0 : maxSpellLevel(slice, level)));
    return {
      id: c.id,
      name: c.name,
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
    portraits: PORTRAITS.map((id) => ({ id, url: portraitUrl(id) })),
  };
}

export function classDefForBuilder(classId: string): ClassDef | undefined {
  return enabledById<ClassDef>("class", classId);
}

export function spellsForClass(classId: string): SpellDef[] {
  return enabledSpells().filter((s) => s.classes.includes(classId));
}
