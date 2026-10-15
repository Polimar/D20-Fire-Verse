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
