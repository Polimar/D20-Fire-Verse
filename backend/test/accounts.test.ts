import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import express from "express";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { actionNeedsAuth, createUser, login, openAuth } from "../src/local/auth.js";
import { handleCampaignImport, mountAccountRoutes, mountAdminRoutes } from "../src/local/admin-http.js";
import { mountAdminPortalRoutes } from "../src/local/admin-portal-http.js";
import {
  importCampaignZip,
  publishCampaign,
  updateDraftNode,
} from "../src/local/catalog.js";
import { createRoom, joinRoom, publicState } from "../src/local/room.js";
import { boot } from "./helpers.js";

test("admin can sign in, a bad password cannot, and a player cannot manage users", async () => {
  boot();
  openAuth();
  assert.equal(actionNeedsAuth("CREATE_ROOM"), true);
  assert.equal(actionNeedsAuth("JOIN_ROOM"), true);
  assert.equal(actionNeedsAuth("PING"), false);
  assert.equal(login("admin", "nope"), null);
  const admin = login("admin", "admin");
  assert.ok(admin);
  assert.equal(admin.user.role, "admin");
  const player = createUser("ada", "password", "player");
  const playerSession = login("ada", "password");
  assert.equal(playerSession?.user.id, player.id);

  const app = express();
  app.post("/api/admin/campaigns/import", express.raw({ type: () => true, limit: "2mb" }), handleCampaignImport);
  app.use(express.json());
  mountAccountRoutes(app);
  mountAdminPortalRoutes(app);
  mountAdminRoutes(app);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  try {
    const denied = await fetch(`${base}/api/admin/users`);
    assert.equal(denied.status, 401);
    const asPlayer = await fetch(`${base}/api/admin/users`, {
      headers: { cookie: `fv_session=${playerSession!.token}` },
    });
    assert.equal(asPlayer.status, 403);
    const asAdmin = await fetch(`${base}/api/admin/users`, {
      headers: { cookie: `fv_session=${admin.token}` },
    });
    assert.equal(asAdmin.status, 200);
    const body = (await asAdmin.json()) as { rows: Array<{ username: string }>; total: number };
    assert.ok(body.rows.some((u) => u.username === "admin"));

    const call = (method: string, url: string, json?: unknown) =>
      fetch(`${base}${url}`, {
        method,
        headers: { cookie: `fv_session=${admin.token}`, "content-type": "application/json" },
        ...(json === undefined ? {} : { body: JSON.stringify(json) }),
      });
    const found = (await (await call("GET", "/api/admin/users?q=ada")).json()) as { rows: Array<{ id: string }>; total: number };
    assert.equal(found.total, 1);
    assert.equal(found.rows[0]?.id, player.id);

    const demote = await call("PATCH", `/api/admin/users/${admin.user.id}`, { role: "player" });
    assert.equal(demote.status, 400);
    assert.match(((await demote.json()) as { error: string }).error, /SELF_LOCKOUT|LAST_ADMIN/);

    const clear = await call("POST", "/api/admin/saves/clear", { confirm: "DELETE 999" });
    assert.equal(clear.status, 400);
    assert.match(((await clear.json()) as { error: string }).error, /^CONFIRM_MISMATCH:\d+$/);

    assert.equal((await call("DELETE", `/api/admin/users/${player.id}`)).status, 200);
    assert.equal(login("ada", "password"), null);
    const log = (await (await call("GET", "/api/admin/activity?q=user.delete")).json()) as { rows: Array<{ action: string; target: string; by: string }> };
    assert.deepEqual(
      log.rows.map((r) => [r.action, r.target, r.by]),
      [["user.delete", player.id, "admin"]],
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("the same account cannot take two seats", () => {
  boot();
  const room = createRoom({ ownerUserId: "user_host" });
  joinRoom(room.roomCode, "Brenna", "brenna_ironveal", "user_ada");
  assert.throws(() => joinRoom(room.roomCode, "Quill", "quill_ashmere", "user_ada"), /ALREADY_SEATED/);
});

test("a published campaign is pinned on open tables", () => {
  boot();
  const zip = zipOf({
    "manifest.json": JSON.stringify({
      id: "pin-brew",
      title: "Pin Brew",
      startNodeId: "start",
      pregenIds: [],
    }),
    "nodes/story.json": JSON.stringify({
      start: {
        id: "start",
        type: "story",
        narration: { text: "First telling." },
        choices: [{ id: "go", label: "Stay", next: "start" }],
      },
    }),
    "maps/maps.json": "{}",
    "encounters/encounters.json": "{}",
    "monsters.json": "{}",
  });
  assert.throws(() => importCampaignZip(Buffer.from("not a zip")), /BAD_ZIP/);
  const draft = importCampaignZip(zip);
  publishCampaign(draft.id);
  const open = createRoom({ campaignId: "pin-brew" });
  assert.equal(open.campaignVersion, 1);
  assert.equal(publicState(open).choices[0]?.label, "Stay");
  updateDraftNode("pin-brew", {
    id: "start",
    type: "story",
    narration: { text: "Second telling." },
    choices: [{ id: "go", label: "Leave", next: "start" }],
  });
  publishCampaign("pin-brew");
  assert.equal(publicState(open).choices[0]?.label, "Stay");
  const fresh = createRoom({ campaignId: "pin-brew" });
  assert.equal(fresh.campaignVersion, 2);
  assert.equal(publicState(fresh).choices[0]?.label, "Leave");
});

function zipOf(files: Record<string, string>): Buffer {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fv-zip-"));
  for (const [name, body] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
  const out = path.join(dir, "pack.zip");
  const run = spawnSync("python3", ["-c", "import zipfile,sys,os\nroot,out=sys.argv[1],sys.argv[2]\nz=zipfile.ZipFile(out,'w')\nfor base, dirs, files in os.walk(root):\n  for f in files:\n    p=os.path.join(base,f)\n    if p==out: continue\n    z.write(p, os.path.relpath(p, root))\n", dir, out], { encoding: "utf8" });
  if (run.status !== 0) throw new Error(run.stderr || "zip failed");
  return fs.readFileSync(out);
}
