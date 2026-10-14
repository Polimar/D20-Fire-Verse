import assert from "node:assert/strict";
import { test } from "node:test";
import { buildKit } from "../src/local/class-kit.js";
import { classLevelCap, coverageSummary } from "../src/local/coverage.js";

test("barbarian 10 / berserker kit reads the class table", () => {
  const kit = buildKit([{ id: "barbarian", level: 10, subclass: "path_of_the_berserker" }]);
  assert.equal(kit.rages, 4);
  assert.equal(kit.rageDamage, 3);
  assert.equal(kit.extraAttacks, 1);
  assert.equal(kit.fastMovementFt, 10);
  assert.equal(kit.saves.join(","), "str,con");
  assert.ok(kit.flags.includes("rage"));
  assert.ok(kit.flags.includes("reckless_attack"));
  assert.ok(kit.flags.includes("brutal_strike"));
  assert.ok(kit.flags.includes("frenzy"));
  assert.ok(kit.flags.includes("mindless_rage"));
  assert.ok(kit.flags.includes("retaliation"));
  assert.ok(kit.flags.includes("instinctive_pounce"));
});

test("fighter 10 / champion kit reads Extra Attack, Second Wind, and Improved Critical", () => {
  const kit = buildKit([{ id: "fighter", level: 10, subclass: "champion" }]);
  assert.equal(kit.extraAttacks, 1);
  assert.equal(kit.secondWind, 4);
  assert.equal(kit.actionSurge, 1);
  assert.equal(kit.indomitable, 1);
  assert.equal(kit.critMin, 19);
  assert.ok(kit.flags.includes("tactical_shift"));
  assert.ok(kit.flags.includes("tactical_master"));
  assert.ok(kit.flags.includes("heroic_warrior"));
  assert.ok(kit.flags.includes("remarkable_athlete"));
});

test("rogue sneak dice scale from the table", () => {
  assert.equal(buildKit([{ id: "rogue", level: 1 }]).sneakDice, 1);
  assert.equal(buildKit([{ id: "rogue", level: 10 }]).sneakDice, 5);
});

test("playable cap is 10 for barbarian and fighter, and every runs row has a kit flag or a known engine hook", () => {
  assert.equal(classLevelCap("barbarian"), 10);
  assert.equal(classLevelCap("fighter"), 10);
  const summary = coverageSummary();
  assert.ok(summary.find((row) => row.classId === "barbarian")!.blocked === 0);
  const barb = buildKit([{ id: "barbarian", level: 10, subclass: "path_of_the_berserker" }]);
  for (const flag of ["rage", "unarmored_defense", "weapon_mastery", "danger_sense", "reckless_attack", "extra_attack", "fast_movement", "feral_instinct", "instinctive_pounce", "brutal_strike", "frenzy", "mindless_rage", "retaliation"]) {
    assert.ok(barb.flags.includes(flag), flag);
  }
});
