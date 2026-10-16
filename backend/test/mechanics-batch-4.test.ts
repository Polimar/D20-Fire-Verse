import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { before, test } from "node:test";
import { listCatalog } from "../src/local/content-catalog.js";
import { getAbility, getMonster, getPregen } from "../src/local/campaign.js";
import { applyDamage, performPcAction, startCombat } from "../src/local/combat.js";
import { refreshMenus } from "../src/local/srd-sheet.js";
import { boot } from "./helpers.js";

before(boot);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const triage = JSON.parse(fs.readFileSync(path.join(ROOT, "content/triage/spell_combat_v1.json"), "utf8")) as {
  spells: Array<{ spell_id: string; verdict: string }>;
};

const TRIAGED_IDS = triage.spells.map((s) => s.spell_id);

test("mega-4 triage spells clear missing mechanic queue", () => {
  for (const id of TRIAGED_IDS) {
    const row = listCatalog().find((r) => r.kind === "spell" && r.id === id);
    assert.equal(row?.missingMechanic, false, id);
  }
});

test("sheetOnly spells are not offered in combat menus", () => {
  const c = startCombat("cellar_rats", [{ playerId: "P1", displayName: "M", characterId: "fv_mira", characterName: "Mira" }]);
  const hero = c.tokens.find((t) => t.playerId === "P1")!;
  hero.sheetDriven = true;
  hero.spells = ["spell_alarm", "spell_detect_magic", "spell_cure_wounds"];
  hero.slots = { "1": 2 };
  refreshMenus(hero, getPregen("fv_mira"), getAbility);
  assert.equal(hero.actionIds.includes("spell_alarm"), false);
  assert.equal(hero.actionIds.includes("spell_detect_magic"), false);
});

test("revivify raises a dead ally", () => {
  const c = startCombat("cellar_rats", [
    { playerId: "P1", displayName: "M", characterId: "fv_mira", characterName: "Mira" },
    { playerId: "P2", displayName: "T", characterId: "fv_torin", characterName: "Torin" },
  ]);
  const mira = c.tokens.find((t) => t.playerId === "P1")!;
  const torin = c.tokens.find((t) => t.playerId === "P2")!;
  torin.dead = true;
  torin.hp = 0;
  c.turnOrder = [mira.id, ...c.turnOrder.filter((id) => id !== mira.id)];
  c.turnIndex = 0;
  mira.x = torin.x;
  mira.y = Math.max(0, torin.y - 1);
  mira.sheetDriven = false;
  mira.hasAction = true;
  mira.actionIds = ["spell_revivify"];
  mira.slots = { "3": 1 };
  performPcAction(c, "P1", "spell_revivify", torin.id);
  assert.equal(torin.dead, false);
  assert.equal(torin.hp, 1);
});

test("death ward prevents the first drop to 0", () => {
  const c = startCombat("cellar_rats", [{ playerId: "P1", displayName: "M", characterId: "fv_mira", characterName: "Mira" }]);
  const hero = c.tokens.find((t) => t.playerId === "P1")!;
  hero.deathWard = true;
  hero.hp = 5;
  applyDamage(c, hero, 20, false, "slashing", true);
  assert.equal(hero.hp, 1);
  assert.equal(hero.deathWard, false);
  assert.equal(hero.dead, false);
});

test("false_life grants temp HP", () => {
  const c = startCombat("cellar_rats", [{ playerId: "P1", displayName: "M", characterId: "fv_mira", characterName: "Mira" }]);
  const hero = c.tokens.find((t) => t.playerId === "P1")!;
  hero.sheetDriven = false;
  hero.hasAction = true;
  hero.actionIds = ["spell_false_life"];
  hero.slots = { "1": 1 };
  performPcAction(c, "P1", "spell_false_life");
  assert.ok((hero.tempHp ?? 0) >= 6);
});

test("antimagic blocks leveled spells inside the field", () => {
  const c = startCombat("cellar_rats", [{ playerId: "P1", displayName: "M", characterId: "fv_mira", characterName: "Mira" }]);
  const hero = c.tokens.find((t) => t.playerId === "P1")!;
  const foe = c.tokens.find((t) => t.kind === "enemy")!;
  hero.sheetDriven = false;
  hero.hasAction = true;
  hero.actionIds = ["spell_antimagic_field", "spell_magic_missile"];
  hero.slots = { "1": 2, "8": 1 };
  performPcAction(c, "P1", "spell_antimagic_field");
  hero.hasAction = true;
  assert.throws(() => performPcAction(c, "P1", "spell_magic_missile", foe.id), /ANTIMAGIC/);
});

test("create_undead summons skeleton into turn order", () => {
  assert.ok(getMonster("srd_skeleton"));
  const c = startCombat("cellar_rats", [{ playerId: "P1", displayName: "M", characterId: "fv_mira", characterName: "Mira" }]);
  const hero = c.tokens.find((t) => t.playerId === "P1")!;
  const foe = c.tokens.find((t) => t.kind === "enemy")!;
  hero.sheetDriven = false;
  hero.hasAction = true;
  hero.actionIds = ["spell_create_undead"];
  hero.slots = { "6": 1 };
  hero.x = foe.x;
  hero.y = Math.max(0, foe.y - 1);
  performPcAction(c, "P1", "spell_create_undead", foe.id);
  const summon = c.tokens.find((t) => t.summonOwner === hero.id);
  assert.ok(summon);
  assert.equal(summon!.monsterId, "srd_skeleton");
  assert.ok(c.turnOrder.includes(summon!.id));
});

test("foresight grants advantage flags", () => {
  const c = startCombat("cellar_rats", [{ playerId: "P1", displayName: "M", characterId: "fv_mira", characterName: "Mira" }]);
  const hero = c.tokens.find((t) => t.playerId === "P1")!;
  hero.sheetDriven = false;
  hero.hasAction = true;
  hero.actionIds = ["spell_foresight"];
  hero.slots = { "9": 1 };
  performPcAction(c, "P1", "spell_foresight", hero.id);
  assert.equal(hero.advantageAttacks, true);
  assert.equal(hero.advantageSaves, true);
});

test("enhance_ability sets enhancedAbility", () => {
  const c = startCombat("cellar_rats", [{ playerId: "P1", displayName: "M", characterId: "fv_mira", characterName: "Mira" }]);
  const hero = c.tokens.find((t) => t.playerId === "P1")!;
  hero.sheetDriven = false;
  hero.hasAction = true;
  hero.actionIds = ["spell_enhance_ability"];
  hero.slots = { "2": 1 };
  performPcAction(c, "P1", "spell_enhance_ability", hero.id);
  assert.equal(hero.enhancedAbility, "str");
  assert.equal(hero.blessed, true);
});
