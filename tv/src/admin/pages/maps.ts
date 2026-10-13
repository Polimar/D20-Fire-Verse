import { closeMapEditor, flushMapEditor, handleMapEditorKey, renderMapPainter, type MapListItem, type MapPaint } from "../../map-editor";
import type { RemoteKey } from "../../nav";
import { subPath, type Page, type PageCtx } from "../types";
import {
  api,
  badge,
  chips,
  confirmDialog,
  debounce,
  errorText,
  esc,
  field,
  openDrawer,
  renderTable,
  replaceParams,
  routeParams,
  tableState,
  toast,
  write,
  type Column,
  type TableState,
} from "../ui";

type MapRow = MapListItem & { size?: string; theme?: string; createdBy?: { username: string; userId?: string } | null };

const THEMES: Array<[string, string]> = [
  ["brewery", "Wizard's brewery"],
  ["crypt", "Gothic crypt"],
  ["ship", "Ship deck"],
  ["inn_yard", "Inn yard at night"],
  ["elf_ruin", "Autumn elf ruin"],
  ["lava_hall", "Magma hall"],
  ["ice_court", "Icy courtyard"],
  ["sand_ruin", "Desert ruin"],
  ["sewer", "Stone sewers"],
  ["coliseum", "Coliseum sand"],
  ["swamp", "Boardwalk swamp"],
  ["tower_roof", "Wizard tower roof"],
];

const KEYS: Record<string, RemoteKey> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Enter: "ok", " ": "ok" };

const kindOf = (m: MapRow): "campaign" | "arena" | "custom" => (m.source === "campaign" ? "campaign" : m.createdBy ? "custom" : "arena");

let painting = false;

export const mapsPage: Page = {
  id: "maps",
  label: "Maps",
  group: "Content",
  async leave() {
    if (!painting) return true;
    const ok = await flushMapEditor();
    if (!ok) {
      toast("bad", "The map could not be saved", "Fix the problem shown above the grid, or reload to drop the changes.");
      return false;
    }
    closeMapEditor();
    painting = false;
    return true;
  },
  async render(host, ctx) {
    const [source, id] = subPath();
    if ((source === "campaign" || source === "arena") && id) await painter(host, ctx, source, id);
    else await listView(host, ctx);
  },
};

async function listView(host: HTMLElement, ctx: PageCtx): Promise<void> {
  painting = false;
  const p = routeParams();
  const filters = { q: p.get("q") ?? "", kind: p.get("kind") ?? "", size: p.get("size") ?? "" };
  let state: TableState = tableState(p, { sort: "name", dir: "asc" });
  let all: MapRow[] = [];

  const columns: Column<MapRow>[] = [
    {
      key: "name",
      label: "Map",
      sort: "name",
      render: (m) => `<a href="#/maps/${m.source}/${encodeURIComponent(m.id)}"><b>${esc(m.name)}</b></a><span class="sub mono">${esc(m.id)}</span>`,
    },
    {
      key: "kind",
      label: "Kind",
      render: (m) => {
        const k = kindOf(m);
        return k === "campaign" ? badge("Campaign", "info") : k === "custom" ? badge("Player-made arena", "accent") : badge("Built-in arena");
      },
    },
    { key: "size", label: "Grid", sort: "size", className: "nowrap", render: (m) => `${m.width}×${m.height}${m.size ? ` <span class="faint">${esc(m.size)}</span>` : ""}` },
    { key: "theme", label: "Theme", render: (m) => esc(THEMES.find(([t]) => t === m.theme)?.[1] ?? m.theme ?? "—") },
    { key: "by", label: "Created by", render: (m) => (m.createdBy ? esc(m.createdBy.username) : `<span class="faint">Game</span>`) },
    {
      key: "actions",
      label: "",
      className: "actions",
      render: (m) =>
        `<button type="button" class="sm primary" data-act="paint">Paint</button>${
          m.source === "arena" ? `<button type="button" class="sm danger" data-act="remove">${m.createdBy ? "Delete" : "Reset"}</button>` : ""
        }`,
    },
  ];

  host.innerHTML = `<div class="page">
    <div class="page-head">
      <div class="titles"><h1>Maps</h1><p>Campaign fight maps and arena maps. Paint walls, hazards, spawn points, and the background image. Saves go straight to the map file; the next fight uses them.</p></div>
      <button type="button" class="primary" id="mapNew">New arena map</button>
    </div>
    <div class="card">
      <div class="toolbar">
        <input class="search" id="mapQ" type="search" placeholder="Search name, id, or creator" value="${esc(filters.q)}" />
        <div id="mapKinds"></div>
        <select id="mapSize" aria-label="Size"><option value="">Any size</option>${["small", "medium", "large"].map((s) => `<option ${filters.size === s ? "selected" : ""}>${s}</option>`).join("")}</select>
      </div>
      <div id="mapTable"><div class="loading">Loading maps…</div></div>
    </div>
  </div>`;

  const paint = () => {
    replaceParams({ ...filters, page: state.page > 1 ? state.page : "" });
    const q = filters.q.toLowerCase();
    const counts = { campaign: 0, arena: 0, custom: 0 };
    for (const m of all) counts[kindOf(m)] += 1;
    host.querySelector("#mapKinds")!.innerHTML = chips(
      "kind",
      [
        { value: "", label: "All", count: all.length },
        { value: "campaign", label: "Campaign", count: counts.campaign },
        { value: "arena", label: "Built-in arena", count: counts.arena },
        { value: "custom", label: "Player-made", count: counts.custom },
      ],
      filters.kind,
    );
    const rows = all
      .filter((m) => !filters.kind || kindOf(m) === filters.kind)
      .filter((m) => !filters.size || m.size === filters.size)
      .filter((m) => !q || [m.name, m.id, m.createdBy?.username].some((v) => String(v ?? "").toLowerCase().includes(q)))
      .sort((a, b) => {
        const d = state.sort === "size" ? a.width * a.height - b.width * b.height : a.name.localeCompare(b.name);
        return state.dir === "asc" ? d : -d;
      });
    renderTable(host.querySelector<HTMLElement>("#mapTable")!, {
      columns,
      rows: rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize),
      total: rows.length,
      state,
      rowKey: (m) => `${m.source}/${m.id}`,
      empty: "No maps match.",
      onState: (next) => {
        state = next;
        paint();
      },
      onRow: (m) => {
        location.hash = `#/maps/${m.source}/${encodeURIComponent(m.id)}`;
      },
      onAction: (act, m, button) => {
        if (act === "paint") location.hash = `#/maps/${m.source}/${encodeURIComponent(m.id)}`;
        else void remove(m, button);
      },
    });
  };

  const load = async () => {
    const { maps } = await api<{ maps: MapRow[] }>("/api/admin/maps");
    if (!ctx.isCurrent()) return;
    all = maps;
    paint();
  };

  const remove = async (m: MapRow, button: HTMLButtonElement) => {
    const custom = Boolean(m.createdBy);
    const ok = await confirmDialog({
      title: custom ? `Delete ${m.name}?` : `Reset ${m.name}?`,
      body: custom
        ? `<p>The map and its background image are removed. ${esc(m.createdBy?.username ?? "Its creator")} loses it from their list. Tables already fighting on it finish normally.</p>`
        : "<p>Painted walls, spawns, and the uploaded image are dropped. The map returns to the generated layout.</p>",
      confirm: custom ? "Delete map" : "Reset map",
      danger: true,
      ...(custom ? { typeToConfirm: m.id } : {}),
    });
    if (!ok) return;
    const out = await write(button, custom ? `Map ${m.name} deleted` : `Map ${m.name} reset`, () => api(`/api/admin/maps/arena/${encodeURIComponent(m.id)}`, { method: "DELETE" }), undefined, custom ? "Map deleted" : "Map reset");
    if (out) await load();
  };

  host.querySelector("#mapKinds")!.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-value]");
    if (!b) return;
    filters.kind = b.dataset.value ?? "";
    state = { ...state, page: 1 };
    paint();
  });
  host.querySelector("#mapSize")!.addEventListener("change", (ev) => {
    filters.size = (ev.target as HTMLSelectElement).value;
    state = { ...state, page: 1 };
    paint();
  });
  host.querySelector("#mapQ")!.addEventListener(
    "input",
    debounce((ev: Event) => {
      filters.q = (ev.target as HTMLInputElement).value.trim();
      state = { ...state, page: 1 };
      paint();
    }, 120),
  );
  host.querySelector("#mapNew")!.addEventListener("click", () => newMap());
  await load();
}

function newMap(): void {
  const drawer = openDrawer({ title: "New arena map", subtitle: "Starts with walls around the edge and default spawn points" });
  drawer.body.innerHTML = `<form class="stack" id="newMapForm">
    ${field("Name", `<input name="name" required maxlength="40" placeholder="Broken bridge" />`)}
    ${field("Id", `<input name="slug" required pattern="[a-z0-9]+(_[a-z0-9]+)*" maxlength="32" placeholder="broken_bridge" autocomplete="off" />`, { hint: "Lowercase letters, numbers, single underscores. The map id becomes arena_custom_&lt;id&gt;_&lt;size&gt;." })}
    <div class="grid-2">
      ${field("Size", `<select name="size"><option value="small">Small · 16×16</option><option value="medium" selected>Medium · 24×24</option><option value="large">Large · 32×32</option></select>`)}
      ${field("Theme", `<select name="theme">${THEMES.map(([id, label]) => `<option value="${id}">${esc(label)}</option>`).join("")}</select>`)}
    </div>
  </form>`;
  drawer.footer.hidden = false;
  drawer.footer.innerHTML = `<button type="button" data-cancel>Cancel</button><button type="button" class="primary" data-create>Create and paint</button>`;
  drawer.el.querySelector("[data-cancel]")!.addEventListener("click", () => void drawer.close());
  drawer.el.querySelector("[data-create]")!.addEventListener("click", async (ev) => {
    const form = drawer.body.querySelector<HTMLFormElement>("#newMapForm")!;
    if (!form.reportValidity()) return;
    const f = new FormData(form);
    const out = await write(
      ev.currentTarget as HTMLButtonElement,
      `Map ${String(f.get("name"))} created`,
      () => api<MapPaint>("/api/admin/maps", { body: { source: "arena", name: f.get("name"), slug: f.get("slug"), size: f.get("size"), theme: f.get("theme") } }),
      (m) => m.id,
      "Map created",
    );
    if (!out) return;
    await drawer.close(true);
    location.hash = `#/maps/arena/${encodeURIComponent(out.id)}`;
  });
}

async function painter(host: HTMLElement, ctx: PageCtx, source: "campaign" | "arena", id: string): Promise<void> {
  let spec: MapPaint;
  try {
    spec = await api<MapPaint>(`/api/admin/maps/${source}/${encodeURIComponent(id)}`);
  } catch (err) {
    host.innerHTML = `<div class="page"><div class="crumbs"><a href="#/maps">Maps</a> / ${esc(id)}</div><div class="notice bad">${esc(errorText(err))}</div></div>`;
    return;
  }
  if (!ctx.isCurrent()) return;
  host.innerHTML = `<div class="page wide">
    <div class="crumbs"><a href="#/maps">Maps</a> / ${esc(spec.name)}</div>
    <div class="page-head">
      <div class="titles"><h1>${esc(spec.name)}</h1><p><code>${esc(spec.id)}</code> · ${spec.width}×${spec.height} · ${source === "campaign" ? "Campaign map. Spawn counts are fixed by the encounter." : "Arena map."} Drag to paint a rectangle. Click a letter to move a spawn or landmark. Arrow keys and Enter work on the grid.</p></div>
    </div>
    <div class="card"><div class="body" id="painterHost"></div></div>
  </div>`;
  const box = host.querySelector<HTMLElement>("#painterHost")!;
  const base = `/api/admin/maps/${source}/${encodeURIComponent(id)}`;
  painting = true;
  renderMapPainter(box, spec, {
    onBack: () => {
      location.hash = "#/maps";
    },
    onSave: async (s) => {
      const spawn = source === "campaign" ? { pcs: s.spawn.pcs, enemies: s.spawn.enemies } : { ffa: s.spawn.ffa, teamA: s.spawn.teamA, teamB: s.spawn.teamB };
      try {
        await api(base, { method: "PUT", body: { walls: s.walls, hazards: s.hazards, spawn, labels: s.labels, art: s.spec.art ?? undefined } });
        toast("ok", "Saved to the map file", esc(`${spec.name} · the next fight uses this layout`));
      } catch (err) {
        toast("bad", "Map not saved", esc(errorText(err)));
        throw new Error(errorText(err));
      }
    },
    onImportArt:
      source === "arena"
        ? async (file) => {
            const out = await api<{ art?: string | null }>(`/api/admin/maps/arena/${encodeURIComponent(id)}/art`, { raw: file, contentType: file.type || "image/jpeg" });
            toast("ok", "Background image saved", esc(file.name));
            return out.art ?? null;
          }
        : undefined,
    onClearArt:
      source === "arena"
        ? async () => {
            const out = await api<{ art?: string | null }>(`/api/admin/maps/arena/${encodeURIComponent(id)}/art`, { method: "DELETE" });
            toast("ok", "Background image removed");
            return out.art ?? null;
          }
        : undefined,
  });
  const grid = box.querySelector<HTMLElement>("#mapPaint");
  grid?.addEventListener("keydown", (ev) => {
    const key = KEYS[ev.key];
    if (!key) return;
    if (handleMapEditorKey(key)) ev.preventDefault();
  });
}
