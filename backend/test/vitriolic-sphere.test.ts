import assert from "node:assert/strict";
import { before, test } from "node:test";
import { endTurn, performPcAction, type CombatState, type CombatToken } from "../src/local/combat.js";
import { contentDetail, listCatalog } from "../src/local/content-catalog.js";
import { boot, scriptDice } from "./helpers.js";

const SPELL_ID = "spell_vitriolic_sphere";

before(boot);

function token(over: Partial<CombatToken> & Pick<CombatToken, "id" | "kind" | "x" | "y">): CombatToken {
  return {
    name: over.id,
    hp: 80,
    maxHp: 80,
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
  const grid = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => false));
  return {
    encounterId: "test",
    mapId: "test",
    width: 6,
    height: 6,
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
    name: "Wizard",
    x: 0,
    y: 0,
    playerId: "P1",
    actionIds: [SPELL_ID],
    spellAbility: "int",
    sheetDriven: true,
    slots: { "4": 2, "5": 1 },
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
    saves: { dex: -5 },
    ...over,
  });
}

test("vitriolic sphere clears mechanic gap when wired", () => {
  const row = listCatalog().find((r) => r.kind === "spell" && r.id === "vitriolic_sphere");
  assert.equal(row?.missingMechanic, false);
  const detail = contentDetail("spell", "vitriolic_sphere") as { missingMechanicReasons: string[] };
  assert.equal(detail.missingMechanicReasons.length, 0);
});

test("failed save deals 10d4 and queues 5d4 at next turn start", () => {
  const hero = caster();
  const target = foe("en-1", 2, 0);
  const c = arena([hero, target]);
  const restore = scriptDice([
    ...Array.from({ length: 10 }, () => [4, 2]),
    ...Array.from({ length: 5 }, () => [4, 1]),
  ]);
  try {
    performPcAction(c, "P1", SPELL_ID, target.id);
  } finally {
    restore();
  }
  assert.equal(target.hp, 80 - 20);
  assert.equal(target.startOfTurnDamage?.[0]?.dice, "5d4");

  const tick = scriptDice([[4, 3], [4, 3], [4, 3], [4, 3], [4, 3]]);
  try {
    endTurn(c, "P1");
  } finally {
    tick();
  }
  assert.equal(target.hp, 80 - 20 - 15);
});

test("successful save takes half initial only and no delayed acid", () => {
  const hero = caster();
  const target = foe("en-1", 2, 0, { saves: { dex: 10 } });
  const c = arena([hero, target]);
  const restore = scriptDice([
    [20, 20],
    ...Array.from({ length: 10 }, () => [4, 4]),
  ]);
  try {
    performPcAction(c, "P1", SPELL_ID, target.id);
  } finally {
    restore();
  }
  assert.equal(target.hp, 80 - 20);
  assert.equal(target.startOfTurnDamage, undefined);
});

test("slot 5 upcast scales initial 10d4 to 12d4 only", () => {
  const hero = caster({ slots: { "4": 0, "5": 1 } });
  const target = foe("en-1", 2, 0);
  const c = arena([hero, target]);
  const restore = scriptDice([
    ...Array.from({ length: 12 }, () => [4, 1]),
    ...Array.from({ length: 5 }, () => [4, 1]),
  ]);
  try {
    performPcAction(c, "P1", SPELL_ID, target.id);
  } finally {
    restore();
  }
  assert.equal(hero.slots?.["5"], 0);
  assert.equal(target.hp, 80 - 12);
  assert.equal(target.startOfTurnDamage?.[0]?.dice, "5d4");
});

test("fireball at slot 4 rolls 9d6", () => {
  const hero = caster({
    actionIds: ["spell_fireball"],
    slots: { "3": 0, "4": 1 },
  });
  const target = foe("en-1", 2, 0, { saves: { dex: -5 } });
  const c = arena([hero, target]);
  const restore = scriptDice([...Array.from({ length: 9 }, () => [6, 1]), [20, 1]]);
  try {
    performPcAction(c, "P1", "spell_fireball", target.id);
  } finally {
    restore();
  }
  assert.equal(target.hp, 80 - 9);
});

test("wall of fire leaves the mechanic gap once the zone is wired", () => {
  const row = listCatalog().find((r) => r.kind === "spell" && r.id === "wall_of_fire");
  assert.equal(row?.missingMechanic, false);
});
