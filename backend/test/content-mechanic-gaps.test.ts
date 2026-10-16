import assert from "node:assert/strict";
import { before, test } from "node:test";
import type { ItemDef } from "@d20-fireverse/content-schema";
import { itemMechanicGap } from "../src/local/content-mechanic-gaps.js";
import { contentDetail } from "../src/local/content-catalog.js";
import { listCatalog } from "../src/local/content-catalog.js";
import { boot } from "./helpers.js";

before(boot);

test("potion of speed is clear after haste drink is implemented", () => {
  const row = listCatalog().find((r) => r.kind === "item" && r.id === "potion_of_speed");
  assert.ok(row);
  assert.equal(row.missingMechanic, false);
  assert.equal(row.reviewStatus, "auto_ok");
});

test("potion of invisibility is clear after combat drink is implemented", () => {
  const row = listCatalog().find((r) => r.kind === "item" && r.id === "potion_of_invisibility");
  assert.ok(row);
  assert.equal(row.missingMechanic, false);
  assert.equal(row.reviewStatus, "auto_ok");
});

test("sheet and combat spells clear missing mechanic; items may still gap", () => {
  const detectMagic = listCatalog().find((r) => r.kind === "spell" && r.id === "detect_magic");
  const fireball = listCatalog().find((r) => r.kind === "spell" && r.id === "fireball");
  const healingWord = listCatalog().find((r) => r.kind === "spell" && r.id === "healing_word");
  const acidArrow = listCatalog().find((r) => r.kind === "spell" && r.id === "acid_arrow");
  const itemGap = listCatalog().find((r) => r.kind === "item" && r.missingMechanic);
  assert.equal(detectMagic?.missingMechanic, false);
  assert.equal(fireball?.missingMechanic, false);
  assert.equal(healingWord?.missingMechanic, false);
  assert.equal(acidArrow?.missingMechanic, false);
  assert.ok(itemGap, "item queue should still have Missing mechanic rows");
});

test("every catalog row with a combat mechanic gap is needs_review (including former resolved)", () => {
  const gaps = listCatalog().filter((r) => r.missingMechanic);
  assert.ok(gaps.length >= 150);
  const byKind = new Map<string, number>();
  for (const row of gaps) {
    assert.equal(row.reviewStatus, "needs_review", `${row.kind}/${row.id}`);
    assert.equal(row.inPlay, false, `${row.kind}/${row.id}`);
    byKind.set(row.kind, (byKind.get(row.kind) ?? 0) + 1);
  }
  assert.equal(byKind.get("spell") ?? 0, 0, "spell Missing queue should be cleared after mega-4–8");
  assert.ok((byKind.get("item") ?? 0) >= 150, "items should dominate missing mechanic queue");
});

test("sheet-only spell detail has no battlefield gap reasons", () => {
  const detail = contentDetail("spell", "detect_magic") as { missingMechanicReasons: string[]; missingMechanic: boolean };
  assert.equal(detail.missingMechanic, false);
  assert.equal(detail.missingMechanicReasons.length, 0);
});

test("ammunition +1 +2 +3 are valid: the rarity sentence is the +N bonus already on the item", () => {
  for (const id of ["ammunition_plus_1", "ammunition_plus_2", "ammunition_plus_3"]) {
    const detail = contentDetail("item", id) as { missingMechanicReasons: string[]; missingMechanic: boolean };
    assert.equal(detail.missingMechanic, false, id);
    assert.equal(detail.missingMechanicReasons.length, 0, id);
  }
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
