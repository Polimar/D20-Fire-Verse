import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { before, test } from "node:test";
import { performPcAction, type CombatState, type CombatToken } from "../src/local/combat.js";
import { HEALING_POTIONS } from "../src/local/healing-potions.js";
import { boot, scriptDice } from "./helpers.js";
import { CONTENT_ROOT } from "../src/local/paths.js";

before(boot);

function token(over: Partial<CombatToken> & Pick<CombatToken, "id" | "kind" | "x" | "y">): CombatToken {
  return {
    name: over.id,
    hp: 10,
    maxHp: 40,
    ac: 12,
    speedCells: 6,
    movementLeft: 6,
    hasAction: true,
    hasBonusAction: over.kind === "pc",
    initiative: 10,
    actionIds: ["std_utilize", "use_potion_healing_greater"],
    bonusActionIds: [],
    inventory: [],
    dead: false,
    dodging: false,
    disengaging: false,
    hidden: false,
    secondWindUsed: false,
    ...over,
  };
}

function arena(tokens: CombatToken[]): CombatState {
  const grid = Array.from({ length: 1 }, () => Array.from({ length: 3 }, () => false));
  return {
    encounterId: "test",
    mapId: "test",
    width: 3,
    height: 1,
    walls: grid,
    hazards: grid,
    tokens,
    turnOrder: tokens.map((t) => t.id),
    turnIndex: 0,
    round: 1,
    log: [],
    reachable: [],
    status: "active",
    events: [],
    seq: 0,
  };
}

test("magic catalog defines four heal_drink potions with distinct dice", () => {
  const raw = fs.readFileSync(path.join(CONTENT_ROOT, "srd-5.2.1/items/magic.json"), "utf8");
  const pack = JSON.parse(raw) as { entries: Array<{ id: string; effects: unknown[] }> };
  for (const def of HEALING_POTIONS) {
    const item = pack.entries.find((e) => e.id === def.itemId);
    assert.ok(item, def.itemId);
    assert.deepEqual(item.effects, [{ kind: "heal_drink", dice: def.dice }]);
  }
  assert.ok(!pack.entries.some((e) => e.id === "potions_of_healing"));
});

test("greater healing potion action rolls 4d4+4 and consumes one", () => {
  const hero = token({
    id: "pc-P1",
    kind: "pc",
    name: "Hero",
    x: 0,
    y: 0,
    playerId: "P1",
    inventory: ["potion_healing_greater"],
  });
  const c = arena([hero]);
  const restore = scriptDice([[4, 3], [4, 2], [4, 4], [4, 1]]);
  try {
    performPcAction(c, "P1", "use_potion_healing_greater");
  } finally {
    restore();
  }
  assert.equal(hero.hp, 10 + 3 + 2 + 4 + 1 + 4);
  assert.ok(!hero.inventory.includes("potion_healing_greater"));
  assert.equal(hero.hasAction, false);
});

test("Utilize does not drink a healing potion", () => {
  const hero = token({
    id: "pc-P1",
    kind: "pc",
    name: "Hero",
    x: 0,
    y: 0,
    playerId: "P1",
    inventory: ["potion_healing"],
  });
  const beforeHp = hero.hp;
  const c = arena([hero]);
  performPcAction(c, "P1", "std_utilize");
  assert.equal(hero.hp, beforeHp);
  assert.ok(hero.inventory.includes("potion_healing"));
});
