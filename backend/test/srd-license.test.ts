import assert from "node:assert/strict";
import { before, test } from "node:test";
import { openAuth } from "../src/local/auth.js";
import { applySrdOnlyPolicy, isCcBySrd, listCatalog, reloadCatalog } from "../src/local/content-catalog.js";
import { boot } from "./helpers.js";

before(() => {
  boot();
  openAuth();
  reloadCatalog();
});

test("CC-BY allowlist keeps SRD subclasses and rejects PHB extras", () => {
  assert.equal(isCcBySrd("subclass", "champion"), true);
  assert.equal(isCcBySrd("subclass", "battle_master"), false);
  assert.equal(isCcBySrd("background", "acolyte"), true);
  assert.equal(isCcBySrd("background", "noble"), false);
  assert.equal(isCcBySrd("feat", "grappler"), true);
  assert.equal(isCcBySrd("feat", "sharpshooter"), false);
});

test("catalog rows expose license and SRD-only policy disables restricted", () => {
  const before = listCatalog();
  const restrictedOn = before.filter((r) => r.license === "restricted" && r.enabled);
  assert.ok(
    before.some((r) => r.kind === "subclass" && r.id === "battle_master" && r.license === "restricted"),
    "battle_master must be marked restricted",
  );
  assert.ok(
    before.some((r) => r.kind === "subclass" && r.id === "champion" && r.license === "srd"),
    "champion must stay CC-BY SRD",
  );

  const result = applySrdOnlyPolicy();
  const after = listCatalog();
  assert.ok(result.disabledRestricted >= restrictedOn.length || after.every((r) => r.license !== "restricted" || !r.enabled));
  assert.ok(after.filter((r) => r.license === "restricted" && r.enabled).length === 0);
  assert.ok(after.some((r) => r.license === "srd" && r.valid && r.enabled));
});
