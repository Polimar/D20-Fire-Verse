import type { ClassDef, SpeciesDef, SpellDef, backgroundDef, featDef } from "@d20-fireverse/content-schema";
import type { z } from "zod";

type BackgroundDef = z.infer<typeof backgroundDef>;
type FeatDef = z.infer<typeof featDef>;
import type { BuilderCatalog, AbilityKey } from "@d20-fireverse/protocol/builder";
import { featCategory, wizardSpellbookSize } from "@d20-fireverse/rules";
import { enabledById, enabledClasses, enabledSpells, listCatalog } from "./content-catalog.js";
import { PORTRAITS, portraitUrl } from "./portraits.js";

/** Mechanical reference: background ability score options (PHB 2024). */
const BACKGROUND_ABILITIES: Record<string, AbilityKey[]> = {
  acolyte: ["wis", "int", "cha"],
  criminal: ["dex", "con", "int"],
  sage: ["int", "wis", "cha"],
  soldier: ["str", "dex", "con"],
};

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

const FIGHTER_STARTER = [
  { id: "A" as const, label: "Chain mail, greatsword, flail, javelins, pack" },
  { id: "B" as const, label: "Studded leather, scimitar, shortsword, longbow" },
  { id: "C" as const, label: "155 gp (items skipped)" },
];

const GENERIC_STARTER = [{ id: "A" as const, label: "Class pack weapon in stash" }];

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
      abilityOptions: BACKGROUND_ABILITIES[b.id] ?? ["str", "dex", "con", "int", "wis", "cha"],
    }));

  const styleIds = fightingStyles();
  const classes = enabledClasses().map((c) => {
    const l1 = c.levels.find((row) => row.level === 1);
    const needsStyle = l1?.features.some((f) => /fighting style/i.test(f)) ?? false;
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
      fightingStyleRequired: needsStyle,
      fightingStyleFeatIds: needsStyle ? styleIds : [],
      equipChoices: c.id === "fighter" ? FIGHTER_STARTER : GENERIC_STARTER,
    };
  });

  const feats = listCatalog()
    .filter((row) => row.kind === "feat" && row.inPlay)
    .map((row) => enabledById<FeatDef>("feat", row.id))
    .filter((f): f is FeatDef => Boolean(f))
    .map((f) => ({ id: f.id, name: f.name, category: featCategory(f) }));

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
