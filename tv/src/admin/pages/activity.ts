import type { Page } from "../types";
import { api, debounce, esc, fmtDate, qs, renderTable, replaceParams, routeParams, tableState, type Column, type TableState } from "../ui";

type AuditRow = { id: string; userId: string; ts: string; action?: string; target?: string; by?: string } & Record<string, unknown>;

const HIDDEN = new Set(["id", "userId", "ts", "action", "target", "by"]);

function details(e: AuditRow): string {
  const rest = Object.entries(e).filter(([k, v]) => !HIDDEN.has(k) && v !== undefined && v !== null && v !== "");
  if (!rest.length) return `<span class="faint">—</span>`;
  return rest
    .map(([k, v]) => {
      const text = typeof v === "object" ? JSON.stringify(v) : String(v);
      return `<span class="faint">${esc(k)}</span> ${esc(text.length > 140 ? `${text.slice(0, 140)}…` : text)}`;
    })
    .join(" · ");
}

export const activityPage: Page = {
  id: "activity",
  label: "Activity log",
  group: "Activity",
  async render(host, ctx) {
    const p = routeParams();
    let q = p.get("q") ?? "";
    let state: TableState = tableState(p);
    const columns: Column<AuditRow>[] = [
      { key: "ts", label: "When", className: "nowrap", render: (e) => fmtDate(e.ts) },
      { key: "by", label: "Admin", render: (e) => `<b>${esc(e.by ?? e.userId)}</b>` },
      { key: "action", label: "Action", render: (e) => `<code>${esc(e.action ?? "")}</code>` },
      { key: "target", label: "Record", render: (e) => `<span class="mono">${esc(e.target ?? "")}</span>` },
      { key: "detail", label: "Detail", render: details },
    ];
    host.innerHTML = `<div class="page wide">
      <div class="page-head"><div class="titles"><h1>Activity log</h1><p>Every write made from this portal: who, what, and when. Kept in the events table; nothing here can be edited.</p></div><button type="button" id="actReload">Refresh</button></div>
      <div class="card">
        <div class="toolbar"><input class="search" id="actQ" type="search" placeholder="Search admin, action, or record" value="${esc(q)}" /></div>
        <div id="actTable"><div class="loading">Loading…</div></div>
      </div>
    </div>`;
    const load = async () => {
      replaceParams({ q, page: state.page > 1 ? state.page : "" });
      const out = await api<{ rows: AuditRow[]; total: number }>(`/api/admin/activity${qs({ q, page: state.page, pageSize: state.pageSize })}`);
      if (!ctx.isCurrent()) return;
      renderTable(host.querySelector<HTMLElement>("#actTable")!, {
        columns,
        rows: out.rows,
        total: out.total,
        state,
        rowKey: (e) => e.id,
        empty: q ? "No entries match." : "No admin actions recorded yet.",
        onState: (next) => {
          state = next;
          void load();
        },
      });
    };
    host.querySelector("#actQ")!.addEventListener(
      "input",
      debounce((ev: Event) => {
        q = (ev.target as HTMLInputElement).value.trim();
        state = { ...state, page: 1 };
        void load();
      }),
    );
    host.querySelector("#actReload")!.addEventListener("click", () => void load());
    await load();
  },
};
