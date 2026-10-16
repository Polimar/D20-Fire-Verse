import assert from "node:assert/strict";
import { before, test } from "node:test";
import { listCatalog } from "../src/local/content-catalog.js";
import { getAbility, getPregen } from "../src/local/campaign.js";
import { performPcAction, startCombat } from "../src/local/combat.js";
import { refreshMenus } from "../src/local/srd-sheet.js";
import { boot } from "./helpers.js";

before(boot);

const WAVE3_ITEMS = [
  "animated_shield",
  "cloak_of_invisibility",
  "potion_of_resistance_fire",
  "belt_of_giant_strength_hill",
  "wand_of_magic_missiles",
  "spell_scroll_fireball",
  "spell_scroll_cure_wounds",
] as const;

test("wave 3 items clear missing mechanic queue", () => {
  for (const id of WAVE3_ITEMS) {
    const row = listCatalog().find((r) => r.kind === "item" && r.id === id);
    assert.equal(row?.missingMechanic, false, id);
  }
});

test("magic missile is in the combat rules bundle for wands", () => {
  assert.ok(getAbility("spell_magic_missile"));
});

test("wand spends charge after magic action, not a spell slot", () => {
  const c = startCombat("cellar_rats", [{ playerId: "P1", displayName: "M", characterId: "fv_mira", characterName: "Mira" }]);
  const hero = c.tokens.find((t) => t.playerId === "P1")!;
  hero.sheetDriven = true;
  hero.grantedSpells = ["spell_magic_missile"];
  hero.gearSpells = { spell_magic_missile: "wand_test" };
  hero.gearCharges = { wand_test: 3 };
  hero.hasAction = true;
  hero.slots = { "1": 2 };
  refreshMenus(hero, getPregen("fv_mira"), getAbility);
  assert.throws(() => performPcAction(c, "P1", "spell_magic_missile", "en-1"), /NEED_MAGIC_ACTION/);
  hero.hasAction = true;
  performPcAction(c, "P1", "std_magic");
  performPcAction(c, "P1", "spell_magic_missile", "en-1");
  assert.equal(hero.gearCharges?.wand_test, 2);
  assert.equal(hero.slots?.["1"], 2);
});

test("animated shield adds AC bonus", () => {
  const c = startCombat("cellar_rats", [{ playerId: "P1", displayName: "M", characterId: "fv_mira", characterName: "Mira" }]);
  const hero = c.tokens.find((t) => t.playerId === "P1")!;
  hero.gearCombatAbilities = ["animate_animated_shield"];
  hero.hasBonusAction = true;
  refreshMenus(hero, getPregen("fv_mira"), getAbility);
  performPcAction(c, "P1", "animate_animated_shield");
  assert.equal(hero.animatedShieldBonus, 2);
});

test("fire resistance potion adds timed resistance", () => {
  const c = startCombat("cellar_rats", [{ playerId: "P1", displayName: "M", characterId: "fv_mira", characterName: "Mira" }]);
  const hero = c.tokens.find((t) => t.playerId === "P1")!;
  hero.inventory = ["potion_resistance_fire"];
  hero.hasAction = true;
  refreshMenus(hero, getPregen("fv_mira"), getAbility);
  performPcAction(c, "P1", "use_potion_resistance_fire");
  assert.ok(hero.damageResistances?.includes("fire"));
  assert.equal(hero.inventory.includes("potion_resistance_fire"), false);
});
