import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { before, test } from "node:test";
import { accountDb, acceptFriend, createUser, login, openAuth, requestFriend } from "../src/local/auth.js";
import { accountElo, leaderboard } from "../src/local/arena-queue.js";
import { mountAccountRoutes, mountAdminRoutes } from "../src/local/admin-http.js";
import { mountAdminPortalRoutes } from "../src/local/admin-portal-http.js";
import { mountV2Routes } from "../src/local/v2-http.js";
import { setContentEnabled } from "../src/local/content-catalog.js";
import { createHero } from "../src/local/hero.js";
import {
  cancelRanked,
  partyAccept,
  partyHero,
  partyInvite,
  rankedAttach,
  rankedPartyState,
  rankedQueue,
  resetRankedForTests,
  tickRanked,
} from "../src/local/ranked.js";
import { ticketForUser } from "../src/local/arena-queue.js";
import { arenaStart, arenasPublic, getRoom, playerDisconnect } from "../src/local/room.js";
import { boot } from "./helpers.js";

before(() => {
  boot();
  openAuth();
  for (const [kind, id] of [
    ["class", "fighter"],
    ["species", "human"],
    ["background", "soldier"],
  ] as const) {
    try {
      setContentEnabled(kind, id, true);
    } catch {
      /* already on */
    }
  }
});

const heroBase = {
  species: "human",
  classId: "fighter",
  background: "soldier",
  alignment: "neutral_good",
  abilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
};

function player(tag: string) {
  const stamp = `${tag}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`;
  const user = createUser(stamp.slice(0, 32), "password", "player");
  const hero = createHero(user.id, { ...heroBase, name: `Hero ${tag}` });
  rankedAttach({ userId: user.id, username: user.username, send: () => undefined });
  return { user, hero };
}

test("ranked queue seats a private 1v1, cancel drops the ticket, and a forfeit settles Elo once", () => {
  resetRankedForTests();
  const a = player("rqA");
  const b = player("rqB");
  rankedAttach({ userId: a.user.id, username: a.user.username, send: () => undefined });
  rankedAttach({ userId: b.user.id, username: b.user.username, send: () => undefined });
  rankedQueue(a.user.id, a.user.username, "ffa_1v1", a.hero.id);
  cancelRanked(a.user.id);
  assert.equal(tickRanked().length, 0);
  rankedQueue(a.user.id, a.user.username, "ffa_1v1", a.hero.id);
  rankedQueue(b.user.id, b.user.username, "ffa_1v1", b.hero.id);
  const made = tickRanked();
  assert.equal(made.length, 1);
  const room = made[0]!.room;
  assert.equal(room.arena?.mode, "ranked");
  assert.equal(room.arena?.privacy, "private");
  assert.equal(room.players.length, 2);
  assert.equal(arenasPublic().some((row) => row.roomCode === room.roomCode), false);
  const eloA = accountElo(a.user.id);
  arenaStart(room.roomCode);
  const live = getRoom(room.roomCode)!;
  const dropped = live.players[0]!;
  playerDisconnect(live.roomCode, dropped.playerId);
  const after = getRoom(room.roomCode)!;
  assert.equal(after.arena?.phase, "ended");
  const rows = accountDb()
    .prepare("SELECT format, placements_json FROM match_board WHERE format = ? ORDER BY ended_at DESC LIMIT 1")
    .get("ffa_1v1") as { format: string; placements_json: string } | undefined;
  assert.ok(rows?.placements_json);
  const places = JSON.parse(rows!.placements_json) as Array<{ userId?: string; placement?: number }>;
  assert.equal(places.length, 2);
  assert.notEqual(accountElo(a.user.id), accountElo(b.user.id));
  assert.notEqual(accountElo(dropped.userId!), eloA);
  const board = leaderboard("ranked", "solo", "ffa_1v1");
  assert.ok(board.some((row) => row.userId === a.user.id || row.userId === b.user.id));
});

test("party invite is friends-only; leaving dissolves the party and its ticket", () => {
  resetRankedForTests();
  const a = player("ptyA");
  const b = player("ptyB");
  const stranger = player("ptyC");
  rankedAttach({ userId: a.user.id, username: a.user.username, send: () => undefined });
  rankedAttach({ userId: b.user.id, username: b.user.username, send: () => undefined });
  assert.throws(() => partyInvite(a.user.id, a.user.username, stranger.user.username), /PARTY_NOT_FRIEND/);
  requestFriend(a.user.id, b.user.username);
  acceptFriend(b.user.id, a.user.id);
  partyInvite(a.user.id, a.user.username, b.user.username);
  const party = rankedPartyState(a.user.id);
  assert.ok(party);
  partyAccept(b.user.id, b.user.username, party!.id);
  partyHero(a.user.id, a.hero.id);
  partyHero(b.user.id, b.hero.id);
  rankedQueue(a.user.id, a.user.username, "teams_2v2", a.hero.id);
  cancelRanked(b.user.id, "drop");
  assert.equal(rankedPartyState(a.user.id), undefined);
  assert.equal(tickRanked().length, 0);
});

test("invite without Accept queues a solo 2v2 ticket, not a duo", () => {
  resetRankedForTests();
  const a = player("soloA");
  const b = player("soloB");
  requestFriend(a.user.id, b.user.username);
  acceptFriend(b.user.id, a.user.id);
  partyInvite(a.user.id, a.user.username, b.user.username);
  rankedQueue(a.user.id, a.user.username, "teams_2v2", a.hero.id);
  const ticket = ticketForUser(a.user.id);
  assert.equal(ticket?.partyUserIds.length, 1);
});

test("Accept plus heroes on both members creates one duo ticket", () => {
  resetRankedForTests();
  const a = player("duoA");
  const b = player("duoB");
  requestFriend(a.user.id, b.user.username);
  acceptFriend(b.user.id, a.user.id);
  partyInvite(a.user.id, a.user.username, b.user.username);
  const party = rankedPartyState(a.user.id);
  assert.ok(party);
  partyAccept(b.user.id, b.user.username, party!.id);
  partyHero(b.user.id, b.hero.id);
  rankedQueue(a.user.id, a.user.username, "teams_2v2", a.hero.id);
  const ticket = ticketForUser(a.user.id);
  assert.equal(ticket?.partyUserIds.length, 2);
  assert.deepEqual(ticket?.partyUserIds.slice().sort(), [a.user.id, b.user.id].sort());
  assert.equal(ticketForUser(b.user.id)?.id, ticket?.id);
});

test("rankedAttach companion then TV still delivers PARTY_STATE to the TV", () => {
  resetRankedForTests();
  const a = player("fanA");
  const b = player("fanB");
  requestFriend(a.user.id, b.user.username);
  acceptFriend(b.user.id, a.user.id);
  const phone: Array<{ eventType: string }> = [];
  const tv: Array<{ eventType: string }> = [];
  rankedAttach({ userId: b.user.id, username: b.user.username, send: (e) => phone.push(e), surface: "other", id: "phone" });
  rankedAttach({ userId: b.user.id, username: b.user.username, send: (e) => tv.push(e), surface: "tv", id: "tv" });
  partyInvite(a.user.id, a.user.username, b.user.username);
  assert.ok(tv.some((e) => e.eventType === "PARTY_STATE"));
  assert.ok(phone.some((e) => e.eventType === "PARTY_STATE"));
});

test("GET /api/me/profile returns wallet, ranked, heroes, and economy totals", async () => {
  const player = createUser(`prof_${Date.now().toString(36)}`.slice(0, 32), "password", "player");
  createHero(player.id, { ...heroBase, name: "Profile Mira" });
  const session = login(player.username, "password")!;
  const app = express();
  app.use(express.json());
  mountAccountRoutes(app);
  mountAdminPortalRoutes(app);
  mountAdminRoutes(app);
  mountV2Routes(app);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/me/profile`, {
      headers: { cookie: `fv_session=${session.token}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      wallet: { gold: number };
      ranked: { elo: number };
      heroes: unknown[];
      economy: { goldEarned: number };
      season: { endsAt: string };
    };
    assert.equal(typeof body.wallet.gold, "number");
    assert.equal(typeof body.ranked.elo, "number");
    assert.ok(Array.isArray(body.heroes));
    assert.equal(typeof body.economy.goldEarned, "number");
    assert.ok(body.season.endsAt);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
