import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import { actionNeedsAuth, activeUserById, type SessionUser } from "./auth.js";
import { handleCampaignImport, mountAccountRoutes, mountAdminRoutes, requestUser } from "./admin-http.js";
import { announceScene } from "./alexa.js";
import {
  armGrace,
  claimConsole,
  consoleForKey,
  forgetConsole,
  adoptPhone,
  consoleForUser,
  getConsole,
  isConsoleId,
  isConsoleView,
  issuePairToken,
  knownConsoles,
  phoneLinked,
  redeemPairToken,
  setConsoleView,
  unlinkPhone,
  type ConsoleView,
} from "./companion-link.js";
import { listPublished } from "./catalog.js";
import { WebSocketServer, type WebSocket } from "ws";
import { loadCampaign, listPregens, getManifest, portraitForCharacter, PORTRAITS, portraitUrl } from "./campaign.js";
import {
  createCustomCharacter,
  deleteCustomCharacter,
  getChargenCatalog,
  loadChargen,
  reforgeCustomCharacter,
  renameCustomCharacter,
  rollAbilityScores,
  type ChargenDraft,
} from "./chargen.js";
import { announceTable } from "./announce.js";
import { ARENA_FORMATS } from "./arena.js";
import { ARENA_THEMES } from "./arena-maps.js";
import { listArenaMonsters } from "./srd-monsters.js";
import { ensureDataDir, REPO_ROOT } from "./paths.js";
import { audioPath, narrationStatus, prewarmNarration, waitForNarration } from "./narration.js";
import {
  choose,
  castVote,
  closeVote,
  claimPuzzle,
  releasePuzzle,
  puzzleHint,
  setPuzzleDraft,
  volunteerCheck,
  combatAttack,
  combatAim,
  combatReact,
  combatEndTurn,
  shortRest,
  longRest,
  mapMove,
  combatMove,
  withdraw,
  beginCombat,
  commitHeld,
  flushHeldRolls,
  setRollPhones,
  createArena,
  arenasPublic,
  arenaSetTeam,
  arenaReady,
  arenaPickHero,
  arenaStart,
  arenaKick,
  createRoom,
  characterIsSeated,
  getRoom,
  heroSheet,
  librarySheet,
  joinRoom,
  loadPersistedRooms,
  playerDisconnect,
  publicState,
  rejoinRoom,
  requestSave,
  resumeSave,
  retryCombat,
  roomScene,
  scriptedLines,
  setRoomMutationHook,
  voiceIntent,
  solvePuzzleSequence,
  type Room,
} from "./room.js";

const PORT = Number(process.env.PORT || 3100);
const COMPANION_DEV_PORT = Number(process.env.COMPANION_PORT || 4319);
/** How long a dropped table keeps its turn before it Dodges and passes. */
const DROP_GRACE_MS = Number(process.env.DROP_GRACE_MS || 20000);

type ClientMsg = {
  action: string;
  roomCode?: string;
  campaignId?: string;
  displayName?: string;
  characterId?: string;
  choiceId?: string;
  playerId?: string;
  x?: number;
  y?: number;
  mapX?: number;
  mapY?: number;
  abilityId?: string;
  targetId?: string;
  accept?: boolean;
  saveId?: string;
  intent?: string;
  draft?: ChargenDraft;
  sequence?: string[];
  format?: string;
  theme?: string;
  mapSize?: string;
  level?: number;
  privacy?: string;
  name?: string;
  monsterId?: string;
  teamId?: string;
  ready?: boolean;
  slot?: number;
  optionId?: string;
  puzzleDraft?: string[];
  help?: boolean;
  /** Pairing: the one-time token from the TV's QR, the phone's key, the TV's current screen. */
  token?: string;
  key?: string;
  view?: string;
  reason?: string;
  /** Trackpad deltas in phone pixels, and the mouse switch. */
  dx?: number;
  dy?: number;
  on?: boolean;
  factor?: number;
};

/** What a paired phone may do at the table, always as the hero its TV sat with. */
const PHONE_ACTIONS = new Set([
  "CHOOSE",
  "CAST_VOTE",
  "VOLUNTEER_CHECK",
  "CLAIM_PUZZLE",
  "RELEASE_PUZZLE",
  "BEGIN_COMBAT",
  "WITHDRAW",
  "PERFORM_ACTION",
  "AIM_ACTION",
  "REACT",
  "END_TURN",
  "SHORT_REST",
  "LONG_REST",
  "VOICE_INTENT",
  "ARENA_READY",
  "SET_ARENA_TEAM",
  "COMMIT_ROLL",
]);

const TABLE_VIEWS: ReadonlySet<ConsoleView> = new Set(["lobby", "story", "combat"]);

ensureDataDir();
loadCampaign();
loadChargen();
loadPersistedRooms();

const app = express();
app.disable("x-powered-by");
app.post("/api/admin/campaigns/import", express.raw({ type: () => true, limit: "32mb" }), handleCampaignImport);
app.use(express.json({ limit: "2mb" }));
mountAccountRoutes(app);
mountAdminRoutes(app);
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

const tvDist = path.join(REPO_ROOT, "tv", "dist");
const tvLocal = path.join(REPO_ROOT, "tv", "local");
const companionDist = path.join(REPO_ROOT, "companion", "dist");
const companionBuilt = fs.existsSync(path.join(companionDist, "index.html"));
app.use("/art", express.static(path.join(REPO_ROOT, "tv", "public", "art"), { maxAge: "7d" }));
if (companionBuilt) {
  app.use("/companion", express.static(companionDist));
}
if (fs.existsSync(path.join(tvDist, "index.html"))) {
  app.use(express.static(tvDist));
} else {
  app.use(express.static(tvLocal));
}

function pregenList(viewerUserId?: string | null) {
  return listPregens(viewerUserId).map((p) => ({
    id: p.id,
    name: p.name,
    summary: p.summary,
    class: p.class,
    race: p.race ?? "",
    level: p.level,
    hp: p.hp,
    ac: p.ac,
    portrait: portraitForCharacter(p.id),
    custom: p.id.startsWith("custom_"),
  }));
}

function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const addr of list ?? []) {
      if (addr.family === "IPv4" && !addr.internal) out.push(addr.address);
    }
  }
  return out;
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    mode: "local",
    campaign: getManifest().id,
    combat: true,
    pixi: fs.existsSync(path.join(tvDist, "index.html")),
    narration: narrationStatus(),
    aws: false,
  });
});

const PUBLIC_SITE = "https://www.d20fireverse.it";

/** A configured public URL is used only when it is a hostname, not a raw address on port 3100. */
function configuredPublicSite(): string {
  const raw = process.env.FIREVERSE_PUBLIC_URL?.trim();
  if (!raw) return PUBLIC_SITE;
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const ip = /^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname);
    if (ip || url.port === "3100") return PUBLIC_SITE;
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return PUBLIC_SITE;
  }
}

/** Where a phone on the same Wi-Fi can reach the companion (for the join QR code). */
app.get("/api/table-info", (req, res) => {
  const hosts = lanAddresses();
  const forwarded = String(req.headers["x-forwarded-host"] ?? "").split(",")[0]?.trim() ?? "";
  const forwardedName = forwarded.split(":")[0] ?? "";
  const forwardedLoopback = !forwardedName || forwardedName === "localhost" || forwardedName === "127.0.0.1" || forwardedName === "::1";
  if (forwarded && !forwardedLoopback) {
    const proto = String(req.headers["x-forwarded-proto"] ?? "https").split(",")[0]?.trim() === "http" ? "http" : "https";
    const publicUrl = `${proto}://${forwardedName}`;
    res.json({ hosts, companionUrl: `${publicUrl}/companion/`, publicUrl });
    return;
  }
  const hostHeader = String(req.headers.host ?? "");
  const requestHost = hostHeader.split(":")[0] || "";
  const loopback = !requestHost || requestHost === "localhost" || requestHost === "127.0.0.1" || requestHost === "::1";
  if (!loopback) {
    const publicUrl = configuredPublicSite();
    res.json({ hosts, companionUrl: `${publicUrl}/companion/`, publicUrl });
    return;
  }
  const host = hosts[0] ?? (requestHost || "127.0.0.1");
  const port = companionBuilt ? PORT : COMPANION_DEV_PORT;
  res.json({
    hosts,
    companionUrl: `http://${host}:${port}/companion/`,
  });
});

app.get("/api/pregens", (req, res) => {
  res.json(pregenList(requestUser(req)?.id));
});

app.get("/api/portraits", (_req, res) => {
  res.json(PORTRAITS.map((id) => ({ id, url: portraitUrl(id) })));
});

app.get("/api/chargen", (_req, res) => {
  res.json(getChargenCatalog());
});

app.post("/api/chargen", (req, res) => {
  try {
    const user = requestUser(req);
    if (!user) {
      res.status(401).json({ error: "AUTH_REQUIRED" });
      return;
    }
    const built = createCustomCharacter(req.body as ChargenDraft, undefined, user.id);
    pushLibrary(user.id);
    res.json(built);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "ERROR",
    });
  }
});

app.post("/api/chargen/roll", (_req, res) => {
  res.json({ scores: rollAbilityScores() });
});

function pushLibrary(userId: string): void {
  const list = pregenList(userId);
  for (const s of openSockets()) {
    if (!s.consoleId) continue;
    if (getConsole(s.consoleId)?.userId !== userId) continue;
    send(s, { eventType: "PREGENS", payload: { pregens: list } });
  }
}

app.get("/api/me/characters/:id", (req, res) => {
  const user = requestUser(req);
  if (!user) {
    res.status(401).json({ error: "AUTH_REQUIRED" });
    return;
  }
  const sheet = librarySheet(req.params.id);
  if (!sheet || !String(req.params.id).startsWith("custom_")) {
    res.status(404).json({ error: "BAD_CHARACTER" });
    return;
  }
  const owned = pregenList(user.id).some((p) => p.id === req.params.id);
  if (!owned) {
    res.status(404).json({ error: "BAD_CHARACTER" });
    return;
  }
  res.json({ sheet, seated: characterIsSeated(req.params.id) });
});

app.post("/api/characters/:id/rename", (req, res) => {
  const user = requestUser(req);
  if (!user) {
    res.status(401).json({ error: "AUTH_REQUIRED" });
    return;
  }
  try {
    renameCustomCharacter(req.params.id, user.id, String(req.body?.name ?? ""));
    pushLibrary(user.id);
    res.json({ ok: true, pregens: pregenList(user.id) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "ERROR" });
  }
});

app.post("/api/characters/:id/reforge", (req, res) => {
  const user = requestUser(req);
  if (!user) {
    res.status(401).json({ error: "AUTH_REQUIRED" });
    return;
  }
  try {
    reforgeCustomCharacter(req.params.id, user.id, req.body as ChargenDraft, undefined, characterIsSeated(req.params.id));
    pushLibrary(user.id);
    res.json({ ok: true, pregens: pregenList(user.id) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "ERROR" });
  }
});

app.delete("/api/characters/:id", (req, res) => {
  const user = requestUser(req);
  if (!user) {
    res.status(401).json({ error: "AUTH_REQUIRED" });
    return;
  }
  try {
    deleteCustomCharacter(req.params.id, user.id, characterIsSeated(req.params.id));
    pushLibrary(user.id);
    res.json({ ok: true, pregens: pregenList(user.id) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "ERROR" });
  }
});

app.post("/api/me/align", (req, res) => {
  const user = requestUser(req);
  if (!user) {
    res.status(401).json({ error: "AUTH_REQUIRED" });
    return;
  }
  const console = consoleForUser(user.id);
  if (!console) {
    res.json({ console: null });
    return;
  }
  const key = adoptPhone(console.id, consolePhones(console.id).length === 0);
  res.json({
    console: { id: console.id, view: console.view, linked: phoneLinked(console.id) },
    key,
  });
});

app.get("/api/room/:code", (req, res) => {
  const room = getRoom(req.params.code);
  if (!room) {
    res.status(404).json({ error: "ROOM_NOT_FOUND" });
    return;
  }
  res.json(publicState(room));
});

/** Timings for a narrated line; waits for the narrator if it is still speaking it into the cache. */
app.get("/api/narration/:key/meta", async (req, res) => {
  const key = req.params.key;
  if (!/^[a-f0-9]{20}$/.test(key)) {
    res.status(400).json({ error: "BAD_KEY" });
    return;
  }
  const clip = await waitForNarration(key, 25000);
  if (!clip) {
    res.status(404).json({ error: "NARRATION_UNAVAILABLE" });
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.json(clip);
});

app.get("/api/narration/:file", (req, res) => {
  const m = req.params.file.match(/^([a-f0-9]{20})\.(m4a|wav)$/);
  const file = m ? audioPath(m[1]) : null;
  if (!file) {
    res.status(404).end();
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.type(file.endsWith(".m4a") ? "audio/mp4" : "audio/wav");
  res.sendFile(file);
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

type Sock = WebSocket & {
  roomCode?: string;
  playerId?: string;
  user?: SessionUser | null;
  abilityRolls?: number[];
  alive?: boolean;
  /** A signed-in television: the id it keeps for this app session. */
  consoleId?: string;
  /** A paired phone: the console it follows. Never holds a seat of its own. */
  companionOf?: string;
};

const dropTimers = new Map<string, NodeJS.Timeout>();

function seatKey(roomCode: string, playerId: string) {
  return `${roomCode}:${playerId}`;
}

function openSockets(): Sock[] {
  return [...wss.clients].filter((c) => c.readyState === 1) as Sock[];
}

function broadcast(roomCode: string): void {
  const room = getRoom(roomCode);
  if (!room) return;
  const consoles = new Set<string>();
  for (const s of openSockets()) {
    if (s.roomCode !== roomCode) continue;
    s.send(
      JSON.stringify({
        eventType: "ROOM_STATE",
        payload: publicState(room, s.playerId, s.user?.id),
      }),
    );
    if (s.consoleId) consoles.add(s.consoleId);
  }
  for (const id of consoles) pushCompanion(id);
  announceScene(roomCode, roomScene(room));
}

setRoomMutationHook((roomCode) => broadcast(roomCode));

function send(ws: WebSocket, obj: unknown): void {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

// ------------------------------------------------------------------ the phone beside the TV

function consoleTv(consoleId: string): Sock | null {
  let tv: Sock | null = null;
  for (const s of openSockets()) if (s.consoleId === consoleId) tv = s;
  return tv;
}

function consolePhones(consoleId: string): Sock[] {
  return openSockets().filter((s) => s.companionOf === consoleId);
}

/**
 * What the phone shows: the screen its TV is on and, at a table, that table as this player sees
 * it plus the full sheet of the hero the TV sat with. Nobody else's sheet ever goes out.
 */
function companionState(consoleId: string) {
  const c = getConsole(consoleId);
  if (!c) return null;
  const tv = consoleTv(consoleId);
  const room = TABLE_VIEWS.has(c.view) && tv?.roomCode ? getRoom(tv.roomCode) : undefined;
  const playerId = room && tv?.playerId && room.players.some((p) => p.playerId === tv.playerId) ? tv.playerId : undefined;
  return {
    username: activeUserById(c.userId)?.username ?? "",
    view: c.view,
    tvOnline: tv !== null,
    room: room ? publicState(room, playerId, c.userId) : null,
    sheet: room && playerId ? heroSheet(room, playerId) : null,
  };
}

function pushCompanion(consoleId: string): void {
  const phones = consolePhones(consoleId);
  if (!phones.length) return;
  const payload = companionState(consoleId);
  if (!payload) return;
  const text = JSON.stringify({ eventType: "COMPANION_STATE", payload });
  for (const phone of phones) phone.send(text);
}

/** The TV hides its QR while a phone is linked, and shows whether that phone is awake. */
function tellTvLink(consoleId: string): void {
  const tv = consoleTv(consoleId);
  if (!tv) return;
  send(tv, {
    eventType: "COMPANION_LINK",
    payload: { linked: phoneLinked(consoleId), online: consolePhones(consoleId).length > 0 },
  });
}

type DropReason = "logout" | "title" | "tv_closed" | "signed_out" | "replaced";

function releasePhone(phone: Sock, reason: DropReason): void {
  send(phone, { eventType: "UNPAIRED", payload: { reason } });
  phone.companionOf = undefined;
  phone.user = null;
}

function dropPhone(consoleId: string, reason: DropReason): void {
  const had = unlinkPhone(consoleId);
  for (const phone of consolePhones(consoleId)) releasePhone(phone, reason);
  if (had) tellTvLink(consoleId);
}

function consoleGone(consoleId: string): void {
  dropPhone(consoleId, "tv_closed");
  forgetConsole(consoleId);
}

function attachPhone(sock: Sock, consoleId: string, key?: string): void {
  const c = getConsole(consoleId);
  const user = c ? activeUserById(c.userId) : null;
  if (!c || !user) {
    dropPhone(consoleId, "signed_out");
    throw new Error("NOT_PAIRED");
  }
  for (const other of consolePhones(consoleId)) if (other !== sock) releasePhone(other, "replaced");
  sock.companionOf = consoleId;
  sock.user = user;
  send(sock, { eventType: "PAIRED", payload: { key: key ?? null, username: user.username } });
  pushCompanion(consoleId);
  tellTvLink(consoleId);
}

/** Messages from a phone. Returns false when the message is not a phone's to handle. */
function handlePhone(sock: Sock, msg: ClientMsg): boolean {
  if (msg.action === "PAIR") {
    const { consoleId, key } = redeemPairToken(msg.token);
    const previous = consoleForKey(msg.key);
    if (previous && previous.id !== consoleId) dropPhone(previous.id, "replaced");
    attachPhone(sock, consoleId, key);
    return true;
  }
  if (msg.action === "COMPANION_RESUME") {
    const c = consoleForKey(msg.key);
    if (!c) {
      send(sock, { eventType: "UNPAIRED", payload: { reason: "expired" } });
      return true;
    }
    attachPhone(sock, c.id);
    return true;
  }
  const consoleId = sock.companionOf;
  if (!consoleId) return false;
  const tv = consoleTv(consoleId);
  switch (msg.action) {
    case "PING":
      send(sock, { eventType: "PONG", payload: { t: Date.now() } });
      return true;
    case "POINTER": {
      const clamp = (v: unknown) => Math.max(-600, Math.min(600, Number(v) || 0));
      if (tv) send(tv, { eventType: "POINTER", payload: { kind: "move", dx: clamp(msg.dx), dy: clamp(msg.dy) } });
      return true;
    }
    case "POINTER_TAP":
      if (tv) send(tv, { eventType: "POINTER", payload: { kind: "tap" } });
      return true;
    case "POINTER_PAN": {
      const clamp = (v: unknown) => Math.max(-600, Math.min(600, Number(v) || 0));
      if (tv) send(tv, { eventType: "POINTER", payload: { kind: "pan", dx: clamp(msg.dx), dy: clamp(msg.dy) } });
      return true;
    }
    case "POINTER_ZOOM": {
      const factor = Math.max(0.5, Math.min(2, Number(msg.factor) || 1));
      if (factor !== 1 && tv) send(tv, { eventType: "POINTER", payload: { kind: "zoom", factor } });
      return true;
    }
    case "POINTER_SCROLL": {
      const dy = Math.max(-800, Math.min(800, Number(msg.dy) || 0));
      if (dy && tv) send(tv, { eventType: "POINTER", payload: { kind: "scroll", dy } });
      return true;
    }
    case "POINTER_BACK":
      if (tv) send(tv, { eventType: "POINTER", payload: { kind: "back" } });
      return true;
    case "POINTER_MODE":
      if (tv) send(tv, { eventType: "POINTER", payload: { kind: msg.on ? "show" : "hide" } });
      return true;
    default:
      break;
  }
  if (!PHONE_ACTIONS.has(msg.action)) throw new Error("NOT_ALLOWED");
  const c = getConsole(consoleId);
  if (!tv?.roomCode || !c || !TABLE_VIEWS.has(c.view)) throw new Error("NO_TABLE");
  if (!tv.playerId) throw new Error("NO_SEAT");
  handle(sock, { ...msg, roomCode: tv.roomCode, playerId: tv.playerId });
  return true;
}

/** Messages only a signed-in television sends about its phone. */
function handleConsole(sock: Sock, msg: ClientMsg): boolean {
  switch (msg.action) {
    case "CONSOLE_VIEW": {
      if (!sock.consoleId) throw new Error("BAD_CONSOLE");
      if (!isConsoleView(msg.view)) throw new Error("MISSING_FIELDS");
      setConsoleView(sock.consoleId, msg.view);
      pushCompanion(sock.consoleId);
      return true;
    }
    case "PAIR_REQUEST": {
      if (!sock.consoleId) throw new Error("BAD_CONSOLE");
      if (phoneLinked(sock.consoleId)) {
        tellTvLink(sock.consoleId);
        return true;
      }
      const offer = issuePairToken(sock.consoleId);
      send(sock, { eventType: "PAIR_OFFER", payload: { ...offer, now: Date.now() } });
      return true;
    }
    case "UNPAIR":
      if (sock.consoleId) dropPhone(sock.consoleId, msg.reason === "logout" ? "logout" : "title");
      return true;
    default:
      return false;
  }
}

/** A TV message may have moved its table without a broadcast (create, rejoin, resume). */
function afterTvMessage(sock: Sock): void {
  if (sock.consoleId) pushCompanion(sock.consoleId);
  const room = sock.roomCode ? getRoom(sock.roomCode) : undefined;
  if (room) announceScene(room.roomCode, roomScene(room));
}

for (const id of knownConsoles()) armGrace(id, () => consoleGone(id));

function bind(sock: Sock, room: Room, playerId?: string): void {
  sock.roomCode = room.roomCode;
  sock.playerId = playerId;
  if (playerId) {
    const key = seatKey(room.roomCode, playerId);
    const timer = dropTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      dropTimers.delete(key);
    }
  }
  send(sock, { eventType: "SEAT", payload: { roomCode: room.roomCode, playerId: playerId ?? null } });
}

function seatStillHeld(roomCode: string, playerId: string): boolean {
  for (const client of wss.clients) {
    const s = client as Sock;
    if (s.readyState === 1 && s.roomCode === roomCode && s.playerId === playerId) return true;
  }
  return false;
}

function tableWatched(roomCode: string): boolean {
  for (const client of wss.clients) {
    const s = client as Sock;
    if (s.readyState === 1 && s.roomCode === roomCode) return true;
  }
  return false;
}

/**
 * A seat that drops for longer than the grace period Dodges its turn so the rest of the table is
 * not held hostage. When nobody at all is watching, the table is simply paused instead.
 */
function armDropTimer(roomCode: string, playerId: string) {
  const key = seatKey(roomCode, playerId);
  if (dropTimers.has(key)) return;
  dropTimers.set(
    key,
    setTimeout(() => {
      dropTimers.delete(key);
      if (seatStillHeld(roomCode, playerId) || !getRoom(roomCode)) return;
      if (!tableWatched(roomCode)) {
        armDropTimer(roomCode, playerId);
        return;
      }
      const room = playerDisconnect(roomCode, playerId);
      if (room) broadcast(room.roomCode);
    }, DROP_GRACE_MS),
  );
}

wss.on("connection", (ws, req) => {
  const sock = ws as Sock;
  sock.alive = true;
  sock.user = requestUser(req);
  const consoleId = new URL(req.url ?? "/", "http://table").searchParams.get("console");
  if (sock.user && isConsoleId(consoleId)) {
    const known = getConsole(consoleId);
    if (known && known.userId !== sock.user.id) dropPhone(consoleId, "signed_out");
    claimConsole(consoleId, sock.user.id);
    sock.consoleId = consoleId;
  }
  sock.on("pong", () => {
    sock.alive = true;
  });
  send(ws, {
    eventType: "HELLO",
    payload: {
      mode: "local",
      campaign: getManifest().title,
      campaigns: listPublished(),
      user: sock.user ? { username: sock.user.username, role: sock.user.role } : null,
      pregens: pregenList(sock.user?.id),
      portraits: PORTRAITS.map((id) => ({ id, url: portraitUrl(id) })),
      chargen: getChargenCatalog(),
      arena: {
        formats: Object.entries(ARENA_FORMATS).map(([id, v]) => ({ id, ...v })),
        themes: ARENA_THEMES,
        sizes: ["small", "medium", "large"],
        monsters: listArenaMonsters(),
      },
      narration: narrationStatus(),
    },
  });
  if (sock.consoleId) {
    tellTvLink(sock.consoleId);
    pushCompanion(sock.consoleId);
  }

  ws.on("close", () => {
    const { roomCode, playerId, consoleId: tvConsole, companionOf } = sock;
    if (tvConsole && !consoleTv(tvConsole)) {
      pushCompanion(tvConsole);
      armGrace(tvConsole, () => consoleGone(tvConsole));
    }
    if (companionOf) {
      tellTvLink(companionOf);
      const tv = consoleTv(companionOf);
      if (tv?.roomCode && tv.playerId) {
        const next = flushHeldRolls(tv.roomCode, tv.playerId);
        if (next) broadcast(next.roomCode);
      }
    }
    if (!roomCode || !playerId) return;
    armDropTimer(roomCode, playerId);
  });

  ws.on("message", (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(raw)) as ClientMsg;
    } catch {
      send(ws, { eventType: "ERROR", payload: { code: "BAD_JSON" } });
      return;
    }
    try {
      if (handlePhone(sock, msg)) return;
      if (handleConsole(sock, msg)) return;
      handle(sock, msg);
      afterTvMessage(sock);
    } catch (err) {
      const code = err instanceof Error ? err.message : "ERROR";
      console.error(`ws ${msg.action} failed: ${code}`);
      send(ws, {
        eventType: "ERROR",
        payload: {
          code,
          action: msg.action,
        },
      });
    }
  });
});

function awakeIn(roomCode: string): string[] {
  const ids: string[] = [];
  for (const s of openSockets()) {
    if (!s.consoleId || s.roomCode !== roomCode || !s.playerId) continue;
    if (consolePhones(s.consoleId).some((p) => p.readyState === 1)) ids.push(s.playerId);
  }
  return ids;
}

function handle(sock: Sock, msg: ClientMsg): void {
  if (!msg.roomCode && sock.roomCode) msg.roomCode = sock.roomCode;
  if (!msg.playerId && sock.playerId) msg.playerId = sock.playerId;
  if (msg.roomCode) setRollPhones(awakeIn(msg.roomCode));
  if (actionNeedsAuth(msg.action) && !sock.user) throw new Error("AUTH_REQUIRED");
  const pid = () => {
    const id = msg.playerId || sock.playerId;
    if (!id) throw new Error("NO_PLAYER");
    return id;
  };
  switch (msg.action) {
    case "CREATE_ROOM": {
      const room = createRoom({ campaignId: msg.campaignId, ownerUserId: sock.user!.id });
      bind(sock, room);
      send(sock, { eventType: "ROOM_STATE", payload: publicState(room, undefined, sock.user!.id) });
      return;
    }
    case "CREATE_ARENA": {
      const room = createArena({
        ownerUserId: sock.user!.id,
        format: msg.format,
        theme: msg.theme,
        mapSize: msg.mapSize,
        level: msg.level,
        privacy: msg.privacy,
        name: msg.name,
        monsterId: msg.monsterId,
      });
      bind(sock, room);
      send(sock, { eventType: "ROOM_STATE", payload: publicState(room, undefined, sock.user!.id) });
      return;
    }
    case "LIST_ARENAS": {
      send(sock, { eventType: "ARENA_LIST", payload: { arenas: arenasPublic() } });
      return;
    }
    case "JOIN_ARENA": {
      if (!msg.roomCode || !msg.characterId) throw new Error("MISSING_FIELDS");
      const { room, playerId } = joinRoom(msg.roomCode, msg.displayName || "Player", msg.characterId, sock.user!.id);
      bind(sock, room, playerId);
      broadcast(room.roomCode);
      return;
    }
    case "SET_ARENA_TEAM": {
      if (!msg.roomCode || !msg.teamId) throw new Error("MISSING_FIELDS");
      broadcast(arenaSetTeam(msg.roomCode, pid(), msg.teamId).roomCode);
      return;
    }
    case "ARENA_READY": {
      if (!msg.roomCode) throw new Error("MISSING_FIELDS");
      broadcast(arenaReady(msg.roomCode, pid(), msg.ready !== false).roomCode);
      return;
    }
    case "START_ARENA": {
      if (!msg.roomCode) throw new Error("MISSING_FIELDS");
      broadcast(arenaStart(msg.roomCode, sock.user?.id).roomCode);
      return;
    }
    case "ARENA_PICK_HERO": {
      if (!msg.roomCode || !msg.characterId) throw new Error("MISSING_FIELDS");
      broadcast(arenaPickHero(msg.roomCode, pid(), msg.characterId, sock.user?.id).roomCode);
      return;
    }
    case "ARENA_KICK": {
      if (!msg.roomCode || !msg.playerId) throw new Error("MISSING_FIELDS");
      broadcast(arenaKick(msg.roomCode, sock.user?.id, msg.playerId).roomCode);
      return;
    }
    case "CREATE_CHARACTER": {
      if (!msg.draft) throw new Error("MISSING_DRAFT");
      const rolledPool = msg.draft.method === "roll" ? sock.abilityRolls : undefined;
      const built = createCustomCharacter(msg.draft, rolledPool, sock.user!.id);
      send(sock, {
        eventType: "CHARACTER_CREATED",
        payload: {
          character: {
            id: built.id,
            name: built.name,
            summary: built.summary,
            class: built.class,
            level: built.level,
            hp: built.hp,
            ac: built.ac,
            abilities: built.abilities,
            portrait: portraitForCharacter(built.id),
            custom: true,
          },
          pregens: pregenList(sock.user!.id),
        },
      });
      return;
    }
    case "ROLL_ABILITIES": {
      const scores = rollAbilityScores();
      sock.abilityRolls = scores;
      send(sock, { eventType: "ABILITY_ROLLS", payload: { scores } });
      return;
    }
    case "JOIN_ROOM": {
      if (!msg.roomCode || !msg.characterId) throw new Error("MISSING_FIELDS");
      const { room, playerId } = joinRoom(msg.roomCode, msg.displayName || "Player", msg.characterId, sock.user!.id);
      bind(sock, room, playerId);
      broadcast(room.roomCode);
      return;
    }
    case "REJOIN": {
      if (!msg.roomCode) throw new Error("MISSING_FIELDS");
      const { room, playerId } = rejoinRoom(msg.roomCode, msg.playerId);
      bind(sock, room, playerId);
      send(sock, { eventType: "ROOM_STATE", payload: publicState(room, playerId) });
      return;
    }
    case "CHOOSE": {
      if (!msg.roomCode || !msg.choiceId) throw new Error("MISSING_FIELDS");
      broadcast(choose(msg.roomCode, msg.choiceId, msg.playerId || sock.playerId).roomCode);
      return;
    }
    case "CAST_VOTE": {
      if (!msg.roomCode || !msg.choiceId) throw new Error("MISSING_FIELDS");
      broadcast(castVote(msg.roomCode, pid(), msg.choiceId).roomCode);
      return;
    }
    case "CLOSE_VOTE": {
      if (!msg.roomCode) throw new Error("MISSING_FIELDS");
      broadcast(closeVote(msg.roomCode).roomCode);
      return;
    }
    case "VOLUNTEER_CHECK": {
      if (!msg.roomCode) throw new Error("MISSING_FIELDS");
      broadcast(volunteerCheck(msg.roomCode, pid(), !!msg.help).roomCode);
      return;
    }
    case "CLAIM_PUZZLE": {
      if (!msg.roomCode) throw new Error("MISSING_FIELDS");
      broadcast(claimPuzzle(msg.roomCode, pid()).roomCode);
      return;
    }
    case "RELEASE_PUZZLE": {
      if (!msg.roomCode) throw new Error("MISSING_FIELDS");
      broadcast(releasePuzzle(msg.roomCode, pid()).roomCode);
      return;
    }
    case "PUZZLE_HINT": {
      if (!msg.roomCode || msg.slot === undefined || !msg.optionId) throw new Error("MISSING_FIELDS");
      broadcast(puzzleHint(msg.roomCode, pid(), msg.slot, msg.optionId).roomCode);
      return;
    }
    case "PUZZLE_DRAFT": {
      if (!msg.roomCode || !msg.puzzleDraft) throw new Error("MISSING_FIELDS");
      broadcast(setPuzzleDraft(msg.roomCode, pid(), msg.puzzleDraft).roomCode);
      return;
    }
    case "SOLVE_PUZZLE": {
      if (!msg.roomCode || !msg.sequence?.length) throw new Error("MISSING_FIELDS");
      broadcast(solvePuzzleSequence(msg.roomCode, msg.sequence, msg.playerId || sock.playerId).roomCode);
      return;
    }
    case "WITHDRAW": {
      if (!msg.roomCode) throw new Error("MISSING_FIELDS");
      broadcast(withdraw(msg.roomCode).roomCode);
      return;
    }
    case "BEGIN_COMBAT": {
      if (!msg.roomCode) throw new Error("MISSING_FIELDS");
      broadcast(beginCombat(msg.roomCode).roomCode);
      return;
    }
    case "RETRY_COMBAT": {
      if (!msg.roomCode) throw new Error("MISSING_FIELDS");
      broadcast(retryCombat(msg.roomCode).roomCode);
      return;
    }
    case "MAP_MOVE": {
      if (!msg.roomCode || msg.mapX === undefined || msg.mapY === undefined) throw new Error("MISSING_FIELDS");
      broadcast(mapMove(msg.roomCode, pid(), msg.mapX, msg.mapY).roomCode);
      return;
    }
    case "PROPOSE_MOVE": {
      if (!msg.roomCode || msg.x === undefined || msg.y === undefined) throw new Error("MISSING_FIELDS");
      broadcast(combatMove(msg.roomCode, pid(), msg.x, msg.y).roomCode);
      return;
    }
    case "PERFORM_ACTION": {
      if (!msg.roomCode || !msg.abilityId) throw new Error("MISSING_FIELDS");
      const dest = msg.x !== undefined && msg.y !== undefined ? { x: msg.x, y: msg.y } : undefined;
      broadcast(combatAttack(msg.roomCode, pid(), msg.abilityId, msg.targetId, dest).roomCode);
      return;
    }
    case "COMMIT_ROLL": {
      if (!msg.roomCode) throw new Error("MISSING_FIELDS");
      const room = getRoom(msg.roomCode);
      if (!room) throw new Error("ROOM_NOT_FOUND");
      broadcast(commitHeld(room, pid()).roomCode);
      return;
    }
    case "AIM_ACTION": {
      if (!msg.roomCode || !msg.abilityId) throw new Error("MISSING_FIELDS");
      broadcast(combatAim(msg.roomCode, pid(), msg.abilityId).roomCode);
      return;
    }
    case "REACT": {
      if (!msg.roomCode || msg.accept === undefined) throw new Error("MISSING_FIELDS");
      broadcast(combatReact(msg.roomCode, pid(), msg.accept).roomCode);
      return;
    }
    case "SHORT_REST": {
      if (!msg.roomCode) throw new Error("MISSING_FIELDS");
      broadcast(shortRest(msg.roomCode).roomCode);
      return;
    }
    case "LONG_REST": {
      if (!msg.roomCode) throw new Error("MISSING_FIELDS");
      broadcast(longRest(msg.roomCode).roomCode);
      return;
    }
    case "END_TURN": {
      if (!msg.roomCode) throw new Error("MISSING_FIELDS");
      broadcast(combatEndTurn(msg.roomCode, pid()).roomCode);
      return;
    }
    case "REQUEST_SAVE": {
      if (!msg.roomCode) throw new Error("MISSING_FIELDS");
      const { room, saveId } = requestSave(msg.roomCode);
      send(sock, { eventType: "SAVE_ACK", payload: { saveId } });
      broadcast(room.roomCode);
      return;
    }
    case "RESUME_SAVE": {
      if (!msg.saveId) throw new Error("MISSING_FIELDS");
      const room = resumeSave(msg.saveId, sock.user!);
      const seat = room.players[0]?.playerId;
      bind(sock, room, seat);
      send(sock, { eventType: "ROOM_STATE", payload: publicState(room, seat) });
      return;
    }
    case "VOICE_INTENT": {
      if (!msg.roomCode || !msg.intent) throw new Error("MISSING_FIELDS");
      broadcast(voiceIntent(msg.roomCode, pid(), msg.intent).roomCode);
      return;
    }
    case "PING":
      send(sock, { eventType: "PONG", payload: { t: Date.now() } });
      return;
    default:
      send(sock, { eventType: "ERROR", payload: { code: "UNKNOWN_ACTION", action: msg.action } });
  }
}

const heartbeat = setInterval(() => {
  for (const client of wss.clients) {
    const s = client as Sock;
    if (s.alive === false) {
      s.terminate();
      continue;
    }
    s.alive = false;
    s.ping();
  }
}, 15000);
wss.on("close", () => clearInterval(heartbeat));

server.listen(PORT, "0.0.0.0", () => {
  console.log(`D20 FireVerse LOCAL server on http://0.0.0.0:${PORT}`);
  console.log(`WebSocket: ws://127.0.0.1:${PORT}/ws`);
  console.log(
    fs.existsSync(path.join(tvDist, "index.html"))
      ? "Serving tv/dist (Pixi build)"
      : "Serving tv/local (fallback HTML)",
  );
  prewarmNarration(scriptedLines());
  const withdraw = announceTable(PORT, getManifest().id);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      const exit = setTimeout(() => process.exit(0), 1500);
      withdraw(() => {
        clearTimeout(exit);
        process.exit(0);
      });
    });
  }
});
