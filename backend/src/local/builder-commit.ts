import { randomBytes } from "node:crypto";
import type { BuilderDraft } from "@d20-fireverse/protocol/builder";
import { blankProgress, deriveHero, firstLevel, pruneSatisfiedPending } from "@d20-fireverse/rules";
import { defaultPortrait, isPortraitId } from "./portraits.js";
import type { SessionUser } from "./auth.js";
import { accountDb } from "./auth.js";
import { builderCatalog, classDefForBuilder } from "./builder-catalog.js";
import { assertHeroName, getHero, type HeroRow } from "./hero.js";
import { progressionCatalogFromHero } from "./builder-hero-bridge.js";
import { creditGold } from "./hero.js";
import {
  filterGrantableItems,
  resolveBackgroundStarter,
  resolveClassStarter,
} from "./starter-equipment.js";
import { insertStashItem } from "./stash-mut.js";

function id(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function giveHeroStarterItem(userId: string, heroId: string, itemDefId: string): void {
  insertStashItem(userId, itemDefId, { instanceId: id("item"), boundHeroId: heroId });
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
  const sex = draft.sex === "m" ? "m" : "f";
  const portraitId = isPortraitId(draft.portraitId)
    ? draft.portraitId
    : defaultPortrait(draft.speciesId, draft.classId, sex);
  const meta = JSON.stringify({
    method: draft.method,
    sex,
    portraitId,
    backgroundAsi: draft.backgroundAsi,
    equipChoice: draft.equipChoice,
    backgroundEquipChoice: draft.backgroundEquipChoice ?? "A",
    about: draft.about ?? "",
  });

  accountDb()
    .prepare(
      `INSERT INTO heroes (id, user_id, name, classes_json, species, background, alignment, level, xp, ability_scores_json,
        skills_json, portrait, respec_free_credits, features_json, spells_json, loadout_json, created_at,
        cantrips_json, spells_prepared_json, spellbook_json, builder_meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 0, ?, ?, '{"trinkets":[],"consumables":[]}', ?, ?, ?, ?, ?)`,
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
      JSON.stringify([
        ...new Set([
          ...(catalog.backgrounds.find((b) => b.id === draft.backgroundId)?.custom
            ? (draft.customSkills ?? [])
            : (catalog.backgrounds.find((b) => b.id === draft.backgroundId)?.skills ?? [])),
          ...draft.classSkills,
          ...(draft.skilledPicks ?? []),
          ...(draft.speciesSkill ? [draft.speciesSkill] : []),
        ]),
      ]),
      portraitId,
      JSON.stringify((draft.expertiseSkills ?? []).map((id) => `expertise:${id}`)),
      JSON.stringify(spells),
      new Date().toISOString(),
      JSON.stringify([
        ...(draft.cantrips ?? []),
        ...(draft.magicInitiateCantrips ?? []),
      ]),
      JSON.stringify([
        ...(draft.spellsPrepared ?? []),
        ...(draft.magicInitiateSpell ? [draft.magicInitiateSpell] : []),
      ]),
      JSON.stringify(draft.spellbook ?? []),
      meta,
    );
  if (draft.languages?.length) {
    accountDb().prepare("UPDATE heroes SET languages_json = ? WHERE id = ?").run(JSON.stringify(draft.languages), heroId);
  }

  const classPick = resolveClassStarter(draft.classId, draft.equipChoice ?? "A");
  if (classPick) {
    for (const itemId of filterGrantableItems(classPick.items)) giveHeroStarterItem(user.id, heroId, itemId);
    if (classPick.gold > 0) creditGold(user.id, classPick.gold);
  }
  const bgPick = resolveBackgroundStarter(draft.backgroundId, draft.backgroundEquipChoice ?? "A");
  if (bgPick) {
    for (const itemId of filterGrantableItems(bgPick.items)) giveHeroStarterItem(user.id, heroId, itemId);
    if (bgPick.gold > 0) creditGold(user.id, bgPick.gold);
  }

  const hero = getHero(heroId);
  if (!hero) throw new Error("BAD_CHARACTER");
  const prog = progressionCatalogFromHero();
  const opened = firstLevel(
    blankProgress(heroToRules(hero), prog),
    prog,
  );
  hero.features = opened.features;
  hero.maxHp = opened.maxHp;
  // Forge already stored cantrips / prepared spells — drop the L1 spell ask if satisfied.
  const forgeCantrips = [...(draft.cantrips ?? []), ...(draft.magicInitiateCantrips ?? [])];
  const forgeSpells = [
    ...(draft.spellsPrepared ?? draft.spellsKnown ?? []),
    ...(draft.magicInitiateSpell ? [draft.magicInitiateSpell] : []),
  ];
  hero.pending = pruneSatisfiedPending({
    ...opened,
    cantrips: forgeCantrips,
    spells: forgeSpells,
  });
  const bg = catalog.backgrounds.find((b) => b.id === draft.backgroundId);
  const originFeat = bg?.custom ? draft.customFeatId : bg?.featId;
  const extras = [
    draft.fightingStyleFeatId,
    originFeat,
    draft.originFeatId,
  ].filter((id): id is string => Boolean(id));
  hero.features = [...new Set([...hero.features, ...extras])];
  if (originFeat === "tough" || draft.originFeatId === "tough") {
    hero.maxHp += 2 * playerLevel;
  }
  if (originFeat === "boon_of_fortitude" || draft.originFeatId === "boon_of_fortitude") {
    hero.maxHp += 40;
  }
  const allSpells = [
    ...new Set([
      ...spells,
      ...(draft.magicInitiateCantrips ?? []),
      ...(draft.magicInitiateSpell ? [draft.magicInitiateSpell] : []),
    ]),
  ];
  const masteryWeaponIds = draft.weaponMasteryWeaponIds ?? [];
  const masteryProps = masteryWeaponIds
    .map((wid) => catalog.masteryWeapons.find((w) => w.id === wid)?.masteryId)
    .filter((id): id is string => Boolean(id));
  const metaExtra = {
    ...JSON.parse(meta) as Record<string, unknown>,
    skilledPicks: draft.skilledPicks,
    weaponMasteryWeaponIds: masteryWeaponIds,
    masteryWeapons: masteryWeaponIds,
    masteries: [...new Set(masteryProps)],
    fightingStyleFeatId: draft.fightingStyleFeatId,
    magicInitiate: originFeat === "magic_initiate"
      ? {
          cantrips: draft.magicInitiateCantrips,
          spell: draft.magicInitiateSpell,
          ability: draft.magicInitiateAbility,
          list: bg?.featChoice,
        }
      : undefined,
    customTool: draft.customTool,
    sex,
    portraitId,
  };
  accountDb()
    .prepare(
      "UPDATE heroes SET features_json=?, pending_choices_json=?, hp_current=?, spells_json=?, cantrips_json=?, spells_prepared_json=?, builder_meta_json=? WHERE id=?",
    )
    .run(
      JSON.stringify(hero.features),
      JSON.stringify(hero.pending),
      hero.maxHp,
      JSON.stringify(allSpells),
      JSON.stringify([...(draft.cantrips ?? []), ...(draft.magicInitiateCantrips ?? [])]),
      JSON.stringify([
        ...(draft.spellsPrepared ?? []),
        ...(draft.magicInitiateSpell ? [draft.magicInitiateSpell] : []),
      ]),
      JSON.stringify(metaExtra),
      heroId,
    );
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
