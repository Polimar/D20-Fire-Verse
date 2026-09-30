import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  arenaKick,
  arenaReady,
  arenaSetTeam,
  arenaStart,
  arenasPublic,
  createArena,
  createRoom,
  joinRoom,
  publicState,
} from "../src/local/room.js";
import { getArenaMap } from "../src/local/arena-maps.js";
import { boot } from "./helpers.js";

before(boot);

test("campaign still rejects a second seat with the same pregen", () => {
  const room = createRoom();
  joinRoom(room.roomCode, "A", "brenna_ironveal");
  assert.throws(() => joinRoom(room.roomCode, "B", "brenna_ironveal"), /CHARACTER_TAKEN/);
});

test("arena create, public list, duplicate pregen, ready and start 1v1", () => {
  const room = createArena({ format: "ffa_1v1", theme: "brewery", mapSize: "small", level: 1, privacy: "public", name: "Pit" });
  assert.equal(room.mode, "arena");
  assert.equal(room.arena?.level, 1);
  const listed = arenasPublic().find((a) => a.roomCode === room.roomCode);
  assert.ok(listed);
  assert.equal(listed?.roomCode, room.roomCode);
  const a = joinRoom(room.roomCode, "One", "brenna_ironveal", "user_a");
  const b = joinRoom(room.roomCode, "Two", "brenna_ironveal", "user_b");
  assert.equal(a.room.players.length, 2);
  assert.throws(() => arenaStart(room.roomCode), /ARENA_NOT_READY/);
  arenaReady(room.roomCode, a.playerId);
  arenaReady(room.roomCode, b.playerId);
  arenaStart(room.roomCode);
  const state = publicState(room, a.playerId);
  assert.equal(state.combat?.pvp, "ffa");
  assert.equal(state.combat?.width, 16);
  assert.ok(state.combat?.art?.includes("brewery-small"));
  const map = getArenaMap("arena_brewery_small");
  assert.equal(map?.width, 16);
  assert.ok(map?.spawn.ffa.length);
});

test("team format refuses start until sides are even", () => {
  const room = createArena({ format: "teams_2v2", level: 2, privacy: "private" });
  assert.equal(arenasPublic().some((a) => a.roomCode === room.roomCode), false);
  const p1 = joinRoom(room.roomCode, "A1", "brenna_ironveal", "u1").playerId;
  const p2 = joinRoom(room.roomCode, "A2", "quill_ashmere", "u2").playerId;
  const p3 = joinRoom(room.roomCode, "B1", "mira_softstep", "u3").playerId;
  const p4 = joinRoom(room.roomCode, "B2", "torin_emberhand", "u4").playerId;
  arenaSetTeam(room.roomCode, p1, "a");
  arenaSetTeam(room.roomCode, p2, "a");
  arenaSetTeam(room.roomCode, p3, "a");
  arenaSetTeam(room.roomCode, p4, "b");
  for (const id of [p1, p2, p3, p4]) arenaReady(room.roomCode, id);
  assert.throws(() => arenaStart(room.roomCode), /ARENA_TEAMS/);
  arenaSetTeam(room.roomCode, p3, "b");
  for (const id of [p1, p2, p3, p4]) arenaReady(room.roomCode, id);
  arenaStart(room.roomCode);
  assert.equal(publicState(room).combat?.pvp, "teams");
});

test("FFA seats are hostile to each other and scale to the room level", () => {
  const room = createArena({ format: "ffa_1v1", level: 1 });
  const a = joinRoom(room.roomCode, "One", "brenna_ironveal", "ua");
  const b = joinRoom(room.roomCode, "Two", "brenna_ironveal", "ub");
  arenaReady(room.roomCode, a.playerId);
  arenaReady(room.roomCode, b.playerId);
  arenaStart(room.roomCode);
  const c = room.combat!;
  assert.equal(c.pvp, "ffa");
  assert.ok(c.tokens.every((t) => t.teamId?.startsWith("ffa:")));
  assert.ok(c.tokens.every((t) => t.maxHp < 28));
});

test("kicking without being the host is refused", () => {
  const room = createArena({ format: "ffa_1v1", ownerUserId: "host" });
  const a = joinRoom(room.roomCode, "One", "brenna_ironveal", "ua");
  assert.throws(() => arenaKick(room.roomCode, "other", a.playerId), /ARENA_NOT_OWNER/);
});
