import assert from "node:assert/strict";
import { before, test } from "node:test";
import { accountDb, createUser, openAuth } from "../src/local/auth.js";
import { commitBuilderDraft } from "../src/local/builder-commit.js";
import { resolveContent, setContentEnabled } from "../src/local/content-catalog.js";
import { applyLevelUp, getHero, levelOptions } from "../src/local/hero.js";
import { boot, masteryPicksForClass } from "./helpers.js";

before(() => {
  boot();
  openAuth();
});

test("fighter hero level-up to 2 via progression picks and keeps split spell columns", () => {
  for (const [kind, id] of [
    ["class", "fighter"],
    ["species", "human"],
    ["background", "soldier"],
    ["feat", "defense"],
    ["feat", "savage_attacker"],
  ] as const) {
    if (kind === "feat") resolveContent(kind, id, { adminNote: "level-up test" });
    setContentEnabled(kind, id, true);
  }
  const player = createUser("lvlup01", "password", "player");
  const hero = commitBuilderDraft(player, {
    name: "Level Test",
    classId: "fighter",
    speciesId: "human",
    backgroundId: "soldier",
    method: "standard_array",
    baseAbilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    classSkills: ["perception", "survival"],
    fightingStyleFeatId: "defense",
    weaponMasteryWeaponIds: masteryPicksForClass("fighter"),
    speciesSkill: "insight",
    originFeatId: "savage_attacker",
    equipChoice: "A",
    backgroundAsi: { mode: "plus2plus1", plus2: "str", plus1: "con" },
    cantrips: [],
    spellsPrepared: [],
  });
  accountDb().prepare("UPDATE heroes SET xp = 300, pending_choices_json = '[]' WHERE id = ?").run(hero.id);
  const opts = levelOptions(hero.id);
  assert.equal(opts.ask?.kind, "class");
  const leveled = applyLevelUp(hero.id, { kind: "class", classId: "fighter" });
  assert.equal(leveled.level, 2);
  assert.equal(leveled.classes[0]?.level, 2);
  assert.deepEqual(leveled.cantrips, []);
  assert.deepEqual(leveled.spellsPrepared, []);
});

test("stale L1 spell pending is pruned when forge already stored picks", () => {
  for (const [kind, id] of [
    ["class", "fighter"],
    ["species", "human"],
    ["background", "soldier"],
    ["feat", "defense"],
    ["feat", "savage_attacker"],
  ] as const) {
    if (kind === "feat") resolveContent(kind, id, { adminNote: "level-up prune" });
    setContentEnabled(kind, id, true);
  }
  const player = createUser("lvlupdruid1", "password", "player");
  const hero = commitBuilderDraft(player, {
    name: "Druid Pending",
    classId: "fighter",
    speciesId: "human",
    backgroundId: "soldier",
    method: "standard_array",
    baseAbilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    classSkills: ["perception", "survival"],
    fightingStyleFeatId: "defense",
    weaponMasteryWeaponIds: masteryPicksForClass("fighter"),
    speciesSkill: "insight",
    originFeatId: "savage_attacker",
    equipChoice: "A",
    backgroundAsi: { mode: "plus2plus1", plus2: "str", plus1: "con" },
  });
  // Simulate a caster forge write that left a spell ask after already storing picks.
  accountDb()
    .prepare(
      `UPDATE heroes SET classes_json = ?, cantrips_json = ?, spells_prepared_json = ?, spells_json = ?, pending_choices_json = ?, xp = 0 WHERE id = ?`,
    )
    .run(
      JSON.stringify([{ id: "druid", level: 1 }]),
      JSON.stringify(["guidance", "elementalism"]),
      JSON.stringify(["entangle", "goodberry", "healing_word", "thunderwave"]),
      JSON.stringify(["guidance", "elementalism", "entangle", "goodberry", "healing_word", "thunderwave"]),
      JSON.stringify([{ kind: "spells", atLevel: 1, classId: "druid", cantrips: 2, spells: 4 }]),
      hero.id,
    );
  setContentEnabled("class", "druid", true);
  const opts = levelOptions(hero.id);
  assert.equal(opts.ask, null);
  const fresh = getHero(hero.id)!;
  assert.ok(!fresh.pending.some((p) => p.kind === "spells"), JSON.stringify(fresh.pending));
});

test("wizard level 2 queues a spell pick and does not prune it against existing prepared list", () => {
  for (const [kind, id] of [
    ["class", "wizard"],
    ["species", "human"],
    ["background", "sage"],
    ["feat", "magic_initiate"],
    ["feat", "savage_attacker"],
  ] as const) {
    if (kind === "feat") resolveContent(kind, id, { adminNote: "wizard L2 spells" });
    setContentEnabled(kind, id, true);
  }
  // Enable a few wizard spells so Legal picks exist.
  for (const id of ["mage_armor", "shield", "magic_missile", "sleep", "detect_magic", "burning_hands", "ice_knife", "charm_person"]) {
    setContentEnabled("spell", id, true);
  }
  for (const id of ["fire_bolt", "light", "prestidigitation", "ray_of_frost", "acid_splash"]) {
    setContentEnabled("spell", id, true);
  }
  const player = createUser("lvlupwiz1", "password", "player");
  const hero = commitBuilderDraft(player, {
    name: "Wiz Level Spells",
    classId: "wizard",
    speciesId: "human",
    backgroundId: "sage",
    method: "standard_array",
    baseAbilities: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 },
    classSkills: ["investigation", "religion"],
    speciesSkill: "insight",
    originFeatId: "savage_attacker",
    equipChoice: "A",
    backgroundAsi: { mode: "plus2plus1", plus2: "int", plus1: "con" },
    cantrips: ["fire_bolt", "light", "prestidigitation"],
    spellsPrepared: ["mage_armor", "shield", "magic_missile", "sleep"],
    spellbook: ["mage_armor", "shield", "magic_missile", "sleep", "detect_magic", "burning_hands"],
    magicInitiateCantrips: ["ray_of_frost", "acid_splash"],
    magicInitiateSpell: "charm_person",
    magicInitiateAbility: "int",
  });
  accountDb().prepare("UPDATE heroes SET xp = 300, pending_choices_json = '[]' WHERE id = ?").run(hero.id);
  const leveled = applyLevelUp(hero.id, { kind: "class", classId: "wizard" });
  assert.equal(leveled.level, 2);
  assert.equal(leveled.pending[0]?.kind, "expertise", "Scholar expertise before spells");
  const afterExpert = applyLevelUp(leveled.id, { kind: "expertise", skills: ["arcana"] });
  assert.ok(afterExpert.features.includes("expertise:arcana"));
  const spellAsk = afterExpert.pending.find((p) => p.kind === "spells");
  assert.ok(spellAsk && spellAsk.kind === "spells", `expected L2 spell ask, got ${JSON.stringify(afterExpert.pending)}`);
  assert.equal(spellAsk.spells, 1, "prepared spells go 4→5");
  assert.equal(spellAsk.spellbook, 2, "wizard adds 2 spells to the spellbook each level after 1");
  const opts = levelOptions(afterExpert.id);
  assert.equal(opts.ask?.kind, "spells");
  assert.equal(opts.ask && "spellbook" in opts.ask ? opts.ask.spellbook : 0, 2);
});

test("admin level-up bypasses XP and grants threshold", () => {
  for (const [kind, id] of [
    ["class", "fighter"],
    ["species", "human"],
    ["background", "soldier"],
    ["feat", "defense"],
    ["feat", "savage_attacker"],
  ] as const) {
    if (kind === "feat") resolveContent(kind, id, { adminNote: "admin bypass" });
    setContentEnabled(kind, id, true);
  }
  const admin = createUser("lvlupadmin1", "password", "admin");
  const hero = commitBuilderDraft(admin, {
    name: "Bypass Tester",
    classId: "fighter",
    speciesId: "human",
    backgroundId: "soldier",
    method: "standard_array",
    baseAbilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    classSkills: ["perception", "survival"],
    fightingStyleFeatId: "defense",
    weaponMasteryWeaponIds: masteryPicksForClass("fighter"),
    speciesSkill: "insight",
    originFeatId: "savage_attacker",
    equipChoice: "A",
    backgroundAsi: { mode: "plus2plus1", plus2: "str", plus1: "con" },
  });
  accountDb().prepare("UPDATE heroes SET xp = 0, pending_choices_json = '[]' WHERE id = ?").run(hero.id);
  const opts = levelOptions(hero.id, { adminBypassXp: true });
  assert.equal(opts.ask?.kind, "class");
  assert.equal(opts.suggested?.kind, "class");
  const leveled = applyLevelUp(hero.id, opts.suggested ?? undefined, { adminBypassXp: true });
  assert.equal(leveled.level, 2);
  assert.ok(leveled.xp > 0, `expected xp grant, got ${leveled.xp}`);
});
