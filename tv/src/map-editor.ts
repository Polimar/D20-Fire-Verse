/**
 * Admin map painter: floor / wall / hazard on imported grids.
 * Mouse drags paint; the D-pad moves a cell cursor and OK stamps.
 */

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

export type MapPaintSession = {
  spec: MapPaint;
  walls: boolean[][];
  hazards: boolean[][];
  brush: Brush;
  cx: number;
  cy: number;
  dirty: boolean;
  painting: boolean;
};

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

let session: MapPaintSession | null = null;
let onBackToList: (() => void) | null = null;
let cellObserver: ResizeObserver | null = null;

export function mapEditorOpen(): boolean {
  return !!session && !!document.getElementById("mapPaint");
}

export function closeMapEditor() {
  cellObserver?.disconnect();
  cellObserver = null;
  session = null;
  onBackToList = null;
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

function markers(spec: MapPaint): Array<{ x: number; y: number; label: string; cls: string }> {
  const out: Array<{ x: number; y: number; label: string; cls: string }> = [];
  for (const p of spec.spawn?.pcs ?? []) out.push({ x: p.x, y: p.y, label: "P", cls: "pc" });
  for (const p of spec.spawn?.enemies ?? []) out.push({ x: p.x, y: p.y, label: "E", cls: "foe" });
  for (const p of spec.spawn?.ffa ?? []) out.push({ x: p.x, y: p.y, label: "S", cls: "pc" });
  for (const p of spec.spawn?.teamA ?? []) out.push({ x: p.x, y: p.y, label: "A", cls: "pc" });
  for (const p of spec.spawn?.teamB ?? []) out.push({ x: p.x, y: p.y, label: "B", cls: "foe" });
  if (spec.labels) {
    for (const [name, p] of Object.entries(spec.labels)) {
      out.push({ x: p.x, y: p.y, label: name.slice(0, 1).toUpperCase(), cls: "lab" });
    }
  }
  return out;
}

function markAt(marks: ReturnType<typeof markers>, x: number, y: number) {
  return marks.filter((m) => m.x === x && m.y === y);
}

function prettyName(name: string) {
  return name.replace(/_/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function legendHtml(spec: MapPaint) {
  const terrain = [
    { cls: "floor", title: "Floor", note: "Walkable" },
    { cls: "wall", title: "Wall", note: "Blocks walk and shots" },
    { cls: "hazard", title: "Hazard", note: "Blocks walk; shots pass" },
  ];
  const letterRows: Array<{ letter: string; cls: string; title: string }> = [];
  const seen = new Set<string>();
  const pushLetter = (letter: string, cls: string, title: string) => {
    const key = `${letter}:${cls}:${title}`;
    if (seen.has(key)) return;
    seen.add(key);
    letterRows.push({ letter, cls, title });
  };
  if (spec.spawn?.pcs?.length) pushLetter("P", "pc", "Hero spawn");
  if (spec.spawn?.enemies?.length) pushLetter("E", "foe", "Enemy spawn");
  if (spec.spawn?.ffa?.length) pushLetter("S", "pc", "FFA spawn");
  if (spec.spawn?.teamA?.length) pushLetter("A", "pc", "Team A spawn");
  if (spec.spawn?.teamB?.length) pushLetter("B", "foe", "Team B spawn");
  if (spec.labels) {
    for (const name of Object.keys(spec.labels)) {
      pushLetter(name.slice(0, 1).toUpperCase(), "lab", prettyName(name));
    }
  }
  return `<div class="map-legend-wrap" id="mapLegend">
    <h4>Legend</h4>
    <ul class="map-legend">
      ${terrain
        .map(
          (t) =>
            `<li><span class="map-swatch ${t.cls}" aria-hidden="true"></span><span><strong>${esc(t.title)}</strong> · ${esc(t.note)}</span></li>`,
        )
        .join("")}
      ${letterRows
        .map(
          (r) =>
            `<li><strong class="map-mark ${r.cls}">${esc(r.letter)}</strong><span>${esc(r.title)}</span></li>`,
        )
        .join("")}
      ${letterRows.length ? "" : `<li class="meta">No spawn or POI letters on this map.</li>`}
    </ul>
  </div>`;
}

/** At least 75% of the painter width; height follows map aspect (view scrolls). */
function fitForPainter(pageW: number, spec: { width: number; height: number }) {
  const minMapW = Math.max(1, pageW * 0.75);
  return Math.max(14, Math.ceil(minMapW / spec.width));
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
    brush: "wall",
    cx: 0,
    cy: 0,
    dirty: false,
    painting: false,
  };
  onBackToList = opts.onBack;
  const s = session;
  const marks = markers(spec);
  const artUrl = spec.art && spec.art.startsWith("/") ? spec.art : "";
  const styleBits = [`--cols:${spec.width}`, `--rows:${spec.height}`, `--cell:18px`];
  if (artUrl) styleBits.push(`--map-art:url('${esc(artUrl)}')`);
  let cells = "";
  for (let y = 0; y < spec.height; y += 1) {
    for (let x = 0; x < spec.width; x += 1) {
      const ms = markAt(marks, x, y);
      const badge = ms.map((m) => `<i class="${m.cls}">${esc(m.label)}</i>`).join("");
      cells += `<div class="map-cell" data-cell="${x},${y}" data-k="${kindAt(s, x, y)}">${badge}</div>`;
    }
  }
  host.innerHTML = `
    <div class="map-editor" id="mapEditor">
      <div class="map-toolbar" id="mapToolbar">
        <button type="button" class="ghost" data-brush="floor" data-nav-key="brush-floor">Floor</button>
        <button type="button" class="ghost on" data-brush="wall" data-nav-key="brush-wall" data-autofocus>Wall</button>
        <button type="button" class="ghost" data-brush="hazard" data-nav-key="brush-hazard">Hazard</button>
        <span class="meta" id="mapHint">D-pad aim · OK paint · drag on a pointer · Back leaves the grid</span>
        <button type="button" class="primary" id="mapSave" data-nav-key="map-save">Save</button>
        <button type="button" class="ghost" id="mapBack" data-nav-key="map-back">Back to maps</button>
      </div>
      <div class="map-paint-view" id="mapPaintView">
        <div class="map-paint ${artUrl ? "has-art" : ""}" id="mapPaint" tabindex="0" data-arrows="all" data-nav-key="map-grid" data-no-scroll="1"
          style="${styleBits.join(";")}">${cells}</div>
      </div>
      ${legendHtml(spec)}
    </div>`;
  const grid = host.querySelector<HTMLElement>("#mapPaint")!;
  const view = host.querySelector<HTMLElement>("#mapPaintView")!;
  const layoutCells = () => {
    const pageW = Math.max(1, view.clientWidth - 2);
    const fit = fitForPainter(pageW, spec);
    grid.style.setProperty("--cell", `${fit}px`);
  };
  cellObserver?.disconnect();
  cellObserver = new ResizeObserver(() => layoutCells());
  cellObserver.observe(view);
  layoutCells();
  const setBrush = (b: Brush) => {
    s.brush = b;
    host.querySelectorAll<HTMLElement>("[data-brush]").forEach((el) => el.classList.toggle("on", el.dataset.brush === b));
  };
  host.querySelectorAll<HTMLButtonElement>("[data-brush]").forEach((b) => {
    b.addEventListener("click", () => {
      setBrush(b.dataset.brush as Brush);
      sfx("uiMove");
    });
  });
  host.querySelector("#mapBack")!.addEventListener("click", () => opts.onBack());
  host.querySelector("#mapSave")!.addEventListener("click", async () => {
    try {
      await opts.onSave(s);
      s.dirty = false;
      sfx("uiConfirm");
      const hint = host.querySelector("#mapHint");
      if (hint) hint.textContent = "Saved. The next fight uses this layout.";
    } catch (err) {
      sfx("uiError");
      const hint = host.querySelector("#mapHint");
      if (hint) hint.textContent = err instanceof Error ? err.message : "Save failed";
    }
  });

  const applyPtr = (ev: PointerEvent) => {
    const t = ev.target instanceof HTMLElement ? ev.target.closest("[data-cell]") : null;
    if (!(t instanceof HTMLElement) || !t.dataset.cell) return;
    const [xs, ys] = t.dataset.cell.split(",");
    const x = Number(xs);
    const y = Number(ys);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    setCursor(s, x, y);
    paintCell(s, x, y);
    paintCellDom(s, x, y);
  };
  grid.addEventListener("pointerdown", (ev) => {
    grid.focus({ preventScroll: true });
    s.painting = true;
    grid.setPointerCapture?.(ev.pointerId);
    applyPtr(ev);
  });
  grid.addEventListener("pointermove", (ev) => {
    if (!s.painting) return;
    applyPtr(ev);
  });
  grid.addEventListener("pointerup", () => {
    s.painting = false;
  });
  grid.addEventListener("pointercancel", () => {
    s.painting = false;
  });
  setCursor(s, 0, 0);
}

export function handleMapEditorKey(key: RemoteKey): boolean {
  const s = session;
  if (!s) return false;
  const grid = document.getElementById("mapPaint");
  const onGrid = document.activeElement === grid;
  if (key === "back") {
    if (onGrid) {
      document.querySelector<HTMLElement>("[data-brush].on")?.focus();
      sfx("uiBack");
      return true;
    }
    onBackToList?.();
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
  if (nx < 0 || ny < 0 || nx >= s.spec.width || ny >= s.spec.height) {
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
