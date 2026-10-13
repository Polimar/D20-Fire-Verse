import type { Page, PageCtx } from "../types";
import {
  api,
  badge,
  chips,
  confirmDialog,
  debounce,
  errorText,
  esc,
  failed,
  field,
  fmtDate,
  fmtNum,
  openDrawer,
  qs,
  renderTable,
  replaceParams,
  routeParams,
  saved,
  tableState,
  toast,
  write,
  type Column,
  type Drawer,
  type TableState,
} from "../ui";

type Status = "auto_ok" | "needs_review" | "resolved" | "rejected" | "none";
type Row = {
  kind: string;
  id: string;
  name: string;
  enabled: boolean;
  valid: boolean;
  issues: string[];
  inPlay: boolean;
  reviewStatus: Status;
  confidence: "high" | "medium" | "low" | "none";
  unparsedFields: string[];
  usage: string;
  source: "srd" | "custom" | "queue";
  edited: boolean;
  summary: string;
  notModeled: number;
};
type EngineView = {
  state: "runs" | "partial" | "sheet" | "unused";
  headline: string;
  source: string;
  lines: Array<{ label: string; detail: string; ok: boolean }>;
  mismatches: string[];
  notes: string[];
};
type Ambiguity = { field?: string; summary?: string; options?: Array<{ label?: string; patch?: Record<string, unknown> }>; parserChoice?: number };
type Detail = Row & {
  game: Record<string, unknown> | null;
  original: Record<string, unknown> | null;
  srd: Record<string, unknown>;
  notModeledRules: string[];
  engine: EngineView | null;
  ambiguities: Ambiguity[];
  parsedUnparsedFields: string[];
  adminNote: string;
  reviewedAt: string | null;
  fileStatus: Status;
};
type QueryOut = {
  rows: Row[];
  total: number;
  facets: { kinds: Record<string, number>; statuses: Record<string, number> };
  totals: { all: number; inPlay: number; needsReview: number; invalid: number; edited: number };
};
type BulkAction = "approve" | "approve_enable" | "enable" | "disable" | "reject" | "reopen";

const KINDS: Array<[string, string]> = [
  ["class", "Classes"],
  ["subclass", "Subclasses"],
  ["species", "Species"],
  ["background", "Backgrounds"],
  ["spell", "Spells"],
  ["feat", "Feats"],
  ["item", "Items"],
  ["monster", "Monsters"],
];
const STATUSES: Array<[Status, string]> = [
  ["needs_review", "Needs review"],
  ["auto_ok", "Parser OK"],
  ["resolved", "Approved"],
  ["rejected", "Rejected"],
  ["none", "No review file"],
];
const BULK: Array<[BulkAction, string, string]> = [
  ["approve_enable", "Approve and enable", "primary"],
  ["approve", "Approve", ""],
  ["enable", "Enable", ""],
  ["disable", "Disable", ""],
  ["reject", "Reject", "danger"],
  ["reopen", "Reopen review", "ghost"],
];
const PLAYBOOK: Record<string, string> = { classes: "Classes checked", subclasses: "Subclasses checked", feats: "Feats checked", spells: "Spells checked" };

const kindLabel = (k: string) => KINDS.find(([id]) => id === k)?.[1].replace(/e?s$/, "") ?? k;

function statusBadge(s: Status, confidence?: Row["confidence"]): string {
  const tone = s === "needs_review" ? "warn" : s === "rejected" ? "bad" : s === "resolved" ? "ok" : s === "auto_ok" ? "info" : "";
  const label = STATUSES.find(([id]) => id === s)?.[1] ?? s;
  return badge(label, tone) + (confidence && confidence !== "none" && s === "needs_review" ? ` <span class="faint">${esc(confidence)} confidence</span>` : "");
}

function sourceBadges(r: Row): string {
  return [
    r.source === "custom" ? badge("Custom", "accent") : r.source === "queue" ? badge("Import queue", "warn") : badge("SRD"),
    r.edited ? badge("Edited", "info") : "",
  ].join(" ");
}

export const contentPage: Page = {
  id: "content",
  label: "Content",
  group: "Content",
  count: (o) => (o.content.needsReview ? { value: o.content.needsReview, alert: true } : { value: o.content.all }),
  async render(host, ctx) {
    await listView(host, ctx);
  },
};

async function listView(host: HTMLElement, ctx: PageCtx): Promise<void> {
  const p = routeParams();
  const filters = {
    q: p.get("q") ?? "",
    kind: p.get("kind") ?? "",
    status: p.get("status") ?? "",
    enabled: p.get("enabled") ?? "",
    valid: p.get("valid") ?? "",
    source: p.get("source") ?? "",
    gaps: p.get("gaps") ?? "",
  };
  let state: TableState = tableState(p, { sort: "kind", dir: "asc" });
  const selected = new Set<string>();
  let last: QueryOut | null = null;
  let flash: string | null = null;

  const columns: Column<Row>[] = [
    { key: "name", label: "Entry", sort: "name", render: (r) => `<b>${esc(r.name || "(no name)")}</b><span class="sub mono">${esc(r.id)}</span>` },
    { key: "kind", label: "Kind", sort: "kind", render: (r) => esc(kindLabel(r.kind)) },
    {
      key: "summary",
      label: "Mechanics",
      render: (r) =>
        `<span class="mech">${esc(r.summary || "—")}</span>${r.notModeled ? `<span class="sub warn-text" title="Rules in the SRD text that the game does not apply">${fmtNum(r.notModeled)} SRD rule${r.notModeled === 1 ? "" : "s"} not applied</span>` : ""}`,
    },
    {
      key: "status",
      label: "Review",
      sort: "status",
      render: (r) => `${statusBadge(r.reviewStatus, r.confidence)}${r.unparsedFields.length ? `<span class="sub">Not parsed: ${esc(r.unparsedFields.join(", "))}</span>` : ""}`,
    },
    {
      key: "enabled",
      label: "In game",
      sort: "enabled",
      render: (r) =>
        `<button type="button" class="switch${r.enabled ? " on" : ""}" data-act="toggle" title="${r.enabled ? "Players can get this. Click to disable." : "Hidden from players. Click to enable."}">${r.enabled ? "Enabled" : "Off"}</button>${r.inPlay ? `<span class="sub">In play</span>` : ""}`,
    },
    {
      key: "valid",
      label: "Schema",
      render: (r) => (r.valid ? badge("Valid", "ok") : `${badge("Invalid", "bad")}<span class="sub" title="${esc(r.issues.join("\n"))}">${esc(r.issues[0] ?? "")}${r.issues.length > 1 ? ` +${r.issues.length - 1}` : ""}</span>`),
    },
    { key: "source", label: "Source", render: sourceBadges },
    { key: "actions", label: "", className: "actions", render: () => `<button type="button" class="sm" data-act="open">Open</button>` },
  ];

  host.innerHTML = `<div class="page wide">
    <div class="page-head">
      <div class="titles"><h1>Content</h1><p>Every class, spell, item, and monster the game knows. Approve what the parser got right, fix what it got wrong, and switch entries on for players. Changes write to the database at once; heroes see them on the next sheet load.</p></div>
      <button type="button" id="cReload" title="Re-read the SRD files after an import">Reload from disk</button>
      <button type="button" class="primary" id="cNew">New entry</button>
    </div>
    <div class="cards" id="cStats"></div>
    <div class="card" style="margin-bottom:16px"><div class="body playbook" id="cPlaybook"><span class="faint">Loading checklist…</span></div></div>
    <div class="card">
      <div class="toolbar">
        <input class="search" id="cQ" type="search" placeholder="Search name or id" value="${esc(filters.q)}" />
        <select id="cEnabled" aria-label="In game">
          <option value="">In game: any</option>
          <option value="on" ${filters.enabled === "on" ? "selected" : ""}>Enabled</option>
          <option value="off" ${filters.enabled === "off" ? "selected" : ""}>Off</option>
          <option value="in_play" ${filters.enabled === "in_play" ? "selected" : ""}>In play (enabled and approved)</option>
        </select>
        <select id="cValid" aria-label="Schema">
          <option value="">Schema: any</option>
          <option value="yes" ${filters.valid === "yes" ? "selected" : ""}>Valid</option>
          <option value="no" ${filters.valid === "no" ? "selected" : ""}>Invalid</option>
        </select>
        <select id="cSource" aria-label="Source">
          <option value="">Source: any</option>
          <option value="edited" ${filters.source === "edited" ? "selected" : ""}>Edited by an admin</option>
          <option value="custom" ${filters.source === "custom" ? "selected" : ""}>Custom entries</option>
          <option value="queue" ${filters.source === "queue" ? "selected" : ""}>Import queue</option>
        </select>
        <select id="cGaps" aria-label="SRD rules">
          <option value="">SRD rules: any</option>
          <option value="yes" ${filters.gaps === "yes" ? "selected" : ""}>Some rules not applied</option>
          <option value="no" ${filters.gaps === "no" ? "selected" : ""}>Every rule applied</option>
        </select>
        <span class="spacer"></span>
        <button type="button" class="ghost sm" id="cResetF">Clear filters</button>
      </div>
      <div class="toolbar" id="cKinds"></div>
      <div class="toolbar" id="cStatuses"></div>
      <div class="bulkbar" id="cBulk" hidden></div>
      <div id="cTable"><div class="loading">Loading the catalog…</div></div>
    </div>
  </div>`;

  const key = (r: { kind: string; id: string }) => `${r.kind}:${r.id}`;
  const bulk = host.querySelector<HTMLElement>("#cBulk")!;

  const paintStats = (t: QueryOut["totals"]) => {
    const card = (n: number, label: string, set: Partial<typeof filters>, alert = false) =>
      `<div class="card stat${alert && n ? " alert" : ""}"><a href="#" data-set='${esc(JSON.stringify(set))}'><b>${fmtNum(n)}</b><span>${esc(label)}</span></a></div>`;
    host.querySelector("#cStats")!.innerHTML = [
      card(t.all, "Entries in the catalog", {}),
      card(t.needsReview, "Waiting for review", { status: "needs_review" }, true),
      card(t.inPlay, "In play", { enabled: "in_play" }),
      card(t.invalid, "Fail the game schema", { valid: "no" }, true),
      card(t.edited, "Edited by an admin", { source: "edited" }),
    ].join("");
  };

  const paintBulk = () => {
    const n = selected.size;
    bulk.hidden = n === 0 && !last?.total;
    if (!last) return;
    bulk.innerHTML = `${n ? `<b>${fmtNum(n)} selected</b>` : `<span class="faint">Select rows, or act on all ${fmtNum(last.total)} matching</span>`}
      ${n && n < last.total ? `<button type="button" class="sm ghost" data-all-matching>Select all ${fmtNum(last.total)} matching</button>` : ""}
      <span class="spacer"></span>
      ${BULK.map(([a, label, cls]) => `<button type="button" class="sm ${cls}" data-bulk="${a}" ${n ? "" : "disabled"}>${esc(label)}</button>`).join("")}
      ${n ? `<button type="button" class="sm ghost" data-clear>Clear</button>` : ""}`;
  };

  const load = async () => {
    replaceParams({ ...filters, sort: state.sort, dir: state.dir, page: state.page > 1 ? state.page : "", pageSize: state.pageSize !== 50 ? state.pageSize : "" });
    const out = await api<QueryOut>(`/api/admin/content${qs({ ...filters, sort: state.sort, dir: state.dir, page: state.page, pageSize: state.pageSize })}`);
    if (!ctx.isCurrent()) return;
    last = out;
    paintStats(out.totals);
    host.querySelector("#cKinds")!.innerHTML = `<span class="faint" style="width:56px">Kind</span>${chips(
      "kind",
      [{ value: "", label: "All", count: Object.values(out.facets.kinds).reduce((a, b) => a + b, 0) }, ...KINDS.map(([v, l]) => ({ value: v, label: l, count: out.facets.kinds[v] ?? 0 }))],
      filters.kind,
    )}`;
    host.querySelector("#cStatuses")!.innerHTML = `<span class="faint" style="width:56px">Review</span>${chips(
      "status",
      [{ value: "", label: "All", count: Object.values(out.facets.statuses).reduce((a, b) => a + b, 0) }, ...STATUSES.map(([v, l]) => ({ value: v, label: l, count: out.facets.statuses[v] ?? 0 }))],
      filters.status,
    )}`;
    renderTable(host.querySelector<HTMLElement>("#cTable")!, {
      columns,
      rows: out.rows,
      total: out.total,
      state,
      rowKey: key,
      selectable: true,
      selected,
      flashKey: flash,
      empty: "No entries match these filters.",
      onState: (next) => {
        state = next;
        void load();
      },
      onSelect: paintBulk,
      onRow: (r) => void openDetail(r, onChanged),
      onAction: (act, r, button) => {
        if (act === "open") void openDetail(r, onChanged);
        else if (act === "toggle") void toggle(r, button);
      },
    });
    flash = null;
    paintBulk();
  };

  const onChanged = async (r?: { kind: string; id: string }) => {
    flash = r ? key(r) : null;
    await load();
    void ctx.refreshCounts();
  };

  const toggle = async (r: Row, button: HTMLButtonElement) => {
    const out = await write(
      button,
      `${r.name} ${r.enabled ? "disabled" : "enabled"}`,
      () => api<{ entry: Row }>(`/api/admin/content/${r.kind}/${encodeURIComponent(r.id)}/enabled`, { body: { enabled: !r.enabled } }),
      (o) => (o.entry.enabled ? "players can get it now" : "hidden from players"),
    );
    if (out) await onChanged(r);
  };

  const allMatching = async (): Promise<string[]> => {
    const keys: string[] = [];
    for (let page = 1; ; page += 1) {
      const out = await api<QueryOut>(`/api/admin/content${qs({ ...filters, sort: state.sort, dir: state.dir, page, pageSize: 200 })}`);
      keys.push(...out.rows.map(key));
      if (page * 200 >= out.total) break;
    }
    return keys;
  };

  const runBulk = async (action: BulkAction, button: HTMLButtonElement) => {
    const items = [...selected].map((k) => {
      const [kind, ...rest] = k.split(":");
      return { kind: kind!, id: rest.join(":") };
    });
    const label = BULK.find(([a]) => a === action)![1];
    let adminNote = "";
    if (action === "reject" || items.length > 25) {
      const onNote = (ev: Event) => {
        const t = ev.target as HTMLInputElement;
        if (t.id === "bulkNote") adminNote = t.value.trim();
      };
      document.addEventListener("input", onNote);
      const ok = await confirmDialog({
        title: `${label}: ${fmtNum(items.length)} entries?`,
        body: `<p>${
          action === "reject"
            ? "Rejected entries are switched off and stay off until someone reopens them."
            : action === "disable"
              ? "Players stop getting these. Heroes that already own them keep them."
              : "Each entry is written to the database one by one. Entries that cannot take the action are listed afterwards."
        }</p><label class="field"><span>Note for the review log (optional)</span><input id="bulkNote" maxlength="200" /></label>`,
        confirm: label,
        danger: action === "reject" || action === "disable",
      });
      document.removeEventListener("input", onNote);
      if (!ok) return;
    }
    button.disabled = true;
    try {
      const out = await api<{ done: number; failed: Array<{ kind: string; id: string; error: string }> }>("/api/admin/content/bulk", { body: { action, items, adminNote } });
      if (out.done) saved(`${label}: ${fmtNum(out.done)} entr${out.done === 1 ? "y" : "ies"}`);
      if (out.failed.length) {
        const reasons = new Map<string, number>();
        for (const f of out.failed) reasons.set(f.error, (reasons.get(f.error) ?? 0) + 1);
        toast(
          "warn",
          `${fmtNum(out.failed.length)} entr${out.failed.length === 1 ? "y" : "ies"} unchanged`,
          esc([...reasons.entries()].map(([code, n]) => `${n} × ${errorText(new Error(code))}`).join(" · ")),
          12000,
        );
      }
      selected.clear();
      for (const f of out.failed) selected.add(key(f));
      await onChanged();
    } catch (err) {
      failed(label, err);
    } finally {
      button.disabled = false;
    }
  };

  bulk.addEventListener("click", async (ev) => {
    const t = ev.target as HTMLElement;
    const b = t.closest<HTMLButtonElement>("[data-bulk]");
    if (b) {
      void runBulk(b.dataset.bulk as BulkAction, b);
      return;
    }
    if (t.closest("[data-all-matching]")) {
      try {
        for (const k of await allMatching()) selected.add(k);
        await load();
      } catch (err) {
        failed("Selecting all matching entries", err);
      }
      return;
    }
    if (t.closest("[data-clear]")) {
      selected.clear();
      await load();
    }
  });

  const setFilter = (patch: Partial<typeof filters>) => {
    Object.assign(filters, patch);
    state = { ...state, page: 1 };
    selected.clear();
    void load();
  };
  host.querySelector("#cStats")!.addEventListener("click", (ev) => {
    const a = (ev.target as HTMLElement).closest<HTMLElement>("[data-set]");
    if (!a) return;
    ev.preventDefault();
    const set = JSON.parse(a.dataset.set!) as Partial<typeof filters>;
    for (const k of Object.keys(filters) as Array<keyof typeof filters>) if (k !== "q") filters[k] = "";
    setFilter(set);
    syncSelects();
  });
  const syncSelects = () => {
    host.querySelector<HTMLSelectElement>("#cEnabled")!.value = filters.enabled;
    host.querySelector<HTMLSelectElement>("#cValid")!.value = filters.valid;
    host.querySelector<HTMLSelectElement>("#cSource")!.value = filters.source;
    host.querySelector<HTMLSelectElement>("#cGaps")!.value = filters.gaps;
    host.querySelector<HTMLInputElement>("#cQ")!.value = filters.q;
  };
  for (const [sel, k] of [
    ["#cKinds", "kind"],
    ["#cStatuses", "status"],
  ] as const) {
    host.querySelector(sel)!.addEventListener("click", (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-value]");
      if (b) setFilter({ [k]: b.dataset.value ?? "" });
    });
  }
  host.querySelector("#cEnabled")!.addEventListener("change", (ev) => setFilter({ enabled: (ev.target as HTMLSelectElement).value }));
  host.querySelector("#cValid")!.addEventListener("change", (ev) => setFilter({ valid: (ev.target as HTMLSelectElement).value }));
  host.querySelector("#cSource")!.addEventListener("change", (ev) => setFilter({ source: (ev.target as HTMLSelectElement).value }));
  host.querySelector("#cGaps")!.addEventListener("change", (ev) => setFilter({ gaps: (ev.target as HTMLSelectElement).value }));
  host.querySelector("#cQ")!.addEventListener("input", debounce((ev: Event) => setFilter({ q: (ev.target as HTMLInputElement).value.trim() })));
  host.querySelector("#cResetF")!.addEventListener("click", () => {
    for (const k of Object.keys(filters) as Array<keyof typeof filters>) filters[k] = "";
    syncSelects();
    setFilter({});
  });
  host.querySelector("#cReload")!.addEventListener("click", async (ev) => {
    const out = await write(ev.currentTarget as HTMLButtonElement, "Catalog re-read from disk", () => api("/api/admin/content/reload", { method: "POST" }), undefined, "Catalog reloaded");
    if (out) await onChanged();
  });
  host.querySelector("#cNew")!.addEventListener("click", () => newEntry(onChanged));

  const paintPlaybook = (steps: Array<{ id: string; done: boolean }>) => {
    const box = host.querySelector<HTMLElement>("#cPlaybook")!;
    const done = steps.filter((s) => s.done).length;
    box.innerHTML = `<b>Review checklist</b><span class="faint">${done} of ${steps.length} done</span>${steps
      .map((s) => `<label class="${s.done ? "done" : ""}"><input type="checkbox" data-step="${esc(s.id)}" ${s.done ? "checked" : ""} /> ${esc(PLAYBOOK[s.id] ?? s.id)}</label>`)
      .join("")}`;
  };
  host.querySelector("#cPlaybook")!.addEventListener("change", async (ev) => {
    const input = (ev.target as HTMLElement).closest<HTMLInputElement>("[data-step]");
    if (!input) return;
    try {
      const out = await api<{ playbook: Array<{ id: string; done: boolean }> }>(`/api/admin/content/playbook/${encodeURIComponent(input.dataset.step!)}`, { body: { done: input.checked } });
      saved(`Checklist: ${PLAYBOOK[input.dataset.step!] ?? input.dataset.step}`, input.checked ? "marked done" : "marked open");
      paintPlaybook(out.playbook);
    } catch (err) {
      input.checked = !input.checked;
      failed("Updating the checklist", err);
    }
  });

  await Promise.all([
    load(),
    api<{ playbook: Array<{ id: string; done: boolean }> }>("/api/admin/content/stats")
      .then((s) => ctx.isCurrent() && paintPlaybook(s.playbook))
      .catch(() => undefined),
  ]);
}

// ------------------------------------------------------------------ detail

function pretty(v: unknown): string {
  return JSON.stringify(v ?? null, null, 2);
}

function inlineMd(text: string): string {
  return esc(text)
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[\s(“"])_([^_\n]+?)_(?=[\s.,;:)!?”"]|$)/g, "$1<i>$2</i>")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:)!?]|$)/g, "$1<i>$2</i>");
}

/** The importer's plain markdown: paragraphs, pipe tables, bold and italic. */
function mdToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n").filter((l) => l.trim());
      if (lines.length && lines.every((l) => l.trim().startsWith("|"))) {
        const rows = lines.filter((l) => !/^\|\s*-{3}/.test(l.trim())).map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
        const [head, ...body] = rows;
        return `<table class="md"><thead><tr>${(head ?? []).map((c) => `<th>${inlineMd(c)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inlineMd(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      }
      const heading = lines[0]?.match(/^#{2,4}\s+(.+)$/);
      if (heading) return `<h4>${inlineMd(heading[1]!)}</h4>${lines.length > 1 ? `<p>${lines.slice(1).map(inlineMd).join("<br>")}</p>` : ""}`;
      return `<p>${lines.map(inlineMd).join("<br>")}</p>`;
    })
    .join("");
}

function srdPanel(srd: Record<string, unknown>): string {
  const text = typeof srd.text === "string" ? srd.text : "";
  const line = typeof srd.line === "string" ? srd.line : "";
  const extra = Object.entries(srd).filter(([k, v]) => !["text", "line"].includes(k) && v != null && v !== "");
  if (!text && !line && !extra.length) return `<p class="faint">The importer kept no source text for this entry. Run npm run content:import to refresh it.</p>`;
  return `${line ? `<p class="mono faint">${esc(line)}</p>` : ""}
    ${extra.length ? `<dl class="kv">${extra.map(([k, v]) => `<dt>${esc(k)}</dt><dd class="mono">${esc(typeof v === "string" ? v : pretty(v))}</dd>`).join("")}</dl>` : ""}
    ${text ? `<div class="srd-doc">${mdToHtml(text)}</div>` : ""}
    <p class="faint">SRD 5.2.1 text from the vendored markdown in content/srd. Edit the game JSON to change what players get.</p>`;
}

const ENGINE_STATE: Record<EngineView["state"], [string, "ok" | "warn" | "info" | "bad"]> = {
  runs: ["Runs in the game", "ok"],
  partial: ["Partly runs", "warn"],
  sheet: ["Lists and menus only", "info"],
  unused: ["Not applied by the game", "bad"],
};

function engineCard(e: EngineView | null): string {
  if (!e) return "";
  const [label, tone] = ENGINE_STATE[e.state];
  return `<div class="engine-card">
    <div class="row">${badge(label, tone)} <b>${esc(e.headline)}</b></div>
    ${
      e.lines.length
        ? `<table class="engine-lines"><tbody>${e.lines
            .map((l) => `<tr class="${l.ok ? "ok" : "no"}"><td class="mark">${l.ok ? "✓" : "✗"}</td><td class="lbl">${esc(l.label)}</td><td>${esc(l.detail)}</td></tr>`)
            .join("")}</tbody></table>`
        : ""
    }
    ${e.mismatches.length ? `<div class="notice bad"><b>The engine disagrees with the SRD</b><ul class="rules">${e.mismatches.map((m) => `<li>${esc(m)}</li>`).join("")}</ul></div>` : ""}
    ${e.notes.map((n) => `<p class="faint">${esc(n)}</p>`).join("")}
    ${e.source ? `<p class="faint mono">${esc(e.source)}</p>` : ""}
  </div>`;
}

type Loose = Record<string, unknown>;
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown): string => (v == null ? "" : String(v));
const mod = (score: number) => {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `−${Math.abs(m)}`;
};
const signedNum = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
const ABIL = ["str", "dex", "con", "int", "wis", "cha"] as const;

function dmgChips(list: unknown): string {
  return arr<Loose>(list)
    .map((d) => `<span class="tag dice" title="${d.average != null ? `Average ${str(d.average)}` : "No printed average"}">${esc(str(d.dice))} ${esc(str(d.damageType))}${d.average != null ? ` <small>avg ${esc(str(d.average))}</small>` : ""}</span>`)
    .join(" ");
}

function kvRows(rows: Array<[string, string]>): string {
  const shown = rows.filter(([, v]) => v);
  return shown.length ? `<dl class="kv">${shown.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>` : "";
}

function actionBlock(a: Loose): string {
  const attack = a.attack as Loose | undefined;
  const save = a.save as Loose | undefined;
  const range = attack?.rangeFt as Loose | undefined;
  const facts = [
    attack ? `<span class="tag dice">${esc(str(attack.kind).replace(/_/g, " "))} ${esc(signedNum(Number(attack.bonus)))} to hit</span>` : "",
    attack?.reachFt ? `<span class="tag">reach ${esc(str(attack.reachFt))} ft</span>` : "",
    range ? `<span class="tag">range ${esc(str(range.normal))}${range.long ? `/${esc(str(range.long))}` : ""} ft</span>` : "",
    save ? `<span class="tag dice">${esc(str(save.ability).toUpperCase())} save DC ${esc(str(save.dc))}${save.onSuccess === "half" ? " · half on success" : ""}</span>` : "",
    dmgChips(a.damage),
    ...arr<string>(a.conditions).map((c) => `<span class="tag warn">${esc(c)}</span>`),
    a.recharge ? `<span class="tag">recharge ${esc(str(a.recharge))}</span>` : "",
    a.uses ? `<span class="tag">${esc(str(a.uses))}</span>` : "",
  ].filter(Boolean);
  return `<div class="stat-entry"><div class="row"><b>${esc(str(a.name))}</b>${facts.join(" ")}</div><div class="stat-text">${mdToHtml(str(a.text))}</div></div>`;
}

function monsterSummary(g: Loose): string {
  const abilities = (g.abilities ?? {}) as Record<string, number>;
  const saves = (g.saves ?? {}) as Record<string, number>;
  const sections: Array<[string, unknown]> = [
    ["Traits", g.traits],
    ["Actions", g.actions],
    ["Bonus actions", g.bonusActions],
    ["Reactions", g.reactions],
    [`Legendary actions${g.legendaryUses ? ` (${str(g.legendaryUses)} per round)` : ""}`, g.legendaryActions],
  ];
  return `<div class="statblock">
    <p class="faint">${esc([g.size, g.creatureType, g.alignment].map(str).filter(Boolean).join(" · "))}${g.group ? ` · group ${esc(str(g.group))}` : ""}</p>
    ${kvRows([
      ["Armor Class", esc(str(g.ac))],
      ["Hit Points", `${esc(str(g.hp))}${g.hitDice ? ` <span class="tag dice">${esc(str(g.hitDice))}</span>` : ""}`],
      ["Speed", esc(str(g.speed))],
      ["Initiative", g.initiative != null ? esc(signedNum(Number(g.initiative))) : ""],
      ["Challenge", `CR ${esc(str(g.cr))} · ${esc(fmtNum(Number(g.xp ?? 0)))} XP${g.proficiencyBonus ? ` · PB +${esc(str(g.proficiencyBonus))}` : ""}`],
    ])}
    ${
      Object.keys(abilities).length
        ? `<table class="abil"><thead><tr><th></th>${ABIL.map((k) => `<th>${k.toUpperCase()}</th>`).join("")}</tr></thead><tbody>
          <tr><th>Score</th>${ABIL.map((k) => `<td>${esc(str(abilities[k] ?? "—"))}</td>`).join("")}</tr>
          <tr><th>Mod</th>${ABIL.map((k) => `<td>${abilities[k] != null ? esc(mod(abilities[k]!)) : "—"}</td>`).join("")}</tr>
          <tr><th>Save</th>${ABIL.map((k) => `<td>${saves[k] != null ? esc(signedNum(saves[k]!)) : "—"}</td>`).join("")}</tr>
        </tbody></table>`
        : ""
    }
    ${kvRows([
      ["Skills", esc(str(g.skills))],
      ["Resistances", esc(str(g.resistances))],
      ["Vulnerabilities", esc(str(g.vulnerabilities))],
      ["Immunities", esc(str(g.immunities))],
      ["Gear", esc(str(g.gear))],
      ["Senses", esc(str(g.senses))],
      ["Languages", esc(str(g.languages))],
    ])}
    ${sections
      .filter(([, list]) => arr(list).length)
      .map(([title, list]) => `<h3>${esc(title)}</h3>${arr<Loose>(list).map(actionBlock).join("")}`)
      .join("")}
  </div>`;
}

function spellSummary(g: Loose): string {
  const m = (g.mechanics ?? {}) as Loose;
  const c = g.components as Loose | undefined;
  const save = m.save as Loose | undefined;
  const area = m.area as Loose | undefined;
  const cantrip = arr<string>(m.cantripDice);
  const facts = [
    m.attack ? `<span class="tag dice">${esc(str(m.attack))} spell attack</span>` : "",
    save ? `<span class="tag dice">${esc(str(save.ability).toUpperCase())} save${save.onSuccess === "half" ? " · half on success" : save.onSuccess === "none" ? " · nothing on success" : ""}</span>` : "",
    dmgChips(m.damage),
    m.heal ? `<span class="tag dice">heals ${esc(str(m.heal))}${m.healAddsModifier ? " + spell mod" : ""}</span>` : "",
    area ? `<span class="tag">${esc(str(area.sizeFt))} ft ${esc(str(area.shape))}</span>` : "",
    ...arr<string>(m.conditions).map((x) => `<span class="tag warn">${esc(x)}</span>`),
  ].filter(Boolean);
  return `${kvRows([
    ["Level", Number(g.level) === 0 ? `Cantrip · ${esc(str(g.school))}` : `Level ${esc(str(g.level))} · ${esc(str(g.school))}`],
    ["Casting time", `${esc(str(g.castingTime))}${g.ritual ? " · Ritual" : ""}`],
    ["Range", `${esc(str(g.range))}${m.rangeFt != null ? ` <span class="faint">(${esc(str(m.rangeFt))} ft)</span>` : ""}`],
    ["Components", c ? esc([c.verbal ? "V" : "", c.somatic ? "S" : "", c.material ? `M (${str(c.material)})` : ""].filter(Boolean).join(", ")) : ""],
    ["Duration", `${esc(str(g.duration))}${g.concentration ? ` ${badge("Concentration", "warn")}` : ""}`],
    ["Classes", esc(arr<string>(g.classes).join(", "))],
    ["Mechanics", facts.join(" ") || `<span class="faint">No attack, save, damage, or healing found in the text.</span>`],
    ["Higher slots", m.upcastText ? `${m.upcastPerSlot ? `<span class="tag dice">+${esc(str(m.upcastPerSlot))} per slot</span> ` : ""}${esc(str(m.upcastText))}` : ""],
    ["Cantrip dice", cantrip.length === 4 ? cantrip.map((dice, i) => `<span class="tag dice">L${[1, 5, 11, 17][i]} ${esc(dice)}</span>`).join(" ") : ""],
  ])}<div class="stat-text">${mdToHtml(str(g.description))}</div>`;
}

function effectSentence(e: Loose): string {
  switch (e.kind) {
    case "ac_bonus":
      return `+${str(e.amount)} to Armor Class`;
    case "attack_bonus":
      return `+${str(e.amount)} to attack rolls`;
    case "damage_bonus":
      return `+${str(e.amount)} to damage rolls${e.damageType ? ` (${str(e.damageType)})` : ""}`;
    case "on_hit_rider":
      return `Extra ${str(e.damage)} ${str(e.damageType)} damage on every hit`;
    case "resistance":
      return `Resistance to ${str(e.damageType)} damage`;
    case "immunity":
      return `Immunity to ${str(e.damageType)} damage`;
    case "grant_spell":
      return `Can cast ${str(e.spellId).replace(/_/g, " ")}`;
    case "grant_feature":
      return `Grants the feature ${str(e.featureId)}`;
    case "stat_set":
      return `${str(e.ability).toUpperCase()} score becomes ${str(e.score)}`;
    case "stat_increase_cap":
      return `${str(e.ability).toUpperCase()} can rise to ${str(e.cap)}`;
    default:
      return `Unknown effect ${esc(pretty(e))}`;
  }
}

function itemSummary(g: Loose): string {
  const req = (g.requires ?? {}) as Loose;
  const w = g.weapon as Loose | undefined;
  const a = g.armor as Loose | undefined;
  const range = w?.rangeFt as Loose | undefined;
  const effects = arr<Loose>(g.effects);
  const needs = [
    req.attunement ? "Attunement" : "",
    arr<string>(req.class).length ? `class ${arr<string>(req.class).join(", ")}` : "",
    arr<string>(req.species).length ? `species ${arr<string>(req.species).join(", ")}` : "",
    req.spellcaster ? "a spellcaster" : "",
    req.minLevel ? `level ${str(req.minLevel)}+` : "",
  ].filter(Boolean);
  return `${kvRows([
    ["Rarity", esc(str(g.rarity).replace(/_/g, " "))],
    ["Slot", esc(str(g.slot))],
    ["Requires", esc(needs.join(" · "))],
    ["Price", g.priceGold != null ? `${esc(fmtNum(Number(g.priceGold)))} gp` : ""],
    ["Weight", g.weightLb != null ? `${esc(str(g.weightLb))} lb` : ""],
    ["Charges", esc(str(g.charges))],
    [
      "Weapon",
      w
        ? `<span class="tag dice">${esc(str(w.damage))} ${esc(str(w.damageType))}</span>${w.versatile ? ` <span class="tag dice">versatile ${esc(str(w.versatile))}</span>` : ""}${range ? ` <span class="tag">range ${esc(str(range.normal))}/${esc(str(range.long))} ft</span>` : ""} <span class="faint">${esc(str(w.category).replace(/_/g, " "))} · ${esc(arr<string>(w.properties).join(", ") || "no properties")}${g.weaponMastery ? ` · mastery ${esc(str(g.weaponMastery))}` : ""}</span>`
        : "",
    ],
    [
      "Armor",
      a
        ? `${esc(str(a.category))} · ${a.category === "shield" ? `+${esc(str(a.baseAc))} AC` : `AC ${esc(str(a.baseAc))}${a.dexCap === null ? " + DEX" : Number(a.dexCap) > 0 ? ` + DEX (max ${esc(str(a.dexCap))})` : ""}`}${a.strength ? ` · STR ${esc(str(a.strength))}` : ""}${a.stealthDisadvantage ? " · Stealth disadvantage" : ""}`
        : "",
    ],
  ])}
  <h3>Typed effects when equipped</h3>
  ${effects.length ? `<ul class="rules">${effects.map((e) => `<li>${esc(effectSentence(e))}</li>`).join("")}</ul>` : `<p class="faint">None. Equipping it changes no number.</p>`}`;
}

function genericSummary(g: Loose): string {
  const rows = Object.entries(g)
    .filter(([k, v]) => k !== "id" && k !== "name" && v != null && (typeof v !== "object" || (Array.isArray(v) && v.every((x) => typeof x !== "object"))))
    .map(([k, v]) => [k.replace(/([a-z])([A-Z])/g, "$1 $2"), esc(Array.isArray(v) ? v.join(", ") : String(v))] as [string, string]);
  return kvRows(rows) || `<p class="faint">Open the game JSON tab for the full entry.</p>`;
}

function summaryFor(kind: string, game: Record<string, unknown>): string {
  switch (kind) {
    case "monster":
      return monsterSummary(game);
    case "spell":
      return spellSummary(game);
    case "item":
      return itemSummary(game);
    default:
      return genericSummary(game);
  }
}

async function openDetail(row: { kind: string; id: string; name?: string }, onChanged: (r?: { kind: string; id: string }) => Promise<void>): Promise<void> {
  let dirty = false;
  const drawer: Drawer = openDrawer({
    title: row.name || row.id,
    subtitle: `${row.kind} · ${row.id}`,
    xl: true,
    canClose: async () => !dirty || (await confirmDialog({ title: "Drop your JSON edits?", body: "<p>The game JSON has changes that are not saved.</p>", confirm: "Drop edits", danger: true })),
  });
  const base = `/api/admin/content/${row.kind}/${encodeURIComponent(row.id)}`;
  let tab = "what";

  const paint = (d: Detail) => {
    dirty = false;
    drawer.setTitle(d.name || d.id, `${kindLabel(d.kind)} · ${d.id}`);
    const unparsed = d.unparsedFields.length ? d.unparsedFields : d.parsedUnparsedFields;
    const playBlock = d.reviewStatus === "needs_review" ? "Approve it first" : d.reviewStatus === "rejected" ? "Reopen it first" : !d.valid ? "Fix the schema errors first" : "";
    drawer.body.innerHTML = `
      <section>
        <div class="row">${statusBadge(d.reviewStatus, d.confidence)} ${d.enabled ? badge("Enabled for players", "ok") : badge("Off for players")} ${d.valid ? badge("Schema valid", "ok") : badge("Schema invalid", "bad")} ${sourceBadges(d)} ${d.inPlay ? badge("In play", "info") : ""}</div>
        <dl class="kv">
          <dt>Used for</dt><dd>${esc(d.usage || "—")}</dd>
          <dt>Last decision</dt><dd>${d.reviewedAt ? `${fmtDate(d.reviewedAt)}${d.adminNote ? ` · “${esc(d.adminNote)}”` : ""}` : `<span class="faint">None. Parser said ${esc(STATUSES.find(([s]) => s === d.fileStatus)?.[1] ?? d.fileStatus)}.</span>`}</dd>
          ${unparsed.length ? `<dt>Not parsed</dt><dd>${unparsed.map((f) => badge(f, "warn")).join(" ")} <span class="faint">Fill these by hand in the game JSON, or approve if empty is correct.</span></dd>` : ""}
        </dl>
        ${d.issues.length ? `<div class="notice bad"><b>The game cannot load this entry until these are fixed:</b><ul style="margin:6px 0 0;padding-left:18px">${d.issues.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>` : ""}
      </section>
      <section>
        <h3>Decision</h3>
        ${field("Note for the review log", `<input id="dNote" maxlength="200" value="${esc(d.adminNote)}" placeholder="Why you approved or rejected it" />`)}
        <div class="row">
          ${
            d.reviewStatus === "resolved" || d.reviewStatus === "rejected"
              ? `<button type="button" data-do="reopen">Reopen review</button>`
              : `<button type="button" class="primary" data-do="approve_enable" ${d.valid ? "" : "disabled"}>Approve and enable</button><button type="button" data-do="approve">Approve only</button>`
          }
          ${d.reviewStatus !== "rejected" ? `<button type="button" class="danger" data-do="reject">Reject</button>` : ""}
          <span class="spacer"></span>
          <button type="button" class="switch${d.enabled ? " on" : ""}" data-do="toggle" ${!d.enabled && playBlock ? `disabled title="${esc(playBlock)}"` : ""}>${d.enabled ? "Enabled" : "Off"}</button>
          ${!d.enabled && playBlock ? `<span class="faint">${esc(playBlock)}</span>` : ""}
        </div>
      </section>
      ${
        d.ambiguities.length
          ? `<section><h3>Parser questions (${d.ambiguities.length})</h3>${d.ambiguities
              .map(
                (a, i) => `<div class="notice warn stack" style="gap:8px">
              <div><b>${esc(a.field ?? "entry")}</b> · ${esc(a.summary ?? "")}</div>
              <div class="row">${(a.options ?? [])
                .map(
                  (o, j) =>
                    `<button type="button" class="sm${j === (a.parserChoice ?? 0) ? " primary" : ""}" data-opt="${i}:${j}" title="${esc(pretty(o.patch))}">${esc(o.label ?? `Option ${j + 1}`)}${j === (a.parserChoice ?? 0) ? " · parser pick" : ""}</button>`,
                )
                .join("")}<span class="faint">Applies the change, approves the entry, and keeps it off until you enable it.</span></div>
            </div>`,
              )
              .join("")}</section>`
          : ""
      }
      <div class="tabs" role="tablist">
        ${[
          ["what", "What it does"],
          ["game", "Game JSON"],
          ["srd", "SRD text"],
          ...(d.original ? [["diff", "Compare with SRD import"]] : []),
        ]
          .map(([k, l]) => `<button type="button" data-tab="${k}" class="${tab === k ? "on" : ""}">${l}</button>`)
          .join("")}
      </div>
      <section data-panel="what" ${tab === "what" ? "" : "hidden"}>
        ${engineCard(d.engine)}
        ${
          d.notModeledRules.length
            ? `<div class="notice warn"><b>The SRD text says this, but the game does not apply it (${fmtNum(d.notModeledRules.length)})</b><ul class="rules">${d.notModeledRules.map((r) => `<li>${inlineMd(r)}</li>`).join("")}</ul></div>`
            : ""
        }
        ${d.game ? summaryFor(d.kind, d.game) : `<p class="faint">No game JSON yet.</p>`}
      </section>
      <section data-panel="game" ${tab === "game" ? "" : "hidden"}>
        <textarea id="dJson" class="code" spellcheck="false" style="min-height:360px">${esc(pretty(d.game))}</textarea>
        <div class="row">
          <button type="button" class="primary" data-do="save" disabled>Save JSON</button>
          <button type="button" class="ghost" data-do="format">Format</button>
          <span class="faint" id="dJsonState">Saving stores an admin copy. The SRD file stays untouched${d.source === "srd" ? "; Revert brings it back" : ""}.</span>
          <span class="spacer"></span>
          ${d.edited && d.source === "srd" ? `<button type="button" class="danger" data-do="revert">Revert to the SRD import</button>` : ""}
          ${d.source === "custom" ? `<button type="button" class="danger" data-do="delete">Delete custom entry</button>` : ""}
        </div>
      </section>
      <section data-panel="srd" ${tab === "srd" ? "" : "hidden"}>
        ${srdPanel(d.srd)}
      </section>
      ${
        d.original
          ? `<section data-panel="diff" ${tab === "diff" ? "" : "hidden"}><div class="diff"><div><h3>SRD import</h3><pre>${esc(pretty(d.original))}</pre></div><div><h3>In the game now</h3><pre>${esc(pretty(d.game))}</pre></div></div></section>`
          : ""
      }`;
    wire(d);
  };

  const act = async (button: HTMLButtonElement | null, what: string, run: () => Promise<unknown>, detail = "") => {
    const out = await write(button, what, run, () => detail);
    if (!out) return;
    await refresh();
    await onChanged(row);
  };

  const wire = (d: Detail) => {
    const note = () => drawer.body.querySelector<HTMLInputElement>("#dNote")?.value.trim() ?? "";
    const jsonBox = drawer.body.querySelector<HTMLTextAreaElement>("#dJson")!;
    const saveBtn = drawer.body.querySelector<HTMLButtonElement>('[data-do="save"]')!;
    drawer.body.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) =>
      b.addEventListener("click", () => {
        tab = b.dataset.tab!;
        drawer.body.querySelectorAll<HTMLElement>("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== tab));
        drawer.body.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((t) => t.classList.toggle("on", t === b));
      }),
    );
    jsonBox.addEventListener("input", () => {
      dirty = true;
      saveBtn.disabled = false;
      const live = drawer.body.querySelector("#dJsonState")!;
      try {
        JSON.parse(jsonBox.value);
        live.innerHTML = `<span class="dirty-dot"></span> Unsaved changes`;
      } catch (err) {
        live.textContent = `Not valid JSON yet: ${err instanceof Error ? err.message : String(err)}`;
      }
    });
    drawer.body.querySelectorAll<HTMLButtonElement>("[data-opt]").forEach((b) =>
      b.addEventListener("click", () => {
        const [i, j] = b.dataset.opt!.split(":").map(Number);
        const opt = d.ambiguities[i!]?.options?.[j!];
        void act(b, `${d.name}: ${opt?.label ?? "option"} applied and approved`, () => api(`${base}/resolve`, { body: { optionIndex: i, patch: opt?.patch ?? {}, adminNote: note() } }));
      }),
    );
    drawer.body.querySelectorAll<HTMLButtonElement>("[data-do]").forEach((b) =>
      b.addEventListener("click", async () => {
        const what = b.dataset.do!;
        switch (what) {
          case "approve":
            return act(b, `${d.name} approved`, () => api(`${base}/resolve`, { body: { adminNote: note() } }), "still off for players");
          case "approve_enable":
            return act(b, `${d.name} approved and enabled`, () => api(`${base}/resolve`, { body: { adminNote: note(), enable: true } }), "players can get it now");
          case "reject": {
            const ok = await confirmDialog({ title: `Reject ${d.name}?`, body: "<p>It is switched off and stays off until someone reopens the review.</p>", confirm: "Reject", danger: true });
            if (ok) await act(b, `${d.name} rejected`, () => api(`${base}/resolve`, { body: { reject: true, adminNote: note() } }), "off for players");
            return;
          }
          case "reopen":
            return act(b, `${d.name} back in review`, () => api(`${base}/reopen`, { method: "POST" }));
          case "toggle":
            return act(b, `${d.name} ${d.enabled ? "disabled" : "enabled"}`, () => api(`${base}/enabled`, { body: { enabled: !d.enabled } }));
          case "format":
            try {
              jsonBox.value = pretty(JSON.parse(jsonBox.value));
            } catch (err) {
              toast("bad", "Cannot format: the JSON is not valid", esc(err instanceof Error ? err.message : String(err)));
            }
            return;
          case "save": {
            let entry: unknown;
            try {
              entry = JSON.parse(jsonBox.value);
            } catch (err) {
              toast("bad", "Not saved: the JSON is not valid", esc(err instanceof Error ? err.message : String(err)));
              return;
            }
            const out = await write(b, `${d.name} saved`, () => api<{ entry: Row }>(base, { method: "PUT", body: { entry } }), (o) =>
              o.entry.valid ? "schema valid" : `schema invalid, so it was switched off: ${o.entry.issues[0] ?? ""}`,
            );
            if (!out) return;
            dirty = false;
            await refresh();
            await onChanged(row);
            return;
          }
          case "revert": {
            const ok = await confirmDialog({ title: `Revert ${d.name}?`, body: "<p>Your edited copy is deleted and the entry goes back to the SRD import.</p>", confirm: "Revert", danger: true });
            if (ok) await act(b, `${d.name} reverted to the SRD import`, () => api(`${base}/edit`, { method: "DELETE" }));
            return;
          }
          case "delete": {
            const ok = await confirmDialog({
              title: `Delete ${d.name}?`,
              body: "<p>This custom entry is removed from the catalog. Heroes that already own it keep the copy on their sheet.</p>",
              confirm: "Delete entry",
              danger: true,
              typeToConfirm: d.id,
            });
            if (!ok) return;
            const out = await write(b, `${d.name} deleted`, () => api(`${base}/edit`, { method: "DELETE" }), undefined, "Deleted from database");
            if (!out) return;
            dirty = false;
            await drawer.close(true);
            await onChanged();
            return;
          }
          default:
            return;
        }
      }),
    );
  };

  const refresh = async () => {
    try {
      paint(await api<Detail>(base));
    } catch (err) {
      drawer.body.innerHTML = `<div class="notice bad">${esc(errorText(err))}</div>`;
    }
  };
  await refresh();
}

// ------------------------------------------------------------------ new entry

function newEntry(onChanged: (r?: { kind: string; id: string }) => Promise<void>): void {
  const drawer = openDrawer({ title: "New content entry", subtitle: "Starts from a valid entry of the same kind", xl: true });
  drawer.body.innerHTML = `<div class="grid-2">
      ${field("Kind", `<select id="nKind">${KINDS.map(([k, l]) => `<option value="${k}">${esc(l.replace(/e?s$/, ""))}</option>`).join("")}</select>`)}
      ${field("Id", `<input id="nId" pattern="[a-z0-9_]+" maxlength="80" placeholder="flame_tongue_dagger" autocomplete="off" />`, { hint: "Lowercase letters, numbers, underscores. Must be unique within the kind." })}
    </div>
    ${field("Game JSON", `<textarea id="nJson" class="code" spellcheck="false" style="min-height:420px"></textarea>`, { hint: "Fill in the name and every field the game reads. Saving validates it against the schema." })}
    <div class="notice info">New entries start switched off. Approve and enable them from the list once they are right.</div>`;
  drawer.footer.hidden = false;
  drawer.footer.innerHTML = `<span class="spacer"></span><button type="button" data-cancel>Cancel</button><button type="button" class="primary" data-create>Create entry</button>`;
  const kindSel = drawer.body.querySelector<HTMLSelectElement>("#nKind")!;
  const json = drawer.body.querySelector<HTMLTextAreaElement>("#nJson")!;
  const loadTemplate = async () => {
    try {
      const { entry } = await api<{ entry: Record<string, unknown> }>(`/api/admin/content/template/${kindSel.value}`);
      json.value = pretty(entry);
    } catch (err) {
      failed("Loading the template", err);
    }
  };
  kindSel.addEventListener("change", () => void loadTemplate());
  drawer.footer.querySelector("[data-cancel]")!.addEventListener("click", () => void drawer.close(true));
  drawer.footer.querySelector("[data-create]")!.addEventListener("click", async (ev) => {
    const kind = kindSel.value;
    const id = drawer.body.querySelector<HTMLInputElement>("#nId")!.value.trim();
    if (!/^[a-z0-9_]+$/.test(id)) {
      toast("warn", "Pick an id", "Lowercase letters, numbers, and underscores only.");
      return;
    }
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(json.value) as Record<string, unknown>;
    } catch (err) {
      toast("bad", "The JSON is not valid", esc(err instanceof Error ? err.message : String(err)));
      return;
    }
    const out = await write(
      ev.currentTarget as HTMLButtonElement,
      `${String(entry.name ?? id)} created`,
      () => api<{ entry: Row }>(`/api/admin/content/${kind}/${encodeURIComponent(id)}`, { method: "PUT", body: { entry: { ...entry, id } } }),
      (o) => (o.entry.valid ? "schema valid, off until you enable it" : `schema invalid: ${o.entry.issues[0] ?? ""}`),
    );
    if (!out) return;
    await drawer.close(true);
    await onChanged({ kind, id });
    void openDetail({ kind, id, name: out.entry.name }, onChanged);
  });
  void loadTemplate();
}
