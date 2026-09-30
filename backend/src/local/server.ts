import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import { actionNeedsAuth, type SessionUser } from "./auth.js";
import { handleCampaignImport, mountAccountRoutes, mountAdminRoutes, requestUser } from "./admin-http.js";
import { listPublished } from "./catalog.js";
import { WebSocketServer, type WebSocket } from "ws";
import { loadCampaign, listPregens, getManifest, portraitForCharacter, PORTRAITS, portraitUrl } from "./campaign.js";
import {
  createCustomCharacter,
  getChargenCatalog,
  loadChargen,
  rollAbilityScores,
  type ChargenDraft,
} from "./chargen.js";
import { announceTable } from "./announce.js";
import { ARENA_FORMATS } from "./arena.js";
import { ARENA_THEMES } from "./arena-maps.js";
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
  createArena,
  arenasPublic,
  arenaSetTeam,
  arenaReady,
  arenaPickHero,
  arenaStart,
  arenaKick,
  createRoom,
  getRoom,
  joinRoom,
  loadPersistedRooms,
  playerDisconnect,
  publicState,
  rejoinRoom,
  requestSave,
  resumeSave,
  retryCombat,
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
  teamId?: string;
  ready?: boolean;
  slot?: number;
  optionId?: string;
  puzzleDraft?: string[];
  help?: boolean;
};

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
};

const dropTimers = new Map<string, NodeJS.Timeout>();

function seatKey(roomCode: string, playerId: string) {
  return `${roomCode}:${playerId}`;
}

function broadcast(roomCode: string): void {
  const room = getRoom(roomCode);
  if (!room) return;
  for (const client of wss.clients) {
    const s = client as Sock;
    if (s.readyState === 1 && s.roomCode === roomCode) {
      s.send(
        JSON.stringify({
          eventType: "ROOM_STATE",
          payload: publicState(room, s.playerId, s.user?.id),
        }),
      );
    }
  }
}

setRoomMutationHook((roomCode) => broadcast(roomCode));

function send(ws: WebSocket, obj: unknown): void {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

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
      },
      narration: narrationStatus(),
    },
  });

  ws.on("close", () => {
    const { roomCode, playerId } = sock;
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
      handle(sock, msg);
    } catch (err) {
      send(ws, {
        eventType: "ERROR",
        payload: {
          code: err instanceof Error ? err.message : "ERROR",
          action: msg.action,
        },
      });
    }
  });
});

function handle(sock: Sock, msg: ClientMsg): void {
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
