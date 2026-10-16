import assert from "node:assert/strict";
import { before, test } from "node:test";
import { performPcAction, startCombat } from "../src/local/combat.js";
import { contentDetail, listCatalog } from "../src/local/content-catalog.js";
import { getAbility, getPregen } from "../src/local/campaign.js";
import { refreshMenus } from "../src/local/srd-sheet.js";
import { boot } from "./helpers.js";

before(boot);

test("hex and hunters_mark clear missing mechanic after brand rider fix", () => {
  for (const id of ["hex", "hunters_mark"]) {
    const row = listCatalog().find((r) => r.kind === "spell" && r.id === id);
    assert.equal(row?.missingMechanic, false, id);
  }
});

test("bane spell is wired without mechanic gap", () => {
  const row = listCatalog().find((r) => r.kind === "spell" && r.id === "bane");
  assert.equal(row?.missingMechanic, false);
  assert.ok(getAbility("spell_bane")?.effects[0]?.type === "bane");
});

test("potion of speed and slaying ammo clear missing mechanic", () => {
  for (const id of ["potion_of_speed", "ammunition_of_slaying", "staff_of_striking"]) {
    const row = listCatalog().find((r) => r.kind === "item" && r.id === id);
    assert.equal(row?.missingMechanic, false, id);
  }
});

test("haste drink applies speed without consuming slot", () => {
  const c = startCombat("cellar_rats", [{ playerId: "P1", displayName: "M", characterId: "fv_mira", characterName: "Mira" }]);
  const hero = c.tokens.find((t) => t.playerId === "P1")!;
  hero.inventory = ["potion_speed"];
  hero.hasAction = true;
  refreshMenus(hero, getPregen("fv_mira"), getAbility);
  assert.ok(hero.actionIds.includes("use_potion_speed"));
  const base = hero.speedCells;
  performPcAction(c, "P1", "use_potion_speed");
  assert.equal(hero.hasted, true);
  assert.equal(hero.speedCells, base * 2);
});

test("brand deals typed necrotic from hex", () => {
  const detail = contentDetail("spell", "hex") as { missingMechanicReasons: string[] };
  assert.equal(detail.missingMechanicReasons.length, 0);
});
