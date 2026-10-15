import assert from "node:assert/strict";
import { test } from "node:test";
import { applyExhaustionLevel, type CombatState, type CombatToken } from "../src/local/combat.js";
import { effectiveMaxHp } from "@d20-fireverse/rules";
import { initSheet } from "../src/local/srd-sheet.js";

function token(over: Partial<CombatToken> = {}): CombatToken {
  return {
    id: "pc-P1",
    kind: "pc",
    name: "Tired",
    x: 0,
    y: 0,
    hp: 40,
    maxHp: 40,
    ac: 14,
    speedCells: 6,
    movementLeft: 6,
    hasAction: true,
    hasBonusAction: true,
    initiative: 10,
    playerId: "P1",
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
  return {
    encounterId: "t",
    mapId: "t",
    width: 4,
    height: 4,
    walls: Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => false)),
    hazards: Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => false)),
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

test("exhaustion tier 4 halves max HP in combat", () => {
  const hero = token({ baseMaxHp: 40, exhaustionLevel: 0 });
  const combat = arena([hero]);
  applyExhaustionLevel(combat, hero, 4);
  assert.equal(hero.maxHp, effectiveMaxHp(40, 4));
  assert.equal(hero.hp, 20);
});

test("exhaustion tier 6 kills the creature", () => {
  const hero = token({ baseMaxHp: 30, hp: 30 });
  const combat = arena([hero]);
  applyExhaustionLevel(combat, hero, 6);
  assert.equal(hero.dead, true);
});

test("initSheet applies exhaustion cap from saved vitals", () => {
  const hero = token({ maxHp: 44, hp: 44, sheetDriven: true, characterId: "hero_x" });
  initSheet(
    hero,
    {
      id: "hero_x",
      name: "F",
      class: "fighter",
      level: 4,
      hp: 44,
      ac: 16,
      abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 8 },
      speedCells: 6,
    },
    { exhaustionLevel: 4 },
  );
  assert.equal(hero.maxHp, effectiveMaxHp(44, 4));
});
