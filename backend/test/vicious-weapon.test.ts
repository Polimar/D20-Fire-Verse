import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { before, test } from "node:test";
import { performPcAction, type CombatState, type CombatToken } from "../src/local/combat.js";
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

function arena(width: number, height: number, tokens: CombatToken[]): CombatState {
  const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
  const hz = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
  return {
    encounterId: "test",
    mapId: "test",
    width,
    height,
    walls: grid,
    hazards: hz,
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

function rat(id: string, x: number, y: number, over: Partial<CombatToken> = {}) {
  return token({ id, kind: "enemy", name: "Rat", x, y, ...over });
}

function brennaVicious(x: number, y: number) {
  return token({
    id: "pc-P1",
    kind: "pc",
    name: "Brenna Ironveal",
    x,
    y,
    ac: 16,
    playerId: "P1",
    characterId: "brenna_ironveal",
    actionIds: ["longsword_attack", "std_dodge", "std_dash"],
    bonusActionIds: ["second_wind"],
    weaponGear: {
      longsword_attack: { attack: 0, damage: 0, onHit: [{ damage: "2d6" }] },
    },
  });
}

test("Vicious Weapon rider rolls extra dice using the weapon damage type", () => {
  const c = arena(3, 1, [brennaVicious(0, 0), rat("en-1", 1, 0, { hp: 40, maxHp: 40, ac: 10 })]);
  const restore = scriptDice([[20, 12], [8, 4], [6, 6], [6, 2]]);
  try {
    performPcAction(c, "P1", "longsword_attack", "en-1");
  } finally {
    restore();
  }
  const strike = c.events.at(-1)!;
  assert.ok(strike.kind === "strike");
  const damageRolls = strike.rolls.filter((r) => r.purpose === "damage");
  assert.equal(damageRolls.length, 2);
  assert.equal(damageRolls[0]!.damageType, "slashing");
  assert.equal(damageRolls[1]!.damageType, "slashing");
  assert.deepEqual(damageRolls[1]!.values, [6, 2]);
  assert.equal(strike.hits[0]!.damage, 4 + 3 + 6 + 2);
});

test("Vicious Weapon rider doubles on a critical hit", () => {
  const c = arena(3, 1, [brennaVicious(0, 0), rat("en-1", 1, 0, { hp: 40, maxHp: 40, ac: 10 })]);
  const restore = scriptDice([[20, 20], [8, 3], [8, 5], [6, 6], [6, 6], [6, 1], [6, 5]]);
  try {
    performPcAction(c, "P1", "longsword_attack", "en-1");
  } finally {
    restore();
  }
  const strike = c.events.at(-1)!;
  assert.ok(strike.kind === "strike");
  assert.equal(strike.hits[0]!.outcome, "crit");
  const damageRolls = strike.rolls.filter((r) => r.purpose === "damage");
  assert.equal(damageRolls[0]!.values.length, 2);
  assert.equal(damageRolls[1]!.values.length, 4);
  assert.equal(strike.hits[0]!.damage, damageRolls.reduce((sum, r) => sum + r.total, 0));
});

test("catalog vicious_weapon has on_hit_rider without a fixed damage type", () => {
  const raw = fs.readFileSync(path.join(CONTENT_ROOT, "srd-5.2.1/items/magic.json"), "utf8");
  const pack = JSON.parse(raw) as { entries: Array<{ id: string; effects: unknown[] }> };
  const item = pack.entries.find((i) => i.id === "vicious_weapon");
  assert.ok(item);
  assert.deepEqual(item.effects, [{ kind: "on_hit_rider", damage: "2d6" }]);
});
