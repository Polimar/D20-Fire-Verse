/**
 * Admin rules lab: preview a 5.2.1 hero through level 20, including records
 * that are not yet approved, then stamp it onto the admin's account to fight.
 */

import { randomBytes } from "node:crypto";
import type { ClassDef, SpeciesDef, SpellDef, SubclassDef } from "@d20-fireverse/content-schema";
import {
  applyPick,
  blankProgress,
  featCategory,
  firstLevel,
  hpAtLevelOne,
  nextAsk,
  type CatalogSlice,
  type LevelPick,
  type ProgressionHero,
} from "@d20-fireverse/rules";
import { accountDb } from "./auth.js";
import { buildKit } from "./class-kit.js";
import { catalogEntry, listCatalog, xpThresholds } from "./content-catalog.js";
import { classFeatureRows, classLevelCap, coverageFor, subclassLevelCap } from "./coverage.js";
import { classPackWeapon, getHero, type HeroRow } from "./hero.js";

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
type Ability = (typeof ABILITIES)[number];

type Named = { id: string; name: string; feat?: string };

function take<T extends { id: string }>(kind: "class" | "subclass" | "species" | "feat" | "spell" | "background"): T[] {
  return listCatalog()
    .filter((row) => row.kind === kind && row.valid)
    .map((row) => catalogEntry<T>(kind, row.id))
    .filter((row): row is T => Boolean(row));
}

/** Every valid catalog row, including ones the admin has not approved. Cap matches coverage (20). */
export function labCatalog(): CatalogSlice {
  return {
    classes: take<ClassDef>("class").map((row) => ({ ...row, cap: 20 })),
    subclasses: take<SubclassDef>("subclass"),
    feats: take<CatalogSlice["feats"][number]>("feat"),
    spells: take<SpellDef>("spell"),
    species: take<SpeciesDef>("species"),
    xpThresholds: xpThresholds(),
  };
}

function autoPick(hero: ProgressionHero, catalog: CatalogSlice): LevelPick | null {
  const ask = nextAsk(hero, catalog);
  if (!ask) return null;
  if (ask.kind === "class") return { kind: "class", classId: hero.classes[0]?.id ?? catalog.classes[0]!.id };
  if (ask.kind === "subclass") {
    const sub = catalog.subclasses.find((row) => row.classId === ask.classId);
    if (!sub) return null;
    return { kind: "subclass", subclassId: sub.id };
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
  if (ask.kind === "spells") {
    const known = new Set([...hero.spells, ...hero.cantrips]);
    const legal = catalog.spells.filter((spell) => spell.classes.includes(ask.classId) && !known.has(spell.id));
    const cantrips = legal.filter((spell) => spell.level === 0).slice(0, ask.cantrips).map((spell) => spell.id);
    const spells = legal.filter((spell) => spell.level > 0).slice(0, ask.spells).map((spell) => spell.id);
    if (cantrips.length !== ask.cantrips || spells.length !== ask.spells) return null;
    return { kind: "spells", spells, cantrips };
  }
  return null;
}

function walk(classId: string, speciesId: string, level: number, subclassId: string | undefined, catalog: CatalogSlice): ProgressionHero {
  const cls = catalog.classes.find((row) => row.id === classId);
  if (!cls) throw new Error("CLASS_DISABLED");
  const species = catalog.species?.find((row) => row.id === speciesId);
  if (!species) throw new Error("SPECIES_DISABLED");
  const target = Math.min(20, Math.max(1, level));
  const xp = catalog.xpThresholds[target - 1] ?? catalog.xpThresholds[catalog.xpThresholds.length - 1] ?? 0;
  const abilities = { str: 15, dex: 14, con: 13, int: 10, wis: 12, cha: 8 } as Record<Ability, number>;
  if (cls.primary[0]) abilities[cls.primary[0]] = 15;
  let hero = firstLevel(
    blankProgress(
      {
        id: "lab",
        name: "Lab",
        level: 1,
        xp,
        species: speciesId,
        alignment: "neutral",
        classes: [{ id: classId, level: 1 }],
        abilities,
        proficiency: [],
        features: [],
        spells: [],
      },
      catalog,
    ),
    catalog,
  );
  let guard = 0;
  while (guard < 80) {
    guard += 1;
    const ask = nextAsk(hero, catalog);
    if (!ask) break;
    if (ask.kind === "subclass" && subclassId) {
      hero = applyPick(hero, { kind: "subclass", subclassId }, catalog);
      continue;
    }
    const pick = autoPick(hero, catalog);
    if (!pick) break;
    hero = applyPick(hero, pick, catalog);
    if (hero.level >= target && !hero.pending.length) break;
  }
  return hero;
}

export function simulateHero(input: { classId: string; speciesId: string; level: number; subclassId?: string; backgroundId?: string }) {
  const catalog = labCatalog();
  const hero = walk(input.classId, input.speciesId, input.level, input.subclassId, catalog);
  const kit = buildKit(hero.classes, hero.features);
  const sub = hero.classes[0]?.subclass;
  return {
    hero: {
      name: hero.name,
      level: hero.level,
      xp: hero.xp,
      maxHp: hero.maxHp,
      classes: hero.classes,
      abilities: hero.abilities,
      features: hero.features,
      spells: hero.spells,
      cantrips: hero.cantrips,
      proficiency: hero.proficiency,
      pending: hero.pending,
    },
    kit,
    cap: classLevelCap(input.classId),
    subclassCap: sub ? subclassLevelCap(input.classId, sub) : classLevelCap(input.classId),
    coverage: [...classFeatureRows(input.classId), ...(sub ? coverageFor(input.classId, sub) : [])],
    catalogs: {
      classes: catalog.classes.map((row) => ({ id: row.id, name: row.name, cap: classLevelCap(row.id) })),
      subclasses: catalog.subclasses.map((row) => ({ id: row.id, classId: row.classId, name: row.name })),
      species: (catalog.species ?? []).map((row) => ({ id: row.id, name: row.name })),
      backgrounds: take<Named>("background").map((row) => ({ id: row.id, name: row.name, feat: row.feat })),
    },
  };
}

function id(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

/** Stamp a lab hero onto the admin's account so it appears as "your hero" on the TV. */
export function stampLabHero(
  userId: string,
  input: { classId: string; speciesId: string; level: number; subclassId?: string; backgroundId?: string; name?: string },
): HeroRow {
  const catalog = labCatalog();
  const walked = walk(input.classId, input.speciesId, input.level, input.subclassId, catalog);
  const cls = catalog.classes.find((row) => row.id === input.classId);
  const species = catalog.species?.find((row) => row.id === input.speciesId);
  if (!cls || !species) throw new Error("CLASS_DISABLED");
  const background = input.backgroundId ?? take<Named>("background")[0]?.id ?? "soldier";
  const name = (input.name ?? `Lab ${cls.name} ${walked.level}`).slice(0, 32);
  const heroId = id("hero");
  const loadout: { trinkets: string[]; consumables: string[]; mainhand?: string } = { trinkets: [], consumables: [] };
  accountDb()
    .prepare(
      `INSERT INTO heroes (id, user_id, name, classes_json, species, background, alignment, level, xp, ability_scores_json, skills_json, portrait, respec_free_credits, features_json, spells_json, loadout_json, pending_choices_json, hp_current, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'neutral', ?, ?, ?, ?, NULL, 0, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      heroId,
      userId,
      name,
      JSON.stringify(walked.classes),
      input.speciesId,
      background,
      walked.level,
      walked.xp,
      JSON.stringify(walked.abilities),
      JSON.stringify(walked.proficiency),
      JSON.stringify(walked.features),
      JSON.stringify([...walked.spells, ...walked.cantrips]),
      JSON.stringify(loadout),
      JSON.stringify(walked.pending),
      walked.maxHp || hpAtLevelOne(cls, walked.abilities.con, species),
      new Date().toISOString(),
    );
  const pack = classPackWeapon(input.classId);
  if (pack && catalogEntry("item", pack)) {
    const instance = id("item");
    accountDb()
      .prepare("INSERT INTO account_stash (id, user_id, item_def_id, item_instance_data_json, acquired_at) VALUES (?, ?, ?, '{}', ?)")
      .run(instance, userId, pack, new Date().toISOString());
    accountDb().prepare("UPDATE account_stash SET equipped_by_hero_id = ? WHERE id = ?").run(heroId, instance);
    loadout.mainhand = instance;
    accountDb().prepare("UPDATE heroes SET loadout_json = ? WHERE id = ?").run(JSON.stringify(loadout), heroId);
  }
  const hero = getHero(heroId);
  if (!hero) throw new Error("BAD_CHARACTER");
  return hero;
}
