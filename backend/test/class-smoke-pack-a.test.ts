import assert from "node:assert/strict";
import { test } from "node:test";
import { buildKit } from "../src/local/class-kit.js";
import { classLevelCap, PACK_A_CLASS_IDS } from "../src/local/coverage.js";

for (const classId of PACK_A_CLASS_IDS) {
  test(`${classId} kit builds at every level 1–20 without throwing`, () => {
    for (let level = 1; level <= 20; level += 1) {
      const kit = buildKit([{ id: classId, level }]);
      assert.ok(kit.flags.length >= 1, `L${level} should expose class flags`);
      if (classId === "rogue") assert.equal(kit.sneakDice, Math.min(10, 1 + Math.floor((level - 1) / 2)));
      if (classId === "fighter" && level >= 5) assert.ok(kit.extraAttacks >= 1);
    }
    assert.equal(classLevelCap(classId), 20);
  });
}
