import assert from "node:assert/strict";
import { before, test } from "node:test";
import { ACID_ARROW_DELAYED_DICE, ACID_ARROW_SPELL_ID, acidArrowInitialDice } from "../src/local/acid-arrow.js";
import { endTurn, performPcAction, type CombatState, type CombatToken } from "../src/local/combat.js";
import { contentDetail, listCatalog } from "../src/local/content-catalog.js";
import { boot, scriptDice } from "./helpers.js";

before(boot);

function token(over: Partial<CombatToken> & Pick<CombatToken, "id" | "kind" | "x" | "y">): CombatToken {
  return {
    name: over.id,
    hp: 40,
    maxHp: 40,
    ac: 12,
    speedCells: 6,
    movementLeft: 6,
    hasAction: true,
    hasBonusAction: over.kind === "pc",
    initiative: 10,
    actionIds: [],
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
  const grid = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => false));
  return {
    encounterId: "test",
    mapId: "test",
    width: 4,
    height: 4,
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

function caster(over: Partial<CombatToken> = {}): CombatToken {
  return token({
    id: "pc-P1",
    kind: "pc",
    name: "Mage",
    x: 0,
    y: 0,
    playerId: "P1",
    ac: 12,
    hp: 20,
    maxHp: 20,
    actionIds: [ACID_ARROW_SPELL_ID],
    spellAbility: "int",
    ...over,
  });
}

function foe(id: string, x: number, y: number, over: Partial<CombatToken> = {}): CombatToken {
  return token({
    id,
    kind: "enemy",
    name: id,
    x,
    y,
    ac: 10,
    actionIds: [],
    ...over,
  });
}

test("acid arrow catalog entry is wired for combat", () => {
  const row = listCatalog().find((r) => r.kind === "spell" && r.id === "acid_arrow");
  assert.equal(row?.missingMechanic, false);
  const detail = contentDetail("spell", "acid_arrow") as { missingMechanicReasons: string[] };
  assert.equal(detail.missingMechanicReasons.length, 0);
});

test("hit deals initial 4d4 and queues 2d4 for the target's next turn start", () => {
  const hero = caster();
  const target = foe("en-1", 2, 0, { hp: 40, maxHp: 40 });
  const c = arena([hero, target]);
  const restore = scriptDice([
    [20, 18],
    [4, 4],
    [4, 4],
    [4, 4],
    [4, 4],
  ]);
  try {
    performPcAction(c, "P1", ACID_ARROW_SPELL_ID, target.id);
  } finally {
    restore();
  }
  assert.equal(target.hp, 24);
  assert.equal(target.startOfTurnDamage?.length, 1);
  assert.equal(target.startOfTurnDamage?.[0]?.dice, ACID_ARROW_DELAYED_DICE);

  const tick = scriptDice([
    [4, 2],
    [4, 2],
  ]);
  try {
    endTurn(c, "P1");
  } finally {
    tick();
  }
  assert.equal(target.hp, 20);
  assert.equal(target.startOfTurnDamage, undefined);
});

test("miss rolls initial dice, applies half (floor), and does not queue delayed acid", () => {
  const hero = caster();
  const target = foe("en-1", 2, 0, { ac: 18, hp: 40, maxHp: 40 });
  const c = arena([hero, target]);
  const restore = scriptDice([
    [20, 6],
    [4, 4],
    [4, 4],
    [4, 4],
    [4, 4],
  ]);
  try {
    performPcAction(c, "P1", ACID_ARROW_SPELL_ID, target.id);
  } finally {
    restore();
  }
  assert.equal(target.hp, 32);
  assert.equal(target.startOfTurnDamage, undefined);
});

test("upcast slot 3 uses 5d4 initial and still queues 2d4 delayed", () => {
  assert.equal(acidArrowInitialDice(3), "5d4");
  const hero = caster({ sheetDriven: true, slots: { "2": 0, "3": 1 } });
  const target = foe("en-1", 2, 0, { hp: 40, maxHp: 40 });
  const c = arena([hero, target]);
  const restore = scriptDice([
    [20, 18],
    [4, 1],
    [4, 1],
    [4, 1],
    [4, 1],
    [4, 1],
  ]);
  try {
    performPcAction(c, "P1", ACID_ARROW_SPELL_ID, target.id);
  } finally {
    restore();
  }
  assert.equal(hero.slots?.["3"], 0);
  assert.equal(target.hp, 35);
  assert.equal(target.startOfTurnDamage?.[0]?.dice, "2d4");
});

test("crit doubles only the initial pool", () => {
  const hero = caster();
  const target = foe("en-1", 2, 0, { hp: 40, maxHp: 40 });
  const c = arena([hero, target]);
  const restore = scriptDice([
    [20, 20],
    [4, 1],
    [4, 1],
    [4, 1],
    [4, 1],
    [4, 1],
    [4, 1],
    [4, 1],
    [4, 1],
  ]);
  try {
    performPcAction(c, "P1", ACID_ARROW_SPELL_ID, target.id);
  } finally {
    restore();
  }
  assert.equal(target.hp, 32);
  assert.equal(target.startOfTurnDamage?.[0]?.dice, "2d4");
});

test("delayed acid waits while the target is dead and fires after a revive turn start", () => {
  const hero = caster();
  const target = foe("en-1", 2, 0, { hp: 40, maxHp: 40 });
  const dummy = foe("en-2", 3, 0, { hp: 20, maxHp: 20 });
  const c = arena([hero, target, dummy]);
  const restore = scriptDice([
    [20, 18],
    [4, 4],
    [4, 4],
    [4, 4],
    [4, 4],
  ]);
  try {
    performPcAction(c, "P1", ACID_ARROW_SPELL_ID, target.id);
  } finally {
    restore();
  }
  assert.ok(target.startOfTurnDamage?.length);
  target.dead = true;
  target.hp = 0;
  endTurn(c, "P1");
  assert.equal(target.startOfTurnDamage?.length, 1);
  assert.equal(target.hp, 0);

  target.dead = false;
  target.hp = 10;
  hero.hasAction = true;
  c.turnIndex = c.turnOrder.indexOf(hero.id);
  const tick = scriptDice([
    [4, 3],
    [4, 3],
  ]);
  try {
    endTurn(c, "P1");
  } finally {
    tick();
  }
  assert.equal(target.hp, 4);
  assert.equal(target.startOfTurnDamage, undefined);
});
