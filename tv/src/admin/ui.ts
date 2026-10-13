/** Building blocks for the admin portal: API calls, toasts, dialogs, drawers, and paged tables. */

import { describeError } from "@d20-fireverse/protocol";

export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

const ADMIN_TEXT: Record<string, string> = {
  FORBIDDEN: "This needs an admin account.",
  AUTH_REQUIRED: "Your session ended. Sign in again.",
};

export function errorText(err: unknown): string {
  const code = err instanceof ApiError || err instanceof Error ? err.message : String(err ?? "");
  return ADMIN_TEXT[code] ?? describeError(code);
}

export function errorCode(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? "ERROR");
}

let onAuthLost: (() => void) | null = null;
export function setAuthLostHandler(fn: () => void): void {
  onAuthLost = fn;
}

export async function api<T = Record<string, unknown>>(
  path: string,
  opts: { method?: string; body?: unknown; raw?: Blob | ArrayBuffer; contentType?: string } = {},
): Promise<T> {
  const headers = new Headers();
  let body: BodyInit | undefined;
  if (opts.raw !== undefined) {
    body = opts.raw;
    headers.set("Content-Type", opts.contentType || "application/octet-stream");
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers.set("Content-Type", "application/json");
  }
  let res: Response;
  try {
    res = await fetch(path, { method: opts.method ?? (body ? "POST" : "GET"), credentials: "same-origin", headers, body });
  } catch {
    throw new ApiError("NETWORK", 0);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    const code = data.error || `HTTP_${res.status}`;
    if (res.status === 401) onAuthLost?.();
    throw new ApiError(code, res.status);
  }
  return data as T;
}

/** Query string from a flat object, dropping empty values. */
export function qs(params: Record<string, unknown>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

// ------------------------------------------------------------------ toasts

let toastHost: HTMLElement | null = null;

export function toast(kind: "ok" | "bad" | "warn" | "info", title: string, detail = "", ms = kind === "bad" ? 9000 : 4200): void {
  if (!toastHost) {
    toastHost = document.createElement("div");
    toastHost.className = "toasts";
    toastHost.setAttribute("role", "status");
    toastHost.setAttribute("aria-live", "polite");
    document.body.appendChild(toastHost);
  }
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  const icon = kind === "ok" ? "✓" : kind === "bad" ? "!" : kind === "warn" ? "!" : "i";
  el.innerHTML = `<span class="ico">${icon}</span><div><b>${esc(title)}</b>${detail ? `<small>${detail}</small>` : ""}</div><button type="button" class="ghost sm" aria-label="Dismiss">✕</button>`;
  const remove = () => el.remove();
  el.querySelector("button")!.addEventListener("click", remove);
  toastHost.appendChild(el);
  window.setTimeout(remove, ms);
}

/** The one confirmation every write shows: what landed in the database. */
export function saved(what: string, detail = "", title = "Saved to database"): void {
  toast("ok", title, `${esc(what)}${detail ? ` · ${esc(detail)}` : ""}`);
}

export function failed(what: string, err: unknown): void {
  toast("bad", `${what} failed. Nothing was changed.`, `${esc(errorText(err))} <code>${esc(errorCode(err))}</code>`);
}

/** Runs a write, disables the trigger while it runs, and reports the result as a toast. */
export async function write<T>(
  button: HTMLButtonElement | null,
  what: string,
  run: () => Promise<T>,
  detail?: (out: T) => string,
  title?: string,
): Promise<T | null> {
  const label = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.innerHTML = "Saving…";
  }
  try {
    const out = await run();
    saved(what, detail ? detail(out) : "", title);
    return out;
  } catch (err) {
    failed(what, err);
    return null;
  } finally {
    if (button && label !== undefined) {
      button.disabled = false;
      button.innerHTML = label;
    }
  }
}

// ------------------------------------------------------------------ dialogs

type DialogOpts = {
  title: string;
  body: string;
  confirm?: string;
  cancel?: string;
  danger?: boolean;
  /** Typed text that must match before the confirm button unlocks. */
  typeToConfirm?: string;
};

export function confirmDialog(opts: DialogOpts): Promise<boolean> {
  return new Promise((resolve) => {
    const scrim = document.createElement("div");
    scrim.className = "scrim top";
    const box = document.createElement("div");
    box.className = `dialog${opts.danger ? " danger" : ""}`;
    box.setAttribute("role", "alertdialog");
    box.setAttribute("aria-modal", "true");
    box.innerHTML = `<div class="body">
        <h2>${esc(opts.title)}</h2>
        <div class="stack">${opts.body}</div>
        ${
          opts.typeToConfirm
            ? `<label class="field"><span>Type <code>${esc(opts.typeToConfirm)}</code> to confirm</span><input data-type autocomplete="off" spellcheck="false" /></label>`
            : ""
        }
      </div>
      <footer>
        <button type="button" data-no>${esc(opts.cancel ?? "Cancel")}</button>
        <button type="button" data-yes class="${opts.danger ? "danger solid" : "primary"}">${esc(opts.confirm ?? "Confirm")}</button>
      </footer>`;
    document.body.append(box, scrim);
    const yes = box.querySelector<HTMLButtonElement>("[data-yes]")!;
    const typed = box.querySelector<HTMLInputElement>("[data-type]");
    if (typed) {
      yes.disabled = true;
      typed.addEventListener("input", () => {
        yes.disabled = typed.value.trim() !== opts.typeToConfirm;
      });
    }
    const done = (ok: boolean) => {
      document.removeEventListener("keydown", onKey, true);
      box.remove();
      scrim.remove();
      resolve(ok);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        done(false);
      } else if (ev.key === "Enter" && !yes.disabled && (document.activeElement === typed || document.activeElement === yes)) {
        ev.preventDefault();
        done(true);
      }
    };
    document.addEventListener("keydown", onKey, true);
    yes.addEventListener("click", () => done(true));
    box.querySelector("[data-no]")!.addEventListener("click", () => done(false));
    scrim.addEventListener("click", () => done(false));
    (typed ?? yes).focus();
  });
}

export function promptDialog(opts: { title: string; body?: string; label: string; value?: string; type?: string; confirm?: string; placeholder?: string }): Promise<string | null> {
  return new Promise((resolve) => {
    const scrim = document.createElement("div");
    scrim.className = "scrim top";
    const box = document.createElement("form");
    box.className = "dialog";
    box.innerHTML = `<div class="body">
        <h2>${esc(opts.title)}</h2>
        ${opts.body ? `<p>${opts.body}</p>` : ""}
        <label class="field"><span>${esc(opts.label)}</span><input name="v" type="${esc(opts.type ?? "text")}" value="${esc(opts.value ?? "")}" placeholder="${esc(opts.placeholder ?? "")}" autocomplete="off" /></label>
      </div>
      <footer><button type="button" data-no>Cancel</button><button type="submit" class="primary">${esc(opts.confirm ?? "Save")}</button></footer>`;
    document.body.append(box, scrim);
    const input = box.querySelector<HTMLInputElement>("input")!;
    const done = (v: string | null) => {
      document.removeEventListener("keydown", onKey, true);
      box.remove();
      scrim.remove();
      resolve(v);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        done(null);
      }
    };
    document.addEventListener("keydown", onKey, true);
    box.addEventListener("submit", (ev) => {
      ev.preventDefault();
      done(input.value);
    });
    box.querySelector("[data-no]")!.addEventListener("click", () => done(null));
    scrim.addEventListener("click", () => done(null));
    input.focus();
    input.select();
  });
}

// ------------------------------------------------------------------ drawer

export type Drawer = {
  el: HTMLElement;
  body: HTMLElement;
  footer: HTMLElement;
  close: (force?: boolean) => Promise<void>;
  setTitle: (title: string, subtitle?: string) => void;
};

let openDrawerRef: Drawer | null = null;

/** Side panel for one record. canClose lets an editor keep unsaved work. */
export function openDrawer(opts: { title: string; subtitle?: string; xl?: boolean; canClose?: () => boolean | Promise<boolean>; onClosed?: () => void }): Drawer {
  void openDrawerRef?.close(true);
  const scrim = document.createElement("div");
  scrim.className = "scrim";
  const el = document.createElement("aside");
  el.className = `drawer${opts.xl ? " xl" : ""}`;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.innerHTML = `<header><div class="titles"><h2></h2><small></small></div><button type="button" class="ghost icon" data-x aria-label="Close">✕</button></header>
    <div class="body"><div class="loading">Loading…</div></div><footer hidden></footer>`;
  document.body.append(scrim, el);
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Escape" && !document.querySelector(".dialog")) void drawer.close();
  };
  const drawer: Drawer = {
    el,
    body: el.querySelector<HTMLElement>(".body")!,
    footer: el.querySelector<HTMLElement>("footer")!,
    setTitle(title, subtitle) {
      el.querySelector("h2")!.textContent = title;
      el.querySelector("small")!.textContent = subtitle ?? "";
    },
    async close(force = false) {
      if (!el.isConnected) return;
      if (!force && opts.canClose && !(await opts.canClose())) return;
      document.removeEventListener("keydown", onKey);
      el.remove();
      scrim.remove();
      if (openDrawerRef === drawer) openDrawerRef = null;
      opts.onClosed?.();
    },
  };
  drawer.setTitle(opts.title, opts.subtitle);
  el.querySelector("[data-x]")!.addEventListener("click", () => void drawer.close());
  scrim.addEventListener("click", () => void drawer.close());
  document.addEventListener("keydown", onKey);
  openDrawerRef = drawer;
  return drawer;
}

export function closeDrawer(): Promise<void> {
  return openDrawerRef?.close() ?? Promise.resolve();
}

// ------------------------------------------------------------------ formatting

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return `<span class="faint">—</span>`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  const rel =
    diff < 60 ? "just now" : diff < 3600 ? `${Math.floor(diff / 60)} min ago` : diff < 86400 ? `${Math.floor(diff / 3600)} h ago` : diff < 86400 * 30 ? `${Math.floor(diff / 86400)} d ago` : d.toLocaleDateString();
  return `<span title="${esc(d.toLocaleString())}">${esc(rel)}</span>`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms = 250): (...args: A) => void {
  let t = 0;
  return (...args: A) => {
    window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), ms);
  };
}

// ------------------------------------------------------------------ url state

/** Current route params from the hash (#/users?q=ada&page=2). */
export function routeParams(): URLSearchParams {
  const hash = location.hash.replace(/^#/, "");
  const i = hash.indexOf("?");
  return new URLSearchParams(i >= 0 ? hash.slice(i + 1) : "");
}

/** Keeps filters in the URL without re-rendering, so reload and back keep the view. */
export function replaceParams(params: Record<string, unknown>): void {
  const hash = location.hash.replace(/^#/, "");
  const base = hash.split("?")[0] || "/";
  history.replaceState(null, "", `#${base}${qs(params)}`);
}

// ------------------------------------------------------------------ table

export type Column<T> = {
  key: string;
  label: string;
  sort?: string;
  className?: string;
  render: (row: T) => string;
};

export type TableState = { page: number; pageSize: number; sort: string; dir: "asc" | "desc" };

export type TableOpts<T> = {
  columns: Column<T>[];
  rows: T[];
  total: number;
  state: TableState;
  rowKey: (row: T) => string;
  selectable?: boolean;
  selected?: Set<string>;
  empty?: string;
  flashKey?: string | null;
  onState: (next: TableState) => void;
  onRow?: (row: T, ev: MouseEvent) => void;
  onSelect?: (selected: Set<string>) => void;
  /** Delegated clicks on [data-act] buttons inside rows. */
  onAction?: (action: string, row: T, button: HTMLButtonElement) => void;
};

export const PAGE_SIZES = [25, 50, 100, 200];

export function renderTable<T>(host: HTMLElement, opts: TableOpts<T>): void {
  const sel = opts.selected ?? new Set<string>();
  const { page, pageSize, sort, dir } = opts.state;
  const pages = Math.max(1, Math.ceil(opts.total / pageSize));
  const from = opts.total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(opts.total, page * pageSize);
  const keys = opts.rows.map(opts.rowKey);
  const allOn = keys.length > 0 && keys.every((k) => sel.has(k));
  const head = opts.columns
    .map((c) => {
      const active = c.sort && c.sort === sort;
      return `<th class="${c.sort ? "sortable " : ""}${c.className ?? ""}" ${c.sort ? `data-sort="${esc(c.sort)}"` : ""}>${esc(c.label)}${active ? `<span class="arrow">${dir === "asc" ? "▲" : "▼"}</span>` : ""}</th>`;
    })
    .join("");
  const body = opts.rows.length
    ? opts.rows
        .map((row, i) => {
          const k = keys[i]!;
          return `<tr data-i="${i}" class="${sel.has(k) ? "sel " : ""}${opts.onRow ? "clickable " : ""}${opts.flashKey === k ? "flash" : ""}">
            ${opts.selectable ? `<td class="check"><input type="checkbox" data-pick="${i}" ${sel.has(k) ? "checked" : ""} aria-label="Select row" /></td>` : ""}
            ${opts.columns.map((c) => `<td class="${c.className ?? ""}">${c.render(row)}</td>`).join("")}
          </tr>`;
        })
        .join("")
    : `<tr><td class="empty" colspan="${opts.columns.length + (opts.selectable ? 1 : 0)}">${esc(opts.empty ?? "No records match these filters.")}</td></tr>`;
  host.innerHTML = `<div class="table-wrap"><table class="data">
      <thead><tr>${opts.selectable ? `<th class="check"><input type="checkbox" data-all ${allOn ? "checked" : ""} aria-label="Select page" /></th>` : ""}${head}</tr></thead>
      <tbody>${body}</tbody>
    </table></div>
    <div class="pager">
      <span>${opts.total ? `${fmtNum(from)}–${fmtNum(to)} of <b>${fmtNum(opts.total)}</b>` : "0 records"}</span>
      <span class="spacer"></span>
      <label class="row">Rows <select data-size>${PAGE_SIZES.map((n) => `<option ${n === pageSize ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <button type="button" data-page="1" ${page <= 1 ? "disabled" : ""} aria-label="First page">«</button>
      <button type="button" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>‹ Prev</button>
      <span>Page <input data-goto type="number" min="1" max="${pages}" value="${page}" style="width:64px;height:28px" /> of ${fmtNum(pages)}</span>
      <button type="button" data-page="${page + 1}" ${page >= pages ? "disabled" : ""}>Next ›</button>
      <button type="button" data-page="${pages}" ${page >= pages ? "disabled" : ""} aria-label="Last page">»</button>
    </div>`;
  host.querySelectorAll<HTMLElement>("th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort!;
      opts.onState({ ...opts.state, sort: key, dir: key === sort && dir === "asc" ? "desc" : "asc", page: 1 });
    });
  });
  host.querySelectorAll<HTMLButtonElement>("[data-page]").forEach((b) => {
    b.addEventListener("click", () => opts.onState({ ...opts.state, page: Math.min(pages, Math.max(1, Number(b.dataset.page))) }));
  });
  host.querySelector<HTMLInputElement>("[data-goto]")?.addEventListener("change", (ev) => {
    const n = Number((ev.target as HTMLInputElement).value);
    if (Number.isFinite(n)) opts.onState({ ...opts.state, page: Math.min(pages, Math.max(1, Math.floor(n))) });
  });
  host.querySelector<HTMLSelectElement>("[data-size]")?.addEventListener("change", (ev) => {
    opts.onState({ ...opts.state, pageSize: Number((ev.target as HTMLSelectElement).value), page: 1 });
  });
  const tbody = host.querySelector("tbody")!;
  tbody.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement;
    const tr = target.closest<HTMLElement>("tr[data-i]");
    if (!tr) return;
    const row = opts.rows[Number(tr.dataset.i)];
    if (!row) return;
    const act = target.closest<HTMLButtonElement>("button[data-act]");
    if (act) {
      ev.stopPropagation();
      opts.onAction?.(act.dataset.act!, row, act);
      return;
    }
    if (target.closest("input, a, button, select, label")) return;
    opts.onRow?.(row, ev);
  });
  tbody.addEventListener("change", (ev) => {
    const box = (ev.target as HTMLElement).closest<HTMLInputElement>("input[data-pick]");
    if (!box) return;
    const k = keys[Number(box.dataset.pick)]!;
    if (box.checked) sel.add(k);
    else sel.delete(k);
    box.closest("tr")?.classList.toggle("sel", box.checked);
    opts.onSelect?.(sel);
  });
  host.querySelector<HTMLInputElement>("[data-all]")?.addEventListener("change", (ev) => {
    const on = (ev.target as HTMLInputElement).checked;
    for (const k of keys) {
      if (on) sel.add(k);
      else sel.delete(k);
    }
    host.querySelectorAll<HTMLInputElement>("input[data-pick]").forEach((b) => {
      b.checked = on;
      b.closest("tr")?.classList.toggle("sel", on);
    });
    opts.onSelect?.(sel);
  });
}

export function tableState(p: URLSearchParams, defaults: Partial<TableState> = {}): TableState {
  const size = Number(p.get("pageSize"));
  return {
    page: Math.max(1, Number(p.get("page")) || 1),
    pageSize: PAGE_SIZES.includes(size) ? size : (defaults.pageSize ?? 50),
    sort: p.get("sort") || defaults.sort || "",
    dir: p.get("dir") === "asc" ? "asc" : p.get("dir") === "desc" ? "desc" : (defaults.dir ?? "desc"),
  };
}

export function chips(name: string, options: Array<{ value: string; label: string; count?: number }>, current: string): string {
  return `<div class="chips" data-chips="${esc(name)}">${options
    .map(
      (o) =>
        `<button type="button" class="chip${o.value === current ? " on" : ""}" data-value="${esc(o.value)}">${esc(o.label)}${o.count != null ? `<em>${fmtNum(o.count)}</em>` : ""}</button>`,
    )
    .join("")}</div>`;
}

export function onChips(host: HTMLElement, name: string, fn: (value: string) => void): void {
  host.querySelector(`[data-chips="${name}"]`)?.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-value]");
    if (b) fn(b.dataset.value ?? "");
  });
}

export function field(label: string, control: string, opts: { hint?: string; missing?: boolean; className?: string } = {}): string {
  return `<label class="field${opts.missing ? " missing" : ""}${opts.className ? ` ${opts.className}` : ""}"><span>${esc(label)}</span>${control}${opts.hint ? `<small>${opts.hint}</small>` : ""}</label>`;
}

export function badge(text: string, tone: "ok" | "warn" | "bad" | "info" | "accent" | "" = ""): string {
  return `<span class="badge ${tone}">${esc(text)}</span>`;
}

export function downloadUrl(url: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
