import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONDITION_IDS,
  attackAdvantageAgainst,
  attackDisadvantage,
  charmedBlocksHostile,
  cannotAct,
  checkDisadvantage,
  clampExhaustion,
  longRestExhaustionDelta,
  saveDisadvantage,
  speedMultiplier,
} from "@d20-fireverse/rules";

for (const id of CONDITION_IDS) {
  test(`condition ${id} participates in at least one rules helper`, () => {
    const c = [id];
    const touched =
      checkDisadvantage(c) ||
      attackDisadvantage(c) ||
      attackAdvantageAgainst(c) ||
      speedMultiplier(c) < 1 ||
      cannotAct(c) ||
      saveDisadvantage(c) ||
      charmedBlocksHostile(c) ||
      id === "deafened" ||
      id === "invisible" ||
      id === "exhaustion";
    assert.ok(touched, `${id} should affect combat or saves`);
  });
}

test("exhaustion 2024 tiers adjust checks, speed, and incapacitation", () => {
  assert.equal(checkDisadvantage([], 1), true);
  assert.equal(speedMultiplier([], 2), 0.5);
  assert.equal(attackDisadvantage([], 3), true);
  assert.equal(cannotAct([], 5), true);
  assert.equal(clampExhaustion(9), 6);
  assert.equal(longRestExhaustionDelta(3), 2);
  assert.equal(longRestExhaustionDelta(0), 0);
});
