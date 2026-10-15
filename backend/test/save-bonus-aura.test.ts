import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { before, test } from "node:test";
import {
  performPcAction,
  refreshAuras,
  tickAuraStart,
  type CombatState,
  type CombatToken,
} from "../src/local/combat.js";
import { boot, scriptDice } from "./helpers.js";
import { CONTENT_ROOT } from "../src/local/paths.js";
import { catalogEntry } from "../src/local/content-catalog.js";
import type { ItemDef } from "@d20-fireverse/content-schema";

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

function arena(tokens: CombatToken[]): CombatState {
  return {
    encounterId: "test",
    mapId: "test",
    width: 20,
    height: 20,
    walls: Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => false)),
    hazards: Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => false)),
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

test("cloak and ring of protection grant AC and save bonuses and close review", () => {
  const cloak = catalogEntry<ItemDef>("item", "cloak_of_protection");
  const ring = catalogEntry<ItemDef>("item", "ring_of_protection");
  assert.deepEqual(
    cloak?.effects.filter((e) => e.kind === "save_bonus" || e.kind === "ac_bonus"),
    [
      { kind: "ac_bonus", amount: 1 },
      { kind: "save_bonus", amount: 1 },
    ],
  );
  assert.deepEqual(
    ring?.effects.filter((e) => e.kind === "save_bonus" || e.kind === "ac_bonus"),
    [
      { kind: "ac_bonus", amount: 1 },
      { kind: "save_bonus", amount: 1 },
    ],
  );
  const reviewDir = path.join(CONTENT_ROOT, "srd-5.2.1/review/item");
  const cloakReview = JSON.parse(fs.readFileSync(path.join(reviewDir, "cloak_of_protection.json"), "utf8")) as { status: string };
  const ringReview = JSON.parse(fs.readFileSync(path.join(reviewDir, "ring_of_protection.json"), "utf8")) as { status: string };
  assert.equal(cloakReview.status, "auto_ok");
  assert.equal(ringReview.status, "auto_ok");
  const staff = catalogEntry<ItemDef>("item", "staff_of_power");
  assert.ok(staff?.effects.some((e) => e.kind === "save_bonus" && e.amount === 2));
});

test("paladin aura still adds CHA-min-1 to ally saves in range", () => {
  const paladin = token({
    id: "pc-1",
    kind: "pc",
    x: 2,
    y: 2,
    features: ["aura_of_protection"],
  });
  const ally = token({ id: "pc-2", kind: "pc", x: 3, y: 2 });
  const far = token({ id: "pc-3", kind: "pc", x: 10, y: 10 });
  const foe = token({ id: "en-1", kind: "enemy", x: 2, y: 3 });
  const c = arena([paladin, ally, far, foe]);
  refreshAuras(c);
  assert.equal(ally.auraBonus, 1);
  assert.equal(paladin.auraBonus, 1);
  assert.equal(far.auraBonus, 0);
  assert.equal(foe.auraBonus, 0);
});

test("planting the rod grants allies +1 AC and saves until pulled", () => {
  const owner = token({
    id: "pc-1",
    kind: "pc",
    x: 4,
    y: 4,
    playerId: "P1",
    actionIds: ["rod_plant", "rod_pull"],
    plantAuras: [{ radiusCells: 12, filter: "ally", ac: 1, saves: 1 }],
    abilityUses: { rod_plant: 1 },
  });
  const ally = token({ id: "pc-2", kind: "pc", x: 6, y: 4 });
  const foe = token({ id: "en-1", kind: "enemy", x: 5, y: 4 });
  const c = arena([owner, ally, foe]);
  performPcAction(c, "P1", "rod_plant");
  assert.equal(ally.auraAc, 1);
  assert.equal(ally.auraBonus, 1);
  assert.equal(foe.auraAc ?? 0, 0);
  owner.x = 4;
  owner.y = 4;
  owner.hasAction = true;
  performPcAction(c, "P1", "rod_pull");
  assert.equal(ally.auraAc ?? 0, 0);
  assert.equal(ally.auraBonus ?? 0, 0);
});

test("magma aura burns a neighbor at the start of their turn", () => {
  const magma = token({
    id: "en-1",
    kind: "enemy",
    x: 1,
    y: 0,
    followAuras: [{ radiusCells: 1, filter: "all", excludeSource: true, onStartTurn: { dice: "1d6", damageType: "fire" } }],
  });
  const hero = token({ id: "pc-1", kind: "pc", x: 0, y: 0, hp: 20 });
  const far = token({ id: "pc-2", kind: "pc", x: 5, y: 5, hp: 20 });
  const c = arena([hero, magma, far]);
  refreshAuras(c);
  const restore = scriptDice([[6, 4]]);
  try {
    tickAuraStart(c, hero);
    tickAuraStart(c, far);
  } finally {
    restore();
  }
  assert.equal(hero.hp, 16);
  assert.equal(far.hp, 20);
});

test("holy avenger aura marks allies for advantage on saves vs magic", () => {
  const paladin = token({
    id: "pc-1",
    kind: "pc",
    x: 0,
    y: 0,
    followAuras: [{ radiusCells: 2, filter: "ally", saveAdv: "vs_magic" }],
  });
  const ally = token({ id: "pc-2", kind: "pc", x: 1, y: 0 });
  const c = arena([paladin, ally]);
  refreshAuras(c);
  assert.equal(ally.auraSaveAdv, "vs_magic");
});
