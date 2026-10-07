import "@fontsource/cinzel/500.css";
import "@fontsource/cinzel/700.css";
import "@fontsource-variable/literata/opsz.css";
import "@fontsource-variable/literata/opsz-italic.css";
import "./styles.css";
import { describeError, scriptRuns, srdLabel, type CastMember } from "@d20-fireverse/protocol";
import { normalizeScene, sceneLabel, unlockAudio, type RoomScene } from "./audio";
import { mountChargen, type ChargenCatalog } from "./chargen-ui";
import { CombatUi } from "./combat-ui";
import { ARENA_FORMATS, ARENA_THEMES, suggestedSize, type OpenArena } from "./arena-ui";
import { isD20, rollD20 } from "./dice";
import { DUNGEON_ROOMS, roomForNode, type DungeonRoomId } from "./dungeon-map";
import { onMusicChange, setMusic, toggleMusic, type MusicTrack } from "./music";
import { nativeAmazonReady, nativeAmazonSignIn, nativeAmazonSignOut, nativeApp, onFireTv, registerNativeBack } from "./native";
import { moveFocus, ownsArrows, remoteKey, restoreFocus, setScopeProvider, type RemoteKey } from "./nav";
import { REMOTE_LEGEND } from "./onboarding";
import {
  consoleId,
  mountPhoneLink,
  phoneLinkHost,
  phoneLinkOffer,
  phoneLinkStatus,
  resetPhoneLink,
  unlinkPhone,
} from "./phone-link";
import { mountPointer, onPointer, type TrackpadEvent } from "./pointer";
import { puzzleBack, puzzleKindForNode, renderInteractivePuzzle } from "./puzzles";
import { chapterCard, mountScenes, setScene } from "./scenefx";
import { ART, sceneForNode } from "./scenes";
import { clearSession, loadSession, saveSession, type Session, type SessionMode } from "./session";
import { adminOpen, closeAdmin, handleAdminKey, openAdmin } from "./admin-ui";
import { closeSettings, openSettings, settingsOpen } from "./settings-ui";
import { onSettings, settings } from "./settings";
import { sfx } from "./sfx";
import type { Pregen, RoomState } from "./types";
import { isNarrating, onSpokenCue, prefetchVoice, replayNarration, setCast, speak, stopNarration } from "./voice";

type PageId = "home" | "lobby" | "story" | "combat";

if (onFireTv()) document.documentElement.dataset.tv = "1";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const appRoot = document.querySelector<HTMLElement>("#app")!;
appRoot.innerHTML = `
  <div class="stage" id="stage" aria-hidden="true"></div>
  <div class="vignette" aria-hidden="true"></div>
  <div class="grain" aria-hidden="true"></div>
  <header class="topbar">
    <div class="brand-mark"><img src="/icons/icon-192.png" alt="" width="36" height="36" />D20 FireVerse <span>Luppolandia</span></div>
    <ol class="party-rail" id="partyRail" aria-label="The party"></ol>
    <div class="now-playing" id="nowPlaying" aria-live="off"><span class="music-bars" aria-hidden="true"><i></i><i></i><i></i></span><span><em id="musicKicker">Music</em><strong id="musicTitle">A Very Potent Brew</strong></span></div>
    <div class="conn" id="conn" role="status">Connecting…</div>
    <div class="play-controls" id="playControls" hidden>
      <button type="button" class="ghost" id="btnSaveGame">Save</button>
      <button type="button" class="ghost" id="btnLeaveTable">Title menu</button>
    </div>
    <button type="button" class="menu-hint" id="btnMenuSettings" title="Settings (Menu on the remote, S on the keyboard)"><kbd aria-hidden="true">☰</kbd> Settings</button>
  </header>

  <div class="login-gate" id="loginGate" hidden>
    <div class="login-card">
      <p class="home-kicker">The table</p>
      <h2>Sign in</h2>
      <div class="login-ways">
        <section class="login-amazon">
          <button type="button" class="primary amazon-btn" id="btnAmazon" data-autofocus>Continue with Amazon</button>
          <p class="meta" id="amazonNote"></p>
        </section>
        <details class="login-test" id="loginTest">
          <summary>Test account</summary>
          <form id="loginForm">
            <label>Username <input id="loginUser" autocomplete="username" /></label>
            <label>Password <input id="loginPass" type="password" autocomplete="current-password" /></label>
            <button type="submit">Enter</button>
          </form>
        </details>
      </div>
      <p class="meta err" id="loginError" role="alert"></p>
    </div>
  </div>

  <main class="pages">
    <section class="page page-home active" id="pageHome" aria-label="Title">
      <div class="home-hero">
        <p class="home-kicker">A one-shot for the living room · 5E rules</p>
        <h1 class="home-title">A Very<br />Potent Brew</h1>
        <p class="home-lead">The television is the table. Nobody has to run the game: the rules roll every die in the open, the narrator reads every scene aloud, and the party decides the rest.</p>
        <p class="home-welcome" id="homeWelcome" hidden></p>
        <div class="home-cta" id="homeCta"></div>
        <div class="home-load" id="homeLoad" hidden>
          <input id="saveId" placeholder="Save code, e.g. save-ABC123-…" autocomplete="off" spellcheck="false" />
          <button type="button" class="primary" id="btnResume">Load</button>
        </div>
      </div>
      <aside class="home-side">
        <div class="card qr-card">
          <p class="card-kicker">Your phone</p>
          <div class="qr" id="homeQr"></div>
          <p class="meta" id="homeQrHint"></p>
        </div>
        <div class="card legend-card">
          <p class="card-kicker">The remote is all you need</p>
          ${REMOTE_LEGEND}
        </div>
      </aside>
    </section>

    <section class="page page-lobby" id="pageLobby" aria-label="Choose your hero">
      <div class="lobby-main">
        <p class="story-chapter">Gather the party</p>
        <h2 class="lobby-title">Choose your hero</h2>
        <p class="lede">Pick a painted hero to begin now, or forge your own from the SRD rules. Friends can join from their phones at any time outside a fight.</p>
        <div class="hero-grid" id="heroGrid"></div>
      </div>
      <aside class="lobby-side">
        <div class="card room-card">
          <p class="card-kicker">This table</p>
          <p class="room-code" id="roomCode">······</p>
          <p class="meta" id="lobbyStatus"></p>
          <div class="qr" id="lobbyQr"></div>
          <p class="meta" id="lobbyQrHint"></p>
          <ul class="seats" id="lobbySeats"></ul>
        </div>
        <button type="button" class="primary" id="btnLobbyWatch" hidden>Begin with the party</button>
        <button type="button" class="ghost" id="btnLobbyBack">↩ Back to the title</button>
      </aside>
      <div id="chargenHost" hidden></div>
    </section>

    <section class="page page-story" id="pageStory" aria-label="Story">
      <div class="story-frame">
        <p class="story-chapter" id="storyChapter"></p>
        <h1 class="story-title" id="storyTitle"></h1>
        <div class="story-dialogue">
          <aside class="speaker" id="speakerCard" hidden>
            <img id="speakerPortrait" alt="" />
            <span id="speakerName"></span>
          </aside>
          <div class="story-narration" id="narration" aria-live="polite"></div>
        </div>
        <p class="story-dice" id="storyDice" hidden></p>
        <div id="voteBar" class="vote-bar" hidden></div>
        <div class="dungeon-map-wrap" id="dungeonMapWrap" hidden>
          <img id="dungeonMap" src="/art/dungeon-map.jpg" alt="Map of the brewery cellars" />
          <div class="fog-mask" id="fogMask"></div>
          <div class="map-tokens" id="mapTokens"></div>
        </div>
        <div id="puzzleHost"></div>
        <div class="choices" id="choices" role="group" aria-label="What do you do?"></div>
        <footer class="story-meta-bar">
          <span id="roomMeta"></span>
          <span class="seals" id="seals" aria-label="Seals"></span>
          <span class="saved-chip" id="savedChip" hidden>✓ Progress saved</span>
        </footer>
      </div>
    </section>

    <section class="page page-combat" id="pageCombat" aria-label="Combat">
      <div class="combat-head">
        <div>
          <p class="story-chapter" id="combatChapter"></p>
          <h2 id="combatTitle">Combat</h2>
        </div>
        <ol class="initiative" id="initiative" aria-label="Initiative order"></ol>
        <div class="round" id="combatRound"></div>
      </div>
      <div class="combat-grid">
        <div class="board-col">
          <div class="board-stage">
            <div class="board" id="board" tabindex="0" data-arrows="all" data-nav-key="board" data-no-scroll="1" aria-label="Battle map"></div>
            <div class="zoom-rail" id="mapZoomRail" hidden aria-label="Map zoom">
              <span class="zoom-pct" id="mapZoomPct">100%</span>
              <button type="button" id="mapZoomIn" data-nav-key="map-zoom-in" aria-label="Zoom in">+</button>
              <button type="button" class="zoom-track" id="mapZoomTrack" data-nav-key="map-zoom-track" data-arrows="all" role="slider" aria-label="Zoom" aria-orientation="vertical" aria-valuemin="100" aria-valuemax="400" aria-valuenow="100"></button>
            </div>
          </div>
          <p class="combat-hint" id="combatHint" aria-live="polite"></p>
          <div class="action-bar" id="actionBar" role="toolbar" aria-label="Actions"></div>
        </div>
        <aside class="sheet-rail">
          <div id="pcSheet"></div>
          <ol class="combat-log" id="combatLog" aria-label="Combat log"></ol>
        </aside>
      </div>
    </section>
  </main>

  <div class="subtitles" id="subtitles" aria-live="polite" hidden><p></p></div>
  <div class="speaker-plate" id="speakerPlate" aria-hidden="true">
    <span class="sp-sigil"></span>
    <span class="sp-text"><strong></strong><small></small></span>
    <span class="sp-wave"><i></i><i></i><i></i><i></i><i></i></span>
  </div>
  <div class="turn-banner" id="turnBanner" hidden><strong></strong><span></span></div>
  <div class="victory-banner" id="victoryBanner" hidden><p>Victory</p><span>The last of them falls.</span></div>
  <div class="modal defeat-modal" id="defeatModal" hidden role="dialog" aria-label="The party has fallen">
    <div class="modal-card">
      <p class="modal-kicker">The party has fallen</p>
      <h2>Darkness, for now</h2>
      <p>The tale is not over. Rise and face them again from the first blow, or step back to safer stone and gather your strength.</p>
      <div class="row modal-actions">
        <button type="button" class="primary" id="btnRetry" data-autofocus>Rise again</button>
        <button type="button" class="ghost" id="btnWithdraw">Step back</button>
      </div>
    </div>
  </div>
  <div class="modal" id="leaveModal" hidden role="dialog" aria-label="Leave the table">
    <div class="modal-card">
      <p class="modal-kicker">Leave the table</p>
      <h2>Back to the title?</h2>
      <p>Continue will bring you back to this seat. Save first if you want a code to load later.</p>
      <div class="row modal-actions">
        <button type="button" class="ghost" id="btnLeaveSave">Save progress</button>
        <button type="button" class="primary" id="btnLeaveConfirm" data-autofocus>Leave</button>
        <button type="button" class="ghost" id="btnLeaveStay">Stay</button>
      </div>
    </div>
  </div>
  <div class="toast" id="toast" role="status" hidden></div>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

mountScenes($("stage"));

type Account = { username: string; role: "admin" | "player" };
let account: Account | null = null;

let ws: WebSocket | null = null;
let state: RoomState | null = null;
let playerId: string | null = null;
let pregens: Pregen[] = [];
let portraits: Array<{ id: string; url: string }> = [];
let chargenApi: ReturnType<typeof mountChargen> | null = null;
let page: PageId = "home";
let campaigns: Array<{ id: string; title: string; version: number }> = [];
let resumedFirstState = true;
let lastChapterKey = "";
let lastStoryKey = "";
let lastDiceId = "";
let lastAutosave = "";
let storyBusy = false;
let joining = false;
let pendingRejoin: Session | null = null;
let reconnectDelay = 800;
let toastTimer = 0;
let captionTimer = 0;
let savedTimer = 0;

// ------------------------------------------------------------------ helpers

function toast(text: string, kind: "bad" | "ok" | "info" = "bad") {
  const el = $("toast");
  el.textContent = text;
  el.className = `toast show ${kind}`;
  el.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.classList.remove("show");
    window.setTimeout(() => (el.hidden = true), 300);
  }, kind === "bad" ? 4200 : 3200);
}

/** Create or rejoin that has not been confirmed by a room state yet. Resent when the socket opens. */
let pendingTable: Record<string, unknown> | null = null;
/** Last create or rejoin, kept so a failed open can be tried again from the lobby. */
let tableRequest: Record<string, unknown> | null = null;
let tableError: string | null = null;
/** Hero chosen before the room code existed. Seated as soon as the table opens. */
let pendingHeroId: string | null = null;

function socketOpen(): boolean {
  return !!ws && ws.readyState === WebSocket.OPEN;
}

function deliver(obj: Record<string, unknown>): boolean {
  if (!socketOpen() || !ws) return false;
  ws.send(JSON.stringify(obj));
  return true;
}

function flushPendingTable(): void {
  if (!pendingTable || state?.roomCode) return;
  deliver(pendingTable);
}

function send(obj: Record<string, unknown>) {
  if (!deliver(obj)) {
    sfx("uiError");
    toast("The table is reconnecting. Try again in a moment.", "info");
  }
}

/** Open a campaign or arena, and keep the request until a room state arrives. */
function openTable(msg: Record<string, unknown>): void {
  tableRequest = msg;
  pendingTable = msg;
  tableError = null;
  pendingHeroId = null;
  if (!deliver(msg)) {
    sfx("uiError");
    toast("The link to the table is down. It will open as soon as it is back.", "info");
  }
  showPage("lobby");
  renderLobby();
}

function scopeRoot(): HTMLElement {
  const gate = document.querySelector<HTMLElement>("#loginGate:not([hidden])");
  if (gate) return gate;
  const modal = settingsOpen() ?? document.querySelector<HTMLElement>(".modal:not([hidden])");
  if (modal) return modal;
  const cg = document.querySelector<HTMLElement>(".chargen-panel.is-open");
  if (cg) return cg;
  return document.querySelector<HTMLElement>(".page.active") ?? document.body;
}
setScopeProvider(scopeRoot);

let reportedView = "";

/** The screen this TV is on, as its phone shows it. */
function currentView(): "title" | "campaign" | "arena" | PageId {
  if (page !== "home") return page;
  if (homeView === "modes") return "title";
  return homeView === "campaign" ? "campaign" : "arena";
}

function reportView(force = false): void {
  const view = currentView();
  if (!account || (!force && view === reportedView)) return;
  if (deliver({ action: "CONSOLE_VIEW", view })) reportedView = view;
}

function showPage(next: PageId) {
  if (page === next && document.querySelector(`.page.active`)) {
    return;
  }
  page = next;
  document.body.dataset.page = next;
  document.body.classList.toggle("in-combat", next === "combat");
  for (const [id, p] of [
    ["pageHome", "home"],
    ["pageLobby", "lobby"],
    ["pageStory", "story"],
    ["pageCombat", "combat"],
  ] as const) {
    $(id).classList.toggle("active", p === next);
  }
  if (next === "home") {
    setScene(ART.home, "warm");
    setMusic("title");
    renderHome();
  }
  if (next === "lobby") {
    setScene(ART.lobby, "warm");
    setMusic("tavern");
  }
  if (next !== "combat") combat.reset();
  const inPlay = next === "story" || next === "combat";
  $("playControls").hidden = !inPlay;
  reportView();
  requestAnimationFrame(() => restoreFocus(null));
}

function musicFor(s: RoomState): MusicTrack {
  if (s.combat) {
    if (s.combat.status === "defeat") return "tension";
    return s.combat.tokens.some((t) => t.boss && !t.dead) ? "boss" : "combat";
  }
  if (s.nodeId === "END_WIN" || s.nodeId === "epilogue") return "victory";
  switch (sceneForNode(s.nodeId).tone) {
    case "warm":
      return "tavern";
    case "ember":
      return "tension";
    case "victory":
      return "victory";
    case "cool":
      return "descent";
    default:
      return "descent";
  }
}

function roomScene(s: RoomState): RoomScene {
  const scene = sceneForNode(s.nodeId);
  if (s.combat) return s.combat.tokens.some((t) => t.boss) ? "boss" : "combat";
  return normalizeScene(s.alexaScene, scene.tone === "victory" ? "victory" : scene.tone === "warm" ? "tavern" : "explore");
}

// ------------------------------------------------------------------ subtitles & captions

function caption(text: string) {
  if (page !== "combat") return;
  showSubtitle(text, 3800);
}

function showSubtitle(text: string, hold = 0, speaker: string | null = null) {
  const s = settings();
  const el = $("subtitles");
  if (!s.subtitles || !text) {
    el.hidden = true;
    return;
  }
  const who = speaker ? state?.cast?.[speaker] : undefined;
  el.querySelector("p")!.innerHTML = who
    ? `<b class="sub-who" style="${whoStyle(who.color)}">${esc(who.name)}</b>${esc(text)}`
    : esc(text);
  if (page === "combat") {
    const r = $("board").getBoundingClientRect();
    el.style.setProperty("--subs-top", `${Math.round(r.bottom - 16)}px`);
  }
  el.hidden = false;
  el.classList.remove("fade");
  window.clearTimeout(captionTimer);
  if (hold) captionTimer = window.setTimeout(() => el.classList.add("fade"), hold);
}

/** CSS custom properties for a speaker's colour, as hex and as an rgb triplet for translucent tints. */
function whoStyle(color: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1] ?? "f1c46b";
  const n = parseInt(hex, 16);
  return `--who:#${hex};--who-rgb:${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

let plateSpeaker: string | null = null;

/** The nameplate of whoever is speaking right now; the narrator has none. */
function showSpeaker(speaker: string | null) {
  if (speaker === plateSpeaker) return;
  plateSpeaker = speaker;
  const plate = $("speakerPlate");
  const who = speaker ? state?.cast?.[speaker] : undefined;
  if (!who) {
    plate.classList.remove("on");
    return;
  }
  plate.setAttribute("style", whoStyle(who.color));
  plate.querySelector(".sp-sigil")!.textContent = who.name.replace(/^The\s+/i, "")[0] ?? "";
  plate.querySelector("strong")!.textContent = who.name;
  plate.querySelector("small")!.textContent = who.title;
  plate.classList.remove("on");
  void plate.offsetWidth;
  plate.classList.add("on");
}

onSpokenCue((cue) => {
  showSpeaker(cue?.speaker ?? null);
  const box = $("narration");
  box.querySelectorAll(".spoken").forEach((n) => {
    n.classList.remove("spoken");
    n.classList.add("said");
  });
  box.classList.toggle("speaking", !!cue);
  if (!cue) {
    box.querySelectorAll(".said").forEach((n) => n.classList.remove("said"));
    if (page !== "combat") $("subtitles").hidden = true;
    return;
  }
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const target = norm(cue.text).slice(0, 36);
  const spans = [...box.querySelectorAll<HTMLElement>(".sent")];
  const hit = spans.find((s) => norm(s.textContent ?? "").includes(target) || target.includes(norm(s.textContent ?? "").slice(0, 36)));
  if (hit && page === "story") {
    hit.classList.add("spoken");
    $("subtitles").hidden = true;
    return;
  }
  showSubtitle(cue.text, 0, cue.speaker);
});

onSettings(() => {
  if (!settings().subtitles) $("subtitles").hidden = true;
});

async function turnBanner(title: string, sub: string, tone: "mine" | "ally" | "foe") {
  const el = $("turnBanner");
  el.className = `turn-banner ${tone}`;
  el.querySelector("strong")!.textContent = title;
  el.querySelector("span")!.textContent = sub;
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add("slam");
  await new Promise((r) => window.setTimeout(r, settings().motion === "reduced" ? 700 : tone === "mine" ? 1100 : 900));
  el.classList.remove("slam");
  el.hidden = true;
}

async function victory() {
  const el = $("victoryBanner");
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add("show");
  await new Promise((r) => window.setTimeout(r, 2300));
  el.classList.remove("show");
  window.setTimeout(() => (el.hidden = true), 500);
}

function setDefeat(defeated: boolean) {
  const modal = $("defeatModal");
  if (modal.hidden === !defeated) return;
  modal.hidden = !defeated;
  if (defeated) requestAnimationFrame(() => $("btnRetry").focus());
}

const combat = new CombatUi(
  { send, toast, caption, turnBanner, victory, onDefeatChange: setDefeat },
  {
    board: $("board"),
    zoomRail: $("mapZoomRail"),
    zoomPct: $("mapZoomPct"),
    zoomIn: $("mapZoomIn") as HTMLButtonElement,
    zoomTrack: $("mapZoomTrack") as HTMLButtonElement,
    ribbon: $("initiative"),
    sheet: $("pcSheet"),
    actions: $("actionBar"),
    title: $("combatTitle"),
    chapter: $("combatChapter"),
    meta: $("combatRound"),
    log: $("combatLog"),
  },
);

$("btnRetry").addEventListener("click", () => {
  sfx("uiConfirm");
  $("defeatModal").hidden = true;
  send({ action: "RETRY_COMBAT", roomCode: state?.roomCode });
});
$("btnWithdraw").addEventListener("click", () => {
  sfx("uiBack");
  $("defeatModal").hidden = true;
  send({ action: "WITHDRAW", roomCode: state?.roomCode });
});

function inPlay(): boolean {
  return page === "story" || page === "combat";
}

function saveGame() {
  if (!state?.roomCode) {
    toast("No table to save yet.", "info");
    return;
  }
  sfx("uiConfirm");
  send({ action: "REQUEST_SAVE", roomCode: state.roomCode });
}

function openLeaveModal() {
  if (!inPlay()) return;
  $("leaveModal").hidden = false;
  requestAnimationFrame(() => $("btnLeaveConfirm").focus());
  sfx("uiConfirm");
}

function closeLeaveModal(playSound = true) {
  if ($("leaveModal").hidden) return;
  $("leaveModal").hidden = true;
  if (playSound) sfx("uiBack");
}

function leaveToTitle() {
  closeLeaveModal(false);
  if (settingsOpen()) closeSettings();
  if (adminOpen()) closeAdmin();
  stopNarration();
  $("defeatModal").hidden = true;
  spectating = false;
  lobbyEntry = null;
  sfx("uiBack");
  showPage("home");
}

$("btnSaveGame").addEventListener("click", () => saveGame());
$("btnLeaveTable").addEventListener("click", () => openLeaveModal());
$("btnLeaveSave").addEventListener("click", () => {
  saveGame();
});
$("btnLeaveConfirm").addEventListener("click", () => leaveToTitle());
$("btnLeaveStay").addEventListener("click", () => closeLeaveModal());

function openTableSettings() {
  openSettings(undefined, inPlay() ? { onSave: saveGame, onLeave: openLeaveModal } : undefined);
}

// ------------------------------------------------------------------ home

let homeView: "modes" | "campaign" | "arena" | "create" | "join" = "modes";
let arenaList: OpenArena[] = [];
let arenaCreate = {
  format: "ffa_1v1",
  theme: "brewery",
  mapSize: "small" as "small" | "medium" | "large",
  level: 1,
  privacy: "public",
  name: "",
  monsterId: "",
  monsterQuery: "",
  monsterCr: "",
};
let arenaMonsters: Array<{ id: string; name: string; cr: string; crValue: number; creatureType: string }> = [];

function filteredArenaMonsters() {
  const q = arenaCreate.monsterQuery.trim().toLowerCase();
  const cr = arenaCreate.monsterCr;
  return arenaMonsters.filter((m) => (!q || m.name.toLowerCase().includes(q)) && (!cr || m.cr === cr));
}

function continueMarkup(session: Session): string {
  return `<button type="button" class="primary continue" id="btnContinue" data-autofocus>
        <strong>Continue</strong><span>${esc(session.hero ?? "Your party")}${session.place ? ` · ${esc(session.place)}` : ""}</span>
      </button>`;
}

function renderHome() {
  const campaign = loadSession("campaign");
  const arena = loadSession("arena");
  const welcome = $("homeWelcome");
  if (account?.username) {
    welcome.hidden = false;
    welcome.innerHTML = `Welcome, ${esc(account.username)}. <button type="button" class="ghost" id="btnLogout">Log out</button>`;
    $("btnLogout").addEventListener("click", () => void logOut());
  } else {
    welcome.hidden = true;
    welcome.textContent = "";
  }
  const cta = $("homeCta");
  const camp =
    campaigns.length > 1
      ? `<label class="meta">Campaign <select id="campPick">${campaigns
          .map((c) => `<option value="${esc(c.id)}">${esc(c.title)}</option>`)
          .join("")}</select></label>`
      : "";
  if (homeView === "modes") {
    cta.innerHTML = `
      <button type="button" class="primary" id="btnModeCampaign" data-autofocus>Campaign</button>
      <button type="button" id="btnModeArena">Arena</button>
      <button type="button" class="ghost" id="btnSettings">Settings</button>
      ${account?.role === "admin" ? `<button type="button" class="ghost" id="btnAdmin">Manage the table</button>` : ""}`;
    $("btnModeCampaign").addEventListener("click", () => {
      homeView = "campaign";
      renderHome();
    });
    $("btnModeArena").addEventListener("click", () => {
      homeView = "arena";
      renderHome();
    });
  } else if (homeView === "campaign") {
    cta.innerHTML = `${campaign ? continueMarkup(campaign) : ""}
    ${camp}
    <button type="button" class="${campaign ? "" : "primary"}" id="btnNew" ${campaign ? "" : "data-autofocus"}>Begin a new tale</button>
    <button type="button" class="ghost" id="btnLoad">Load a save code</button>
    <button type="button" class="ghost" id="btnHomeBack">↩ Modes</button>
    <button type="button" class="ghost" id="btnSettings">Settings</button>
    ${account?.role === "admin" ? `<button type="button" class="ghost" id="btnAdmin">Manage the table</button>` : ""}`;
    $("btnContinue")?.addEventListener("click", () => continueSession("campaign"));
    $("btnNew").addEventListener("click", () => {
      sfx("uiConfirm");
      clearSession("campaign");
      playerId = null;
      state = null;
      spectating = false;
      lobbyEntry = null;
      const campaignId = ($("campPick") as HTMLSelectElement | null)?.value || campaigns[0]?.id;
      openTable({ action: "CREATE_ROOM", campaignId });
    });
    $("btnLoad").addEventListener("click", () => {
      $("homeLoad").hidden = !$("homeLoad").hidden;
      if (!$("homeLoad").hidden) $("saveId").focus();
    });
    $("btnHomeBack").addEventListener("click", () => {
      homeView = "modes";
      renderHome();
    });
  } else if (homeView === "arena") {
    cta.innerHTML = `
      ${arena ? continueMarkup(arena) : ""}
      <button type="button" class="${arena ? "" : "primary"}" id="btnArenaCreate" ${arena ? "" : "data-autofocus"}>Create arena</button>
      <button type="button" id="btnArenaJoin">Join an arena</button>
      <button type="button" class="ghost" id="btnHomeBack">↩ Modes</button>
      <button type="button" class="ghost" id="btnSettings">Settings</button>`;
    $("btnContinue")?.addEventListener("click", () => continueSession("arena"));
    $("btnArenaCreate").addEventListener("click", () => {
      homeView = "create";
      renderHome();
    });
    $("btnArenaJoin").addEventListener("click", () => {
      homeView = "join";
      send({ action: "LIST_ARENAS" });
      renderHome();
    });
    $("btnHomeBack").addEventListener("click", () => {
      homeView = "modes";
      renderHome();
    });
  } else if (homeView === "create") {
    cta.innerHTML = `<form class="arena-form" id="arenaForm">
      <label>Format <select id="arenaFormat">${ARENA_FORMATS.map((f) => `<option value="${f.id}" ${arenaCreate.format === f.id ? "selected" : ""}>${esc(f.label)}</option>`).join("")}</select></label>
      <label>Theme <select id="arenaTheme">${ARENA_THEMES.map((t) => `<option value="${t.id}" ${arenaCreate.theme === t.id ? "selected" : ""}>${esc(t.label)}</option>`).join("")}</select></label>
      <label>Size <select id="arenaSize">${["small", "medium", "large"].map((s) => `<option value="${s}" ${arenaCreate.mapSize === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
      <label>Hero level <select id="arenaLevel">${[1, 2, 3].map((l) => `<option value="${l}" ${arenaCreate.level === l ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label>Privacy <select id="arenaPrivacy"><option value="public" ${arenaCreate.privacy === "public" ? "selected" : ""}>Public</option><option value="private" ${arenaCreate.privacy === "private" ? "selected" : ""}>Private (code only)</option></select></label>
      <label>Name <input id="arenaName" maxlength="24" value="${esc(arenaCreate.name)}" placeholder="Optional" /></label>
      <div id="pveMonsterWrap" ${arenaCreate.format === "pve_1v1" ? "" : "hidden"}>
        <label>Foe name <input id="arenaMonsterQ" value="${esc(arenaCreate.monsterQuery)}" placeholder="Filter by name" /></label>
        <label>CR <select id="arenaMonsterCr"><option value="">Any</option>${[...new Set(arenaMonsters.map((m) => m.cr))].sort((a, b) => (arenaMonsters.find((m) => m.cr === a)?.crValue ?? 0) - (arenaMonsters.find((m) => m.cr === b)?.crValue ?? 0)).map((cr) => `<option value="${esc(cr)}" ${arenaCreate.monsterCr === cr ? "selected" : ""}>${esc(cr)}</option>`).join("")}</select></label>
        <label>Creature <select id="arenaMonster">${filteredArenaMonsters().map((m) => `<option value="${esc(m.id)}" ${arenaCreate.monsterId === m.id ? "selected" : ""}>${esc(m.name)} (CR ${esc(m.cr)})</option>`).join("")}</select></label>
      </div>
      <button type="submit" class="primary">Open the arena</button>
      <button type="button" class="ghost" id="btnHomeBack">↩ Arena</button>
    </form>`;
    const pveWrap = $("pveMonsterWrap");
    const refreshMonsters = () => {
      arenaCreate.monsterQuery = ($("arenaMonsterQ") as HTMLInputElement | null)?.value ?? "";
      arenaCreate.monsterCr = ($("arenaMonsterCr") as HTMLSelectElement | null)?.value ?? "";
      const sel = $("arenaMonster") as HTMLSelectElement | null;
      if (!sel) return;
      const list = filteredArenaMonsters();
      sel.innerHTML = list.map((m) => `<option value="${esc(m.id)}">${esc(m.name)} (CR ${esc(m.cr)})</option>`).join("");
      if (list.some((m) => m.id === arenaCreate.monsterId)) sel.value = arenaCreate.monsterId;
      else arenaCreate.monsterId = list[0]?.id ?? "";
    };
    const syncSize = () => {
      const format = ($("arenaFormat") as HTMLSelectElement).value;
      ($("arenaSize") as HTMLSelectElement).value = suggestedSize(format);
      if (pveWrap) pveWrap.hidden = format !== "pve_1v1";
    };
    $("arenaFormat").addEventListener("change", syncSize);
    $("arenaMonsterQ")?.addEventListener("input", refreshMonsters);
    $("arenaMonsterCr")?.addEventListener("change", refreshMonsters);
    $("arenaForm").addEventListener("submit", (e) => {
      e.preventDefault();
      arenaCreate = {
        format: ($("arenaFormat") as HTMLSelectElement).value,
        theme: ($("arenaTheme") as HTMLSelectElement).value,
        mapSize: ($("arenaSize") as HTMLSelectElement).value as "small" | "medium" | "large",
        level: Number(($("arenaLevel") as HTMLSelectElement).value),
        privacy: ($("arenaPrivacy") as HTMLSelectElement).value,
        name: ($("arenaName") as HTMLInputElement).value,
        monsterId: ($("arenaMonster") as HTMLSelectElement | null)?.value ?? "",
        monsterQuery: ($("arenaMonsterQ") as HTMLInputElement | null)?.value ?? "",
        monsterCr: ($("arenaMonsterCr") as HTMLSelectElement | null)?.value ?? "",
      };
      sfx("uiConfirm");
      clearSession("arena");
      playerId = null;
      state = null;
      spectating = true;
      lobbyEntry = null;
      openTable({
        action: "CREATE_ARENA",
        format: arenaCreate.format,
        theme: arenaCreate.theme,
        mapSize: arenaCreate.mapSize,
        level: arenaCreate.level,
        privacy: arenaCreate.privacy,
        name: arenaCreate.name,
        monsterId: arenaCreate.format === "pve_1v1" ? arenaCreate.monsterId : undefined,
      });
    });
    $("btnHomeBack").addEventListener("click", () => {
      homeView = "arena";
      renderHome();
    });
  } else {
    cta.innerHTML = `
      <label>Code <input id="arenaJoinCode" maxlength="6" autocapitalize="characters" placeholder="ABC123" /></label>
      <button type="button" class="primary" id="btnArenaCode">Join with code</button>
      <div class="arena-list" id="arenaBrowse">${
        arenaList.length
          ? arenaList
              .map(
                (a) =>
                  `<button type="button" class="ghost arena-open" data-code="${esc(a.roomCode)}"><strong>${esc(a.name)}</strong><span>${esc(a.formatLabel)} · L${a.level} · ${a.seats}/${a.cap} · ${esc(a.roomCode)}</span></button>`,
              )
              .join("")
          : `<p class="meta">No public arenas are waiting. Create one, or enter a private code.</p>`
      }</div>
      <button type="button" class="ghost" id="btnHomeBack">↩ Arena</button>`;
    $("btnArenaCode").addEventListener("click", () => {
      const code = ($("arenaJoinCode") as HTMLInputElement).value.trim().toUpperCase();
      if (code.length < 4) return;
      spectating = true;
      playerId = null;
      state = null;
      lobbyEntry = null;
      openTable({ action: "REJOIN", roomCode: code });
    });
    cta.querySelectorAll<HTMLElement>(".arena-open").forEach((b) =>
      b.addEventListener("click", () => {
        spectating = true;
        playerId = null;
        state = null;
        lobbyEntry = null;
        openTable({ action: "REJOIN", roomCode: b.dataset.code });
      }),
    );
    $("btnHomeBack").addEventListener("click", () => {
      homeView = "arena";
      renderHome();
    });
  }
  $("btnSettings")?.addEventListener("click", () => openTableSettings());
  $("btnMenuSettings").addEventListener("click", () => openTableSettings());
  $("btnAdmin")?.addEventListener("click", () => openAdmin());
  reportView();
}

function continueSession(mode: SessionMode) {
  const session = loadSession(mode);
  if (!session) return;
  sfx("uiConfirm");
  pendingRejoin = { ...session, mode };
  resumedFirstState = true;
  spectating = !session.playerId;
  const msg = { action: "REJOIN", roomCode: session.roomCode, playerId: session.playerId ?? undefined };
  tableRequest = msg;
  pendingTable = msg;
  tableError = null;
  if (!deliver(msg)) toast("The link to the table is down. It will open as soon as it is back.", "info");
}

$("btnResume").addEventListener("click", () => {
  const saveId = ($("saveId") as HTMLInputElement).value.trim();
  if (!saveId) {
    toast("Type the save code you were given.", "info");
    return;
  }
  resumedFirstState = true;
  send({ action: "RESUME_SAVE", saveId });
});
$("saveId").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  $("btnResume").click();
});

// ------------------------------------------------------------------ lobby

let selectedHero: string | null = null;
/** The TV can host a party of phones without taking a seat itself. */
let spectating = false;
let lobbyEntry: { roomCode: string; seq: number } | null = null;

function storyMovedOn(s: RoomState): boolean {
  if (!lobbyEntry || lobbyEntry.roomCode !== s.roomCode) {
    lobbyEntry = { roomCode: s.roomCode, seq: s.narrationSeq };
    return false;
  }
  return s.players.length > 0 && s.narrationSeq > lobbyEntry.seq;
}

function renderLobby() {
  const grid = $("heroGrid");
  const arena = state?.mode === "arena";
  const taken = new Set(arena ? [] : (state?.players ?? []).map((p) => p.characterId));
  const level = state?.arena?.level;
  const swapping = state?.arena?.phase === "hero_swap";
  grid.innerHTML =
    pregens
      .map((p) => {
        const busy = taken.has(p.id);
        const lv = arena && level ? level : p.level;
        return `<button type="button" class="hero-card ${busy ? "taken" : ""}" data-hero="${esc(p.id)}" ${busy ? "disabled" : ""} ${selectedHero === p.id ? "data-autofocus" : ""}>
          <span class="hero-portrait">${p.portrait ? `<img src="${esc(p.portrait)}" alt="" loading="lazy" />` : ""}</span>
          <span class="hero-copy">
            <strong>${esc(p.name)}</strong>
            <em>${esc([srdLabel(p.race), srdLabel(p.class), `level ${lv}`].filter(Boolean).join(" · "))}${p.custom ? " · forged" : ""}</em>
            <span>${esc(p.summary)}</span>
          </span>
          ${busy ? `<span class="hero-taken">At the table</span>` : ""}
        </button>`;
      })
      .join("") +
    `<button type="button" class="hero-card forge" id="btnForge">
      <span class="hero-portrait forge-mark" aria-hidden="true">✦</span>
      <span class="hero-copy"><strong>Forge a new hero</strong><em>SRD 5.1 · ${arena && level ? `level ${level}` : "levels 1–3"}</em><span>Race, class, background, ability scores and a painted portrait.</span></span>
    </button>`;
  if (!grid.querySelector("[data-autofocus]")) grid.querySelector("button:not([disabled])")?.setAttribute("data-autofocus", "");
  grid.querySelectorAll<HTMLElement>("[data-hero]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.hero!;
      if (!state?.roomCode) {
        pendingHeroId = id;
        selectedHero = id;
        if (!pendingTable && tableRequest) pendingTable = tableRequest;
        tableError = null;
        if (pendingTable && !deliver(pendingTable)) {
          toast("The link to the table is down. It will open as soon as it is back.", "info");
        } else {
          toast("Setting the table… you'll take this seat as soon as it opens.", "info");
        }
        return;
      }
      seatHero(id);
    }),
  );
  $("btnForge").addEventListener("click", () => {
    sfx("uiConfirm");
    chargenApi?.open(arena && level ? { lockLevel: level as 1 | 2 | 3 } : undefined);
  });
  const code = state?.roomCode ?? "······";
  $("roomCode").textContent = code;
  const foe = state?.arena?.monsterName;
  const codeParent = $("roomCode").parentElement;
  if (codeParent) {
    let tag = codeParent.querySelector(".pve-foe");
    if (foe) {
      if (!tag) {
        tag = document.createElement("em");
        tag.className = "pve-foe";
        codeParent.appendChild(tag);
      }
      tag.textContent = `vs ${foe}`;
    } else tag?.remove();
  }
  const teams = (state?.arena?.teams ?? 0) > 0;
  $("lobbySeats").innerHTML = (state?.players ?? [])
    .map((p) => {
      const mine = p.playerId === playerId;
      const team = teams
        ? `<button type="button" data-team="a" data-pid="${esc(p.playerId)}" ${p.teamId === "a" ? "class='primary'" : ""}>A</button>
           <button type="button" data-team="b" data-pid="${esc(p.playerId)}" ${p.teamId === "b" ? "class='primary'" : ""}>B</button>`
        : "";
      const ready = arena
        ? `<em>${p.ready ? "ready" : "waiting"}</em>${mine ? `<button type="button" data-ready="${p.ready ? "0" : "1"}">${p.ready ? "Unready" : "Ready"}</button>` : ""}`
        : `<em>${mine ? "this TV" : "another TV"}</em>`;
      return `<li><img src="${esc(p.portrait)}" alt="" /><span>${esc(p.characterName)}</span>${team}${ready}</li>`;
    })
    .join("");
  $("lobbySeats").querySelectorAll<HTMLElement>("[data-team]").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.pid !== playerId) return;
      send({ action: "SET_ARENA_TEAM", roomCode: state!.roomCode, teamId: b.dataset.team, playerId });
    }),
  );
  $("lobbySeats").querySelectorAll<HTMLElement>("[data-ready]").forEach((b) =>
    b.addEventListener("click", () => {
      send({ action: "ARENA_READY", roomCode: state!.roomCode, ready: b.dataset.ready === "1", playerId });
    }),
  );
  const phones = (state?.players ?? []).length;
  const watch = $("btnLobbyWatch");
  if (arena) {
    const cap = state?.arena?.cap ?? 0;
    watch.hidden = !state?.isHost;
    watch.textContent = swapping ? "Hero swap — wait for Ready" : `Start arena (${phones}/${cap})`;
    const left = state?.arena?.heroSwapEndsAt ? Math.max(0, Math.ceil((state.arena.heroSwapEndsAt - Date.now()) / 1000)) : 0;
    $("lobbyStatus").textContent = swapping
      ? `${state?.arena?.lastResult ?? "Round over."} ${left}s to change heroes.`
      : `Friends join from their own TV with this code. ${state?.arena?.formatLabel ?? ""} · L${state?.arena?.level ?? ""} · ${state?.arena?.theme ?? ""}`;
  } else {
    watch.hidden = phones === 0;
    watch.textContent = phones === 1 ? "Begin with the hero at the table" : `Begin with the ${phones} heroes at the table`;
    $("lobbyStatus").textContent = "Friends join from their own TV with this code.";
  }
  if (!state?.roomCode) {
    $("lobbyStatus").textContent = tableError ?? "Opening the table…";
    watch.hidden = true;
  }
}

function seatHero(id: string): void {
  if (!state?.roomCode || joining) return;
  joining = true;
  selectedHero = id;
  sfx("uiConfirm");
  const hero = pregens.find((p) => p.id === id);
  const arena = state.mode === "arena";
  const phase = state.arena?.phase;
  const seated = !!playerId && state.players.some((p) => p.playerId === playerId);
  const swap = arena && seated && (phase === "lobby" || phase === "hero_swap");
  const msg = swap
    ? { action: "ARENA_PICK_HERO", roomCode: state.roomCode, characterId: id, playerId }
    : { action: "JOIN_ROOM", roomCode: state.roomCode, characterId: id, displayName: hero?.name ?? "Hero" };
  if (!deliver(msg)) {
    joining = false;
    sfx("uiError");
    toast("The table is reconnecting. Try again in a moment.", "info");
  }
}

$("btnLobbyWatch").addEventListener("click", () => {
  if (!state?.players.length) return;
  sfx("uiConfirm");
  if (state.mode === "arena") {
    send({ action: "START_ARENA", roomCode: state.roomCode });
    return;
  }
  spectating = true;
  route();
});

$("btnLobbyBack").addEventListener("click", () => {
  spectating = false;
  sfx("uiBack");
  showPage("home");
});

// ------------------------------------------------------------------ party rail

function renderParty() {
  const rail = $("partyRail");
  const players = state?.players ?? [];
  const tokens = state?.combat?.tokens ?? [];
  rail.innerHTML = players
    .map((p) => {
      const t = tokens.find((x) => x.playerId === p.playerId);
      const ratio = t ? Math.max(0, t.hp / t.maxHp) : 1;
      const mine = p.playerId === playerId;
      const active = !!t && state?.combat?.currentTokenId === t.id;
      return `<li class="seat ${mine ? "mine" : ""} ${active ? "active" : ""} ${t?.dead ? "down" : ""}" style="--hp:${ratio}">
        <img src="${esc(p.portrait)}" alt="" />
        <span><strong>${esc(p.characterName.split(" ")[0]!)}</strong><em>${t ? `${t.hp}/${t.maxHp} HP` : mine ? "this TV" : "phone"}</em></span>
      </li>`;
    })
    .join("");
}

// ------------------------------------------------------------------ story

function sentenceSpans(text: string): string {
  const parts = text.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) ?? [text];
  return parts.map((s) => `<span class="sent">${esc(s)}</span>`).join("");
}

/** Narration as prose; spoken lines become quotes signed with the speaker's name and colour. */
function sentences(text: string, cast: Record<string, CastMember> = {}): string {
  return text
    .split(/\n{2,}/)
    .map((para) => {
      const runs = scriptRuns(para).map((run) => {
        const who = run.speaker ? cast[run.speaker] : undefined;
        if (!run.speaker) return sentenceSpans(run.text);
        if (!who) return `“${sentenceSpans(run.text)}”`;
        return `<span class="quote" style="${whoStyle(who.color)}"><span class="who">${esc(who.name)}</span>“${sentenceSpans(run.text)}”</span>`;
      });
      return `<p>${runs.join("")}</p>`;
    })
    .join("");
}

function chapterOf(chapter: string): { key: string; kicker: string; title: string } | null {
  const [head, tail] = chapter.split("·").map((s) => s.trim());
  if (!head) return null;
  if (!/^(Act|Seal|Finale|Epilogue)/.test(head)) return null;
  return { key: head, kicker: head, title: tail || head };
}

function renderSeals() {
  const flags = new Set(state?.flags ?? []);
  $("seals").innerHTML = (
    [
      ["seal_cellar", "Cellar"],
      ["seal_well", "Well"],
      ["seal_store", "Store"],
    ] as const
  )
    .map(([f, label]) => `<span class="seal ${flags.has(f) ? "on" : ""}" title="Seal of the ${label}">◈ ${label}</span>`)
    .join("");
}

function renderMap(s: RoomState) {
  const wrap = $("dungeonMapWrap");
  const area = s.currentRoom ?? roomForNode(s.nodeId);
  const visited = new Set<DungeonRoomId>(s.visitedRooms ?? []);
  const show = !!area && visited.size > 0 && !puzzleKindForNode(s.nodeId);
  wrap.hidden = !show;
  if (!show) return;
  $("fogMask").innerHTML = (Object.keys(DUNGEON_ROOMS) as DungeonRoomId[])
    .map((id) => `<div class="fog ${visited.has(id) ? "revealed" : ""} ${id === area ? "here" : ""}" data-room="${id}" data-label="${visited.has(id) ? DUNGEON_ROOMS[id].label : "?"}"></div>`)
    .join("");
  $("mapTokens").innerHTML = (s.mapTokens ?? [])
    .filter((t) => visited.has(t.room))
    .map((t) => {
      const p = s.players.find((x) => x.playerId === t.playerId);
      return `<div class="pawn ${t.playerId === playerId ? "mine" : ""}" style="left:${t.x}%;top:${t.y}%" title="${esc(t.name)}">${p ? `<img src="${esc(p.portrait)}" alt="" />` : ""}</div>`;
    })
    .join("");
}

function renderChoices(s: RoomState) {
  const box = $("choices");
  const puzzleHost = $("puzzleHost");
  const voteBar = $("voteBar");
  box.innerHTML = "";
  puzzleHost.innerHTML = "";
  voteBar.hidden = true;
  voteBar.innerHTML = "";

  const cast = (choiceId: string) => {
    if (storyBusy) return;
    storyBusy = true;
    box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-busy", "true"));
    sfx("uiConfirm");
    if (s.players.length > 1) {
      send({ action: "CAST_VOTE", roomCode: s.roomCode, playerId, choiceId });
    } else {
      send({ action: "CHOOSE", roomCode: s.roomCode, playerId, choiceId });
    }
    window.setTimeout(() => (storyBusy = false), 2500);
  };

  if (puzzleKindForNode(s.nodeId)) {
    renderInteractivePuzzle(puzzleHost, {
      nodeId: s.nodeId,
      progress: s.puzzle,
      localPlayerId: playerId,
      playerCount: s.players.length,
      onChoose: (choiceId) => send({ action: "CHOOSE", roomCode: s.roomCode, playerId, choiceId }),
      onSolve: (sequence) => {
        sfx("uiConfirm");
        send({ action: "SOLVE_PUZZLE", roomCode: s.roomCode, playerId, sequence });
      },
      onClaim: () => send({ action: "CLAIM_PUZZLE", roomCode: s.roomCode, playerId }),
      onRelease: () => send({ action: "RELEASE_PUZZLE", roomCode: s.roomCode, playerId }),
      onHint: (slot, optionId) =>
        send({ action: "PUZZLE_HINT", roomCode: s.roomCode, playerId, slot, optionId }),
      onDraft: (puzzleDraft) =>
        send({ action: "PUZZLE_DRAFT", roomCode: s.roomCode, playerId, puzzleDraft }),
    });
    return;
  }

  if (s.heldCheck?.playerId === playerId) {
    box.innerHTML = `<p class="roll-call">Throw ${esc(s.heldCheck.label)} on your phone</p>`;
    return;
  }
  if (s.nodeType === "skill_check" && s.skillCheck) {
    const c = s.skillCheck;
    const skill = (c.skill ?? c.ability).replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
    const roster = s.checkOffer?.roster ?? [];
    const helpers = new Set(s.checkOffer?.helpers ?? []);
    box.innerHTML = `
      <p class="meta">Who attempts ${esc(skill)} (DC ${c.dc})? Help from an ally grants advantage — pledge it before they roll.</p>
      <div class="check-roster">${roster
        .map((r) => {
          const mine = r.playerId === playerId;
          return `<button type="button" class="choice ${mine ? "primary" : ""}" data-volunteer="${esc(r.playerId)}" ${mine ? "" : "disabled"} title="${mine ? "Step up" : "Only they can volunteer"}"><span class="choice-n">${r.bonus >= 0 ? "+" : ""}${r.bonus}</span><span>${esc(r.name)}${helpers.has(r.playerId) ? " · helping" : ""}</span></button>`;
        })
        .join("")}
      </div>
      ${
        playerId && roster.some((r) => r.playerId !== playerId)
          ? `<button type="button" class="choice" id="btnHelp">Pledge Help (advantage)</button>`
          : ""
      }`;
    box.querySelectorAll<HTMLElement>("[data-volunteer]").forEach((b) =>
      b.addEventListener("click", () => {
        if (b.hasAttribute("disabled") || b.dataset.volunteer !== playerId) return;
        sfx("uiConfirm");
        send({ action: "VOLUNTEER_CHECK", roomCode: s.roomCode, playerId });
      }),
    );
    box.querySelector("#btnHelp")?.addEventListener("click", () =>
      send({ action: "VOLUNTEER_CHECK", roomCode: s.roomCode, playerId, help: true }),
    );
    return;
  }

  if (s.nodeId === "END_SAVE" || s.nodeId === "END_WIN") {
    box.innerHTML = `<button type="button" class="choice primary" id="btnHome" data-autofocus><span class="choice-n">↩</span><span>${s.nodeId === "END_WIN" ? "Return to the title" : "Rest here — return to the title"}</span></button>`;
    $("btnHome").addEventListener("click", () => {
      sfx("uiConfirm");
      if (s.nodeId === "END_WIN") clearSession("campaign");
      state = null;
      showPage("home");
    });
    return;
  }
  if (s.nodeType === "encounter" && !s.combat) {
    box.innerHTML = `<button type="button" class="choice primary" id="btnBeginFight" data-autofocus><span class="choice-n">⚔</span><span>Roll initiative</span></button>
      <button type="button" class="choice" id="btnStepBack"><span class="choice-n">↩</span><span>Step back to safer ground</span></button>`;
    $("btnBeginFight").addEventListener("click", () => send({ action: "BEGIN_COMBAT", roomCode: s.roomCode }));
    $("btnStepBack").addEventListener("click", () => send({ action: "WITHDRAW", roomCode: s.roomCode }));
    return;
  }

  if (s.vote && s.players.length > 1) {
    const sec = Math.ceil(s.vote.remainingMs / 1000);
    voteBar.hidden = false;
    voteBar.innerHTML = `<span class="vote-chip timer">Party vote · ${sec}s</span>
      <button type="button" class="ghost" id="btnCloseVote">Decide now</button>`;
    $("btnCloseVote")?.addEventListener("click", () =>
      send({ action: "CLOSE_VOTE", roomCode: s.roomCode, playerId }),
    );
  }

  box.innerHTML = s.choices
    .map((ch, i) => {
      const voters = s.vote?.votes.filter((v) => v.choiceId === ch.id) ?? [];
      const mine = voters.some((v) => v.playerId === playerId);
      const pawns = voters
        .map((v) =>
          v.portrait
            ? `<img class="choice-pawn" src="${esc(v.portrait)}" alt="" title="${esc(v.name)}" />`
            : `<i class="choice-pawn" title="${esc(v.name)}">${esc(v.name.slice(0, 1))}</i>`,
        )
        .join("");
      return `<button type="button" class="choice ${i === 0 ? "primary guided" : ""} ${mine ? "voted" : ""}" data-choice="${esc(ch.id)}" ${i === 0 ? "data-autofocus" : ""}><span class="choice-n">${i + 1}</span><span>${esc(ch.label)}</span>${pawns ? `<span class="choice-votes">${pawns}</span>` : ""}</button>`;
    })
    .join("");
  box.querySelectorAll<HTMLElement>("[data-choice]").forEach((b) =>
    b.addEventListener("click", () => cast(b.dataset.choice!)),
  );
  const rest = s.rest;
  if (!s.combat && s.nodeType !== "encounter" && rest?.offer && (rest.canShort || rest.canLong)) {
    const note = `<p class="rest-note">This tale allows one long rest or two short rests · ${rest.budget} left</p>`;
    const shortBtn = rest.canShort
      ? `<button type="button" class="choice" id="btnShortRest"><span class="choice-n">☾</span><span>Short rest · costs 1</span></button>`
      : "";
    const longBtn = rest.canLong
      ? `<button type="button" class="choice" id="btnLongRest"><span class="choice-n">☼</span><span>Long rest · costs 2</span></button>`
      : "";
    box.insertAdjacentHTML("beforeend", `${note}${shortBtn}${longBtn}`);
    $("btnShortRest")?.addEventListener("click", () => send({ action: "SHORT_REST", roomCode: s.roomCode }));
    $("btnLongRest")?.addEventListener("click", () => send({ action: "LONG_REST", roomCode: s.roomCode }));
  }
}

async function renderStory(s: RoomState) {
  showPage("story");
  const scene = sceneForNode(s.nodeId);
  setScene(scene.art, scene.tone);
  setMusic(musicFor(s));
  $("storyChapter").textContent = scene.chapter;
  $("storyTitle").textContent = scene.title;
  $("roomMeta").textContent = `Table ${s.roomCode}`;
  renderSeals();
  renderMap(s);

  const storyKey = `${s.nodeId}:${s.narrationSeq}`;
  const fresh = storyKey !== lastStoryKey;
  lastStoryKey = storyKey;
  const box = $("narration");
  const text = s.narration ?? "";
  const speakerCard = $("speakerCard");
  if (s.speaker?.portrait) {
    speakerCard.hidden = false;
    ($("speakerPortrait") as HTMLImageElement).src = s.speaker.portrait;
    $("speakerName").textContent = s.speaker.name;
  } else {
    speakerCard.hidden = true;
  }
  if (fresh) {
    box.innerHTML = sentences(text, s.cast);
    box.classList.remove("line-in");
    void box.offsetWidth;
    box.classList.add("line-in");
  }

  const diceList = (s.diceQueue?.length ? s.diceQueue : s.lastDice ? [s.lastDice] : []).filter(isD20);
  const dice = diceList[diceList.length - 1];
  const diceLine = $("storyDice");
  if (dice) {
    const vs = dice.vs ? ` vs ${dice.vs.kind} ${dice.vs.value}` : "";
    const word = dice.outcome === "success" ? " — success" : dice.outcome === "fail" ? " — failed" : "";
    diceLine.textContent = `${dice.roller} · ${dice.label ?? dice.purpose}: ${dice.total}${vs}${word}`;
    diceLine.hidden = false;
  } else diceLine.hidden = true;

  storyBusy = false;
  renderChoices(s);
  prefetchVoice(s.voice);
  if (!fresh) return;

  if (fresh && s.fx === "arrows") {
    sfx("arrow", { gain: 0.85, jitter: 0.02 });
  }

  if (dice && diceList.some((d) => d.id !== lastDiceId) && !resumedFirstState && fresh) {
    box.classList.add("held");
    for (const roll of diceList) {
      if (roll.id === lastDiceId) continue;
      lastDiceId = roll.id;
      await rollD20(roll);
      if (roll.outcome === "fail") sfx("arrowHit", { gain: 0.55, delay: 0.05 });
    }
    box.classList.remove("held");
  } else if (dice) lastDiceId = dice.id;

  const chapter = chapterOf(scene.chapter);
  if (chapter && chapter.key !== lastChapterKey) {
    lastChapterKey = chapter.key;
    if (!resumedFirstState) await chapterCard(chapter.kicker, chapter.title);
  }
  if (state?.nodeId !== s.nodeId || state.narrationSeq !== s.narrationSeq) return;
  if (s.nodeId === "END_WIN" || s.nodeId === "epilogue") sfx("victory", { jitter: 0, gain: 0.6 });
  if (/seal/i.test(text) && /Seal of the/i.test(text) && s.seals > 0) sfx("seal", { gain: 0.7 });
  void speak(s.voice, { interrupt: true });
}

// ------------------------------------------------------------------ routing

let routing: Promise<void> = Promise.resolve();

function route() {
  routing = routing.then(routeNow).catch((err) => console.error(err));
}

async function routeNow() {
  const s = state;
  if (!s) return;
  renderParty();
  document.body.dataset.room = roomScene(s);
  const seated = !!playerId && s.players.some((p) => p.playerId === playerId);

  if (s.mode === "arena") {
    if (s.combat) {
      showPage("combat");
      setScene(sceneForNode("fight_cellar_rats").art, "ember");
      setMusic(musicFor(s));
      $("combatChapter").textContent = s.arena?.formatLabel ?? "Arena";
      $("combatTitle").textContent = s.arena?.name || s.roomCode;
      await combat.render(s, { resumed: resumedFirstState });
      resumedFirstState = false;
      return;
    }
    if (page === "combat" && combat.wantsOutro(s)) {
      const outro = s.combatOutro!;
      await combat.playOutro(s);
      void speak(outro.voice, { interrupt: false });
    }
    showPage("lobby");
    renderLobby();
    return;
  }

  const watching = s.players.length > 0 && (spectating || storyMovedOn(s));
  if (!seated && !s.combat && page !== "story" && !watching) {
    showPage("lobby");
    renderLobby();
    return;
  }
  if (s.combat) {
    const scene = sceneForNode(s.nodeId);
    showPage("combat");
    setScene(scene.art, "ember");
    setMusic(musicFor(s));
    $("combatChapter").textContent = scene.chapter;
    $("combatTitle").textContent = scene.title;
    await combat.render(s, { resumed: resumedFirstState });
    resumedFirstState = false;
    return;
  }
  if (page === "combat" && combat.wantsOutro(s)) {
    const outro = s.combatOutro!;
    await combat.playOutro(s);
    void speak(outro.voice, { interrupt: false });
  }
  setDefeat(false);
  await renderStory(s);
  resumedFirstState = false;
}

// ------------------------------------------------------------------ connection

function onRoomState(next: RoomState) {
  state = next;
  pendingTable = null;
  tableError = null;
  const queuedHero = pendingHeroId;
  pendingHeroId = null;
  setCast(next.cast);
  if (next.localPlayerId) playerId = next.localPlayerId;
  joining = false;
  pendingRejoin = null;
  const me = next.players.find((p) => p.playerId === playerId);
  if (me || next.players.length === 0 || spectating) {
    const mode: SessionMode = next.mode === "arena" || next.arena ? "arena" : "campaign";
    saveSession(mode, {
      roomCode: next.roomCode,
      playerId,
      hero: me?.characterName,
      place:
        mode === "arena"
          ? next.arena?.name || next.arena?.formatLabel || next.roomCode
          : sceneForNode(next.nodeId).title,
      autosaveId: next.autosaveId,
    });
  }
  if (next.autosaveId && lastAutosave && lastAutosave !== `${next.autosaveId}:${next.nodeId}` && !next.combat) {
    const chip = $("savedChip");
    chip.hidden = false;
    chip.classList.remove("show");
    void chip.offsetWidth;
    chip.classList.add("show");
    window.clearTimeout(savedTimer);
    savedTimer = window.setTimeout(() => (chip.hidden = true), 2600);
  }
  lastAutosave = next.autosaveId ? `${next.autosaveId}:${next.nodeId}` : lastAutosave;
  const alreadySeated = !!queuedHero && next.players.some((p) => p.playerId === playerId && p.characterId === queuedHero);
  if (queuedHero && next.roomCode && !alreadySeated) seatHero(queuedHero);
  route();
}

function onError(code: string, action?: string) {
  joining = false;
  if (action === "CREATE_ROOM" || action === "CREATE_ARENA") {
    pendingTable = null;
    pendingHeroId = null;
    tableError = describeError(code);
    sfx("uiError");
    toast(tableError, "bad");
    if (page !== "lobby") showPage("lobby");
    else renderLobby();
    return;
  }
  if (action === "CREATE_CHARACTER" || action === "ROLL_ABILITIES") chargenApi?.failed();
  if (action === "REJOIN" || (code === "ROOM_NOT_FOUND" && pendingRejoin)) {
    const session = pendingRejoin;
    const mode: SessionMode = session?.mode === "arena" ? "arena" : "campaign";
    pendingRejoin = null;
    if (session?.autosaveId && mode === "campaign") {
      toast("The table was closed — picking up from the last autosave.", "info");
      resumedFirstState = true;
      send({ action: "RESUME_SAVE", saveId: session.autosaveId });
      return;
    }
    clearSession(mode);
    toast(
      mode === "arena"
        ? "That arena is gone. Create a new one, or join with a code."
        : "That table is gone and there's no save to return to. Begin a new tale.",
      "bad",
    );
    showPage("home");
    return;
  }
  sfx("uiError");
  toast(describeError(code), "bad");
}

function connect() {
  if (ws && ws.readyState !== WebSocket.CLOSED) return;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const sock = new WebSocket(`${proto}://${location.host}/ws?console=${encodeURIComponent(consoleId())}`);
  ws = sock;
  const conn = $("conn");
  sock.addEventListener("open", () => {
    if (ws !== sock) return;
    reconnectDelay = 800;
    conn.textContent = "Table live";
    conn.className = "conn ok";
  });
  sock.addEventListener("close", () => {
    if (ws !== sock) return;
    reportedView = "";
    if (!account) {
      conn.textContent = "Signed out";
      conn.className = "conn";
      return;
    }
    conn.textContent = "Reconnecting…";
    conn.className = "conn bad";
    window.setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(8000, reconnectDelay * 1.6);
  });
  sock.addEventListener("message", (ev) => {
    if (ws !== sock) return;
    let msg: { eventType: string; payload: any };
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    switch (msg.eventType) {
      case "HELLO": {
        campaigns = msg.payload.campaigns ?? [];
        pregens = msg.payload.pregens ?? [];
        portraits = msg.payload.portraits ?? [];
        arenaMonsters = msg.payload.arena?.monsters ?? arenaMonsters;
        const catalog = msg.payload.chargen as ChargenCatalog | undefined;
        if (catalog && !chargenApi) {
          chargenApi = mountChargen({ root: $("chargenHost"), catalog, portraits, send, onCreated: (id) => (selectedHero = id) });
        } else if (catalog) chargenApi?.refresh(catalog);
        if (page === "lobby") renderLobby();
        reportView(true);
        if (!state?.roomCode) flushPendingTable();
        if (state?.roomCode) {
          resumedFirstState = true;
          send({ action: "REJOIN", roomCode: state.roomCode, playerId: playerId ?? undefined });
        } else if (page === "home" && (loadSession("campaign") || loadSession("arena"))) {
          renderHome();
        }
        break;
      }
      case "SEAT":
        if (msg.payload.playerId) playerId = msg.payload.playerId;
        break;
      case "ARENA_LIST":
        arenaList = msg.payload?.arenas ?? [];
        if (page === "home" && homeView === "join") renderHome();
        break;
      case "ROOM_STATE":
        onRoomState(msg.payload as RoomState);
        break;
      case "PREGENS":
        pregens = msg.payload.pregens ?? pregens;
        if (page === "lobby") renderLobby();
        break;
      case "CHARACTER_CREATED": {
        pregens = msg.payload.pregens ?? pregens;
        const hero = msg.payload.character;
        if (hero?.id) selectedHero = hero.id;
        chargenApi?.onCreatedClose();
        renderLobby();
        requestAnimationFrame(() => $("heroGrid").querySelector<HTMLElement>(`[data-hero="${CSS.escape(hero?.id ?? "")}"]`)?.focus());
        sfx("seal", { gain: 0.6 });
        toast(`${hero?.name ?? "Your hero"} is ready. Press OK on the card to begin.`, "ok");
        break;
      }
      case "ABILITY_ROLLS":
        chargenApi?.applyRolls(msg.payload.scores ?? []);
        break;
      case "SAVE_ACK":
        toast(`Saved. Code: ${msg.payload.saveId}`, "ok");
        break;
      case "PAIR_OFFER":
        phoneLinkOffer(msg.payload);
        break;
      case "COMPANION_LINK":
        phoneLinkStatus(msg.payload);
        break;
      case "POINTER":
        onPointer(msg.payload as TrackpadEvent);
        break;
      case "ERROR":
        onError(msg.payload?.code, msg.payload?.action);
        break;
      default:
        break;
    }
  });
}

// ------------------------------------------------------------------ remote

function handleBack(): boolean {
  if (adminOpen() && handleAdminKey("back")) return true;
  if (adminOpen()) {
    closeAdmin();
    return true;
  }
  if (!$("leaveModal").hidden) {
    closeLeaveModal();
    return true;
  }
  if (settingsOpen()) {
    closeSettings();
    return true;
  }
  const cg = document.querySelector(".chargen-panel.is-open");
  if (cg) {
    chargenApi?.back();
    return true;
  }
  if (page === "lobby") {
    spectating = false;
    sfx("uiBack");
    showPage("home");
    return true;
  }
  if (page === "story" && state && puzzleBack(state.nodeId)) {
    sfx("uiBack");
    renderChoices(state);
    return true;
  }
  if (page === "story" || page === "combat") {
    openLeaveModal();
    return true;
  }
  if (page === "home" && isNarrating()) {
    stopNarration();
    return true;
  }
  return false;
}

registerNativeBack(() => page === "home" && !settingsOpen() && !document.querySelector(".modal:not([hidden])"));

window.addEventListener("keydown", (e) => {
  unlockAudio();
  const key = remoteKey(e);
  const target = e.target as HTMLElement;
  const typing =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable;
  if (typing && e.key !== "Escape") {
    if (key === "up" || key === "down") {
      e.preventDefault();
      moveFocus(key);
    }
    return;
  }
  if (!key) {
    if (!typing && (e.key === "m" || e.key === "M")) toggleMusic();
    if (!typing && page === "story" && /^[1-9]$/.test(e.key)) {
      const b = $("choices").querySelectorAll<HTMLElement>("[data-choice]")[Number(e.key) - 1];
      b?.click();
    }
    if (!typing && (e.key === "s" || e.key === "S")) openTableSettings();
    return;
  }
  if (key === "menu") {
    e.preventDefault();
    if (adminOpen()) closeAdmin();
    else if (!$("leaveModal").hidden) closeLeaveModal();
    else if (settingsOpen()) closeSettings();
    else openTableSettings();
    return;
  }
  if (adminOpen() && handleAdminKey(key)) {
    e.preventDefault();
    return;
  }
  if (!settingsOpen() && $("leaveModal").hidden && page === "combat" && !document.querySelector(".modal:not([hidden])") && combat.handleKey(key)) {
    e.preventDefault();
    return;
  }
  switch (key) {
    case "back":
      if (handleBack()) e.preventDefault();
      return;
    case "play":
      e.preventDefault();
      replayNarration();
      return;
    case "rew":
    case "ff":
      return;
    case "ok":
      if (target instanceof HTMLButtonElement) sfx("uiMove", { gain: 0.001 });
      return;
    case "up":
    case "down":
    case "left":
    case "right":
      if (ownsArrows(target, key)) return;
      e.preventDefault();
      moveFocus(key);
      return;
    default: {
      const exhaustive: never = key as never;
      void exhaustive;
    }
  }
});
window.addEventListener("pointerdown", () => unlockAudio());

onMusicChange((m) => {
  const el = $("nowPlaying");
  el.classList.toggle("off", !m.enabled);
  el.classList.toggle("live", m.enabled && m.playing);
  $("musicKicker").textContent = m.enabled ? "Now playing" : "Music muted";
  $("musicTitle").textContent = m.title;
});

void (sceneLabel satisfies (s: RoomScene) => string);
void ({} as RemoteKey);

setScene(ART.home, "warm");
renderHome();

async function readAccount(res: Response): Promise<Account | null> {
  try {
    const data = (await res.json()) as { user?: { username?: string; role?: string } };
    const role = data.user?.role;
    if (role !== "admin" && role !== "player") return null;
    return { username: String(data.user?.username ?? ""), role };
  } catch {
    return null;
  }
}

async function logOut(): Promise<void> {
  unlinkPhone("logout");
  nativeAmazonSignOut();
  await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
  account = null;
  reportedView = "";
  resetPhoneLink();
  const options = await fetch("/api/auth/options", { credentials: "same-origin" })
    .then((r) => (r.ok ? (r.json() as Promise<{ amazon?: boolean }>) : null))
    .catch(() => null);
  amazonOnServer = options?.amazon === true;
  showLoginGate();
  renderHome();
  ws?.close();
}

/** A session cookie was just set: open a socket that carries it, replacing any anonymous one. */
async function signedIn(res: Response): Promise<void> {
  account = await readAccount(res);
  if (!account) {
    $("loginError").textContent = describeError("BAD_LOGIN");
    return;
  }
  $("loginGate").hidden = true;
  renderHome();
  const stale = ws;
  ws = null;
  stale?.close();
  connect();
  requestAnimationFrame(() => restoreFocus());
}

async function failedLogin(res: Response, fallback: string): Promise<void> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  $("loginError").textContent = describeError(body?.error ?? fallback);
}

$("loginForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  $("loginError").textContent = "";
  const res = await fetch("/api/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: ($("loginUser") as HTMLInputElement).value,
      password: ($("loginPass") as HTMLInputElement).value,
    }),
  });
  if (!res.ok) {
    await failedLogin(res, "BAD_LOGIN");
    return;
  }
  await signedIn(res);
});

// ------------------------------------------------------------------ Login with Amazon

let amazonOnServer = false;
let amazonBusy = false;

async function loginWithAmazonToken(accessToken: string): Promise<void> {
  const res = await fetch("/api/login/amazon", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken }),
  });
  amazonBusy = false;
  paintAmazon();
  if (!res.ok) {
    await failedLogin(res, "AMAZON_FAILED");
    return;
  }
  await signedIn(res);
}

/** Interactive: the player pressed the button. Silent: a start-up attempt that only works once approved. */
function amazonOnStick(interactive: boolean): void {
  if (amazonBusy) return;
  amazonBusy = true;
  paintAmazon();
  const started = nativeAmazonSignIn(interactive, {
    token: (t) => void loginWithAmazonToken(t),
    error: (code) => {
      amazonBusy = false;
      paintAmazon();
      if (interactive) $("loginError").textContent = describeError(code);
    },
  });
  if (!started) {
    amazonBusy = false;
    paintAmazon();
  }
}

function paintAmazon(): void {
  const onStick = nativeApp() !== null;
  const ready = amazonOnServer && (!onStick || nativeAmazonReady());
  const btn = $("btnAmazon") as HTMLButtonElement;
  btn.disabled = !ready || amazonBusy;
  btn.textContent = amazonBusy ? "Asking Amazon…" : "Continue with Amazon";
  $("amazonNote").textContent = ready
    ? onStick
      ? "The Amazon account on this Fire TV. You approve it once."
      : "Use your Amazon account. You approve it once."
    : describeError("AMAZON_NOT_CONFIGURED");
}

$("btnAmazon").addEventListener("click", () => {
  $("loginError").textContent = "";
  if (nativeApp()) {
    amazonOnStick(true);
    return;
  }
  location.href = "/api/login/amazon/start";
});

function showLoginGate(): void {
  const onStick = nativeApp() !== null;
  const gate = $("loginGate");
  gate.classList.toggle("on-stick", onStick);
  ($("loginTest") as HTMLDetailsElement).open = !onStick || !amazonOnServer;
  paintAmazon();
  gate.hidden = false;
  requestAnimationFrame(() => restoreFocus());
}

/** `?login_error=` comes back from the Amazon redirect; show it once and clean the address. */
function takeLoginError(): void {
  const params = new URLSearchParams(location.search);
  const code = params.get("login_error");
  if (!code) return;
  params.delete("login_error");
  const rest = params.toString();
  history.replaceState(null, "", `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`);
  $("loginError").textContent = describeError(code);
}

async function ensureLogin(): Promise<void> {
  const [me, options] = await Promise.all([
    fetch("/api/me", { credentials: "same-origin" }),
    fetch("/api/auth/options", { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<{ amazon?: boolean }>) : null))
      .catch(() => null),
  ]);
  amazonOnServer = options?.amazon === true;
  if (me.ok) {
    account = await readAccount(me);
    $("loginGate").hidden = true;
    renderHome();
    return;
  }
  showLoginGate();
  takeLoginError();
  if (amazonOnServer && nativeAmazonReady()) amazonOnStick(false);
}

mountPhoneLink({ deliver, onChange: () => undefined });
phoneLinkHost("home", $("homeQr"), $("homeQrHint"), {
  idle: "Scan with your phone: it becomes your controller, with your sheet and your dice.",
  linked: "Log out to unlink it.",
});
phoneLinkHost("lobby", $("lobbyQr"), $("lobbyQrHint"), {
  idle: "Scan with your phone to play from it.",
  linked: "Log out or go back to the title to unlink it.",
});
mountPointer({
  boardPoint: (x, y) => page === "combat" && combat.pointAt(x, y),
  boardPan: (dx, dy) => page === "combat" && combat.panBy(dx, dy),
  boardZoom: (factor) => page === "combat" && combat.zoomBy(factor),
});

void ensureLogin().then(() => {
  requestAnimationFrame(() => restoreFocus());
  if (account) connect();
});

if (import.meta.env.DEV) {
  (window as unknown as { __table: object }).__table = { isNarrating, page: () => page };
}
