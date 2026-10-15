import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { accountDb, createUser, openAuth } from "../src/local/auth.js";
import { getPregen } from "../src/local/campaign.js";
import { buildPcSheet, endTurn, performPcAction, type CombatState, type CombatToken } from "../src/local/combat.js";
import { GIANT_STRENGTH_POTIONS } from "../src/local/giant-strength-potions.js";
import { createHero, equip, toggleAttune, type HeroRow } from "../src/local/hero.js";
import type { HeroPregen } from "../src/local/hero-pregen.js";
import { resolveContent, setContentEnabled } from "../src/local/content-catalog.js";
import { boot, scriptDice } from "./helpers.js";
import { CONTENT_ROOT } from "../src/local/paths.js";

before(() => {
  boot();
  openAuth();
});

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

function rat(id: string, x: number, y: number, over: Partial<CombatToken> = {}) {
  return token({ id, kind: "enemy", name: "Rat", x, y, ac: 10, hp: 80, maxHp: 80, ...over });
}

function give(userId: string, hero: HeroRow, itemId: string): string {
  const instance = `item_${randomUUID()}`;
  accountDb()
    .prepare("INSERT INTO account_stash (id, user_id, item_def_id, item_instance_data_json, acquired_at) VALUES (?, ?, ?, '{}', ?)")
    .run(instance, userId, itemId, new Date().toISOString());
  equip(userId, hero.id, instance);
  return instance;
}

test("catalog giant strength potions use stat_drink with SRD scores", () => {
  const raw = fs.readFileSync(path.join(CONTENT_ROOT, "srd-5.2.1/items/magic.json"), "utf8");
  const pack = JSON.parse(raw) as { entries: Array<{ id: string; effects: unknown[] }> };
  for (const def of GIANT_STRENGTH_POTIONS) {
    const item = pack.entries.find((e) => e.id === def.itemId);
    assert.ok(item, def.itemId);
    assert.deepEqual(item.effects, [
      { kind: "stat_drink", ability: "str", score: def.score, durationPcTurns: 60 },
    ]);
  }
});

test("drinking a hill potion sets Strength 21 until timed effects expire", () => {
  const hero = token({
    id: "pc-P1",
    kind: "pc",
    name: "Brenna Ironveal",
    x: 0,
    y: 0,
    ac: 16,
    playerId: "P1",
    characterId: "brenna_ironveal",
    actionIds: ["use_potion_giant_strength_hill", "longsword_attack", "std_dash"],
    inventory: ["potion_giant_strength_hill"],
  });
  const c = arena([hero, rat("en-1", 1, 0, { actionIds: [], speedCells: 0 })]);
  performPcAction(c, "P1", "use_potion_giant_strength_hill");
  assert.ok(!hero.inventory.includes("potion_giant_strength_hill"));
  assert.equal(hero.abilityOverride?.str, 21);
  assert.equal(hero.timedEffects?.[0]?.pcTurnsLeft, 60);
  const sheet = buildPcSheet(hero, null);
  assert.equal(sheet.abilities.str.score, 21);
  assert.equal(sheet.abilities.str.mod, 5);

  hero.hasAction = true;
  const hit = scriptDice([[20, 12], [8, 4]]);
  try {
    performPcAction(c, "P1", "longsword_attack", "en-1");
  } finally {
    hit();
  }
  const strike = c.events.find((e) => e.kind === "strike");
  assert.ok(strike && strike.kind === "strike");
  const dmg = strike.rolls.find((r) => r.purpose === "damage");
  assert.ok(dmg);
  assert.equal(dmg.modifier, 5);
  assert.equal(strike.hits[0]!.damage, 4 + 5);

  hero.hasAction = true;
  hero.timedEffects = [{ label: "Giant Strength", pcTurnsLeft: 1, spellId: "giant_strength" }];
  endTurn(c, "P1");
  assert.equal(hero.abilityOverride?.str, undefined);
});

test("a hill potion does nothing if current Strength is already 21 (belt or a stronger drink)", () => {
  const hero = token({
    id: "pc-P1",
    kind: "pc",
    name: "Brenna Ironveal",
    x: 0,
    y: 0,
    playerId: "P1",
    characterId: "brenna_ironveal",
    actionIds: ["use_potion_giant_strength_hill", "use_potion_giant_strength_storm"],
    inventory: ["potion_giant_strength_storm", "potion_giant_strength_hill"],
  });
  const c = arena([hero]);
  performPcAction(c, "P1", "use_potion_giant_strength_storm");
  assert.equal(hero.abilityOverride?.str, 29);
  hero.hasAction = true;
  performPcAction(c, "P1", "use_potion_giant_strength_hill");
  assert.ok(!hero.inventory.includes("potion_giant_strength_hill"));
  assert.equal(hero.abilityOverride?.str, 29, "a weaker drink must not replace a stronger current Strength");
  const line = c.events.at(-1);
  assert.ok(line?.kind === "status");
  assert.match(line.line, /no effect/i);
});

test("a hill potion does nothing when Strength is already 21 or higher, but is still consumed", () => {
  for (const [kind, id] of [
    ["class", "fighter"],
    ["species", "human"],
    ["background", "soldier"],
  ] as const) {
    setContentEnabled(kind, id, true);
  }
  const player = createUser(`gs_hi_${randomUUID().slice(0, 8)}`, "password", "player");
  const row = createHero(player.id, {
    name: "Rook Hale",
    species: "human",
    classId: "fighter",
    background: "soldier",
    alignment: "neutral_good",
    abilities: { str: 15, dex: 14, con: 13, int: 10, wis: 10, cha: 8 },
  });
  accountDb()
    .prepare("UPDATE heroes SET ability_scores_json = ? WHERE id = ?")
    .run(JSON.stringify({ str: 22, dex: 14, con: 13, int: 10, wis: 10, cha: 8 }), row.id);
  const hero = token({
    id: "pc-P1",
    kind: "pc",
    name: row.name,
    x: 0,
    y: 0,
    playerId: "P1",
    characterId: row.id,
    actionIds: ["use_potion_giant_strength_hill"],
    inventory: ["potion_giant_strength_hill"],
  });
  const c = arena([hero]);
  performPcAction(c, "P1", "use_potion_giant_strength_hill");
  assert.ok(!hero.inventory.includes("potion_giant_strength_hill"));
  assert.equal(hero.abilityOverride, undefined);
  const line = c.events.at(-1);
  assert.ok(line?.kind === "status");
  assert.match(line.line, /no effect/i);
});

test("carrying a giant strength potion in the loadout does not raise Strength until drunk", () => {
  for (const [kind, id] of [
    ["class", "fighter"],
    ["species", "human"],
    ["background", "soldier"],
  ] as const) {
    setContentEnabled(kind, id, true);
  }
  resolveContent("item", "potion_of_giant_strength_hill", { adminNote: "giant strength test" });
  setContentEnabled("item", "potion_of_giant_strength_hill", true);
  const player = createUser(`gs_${randomUUID().slice(0, 8)}`, "password", "player");
  const hero = createHero(player.id, {
    name: "Rook Hale",
    species: "human",
    classId: "fighter",
    background: "soldier",
    alignment: "neutral_good",
    abilities: { str: 15, dex: 14, con: 13, int: 10, wis: 10, cha: 8 },
  });
  accountDb().prepare("UPDATE heroes SET level = 3, classes_json = ? WHERE id = ?").run(JSON.stringify([{ id: "fighter", level: 3 }]), hero.id);
  give(player.id, hero, "potion_of_giant_strength_hill");
  const pregen = getPregen(hero.id) as HeroPregen;
  assert.equal(pregen.abilities.str, 15);
  assert.ok(pregen.inventory.includes("potion_giant_strength_hill"));
});

test("a hill potion does nothing while a Belt of Giant Strength already sets Strength to 21", () => {
  for (const [kind, id] of [
    ["class", "fighter"],
    ["species", "human"],
    ["background", "soldier"],
  ] as const) {
    setContentEnabled(kind, id, true);
  }
  for (const id of ["belt_of_giant_strength_hill", "potion_of_giant_strength_hill"]) {
    resolveContent("item", id, { adminNote: "giant strength belt test" });
    setContentEnabled("item", id, true);
  }
  const player = createUser(`gs_belt_${randomUUID().slice(0, 8)}`, "password", "player");
  const row = createHero(player.id, {
    name: "Rook Hale",
    species: "human",
    classId: "fighter",
    background: "soldier",
    alignment: "neutral_good",
    abilities: { str: 15, dex: 14, con: 13, int: 10, wis: 10, cha: 8 },
  });
  accountDb()
    .prepare("UPDATE heroes SET level = 7, classes_json = ? WHERE id = ?")
    .run(JSON.stringify([{ id: "fighter", level: 7 }]), row.id);
  const belt = give(player.id, row, "belt_of_giant_strength_hill");
  toggleAttune(player.id, row.id, belt);
  give(player.id, row, "potion_of_giant_strength_hill");
  const pregen = getPregen(row.id) as HeroPregen;
  assert.equal(pregen.abilities.str, 21);
  const hero = token({
    id: "pc-P1",
    kind: "pc",
    name: row.name,
    x: 0,
    y: 0,
    playerId: "P1",
    characterId: row.id,
    actionIds: ["use_potion_giant_strength_hill"],
    inventory: [...(pregen.inventory ?? [])],
  });
  const c = arena([hero]);
  performPcAction(c, "P1", "use_potion_giant_strength_hill");
  assert.equal(hero.abilityOverride, undefined);
  assert.match((c.events.at(-1) as { line: string }).line, /no effect/i);
});
