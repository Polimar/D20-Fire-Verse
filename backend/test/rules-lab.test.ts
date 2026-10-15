import assert from "node:assert/strict";
import { before, test } from "node:test";
import { openAuth } from "../src/local/auth.js";
import { ensureForgeContentDefaults } from "../src/local/content-catalog.js";
import { simulateHero } from "../src/local/rules-lab.js";
import { boot } from "./helpers.js";

before(() => {
  boot();
  openAuth();
  ensureForgeContentDefaults();
});

test("rules lab auto-picks a fighter through level 20 without pending choices", () => {
  const sim = simulateHero({
    classId: "fighter",
    speciesId: "human",
    level: 20,
    subclassId: "champion",
  });
  assert.equal(sim.hero.level, 20);
  assert.equal(sim.hero.pending.length, 0);
  assert.equal(sim.cap, 20);
});
