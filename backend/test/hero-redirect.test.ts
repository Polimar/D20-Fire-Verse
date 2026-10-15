import assert from "node:assert/strict";
import { before, test } from "node:test";
import { openAuth } from "../src/local/auth.js";
import { listHeroRedirects, recordHeroRedirect, resolveHeroId } from "../src/local/hero-redirect.js";
import { boot } from "./helpers.js";

before(() => {
  boot();
  openAuth();
});

test("custom hero ids redirect to regenerated hero_* rows", () => {
  recordHeroRedirect("custom_demo", "hero_demo", "user-1", "test");
  assert.equal(resolveHeroId("custom_demo"), "hero_demo");
  assert.equal(resolveHeroId("hero_other"), "hero_other");
  const rows = listHeroRedirects();
  assert.ok(rows.some((row) => row.oldId === "custom_demo" && row.newId === "hero_demo"));
});
