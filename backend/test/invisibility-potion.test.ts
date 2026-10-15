import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { before, test } from "node:test";
import {
  INVISIBILITY_POTION,
  INVISIBILITY_POTION_DURATION_PC_TURNS,
  INVISIBILITY_POTION_EFFECT_ID,
} from "../src/local/invisibility-potion.js";
import { endTurn, performPcAction, type CombatState, type CombatToken } from "../src/local/combat.js";
import { boot, scriptDice } from "./helpers.js";
import { CONTENT_ROOT } from "../src/local/paths.js";

before(boot);

function token(over: Partial<CombatToken> & Pick<CombatToken, "id" | "kind" | "x" | "y">): CombatToken {
  return {
    name: over.id,
    hp: 20,
    maxHp: 20,
    ac: 12,
    speedCells: 6,
    movementLeft: 6,
    hasAction: true,
    hasBonusAction: over.kind === "pc",
    initiative: 10,
    actionIds: ["std_dash", "use_potion_invisibility", "longsword_attack"],
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
  const grid = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => false));
  return {
    encounterId: "test",
    mapId: "test",
    width: 3,
    height: 3,
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

test("magic catalog defines invisibility_drink for 60 PC turns", () => {
  const raw = fs.readFileSync(path.join(CONTENT_ROOT, "srd-5.2.1/items/magic.json"), "utf8");
  const pack = JSON.parse(raw) as { entries: Array<{ id: string; effects: unknown[] }> };
  const item = pack.entries.find((e) => e.id === INVISIBILITY_POTION.itemId);
  assert.ok(item);
  assert.deepEqual(item.effects, [{ kind: "invisibility_drink", durationPcTurns: INVISIBILITY_POTION_DURATION_PC_TURNS }]);
});

test("drinking invisibility potion sets invisible and timed effect", () => {
  const hero = token({
    id: "pc-P1",
    kind: "pc",
    name: "Scout",
    x: 1,
    y: 1,
    playerId: "P1",
    inventory: ["potion_invisibility"],
  });
  const foe = token({ id: "en-1", kind: "enemy", name: "Rat", x: 2, y: 1, actionIds: [], bonusActionIds: [] });
  const c = arena([hero, foe]);
  performPcAction(c, "P1", "use_potion_invisibility");
  assert.equal(hero.invisible, true);
  assert.ok(!hero.inventory.includes("potion_invisibility"));
  assert.equal(hero.hasAction, false);
  const row = hero.timedEffects?.find((r) => r.spellId === INVISIBILITY_POTION_EFFECT_ID);
  assert.ok(row);
  assert.equal(row?.pcTurnsLeft, INVISIBILITY_POTION_DURATION_PC_TURNS);
});

test("dash does not end potion invisibility", () => {
  const hero = token({
    id: "pc-P1",
    kind: "pc",
    name: "Scout",
    x: 1,
    y: 1,
    playerId: "P1",
    invisible: true,
    timedEffects: [{ label: "Potion", pcTurnsLeft: 50, spellId: INVISIBILITY_POTION_EFFECT_ID }],
    hasAction: true,
  });
  const c = arena([hero]);
  performPcAction(c, "P1", "std_dash");
  assert.equal(hero.invisible, true);
  assert.ok(hero.timedEffects?.some((r) => r.spellId === INVISIBILITY_POTION_EFFECT_ID));
});

test("attack roll ends potion invisibility", () => {
  const hero = token({
    id: "pc-P1",
    kind: "pc",
    name: "Scout",
    x: 0,
    y: 1,
    playerId: "P1",
    invisible: true,
    timedEffects: [{ label: "Potion", pcTurnsLeft: 50, spellId: INVISIBILITY_POTION_EFFECT_ID }],
    hasAction: true,
  });
  const foe = token({
    id: "en-1",
    kind: "enemy",
    name: "Rat",
    x: 1,
    y: 1,
    hp: 30,
    maxHp: 30,
    ac: 10,
    actionIds: [],
    bonusActionIds: [],
  });
  const c = arena([hero, foe]);
  const restore = scriptDice([[20, 15]]);
  try {
    performPcAction(c, "P1", "longsword_attack", foe.id);
  } finally {
    restore();
  }
  assert.equal(hero.invisible, false);
  assert.ok(!hero.timedEffects?.some((r) => r.spellId === INVISIBILITY_POTION_EFFECT_ID));
});

test("timed effect expiry clears invisibility", () => {
  const hero = token({
    id: "pc-P1",
    kind: "pc",
    name: "Scout",
    x: 1,
    y: 1,
    playerId: "P1",
    invisible: true,
    timedEffects: [{ label: "Potion", pcTurnsLeft: 1, spellId: INVISIBILITY_POTION_EFFECT_ID }],
  });
  const c = arena([hero]);
  endTurn(c, "P1");
  assert.equal(hero.invisible, false);
  assert.equal(hero.timedEffects, undefined);
});
