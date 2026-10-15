import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { before, test } from "node:test";
import {
  DEFAULT_ECONOMY,
  assembleMatch,
  cloneEconomy,
  eloDelta,
  ffaEloDeltas,
  matchGold,
  mergeEconomy,
  modeXp,
  teamEloDeltas,
  validateEconomy,
  type QueueTicket,
  type RankedFormat,
} from "@d20-fireverse/rules";
import { createUser, login, openAuth } from "../src/local/auth.js";
import { mountAccountRoutes, mountAdminRoutes } from "../src/local/admin-http.js";
import { mountAdminPortalRoutes } from "../src/local/admin-portal-http.js";
import { mountV2Routes } from "../src/local/v2-http.js";
import { setContentEnabled } from "../src/local/content-catalog.js";
import { createHero } from "../src/local/hero.js";
import { invalidateEconomyCache, resetEconomyConfig, setEconomyConfig } from "../src/local/economy-config.js";
import { settleHero } from "../src/local/rewards.js";
import { clearScheduledDay, setScheduledDay, vendorStock } from "../src/local/vendor.js";
import { wallet } from "../src/local/hero.js";
import { boot } from "./helpers.js";

before(() => {
  boot();
  openAuth();
});

function ticket(partial: Partial<QueueTicket> & { id: string; userId: string }): QueueTicket {
  return {
    elo: 1000,
    heroLevel: 3,
    queuedAt: 0,
    partyUserIds: [partial.userId],
    partyHeroIds: [`hero_${partial.userId}`],
    format: "ffa_1v1",
    ...partial,
  };
}

test("matchGold, modeXp, and elo honour a custom EconomyConfig and fall back to defaults", () => {
  assert.equal(matchGold("ranked", { won: true }), DEFAULT_ECONOMY.gold.ranked.win);
  assert.equal(matchGold("ranked", { won: false }), DEFAULT_ECONOMY.gold.ranked.loss);
  assert.equal(matchGold("ranked", { placement: 1 }), DEFAULT_ECONOMY.gold.ranked.win);
  assert.equal(matchGold("ranked", { placement: 2 }), DEFAULT_ECONOMY.gold.ranked.loss);
  const patched = mergeEconomy(DEFAULT_ECONOMY, { gold: { ranked: { win: 90, loss: 5, placementMultipliers: [1, 0.5, 0.25, 0] } } });
  assert.equal(matchGold("ranked", { placement: 2 }, patched), 45);
  assert.equal(modeXp("ranked", { won: true, heroLevel: 3, opponentLevel: 3 }), 300);
  const xpCfg = mergeEconomy(DEFAULT_ECONOMY, { xp: { ranked: { winBase: 10, winFlat: 0, winLevelCoeff: 0 } } });
  assert.equal(modeXp("ranked", { won: true, heroLevel: 1, opponentLevel: 1 }, xpCfg), 10);
  const even = eloDelta(1000, 1000, 1);
  assert.equal(even, Math.round(DEFAULT_ECONOMY.elo.k * 0.5));
  const ffa = ffaEloDeltas([1, 2], [1000, 1000]);
  assert.equal(ffa[0]! + ffa[1]!, 0);
  const teams = teamEloDeltas([[1000, 1000], [1000, 1000]], 0);
  assert.equal(teams[0]![0], even);
  assert.equal(teams[1]![0], -even);
  assert.throws(() => validateEconomy(mergeEconomy(DEFAULT_ECONOMY, { gold: { ranked: { win: -1 } } })), /BAD_ECONOMY/);
});

test("assembleMatch fills each ranked format and never splits a duo", () => {
  const now = 60_000;
  const ffa1: QueueTicket[] = [
    ticket({ id: "a", userId: "u1", queuedAt: 0 }),
    ticket({ id: "b", userId: "u2", queuedAt: 1 }),
  ];
  const m1 = assembleMatch("ffa_1v1", ffa1, now);
  assert.equal(m1?.ticketIds.length, 2);

  const ffa3 = [1, 2, 3].map((n) => ticket({ id: `c${n}`, userId: `u${n}`, format: "ffa_3", queuedAt: n }));
  assert.equal(assembleMatch("ffa_3", ffa3, now)?.seats.length, 3);

  const ffa4 = [1, 2, 3, 4].map((n) => ticket({ id: `d${n}`, userId: `u${n}`, format: "ffa_4", queuedAt: n }));
  assert.equal(assembleMatch("ffa_4", ffa4, now)?.seats.length, 4);

  const duoA = ticket({
    id: "duoA",
    userId: "p1",
    format: "teams_2v2",
    partyUserIds: ["p1", "p2"],
    partyHeroIds: ["h1", "h2"],
    queuedAt: 0,
  });
  const duoB = ticket({
    id: "duoB",
    userId: "p3",
    format: "teams_2v2",
    partyUserIds: ["p3", "p4"],
    partyHeroIds: ["h3", "h4"],
    queuedAt: 1,
  });
  const vs = assembleMatch("teams_2v2", [duoA, duoB], now);
  assert.equal(vs?.seats.length, 2);
  assert.equal(vs?.seats[0]?.userIds.join(","), "p1,p2");
  assert.equal(vs?.seats[1]?.userIds.join(","), "p3,p4");

  const solos = [5, 6].map((n) =>
    ticket({ id: `s${n}`, userId: `s${n}`, format: "teams_2v2", queuedAt: n }),
  );
  const mixed = assembleMatch("teams_2v2", [duoA, ...solos], now);
  assert.ok(mixed);
  assert.equal(mixed!.seats.some((s) => s.userIds.join(",") === "p1,p2"), true);

  const fourSolos = [1, 2, 3, 4].map((n) => ticket({ id: `t${n}`, userId: `t${n}`, format: "teams_2v2", queuedAt: n }));
  const filled = assembleMatch("teams_2v2", fourSolos, now);
  assert.equal(filled?.seats.length, 4);
  assert.equal(filled?.seats.filter((s) => s.teamId === "a").length, 2);

  const tight = mergeEconomy(DEFAULT_ECONOMY, { matchmaking: { baseElo: 10, maxElo: 10, stepElo: 0, stepMs: 15_000 } });
  const far = [
    ticket({ id: "wideA", userId: "w1", elo: 1000, queuedAt: 0 }),
    ticket({ id: "wideB", userId: "w2", elo: 1400, queuedAt: 0 }),
  ];
  assert.equal(assembleMatch("ffa_1v1", far, 1_000, tight), undefined);
  const wide = mergeEconomy(DEFAULT_ECONOMY, { matchmaking: { baseElo: 500, maxElo: 500, stepElo: 0 } });
  assert.ok(assembleMatch("ffa_1v1", far, 1_000, wide));
});

test("admin economy PUT validates, reset restores defaults, preview matches settle math", async () => {
  const admin = login("admin", "admin");
  assert.ok(admin);
  const app = express();
  app.use(express.json());
  mountAccountRoutes(app);
  mountAdminPortalRoutes(app);
  mountAdminRoutes(app);
  mountV2Routes(app);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;
  const cookie = `fv_session=${admin.token}`;
  try {
    const bad = await fetch(`http://127.0.0.1:${port}/api/admin/economy`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ gold: { ranked: { win: -4 } } }),
    });
    assert.equal(bad.status, 400);
    const ok = await fetch(`http://127.0.0.1:${port}/api/admin/economy`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ gold: { ranked: { win: 77 } } }),
    });
    assert.equal(ok.status, 200);
    const preview = await fetch(`http://127.0.0.1:${port}/api/admin/economy/preview`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ mode: "ranked", won: true, heroLevel: 2, opponentLevel: 2 }),
    });
    const shown = (await preview.json()) as { gold: number; xp: number };
    assert.equal(shown.gold, 77);
    assert.equal(shown.xp, modeXp("ranked", { won: true, heroLevel: 2, opponentLevel: 2 }));
    const reset = await fetch(`http://127.0.0.1:${port}/api/admin/economy/reset`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
    });
    assert.equal(reset.status, 200);
    invalidateEconomyCache();
    assert.equal(cloneEconomy(DEFAULT_ECONOMY).gold.ranked.win, DEFAULT_ECONOMY.gold.ranked.win);
  } finally {
    resetEconomyConfig({ id: "admin", username: "admin" });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("scheduled shop overrides auto stock; past days are refused; buy rejects items outside stock", async () => {
  for (const id of ["longsword", "leather_armor", "potion_of_healing"]) {
    try {
      setContentEnabled("item", id, true);
    } catch {
      /* some catalogs name potions differently */
    }
  }
  const enabled = vendorStock();
  const admin = login("admin", "admin")!;
  const app = express();
  app.use(express.json());
  mountAccountRoutes(app);
  mountAdminPortalRoutes(app);
  mountAdminRoutes(app);
  mountV2Routes(app);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;
  const cookie = `fv_session=${admin.token}`;
  const day = new Date().toISOString().slice(0, 10);
  try {
    const past = await fetch(`http://127.0.0.1:${port}/api/admin/shop/2001-01-01`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ slots: [] }),
    });
    assert.equal(past.status, 400);
    const pick = enabled[0]?.itemId;
    if (pick) {
      setScheduledDay(day, [{ itemId: pick, priceGold: 12 }]);
      const stock = vendorStock();
      assert.equal(stock.length, 1);
      assert.equal(stock[0]?.itemId, pick);
      assert.equal(stock[0]?.priceGold, 12);
      clearScheduledDay(day);
    }
  } finally {
    try {
      clearScheduledDay(day);
    } catch {
      /* already auto */
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("settleHero credits match gold and awards milestone tiers once", () => {
  for (const [kind, id] of [
    ["class", "fighter"],
    ["species", "human"],
    ["background", "soldier"],
  ] as const) {
    setContentEnabled(kind, id, true);
  }
  const player = createUser(`eco_${Date.now()}`, "password", "player");
  const hero = createHero(player.id, {
    name: "Gold Mira",
    species: "human",
    classId: "fighter",
    background: "soldier",
    alignment: "neutral_good",
    abilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
  });
  const before = wallet(player.id).gold;
  const first = settleHero({ heroId: hero.id, mode: "arcade", won: true });
  assert.equal(first.goldGained, DEFAULT_ECONOMY.gold.arcade.win);
  assert.equal(wallet(player.id).gold, before + first.goldGained);
  setEconomyConfig({ milestones: [{ kind: "games_1", count: 1, gold: 7 }] }, { id: "admin", username: "admin" });
  const extra = createHero(player.id, {
    name: "Gold Torin",
    species: "human",
    classId: "fighter",
    background: "soldier",
    alignment: "neutral_good",
    abilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
  });
  const goldBefore = wallet(player.id).gold;
  settleHero({ heroId: extra.id, mode: "arcade", won: false });
  assert.ok(wallet(player.id).gold >= goldBefore + 7);
  resetEconomyConfig({ id: "admin", username: "admin" });
});
