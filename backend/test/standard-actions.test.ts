import assert from "node:assert/strict";
import { test } from "node:test";
import { performPcAction, type CombatState, type CombatToken } from "../src/local/combat.js";
import { scriptDice } from "./helpers.js";

const ALL_STANDARD = [
  "std_attack",
  "std_dash",
  "std_disengage",
  "std_dodge",
  "std_help",
  "std_hide",
  "std_influence",
  "std_magic",
  "std_ready",
  "std_search",
  "std_study",
  "std_utilize",
] as const;

function pc(over: Partial<CombatToken> = {}): CombatToken {
  return {
    id: "pc-P1",
    kind: "pc",
    name: "Hero",
    x: 0,
    y: 0,
    hp: 20,
    maxHp: 20,
    ac: 14,
    speedCells: 6,
    movementLeft: 6,
    hasAction: true,
    hasBonusAction: true,
    initiative: 10,
    playerId: "P1",
    characterId: "hero_test",
    actionIds: [...ALL_STANDARD, "longsword_attack"],
    bonusActionIds: [],
    inventory: [],
    dead: false,
    dodging: false,
    disengaging: false,
    hidden: false,
    secondWindUsed: false,
    kit: { extraAttacks: 0, flags: [], saves: [], rages: 0, rageDamage: 0, secondWind: 0, actionSurge: 0, indomitable: 0, fighterLevel: 1, sneakDice: 0, martialDie: "", focus: 0, channelDivinity: 0, bardicDie: "", sorceryPoints: 0, critMin: 20, fastMovementFt: 0, unarmoredMovementFt: 0 },
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

for (const action of ALL_STANDARD) {
  test(`standard action ${action} resolves on a PC turn`, () => {
    const hero = pc(action === "std_utilize" ? { inventory: ["potion_healing"] } : {});
    const ally = pc({ id: "pc-P2", playerId: "P2", x: 1, y: 0, actionIds: [], bonusActionIds: [] });
    const combat = arena([hero, ally]);
    if (action === "std_help") {
      performPcAction(combat, "P1", action, ally.id);
      assert.equal(ally.helpingTargetId, hero.id);
      return;
    }
    const restore =
      action === "std_hide" || action === "std_influence" || action === "std_study" || action === "std_search"
        ? scriptDice([[20, 18]])
        : () => undefined;
    try {
      performPcAction(combat, "P1", action);
    } finally {
      restore();
    }
    if (action === "std_dash") assert.ok(hero.movementLeft > 6);
    if (action === "std_dodge") assert.equal(hero.dodging, true);
    if (action === "std_disengage") assert.equal(hero.disengaging, true);
    if (action === "std_hide") assert.equal(hero.hidden, true);
    if (action === "std_attack") assert.ok((hero.attacksLeft ?? 0) >= 1);
    if (action === "std_magic") assert.equal(hero.magicActionReady, true);
    if (action === "std_utilize") assert.ok(!hero.inventory.includes("potion_healing"));
  });
}
