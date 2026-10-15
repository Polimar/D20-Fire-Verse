import type { Express, Request, Response } from "express";
import { randomBytes } from "node:crypto";
import {
  acceptFriend,
  arenaLeaderboard,
  assertAdmin,
  clearSessionCookie,
  authenticate,
  confirmRegistration,
  listFriends,
  logout,
  registerPlayer,
  resendConfirmation,
  openAuth,
  readSessionCookie,
  requestFriend,
  sessionCookie,
  signInWithAmazon,
  userFromToken,
  type SessionUser,
} from "./auth.js";
import { archiveV1Once } from "./hero.js";
import {
  amazonEnabled,
  amazonStatus,
  authorizeUrl,
  clearAmazon,
  exchangeCode,
  probeAmazon,
  readAmazon,
  verifyAccessToken,
  writeAmazon,
} from "./amazon.js";
import {
  getBuiltinMap,
  importCampaignZip,
  listBuiltinMaps,
  listPublished,
  publishCampaign,
  saveBuiltinCampaignMap,
  unpublishCampaign,
} from "./catalog.js";
import {
  ARENA_THEMES,
  assertCanEditArenaMap,
  clearArenaMapArt,
  createArenaMapFile,
  deleteArenaMapFile,
  ensureArenaMapFile,
  getArenaMap,
  listAdminArenaMaps,
  listCustomArenaMaps,
  listMyArenaMaps,
  publicCustomMap,
  saveArenaMapArt,
  saveArenaMapFile,
} from "./arena-maps.js";
import { isArenaSize, isArenaTheme } from "./arena.js";
import { compactRects, parseCellGrid, parseCellPoints } from "./map-grid.js";
import { brevoStatus, readBrevo, sendMail, writeBrevo } from "./mail.js";
import { recordEvent } from "./events.js";
import { closeRoom, getRoom } from "./room.js";

function secure(req: Request): boolean {
  return req.secure || req.headers["x-forwarded-proto"] === "https";
}

export function requestUser(req: { headers: { cookie?: string | string[] | undefined } }): SessionUser | null {
  const cookie = Array.isArray(req.headers.cookie) ? req.headers.cookie.join(";") : req.headers.cookie;
  return userFromToken(readSessionCookie(cookie));
}

const LWA_STATE_COOKIE = "fv_lwa_state";
const PUBLIC_AMAZON_CALLBACK = "https://www.d20fireverse.it/api/login/amazon/callback";

/** Must match an Allowed Return URL of the Amazon security profile exactly. */
function amazonRedirectUri(): string {
  return process.env.AMAZON_REDIRECT_URI?.trim() || PUBLIC_AMAZON_CALLBACK;
}

function safeNext(raw: unknown): string {
  const s = String(raw ?? "").split("?")[0];
  if (s.includes("//") || s.includes("\\")) return "/";
  if (s.startsWith("/companion")) return s.slice(0, 200);
  if (s === "/forge" || s.startsWith("/forge/")) return s.slice(0, 200);
  return "/";
}

function lwaNextCookie(value: string, secureCookie: boolean, maxAge = 600): string {
  const bits = [`fv_lwa_next=${encodeURIComponent(value)}`, "HttpOnly", "Path=/api/login/amazon", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (secureCookie) bits.push("Secure");
  return bits.join("; ");
}

function lwaStateCookie(value: string, secureCookie: boolean, maxAge = 600): string {
  const bits = [`${LWA_STATE_COOKIE}=${value}`, "HttpOnly", "Path=/api/login/amazon", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (secureCookie) bits.push("Secure");
  return bits.join("; ");
}

function readCookie(header: string | undefined, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function fail(res: Response, err: unknown): void {
  const code = err instanceof Error ? err.message : "ERROR";
  const status = code === "AUTH_REQUIRED" ? 401 : code === "FORBIDDEN" ? 403 : 400;
  res.status(status).json({ error: code });
}

/** Same trail as the portal routes: the Activity page lists every admin write. */
function audit(actor: SessionUser, action: string, target: string, detail: Record<string, unknown> = {}): void {
  recordEvent(actor.id, null, "admin", { action, target, by: actor.username, ...detail });
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

function needUser(req: Request): SessionUser {
  const user = requestUser(req);
  if (!user) throw new Error("AUTH_REQUIRED");
  if (user.disabled) throw new Error("FORBIDDEN");
  return user;
}

function arenaListRow(map: { id: string; name: string; width: number; height: number; size?: string; theme?: string; createdBy?: { userId: string; username: string } }) {
  return {
    source: "arena" as const,
    id: map.id,
    name: map.name,
    width: map.width,
    height: map.height,
    size: map.size,
    theme: map.theme,
    createdBy: map.createdBy ? { username: map.createdBy.username, userId: map.createdBy.userId } : null,
  };
}

function arenaPaintJson(map: NonNullable<ReturnType<typeof getArenaMap>>) {
  const art = map.art?.startsWith("/") ? map.art : map.art ? map.art : null;
  return {
    source: "arena" as const,
    id: map.id,
    name: map.name,
    width: map.width,
    height: map.height,
    walls: map.walls,
    hazards: map.hazards ?? [],
    spawn: map.spawn,
    art: art || null,
    createdBy: map.createdBy ?? null,
  };
}

function requireOwnedCustom(id: string, user: SessionUser, adminBypass: boolean) {
  const map = getArenaMap(id);
  if (!map?.createdBy) throw new Error("FORBIDDEN");
  assertCanEditArenaMap(map, user, adminBypass);
  return map;
}

function paintArenaMap(id: string, body: Record<string, unknown> | undefined, user: SessionUser, adminBypass: boolean) {
  const current = adminBypass ? (isBuiltinId(id) ? ensureArenaMapFile(id) : getArenaMap(id)) : requireOwnedCustom(id, user, false);
  if (!current) throw new Error("BAD_MAP");
  if (adminBypass) assertCanEditArenaMap(current, user, true);
  const wallsGrid = parseCellGrid(body?.walls, current.width, current.height);
  const hazardGrid = parseCellGrid(body?.hazards ?? [], current.width, current.height);
  if (!wallsGrid || !hazardGrid) throw new Error("BAD_MAP");
  for (let y = 0; y < current.height; y += 1) {
    for (let x = 0; x < current.width; x += 1) {
      if (wallsGrid[y]![x]) hazardGrid[y]![x] = false;
    }
  }
  const art = typeof body?.art === "string" ? body.art : undefined;
  return saveArenaMapFile(
    id,
    compactRects(wallsGrid),
    compactRects(hazardGrid),
    parseArenaSpawn(body?.spawn, current.width, current.height, current.spawn),
    art,
  );
}

function isBuiltinId(id: string): boolean {
  return ARENA_THEMES.some((t) => id === `arena_${t.id}_small` || id === `arena_${t.id}_medium` || id === `arena_${t.id}_large`);
}

export function handleArenaArt(req: Request, res: Response): void {
  try {
    const user = needUser(req);
    const id = String(req.params.id);
    const adminPath = req.path.includes("/api/admin/");
    if (adminPath) {
      const map = isBuiltinId(id) ? ensureArenaMapFile(id) : getArenaMap(id);
      if (!map) throw new Error("BAD_MAP");
      assertCanEditArenaMap(map, user, true);
    } else {
      requireOwnedCustom(id, user, false);
    }
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? []);
    const mime = String(req.headers["content-type"] ?? "");
    const out = arenaPaintJson(saveArenaMapArt(id, buf, mime));
    if (adminPath) audit(user, "map.art.upload", `arena/${id}`, { bytes: buf.length });
    res.json(out);
  } catch (err) {
    fail(res, err);
  }
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
  archiveV1Once();

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

  app.get("/api/auth/options", (_req, res) => {
    res.json({ amazon: amazonEnabled() });
  });

  /** The Fire TV app signs in with the LWA SDK and hands the access token to the page, which posts it here. */
  app.post("/api/login/amazon", async (req, res) => {
    try {
      const profile = await verifyAccessToken(req.body?.accessToken);
      const found = signInWithAmazon(profile);
      res.setHeader("Set-Cookie", sessionCookie(found.token, secure(req)));
      res.json({ user: found.user });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/login/amazon/start", (req, res) => {
    try {
      const state = randomBytes(18).toString("base64url");
      const url = authorizeUrl(amazonRedirectUri(), state);
      const next = safeNext(req.query.next);
      res.setHeader("Set-Cookie", [lwaStateCookie(state, secure(req)), lwaNextCookie(next, secure(req))]);
      res.redirect(302, url);
    } catch (err) {
      res.redirect(302, `/?login_error=${encodeURIComponent(err instanceof Error ? err.message : "AMAZON_FAILED")}`);
    }
  });

  app.get("/api/login/amazon/callback", async (req, res) => {
    const expected = readCookie(req.headers.cookie, LWA_STATE_COOKIE);
    const state = String(req.query.state ?? "");
    const code = String(req.query.code ?? "");
    const clearState = lwaStateCookie("", secure(req), 0);
    try {
      if (req.query.error) throw new Error("AMAZON_CANCELLED");
      if (!expected || !state || state !== expected || !code) throw new Error("AMAZON_FAILED");
      const accessToken = await exchangeCode(code, amazonRedirectUri());
      const found = signInWithAmazon(await verifyAccessToken(accessToken));
      const next = safeNext(readCookie(req.headers.cookie, "fv_lwa_next"));
      res.setHeader("Set-Cookie", [clearState, lwaNextCookie("", secure(req), 0), sessionCookie(found.token, secure(req))]);
      res.redirect(302, next);
    } catch (err) {
      res.setHeader("Set-Cookie", clearState);
      res.redirect(302, `/?login_error=${encodeURIComponent(err instanceof Error ? err.message : "AMAZON_FAILED")}`);
    }
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

  app.get("/api/arena/maps", (req, res) => {
    try {
      needUser(req);
      const sizeRaw = String(req.query.size ?? "");
      const size = isArenaSize(sizeRaw) ? sizeRaw : undefined;
      res.json({ maps: listCustomArenaMaps(size).map(publicCustomMap) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/me/arena-maps", (req, res) => {
    try {
      const user = needUser(req);
      res.json({ maps: listMyArenaMaps(user.id).map(arenaListRow) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/me/arena-maps", (req, res) => {
    try {
      const user = needUser(req);
      const size = String(req.body?.size ?? "");
      const themeRaw = String(req.body?.theme ?? "brewery");
      if (!isArenaSize(size)) throw new Error("BAD_MAP");
      if (themeRaw && !isArenaTheme(themeRaw)) throw new Error("ARENA_BAD_THEME");
      const map = createArenaMapFile({
        slug: String(req.body?.slug ?? ""),
        size,
        theme: isArenaTheme(themeRaw) ? themeRaw : "brewery",
        name: String(req.body?.name ?? ""),
        owner: { userId: user.id, username: user.username },
      });
      res.json(arenaPaintJson(map));
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/me/arena-maps/:id", (req, res) => {
    try {
      const user = needUser(req);
      const map = requireOwnedCustom(String(req.params.id), user, false);
      res.json(arenaPaintJson(map));
    } catch (err) {
      fail(res, err);
    }
  });

  app.put("/api/me/arena-maps/:id", (req, res) => {
    try {
      const user = needUser(req);
      const saved = paintArenaMap(String(req.params.id), req.body, user, false);
      res.json(arenaPaintJson(saved));
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/me/arena-maps/:id/art", (req, res) => {
    try {
      const user = needUser(req);
      requireOwnedCustom(String(req.params.id), user, false);
      res.json(arenaPaintJson(clearArenaMapArt(String(req.params.id))));
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/campaigns", (_req, res) => {
    res.json({ campaigns: listPublished() });
  });

}

export function handleCampaignImport(req: Request, res: Response): void {
  try {
    const actor = assertAdmin(requestUser(req));
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error("BAD_ZIP");
    const draft = importCampaignZip(buf);
    audit(actor, "campaign.import", draft.id, { bytes: buf.length });
    res.json({ id: draft.id, title: draft.manifest.title });
  } catch (err) {
    fail(res, err);
  }
}

export function mountAdminRoutes(app: Express): void {
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
      const actor = assertAdmin(requestUser(req));
      writeBrevo({
        apiKey: String(req.body?.apiKey ?? ""),
        senderEmail: String(req.body?.senderEmail ?? ""),
        senderName: String(req.body?.senderName ?? ""),
      });
      audit(actor, "settings.mail", "brevo", { keyChanged: Boolean(String(req.body?.apiKey ?? "").trim()) });
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

  app.get("/api/admin/amazon", (req, res) => {
    try {
      assertAdmin(requestUser(req));
      res.json(amazonStatus());
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/amazon/test", async (req, res) => {
    try {
      assertAdmin(requestUser(req));
      const typedSecret = String(req.body?.clientSecret ?? "").trim();
      const report = await probeAmazon({
        clientId: String(req.body?.clientId ?? ""),
        clientSecret: typedSecret || readAmazon()?.clientSecret || "",
        redirectUri: amazonRedirectUri(),
      });
      res.json(report);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/amazon", (req, res) => {
    try {
      const actor = assertAdmin(requestUser(req));
      if (req.body?.off === true) clearAmazon();
      else {
        writeAmazon({
          clientId: String(req.body?.clientId ?? ""),
          clientSecret: String(req.body?.clientSecret ?? ""),
        });
      }
      audit(actor, req.body?.off === true ? "settings.amazon.off" : "settings.amazon", "login-with-amazon");
      res.json(amazonStatus());
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/rooms/:code/close", (req, res) => {
    try {
      const actor = assertAdmin(requestUser(req));
      closeRoom(String(req.params.code));
      audit(actor, "room.close", String(req.params.code));
      res.json({ ok: true });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/campaigns/:id/publish", (req, res) => {
    try {
      const actor = assertAdmin(requestUser(req));
      const snap = publishCampaign(String(req.params.id));
      audit(actor, "campaign.publish", snap.id, { version: snap.version });
      res.json({ id: snap.id, version: snap.version });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/campaigns/:id/unpublish", (req, res) => {
    try {
      const actor = assertAdmin(requestUser(req));
      unpublishCampaign(String(req.params.id));
      audit(actor, "campaign.unpublish", String(req.params.id));
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
      const arenas = listAdminArenaMaps().map((m) => arenaListRow(m));
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
        const map = isBuiltinId(id) ? ensureArenaMapFile(id) : getArenaMap(id);
        if (!map) throw new Error("BAD_MAP");
        res.json(arenaPaintJson(map));
        return;
      }
      throw new Error("BAD_MAP");
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/maps", (req, res) => {
    try {
      const user = assertAdmin(requestUser(req));
      if (req.body?.source !== "arena") throw new Error("BAD_MAP");
      const size = String(req.body?.size ?? "");
      const themeRaw = String(req.body?.theme ?? "brewery");
      if (!isArenaSize(size)) throw new Error("BAD_MAP");
      if (themeRaw && !isArenaTheme(themeRaw)) throw new Error("ARENA_BAD_THEME");
      const map = createArenaMapFile({
        slug: String(req.body?.slug ?? ""),
        size,
        theme: isArenaTheme(themeRaw) ? themeRaw : "brewery",
        name: String(req.body?.name ?? ""),
        owner: { userId: user.id, username: user.username },
      });
      audit(user, "map.create", `arena/${map.id}`, { size, theme: map.theme });
      res.json(arenaPaintJson(map));
    } catch (err) {
      fail(res, err);
    }
  });

  app.put("/api/admin/maps/:source/:id", (req, res) => {
    try {
      const user = assertAdmin(requestUser(req));
      const source = String(req.params.source);
      const id = String(req.params.id);
      if (source === "campaign") {
        const current = getBuiltinMap(id);
        if (!current) throw new Error("BAD_MAP");
        const wallsGrid = parseCellGrid(req.body?.walls, current.width, current.height);
        const hazardGrid = parseCellGrid(req.body?.hazards ?? [], current.width, current.height);
        if (!wallsGrid || !hazardGrid) throw new Error("BAD_MAP");
        for (let y = 0; y < current.height; y += 1) {
          for (let x = 0; x < current.width; x += 1) {
            if (wallsGrid[y]![x]) hazardGrid[y]![x] = false;
          }
        }
        const camp = getBuiltinMap(id)!;
        const saved = saveBuiltinCampaignMap(
          id,
          compactRects(wallsGrid),
          compactRects(hazardGrid),
          parseCampaignSpawn(req.body?.spawn, camp.width, camp.height, camp.spawn),
          parseLabels(req.body?.labels, camp.width, camp.height, camp.labels),
        );
        audit(user, "map.save", `campaign/${id}`);
        res.json({
          source,
          id: saved.id,
          name: saved.name,
          width: saved.width,
          height: saved.height,
          walls: saved.walls,
          hazards: saved.hazards ?? [],
          spawn: saved.spawn,
          labels: saved.labels ?? null,
        });
        return;
      }
      if (source !== "arena") throw new Error("BAD_MAP");
      const out = arenaPaintJson(paintArenaMap(id, req.body, user, true));
      audit(user, "map.save", `arena/${id}`);
      res.json(out);
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/admin/maps/:source/:id/art", (req, res) => {
    try {
      const user = assertAdmin(requestUser(req));
      const id = String(req.params.id);
      if (String(req.params.source) !== "arena") throw new Error("BAD_MAP");
      const map = isBuiltinId(id) ? ensureArenaMapFile(id) : getArenaMap(id);
      if (!map) throw new Error("BAD_MAP");
      assertCanEditArenaMap(map, user, true);
      const out = arenaPaintJson(clearArenaMapArt(id));
      audit(user, "map.art.clear", `arena/${id}`);
      res.json(out);
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/admin/maps/arena/:id", (req, res) => {
    try {
      const user = assertAdmin(requestUser(req));
      const id = String(req.params.id);
      const before = isBuiltinId(id) ? null : getArenaMap(id);
      const outcome = deleteArenaMapFile(id);
      audit(user, outcome === "reset" ? "map.reset" : "map.delete", `arena/${id}`, { name: before?.name, createdBy: before?.createdBy?.username });
      res.json({ outcome });
    } catch (err) {
      fail(res, err);
    }
  });
}
