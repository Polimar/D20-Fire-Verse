import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { before, test } from "node:test";
import { createUser, login, openAuth } from "../src/local/auth.js";
import { mountAccountRoutes, mountAdminRoutes } from "../src/local/admin-http.js";
import { mountV2Routes } from "../src/local/v2-http.js";
import { setContentEnabled } from "../src/local/content-catalog.js";
import { createHero, deleteHero, equip, listHeroes, stashView, wallet } from "../src/local/hero.js";
import { rollLoot } from "../src/local/loot.js";
import { vendorStock } from "../src/local/vendor.js";
import { STRATEGIES } from "../../tools/srd-parser/src/strategies.ts";
import {
  applyMastery,
  canAddClass,
  canEquip,
  composeEncounter,
  levelForXp,
  mortalThresholdCr,
  partyElo,
  partyLevel,
  rankedAbsenceIsLoss,
  scaleToCap,
  seasonResetElo,
  targetBudgetCr,
  windowForWait,
  xpAfterLoss,
} from "@d20-fireverse/rules";
import { boot } from "./helpers.js";

before(() => {
  boot();
  openAuth();
});

const heroBase = {
  species: "human",
  classId: "fighter",
  background: "soldier",
  alignment: "neutral_good",
  abilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
};

test("the parser tries ten strategies and the danger budget matches the house rule", () => {
  assert.equal(STRATEGIES.length, 10);
  assert.equal(mortalThresholdCr([2, 2, 2, 2]), 2);
  assert.equal(targetBudgetCr([2, 2, 2, 2]), 2.2);
  assert.equal(mortalThresholdCr([6, 6, 6, 6]), 12);
  assert.equal(Number(targetBudgetCr([6, 6, 6, 6]).toFixed(1)), 13.2);
  const picked = composeEncounter({
    targetBudgetCr: 2.2,
    catalog: [
      { id: "a", crValue: 0.25 },
      { id: "b", crValue: 0.5 },
      { id: "c", crValue: 1 },
    ],
    maxMonsters: 1,
    rng: () => 0,
  });
  assert.equal(picked.length, 1);
  assert.equal(levelForXp(300, [0, 300, 900]), 2);
  assert.equal(xpAfterLoss(400, -200, 2, [0, 300, 900]), 300);
  assert.equal(seasonResetElo(1600), Math.round(1600 * 0.6 + 1000 * 0.4));
  assert.equal(partyElo([1000, 1400]), 1200);
  assert.equal(partyLevel([2, 8, 3]), 8);
  assert.deepEqual(windowForWait(0), { level: 2, elo: 100 });
  assert.equal(windowForWait(60_000).level, 5);
  assert.equal(rankedAbsenceIsLoss(0, 44_000), false);
  assert.equal(rankedAbsenceIsLoss(0, 45_000), true);
  assert.equal(applyMastery({ mastery: "graze", granted: true, hit: false, melee: true, abilityMod: 3 }).grazeDamage, 3);
  assert.equal(canAddClass({ level: 1, classes: [{ id: "fighter", level: 1 }] }, false), false);
  const scaled = scaleToCap(
    { level: 8, maxHp: 60, attackBonus: 6, damageBonus: 4, slots: { "1": 2 }, features: ["spellcasting"], spells: ["cure_wounds"] },
    2,
    {},
  );
  assert.equal(scaled.level, 2);
  assert.deepEqual(scaled.features, ["spellcasting"]);
  assert.equal(canEquip(
    {
      id: "h",
      name: "H",
      level: 1,
      xp: 0,
      species: "human",
      alignment: "neutral",
      classes: [{ id: "fighter", level: 1 }],
      abilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
      proficiency: [],
      features: [],
      spells: [],
    },
    { id: "cloak_of_protection", name: "Cloak of Protection", rarity: "uncommon", slot: "trinket", effects: [], requires: { attunement: true } },
    0,
  ).ok, false);
});

test("a hero starts with no gold, a locked stash, and a level that waits until the fight ends", async () => {
  for (const [kind, id] of [
    ["class", "fighter"],
    ["species", "human"],
    ["background", "soldier"],
    ["item", "longsword"],
    ["item", "longsword_plus_1"],
    ["subclass", "champion"],
  ] as const) {
    setContentEnabled(kind, id, true);
  }
  const player = createUser("v2hero", "password", "player");
  assert.throws(() => createHero(player.id, { ...heroBase, name: "fuck" }), /NAME_DENIED/);
  const hero = createHero(player.id, { ...heroBase, name: "Mira Stone" });
  assert.equal(hero.level, 1);
  assert.equal(hero.classes.length, 1);
  assert.equal(wallet(player.id).gold, 0);
  const stash = stashView(player.id);
  assert.equal(stash.length, 1);
  const other = createHero(player.id, { ...heroBase, name: "Torin Vale", classId: "fighter" });
  assert.throws(() => equip(player.id, other.id, stash[0]!.id), /ITEM_IN_USE_BY_HERO/);
  deleteHero(player.id, hero.id);
  assert.equal(listHeroes(player.id).some((row) => row.id === hero.id), false);
  assert.equal(stashView(player.id)[0]?.equippedBy, null);
  const drop = rollLoot({ userId: player.id, mode: "ranked", level: 1, opponentLevel: 1, won: true, rng: () => 0 });
  assert.equal(drop.overTier, true);

  const app = express();
  app.use(express.json());
  mountAccountRoutes(app);
  mountAdminRoutes(app);
  mountV2Routes(app);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;
  try {
    const admin = login("admin", "admin");
    assert.ok(admin);
    const content = await fetch(`http://127.0.0.1:${port}/api/admin/content`, { headers: { cookie: `fv_session=${admin.token}` } });
    const body = (await content.json()) as { entries: Array<{ id: string; valid: boolean; enabled: boolean }> };
    const broken = body.entries.find((entry) => entry.id === "broken_spell");
    assert.ok(broken);
    assert.equal(broken.valid, false);
    assert.equal(broken.enabled, false);
    const shop = await fetch(`http://127.0.0.1:${port}/api/vendor`, { headers: { cookie: `fv_session=${admin.token}` } });
    const sold = (await shop.json()) as { payToWin: string; slots: unknown[] };
    assert.match(sold.payToWin, /pay-to-win/);
    assert.deepEqual(sold.slots, vendorStock());
    const gold = await fetch(`http://127.0.0.1:${port}/api/admin/gold`, {
      method: "POST",
      headers: { cookie: `fv_session=${admin.token}`, "content-type": "application/json" },
      body: JSON.stringify({ userId: player.id, amount: 100 }),
    });
    assert.equal(gold.status, 200);
    assert.equal(wallet(player.id).gold, 100);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
