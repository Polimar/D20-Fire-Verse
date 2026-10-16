import assert from "node:assert/strict";
import { test } from "node:test";
import {
  archeryBonus,
  crafterPrice,
  defenseAcBonus,
  duelingBonus,
  fortitudeExtraHeal,
  fortitudeHpBonus,
  greatWeaponMasterBonus,
  healerKitHeal,
  initLuck,
  spendLuck,
  spellRecallRefund,
  toughHpBonus,
  tryCombatProwess,
  tryRecovery,
  unarmedDie,
  WIRED_FEAT_IDS,
} from "../src/local/feat-effects.js";

test("wired feat id list covers the plan catalog", () => {
  assert.ok(WIRED_FEAT_IDS.includes("tough"));
  assert.ok(WIRED_FEAT_IDS.includes("lucky"));
  assert.ok(WIRED_FEAT_IDS.includes("protection"));
  assert.ok(WIRED_FEAT_IDS.includes("boon_of_fortitude"));
  assert.ok(WIRED_FEAT_IDS.length >= 40);
});

test("tough adds 2 HP per level", () => {
  assert.equal(toughHpBonus(5, ["tough"]), 10);
  assert.equal(toughHpBonus(5, []), 0);
});

test("fortitude adds 40 HP and extra heal", () => {
  assert.equal(fortitudeHpBonus(["boon_of_fortitude"]), 40);
  assert.equal(fortitudeExtraHeal(["boon_of_fortitude"], 3), 3);
});

test("lucky spends points", () => {
  const t = { features: ["lucky"] };
  initLuck(t, 3);
  assert.equal(t.luckPoints, 3);
  assert.ok(spendLuck(t, "self_adv"));
  assert.equal(t.luckPoints, 2);
});

test("crafter discounts mundane prices", () => {
  assert.equal(crafterPrice(100, ["crafter"], false), 80);
  assert.equal(crafterPrice(100, ["crafter"], true), 100);
});

test("tavern brawler unarmed die", () => {
  assert.equal(unarmedDie(["tavern_brawler"]), "1d4");
  assert.equal(unarmedDie([]), "1");
});

test("fighting style numeric bonuses", () => {
  assert.equal(archeryBonus(["archery"], true), 2);
  assert.equal(duelingBonus(["dueling"], true), 2);
  assert.equal(defenseAcBonus(["defense"], true), 1);
  assert.equal(greatWeaponMasterBonus(["great_weapon_master"], 3, true), 3);
});

test("healer kit heal floors a rolled 1", () => {
  const heal = healerKitHeal(2, 1);
  assert.ok(heal >= 4);
});

test("combat prowess and recovery once each", () => {
  const t = { features: ["boon_of_combat_prowess", "boon_of_recovery"] };
  assert.ok(tryCombatProwess(t, true));
  assert.ok(!tryCombatProwess(t, true));
  assert.equal(tryRecovery(t, 40), 20);
  assert.equal(tryRecovery(t, 40), 0);
});

test("spell recall refunds on d4 of 1", () => {
  assert.ok(spellRecallRefund(["boon_of_spell_recall"], 2, 1));
  assert.ok(!spellRecallRefund(["boon_of_spell_recall"], 2, 3));
  assert.ok(!spellRecallRefund(["boon_of_spell_recall"], 5, 1));
});
