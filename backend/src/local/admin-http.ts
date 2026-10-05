import type { Express, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  acceptFriend,
  arenaLeaderboard,
  assertAdmin,
  clearSessionCookie,
  authenticate,
  confirmRegistration,
  createUser,
  listFriends,
  listUsers,
  logout,
  registerPlayer,
  resendConfirmation,
  openAuth,
  readSessionCookie,
  requestFriend,
  sessionCookie,
  updateUser,
  userFromToken,
  type Role,
  type SessionUser,
} from "./auth.js";
import {
  artDirFor,
  draftSnapshot,
  getBuiltinMap,
  importCampaignZip,
  listBuiltinMaps,
  listCampaigns,
  listPublished,
  publishCampaign,
  saveBuiltinCampaignMap,
  unpublishCampaign,
  updateDraftEncounter,
  updateDraftNode,
} from "./catalog.js";
import type { EncounterDef, StoryNode } from "./campaign.js";
import { getArenaMap, listArenaMapFiles, saveArenaMapFile } from "./arena-maps.js";
import { compactRects, parseCellGrid, parseCellPoints } from "./map-grid.js";
import { brevoStatus, readBrevo, sendMail, writeBrevo } from "./mail.js";
import { closeRoom, getRoom, listRooms, listSaves } from "./room.js";

const page = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "admin.html"), "utf8");

function secure(req: Request): boolean {
  return req.secure || req.headers["x-forwarded-proto"] === "https";
}

export function requestUser(req: { headers: { cookie?: string | string[] | undefined } }): SessionUser | null {
  const cookie = Array.isArray(req.headers.cookie) ? req.headers.cookie.join(";") : req.headers.cookie;
  return userFromToken(readSessionCookie(cookie));
}

function fail(res: Response, err: unknown): void {
  const code = err instanceof Error ? err.message : "ERROR";
  const status = code === "AUTH_REQUIRED" ? 401 : code === "FORBIDDEN" ? 403 : 400;
  res.status(status).json({ error: code });
}

function parseCampaignSpawn(
  raw: unknown,
  width: number,
  height: number,
  current: { pcs: Array<{ x: number; y: number }>; enemies: Array<{ x: number; y: number }> },
) {
  if (raw == null || typeof raw !== "object") return current;
  const body = raw as Record<string, unknown>;
  const pcs = parseCellPoints(body.pcs, width, height);
  const enemies = parseCellPoints(body.enemies, width, height);
  if (!pcs || !enemies || pcs.length !== current.pcs.length || enemies.length !== current.enemies.length) {
    throw new Error("BAD_MAP");
  }
  return { pcs, enemies };
}

function parseArenaSpawn(
  raw: unknown,
  width: number,
  height: number,
  current: { ffa: Array<{ x: number; y: number }>; teamA: Array<{ x: number; y: number }>; teamB: Array<{ x: number; y: number }> },
) {
  if (raw == null || typeof raw !== "object") return current;
  const body = raw as Record<string, unknown>;
  const ffa = parseCellPoints(body.ffa, width, height);
  const teamA = parseCellPoints(body.teamA, width, height);
  const teamB = parseCellPoints(body.teamB, width, height);
  if (
    !ffa ||
    !teamA ||
    !teamB ||
    ffa.length !== current.ffa.length ||
    teamA.length !== current.teamA.length ||
    teamB.length !== current.teamB.length
  ) {
    throw new Error("BAD_MAP");
  }
  return { ffa, teamA, teamB };
}

function parseLabels(
  raw: unknown,
  width: number,
  height: number,
  current: Record<string, { x: number; y: number }> | undefined,
): Record<string, { x: number; y: number }> | undefined {
  if (raw == null || !current) return current;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("BAD_MAP");
  const body = raw as Record<string, unknown>;
  const out: Record<string, { x: number; y: number }> = {};
  for (const key of Object.keys(current)) {
    const pts = parseCellPoints([body[key] ?? current[key]], width, height);
    if (!pts?.[0]) throw new Error("BAD_MAP");
    out[key] = pts[0]!;
  }
  return out;
}

export function mountAccountRoutes(app: Express): void {
  openAuth();

  app.post("/api/login", (req, res) => {
    const username = String(req.body?.username ?? "");
    const password = String(req.body?.password ?? "");
    const found = authenticate(username, password);
    if (found.kind === "unconfirmed") {
      res.status(403).json({ error: "UNCONFIRMED" });
      return;
    }
    if (found.kind !== "ok") {
      res.status(401).json({ error: "BAD_LOGIN" });
      return;
    }
    res.setHeader("Set-Cookie", sessionCookie(found.token, secure(req)));
    res.json({ user: found.user });
  });

  app.post("/api/register", async (req, res) => {
    try {
      const roomCode = String(req.body?.roomCode ?? "").trim().toUpperCase();
      if (!getRoom(roomCode)) throw new Error("ROOM_NOT_FOUND");
      if (!readBrevo()) throw new Error("MAIL_NOT_CONFIGURED");
      await registerPlayer({
        username: String(req.body?.username ?? ""),
        password: String(req.body?.password ?? ""),
        email: String(req.body?.email ?? ""),
        roomCode,
      });
      res.json({ ok: true });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/register/resend", async (req, res) => {
    try {
      await resendConfirmation(String(req.body?.username ?? ""), String(req.body?.password ?? ""));
      res.json({ ok: true });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/confirm", (req, res) => {
    const token = String(req.query.token ?? "");
    const confirmed = token ? confirmRegistration(token) : null;
    if (!confirmed) {
      res.status(400).type("html").send("<p>That confirmation link is no longer valid.</p>");
      return;
    }
    res.setHeader("Set-Cookie", sessionCookie(confirmed.session, secure(req)));
    const room = confirmed.roomCode ? `?room=${encodeURIComponent(confirmed.roomCode)}` : "";
    res.redirect(302, `/companion/${room}`);
  });

  app.post("/api/logout", (req, res) => {
    logout(readSessionCookie(req.headers.cookie));
    res.setHeader("Set-Cookie", clearSessionCookie(secure(req)));
    res.json({ ok: true });
  });

  app.get("/api/me", (req, res) => {
    const user = requestUser(req);
    if (!user) {
      res.status(401).json({ error: "AUTH_REQUIRED" });
      return;
    }
    res.json({ user });
  });

  app.get("/api/friends", (req, res) => {
    const user = requestUser(req);
    if (!user) {
      res.status(401).json({ error: "AUTH_REQUIRED" });
      return;
    }
    res.json({ friends: listFriends(user.id) });
  });

  app.post("/api/friends", (req, res) => {
    const user = requestUser(req);
    if (!user) {
      res.status(401).json({ error: "AUTH_REQUIRED" });
      return;
    }
    try {
      requestFriend(user.id, String(req.body?.username ?? ""));
      res.json({ ok: true, friends: listFriends(user.id) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/friends/accept", (req, res) => {
    const user = requestUser(req);
    if (!user) {
      res.status(401).json({ error: "AUTH_REQUIRED" });
      return;
    }
    try {
      acceptFriend(user.id, String(req.body?.userId ?? ""));
      res.json({ ok: true, friends: listFriends(user.id) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/arena/leaderboard", (req, res) => {
    const user = requestUser(req);
    if (!user) {
      res.status(401).json({ error: "AUTH_REQUIRED" });
      return;
    }
    const scope = req.query.scope === "friends" ? "friends" : "global";
    res.json({ scope, rows: arenaLeaderboard(scope, user.id) });
  });

  app.get("/api/campaigns", (_req, res) => {
    res.json({ campaigns: listPublished() });
  });

  app.use("/campaigns/:id/art", (req, res, next) => {
    const dir = artDirFor(String(req.params.id));
    if (!dir) {
      next();
      return;
    }
    const rel = req.path.replace(/^\/+/, "");
    const file = path.resolve(dir, rel);
    if (!file.startsWith(path.resolve(dir)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.status(404).end();
      return;
    }
    res.sendFile(file);
  });
}

export function handleCampaignImport(req: Request, res: Response): void {
  try {
    assertAdmin(requestUser(req));
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error("BAD_ZIP");
    const draft = importCampaignZip(buf);
    res.json({ id: draft.id, title: draft.manifest.title });
  } catch (err) {
    fail(res, err);
  }
}

export function mountAdminRoutes(app: Express): void {
  app.get("/admin", (_req, res) => {
    res.type("html").send(page);
  });

  app.get("/api/admin/brevo", (req, res) => {
    try {
      assertAdmin(requestUser(req));
      res.json(brevoStatus());
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/brevo", (req, res) => {
    try {
      assertAdmin(requestUser(req));
      writeBrevo({
        apiKey: String(req.body?.apiKey ?? ""),
        senderEmail: String(req.body?.senderEmail ?? ""),
        senderName: String(req.body?.senderName ?? ""),
      });
      res.json(brevoStatus());
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/brevo/test", async (req, res) => {
    try {
      assertAdmin(requestUser(req));
      const cfg = readBrevo();
      if (!cfg) throw new Error("MAIL_NOT_CONFIGURED");
      const to = String(req.body?.to ?? cfg.senderEmail);
      await sendMail(to, "D20 FireVerse mail test", "<p>Brevo is configured. This is the only kind of mail the table sends, and only when someone creates an account.</p>");
      res.json({ ok: true });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/admin/users", (req, res) => {
    try {
      assertAdmin(requestUser(req));
      res.json({ users: listUsers() });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/users", (req, res) => {
    try {
      assertAdmin(requestUser(req));
      const role = (req.body?.role === "admin" ? "admin" : "player") as Role;
      res.json({ user: createUser(String(req.body?.username ?? ""), String(req.body?.password ?? ""), role) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/users/:id", (req, res) => {
    try {
      assertAdmin(requestUser(req));
      const patch: { password?: string; role?: Role; disabled?: boolean } = {};
      if (typeof req.body?.password === "string" && req.body.password) patch.password = req.body.password;
      if (req.body?.role === "admin" || req.body?.role === "player") patch.role = req.body.role;
      if (typeof req.body?.disabled === "boolean") patch.disabled = req.body.disabled;
      res.json({ user: updateUser(String(req.params.id), patch) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/admin/rooms", (req, res) => {
    try {
      assertAdmin(requestUser(req));
      res.json({ rooms: listRooms() });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/rooms/:code/close", (req, res) => {
    try {
      assertAdmin(requestUser(req));
      closeRoom(String(req.params.code));
      res.json({ ok: true });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/admin/saves", (req, res) => {
    try {
      assertAdmin(requestUser(req));
      res.json({ saves: listSaves() });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/admin/campaigns", (req, res) => {
    try {
      assertAdmin(requestUser(req));
      res.json({ campaigns: listCampaigns() });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/admin/campaigns/:id", (req, res) => {
    try {
      assertAdmin(requestUser(req));
      const draft = draftSnapshot(String(req.params.id));
      res.json({
        id: draft.id,
        manifest: draft.manifest,
        nodes: Object.values(draft.nodes).map((n) => ({ id: n.id, type: n.type })),
        encounters: Object.values(draft.encounters).map((e) => ({ id: e.id, name: e.name })),
      });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/admin/campaigns/:id/nodes/:nodeId", (req, res) => {
    try {
      assertAdmin(requestUser(req));
      const draft = draftSnapshot(String(req.params.id));
      const node = draft.nodes[String(req.params.nodeId)];
      if (!node) {
        res.status(404).json({ error: "BAD_NODE" });
        return;
      }
      const encounter = node.encounterId ? draft.encounters[node.encounterId] : undefined;
      res.json({ node, encounter: encounter ?? null });
    } catch (err) {
      fail(res, err);
    }
  });

  app.put("/api/admin/campaigns/:id/nodes/:nodeId", (req, res) => {
    try {
      assertAdmin(requestUser(req));
      const node = req.body?.node as StoryNode;
      if (!node || node.id !== req.params.nodeId) throw new Error("BAD_NODE");
      updateDraftNode(String(req.params.id), node);
      if (req.body?.encounter) updateDraftEncounter(String(req.params.id), req.body.encounter as EncounterDef);
      res.json({ ok: true });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/campaigns/:id/publish", (req, res) => {
    try {
      assertAdmin(requestUser(req));
      const snap = publishCampaign(String(req.params.id));
      res.json({ id: snap.id, version: snap.version });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/campaigns/:id/unpublish", (req, res) => {
    try {
      assertAdmin(requestUser(req));
      unpublishCampaign(String(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/admin/maps", (req, res) => {
    try {
      assertAdmin(requestUser(req));
      const campaign = listBuiltinMaps().map((m) => ({
        source: "campaign" as const,
        id: m.id,
        name: m.name,
        width: m.width,
        height: m.height,
      }));
      const arenas = listArenaMapFiles().map((m) => ({
        source: "arena" as const,
        id: m.id,
        name: m.name,
        width: m.width,
        height: m.height,
      }));
      res.json({ maps: [...campaign, ...arenas] });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/admin/maps/:source/:id", (req, res) => {
    try {
      assertAdmin(requestUser(req));
      const source = String(req.params.source);
      const id = String(req.params.id);
      if (source === "campaign") {
        const map = getBuiltinMap(id);
        if (!map) throw new Error("BAD_MAP");
        res.json({
          source,
          id: map.id,
          name: map.name,
          width: map.width,
          height: map.height,
          walls: map.walls,
          hazards: map.hazards ?? [],
          spawn: map.spawn,
          labels: map.labels ?? null,
          art: null,
        });
        return;
      }
      if (source === "arena") {
        const map = getArenaMap(id);
        if (!map) throw new Error("BAD_MAP");
        const art = map.art?.startsWith("/") ? map.art : `/art/arena/${map.theme}-${map.size}.png`;
        res.json({
          source,
          id: map.id,
          name: map.name,
          width: map.width,
          height: map.height,
          walls: map.walls,
          hazards: map.hazards ?? [],
          spawn: map.spawn,
          art,
        });
        return;
      }
      throw new Error("BAD_MAP");
    } catch (err) {
      fail(res, err);
    }
  });

  app.put("/api/admin/maps/:source/:id", (req, res) => {
    try {
      assertAdmin(requestUser(req));
      const source = String(req.params.source);
      const id = String(req.params.id);
      const current =
        source === "campaign" ? getBuiltinMap(id) : source === "arena" ? getArenaMap(id) : undefined;
      if (!current) throw new Error("BAD_MAP");
      const wallsGrid = parseCellGrid(req.body?.walls, current.width, current.height);
      const hazardGrid = parseCellGrid(req.body?.hazards ?? [], current.width, current.height);
      if (!wallsGrid || !hazardGrid) throw new Error("BAD_MAP");
      for (let y = 0; y < current.height; y += 1) {
        for (let x = 0; x < current.width; x += 1) {
          if (wallsGrid[y]![x]) hazardGrid[y]![x] = false;
        }
      }
      const walls = compactRects(wallsGrid);
      const hazards = compactRects(hazardGrid);
      const saved =
        source === "campaign"
          ? (() => {
              const camp = getBuiltinMap(id)!;
              return saveBuiltinCampaignMap(
                id,
                walls,
                hazards,
                parseCampaignSpawn(req.body?.spawn, camp.width, camp.height, camp.spawn),
                parseLabels(req.body?.labels, camp.width, camp.height, camp.labels),
              );
            })()
          : saveArenaMapFile(
              id,
              walls,
              hazards,
              parseArenaSpawn(
                req.body?.spawn,
                current.width,
                current.height,
                current.spawn as {
                  ffa: Array<{ x: number; y: number }>;
                  teamA: Array<{ x: number; y: number }>;
                  teamB: Array<{ x: number; y: number }>;
                },
              ),
            );
      res.json({
        source,
        id: saved.id,
        name: saved.name,
        width: saved.width,
        height: saved.height,
        walls: saved.walls,
        hazards: saved.hazards ?? [],
        spawn: saved.spawn,
        labels: "labels" in saved ? ((saved as { labels?: Record<string, { x: number; y: number }> }).labels ?? null) : null,
      });
    } catch (err) {
      fail(res, err);
    }
  });
}
