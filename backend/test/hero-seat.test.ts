import assert from "node:assert/strict";
import { before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { accountDb, createUser, openAuth } from "../src/local/auth.js";
import { getAbility, getPregen, listPregens } from "../src/local/campaign.js";
import { performPcAction, type CombatState, type CombatToken } from "../src/local/combat.js";
import { engineView } from "../src/local/content-engine.js";
import { catalogEntry, resolveContent, setContentEnabled } from "../src/local/content-catalog.js";
import { createHero, equip, stashView, toggleAttune, type HeroRow } from "../src/local/hero.js";
import type { HeroPregen } from "../src/local/hero-pregen.js";
import { createArena, joinRoom, publicState } from "../src/local/room.js";
import { initSheet, refreshMenus } from "../src/local/srd-sheet.js";
import type { ItemDef } from "@d20-fireverse/content-schema";
import { boot, scriptDice } from "./helpers.js";

before(() => {
  boot();
  openAuth();
});

const ITEMS = ["longsword", "chain_mail", "shield", "weapon_plus_1", "frost_brand", "ring_of_protection", "wand_of_magic_missiles"];

function enable(): void {
  for (const [kind, id] of [
    ["class", "fighter"],
    ["species", "human"],
    ["background", "soldier"],
  ] as const) {
    setContentEnabled(kind, id, true);
  }
  for (const id of ITEMS) {
    resolveContent("item", id, { adminNote: "hero seat test" });
    setContentEnabled("item", id, true);
  }
}

function give(userId: string, hero: HeroRow, itemId: string): string {
  const instance = `item_${randomUUID()}`;
  accountDb()
    .prepare("INSERT INTO account_stash (id, user_id, item_def_id, item_instance_data_json, acquired_at) VALUES (?, ?, ?, '{}', ?)")
    .run(instance, userId, itemId, new Date().toISOString());
  equip(userId, hero.id, instance);
  return instance;
}

function promote(hero: HeroRow, level: number): void {
  accountDb()
    .prepare("UPDATE heroes SET level = ?, classes_json = ? WHERE id = ?")
    .run(level, JSON.stringify([{ id: "fighter", level }]), hero.id);
}

function seat(pregen: HeroPregen, x = 0): CombatToken {
  const token: CombatToken = {
    id: "pc-P1",
    kind: "pc",
    name: pregen.name,
    x,
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
    hp: 60,
    maxHp: 60,
    ac: 12,
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

test("an account hero sits down with the armor, shield, and magic weapon it has equipped", () => {
  enable();
  const player = createUser("seat_fighter", "password", "player");
  const hero = createHero(player.id, {
    name: "Rook Hale",
    species: "human",
    classId: "fighter",
    background: "soldier",
    alignment: "neutral_good",
    abilities: { str: 15, dex: 14, con: 13, int: 10, wis: 10, cha: 8 },
  });

  const bare = getPregen(hero.id) as HeroPregen;
  assert.equal(bare.hp, 10 + 1);
  assert.equal(bare.ac, 10 + 2);
  assert.deepEqual(bare.weapons, ["gear_longsword_attack"]);
  assert.ok(listPregens(player.id).some((p) => p.id === hero.id));
  assert.ok(!listPregens(null).some((p) => p.id === hero.id));

  promote(hero, 7);
  assert.equal(getPregen(hero.id)!.hp, 11 + 6 * (6 + 1), "level 1 takes the full d10, later levels the average");
  assert.equal(getPregen(hero.id)!.proficiencyBonus, 3);
  give(player.id, hero, "chain_mail");
  give(player.id, hero, "shield");
  const ring = give(player.id, hero, "ring_of_protection");
  give(player.id, hero, "weapon_plus_1");

  const unattuned = getPregen(hero.id) as HeroPregen;
  assert.equal(unattuned.ac, 16 + 2, "chain mail ignores DEX, the shield adds 2, the ring waits for attunement");
  assert.ok(unattuned.gear.notes.some((n) => n.includes("Ring of Protection")));
  assert.ok(stashView(player.id).filter((s) => s.itemDefId === "longsword" && s.equippedBy === hero.id).length === 0, "the replaced longsword goes back to the stash");

  toggleAttune(player.id, hero.id, ring);
  const kitted = getPregen(hero.id) as HeroPregen;
  assert.equal(kitted.ac, 16 + 2 + 1);
  assert.deepEqual(kitted.weapons, ["gear_longsword_attack"], "Weapon +1 is swung as the fighter's longsword");
  assert.equal(kitted.gear.weapons.gear_longsword_attack?.attack, 1);
  assert.equal(kitted.gear.weapons.gear_longsword_attack?.damage, 1);
  assert.equal(kitted.gear.weapons.gear_longsword_attack?.mastery, "sap");
  assert.equal(kitted.gear.attack, 0, "the +1 stays on the weapon");

  const token = seat(kitted);
  assert.ok(token.actionIds.includes("gear_longsword_attack"));
  const combat = duel(token);
  const restore = scriptDice([
    [20, 10],
    [8, 5],
  ]);
  try {
    performPcAction(combat, "P1", "gear_longsword_attack", "en-1");
  } finally {
    restore();
  }
  const strike = combat.events.at(-1)!;
  assert.ok(strike.kind === "strike");
  assert.equal(strike.rolls[0]!.total, 10 + 2 + 3 + 1, "d20 + STR + proficiency + weapon bonus");
  assert.equal(strike.hits[0]!.damage, 5 + 2 + 1);
});

test("a magic weapon rider, its resistance, and an item spell reach the fight", () => {
  enable();
  const player = createUser("seat_brand", "password", "player");
  const hero = createHero(player.id, {
    name: "Ash Venn",
    species: "human",
    classId: "fighter",
    background: "soldier",
    alignment: "neutral_good",
    abilities: { str: 15, dex: 14, con: 13, int: 10, wis: 10, cha: 8 },
  });
  promote(hero, 11);
  const brand = give(player.id, hero, "frost_brand");
  const wand = give(player.id, hero, "wand_of_magic_missiles");

  const asleep = getPregen(hero.id) as HeroPregen;
  assert.deepEqual(asleep.gear.weapons.gear_longsword_attack?.onHit ?? [], [], "Frost Brand does nothing before attunement");
  assert.deepEqual(asleep.gear.resistances, []);

  toggleAttune(player.id, hero.id, brand);
  const awake = getPregen(hero.id) as HeroPregen;
  assert.deepEqual(awake.gear.weapons.gear_longsword_attack?.onHit, [{ damage: "1d6", damageType: "cold" }]);
  assert.deepEqual(awake.gear.resistances, ["fire"]);
  const [spellId] = Object.keys(awake.gear.granted);
  assert.ok(spellId, "the wand's Magic Missile is a combat ability");
  assert.equal(awake.gear.charges[wand], 7);

  const token = seat(awake);
  assert.deepEqual(token.damageResistances, ["fire"]);
  assert.ok(token.actionIds.includes(spellId!), "a fighter with no slots can still fire the wand");
  const combat = duel(token);
  const hit = scriptDice([
    [20, 15],
    [8, 4],
    [6, 3],
  ]);
  try {
    performPcAction(combat, "P1", "gear_longsword_attack", "en-1");
  } finally {
    hit();
  }
  const strike = combat.events.at(-1)!;
  assert.ok(strike.kind === "strike");
  assert.ok(strike.rolls.some((r) => r.damageType === "cold"));
  assert.equal(strike.hits[0]!.damage, 4 + 2 + 3);

  token.hasAction = true;
  performPcAction(combat, "P1", "std_magic");
  performPcAction(combat, "P1", spellId!, "en-1");
  assert.equal(token.gearCharges?.[wand], 6);
  assert.deepEqual(token.slots, {});
});

test("the admin panel says how a magic weapon is carried into a fight", () => {
  const frost = catalogEntry<ItemDef>("item", "frost_brand");
  assert.ok(frost?.baseItems?.includes("longsword"));
  const view = engineView("item", "frost_brand", frost);
  assert.ok(view);
  assert.equal(view.state, "runs");
  assert.ok(view.lines.some((l) => l.label === "Base" && l.detail.includes("Longsword")));
  assert.ok(view.lines.some((l) => l.label === "On hit" && l.ok));
  const glaive = engineView("item", "glaive", catalogEntry<ItemDef>("item", "glaive"));
  assert.ok(glaive?.lines.some((l) => l.detail.includes("Reach is not modeled")));
});

test("only the owner can bring an account hero into an arena seat", () => {
  enable();
  const owner = createUser("seat_owner", "password", "player");
  const hero = createHero(owner.id, {
    name: "Wren Calder",
    species: "human",
    classId: "fighter",
    background: "soldier",
    alignment: "neutral_good",
    abilities: { str: 15, dex: 14, con: 13, int: 10, wis: 10, cha: 8 },
  });
  const room = createArena({ format: "ffa_1v1", theme: "brewery", mapSize: "small", level: 3, privacy: "private", name: "Seat" });
  assert.throws(() => joinRoom(room.roomCode, "Thief", hero.id, "someone_else"), /BAD_CHARACTER/);
  const joined = joinRoom(room.roomCode, "Wren", hero.id, owner.id);
  const me = publicState(room, joined.playerId).players.find((p) => p.playerId === joined.playerId);
  assert.equal(me?.characterId, hero.id);
});
