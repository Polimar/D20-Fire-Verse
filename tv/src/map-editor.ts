/**
 * Admin map painter: floor / wall / hazard on imported grids.
 * Mouse drags paint; the D-pad moves a cell cursor and OK stamps.
 */

import { cropStyle, DUNGEON_ROOMS, roomForMapId } from "./dungeon-map";
import type { RemoteKey } from "./nav";
import { sfx } from "./sfx";

export type MapSource = "campaign" | "arena";
export type Brush = "floor" | "wall" | "hazard";

export type MapListItem = {
  source: MapSource;
  id: string;
  name: string;
  width: number;
  height: number;
};

export type MapPaint = {
  source: MapSource;
  id: string;
  name: string;
  width: number;
  height: number;
  walls: Array<{ x: number; y: number; w: number; h: number }>;
  hazards: Array<{ x: number; y: number; w: number; h: number }>;
  spawn?: {
    pcs?: Array<{ x: number; y: number }>;
    enemies?: Array<{ x: number; y: number }>;
    ffa?: Array<{ x: number; y: number }>;
    teamA?: Array<{ x: number; y: number }>;
    teamB?: Array<{ x: number; y: number }>;
  };
  labels?: Record<string, { x: number; y: number }> | null;
  art?: string | null;
};

type SpawnGroup = "pcs" | "enemies" | "ffa" | "teamA" | "teamB";
type SpawnBag = Record<SpawnGroup, Array<{ x: number; y: number }>>;
type Held = { kind: "spawn"; group: SpawnGroup; index: number } | { kind: "label"; name: string };
type Pin = Held & { x: number; y: number; letter: string; title: string; cls: string; key: string };

export type MapPaintSession = {
  spec: MapPaint;
  walls: boolean[][];
  hazards: boolean[][];
  spawn: SpawnBag;
  labels: Record<string, { x: number; y: number }>;
  held: Held | null;
  brush: Brush;
  cx: number;
  cy: number;
  dirty: boolean;
  painting: boolean;
  zoomI: number;
  drag: { x: number; y: number } | null;
};

const ZOOM = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4];
const ZOOM_DEFAULT = ZOOM.indexOf(1);

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function empty(w: number, h: number): boolean[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => false));
}

function stampRects(g: boolean[][], rects: Array<{ x: number; y: number; w: number; h: number }> | undefined) {
  const h = g.length;
  const w = g[0]?.length ?? 0;
  for (const r of rects ?? []) {
    for (let y = r.y; y < r.y + r.h && y < h; y += 1) {
      for (let x = r.x; x < r.x + r.w && x < w; x += 1) {
        if (y >= 0 && x >= 0) g[y]![x] = true;
      }
    }
  }
}

function clonePts(list: Array<{ x: number; y: number }> | undefined) {
  return (list ?? []).map((p) => ({ x: p.x, y: p.y }));
}

function spawnBag(spec: MapPaint): SpawnBag {
  return {
    pcs: clonePts(spec.spawn?.pcs),
    enemies: clonePts(spec.spawn?.enemies),
    ffa: clonePts(spec.spawn?.ffa),
    teamA: clonePts(spec.spawn?.teamA),
    teamB: clonePts(spec.spawn?.teamB),
  };
}

function prettyName(name: string) {
  return name.replace(/_/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function heldKey(h: Held) {
  return h.kind === "spawn" ? `spawn:${h.group}:${h.index}` : `label:${h.name}`;
}

function pins(s: MapPaintSession): Pin[] {
  const out: Pin[] = [];
  const add = (group: SpawnGroup, letter: string, title: string, cls: string) => {
    const list = s.spawn[group];
    list.forEach((p, index) => {
      const numbered = list.length > 1;
      out.push({
        kind: "spawn",
        group,
        index,
        x: p.x,
        y: p.y,
        letter: numbered ? `${letter}${index + 1}` : letter,
        title,
        cls,
        key: `spawn:${group}:${index}`,
      });
    });
  };
  add("pcs", "H", "PvE hero", "spawn-pve-h");
  add("enemies", "E", "PvE enemy", "spawn-pve-e");
  add("ffa", "F", "PvP free-for-all", "spawn-ffa");
  add("teamA", "A", "Team A", "spawn-team-a");
  add("teamB", "B", "Team B", "spawn-team-b");
  for (const [name, p] of Object.entries(s.labels)) {
    out.push({
      kind: "label",
      name,
      x: p.x,
      y: p.y,
      letter: name.slice(0, 1).toUpperCase(),
      title: prettyName(name),
      cls: "lab",
      key: `label:${name}`,
    });
  }
  return out;
}

function pinPos(s: MapPaintSession, h: Held): { x: number; y: number } {
  if (h.kind === "spawn") return s.spawn[h.group][h.index]!;
  return s.labels[h.name]!;
}

function setPinPos(s: MapPaintSession, h: Held, x: number, y: number) {
  if (h.kind === "spawn") s.spawn[h.group][h.index] = { x, y };
  else s.labels[h.name] = { x, y };
  s.dirty = true;
}

function artVars(spec: MapPaint): { cls: string; style: string } {
  if (spec.source === "campaign") {
    const room = roomForMapId(spec.id);
    if (room) {
      const crop = cropStyle(DUNGEON_ROOMS[room]);
      return {
        cls: "has-art",
        style: `;--map-art:url('/art/dungeon-map.jpg');--map-art-size:${crop.size};--map-art-pos:${crop.position}`,
      };
    }
  }
  if (spec.art?.startsWith("/")) {
    return { cls: "has-art", style: `;--map-art:url('${esc(spec.art)}')` };
  }
  return { cls: "", style: "" };
}

let session: MapPaintSession | null = null;
let onBackToList: (() => void) | null = null;
let persistSession: (() => Promise<void>) | null = null;
let cellObserver: ResizeObserver | null = null;
let bumpZoom: ((delta: number, pivot?: { clientX: number; clientY: number }) => void) | null = null;
let applyPick: ((h: Held | null) => void) | null = null;
let applyDrop: ((x: number, y: number) => boolean) | null = null;

export function mapEditorOpen(): boolean {
  return !!session && !!document.getElementById("mapPaint");
}

export function closeMapEditor() {
  cellObserver?.disconnect();
  cellObserver = null;
  bumpZoom = null;
  applyPick = null;
  applyDrop = null;
  persistSession = null;
  session = null;
  onBackToList = null;
}

/** Write dirty terrain / spawn / labels before leaving the painter. */
export async function flushMapEditor(): Promise<boolean> {
  if (!session?.dirty || !persistSession) return true;
  try {
    await persistSession();
    session.dirty = false;
    return true;
  } catch {
    return false;
  }
}

function kindAt(s: MapPaintSession, x: number, y: number): Brush {
  if (s.walls[y]?.[x]) return "wall";
  if (s.hazards[y]?.[x]) return "hazard";
  return "floor";
}

function paintCell(s: MapPaintSession, x: number, y: number) {
  if (x < 0 || y < 0 || x >= s.spec.width || y >= s.spec.height) return;
  if (s.brush === "wall") {
    s.walls[y]![x] = true;
    s.hazards[y]![x] = false;
  } else if (s.brush === "hazard") {
    s.walls[y]![x] = false;
    s.hazards[y]![x] = true;
  } else {
    s.walls[y]![x] = false;
    s.hazards[y]![x] = false;
  }
  s.dirty = true;
}

function cellEl(x: number, y: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(`#mapPaint [data-cell="${x},${y}"]`);
}

function paintCellDom(s: MapPaintSession, x: number, y: number) {
  const el = cellEl(x, y);
  if (!el) return;
  el.dataset.k = kindAt(s, x, y);
  el.classList.toggle("on", s.cx === x && s.cy === y);
  const here = pins(s).filter((p) => p.x === x && p.y === y);
  const hold = s.held ? heldKey(s.held) : "";
  el.querySelectorAll("i").forEach((n) => n.remove());
  el.insertAdjacentHTML(
    "beforeend",
    here.map((m) => `<i class="${m.cls}${m.key === hold ? " held" : ""}">${esc(m.letter)}</i>`).join(""),
  );
}

function setCursor(s: MapPaintSession, x: number, y: number) {
  const prev = cellEl(s.cx, s.cy);
  prev?.classList.remove("on");
  s.cx = x;
  s.cy = y;
  const el = cellEl(x, y);
  el?.classList.add("on");
  el?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function legendHtml(s: MapPaintSession) {
  const list = pins(s);
  const hold = s.held ? heldKey(s.held) : "";
  const terrain = `<ul class="map-legend map-legend-terrain">
      <li><span class="map-swatch floor" aria-hidden="true"></span><span><strong>Floor</strong> · Walkable</span></li>
      <li><span class="map-swatch wall" aria-hidden="true"></span><span><strong>Wall</strong> · Blocks walk and shots</span></li>
      <li><span class="map-swatch hazard" aria-hidden="true"></span><span><strong>Hazard</strong> · Blocks walk; shots pass</span></li>
    </ul>`;
  const section = (title: string, rows: Pin[]) => {
    if (!rows.length) return "";
    return `<div class="map-legend-section"><h5>${esc(title)}</h5><ul class="map-legend">${rows
      .map(
        (m) =>
          `<li><button type="button" class="ghost${m.key === hold ? " on" : ""}" data-mark="${esc(m.key)}" data-nav-key="mark-${esc(m.key)}"><strong class="${esc(m.cls)}">${esc(m.letter)}</strong> ${esc(m.title)}</button></li>`,
      )
      .join("")}</ul></div>`;
  };
  const pve = list.filter((m) => m.kind === "spawn" && (m.group === "pcs" || m.group === "enemies"));
  const ffa = list.filter((m) => m.kind === "spawn" && m.group === "ffa");
  const teams = list.filter((m) => m.kind === "spawn" && (m.group === "teamA" || m.group === "teamB"));
  const poi = list.filter((m) => m.kind === "label");
  return `${terrain}
    ${section("PvE", pve)}
    ${section("PvP free-for-all", ffa)}
    ${section("Teams", teams)}
    ${section("Points of interest", poi)}
    ${list.length ? "" : `<p class="admin-note">No spawn or POI markers on this map.</p>`}`;
}

function parseMark(raw: string | undefined): Held | null {
  if (!raw) return null;
  if (raw.startsWith("label:")) return { kind: "label", name: raw.slice(6) };
  const m = /^spawn:(pcs|enemies|ffa|teamA|teamB):(\d+)$/.exec(raw);
  if (!m) return null;
  return { kind: "spawn", group: m[1] as SpawnGroup, index: Number(m[2]) };
}

export function renderMapPainter(
  host: HTMLElement,
  spec: MapPaint,
  opts: { onBack: () => void; onSave: (s: MapPaintSession) => Promise<void> },
) {
  const walls = empty(spec.width, spec.height);
  const hazards = empty(spec.width, spec.height);
  stampRects(walls, spec.walls);
  stampRects(hazards, spec.hazards);
  session = {
    spec,
    walls,
    hazards,
    spawn: spawnBag(spec),
    labels: Object.fromEntries(Object.entries(spec.labels ?? {}).map(([k, p]) => [k, { x: p.x, y: p.y }])),
    held: null,
    brush: "wall",
    cx: 0,
    cy: 0,
    dirty: false,
    painting: false,
    zoomI: ZOOM_DEFAULT,
    drag: null,
  };
  onBackToList = opts.onBack;
  const s = session;
  const art = artVars(spec);
  let cells = "";
  const startPins = pins(s);
  for (let y = 0; y < spec.height; y += 1) {
    for (let x = 0; x < spec.width; x += 1) {
      const here = startPins.filter((m) => m.x === x && m.y === y);
      const badge = here.map((m) => `<i class="${m.cls}">${esc(m.letter)}</i>`).join("");
      cells += `<div class="map-cell" data-cell="${x},${y}" data-k="${kindAt(s, x, y)}">${badge}</div>`;
    }
  }
  host.innerHTML = `
    <div class="map-editor" id="mapEditor">
      <div class="map-toolbar" id="mapToolbar">
        <button type="button" class="ghost" data-brush="floor" data-nav-key="brush-floor">Floor</button>
        <button type="button" class="ghost on" data-brush="wall" data-nav-key="brush-wall" data-autofocus>Wall</button>
        <button type="button" class="ghost" data-brush="hazard" data-nav-key="brush-hazard">Hazard</button>
        <span class="meta" id="mapHint">Paint terrain, or pick a letter to move it</span>
        <button type="button" class="primary" id="mapSave" data-nav-key="map-save">Save</button>
        <button type="button" class="ghost" id="mapBack" data-nav-key="map-back">Back to maps</button>
      </div>
      <div class="map-stage">
      <div class="map-paint-view" id="mapPaintView">
      <div class="map-paint ${art.cls}" id="mapPaint" tabindex="0" data-arrows="all" data-nav-key="map-grid" data-no-scroll="1"
        style="--cols:${spec.width};--rows:${spec.height}${art.style}">${cells}</div>
      </div>
      <div class="zoom-rail" id="mapZoomRail" aria-label="Map zoom">
        <span class="zoom-pct" id="mapZoomPct">100%</span>
        <button type="button" id="mapZoomIn" data-nav-key="map-zoom-in" aria-label="Zoom in">+</button>
        <button type="button" class="zoom-track" id="mapZoomTrack" data-nav-key="map-zoom-track" data-arrows="all" role="slider" aria-label="Zoom" aria-orientation="vertical" aria-valuemin="50" aria-valuemax="400" aria-valuenow="100"></button>
      </div>
      </div>
      <div class="map-legend-wrap">
        <h4>Legend</h4>
        <div id="mapLegendHost">${legendHtml(s)}</div>
        <p class="admin-note">Pick a letter, then a walkable cell. Slot count stays the same.</p>
      </div>
    </div>`;
  const grid = host.querySelector<HTMLElement>("#mapPaint")!;
  const view = host.querySelector<HTMLElement>("#mapPaintView")!;
  const track = host.querySelector<HTMLElement>("#mapZoomTrack")!;
  const hint = () => host.querySelector("#mapHint");
  const paintZoom = () => {
    const t = s.zoomI / (ZOOM.length - 1);
    track.style.setProperty("--t", String(t));
    const pct = host.querySelector("#mapZoomPct");
    if (pct) pct.textContent = `${Math.round(ZOOM[s.zoomI]! * 100)}%`;
    track.setAttribute("aria-valuenow", String(Math.round(ZOOM[s.zoomI]! * 100)));
    host.querySelector<HTMLButtonElement>("#mapZoomIn")!.disabled = s.zoomI >= ZOOM.length - 1;
  };
  const layoutCells = () => {
    const aw = Math.max(1, view.clientWidth - 2);
    const base = Math.max(14, Math.ceil((aw * 0.75) / spec.width));
    const cell = Math.round(base * ZOOM[s.zoomI]!);
    grid.style.setProperty("--cell", `${cell}px`);
    paintZoom();
  };
  const setZoom = (next: number, pivot?: { clientX: number; clientY: number }) => {
    const i = Math.max(0, Math.min(ZOOM.length - 1, next));
    if (i === s.zoomI) return;
    const oldZ = ZOOM[s.zoomI]!;
    const rect = view.getBoundingClientRect();
    const px = (pivot ? pivot.clientX - rect.left : view.clientWidth / 2) + view.scrollLeft;
    const py = (pivot ? pivot.clientY - rect.top : view.clientHeight / 2) + view.scrollTop;
    s.zoomI = i;
    layoutCells();
    const scale = ZOOM[i]! / oldZ;
    const vx = pivot ? pivot.clientX - rect.left : view.clientWidth / 2;
    const vy = pivot ? pivot.clientY - rect.top : view.clientHeight / 2;
    view.scrollLeft = px * scale - vx;
    view.scrollTop = py * scale - vy;
  };
  bumpZoom = (delta, pivot) => setZoom(s.zoomI + delta, pivot);
  cellObserver?.disconnect();
  cellObserver = new ResizeObserver(() => layoutCells());
  cellObserver.observe(view);
  layoutCells();

  const paintLegend = () => {
    const box = host.querySelector("#mapLegendHost");
    if (box) box.innerHTML = legendHtml(s);
    box?.querySelectorAll<HTMLButtonElement>("[data-mark]").forEach((b) => {
      b.addEventListener("click", () => pick(parseMark(b.dataset.mark)));
    });
  };
  const pick = (h: Held | null) => {
    s.held = h;
    paintLegend();
    pins(s).forEach((p) => paintCellDom(s, p.x, p.y));
    const live = hint();
    if (live && h) {
      const pin = pins(s).find((p) => p.key === heldKey(h));
      live.textContent = pin ? `Moving ${pin.letter} · ${pin.title}. Click a walkable cell.` : "Moving a marker.";
    } else if (live) live.textContent = "Paint terrain, or pick a letter to move it";
    if (h) sfx("uiMove");
  };
  const drop = (x: number, y: number) => {
    if (!s.held) return false;
    if (kindAt(s, x, y) === "wall") {
      sfx("uiError");
      const live = hint();
      if (live) live.textContent = "Markers need a walkable cell.";
      return true;
    }
    const from = pinPos(s, s.held);
    setPinPos(s, s.held, x, y);
    paintCellDom(s, from.x, from.y);
    paintCellDom(s, x, y);
    pick(null);
    void persist("Marker saved.");
    return true;
  };
  applyPick = pick;
  applyDrop = drop;

  const setBrush = (b: Brush) => {
    s.brush = b;
    if (s.held) pick(null);
    host.querySelectorAll<HTMLElement>("[data-brush]").forEach((el) => el.classList.toggle("on", el.dataset.brush === b));
  };
  host.querySelectorAll<HTMLButtonElement>("[data-brush]").forEach((b) => {
    b.addEventListener("click", () => {
      setBrush(b.dataset.brush as Brush);
      sfx("uiMove");
    });
  });
  const persist = async (msg?: string) => {
    try {
      await opts.onSave(s);
      s.dirty = false;
      sfx("uiConfirm");
      const live = hint();
      if (live) live.textContent = msg ?? "Saved. The next fight uses this layout.";
      return true;
    } catch (err) {
      sfx("uiError");
      const live = hint();
      if (live) live.textContent = err instanceof Error ? err.message : "Save failed";
      return false;
    }
  };
  persistSession = async () => {
    if (!(await persist())) throw new Error("SAVE_FAILED");
  };
  const leave = async () => {
    if (s.dirty && !(await persist("Saved. Back to maps."))) return;
    opts.onBack();
  };
  onBackToList = () => {
    void leave();
  };
  paintLegend();
  host.querySelector("#mapBack")!.addEventListener("click", () => void leave());
  host.querySelector("#mapSave")!.addEventListener("click", () => void persist());

  const cellAt = (ev: PointerEvent) => {
    const r = grid.getBoundingClientRect();
    const size = Number.parseFloat(getComputedStyle(grid).getPropertyValue("--cell")) || 18;
    const x = Math.floor((ev.clientX - r.left) / size);
    const y = Math.floor((ev.clientY - r.top) / size);
    if (x < 0 || y < 0 || x >= spec.width || y >= spec.height) return null;
    return { x, y };
  };
  const clearSel = () => {
    grid.querySelectorAll(".sel").forEach((el) => el.classList.remove("sel"));
  };
  const markSel = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    clearSel();
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) cellEl(x, y)?.classList.add("sel");
    }
  };
  const stampRect = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        paintCell(s, x, y);
        paintCellDom(s, x, y);
      }
    }
    setCursor(s, b.x, b.y);
  };
  grid.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    const c = cellAt(ev);
    if (!c) return;
    grid.focus({ preventScroll: true });
    setCursor(s, c.x, c.y);
    if (s.held) {
      drop(c.x, c.y);
      return;
    }
    const here = pins(s).filter((p) => p.x === c.x && p.y === c.y);
    if (here[0]) {
      pick(here[0].kind === "spawn" ? { kind: "spawn", group: here[0].group, index: here[0].index } : { kind: "label", name: here[0].name });
      return;
    }
    s.painting = true;
    s.drag = c;
    grid.setPointerCapture?.(ev.pointerId);
    markSel(c, c);
  });
  grid.addEventListener("pointermove", (ev) => {
    if (!s.painting || !s.drag) return;
    const c = cellAt(ev);
    if (!c) return;
    markSel(s.drag, c);
    setCursor(s, c.x, c.y);
  });
  const endDrag = (ev: PointerEvent) => {
    if (!s.painting || !s.drag) return;
    const c = cellAt(ev) ?? { x: s.cx, y: s.cy };
    stampRect(s.drag, c);
    clearSel();
    s.painting = false;
    s.drag = null;
  };
  grid.addEventListener("pointerup", endDrag);
  grid.addEventListener("pointercancel", () => {
    clearSel();
    s.painting = false;
    s.drag = null;
  });
  host.querySelector("#mapZoomIn")!.addEventListener("click", () => bumpZoom?.(1));
  track.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    const r = track.getBoundingClientRect();
    const t = r.height < 2 ? 0 : 1 - Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
    bumpZoom?.(Math.round(t * (ZOOM.length - 1)) - s.zoomI);
    track.focus();
  });
  setCursor(s, 0, 0);
}

export function handleMapEditorKey(key: RemoteKey): boolean {
  const s = session;
  if (!s) return false;
  const grid = document.getElementById("mapPaint");
  const onGrid = document.activeElement === grid;
  const markBtn = (document.activeElement as HTMLElement | null)?.dataset.mark;
  if (key === "back") {
    if (s.held) {
      applyPick?.(null);
      sfx("uiBack");
      return true;
    }
    if (onGrid) {
      document.querySelector<HTMLElement>("[data-brush].on")?.focus();
      sfx("uiBack");
      return true;
    }
    onBackToList?.();
    return true;
  }
  if (markBtn) {
    if (key === "ok") {
      applyPick?.(parseMark(markBtn));
      grid?.focus({ preventScroll: true });
      sfx("uiConfirm");
      return true;
    }
    if (key === "down" || key === "right") {
      grid?.focus({ preventScroll: true });
      sfx("uiMove");
      return true;
    }
    return false;
  }
  const zoomId = (document.activeElement as HTMLElement | null)?.id;
  if (zoomId === "mapZoomIn" || zoomId === "mapZoomTrack") {
    if (key === "left") {
      grid?.focus({ preventScroll: true });
      sfx("uiMove");
      return true;
    }
    if (zoomId === "mapZoomIn") {
      if (key === "ok" || key === "up") {
        bumpZoom?.(1);
        sfx("uiConfirm");
        return true;
      }
      if (key === "down") {
        document.getElementById("mapZoomTrack")?.focus();
        sfx("uiMove");
        return true;
      }
      return true;
    }
    if (key === "up") {
      bumpZoom?.(1);
      sfx("uiMove");
      return true;
    }
    if (key === "down") {
      bumpZoom?.(-1);
      sfx("uiMove");
      return true;
    }
    if (key === "ok") return true;
    return true;
  }
  if (!onGrid) {
    if ((key === "down" || key === "right") && (document.activeElement as HTMLElement | null)?.dataset.brush) {
      grid?.focus({ preventScroll: true });
      sfx("uiMove");
      return true;
    }
    return false;
  }
  if (key === "ok") {
    if (s.held) {
      applyDrop?.(s.cx, s.cy);
      return true;
    }
    const here = pins(s).filter((p) => p.x === s.cx && p.y === s.cy);
    if (here[0]) {
      applyPick?.(
        here[0].kind === "spawn" ? { kind: "spawn", group: here[0].group, index: here[0].index } : { kind: "label", name: here[0].name },
      );
      return true;
    }
    paintCell(s, s.cx, s.cy);
    paintCellDom(s, s.cx, s.cy);
    sfx("uiConfirm");
    return true;
  }
  const step: Partial<Record<RemoteKey, [number, number]>> = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0],
  };
  const d = step[key];
  if (!d) return false;
  const nx = s.cx + d[0];
  const ny = s.cy + d[1];
  if (nx >= s.spec.width) {
    if (key === "right") {
      document.getElementById("mapZoomIn")?.focus();
      sfx("uiMove");
    }
    return true;
  }
  if (nx < 0 || ny < 0 || ny >= s.spec.height) {
    if (key === "up") {
      document.querySelector<HTMLElement>("[data-brush].on")?.focus();
      sfx("uiMove");
    }
    return true;
  }
  setCursor(s, nx, ny);
  sfx("uiMove");
  return true;
}

