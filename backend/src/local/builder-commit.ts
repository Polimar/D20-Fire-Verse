import { randomBytes } from "node:crypto";
import type { BuilderDraft } from "@d20-fireverse/protocol/builder";
import { deriveHero } from "@d20-fireverse/rules";
import type { SessionUser } from "./auth.js";
import { accountDb } from "./auth.js";
import { builderCatalog, classDefForBuilder } from "./builder-catalog.js";
import { assertHeroName, getHero, type HeroRow } from "./hero.js";
import { firstLevel, blankProgress } from "@d20-fireverse/rules";
import { progressionCatalogFromHero } from "./builder-hero-bridge.js";

const STARTER_ITEMS: Record<string, Record<string, string[]>> = {
  fighter: {
    A: ["chain_mail", "greatsword", "flail", "javelin"],
    B: ["studded_leather_armor", "scimitar", "shortsword", "longbow"],
    C: [],
  },
};

function id(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function giveStash(userId: string, itemDefId: string): void {
  accountDb()
    .prepare(
      "INSERT INTO account_stash (id, user_id, item_def_id, item_instance_data_json, acquired_at) VALUES (?, ?, ?, '{}', ?)",
    )
    .run(id("item"), userId, itemDefId, new Date().toISOString());
}

export function commitBuilderDraft(user: SessionUser, draft: BuilderDraft): HeroRow {
  const catalog = builderCatalog();
  const cls = classDefForBuilder(draft.classId);
  if (!cls) throw new Error("CLASS_DISABLED");
  const levelRow = cls.levels.find((row) => row.level === 1);
  const sheet = deriveHero(draft, catalog, {
    hitDie: cls.hitDie,
    saves: cls.saves,
    spellSlotsL1: levelRow?.spellSlots,
  });
  if (!sheet.ok) throw new Error(sheet.errors[0] ?? "MISSING_DRAFT");

  const playerLevel = user.role === "admin" ? Math.min(20, Math.max(1, draft.level ?? 1)) : 1;
  if (user.role !== "admin" && (draft.level ?? 1) !== 1) throw new Error("BAD_LEVEL");

  const name = assertHeroName(draft.name ?? "Hero");
  const heroId = id("hero");
  const abilities = Object.fromEntries(
    Object.entries(sheet.abilities).map(([k, v]) => [k, v.score]),
  ) as HeroRow["abilities"];

  const spells = [...(draft.cantrips ?? []), ...(draft.spellsPrepared ?? draft.spellsKnown ?? [])];
  const meta = JSON.stringify({
    method: draft.method,
    backgroundAsi: draft.backgroundAsi,
    equipChoice: draft.equipChoice,
    about: draft.about ?? "",
  });

  accountDb()
    .prepare(
      `INSERT INTO heroes (id, user_id, name, classes_json, species, background, alignment, level, xp, ability_scores_json,
        skills_json, portrait, respec_free_credits, features_json, spells_json, loadout_json, created_at,
        cantrips_json, spells_prepared_json, spellbook_json, builder_meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 0, '[]', ?, '{"trinkets":[],"consumables":[]}', ?, ?, ?, ?, ?)`,
    )
    .run(
      heroId,
      user.id,
      name,
      JSON.stringify([{ id: cls.id, level: playerLevel }]),
      draft.speciesId,
      draft.backgroundId,
      draft.alignment ?? "neutral_good",
      playerLevel,
      JSON.stringify(abilities),
      JSON.stringify([...new Set([...(catalog.backgrounds.find((b) => b.id === draft.backgroundId)?.skills ?? []), ...draft.classSkills, ...(draft.speciesSkill ? [draft.speciesSkill] : [])])]),
      draft.portraitId ?? null,
      JSON.stringify(spells),
      new Date().toISOString(),
      JSON.stringify(draft.cantrips ?? []),
      JSON.stringify(draft.spellsPrepared ?? []),
      JSON.stringify(draft.spellbook ?? []),
      meta,
    );

  const pack = STARTER_ITEMS[draft.classId]?.[draft.equipChoice ?? "A"] ?? [`${draft.classId === "wizard" ? "quarterstaff" : "longsword"}`];
  for (const itemId of pack) giveStash(user.id, itemId);

  const hero = getHero(heroId);
  if (!hero) throw new Error("BAD_CHARACTER");
  const prog = progressionCatalogFromHero();
  const opened = firstLevel(
    blankProgress(heroToRules(hero), prog),
    prog,
  );
  hero.features = opened.features;
  hero.pending = opened.pending;
  hero.maxHp = opened.maxHp;
  if (draft.fightingStyleFeatId) hero.features = [...hero.features, draft.fightingStyleFeatId];
  accountDb()
    .prepare("UPDATE heroes SET features_json=?, pending_choices_json=?, hp_current=?, spells_json=? WHERE id=?")
    .run(JSON.stringify(hero.features), JSON.stringify(hero.pending), hero.maxHp, JSON.stringify(spells), heroId);
  return getHero(heroId) ?? hero;
}

function heroToRules(hero: HeroRow) {
  return {
    id: hero.id,
    name: hero.name,
    species: hero.species,
    alignment: hero.alignment,
    level: hero.level,
    xp: hero.xp,
    classes: hero.classes,
    abilities: hero.abilities,
    proficiency: hero.skills,
    features: hero.features,
    spells: hero.spells,
  };
}
