import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, test } from "node:test";
import { getAbility } from "../src/local/campaign.js";
import { listCatalog } from "../src/local/content-catalog.js";
import { boot } from "./helpers.js";

before(boot);

test("every SRD spell has a combat ability", () => {
  const spells = JSON.parse(readFileSync(new URL("../../content/srd-5.2.1/spells.json", import.meta.url), "utf8")).entries as Array<{ id: string }>;
  const missing = spells.filter((spell) => !getAbility(`spell_${spell.id}`) && !getAbility(spell.id));
  assert.deepEqual(missing.map((spell) => spell.id), []);
});

test("a spell with a mechanic gap is not in play", () => {
  const row = listCatalog().find((entry) => entry.kind === "spell" && entry.id === "detect_magic");
  assert.equal(row?.missingMechanic, true);
  assert.equal(row?.inPlay, false);
});

test("fireball stays in the catalog without a mechanic gap", () => {
  const row = listCatalog().find((entry) => entry.kind === "spell" && entry.id === "fireball");
  assert.equal(row?.missingMechanic, false);
});
