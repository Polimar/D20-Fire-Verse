import type { Page } from "../types";
import {
  api,
  badge,
  chips,
  confirmDialog,
  debounce,
  esc,
  failed,
  fmtDate,
  qs,
  renderTable,
  replaceParams,
  routeParams,
  saved,
  tableState,
  type Column,
  type TableState,
} from "../ui";

type RoomRow = {
  roomCode: string;
  campaignId: string;
  campaignVersion?: number;
  nodeId: string;
  mode: "campaign" | "arena";
  inCombat: boolean;
  ownerUsername: string | null;
  players: Array<{ name: string; player: string; account: string | null }>;
  updatedAt: string;
};

const COLUMNS: Column<RoomRow>[] = [
  { key: "code", label: "Code", render: (r) => `<b class="mono">${esc(r.roomCode)}</b>` },
  { key: "mode", label: "Mode", render: (r) => (r.mode === "arena" ? badge("Arena", "info") : badge("Campaign")) + (r.inCombat ? ` ${badge("In combat", "bad")}` : "") },
  { key: "campaign", label: "Campaign", render: (r) => `${esc(r.campaignId)}${r.campaignVersion ? ` <span class="faint">v${r.campaignVersion}</span>` : ""}` },
  { key: "node", label: "Scene", render: (r) => `<span class="mono">${esc(r.nodeId)}</span>` },
  { key: "host", label: "Host", render: (r) => (r.ownerUsername ? esc(r.ownerUsername) : `<span class="faint">—</span>`) },
  {
    key: "players",
    label: "Seats",
    render: (r) =>
      r.players.length
        ? r.players.map((p) => `${esc(p.name)}${p.account ? ` <span class="faint">(${esc(p.account)})</span>` : ""}`).join("<br />")
        : `<span class="faint">Empty</span>`,
  },
  { key: "updated", label: "Last activity", className: "nowrap", render: (r) => fmtDate(r.updatedAt) },
  { key: "actions", label: "", className: "actions", render: () => `<button type="button" class="sm danger" data-act="close">Close</button>` },
];

export const roomsPage: Page = {
  id: "rooms",
  label: "Rooms",
  group: "Players",
  count: (o) => (o.rooms ? { value: o.rooms } : null),
  async render(host, ctx) {
    const p = routeParams();
    const filters = { q: p.get("q") ?? "", mode: p.get("mode") ?? "" };
    let state: TableState = tableState(p);
    const selected = new Set<string>();
    host.innerHTML = `<div class="page">
      <div class="page-head">
        <div class="titles"><h1>Rooms</h1><p>Tables open in memory right now. Closing one ends it for every seat; its saves stay.</p></div>
        <button type="button" id="roomsReload">Refresh</button>
      </div>
      <div class="card">
        <div class="toolbar">
          <input class="search" id="roomsQ" type="search" placeholder="Search code, scene, host, or hero" value="${esc(filters.q)}" />
          <div id="roomsChips">${chips("mode", [{ value: "", label: "All" }, { value: "campaign", label: "Campaign" }, { value: "arena", label: "Arena" }], filters.mode)}</div>
        </div>
        <div class="bulkbar" id="roomsBulk" hidden></div>
        <div id="roomsTable"><div class="loading">Loading rooms…</div></div>
      </div>
    </div>`;
    const bulk = host.querySelector<HTMLElement>("#roomsBulk")!;
    const paintBulk = () => {
      bulk.hidden = selected.size === 0;
      bulk.innerHTML = `<b>${selected.size} selected</b><button type="button" class="sm danger" data-close-sel>Close selected</button><span class="spacer"></span><button type="button" class="sm ghost" data-clear>Clear selection</button>`;
    };
    const close = async (codes: string[]) => {
      const ok = await confirmDialog({
        title: `Close ${codes.length === 1 ? `room ${codes[0]}` : `${codes.length} rooms`}?`,
        body: "<p>Everyone at the table is sent back to the title screen. Saves and autosaves stay on disk.</p>",
        confirm: "Close",
        danger: true,
      });
      if (!ok) return;
      try {
        const out = await api<{ closed: number }>("/api/admin/rooms/close", { body: { codes } });
        saved(`${out.closed} room${out.closed === 1 ? "" : "s"} closed`);
        codes.forEach((c) => selected.delete(c));
        void load();
        void ctx.refreshCounts();
      } catch (err) {
        failed("Closing rooms", err);
      }
    };
    const load = async () => {
      replaceParams({ ...filters, page: state.page > 1 ? state.page : "" });
      const data = await api<{ rows: RoomRow[]; total: number }>(`/api/admin/rooms${qs({ ...filters, page: state.page, pageSize: state.pageSize })}`);
      if (!ctx.isCurrent()) return;
      renderTable(host.querySelector<HTMLElement>("#roomsTable")!, {
        columns: COLUMNS,
        rows: data.rows,
        total: data.total,
        state,
        rowKey: (r) => r.roomCode,
        selectable: true,
        selected,
        empty: "No open tables.",
        onState: (next) => {
          state = next;
          void load();
        },
        onAction: (_a, r) => void close([r.roomCode]),
        onSelect: paintBulk,
      });
      paintBulk();
    };
    bulk.addEventListener("click", (ev) => {
      const t = ev.target as HTMLElement;
      if (t.closest("[data-close-sel]")) void close([...selected]);
      if (t.closest("[data-clear]")) {
        selected.clear();
        void load();
      }
    });
    host.querySelector("#roomsChips")!.addEventListener("click", (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-value]");
      if (!b) return;
      filters.mode = b.dataset.value ?? "";
      host.querySelectorAll("#roomsChips .chip").forEach((c) => c.classList.toggle("on", c === b));
      state = { ...state, page: 1 };
      void load();
    });
    host.querySelector("#roomsQ")!.addEventListener(
      "input",
      debounce((ev: Event) => {
        filters.q = (ev.target as HTMLInputElement).value.trim();
        state = { ...state, page: 1 };
        void load();
      }),
    );
    host.querySelector("#roomsReload")!.addEventListener("click", () => void load());
    await load();
  },
};
