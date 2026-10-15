import assert from "node:assert/strict";
import { before, test } from "node:test";
import type { CombatToken } from "../src/local/combat.js";
import { longRestResources, shortRestResources } from "../src/local/srd-sheet.js";
import { boot } from "./helpers.js";

before(boot);

test("short rest spends a hit die and refreshes second wind when below max", () => {
  const token: CombatToken = {
    id: "pc",
    kind: "pc",
    name: "F",
    x: 0,
    y: 0,
    hp: 5,
    maxHp: 20,
    ac: 16,
    speedCells: 6,
    movementLeft: 6,
    hasAction: true,
    hasBonusAction: true,
    initiative: 10,
    actionIds: [],
    bonusActionIds: [],
    inventory: [],
    dead: false,
    dodging: false,
    disengaging: false,
    hidden: false,
    secondWindUsed: false,
    hitDice: 2,
    hitDie: 10,
    secondWindLeft: 0,
    features: ["second_wind"],
    kit: {
      flags: ["second_wind"],
      saves: [],
      rages: 0,
      rageDamage: 0,
      extraAttacks: 0,
      secondWind: 1,
      actionSurge: 0,
      indomitable: 0,
      fighterLevel: 1,
      sneakDice: 0,
      martialDie: "",
      focus: 0,
      channelDivinity: 0,
      bardicDie: "",
      sorceryPoints: 0,
      critMin: 20,
      fastMovementFt: 0,
      unarmoredMovementFt: 0,
    },
  };
  shortRestResources(token, {
    id: "f",
    name: "F",
    class: "fighter",
    level: 1,
    hp: 20,
    ac: 16,
    abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 8 },
    speedCells: 6,
  });
  assert.equal(token.hitDice, 1);
  assert.equal(token.secondWindLeft, 1);
});

test("long rest reduces exhaustion by one tier", () => {
  const token: CombatToken = {
    id: "pc",
    kind: "pc",
    name: "T",
    x: 0,
    y: 0,
    hp: 1,
    maxHp: 20,
    ac: 12,
    speedCells: 6,
    movementLeft: 6,
    hasAction: true,
    hasBonusAction: true,
    initiative: 10,
    actionIds: [],
    bonusActionIds: [],
    inventory: [],
    dead: false,
    dodging: false,
    disengaging: false,
    hidden: false,
    secondWindUsed: false,
    exhaustionLevel: 3,
    conditions: ["exhaustion"],
  };
  longRestResources(token, {
    id: "t",
    name: "T",
    class: "fighter",
    level: 1,
    hp: 20,
    ac: 12,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    speedCells: 6,
  });
  assert.equal(token.exhaustionLevel, 2);
  assert.ok(token.conditions?.includes("exhaustion"));
});
