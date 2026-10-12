/** Player overlay: create and paint only maps this account owns. */

import { describeError } from "@d20-fireverse/protocol";
import {
  closeMapEditor,
  flushMapEditor,
  handleMapEditorKey,
  mapEditorOpen,
  renderMapPainter,
  type MapPaint,
  type MapPaintSession,
} from "./map-editor";
import type { RemoteKey } from "./nav";
import { sfx } from "./sfx";

type MineRow = {
  id: string;
  name: string;
  width: number;
  height: number;
  createdBy?: { username: string } | null;
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Derive arena_custom slug from the display name. */
export function slugifyArenaName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 32);
}

let overlay: HTMLElement | null = null;
let opener: HTMLElement | null = null;
let paintGen = 0;

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  if (typeof opts.body === "string") headers.set("Content-Type", "application/json");
  const res = await fetch(path, { credentials: "same-origin", ...opts, headers });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data as T;
}

function body(): HTMLElement | null {
  return overlay?.querySelector("#arenaEditorBody") ?? null;
}

function showErr(msg: string) {
  const errEl = overlay?.querySelector("#arenaEditorErr") as HTMLElement | null;
  if (!errEl) return;
  errEl.hidden = false;
  errEl.textContent = msg;
}

export function arenaEditorOpen(): HTMLElement | null {
  return overlay && !overlay.hidden ? overlay : null;
}

export function openArenaEditor() {
  const active = document.activeElement;
  opener = active instanceof HTMLElement && active !== document.body && !overlay?.contains(active) ? active : opener;
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "modal admin-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Arena editor");
    overlay.innerHTML = `
      <div class="modal-card">
        <p class="modal-kicker">Arena</p>
        <h2>Arena editor</h2>
        <div id="arenaEditorBody"></div>
        <div class="row modal-actions">
          <button type="button" class="primary" id="arenaEditorClose">Back to the title</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#arenaEditorClose")!.addEventListener("click", closeArenaEditor);
  }
  overlay.hidden = false;
  sfx("uiConfirm");
  void refresh();
}

export function closeArenaEditor() {
  if (!overlay || overlay.hidden) return;
  void (async () => {
    if (!(await flushMapEditor())) return;
    closeMapEditor();
    overlay!.classList.remove("map-wide");
    overlay!.hidden = true;
    paintGen += 1;
    sfx("uiBack");
    if (opener?.isConnected && opener.offsetParent) opener.focus({ preventScroll: true });
    opener = null;
  })();
}

export function handleArenaEditorKey(key: RemoteKey): boolean {
  if (!overlay || overlay.hidden) return false;
  if (mapEditorOpen() && handleMapEditorKey(key)) return true;
  return false;
}

async function refresh() {
  const gen = ++paintGen;
  const host = body();
  if (!host) return;
  overlay?.classList.remove("map-wide");
  host.innerHTML = `<p class="meta">Loading maps…</p>`;
  try {
    const { maps } = await api<{ maps: MineRow[] }>("/api/me/arena-maps");
    if (gen !== paintGen) return;
    const rows = maps
      .map(
        (m) => `<tr>
          <td>${esc(m.name)}</td>
          <td>${esc(m.id)}</td>
          <td>${m.width}×${m.height}</td>
          <td>${esc(m.createdBy?.username ?? "you")}</td>
          <td class="admin-actions"><button type="button" data-id="${esc(m.id)}">Paint</button></td>
        </tr>`,
      )
      .join("");
    host.innerHTML = `<div class="admin-block">
      <p class="meta">These maps are yours. After you save, anyone can pick them when they create an arena. A base image is required to create a map.</p>
      <form id="arenaNewMap" class="arena-form">
        <label>Name <input id="arenaMapName" maxlength="40" placeholder="My pit" required /></label>
        <label>Size <select id="arenaMapSize"><option value="small">small</option><option value="medium">medium</option><option value="large">large</option></select></label>
        <label>Base image <input id="arenaMapArt" type="file" accept="image/jpeg,image/png,image/webp" required /></label>
        <button type="submit" class="primary">New map</button>
      </form>
      <table class="admin-table"><tr><th>Name</th><th>Id</th><th>Size</th><th>Created by</th><th></th></tr>${rows || `<tr><td colspan="5">You have not painted an arena yet.</td></tr>`}</table>
      <p class="admin-err" id="arenaEditorErr" hidden></p>
    </div>`;
    host.querySelectorAll<HTMLButtonElement>("[data-id]").forEach((b) => {
      b.addEventListener("click", () => {
        if (b.dataset.id) void openPainter(b.dataset.id);
      });
    });
    host.querySelector("#arenaNewMap")?.addEventListener("submit", (e) => {
      e.preventDefault();
      void createMap();
    });
  } catch (err) {
    if (gen !== paintGen) return;
    host.innerHTML = `<p class="admin-err">${esc(describeError(err instanceof Error ? err.message : ""))}</p>`;
  }
}

async function createMap() {
  const name = ((document.querySelector("#arenaMapName") as HTMLInputElement)?.value ?? "").trim();
  const size = (document.querySelector("#arenaMapSize") as HTMLSelectElement)?.value ?? "";
  const file = (document.querySelector("#arenaMapArt") as HTMLInputElement)?.files?.[0];
  if (!name) {
    showErr("Give your map a name.");
    return;
  }
  if (!file) {
    showErr("Choose a base image before you create the map.");
    return;
  }
  const slug = slugifyArenaName(name);
  if (!slug) {
    showErr("Use letters or numbers in the name.");
    return;
  }
  try {
    const spec = await api<MapPaint>("/api/me/arena-maps", {
      method: "POST",
      body: JSON.stringify({ slug, size, name }),
    });
    const res = await fetch(`/api/me/arena-maps/${spec.id}/art`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": file.type || "image/jpeg" },
      body: file,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; art?: string | null };
    if (!res.ok) throw new Error(data.error || res.statusText);
    await openPainter(spec.id);
  } catch (err) {
    showErr(describeError(err instanceof Error ? err.message : ""));
  }
}

async function openPainter(id: string) {
  if (!overlay) return;
  overlay.classList.add("map-wide");
  const host = body();
  if (!host) return;
  host.innerHTML = `<p class="meta">Loading map…</p>`;
  try {
    const spec = await api<MapPaint>(`/api/me/arena-maps/${id}`);
    const live = body();
    if (!live || overlay.hidden) return;
    renderMapPainter(live, spec, {
      onBack: () => {
        closeMapEditor();
        overlay?.classList.remove("map-wide");
        void refresh();
      },
      onSave: async (s: MapPaintSession) => {
        await api(`/api/me/arena-maps/${id}`, {
          method: "PUT",
          body: JSON.stringify({
            walls: s.walls,
            hazards: s.hazards,
            spawn: { ffa: s.spawn.ffa, teamA: s.spawn.teamA, teamB: s.spawn.teamB },
            art: s.spec.art ?? undefined,
          }),
        });
      },
    });
  } catch (err) {
    const live = body();
    if (live) live.innerHTML = `<p class="admin-err">${esc(describeError(err instanceof Error ? err.message : ""))}</p>`;
  }
}
