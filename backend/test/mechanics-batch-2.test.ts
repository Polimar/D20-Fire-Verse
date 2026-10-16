import assert from "node:assert/strict";
import { before, test } from "node:test";
import { listCatalog } from "../src/local/content-catalog.js";
import { getAbility, getPregen } from "../src/local/campaign.js";
import { performPcAction, startCombat } from "../src/local/combat.js";
import { refreshMenus } from "../src/local/srd-sheet.js";
import { boot } from "./helpers.js";

before(boot);

const WAVE2_SPELLS = [
  "silence",
  "darkness",
  "spirit_guardians",
  "magic_weapon",
  "charm_person",
  "charm_monster",
  "hold_monster",
  "banishment",
  "dimension_door",
] as const;

test("wave 2 spells clear missing mechanic queue", () => {
  for (const id of WAVE2_SPELLS) {
    const row = listCatalog().find((r) => r.kind === "spell" && r.id === id);
    assert.equal(row?.missingMechanic, false, id);
  }
});

test("silence and darkness use concentration_aura in combat rules", () => {
  assert.equal(getAbility("spell_silence")?.effects[0]?.type, "concentration_aura");
  assert.equal(getAbility("spell_darkness")?.effects[0]?.type, "concentration_aura");
});

test("magic weapon applies attack bonus to ally", () => {
  const c = startCombat("cellar_rats", [{ playerId: "P1", displayName: "M", characterId: "fv_mira", characterName: "Mira" }]);
  const hero = c.tokens.find((t) => t.playerId === "P1")!;
  hero.hasAction = true;
  hero.hasBonusAction = true;
  hero.spells = ["spell_magic_weapon"];
  hero.slots = { "2": 1 };
  hero.sheetDriven = true;
  refreshMenus(hero, getPregen("fv_mira"), getAbility);
  performPcAction(c, "P1", "spell_magic_weapon", hero.id);
  assert.equal(hero.magicWeaponBonus, 1);
});
