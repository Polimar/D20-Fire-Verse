import assert from "node:assert/strict";
import { before, test } from "node:test";
import type { ItemDef } from "@d20-fireverse/content-schema";
import { itemMechanicGap } from "../src/local/content-mechanic-gaps.js";
import { listCatalog } from "../src/local/content-catalog.js";
import { boot } from "./helpers.js";

before(boot);

test("potion of speed is needs review with missing mechanic flag", () => {
  const row = listCatalog().find((r) => r.kind === "item" && r.id === "potion_of_speed");
  assert.ok(row);
  assert.equal(row.reviewStatus, "needs_review");
  assert.equal(row.missingMechanic, true);
});

test("potion of invisibility is clear after combat drink is implemented", () => {
  const row = listCatalog().find((r) => r.kind === "item" && r.id === "potion_of_invisibility");
  assert.ok(row);
  assert.equal(row.missingMechanic, false);
  assert.equal(row.reviewStatus, "auto_ok");
});

test("drink consumable with empty effects and SRD drink text is a mechanic gap", () => {
  const game: ItemDef = {
    id: "test_drink",
    name: "Test Drink",
    rarity: "common",
    slot: "consumable",
    effects: [],
  };
  assert.equal(
    itemMechanicGap(game, {
      srd: { text: "When you drink this potion, you gain a Fly Speed equal to your Speed for 1 hour." },
    }),
    true,
  );
});
