import type { Page } from "../types";
import {
  api,
  badge,
  chips,
  confirmDialog,
  debounce,
  esc,
  failed,
  fmtBytes,
  fmtDate,
  fmtNum,
  qs,
  renderTable,
  replaceParams,
  routeParams,
  saved,
  tableState,
  type Column,
  type TableState,
} from "../ui";

type SaveRow = {
  saveId: string;
  kind: "auto" | "manual";
  campaignId: string;
  nodeId: string;
  updatedAt?: string;
  players: string[];
  playerAccounts: string[];
  archived: boolean;
  bytes: number;
  broken?: boolean;
  ownerUserId?: string;
  ownerUsername: string | null;
  ownerEmail: string | null;
  ownerMissing: boolean;
};

const COLUMNS: Column<SaveRow>[] = [
  {
    key: "id",
    label: "Save",
    render: (s) =>
      `<span class="mono">${esc(s.saveId)}</span><span class="sub badges">${s.kind === "auto" ? badge("Autosave") : badge("Manual", "info")}${s.archived ? badge("Archived v1", "warn") : ""}${s.broken ? badge("Unreadable", "bad") : ""}</span>`,
  },
  {
    key: "owner",
    label: "Owner",
    render: (s) =>
      s.ownerUsername
        ? `<b>${esc(s.ownerUsername)}</b><span class="sub">${s.ownerEmail ? `<a href="mailto:${esc(s.ownerEmail)}">${esc(s.ownerEmail)}</a>` : "no email on file"}</span>`
        : s.ownerMissing
          ? `${badge("Deleted account", "warn")}<span class="sub mono">${esc(s.ownerUserId)}</span>`
          : `<span class="faint">No owner</span>`,
  },
  { key: "campaign", label: "Campaign", render: (s) => esc(s.campaignId || "—") },
  { key: "node", label: "Scene", render: (s) => `<span class="mono">${esc(s.nodeId || "—")}</span>` },
  {
    key: "heroes",
    label: "Heroes",
    render: (s) => (s.players.length ? esc(s.players.join(", ")) + (s.playerAccounts.length ? `<span class="sub">${esc(s.playerAccounts.join(", "))}</span>` : "") : `<span class="faint">—</span>`),
  },
  { key: "size", label: "Size", className: "right nowrap", render: (s) => fmtBytes(s.bytes) },
  { key: "when", label: "Saved", className: "nowrap", render: (s) => fmtDate(s.updatedAt) },
  { key: "actions", label: "", className: "actions", render: () => `<button type="button" class="sm danger" data-act="delete">Delete</button>` },
];

const KINDS = [
  { value: "", label: "All" },
  { value: "manual", label: "Manual" },
  { value: "auto", label: "Autosaves" },
  { value: "archived", label: "Archived v1" },
  { value: "orphan", label: "Owner deleted" },
  { value: "broken", label: "Unreadable" },
];

export const savesPage: Page = {
  id: "saves",
  label: "Saves",
  group: "Players",
  count: (o) => ({ value: o.saves.total }),
  async render(host, ctx) {
    const p = routeParams();
    const filters = { q: p.get("q") ?? "", kind: p.get("kind") ?? "", campaign: p.get("campaign") ?? "", olderThanDays: p.get("olderThanDays") ?? "" };
    let state: TableState = tableState(p);
    const selected = new Set<string>();
    let total = 0;
    host.innerHTML = `<div class="page">
      <div class="page-head">
        <div class="titles"><h1>Saves</h1><p>Save files on disk with the account that made them. Deleting a save never closes a table that is already open.</p></div>
        <button type="button" id="savesReload">Refresh</button>
        <button type="button" class="danger" id="savesClear">Delete all matching…</button>
      </div>
      <div class="card">
        <div class="toolbar">
          <input class="search" id="savesQ" type="search" placeholder="Search email, username, hero, scene, or id" value="${esc(filters.q)}" />
          <div id="savesChips">${chips("kind", KINDS, filters.kind)}</div>
          <select id="savesCampaign" aria-label="Campaign"><option value="">Any campaign</option></select>
          <select id="savesAge" aria-label="Age">
            <option value="">Any age</option>
            ${[1, 7, 30, 90].map((d) => `<option value="${d}" ${filters.olderThanDays === String(d) ? "selected" : ""}>Older than ${d} day${d === 1 ? "" : "s"}</option>`).join("")}
          </select>
        </div>
        <div class="bulkbar" id="savesBulk" hidden></div>
        <div id="savesTable"><div class="loading">Loading saves…</div></div>
      </div>
    </div>`;
    const bulk = host.querySelector<HTMLElement>("#savesBulk")!;
    const paintBulk = () => {
      bulk.hidden = selected.size === 0;
      bulk.innerHTML = `<b>${selected.size} selected</b><button type="button" class="sm danger" data-del-sel>Delete selected</button><span class="spacer"></span><button type="button" class="sm ghost" data-clear>Clear selection</button>`;
    };
    const after = (n: number) => {
      saved(`${fmtNum(n)} save${n === 1 ? "" : "s"} deleted from disk`);
      selected.clear();
      void load();
      void ctx.refreshCounts();
    };
    const del = async (ids: string[]) => {
      const ok = await confirmDialog({
        title: ids.length === 1 ? "Delete this save?" : `Delete ${ids.length} saves?`,
        body: `<p>${ids.length === 1 ? `<code>${esc(ids[0])}</code> is` : "These files are"} removed from disk. Nobody can resume ${ids.length === 1 ? "it" : "them"} afterwards.</p>`,
        confirm: "Delete",
        danger: true,
      });
      if (!ok) return;
      try {
        const out = await api<{ deleted: number }>("/api/admin/saves/delete", { body: { ids } });
        after(out.deleted);
      } catch (err) {
        failed("Deleting saves", err);
      }
    };
    const load = async () => {
      replaceParams({ ...filters, page: state.page > 1 ? state.page : "" });
      const data = await api<{ rows: SaveRow[]; total: number; campaigns: string[] }>(`/api/admin/saves${qs({ ...filters, page: state.page, pageSize: state.pageSize })}`);
      if (!ctx.isCurrent()) return;
      total = data.total;
      const camp = host.querySelector<HTMLSelectElement>("#savesCampaign")!;
      camp.innerHTML = `<option value="">Any campaign</option>${data.campaigns.map((c) => `<option ${c === filters.campaign ? "selected" : ""}>${esc(c)}</option>`).join("")}`;
      host.querySelector<HTMLButtonElement>("#savesClear")!.disabled = total === 0;
      host.querySelector<HTMLButtonElement>("#savesClear")!.textContent = `Delete all matching (${fmtNum(total)})…`;
      renderTable(host.querySelector<HTMLElement>("#savesTable")!, {
        columns: COLUMNS,
        rows: data.rows,
        total: data.total,
        state,
        rowKey: (s) => s.saveId,
        selectable: true,
        selected,
        empty: "No saves match these filters.",
        onState: (next) => {
          state = next;
          void load();
        },
        onAction: (_a, s) => void del([s.saveId]),
        onSelect: paintBulk,
      });
      paintBulk();
    };
    bulk.addEventListener("click", (ev) => {
      const t = ev.target as HTMLElement;
      if (t.closest("[data-del-sel]")) void del([...selected]);
      if (t.closest("[data-clear]")) {
        selected.clear();
        void load();
      }
    });
    host.querySelector("#savesClear")!.addEventListener("click", async () => {
      const scope = [
        filters.kind ? KINDS.find((k) => k.value === filters.kind)?.label : "every kind",
        filters.campaign ? `campaign ${filters.campaign}` : "every campaign",
        filters.olderThanDays ? `older than ${filters.olderThanDays} days` : "any age",
        filters.q ? `matching “${filters.q}”` : "",
      ].filter(Boolean);
      const phrase = `DELETE ${total}`;
      const ok = await confirmDialog({
        title: `Delete ${fmtNum(total)} saves?`,
        body: `<p>Every save that matches the current filter is removed from disk, not only this page:</p><ul>${scope.map((s) => `<li>${esc(s)}</li>`).join("")}</ul><p>It cannot be undone.</p>`,
        confirm: "Delete all",
        danger: true,
        typeToConfirm: phrase,
      });
      if (!ok) return;
      try {
        const out = await api<{ deleted: number }>("/api/admin/saves/clear", { body: { ...filters, confirm: phrase } });
        after(out.deleted);
      } catch (err) {
        failed("Clearing saves", err);
        void load();
      }
    });
    host.querySelector("#savesChips")!.addEventListener("click", (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-value]");
      if (!b) return;
      filters.kind = b.dataset.value ?? "";
      host.querySelectorAll("#savesChips .chip").forEach((c) => c.classList.toggle("on", c === b));
      state = { ...state, page: 1 };
      void load();
    });
    host.querySelector("#savesCampaign")!.addEventListener("change", (ev) => {
      filters.campaign = (ev.target as HTMLSelectElement).value;
      state = { ...state, page: 1 };
      void load();
    });
    host.querySelector("#savesAge")!.addEventListener("change", (ev) => {
      filters.olderThanDays = (ev.target as HTMLSelectElement).value;
      state = { ...state, page: 1 };
      void load();
    });
    host.querySelector("#savesQ")!.addEventListener(
      "input",
      debounce((ev: Event) => {
        filters.q = (ev.target as HTMLInputElement).value.trim();
        state = { ...state, page: 1 };
        void load();
      }),
    );
    host.querySelector("#savesReload")!.addEventListener("click", () => void load());
    await load();
  },
};
