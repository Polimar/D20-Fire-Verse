import assert from "node:assert/strict";
import { before, test } from "node:test";
import { openAuth } from "../src/local/auth.js";
import { ensureForgeContentDefaults, listCatalog, setContentEnabled } from "../src/local/content-catalog.js";
import { builderCatalog as forgeCatalog } from "../src/local/builder-catalog.js";
import { boot } from "./helpers.js";

before(() => {
  boot();
  openAuth();
});

test("ensureForgeContentDefaults enables playable builder catalog on a fresh flag row", () => {
  const beforeClasses = listCatalog().filter((r) => r.kind === "class" && r.inPlay).length;
  ensureForgeContentDefaults();
  const after = forgeCatalog();
  assert.ok(after.classes.length > 0, "expected at least one class in builder catalog");
  assert.ok(after.backgrounds.length > 0, "expected at least one background");
  assert.ok(after.species.length > 0, "expected at least one species");
  if (beforeClasses === 0) {
    assert.ok(after.classes.length >= 4, "fresh DB should enable pack-A classes when valid");
  }
});

test("ensureForgeContentDefaults enables valid reviewed monsters and leaves the rest", () => {
  ensureForgeContentDefaults();
  const monsters = listCatalog().filter((row) => row.kind === "monster");
  const fileClear = (row: { fileReviewStatus: string }) =>
    row.fileReviewStatus === "auto_ok" || row.fileReviewStatus === "resolved" || row.fileReviewStatus === "none";
  const playable = monsters.filter((row) => row.valid && fileClear(row));
  const held = monsters.filter((row) => row.fileReviewStatus === "needs_review" || !row.valid);
  assert.ok(playable.length > 2, `expected the reviewed monster set, got ${playable.length}`);
  assert.ok(playable.every((row) => row.enabled && row.inPlay === !row.missingMechanic));
  assert.ok(held.length > 0, "needs_review monsters should stay out of the seed");
  assert.ok(held.every((row) => !row.enabled));
  setContentEnabled("monster", "goblin_warrior", false);
  ensureForgeContentDefaults();
  assert.equal(listCatalog().find((row) => row.kind === "monster" && row.id === "goblin_warrior")?.enabled, false);
  setContentEnabled("monster", "goblin_warrior", true);
});

test("ensureForgeContentDefaults does not re-enable content an admin turned off", () => {
  ensureForgeContentDefaults();
  const fighter = listCatalog().find((r) => r.kind === "class" && r.id === "fighter");
  assert.ok(fighter, "fighter exists in catalog");
  setContentEnabled("class", "fighter", false);
  assert.equal(listCatalog().find((r) => r.kind === "class" && r.id === "fighter")?.enabled, false);
  ensureForgeContentDefaults();
  assert.equal(listCatalog().find((r) => r.kind === "class" && r.id === "fighter")?.enabled, false);
  setContentEnabled("class", "fighter", true);
});
