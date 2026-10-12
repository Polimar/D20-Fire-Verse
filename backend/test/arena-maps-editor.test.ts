import assert from "node:assert/strict";
import express from "express";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { after, test } from "node:test";
import { handleArenaArt, mountAccountRoutes, mountAdminRoutes } from "../src/local/admin-http.js";
import { createUser, login, openAuth } from "../src/local/auth.js";
import { createArena, publicState } from "../src/local/room.js";
import { publicCombat, startArenaCombat } from "../src/local/combat.js";
import { CONTENT_ROOT, REPO_ROOT } from "../src/local/paths.js";
import { customArenaId, getArenaMap } from "../src/local/arena-maps.js";
import { boot } from "./helpers.js";

const slug = `t${Date.now().toString(36)}`;
const mapId = customArenaId(slug, "small");
const jsonPath = path.join(CONTENT_ROOT, "arenas", `${mapId}.json`);
const artDir = path.join(REPO_ROOT, "tv", "public", "art", "arena", "custom");

function jpegStub(): Buffer {
  const buf = Buffer.alloc(32, 0);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[buf.length - 2] = 0xd9;
  return buf;
}

after(() => {
  if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    const file = path.join(artDir, `${mapId}.${ext}`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

test("players own custom arena maps; admins and the lobby see them", async () => {
  boot();
  openAuth();
  const aName = `mapa${slug}`;
  const bName = `mapb${slug}`;
  const owner = createUser(aName, "password", "player");
  const other = createUser(bName, "password", "player");
  const ownerSession = login(aName, "password")!;
  const otherSession = login(bName, "password")!;
  const admin = login("admin", "admin")!;

  const app = express();
  app.post("/api/admin/maps/arena/:id/art", express.raw({ type: () => true, limit: "8mb" }), handleArenaArt);
  app.post("/api/me/arena-maps/:id/art", express.raw({ type: () => true, limit: "8mb" }), handleArenaArt);
  app.use(express.json({ limit: "2mb" }));
  mountAccountRoutes(app);
  mountAdminRoutes(app);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const cookie = (token: string) => ({ cookie: `fv_session=${token}` });

  try {
    const noName = await fetch(`${base}/api/me/arena-maps`, {
      method: "POST",
      headers: { ...cookie(ownerSession.token), "content-type": "application/json" },
      body: JSON.stringify({ slug, size: "small" }),
    });
    assert.equal(noName.status, 400);

    const created = await fetch(`${base}/api/me/arena-maps`, {
      method: "POST",
      headers: { ...cookie(ownerSession.token), "content-type": "application/json" },
      body: JSON.stringify({ slug, size: "small", name: "Pit" }),
    });
    assert.equal(created.status, 200);
    const spec = (await created.json()) as {
      id: string;
      createdBy: { userId: string };
      art: string | null;
      name: string;
    };
    assert.equal(spec.id, mapId);
    assert.equal(spec.name, "Pit");
    assert.equal(spec.createdBy.userId, owner.id);
    assert.equal(spec.art, null);
    assert.equal(getArenaMap(mapId)?.theme, "brewery");

    const mine = await fetch(`${base}/api/me/arena-maps`, { headers: cookie(ownerSession.token) });
    const mineBody = (await mine.json()) as { maps: Array<{ id: string }> };
    assert.ok(mineBody.maps.some((m) => m.id === mapId));

    const mineOther = await fetch(`${base}/api/me/arena-maps`, { headers: cookie(otherSession.token) });
    const mineOtherBody = (await mineOther.json()) as { maps: Array<{ id: string }> };
    assert.ok(!mineOtherBody.maps.some((m) => m.id === mapId));

    const steal = await fetch(`${base}/api/me/arena-maps/${mapId}`, {
      method: "PUT",
      headers: { ...cookie(otherSession.token), "content-type": "application/json" },
      body: JSON.stringify({ walls: [], hazards: [] }),
    });
    assert.equal(steal.status, 403);

    const builtin = await fetch(`${base}/api/me/arena-maps/arena_brewery_small`, {
      headers: cookie(ownerSession.token),
    });
    assert.equal(builtin.status, 403);

    const lobby = await fetch(`${base}/api/arena/maps?size=small`, { headers: cookie(otherSession.token) });
    const lobbyBody = (await lobby.json()) as { maps: Array<{ id: string; createdBy: { username: string } }> };
    const listed = lobbyBody.maps.find((m) => m.id === mapId);
    assert.ok(listed);
    assert.equal(listed.createdBy.username, aName);

    const upload = await fetch(`${base}/api/me/arena-maps/${mapId}/art`, {
      method: "POST",
      headers: { ...cookie(ownerSession.token), "content-type": "image/jpeg" },
      body: new Uint8Array(jpegStub()),
    });
    assert.equal(upload.status, 200);
    const afterArt = (await upload.json()) as { art: string };
    assert.equal(afterArt.art, `/art/arena/custom/${mapId}.jpg`);
    assert.ok(fs.existsSync(path.join(artDir, `${mapId}.jpg`)));

    const adminEdit = await fetch(`${base}/api/admin/maps/arena/${mapId}`, {
      method: "PUT",
      headers: { ...cookie(admin.token), "content-type": "application/json" },
      body: JSON.stringify({ walls: [{ x: 1, y: 1, w: 1, h: 1 }], hazards: [], art: afterArt.art }),
    });
    assert.equal(adminEdit.status, 200);
    const saved = (await adminEdit.json()) as { art: string };
    assert.equal(saved.art, afterArt.art);

    const adminList = await fetch(`${base}/api/admin/maps`, { headers: cookie(admin.token) });
    const adminMaps = (await adminList.json()) as { maps: Array<{ id: string; createdBy: { username: string } | null }> };
    assert.ok(adminMaps.maps.some((m) => m.id === mapId && m.createdBy?.username === aName));
    assert.ok(adminMaps.maps.some((m) => m.id === "arena_brewery_small"));

    const mismatch = () =>
      createArena({
        ownerUserId: other.id,
        format: "ffa_1v1",
        theme: "brewery",
        mapSize: "large",
        mapId,
      });
    assert.throws(mismatch, /ARENA_BAD_SIZE/);

    const room = createArena({
      ownerUserId: other.id,
      format: "ffa_1v1",
      theme: "brewery",
      mapSize: "small",
      mapId,
    });
    const pub = publicState(room);
    assert.equal(pub.arena?.mapId, mapId);

    const map = getArenaMap(mapId)!;
    const fight = startArenaCombat({
      map,
      players: [{ playerId: "P1", characterId: "brenna_ironveal" }],
      level: 1,
      teams: false,
      pve: true,
      monsterId: "srd_goblin_minion",
    });
    assert.equal(publicCombat(fight).art, `/art/arena/custom/${mapId}.jpg`);

    const cleared = await fetch(`${base}/api/me/arena-maps/${mapId}/art`, {
      method: "DELETE",
      headers: cookie(ownerSession.token),
    });
    assert.equal(cleared.status, 200);
    const clearedBody = (await cleared.json()) as { art: string | null };
    assert.equal(clearedBody.art, null);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
