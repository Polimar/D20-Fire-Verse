import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  applyDisconnectDodge,
  computeReachable,
  endTurn,
  pathTo,
  performPcAction,
  proposeMove,
  resolveReaction,
  startCombat,
  startArenaCombat,
  applyDamage,
  clearShot,
  publicCombat,
  type CombatState,
  type CombatToken,
} from "../src/local/combat.js";
import { boot, scriptDice } from "./helpers.js";
import { getArenaMap } from "../src/local/arena-maps.js";

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

function arena(
  width: number,
  height: number,
  tokens: CombatToken[],
  walls: Array<[number, number]> = [],
  hazards: Array<[number, number]> = [],
): CombatState {
  const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
  for (const [x, y] of walls) grid[y][x] = true;
  const hz = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
  for (const [x, y] of hazards) hz[y][x] = true;
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

function brenna(x: number, y: number, over: Partial<CombatToken> = {}) {
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
    ...over,
  });
}

function quill(x: number, y: number, over: Partial<CombatToken> = {}) {
  return token({
    id: "pc-P1",
    kind: "pc",
    name: "Quill Ashmere",
    x,
    y,
    ac: 12,
    hp: 20,
    maxHp: 20,
    playerId: "P1",
    characterId: "quill_ashmere",
    actionIds: ["spell_burning_hands"],
    ...over,
  });
}

function rat(id: string, x: number, y: number, over: Partial<CombatToken> = {}) {
  return token({
    id,
    kind: "enemy",
    name: "Giant Rat",
    x,
    y,
    hp: 7,
    maxHp: 7,
    monsterId: "giant_rat",
    actionIds: ["giant_rat_bite"],
    ...over,
  });
}

test("diagonals follow the 5-10-5 rule", () => {
  const c = arena(8, 8, [brenna(0, 0)]);
  assert.equal(pathTo(c, c.tokens[0], 1, 1)?.cost, 1);
  assert.equal(pathTo(c, c.tokens[0], 2, 2)?.cost, 3);
  assert.equal(pathTo(c, c.tokens[0], 3, 3)?.cost, 4);
  const route = pathTo(c, c.tokens[0], 3, 0);
  assert.deepEqual(route?.path, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 3, y: 0 },
  ]);
});

test("no squeezing diagonally between two walls", () => {
  const c = arena(4, 4, [brenna(0, 0)], [
    [1, 0],
    [0, 1],
  ]);
  assert.equal(pathTo(c, c.tokens[0], 1, 1), null);
  assert.equal(computeReachable(c, "pc-P1").length, 0);
});

test("allies can be passed through but foes block", () => {
  const ally = token({ id: "pc-P2", kind: "pc", x: 1, y: 0, playerId: "P2" });
  const c = arena(3, 1, [brenna(0, 0), ally]);
  assert.equal(pathTo(c, c.tokens[0], 2, 0)?.cost, 2);
  const blocked = arena(3, 1, [brenna(0, 0), rat("en-1", 1, 0)]);
  assert.equal(pathTo(blocked, blocked.tokens[0], 2, 0), null);
});

test("moving records the walked path and spends movement", () => {
  const c = arena(8, 3, [brenna(0, 1), rat("en-1", 7, 1)]);
  c.reachable = computeReachable(c, "pc-P1");
  proposeMove(c, "P1", 3, 1);
  const move = c.events.at(-1);
  assert.equal(move?.kind, "move");
  assert.equal(move?.kind === "move" && move.path.length, 4);
  assert.equal(c.tokens[0].movementLeft, 3);
  assert.throws(() => proposeMove(c, "P1", 7, 0), /UNREACHABLE/);
});

test("the enemy turn walks to the hero and attacks with a readable roll", () => {
  const c = arena(8, 3, [brenna(0, 1), rat("en-1", 4, 1)]);
  const restore = scriptDice([
    [20, 15],
    [4, 3],
  ]);
  try {
    endTurn(c, "P1");
  } finally {
    restore();
  }
  const kinds = c.events.map((e) => e.kind);
  assert.deepEqual(kinds, ["turn", "move", "strike", "turn"]);
  const move = c.events[1];
  assert.ok(move.kind === "move" && move.path.at(-1)!.x === 1);
  const strike = c.events[2];
  assert.ok(strike.kind === "strike");
  assert.deepEqual(strike.rolls[0].vs, { kind: "AC", value: 16 });
  assert.equal(strike.rolls[0].total, 19);
  assert.equal(strike.hits[0].outcome, "hit");
  assert.equal(strike.hits[0].damage, 5);
  assert.equal(c.tokens[0].hp, 15);
  assert.equal(c.round, 2);
});

test("a natural 20 from the hero doubles the damage dice", () => {
  const c = arena(3, 1, [brenna(0, 0), rat("en-1", 1, 0, { hp: 30, maxHp: 30 })]);
  const restore = scriptDice([
    [20, 20],
    [8, 4],
    [8, 6],
  ]);
  try {
    performPcAction(c, "P1", "longsword_attack", "en-1");
  } finally {
    restore();
  }
  const strike = c.events.at(-1)!;
  assert.ok(strike.kind === "strike");
  assert.equal(strike.hits[0].outcome, "crit");
  assert.deepEqual(strike.rolls[1].values, [4, 6]);
  assert.equal(strike.rolls[1].damageType, "slashing");
  assert.equal(strike.hits[0].damage, 4 + 6 + 3);
});

test("a held attack shows damage dice after the d20, then the damage swipe resolves them", () => {
  const c = arena(3, 1, [brenna(0, 0), rat("en-1", 1, 0, { hp: 30, maxHp: 30 })]);
  const toHit = scriptDice([[20, 14]]);
  let hold: ReturnType<typeof performPcAction> | undefined;
  try {
    hold = performPcAction(c, "P1", "longsword_attack", "en-1", undefined, { phase: "d20" });
  } finally {
    toHit();
  }
  assert.ok(hold?.strike);
  assert.equal(c.events.at(-1)?.kind, "status");
  assert.deepEqual(c.damagePreview, [{ sides: 8, damageType: "slashing" }]);
  assert.equal(c.tokens[1]!.hp, 30);
  const dmg = scriptDice([[8, 5]]);
  try {
    performPcAction(c, "P1", "longsword_attack", "en-1", undefined, { phase: "damage", strike: hold!.strike! });
  } finally {
    dmg();
  }
  const strike = c.events.at(-1)!;
  assert.ok(strike.kind === "strike");
  assert.equal(strike.rolls.filter((r) => r.purpose === "damage").length, 1);
  assert.equal(strike.hits[0]!.damage, 5 + 3);
  assert.equal(c.damagePreview, undefined);
});

test("a mixed-damage bite records a roll per damage type", () => {
  const c = arena(3, 1, [
    brenna(0, 0),
    token({
      id: "en-1",
      kind: "enemy",
      name: "Magma Rat",
      x: 1,
      y: 0,
      hp: 32,
      maxHp: 32,
      ac: 14,
      monsterId: "magma_rat",
      actionIds: ["magma_rat_bite"],
    }),
  ]);
  const restore = scriptDice([
    [20, 15],
    [6, 4],
    [8, 5],
  ]);
  try {
    endTurn(c, "P1");
  } finally {
    restore();
  }
  const strike = c.events.find((e) => e.kind === "strike");
  assert.ok(strike && strike.kind === "strike");
  const parts = strike.rolls.filter((r) => r.purpose === "damage");
  assert.equal(parts.length, 2);
  assert.equal(parts[0]!.damageType, "piercing");
  assert.equal(parts[1]!.damageType, "fire");
  assert.equal(strike.hits[0]!.damage, 6 + 5);
});

test("the last foe falling ends the fight with victory events", () => {
  const c = arena(3, 1, [brenna(0, 0), rat("en-1", 1, 0, { hp: 2 })]);
  const restore = scriptDice([
    [20, 12],
    [8, 5],
  ]);
  try {
    performPcAction(c, "P1", "longsword_attack", "en-1");
  } finally {
    restore();
  }
  assert.equal(c.status, "victory");
  assert.deepEqual(
    c.events.map((e) => e.kind),
    ["strike", "down", "end"],
  );
  assert.throws(() => endTurn(c, "P1"), /COMBAT_OVER/);
});

test("spent actions are refused, not silently ignored", () => {
  const c = arena(3, 1, [brenna(0, 0), rat("en-1", 1, 0, { hp: 30, maxHp: 30 })]);
  performPcAction(c, "P1", "std_dodge");
  assert.throws(() => performPcAction(c, "P1", "longsword_attack", "en-1"), /NO_ACTION/);
  assert.throws(() => performPcAction(c, "P2", "std_dash"), /NOT_YOUR_TURN/);
});

test("dash can be taken back before you walk", () => {
  const c = arena(8, 8, [brenna(0, 0), rat("en-1", 7, 7)]);
  const hero = c.tokens[0]!;
  const start = hero.movementLeft;
  performPcAction(c, "P1", "std_dash");
  assert.equal(hero.hasAction, false);
  assert.equal(hero.movementLeft, start + hero.speedCells);
  const row = publicCombat(c, "P1").actionMenu?.actions.find((a) => a.id === "std_dash");
  assert.equal(row?.available, true);
  assert.equal(row?.name, "Cancel Dash");
  performPcAction(c, "P1", "std_dash");
  assert.equal(hero.hasAction, true);
  assert.equal(hero.movementLeft, start);
  performPcAction(c, "P1", "std_dodge");
  assert.equal(hero.hasAction, false);
});

test("dash cannot be taken back after you walk", () => {
  const c = arena(8, 8, [brenna(0, 0), rat("en-1", 7, 7)]);
  performPcAction(c, "P1", "std_dash");
  proposeMove(c, "P1", 1, 0);
  assert.throws(() => performPcAction(c, "P1", "std_dash"), /NO_ACTION/);
});

test("a dropped hero dodges, so the next bite rolls with disadvantage", () => {
  const c = arena(3, 1, [brenna(0, 0), rat("en-1", 1, 0)]);
  applyDisconnectDodge(c, "P1");
  const strike = c.events.find((e) => e.kind === "strike");
  assert.ok(strike && strike.kind === "strike");
  assert.equal(strike.rolls[0].values.length, 2);
  assert.match(strike.rolls[0].notation, /^2d20kl1/);
});

test("an attack under AC deals no damage, and a tie hits", () => {
  const under = arena(3, 1, [brenna(0, 0), rat("en-1", 1, 0, { hp: 30, maxHp: 30, ac: 12 })]);
  const miss = scriptDice([[20, 6]]);
  try {
    performPcAction(under, "P1", "longsword_attack", "en-1");
  } finally {
    miss();
  }
  const missed = under.events.at(-1);
  assert.ok(missed?.kind === "strike");
  assert.equal(missed.rolls[0].total, 11);
  assert.equal(missed.hits[0].outcome, "miss");
  assert.equal(missed.hits[0].damage, 0);
  assert.equal(under.tokens[1].hp, 30);

  const tied = arena(3, 1, [brenna(0, 0), rat("en-1", 1, 0, { hp: 30, maxHp: 30, ac: 12 })]);
  const hit = scriptDice([
    [20, 7],
    [8, 4],
  ]);
  try {
    performPcAction(tied, "P1", "longsword_attack", "en-1");
  } finally {
    hit();
  }
  const landed = tied.events.at(-1);
  assert.ok(landed?.kind === "strike");
  assert.equal(landed.rolls[0].total, 12);
  assert.equal(landed.hits[0].outcome, "hit");
  assert.equal(landed.hits[0].damage, 7);
  assert.equal(tied.tokens[1].hp, 23);
});

test("burning hands is a 15-foot cone, not every nearby foe", () => {
  const c = arena(6, 4, [
    quill(0, 0),
    rat("en-aim", 2, 0, { hp: 30, maxHp: 30 }),
    rat("en-side", 2, 2, { hp: 30, maxHp: 30 }),
    rat("en-fwd", 3, 1, { hp: 30, maxHp: 30 }),
    rat("en-far", 4, 0, { hp: 30, maxHp: 30 }),
  ]);
  const restore = scriptDice([
    [6, 3],
    [6, 3],
    [6, 3],
    [20, 1],
    [20, 1],
  ]);
  try {
    performPcAction(c, "P1", "spell_burning_hands", "en-aim");
  } finally {
    restore();
  }
  const strike = c.events.at(-1);
  assert.ok(strike?.kind === "strike");
  const ids = strike.hits.map((h) => h.targetId).sort();
  assert.deepEqual(ids, ["en-aim", "en-fwd"]);
  assert.equal(c.tokens.find((t) => t.id === "en-side")!.hp, 30);
  assert.equal(c.tokens.find((t) => t.id === "en-far")!.hp, 30);
  for (const h of strike.hits) {
    assert.equal(h.outcome, "fail");
    assert.equal(h.damage, 9);
    assert.notEqual(h.outcome, "miss");
  }
});

test("a successful Dex save against burning hands takes half and is not a miss", () => {
  const saved = arena(4, 1, [quill(0, 0), rat("en-1", 2, 0, { hp: 30, maxHp: 30 })]);
  const save = scriptDice([
    [6, 6],
    [6, 6],
    [6, 6],
    [20, 11],
  ]);
  try {
    performPcAction(saved, "P1", "spell_burning_hands", "en-1");
  } finally {
    save();
  }
  const half = saved.events.at(-1);
  assert.ok(half?.kind === "strike");
  assert.equal(half.hits.length, 1);
  assert.equal(half.hits[0].outcome, "success");
  assert.equal(half.hits[0].damage, 9);
  assert.equal(saved.tokens[1].hp, 21);
  assert.match(half.line, /half/);

  const failed = arena(4, 1, [quill(0, 0), rat("en-1", 2, 0, { hp: 40, maxHp: 40 })]);
  const fail = scriptDice([
    [6, 6],
    [6, 6],
    [6, 6],
    [20, 10],
  ]);
  try {
    performPcAction(failed, "P1", "spell_burning_hands", "en-1");
  } finally {
    fail();
  }
  const full = failed.events.at(-1);
  assert.ok(full?.kind === "strike");
  assert.equal(full.hits[0].outcome, "fail");
  assert.equal(full.hits[0].damage, 18);
  assert.equal(failed.tokens[1].hp, 22);
});

test("a real encounter opens with initiative and hands the turn to a hero", () => {
  const c = startCombat("cellar_rats", [
    { playerId: "P1", displayName: "T", characterId: "brenna_ironveal", characterName: "Brenna Ironveal" },
  ]);
  assert.equal(c.events[0].kind, "start");
  const current = c.tokens.find((t) => t.id === c.turnOrder[c.turnIndex]);
  assert.ok(c.status !== "active" || current?.kind === "pc");
  assert.ok(c.tokens.filter((t) => t.kind === "enemy").length >= 2);
});

test("a hero reduced to 0 hit points is dying and the fight continues", () => {
  const c = arena(3, 1, [brenna(0, 0, { hp: 4, maxHp: 20 }), rat("en-1", 1, 0)]);
  const restore = scriptDice([
    [20, 15],
    [4, 3],
    [20, 12],
  ]);
  try {
    endTurn(c, "P1");
  } finally {
    restore();
  }
  const hero = c.tokens[0]!;
  assert.equal(hero.dead, false);
  assert.equal(hero.hp, 0);
  assert.equal(hero.dying, true);
  assert.equal(c.status, "active");
});

test("the wizard menu comes from the sheet and a spell spends a slot", () => {
  const c = startCombat("cellar_rats", [
    { playerId: "P1", displayName: "Q", characterId: "quill_ashmere", characterName: "Quill Ashmere" },
  ]);
  const hero = c.tokens.find((t) => t.kind === "pc")!;
  assert.ok(hero.actionIds.includes("fire_bolt"));
  assert.ok(hero.actionIds.includes("spell_magic_missile"));
  assert.equal(hero.slots?.["1"], 4);
  assert.equal(hero.slots?.["2"], 2);
  c.turnIndex = c.turnOrder.indexOf(hero.id);
  hero.hasAction = true;
  while (c.pending) resolveReaction(c, c.pending.playerId, false);
  const foe = c.tokens.find((t) => t.kind === "enemy" && !t.dead)!;
  assert.ok(foe, "at least one rat should be in line of the wizard");
  const spots = [
    [foe.x, foe.y - 1],
    [foe.x, foe.y + 1],
    [foe.x - 1, foe.y],
    [foe.x + 1, foe.y],
  ];
  const open = spots.find(
    ([x, y]) =>
      x >= 0 &&
      y >= 0 &&
      x < c.width &&
      y < c.height &&
      !c.walls[y][x] &&
      !c.tokens.some((t) => t.x === x && t.y === y && !t.dead),
  );
  assert.ok(open);
  hero.x = open[0]!;
  hero.y = open[1]!;
  performPcAction(c, "P1", "spell_magic_missile", foe.id);
  assert.equal(hero.slots?.["1"], 3);
});

test("a Shield offer does not skip the next foe, and answering lets that foe act", () => {
  const hero = quill(1, 1, {
    reactionIds: ["spell_shield"],
    reactionReady: true,
    slots: { "1": 2 },
    ac: 12,
  });
  const first = rat("en-1", 2, 1, { hp: 12, maxHp: 12 });
  const second = rat("en-2", 1, 2, { hp: 12, maxHp: 12 });
  const c = arena(6, 6, [hero, first, second]);
  const restore = scriptDice([
    [20, 18],
    [4, 2],
    [20, 16],
    [4, 1],
  ]);
  try {
    endTurn(c, "P1");
    assert.equal(c.pending?.kind, "shield");
    assert.equal(c.pending?.attackerId, "en-1");
    assert.equal(c.turnOrder[c.turnIndex], "en-1");
    assert.equal(second.hasAction, true);
    resolveReaction(c, "P1", false);
    assert.equal(c.pending?.attackerId, "en-2");
    assert.equal(c.turnOrder[c.turnIndex], "en-2");
    resolveReaction(c, "P1", false);
    assert.equal(c.pending, undefined);
    assert.equal(second.hasAction, false);
    assert.equal(c.events.filter((e) => e.kind === "strike" && e.tokenId === "en-2").length, 1);
    assert.equal(c.turnOrder[c.turnIndex], "pc-P1");
  } finally {
    restore();
  }
});

test("leaving a foe's reach provokes one opportunity attack and the move still finishes", () => {
  const hero = brenna(0, 1, { movementLeft: 6 });
  const foe = rat("en-1", 0, 2, { reactionReady: true, hp: 30, maxHp: 30 });
  const c = arena(8, 3, [hero, foe]);
  c.reachable = computeReachable(c, "pc-P1");
  const restore = scriptDice([
    [20, 10],
    [4, 1],
  ]);
  try {
    proposeMove(c, "P1", 3, 1);
  } finally {
    restore();
  }
  assert.equal(hero.x, 3);
  assert.equal(hero.y, 1);
  assert.equal(c.events.filter((e) => e.kind === "strike").length, 1);
  assert.equal(foe.reactionReady, false);
  assert.equal(c.pending, undefined);
});

test("invisibility then stepping away asks for Shield once and then completes the move", () => {
  const hero = quill(0, 1, {
    sheetDriven: true,
    spells: ["spell_invisibility"],
    actionIds: ["spell_invisibility"],
    slots: { "1": 4, "2": 2 },
    spellAbility: "int",
    reactionIds: ["spell_shield"],
    reactionReady: true,
    movementLeft: 6,
  });
  const foe = rat("en-1", 0, 2, { reactionReady: true, hp: 40, maxHp: 40 });
  const c = arena(8, 3, [hero, foe]);
  performPcAction(c, "P1", "spell_invisibility");
  assert.equal(hero.invisible, true);
  c.reachable = computeReachable(c, hero.id);
  const restore = scriptDice([
    [20, 18],
    [20, 15],
    [4, 2],
    [20, 14],
  ]);
  try {
    proposeMove(c, "P1", 3, 1);
    assert.equal(c.pending?.kind, "shield");
    resolveReaction(c, "P1", false);
  } finally {
    restore();
  }
  assert.equal(hero.x, 3);
  assert.equal(hero.y, 1);
  assert.equal(c.events.filter((e) => e.kind === "strike").length, 1);
  assert.equal(c.pending, undefined);
});

test("a paralyzed hero keeps the turn so the foe acts only once", () => {
  const hero = brenna(0, 0, { conditions: ["paralyzed"] });
  const c = arena(6, 1, [hero, rat("en-1", 4, 0)]);
  const restore = scriptDice([
    [20, 12],
    [4, 2],
  ]);
  try {
    endTurn(c, "P1");
  } finally {
    restore();
  }
  assert.equal(c.events.filter((e) => e.kind === "strike").length, 1);
  assert.equal(c.status, "active");
  const current = c.tokens.find((t) => t.id === c.turnOrder[c.turnIndex]);
  assert.equal(current?.id, hero.id);
  assert.equal(hero.hasAction, false);
});

test("a wall between attacker and target blocks a ranged shot", () => {
  const hero = quill(0, 0, { actionIds: ["spell_magic_missile"] });
  const foe = rat("en-1", 2, 0, { hp: 30, maxHp: 30 });
  const blocked = arena(6, 1, [hero, foe], [[1, 0]]);
  assert.throws(() => performPcAction(blocked, "P1", "spell_magic_missile", "en-1"), /NO_SHOT/);
  assert.equal(hero.hasAction, true);
  assert.equal(foe.hp, 30);

  const openHero = quill(0, 0, { actionIds: ["spell_magic_missile"] });
  const openFoe = rat("en-1", 2, 0, { hp: 30, maxHp: 30 });
  const open = arena(6, 1, [openHero, openFoe]);
  performPcAction(open, "P1", "spell_magic_missile", "en-1");
  assert.ok(open.events.some((e) => e.kind === "strike"));
  assert.ok(openFoe.hp < 30);
});

test("melee into an adjacent square is not blocked", () => {
  const hero = brenna(0, 0);
  const foe = rat("en-1", 1, 0, { hp: 30, maxHp: 30 });
  const c = arena(4, 1, [hero, foe], [[2, 0]]);
  const restore = scriptDice([
    [20, 12],
    [8, 4],
  ]);
  try {
    performPcAction(c, "P1", "longsword_attack", "en-1");
  } finally {
    restore();
  }
  const strike = c.events.at(-1);
  assert.ok(strike?.kind === "strike");
  assert.equal(strike.hits[0].outcome, "hit");
});

test("walls still block a step even when shots care about them", () => {
  const c = arena(4, 1, [brenna(0, 0)], [[1, 0]]);
  assert.equal(pathTo(c, c.tokens[0], 2, 0), null);
  assert.equal(computeReachable(c, "pc-P1").length, 0);
});

test("hazards block a step but not a shot", () => {
  const hero = brenna(0, 0);
  const foe = rat("en-1", 2, 0, { hp: 30, maxHp: 30 });
  const c = arena(3, 1, [hero, foe], [], [[1, 0]]);
  assert.equal(pathTo(c, hero, 2, 0), null);
  assert.equal(clearShot(c, 0, 0, 2, 0), true);
});

test("walls still block a shot across a gap", () => {
  const c = arena(3, 1, [brenna(0, 0), rat("en-1", 2, 0)], [[1, 0]]);
  assert.equal(clearShot(c, 0, 0, 2, 0), false);
});

test("fire resistance halves incoming fire", () => {
  const foe = rat("en-1", 2, 0, { hp: 20, maxHp: 20, damageResistances: ["fire"] });
  const c = arena(3, 1, [brenna(0, 0), foe]);
  applyDamage(c, foe, 10, false, "fire");
  assert.equal(foe.hp, 15);
});

test("PvE drops a hero at 0 HP with no death saves", () => {
  const hero = brenna(0, 0, { hp: 4, maxHp: 28 });
  const foe = rat("en-1", 1, 0);
  const c = arena(3, 1, [hero, foe]);
  c.pve = true;
  applyDamage(c, hero, 10, false, "slashing");
  assert.equal(hero.dead, true);
});

test("arena PvE loads a goblin with Nimble Escape", () => {
  const map = getArenaMap("arena_brewery_small");
  assert.ok(map);
  const c = startArenaCombat({
    map,
    players: [{ playerId: "P1", characterId: "brenna_ironveal" }],
    level: 1,
    teams: false,
    pve: true,
    monsterId: "srd_goblin_minion",
  });
  const gob = c.tokens.find((t) => t.kind === "enemy");
  assert.ok(gob);
  assert.equal(gob.name, "Goblin Minion");
  assert.ok(gob.bonusActionIds?.length);
});

test("legendary action fires after the hero ends a turn", () => {
  const hero = brenna(0, 0);
  const foe = rat("en-1", 1, 0, {
    hp: 40,
    maxHp: 40,
    legendaryUses: 3,
    legendaryLeft: 3,
    legendaryActions: ["giant_rat_bite"],
    actionIds: ["giant_rat_bite"],
  });
  const c = arena(4, 1, [hero, foe]);
  c.turnOrder = ["pc-P1", "en-1"];
  c.turnIndex = 0;
  hero.hasAction = true;
  endTurn(c, "P1");
  assert.ok(c.events.some((e) => /legendary/i.test(e.line)));
});

