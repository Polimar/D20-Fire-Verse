import assert from "node:assert/strict";
import { before, test } from "node:test";
import { deriveHero } from "@d20-fireverse/rules";
import { builderCatalog } from "../src/local/builder-catalog.js";
import { ensureForgeContentDefaults, listCatalog, reloadCatalog } from "../src/local/content-catalog.js";
import { clearStarterCaches, backgroundStarters } from "../src/local/starter-equipment.js";
import { boot, masteryPicksForClass } from "./helpers.js";

before(() => {
  boot();
  clearStarterCaches();
  reloadCatalog();
  ensureForgeContentDefaults();
});

test("catalog exposes 16+ origins including custom with abilityOptions", () => {
  const catalog = builderCatalog();
  assert.ok(catalog.backgrounds.length >= 16, String(catalog.backgrounds.length));
  const sage = catalog.backgrounds.find((b) => b.id === "sage");
  assert.ok(sage);
  assert.deepEqual(sage!.abilityOptions.slice().sort(), ["con", "int", "wis"]);
  const custom = catalog.backgrounds.find((b) => b.id === "custom");
  assert.ok(custom?.custom);
  assert.ok((custom?.abilityOptions.length ?? 0) >= 3);
});

test("origin feats and fighting styles are in play", () => {
  const feats = listCatalog().filter((r) => r.kind === "feat" && r.inPlay).map((r) => r.id);
  for (const id of [
    "crafter",
    "healer",
    "lucky",
    "musician",
    "tavern_brawler",
    "tough",
    "dueling",
    "protection",
    "sentinel",
    "war_caster",
    "boon_of_fortitude",
    "boon_of_recovery",
    "boon_of_skill_mastery",
  ]) {
    assert.ok(feats.includes(id), id);
  }
});

test("background starters cover every origin review", () => {
  clearStarterCaches();
  const starters = backgroundStarters();
  assert.ok(starters.length >= 16);
});

test("farmer with tough derives extra HP at L1", () => {
  const catalog = builderCatalog();
  const sheet = deriveHero(
    {
      classId: "fighter",
      speciesId: "human",
      backgroundId: "farmer",
      method: "standard_array",
      baseAbilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
      classSkills: ["perception", "survival"],
      fightingStyleFeatId: "defense",
      weaponMasteryWeaponIds: masteryPicksForClass("fighter"),
      equipChoice: "A",
      backgroundAsi: { mode: "plus2plus1", plus2: "str", plus1: "con" },
      speciesSkill: "athletics",
      originFeatId: "alert",
    },
    catalog,
    { hitDie: 10, saves: ["str", "con"] },
  );
  assert.equal(sheet.ok, true, sheet.errors.join(","));
  assert.ok(sheet.hp >= 12, `expected tough HP bump, got ${sheet.hp}`);
  assert.ok(sheet.features.some((f) => /tough/i.test(f)));
});

test("sage L1 rejects wrong ASI options (cha not allowed)", () => {
  const catalog = builderCatalog();
  const sheet = deriveHero(
    {
      classId: "wizard",
      speciesId: "human",
      backgroundId: "sage",
      method: "standard_array",
      baseAbilities: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 },
      classSkills: ["insight", "investigation"],
      equipChoice: "A",
      backgroundAsi: { mode: "plus2plus1", plus2: "int", plus1: "cha" },
      cantrips: catalog.spells.filter((s) => s.classes.includes("wizard") && s.level === 0).slice(0, 3).map((s) => s.id),
      spellsPrepared: catalog.spells.filter((s) => s.classes.includes("wizard") && s.level === 1).slice(0, 4).map((s) => s.id),
      spellbook: catalog.spells.filter((s) => s.classes.includes("wizard") && s.level === 1).slice(0, 6).map((s) => s.id),
      magicInitiateCantrips: catalog.spells.filter((s) => s.classes.includes("wizard") && s.level === 0).slice(0, 2).map((s) => s.id),
      magicInitiateSpell: catalog.spells.find((s) => s.classes.includes("wizard") && s.level === 1)?.id,
      magicInitiateAbility: "int",
      speciesSkill: "arcana",
      originFeatId: "alert",
    },
    catalog,
    { hitDie: 6, saves: ["int", "wis"] },
  );
  assert.equal(sheet.ok, false);
  assert.ok(sheet.errors.includes("BAD_FLEXIBLE"));
});
