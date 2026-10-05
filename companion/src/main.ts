import "@fontsource/cinzel/700.css";
import "@fontsource-variable/literata/opsz.css";
import "./styles.css";
import { describeError, plainNarration, srdLabel, folderActionLists, UI_MOVE_ID, type ActionFolder } from "@d20-fireverse/protocol";
import { isSheetTab, pcSheetHtml, type PcSheet, type SheetTab } from "@d20-fireverse/protocol/sheet";
import { pairTokenFrom, startScanner, type ScannerHandle, type ScanProblem } from "./scanner";
import { mountInstall } from "./install";
import { mountPocket } from "./pocket";
import { mountScrollWheel, mountTrackpad } from "./trackpad";

interface SpeechAlt {
  readonly transcript: string;
}
interface SpeechHit {
  readonly isFinal: boolean;
  readonly 0: SpeechAlt;
}
interface SpeechEv {
  readonly results: ArrayLike<SpeechHit>;
}
interface SpeechSession {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: SpeechEv) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
interface SpeechSessionCtor {
  new (): SpeechSession;
}

function speechCtor(): SpeechSessionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechSessionCtor;
    webkitSpeechRecognition?: SpeechSessionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Seat = { playerId: string; characterId: string; characterName: string; portrait: string };
type DiceFace = { notation: string; values: number[]; total: number; label?: string };
type CombatEvent = { seq: number; kind: string; line: string; tokenId?: string; rolls?: DiceFace[] };
type Token = { id: string; playerId?: string; name: string; hp: number; maxHp: number; ac: number; dead: boolean; kind: string };
type MenuAction = {
  id: string;
  name: string;
  available: boolean;
  targetKind: string;
  category?: string;
  summary?: string;
  guided?: boolean;
  economy?: string;
};
type PuzzleState = {
  kind: string;
  holderId?: string | null;
  holderName?: string | null;
} | null;
type TableState = {
  roomCode: string;
  nodeId: string;
  nodeType: string;
  mode?: string;
  arena?: {
    formatLabel: string;
    level: number;
    phase: string;
    teams: number;
    lastResult?: string | null;
    seats: Array<{ playerId: string; characterName: string; teamId?: string | null; ready?: boolean }>;
  } | null;
  alexaScene?: string;
  narration?: string;
  speaker?: { id: string; name: string; portrait: string } | null;
  players: Seat[];
  choices: Array<{ id: string; label: string }>;
  skillCheck?: { ability: string; skill?: string; dc: number };
  lastDice?: DiceFace | null;
  vote?: { votes: Array<{ playerId: string; choiceId: string }>; remainingMs: number } | null;
  checkOffer?: { roster: Array<{ playerId: string; name: string; bonus: number }>; helpers: string[] } | null;
  puzzle: PuzzleState;
  combat: {
    status: string;
    round: number;
    currentTokenId?: string;
    currentName?: string;
    tokens: Token[];
    actionMenu: { actions: MenuAction[]; bonusActions?: MenuAction[]; movement?: { left: number } } | null;
    awaiting?: Array<{ id: string; playerId: string; label: string; step: string }>;
    damagePreview?: Array<{ sides: number; damageType: string }>;
    pendingReaction?: { playerId: string; prompt: string; acceptLabel: string; declineLabel: string } | null;
    events?: CombatEvent[];
  } | null;
  heldCheck?: { playerId: string; label: string } | null;
  localPlayerId: string | null;
  rest?: { offer: boolean; budget: number; canShort: boolean; canLong: boolean };
};
type ConsoleView = "title" | "campaign" | "arena" | "lobby" | "story" | "combat";
type CompanionState = {
  username: string;
  view: ConsoleView;
  tvOnline: boolean;
  room: TableState | null;
  sheet: PcSheet | null;
};
type Mode = "scan" | "linking" | "paired";

const KEY_STORE = "fireverse.companion.v2";
const MOUSE_STORE = "fireverse.companion.mouse";

function readKey(): string | null {
  try {
    localStorage.removeItem("fireverse.companion.v1");
    return localStorage.getItem(KEY_STORE);
  } catch {
    return null;
  }
}

function writeKey(key: string | null): void {
  try {
    if (key) localStorage.setItem(KEY_STORE, key);
    else localStorage.removeItem(KEY_STORE);
  } catch {
    /* private mode: the link just won't survive a reload */
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const app = document.querySelector<HTMLElement>("#app")!;
app.innerHTML = `
  <section class="scan" id="scanView" hidden>
    <img class="scan-emblem" src="/companion/icons/icon-192.png" alt="" width="72" height="72" />
    <p class="kicker">D20 FireVerse</p>
    <h1>Scan your TV</h1>
    <div class="scan-frame" id="scanFrame">
      <video id="scanVideo" muted playsinline autoplay></video>
      <span class="scan-reticle" aria-hidden="true"></span>
    </div>
    <p class="meta" id="scanHint">Point the camera at the code on your TV.</p>
    <div id="pocketHost"></div>
    <div class="scan-problem" id="scanProblem" hidden>
      <p id="scanProblemText"></p>
      <button type="button" class="primary" id="btnCamera">Allow the camera</button>
    </div>
  </section>

  <section class="linking" id="linkingView" hidden>
    <span class="spinner" aria-hidden="true"></span>
    <p id="linkingText">Linking to your TV…</p>
  </section>

  <div class="paired" id="pairedView" hidden>
    <header class="mast">
      <div>
        <p class="kicker" id="mastKicker">Your controller</p>
        <h1 id="mastTitle">D20 FireVerse</h1>
      </div>
      <span class="conn" id="conn">Connecting…</span>
    </header>
    <p class="tv-away" id="tvAway" hidden>The TV is away. Your controller comes back with it.</p>
    <button type="button" class="mouse-toggle" id="btnMouse" aria-pressed="false">
      <span class="mouse-glyph" aria-hidden="true"></span><span id="mouseLabel">Mouse</span>
    </button>
    <section class="panel status-panel">
      <div class="turn" id="turn" hidden></div>
      <p class="meta" id="where"></p>
      <div class="controls" id="controls"></div>
      <p class="narr" id="narr"></p>
    </section>
    <section class="panel sheet-panel" id="sheetPanel"></section>
    <section class="panel" id="micPanel" hidden>
      <h2>Say it</h2>
      <p class="meta">“Choose two”, “attack”, “magic missile”, “end turn”.</p>
      <button type="button" id="btnMic" class="mic">Tap and speak</button>
    </section>
    <section class="pad-dock" id="padDock" hidden>
      <div class="trackpad" id="trackpad" role="application" aria-label="Trackpad for the TV pointer">
        <span>One finger moves the pointer · two fingers zoom and drag the map · tap to press</span>
      </div>
      <div class="pad-wheel" id="padWheel" role="application" aria-label="Scroll the TV page">
        <span>Scroll</span>
      </div>
      <div class="pad-keys">
        <button type="button" id="padBack">Back</button>
        <button type="button" class="primary" id="padOk">OK</button>
      </div>
    </section>
  </div>

  <p class="toast" id="toast" role="status" hidden></p>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let mode: Mode = "scan";
let ws: WebSocket | null = null;
let reconnectDelay = 800;
let reconnectTimer = 0;
let toastTimer = 0;
let pairToken: string | null = null;
let phoneKey: string | null = readKey();
let view: CompanionState | null = null;
let sheetTab: SheetTab = "overview";
let swiping = false;
let renderQueued = false;
let scanner: ScannerHandle | null = null;
let scanStarting = false;
let foreignHintAt = 0;
let mouseOn = (() => {
  try {
    return localStorage.getItem(MOUSE_STORE) === "1";
  } catch {
    return false;
  }
})();

function toast(text: string, kind: "bad" | "ok" = "bad") {
  const el = $("toast");
  el.textContent = text;
  el.className = `toast ${kind}`;
  el.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), 4200);
}

function send(obj: Record<string, unknown>): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    toast("Reconnecting to the table. Try again in a moment.");
    return false;
  }
  ws.send(JSON.stringify(obj));
  return true;
}

/** Trackpad traffic is fire-and-forget: a dropped nudge needs no toast. */
function sendQuiet(obj: Record<string, unknown>): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(obj));
  return true;
}

// ------------------------------------------------------------------ modes

function setMode(next: Mode, note?: string): void {
  mode = next;
  $("scanView").hidden = next !== "scan";
  $("linkingView").hidden = next !== "linking";
  $("pairedView").hidden = next !== "paired";
  document.body.dataset.mode = next;
  if (next === "scan") {
    $("scanHint").textContent = note ?? "Point the camera at the code on your TV.";
    void openCamera();
  } else {
    closeCamera();
  }
  if (next === "paired") paintMouse();
  else document.body.classList.remove("mouse-on");
}

/** The link is over: forget the key, close the socket, and go back to the camera. */
function unpaired(note: string): void {
  writeKey(null);
  phoneKey = null;
  pairToken = null;
  view = null;
  window.clearTimeout(reconnectTimer);
  const old = ws;
  ws = null;
  old?.close();
  setMode("scan", note);
}

const UNPAIRED_NOTE: Record<string, string> = {
  logout: "The TV signed out. Scan the code when it is back.",
  title: "The TV went back to the title. Scan the new code to play again.",
  tv_closed: "The game closed on the TV. Scan the code when it is back.",
  signed_out: "Someone else signed in on that TV. Scan its code to link again.",
  replaced: "Another phone took over this TV.",
  expired: "This link has ended. Scan the code on your TV.",
};

// ------------------------------------------------------------------ camera

const PROBLEM_TEXT: Record<ScanProblem, string> = {
  insecure: "The camera only works on the secure site. Open www.d20fireverse.it/companion on this phone.",
  denied: "The camera is blocked for this site. Allow it in the browser settings, then try again.",
  "no-camera": "This phone has no camera the browser can use.",
  failed: "The camera didn't start. Try again.",
};

async function openCamera(): Promise<void> {
  if (scanner || scanStarting) return;
  scanStarting = true;
  $("scanProblem").hidden = true;
  $("scanFrame").hidden = false;
  const handle = await startScanner(
    $("scanVideo") as HTMLVideoElement,
    (text) => {
      const token = pairTokenFrom(text);
      if (token) {
        if (navigator.vibrate) navigator.vibrate(30);
        pair(token);
        return;
      }
      if (Date.now() - foreignHintAt > 3000) {
        foreignHintAt = Date.now();
        $("scanHint").textContent = "That isn't a D20 FireVerse code. Scan the one on your TV.";
      }
    },
    (problem) => {
      $("scanFrame").hidden = true;
      $("scanProblem").hidden = false;
      $("scanProblemText").textContent = PROBLEM_TEXT[problem];
      $("btnCamera").hidden = problem === "insecure" || problem === "no-camera";
      $("btnCamera").textContent = problem === "denied" ? "Try again" : "Allow the camera";
    },
  );
  scanStarting = false;
  if (mode !== "scan") {
    handle?.stop();
    return;
  }
  scanner = handle;
}

function closeCamera(): void {
  scanner?.stop();
  scanner = null;
}

$("btnCamera").addEventListener("click", () => void openCamera());

// ------------------------------------------------------------------ link

function pair(token: string): void {
  pairToken = token;
  $("linkingText").textContent = "Linking to your TV…";
  setMode("linking");
  connect();
}

function connect(): void {
  if (!pairToken && !phoneKey) return;
  window.clearTimeout(reconnectTimer);
  const old = ws;
  ws = null;
  old?.close();
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const sock = new WebSocket(`${proto}://${location.host}/ws`);
  ws = sock;
  const conn = $("conn");
  sock.onopen = () => {
    if (ws !== sock) return;
    reconnectDelay = 800;
    conn.textContent = "Live";
    conn.className = "conn ok";
    if (pairToken) sock.send(JSON.stringify({ action: "PAIR", token: pairToken, key: phoneKey ?? undefined }));
    else if (phoneKey) sock.send(JSON.stringify({ action: "COMPANION_RESUME", key: phoneKey }));
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    conn.textContent = "Reconnecting…";
    conn.className = "conn bad";
    reconnectTimer = window.setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(8000, reconnectDelay * 1.6);
  };
  sock.onmessage = (ev) => {
    if (ws !== sock) return;
    let msg: { eventType?: string; payload?: any };
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    onMessage(msg);
  };
}

function onMessage(msg: { eventType?: string; payload?: any }): void {
  switch (msg.eventType) {
    case "HELLO":
    case "PONG":
      return;
    case "PAIRED": {
      const key = msg.payload?.key as string | null;
      if (key) {
        phoneKey = key;
        writeKey(key);
      }
      pairToken = null;
      setMode("paired");
      render();
      return;
    }
    case "COMPANION_STATE":
      view = msg.payload as CompanionState;
      if (mode !== "paired") setMode("paired");
      render();
      return;
    case "UNPAIRED":
      unpaired(UNPAIRED_NOTE[String(msg.payload?.reason ?? "expired")] ?? UNPAIRED_NOTE.expired!);
      return;
    case "ERROR": {
      const code = String(msg.payload?.code ?? "");
      if (msg.payload?.action === "PAIR" || code === "NOT_PAIRED") {
        unpaired(describeError(code));
        return;
      }
      document.querySelectorAll("[aria-busy]").forEach((b) => b.removeAttribute("aria-busy"));
      toast(describeError(code));
      return;
    }
    default:
      return;
  }
}

// ------------------------------------------------------------------ the controller

function me(room: TableState | null): Seat | undefined {
  return room?.players.find((p) => p.playerId === room.localPlayerId);
}

function myToken(room: TableState | null, seat: Seat | undefined): Token | undefined {
  return seat ? room?.combat?.tokens.find((t) => t.playerId === seat.playerId) : undefined;
}

const WHERE: Record<ConsoleView, string> = {
  title: "The TV is on the title screen. Pick Campaign or Arena there.",
  campaign: "Choosing a campaign on the TV.",
  arena: "In the arena hall on the TV.",
  lobby: "Gathering the party.",
  story: "",
  combat: "",
};

let rollCue = "";

function nudgeRoll(room: TableState | null, seat: Seat | undefined): void {
  const waiting = room?.combat?.awaiting?.find((a) => a.playerId === seat?.playerId);
  const check = room?.heldCheck && room.heldCheck.playerId === seat?.playerId ? room.heldCheck.label : "";
  const id = waiting?.id ?? (check ? `check:${check}` : "");
  document.body.classList.toggle("roll-wait", !!id);
  if (id && id !== rollCue) {
    rollCue = id;
    if (navigator.vibrate) navigator.vibrate([40, 50, 40, 50, 90]);
  }
  if (!id) rollCue = "";
}

function render(): void {
  if (mode !== "paired") return;
  if (swiping) {
    renderQueued = true;
    return;
  }
  renderQueued = false;
  const s = view;
  const room = s?.room ?? null;
  const seat = me(room);
  $("mastKicker").textContent = s?.username ? `${s.username} · your controller` : "Your controller";
  $("mastTitle").textContent = seat?.characterName ?? "D20 FireVerse";
  $("tvAway").hidden = !s || s.tvOnline;
  document.body.dataset.room = room?.alexaScene ?? "tavern";
  const where = s ? WHERE[s.view] : "Waiting for the TV…";
  $("where").textContent =
    room && !seat ? `Table ${room.roomCode}. Choose your hero on the TV${mouseOn ? " with the trackpad below." : ". Turn on the mouse to point at it from here."}` : where;
  $("where").hidden = !$("where").textContent;
  nudgeRoll(room, seat);
  renderControls(room, seat);
  renderSheet(room, seat, s?.sheet ?? null);
  $("micPanel").hidden = !seat;
  const narr = $("narr");
  const lead = room && seat ? plainNarration(room.narration).split(/\n{2,}/)[0]!.slice(0, 320) : "";
  if (room?.speaker?.portrait && lead) {
    narr.innerHTML = `<span class="speaker-inline"><img src="${esc(room.speaker.portrait)}" alt="" /><strong>${esc(room.speaker.name)}</strong></span>`;
    narr.append(document.createTextNode(lead));
  } else {
    narr.textContent = lead;
  }
  narr.hidden = !lead;
}

function renderSheet(room: TableState | null, seat: Seat | undefined, sheet: PcSheet | null): void {
  const host = $("sheetPanel");
  if (!sheet) {
    const where = view?.view;
    const hint = room || where === "campaign" || where === "arena"
      ? "Pick your hero on the TV. Their sheet appears here once you sit at the table."
      : "Open a campaign or an arena on the TV. Your hero's sheet appears here.";
    host.innerHTML = `<div class="sheet-empty"><h2>Your hero</h2><p class="meta">${hint}</p></div>`;
    return;
  }
  const token = myToken(room, seat);
  const mine = !!token && room?.combat?.status === "active" && room.combat.currentTokenId === token.id;
  host.innerHTML = pcSheetHtml(sheet, sheetTab, { isMyTurn: mine, showEconomy: room?.combat?.status === "active" });
}

$("sheetPanel").addEventListener("click", (ev) => {
  const b = (ev.target as Element).closest<HTMLElement>("[data-sheet-tab]");
  const tab = b?.dataset.sheetTab;
  if (!isSheetTab(tab)) return;
  sheetTab = tab;
  render();
});

const needsAim = (target: string | undefined) => target === "enemy" || target === "ally" || target === "cell";

const FOLDER_ORDER: ActionFolder[] = ["move", "attack", "spell", "tactics", "item", "feature", "bonus"];
const FOLDER_LABEL: Record<ActionFolder, string> = {
  move: "Move",
  attack: "Attack",
  spell: "Spell",
  tactics: "Tactics",
  item: "Items",
  feature: "Features",
  bonus: "Bonus",
};
let combatFolder: ActionFolder | null = null;

function folderActions(actions: MenuAction[], bonus: MenuAction[], folder: ActionFolder, moveRow?: MenuAction | null): MenuAction[] {
  return folderActionLists(actions, bonus, folder, moveRow);
}

function throwPad(
  id: string,
  targetKind: string,
  label = "d20",
  preview?: Array<{ sides: number; damageType: string }>,
): string {
  const note = id === "commit" ? "The table is waiting. Swipe now." : needsAim(targetKind) ? "Then pick the target on the TV." : "The die lands on your TV.";
  const flash = id === "commit" ? " flash" : "";
  const faces =
    preview && preview.length
      ? `<span class="die-row">${preview
          .map((d) => `<span class="die d${d.sides}" aria-hidden="true">d${d.sides}</span>`)
          .join("")}</span>`
      : `<span class="die" aria-hidden="true">20</span>`;
  return `<div class="throw${flash}" data-throw="${esc(id)}" data-target="${esc(targetKind)}" role="button" tabindex="0" aria-label="Swipe to throw: ${esc(label)}">
    ${faces}
    <span><span class="throw-kicker">Swipe to throw</span><strong>${esc(label)}</strong><span class="meta">${note}</span></span>
  </div>`;
}

function renderControls(room: TableState | null, seat: Seat | undefined): void {
  const turn = $("turn");
  const controls = $("controls");
  turn.hidden = true;
  turn.className = "turn";
  if (!room || !seat) {
    controls.innerHTML = "";
    return;
  }
  const combat = room.combat?.status === "active" ? room.combat : null;
  const token = myToken(room, seat);
  if (combat) {
    const mine = !!token && combat.currentTokenId === token.id;
    turn.hidden = false;
    turn.className = `turn ${mine ? "mine" : ""}`;
    turn.textContent = token?.dead
      ? "You are down. Your allies can still turn this."
      : mine
        ? "Your turn"
        : `Round ${combat.round} · ${combat.currentName ?? "…"} is acting`;
    const waiting = combat.awaiting?.find((a) => a.playerId === seat.playerId);
    const pending = combat.pendingReaction;
    const actions = combat.actionMenu?.actions ?? [];
    const bonus = combat.actionMenu?.bonusActions ?? [];
    const left = combat.actionMenu?.movement?.left ?? 0;
    const moveRow: MenuAction = {
      id: UI_MOVE_ID,
      name: "Move",
      available: left > 0,
      targetKind: "none",
      category: "move",
      summary: left > 0 ? `Pick a square on the TV · ${left * 5} ft` : "No movement left this turn",
    };
    const button = (a: MenuAction) =>
      a.id === UI_MOVE_ID
        ? `<button type="button" class="act-line" data-move-board="1" ${a.available ? "" : "disabled"}><strong>${esc(a.name)}</strong><span class="meta">${esc(a.summary ?? "")}</span></button>`
        : `<button type="button" class="act-line" data-ability="${esc(a.id)}" data-target="${esc(a.targetKind)}" ${a.available ? "" : "disabled"}><strong>${esc(a.name)}${a.guided ? " ★" : ""}</strong><span class="meta">${esc(a.summary ?? "")}</span></button>`;
    if (waiting) {
      combatFolder = null;
      const preview = waiting.step === "damage" ? combat.damagePreview : undefined;
      controls.innerHTML = `${throwPad("commit", "none", waiting.label, preview)}
        <p class="meta">Swipe to throw. The ${preview?.length ? "dice land" : "die lands"} on the TV.</p>`;
    } else if (pending && pending.playerId === seat.playerId) {
      combatFolder = null;
      controls.innerHTML = `<p class="meta">${esc(pending.prompt)}</p>
         <button type="button" class="primary" data-react="yes">${esc(pending.acceptLabel)}</button>
         <button type="button" data-react="no">${esc(pending.declineLabel)}</button>`;
    } else if (mine) {
      const folders = FOLDER_ORDER.filter((id) => folderActions(actions, bonus, id, moveRow).length);
      if (combatFolder && !folders.includes(combatFolder)) combatFolder = null;
      const open = combatFolder;
      const openActs = open ? folderActions(actions, bonus, open, moveRow) : [];
      const throwPool = (open ? openActs : [...actions, ...bonus]).filter((a) => a.id !== UI_MOVE_ID);
      const throwSrc = throwPool.find((a) => a.guided && a.available) ?? throwPool.find((a) => a.available);
      const folderBtn = (id: ActionFolder) => {
        const list = folderActions(actions, bonus, id, moveRow);
        const star = list.some((a) => a.guided) ? " ★" : "";
        return `<button type="button" data-folder="${id}"><strong>${esc(FOLDER_LABEL[id])}${star}</strong><span class="meta">${list.length}</span></button>`;
      };
      controls.innerHTML = open
        ? `${throwSrc ? throwPad(throwSrc.id, throwSrc.targetKind, throwSrc.name) : ""}
        <button type="button" class="ghost" data-folder-back="1">← Actions</button>
        ${openActs.map(button).join("")}
        <button type="button" class="primary" data-intent="end_turn">End turn</button>
        <p class="meta">${open === "move" ? "Pick a square on the TV." : "A targeted action is aimed on the TV, with the remote or the mouse."}</p>`
        : `${throwSrc ? throwPad(throwSrc.id, throwSrc.targetKind, throwSrc.name) : ""}
        ${folders.map(folderBtn).join("")}
        <button type="button" class="primary" data-intent="end_turn">End turn</button>
        <p class="meta">Open a folder.</p>`;
    } else {
      combatFolder = null;
      controls.innerHTML = "";
    }
  } else if (room.mode === "arena") {
    const seatArena = room.arena?.seats.find((x) => x.playerId === seat.playerId);
    const teams = (room.arena?.teams ?? 0) > 0;
    turn.hidden = false;
    turn.textContent =
      room.arena?.phase === "hero_swap" ? (room.arena?.lastResult ?? "Change hero on the TV, or keep this one.") : `${room.arena?.formatLabel ?? "Arena"} · L${room.arena?.level ?? ""}`;
    controls.innerHTML = `
      ${teams ? `<div class="row2"><button type="button" data-team="a" class="${seatArena?.teamId === "a" ? "voted" : ""}">Team A</button><button type="button" data-team="b" class="${seatArena?.teamId === "b" ? "voted" : ""}">Team B</button></div>` : ""}
      <button type="button" class="primary" data-ready="${seatArena?.ready ? "0" : "1"}">${seatArena?.ready ? "Unready" : "Ready"}</button>
      <p class="meta">${seatArena?.teamId ? `Team ${String(seatArena.teamId).toUpperCase()}` : teams ? "Pick a team" : "Free-for-all"}</p>`;
  } else if (room.heldCheck?.playerId === seat.playerId) {
    controls.innerHTML = `${throwPad("commit", "none", room.heldCheck.label)}
      <p class="meta">Swipe to throw the check.</p>`;
  } else if (room.skillCheck && room.nodeType === "skill_check") {
    const skill = srdLabel(room.skillCheck.skill ?? room.skillCheck.ability);
    const roster = room.checkOffer?.roster ?? [];
    const helpers = new Set(room.checkOffer?.helpers ?? []);
    const mineRow = roster.find((r) => r.playerId === seat.playerId);
    controls.innerHTML = `
      <p class="meta">${esc(skill)} · DC ${room.skillCheck.dc}</p>
      ${mineRow ? throwPad("volunteer", "none", `${skill} check`) : ""}
      ${mineRow ? `<p class="meta">Your bonus ${mineRow.bonus >= 0 ? "+" : ""}${mineRow.bonus}${helpers.has(seat.playerId) ? " · helping" : ""}</p>` : ""}
      ${roster.some((r) => r.playerId !== seat.playerId) ? `<button type="button" data-help="1">Pledge Help (advantage)</button>` : ""}`;
  } else if (room.nodeType === "encounter" && !room.combat) {
    controls.innerHTML = `${throwPad("begin", "none", "Initiative")}
      <button type="button" class="primary big" data-begin-fight="1">Roll initiative</button>
      <button type="button" data-withdraw="1">Step back</button>`;
  } else if (room.puzzle) {
    const holder = room.puzzle.holderId;
    const multi = room.players.length > 1;
    if (multi && !holder) {
      controls.innerHTML = `<button type="button" class="primary big" data-claim="1">Take the mechanism</button>
        <p class="meta">First hands place the symbols on the TV.</p>`;
    } else if (multi && holder === seat.playerId) {
      controls.innerHTML = `<p class="meta">You hold the mechanism. Place the symbols on the TV.</p>
        <button type="button" data-release="1">Pass the mechanism</button>`;
    } else {
      controls.innerHTML = `<p class="meta">${multi ? `${esc(room.puzzle.holderName ?? "An ally")} holds the mechanism.` : "A puzzle is on the TV. Work it with the remote or the mouse."}</p>`;
    }
  } else {
    const voting = !!(room.vote && room.players.length > 1);
    const sec = voting ? Math.ceil(room.vote!.remainingMs / 1000) : 0;
    const rest = room.rest;
    const restBtns =
      rest?.offer && (rest.canShort || rest.canLong)
        ? `${rest.canShort ? `<button type="button" data-rest="short">Short rest · costs 1</button>` : ""}${
            rest.canLong ? `<button type="button" data-rest="long">Long rest · costs 2</button>` : ""
          }<p class="meta">One long rest or two short rests this tale · ${rest.budget} left</p>`
        : "";
    controls.innerHTML =
      restBtns +
      (voting ? `<p class="meta">Party vote · ${sec}s left</p>` : "") +
      room.choices
        .map((c, i) => {
          const voted = room.vote?.votes.find((v) => v.playerId === seat.playerId)?.choiceId === c.id;
          return `<button type="button" class="${i === 0 ? "primary" : ""} ${voted ? "voted" : ""}" data-choice="${esc(c.id)}"><b>${i + 1}</b>${esc(c.label)}${voted ? " · your vote" : ""}</button>`;
        })
        .join("");
  }
  const result = lastRollText(room, token);
  if (result) {
    const line = document.createElement("p");
    line.className = "meta throw-result";
    line.textContent = result;
    controls.appendChild(line);
  }
}

const rollText = (r: DiceFace) => `${r.label ?? r.notation}: ${r.values.join(", ")} = ${r.total}`;

/** The total of the die this phone threw: the TV shows the tumble, the phone keeps the number. */
function lastRollText(room: TableState, token: Token | undefined): string | null {
  if (room.combat) {
    const mine = token
      ? [...(room.combat.events ?? [])].reverse().find((e) => e.tokenId === token.id && e.rolls?.length)
      : undefined;
    return mine ? `Last roll · ${mine.rolls!.map(rollText).join(" · ")}` : null;
  }
  return room.lastDice?.values?.length ? `Last roll · ${rollText(room.lastDice)}` : null;
}

function buzz(ms = 12): void {
  if (navigator.vibrate) navigator.vibrate(ms);
}

/** One press on the controller, as a message the table already understands. */
function act(el: HTMLElement): void {
  const room = view?.room;
  if (!room) return;
  const d = el.dataset;
  if (d.folderBack) {
    combatFolder = null;
    const room = view?.room ?? null;
    renderControls(room, me(room));
    return;
  }
  if (d.moveBoard) {
    combatFolder = null;
    const room = view?.room ?? null;
    renderControls(room, me(room));
    return;
  }
  if (d.folder) {
    combatFolder = d.folder as ActionFolder;
    const room = view?.room ?? null;
    renderControls(room, me(room));
    return;
  }
  if (d.ability) {
    buzz();
    send({ action: needsAim(d.target) ? "AIM_ACTION" : "PERFORM_ACTION", abilityId: d.ability });
  } else if (d.react) send({ action: "REACT", accept: d.react === "yes" });
  else if (d.intent) {
    buzz();
    send({ action: "VOICE_INTENT", intent: d.intent });
  } else if (d.team) send({ action: "SET_ARENA_TEAM", teamId: d.team });
  else if (d.ready) send({ action: "ARENA_READY", ready: d.ready === "1" });
  else if (d.help) {
    buzz();
    send({ action: "VOLUNTEER_CHECK", help: true });
  } else if (d.beginFight) {
    buzz();
    send({ action: "BEGIN_COMBAT" });
  } else if (d.withdraw) send({ action: "WITHDRAW" });
  else if (d.claim) send({ action: "CLAIM_PUZZLE" });
  else if (d.release) send({ action: "RELEASE_PUZZLE" });
  else if (d.rest) send({ action: d.rest === "long" ? "LONG_REST" : "SHORT_REST" });
  else if (d.choice) {
    buzz();
    send({ action: room.players.length > 1 ? "CAST_VOTE" : "CHOOSE", choiceId: d.choice });
  }
}

$("controls").addEventListener("click", (ev) => {
  const b = (ev.target as Element).closest<HTMLButtonElement>("button");
  if (!b || b.disabled) return;
  act(b);
});

/** The swipe: the phone gives the feel of the throw, the die itself lands on the TV. */
function throwDie(pad: HTMLElement): void {
  if (pad.dataset.spent === "1") return;
  pad.dataset.spent = "1";
  pad.classList.add("thrown");
  buzz(24);
  const id = pad.dataset.throw;
  if (id === "volunteer") send({ action: "VOLUNTEER_CHECK" });
  else if (id === "commit") send({ action: "COMMIT_ROLL" });
  else if (id === "begin") send({ action: "BEGIN_COMBAT" });
  else if (id) send({ action: needsAim(pad.dataset.target) ? "AIM_ACTION" : "PERFORM_ACTION", abilityId: id });
}

{
  let pad: HTMLElement | null = null;
  let startX = 0;
  let startY = 0;
  const controls = $("controls");
  controls.addEventListener("pointerdown", (ev) => {
    const hit = (ev.target as Element).closest<HTMLElement>("[data-throw]");
    if (!hit) return;
    pad = hit;
    swiping = true;
    startX = ev.clientX;
    startY = ev.clientY;
    try {
      hit.setPointerCapture(ev.pointerId);
    } catch {
      /* the pad can still read the release */
    }
  });
  controls.addEventListener("pointermove", (ev) => {
    if (!pad) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    pad.style.setProperty("--tilt", `${Math.max(-18, Math.min(18, dx / 6))}deg`);
    pad.style.setProperty("--lift", `${Math.max(-40, Math.min(0, dy / 3))}px`);
  });
  const end = (ev: PointerEvent, cancelled: boolean) => {
    if (!pad) return;
    const hit = pad;
    pad = null;
    swiping = false;
    hit.style.removeProperty("--tilt");
    hit.style.removeProperty("--lift");
    if (!cancelled && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 48) throwDie(hit);
    if (renderQueued) render();
  };
  controls.addEventListener("pointerup", (ev) => end(ev, false));
  controls.addEventListener("pointercancel", (ev) => end(ev, true));
  controls.addEventListener("keydown", (ev) => {
    const hit = (ev.target as Element).closest<HTMLElement>("[data-throw]");
    if (hit && (ev.key === "Enter" || ev.key === " ")) {
      ev.preventDefault();
      throwDie(hit);
    }
  });
}

// ------------------------------------------------------------------ mouse

function paintMouse(): void {
  document.body.classList.toggle("mouse-on", mouseOn && mode === "paired");
  $("padDock").hidden = !(mouseOn && mode === "paired");
  $("btnMouse").setAttribute("aria-pressed", String(mouseOn));
  $("mouseLabel").textContent = mouseOn ? "Mouse on" : "Mouse off";
}

$("btnMouse").addEventListener("click", () => {
  mouseOn = !mouseOn;
  try {
    localStorage.setItem(MOUSE_STORE, mouseOn ? "1" : "0");
  } catch {
    /* the switch just won't be remembered */
  }
  buzz(8);
  paintMouse();
  sendQuiet({ action: "POINTER_MODE", on: mouseOn });
  render();
});

mountTrackpad($("trackpad"), sendQuiet);
mountScrollWheel($("padWheel"), sendQuiet);
mountInstall();
mountPocket(
  $("pocketHost"),
  (key) => {
    phoneKey = key;
    writeKey(key);
    connect();
  },
  () => mode === "scan",
);
$("padOk").addEventListener("click", () => {
  buzz(10);
  sendQuiet({ action: "POINTER_TAP" });
});
$("padBack").addEventListener("click", () => {
  buzz(10);
  sendQuiet({ action: "POINTER_BACK" });
});

// ------------------------------------------------------------------ voice

function intentFromSpeech(text: string): { intent?: string; choice?: number } | null {
  const t = text.toLowerCase();
  if (/\bend\b/.test(t) && /turn/.test(t)) return { intent: "end_turn" };
  if (/magic missile|missile/.test(t)) return { intent: "cast_magic_missile" };
  if (/attack|strike|hit|swing|shoot/.test(t)) return { intent: "attack_nearest" };
  if (/\b(three|third|3)\b/.test(t)) return { choice: 3 };
  if (/\b(two|second|2)\b/.test(t)) return { choice: 2 };
  if (/\b(one|first|1|roll)\b/.test(t)) return { choice: 1 };
  return null;
}

let listening: SpeechSession | null = null;
$("btnMic").addEventListener("click", () => {
  const Ctor = speechCtor();
  if (!Ctor) {
    toast("This browser can't listen. Use the buttons above.");
    return;
  }
  if (listening) {
    listening.stop();
    return;
  }
  const rec = new Ctor();
  listening = rec;
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.continuous = false;
  rec.onresult = (ev) => {
    const said = ev.results[0]?.[0]?.transcript ?? "";
    const heard = intentFromSpeech(said);
    if (!heard || !view?.room) {
      toast(`Heard “${said}”. That isn't a table command.`);
      return;
    }
    toast(`Heard “${said}”`, "ok");
    send({ action: "VOICE_INTENT", intent: heard.intent ?? `choose_${heard.choice}` });
  };
  rec.onerror = (ev) => toast(ev.error === "not-allowed" ? "The microphone is blocked for this page." : "The microphone didn't catch that.");
  rec.onend = () => {
    listening = null;
    $("btnMic").textContent = "Tap and speak";
    $("btnMic").classList.remove("live");
  };
  $("btnMic").textContent = "Listening… tap to stop";
  $("btnMic").classList.add("live");
  rec.start();
});

// ------------------------------------------------------------------ start

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (mode === "scan") closeCamera();
    return;
  }
  if (mode === "scan") void openCamera();
  else if (!ws || ws.readyState === WebSocket.CLOSED) connect();
});

if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/companion/sw.js").catch(() => undefined);
}

{
  const fromQr = new URLSearchParams(location.search).get("pair");
  history.replaceState(null, "", location.pathname);
  const token = fromQr ? pairTokenFrom(`${location.origin}/companion/?pair=${fromQr}`) : null;
  if (token) {
    pair(token);
  } else if (phoneKey) {
    $("linkingText").textContent = "Finding your TV…";
    setMode("linking");
    connect();
  } else {
    setMode("scan");
  }
}
