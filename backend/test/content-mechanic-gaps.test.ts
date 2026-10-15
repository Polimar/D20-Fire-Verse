import assert from "node:assert/strict";
import { before, test } from "node:test";
import type { ItemDef } from "@d20-fireverse/content-schema";
import { itemMechanicGap, itemMechanicGapReasons } from "../src/local/content-mechanic-gaps.js";
import { contentDetail } from "../src/local/content-catalog.js";
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

test("wired vs unwired spells differ in missing mechanic flag", () => {
  const fireball = listCatalog().find((r) => r.kind === "spell" && r.id === "fireball");
  const healingWord = listCatalog().find((r) => r.kind === "spell" && r.id === "healing_word");
  assert.ok(fireball?.missingMechanic);
  assert.equal(healingWord?.missingMechanic, false);
  assert.equal(fireball?.reviewStatus, "needs_review");
});

test("every catalog row with a combat mechanic gap is needs_review (including former resolved)", () => {
  const gaps = listCatalog().filter((r) => r.missingMechanic);
  assert.ok(gaps.length > 200);
  const byKind = new Map<string, number>();
  for (const row of gaps) {
    assert.equal(row.reviewStatus, "needs_review", `${row.kind}/${row.id}`);
    assert.equal(row.inPlay, false, `${row.kind}/${row.id}`);
    byKind.set(row.kind, (byKind.get(row.kind) ?? 0) + 1);
  }
  assert.ok((byKind.get("spell") ?? 0) > 100, "spells should dominate missing mechanic queue");
});

test("spell detail lists no combat ability reason", () => {
  const detail = contentDetail("spell", "fireball") as { missingMechanicReasons: string[] };
  assert.ok(detail.missingMechanicReasons.some((r) => /No combat ability wired/i.test(r)));
});

test("ammunition +1 explains missing mechanic via notModeled review lines", () => {
  const detail = contentDetail("item", "ammunition_plus_1") as { missingMechanicReasons: string[]; missingMechanic: boolean };
  assert.equal(detail.missingMechanic, true);
  assert.ok(detail.missingMechanicReasons.some((r) => /SRD rule not applied/i.test(r) && /rarity/i.test(r)));
  const reasons = itemMechanicGapReasons(
    { id: "ammunition_plus_1", name: "Ammunition +1", rarity: "uncommon", slot: "consumable", effects: [{ kind: "attack_bonus", amount: 1 }] },
    { notModeled: ["The bonus is determined by the rarity of the ammunition."] },
  );
  assert.equal(reasons.length, 1);
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
