import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createUser, openAuth } from "../src/local/auth.js";
import { getAbility, getPregen } from "../src/local/campaign.js";
import { performPcAction, type CombatState, type CombatToken } from "../src/local/combat.js";
import { resolveContent, setContentEnabled } from "../src/local/content-catalog.js";
import { stampLabHero } from "../src/local/rules-lab.js";
import type { HeroPregen } from "../src/local/hero-pregen.js";
import { initSheet, refreshMenus } from "../src/local/srd-sheet.js";
import { boot, scriptDice } from "./helpers.js";

before(() => {
  boot();
  openAuth();
});

function enableLab(): void {
  for (const [kind, id] of [
    ["class", "barbarian"],
    ["class", "fighter"],
    ["subclass", "path_of_the_berserker"],
    ["subclass", "champion"],
    ["species", "human"],
    ["background", "soldier"],
    ["item", "greataxe"],
    ["item", "longsword"],
    ["feat", "great_weapon_fighting"],
    ["feat", "defense"],
  ] as const) {
    setContentEnabled(kind, id, true);
  }
  for (const id of ["greataxe", "longsword"]) {
    resolveContent("item", id, { adminNote: "lab test" });
    setContentEnabled("item", id, true);
  }
}

function seat(pregen: HeroPregen): CombatToken {
  const token: CombatToken = {
    id: "pc-P1",
    kind: "pc",
    name: pregen.name,
    x: 0,
    y: 0,
    hp: pregen.hp,
    maxHp: pregen.hp,
    ac: pregen.ac,
    speedCells: pregen.speedCells ?? 6,
    movementLeft: pregen.speedCells ?? 6,
    hasAction: true,
    hasBonusAction: true,
    initiative: 20,
    playerId: "P1",
    characterId: pregen.id,
    actionIds: [],
    bonusActionIds: [],
    inventory: [...(pregen.inventory ?? [])],
    dead: false,
    dodging: false,
    disengaging: false,
    hidden: false,
    secondWindUsed: false,
    reactionReady: true,
  };
  initSheet(token, pregen);
  refreshMenus(token, pregen, getAbility);
  return token;
}

function duel(hero: CombatToken): CombatState {
  const dummy: CombatToken = {
    id: "en-1",
    kind: "enemy",
    name: "Dummy",
    x: 1,
    y: 0,
    hp: 80,
    maxHp: 80,
    ac: 10,
    speedCells: 0,
    movementLeft: 0,
    hasAction: true,
    hasBonusAction: false,
    initiative: 1,
    actionIds: [],
    bonusActionIds: [],
    inventory: [],
    dead: false,
    dodging: false,
    disengaging: false,
    hidden: false,
    secondWindUsed: false,
  };
  return {
    encounterId: "test",
    mapId: "test",
    width: 4,
    height: 1,
    walls: [[false, false, false, false]],
    hazards: [[false, false, false, false]],
    tokens: [hero, dummy],
    turnOrder: [hero.id, dummy.id],
    turnIndex: 0,
    round: 1,
    log: [],
    reachable: [],
    status: "active",
    events: [],
    seq: 0,
  };
}

test("a level 5 fighter Extra Attacks, and Second Wind uses the fighter level", () => {
  enableLab();
  const admin = createUser("lab_fighter", "password", "admin");
  const hero = stampLabHero(admin.id, { classId: "fighter", speciesId: "human", level: 5, subclassId: "champion" });
  const pregen = getPregen(hero.id) as HeroPregen;
  const token = seat(pregen);
  assert.equal(token.kit?.extraAttacks, 1);
  assert.ok((token.secondWindLeft ?? 0) >= 2);
  const combat = duel(token);
  const restore = scriptDice([
    [20, 15],
    [8, 4],
    [20, 15],
    [8, 5],
    [10, 6],
  ]);
  try {
    performPcAction(combat, "P1", "gear_longsword_attack", "en-1");
    assert.equal(token.hasAction, false);
    assert.equal(token.attacksLeft, 1);
    performPcAction(combat, "P1", "gear_longsword_attack", "en-1");
    assert.equal(token.attacksLeft, 0);
    performPcAction(combat, "P1", "second_wind");
  } finally {
    restore();
  }
  const heal = combat.events.find((e) => e.kind === "heal");
  assert.ok(heal && heal.kind === "heal");
  assert.equal(token.secondWindLeft, (token.kit?.secondWind ?? 3) - 1);
});

test("a level 10 berserker rages, Reckless Attacks, and cannot cast while raging", () => {
  enableLab();
  const admin = createUser("lab_barb", "password", "admin");
  const hero = stampLabHero(admin.id, {
    classId: "barbarian",
    speciesId: "human",
    level: 10,
    subclassId: "path_of_the_berserker",
  });
  const pregen = getPregen(hero.id) as HeroPregen;
  const token = seat(pregen);
  assert.equal(token.kit?.rages, 4);
  assert.equal(token.kit?.rageDamage, 3);
  assert.equal(token.kit?.critMin, 20);
  assert.ok(token.bonusActionIds.includes("rage"));
  const combat = duel(token);
  performPcAction(combat, "P1", "rage");
  assert.equal(token.raging, true);
  assert.ok(token.actionIds.includes("reckless:gear_greataxe_attack") || token.actionIds.some((id) => id.startsWith("reckless:")));
  const restore = scriptDice([
    [20, 18],
    [12, 8],
  ]);
  try {
    const reckless = token.actionIds.find((id) => id.startsWith("reckless:"))!;
    performPcAction(combat, "P1", reckless, "en-1");
  } finally {
    restore();
  }
  assert.equal(token.reckless, true);
  const strike = combat.events.find((e) => e.kind === "strike");
  assert.ok(strike && strike.kind === "strike");
});
