import type { Page } from "../types";
import {
  api,
  badge,
  chips,
  confirmDialog,
  debounce,
  downloadUrl,
  esc,
  failed,
  field,
  fmtDate,
  fmtNum,
  openDrawer,
  promptDialog,
  qs,
  renderTable,
  replaceParams,
  routeParams,
  saved,
  tableState,
  write,
  type Column,
  type TableState,
} from "../ui";

type UserRow = {
  id: string;
  username: string;
  email: string | null;
  role: "admin" | "player";
  disabled: boolean;
  pendingConfirm: boolean;
  amazon: boolean;
  createdAt: string;
  lastSignIn: string | null;
  sessions: number;
  heroes: number;
  gold: number;
};

type UserDetail = {
  user: UserRow;
  wallet: { gold: number; hard: number };
  stashItems: number;
  heroes: Array<{ id: string; name: string; classes: string; species: string; level: number; xp: number; createdAt: string }>;
  customCharacters: Array<{ id: string; name: string; class: string; level: number }>;
  saves: Array<{ saveId: string; kind: string; campaignId: string; nodeId: string; updatedAt?: string; players: string[] }>;
};

type Filters = { q: string; status: string; role: string };

function statusBadge(u: UserRow): string {
  if (u.pendingConfirm) return badge("Pending email", "warn");
  if (u.disabled) return badge("Disabled", "bad");
  return badge("Active", "ok");
}

const COLUMNS: Column<UserRow>[] = [
  {
    key: "username",
    label: "User",
    sort: "username",
    render: (u) => `<b>${esc(u.username)}</b><span class="sub mono">${esc(u.id)}</span>`,
  },
  { key: "email", label: "Email", sort: "email", render: (u) => (u.email ? esc(u.email) : `<span class="faint">—</span>`) },
  { key: "role", label: "Role", sort: "role", render: (u) => (u.role === "admin" ? badge("Admin", "accent") : badge("Player")) },
  { key: "status", label: "Status", render: statusBadge },
  { key: "login", label: "Sign-in", render: (u) => (u.amazon ? badge("Amazon", "info") : badge("Password")) },
  { key: "heroes", label: "Heroes", sort: "heroes", className: "right", render: (u) => fmtNum(u.heroes) },
  { key: "gold", label: "Gold", sort: "gold", className: "right", render: (u) => fmtNum(u.gold) },
  { key: "created", label: "Created", sort: "created", className: "nowrap", render: (u) => fmtDate(u.createdAt) },
  { key: "last", label: "Last sign-in", sort: "lastSignIn", className: "nowrap", render: (u) => fmtDate(u.lastSignIn) },
  { key: "actions", label: "", className: "actions", render: () => `<button type="button" class="sm" data-act="open">Edit</button>` },
];

let selected = new Set<string>();
let flash: string | null = null;

export const usersPage: Page = {
  id: "users",
  label: "Users",
  group: "Players",
  count: (o) => ({ value: o.users.total, alert: o.users.pending > 0 }),
  async render(host, ctx) {
    const p = routeParams();
    const filters: Filters = { q: p.get("q") ?? "", status: p.get("status") ?? "", role: p.get("role") ?? "" };
    let state: TableState = tableState(p, { sort: "created", dir: "desc" });
    selected = new Set();
    host.innerHTML = `<div class="page">
      <div class="page-head">
        <div class="titles"><h1>Users</h1><p id="usersSummary">Every account on this server. Search runs on the database, not on this page.</p></div>
        <button type="button" id="usersExport">Export CSV</button>
        <button type="button" class="primary" id="usersNew">New user</button>
      </div>
      <div class="card">
        <div class="toolbar">
          <input class="search" id="usersQ" type="search" placeholder="Search username, email, or id" value="${esc(filters.q)}" />
          <div id="usersChips"></div>
          <select id="usersRole" aria-label="Role">
            <option value="">Any role</option>
            <option value="admin" ${filters.role === "admin" ? "selected" : ""}>Admins</option>
            <option value="player" ${filters.role === "player" ? "selected" : ""}>Players</option>
          </select>
          <span class="spacer"></span>
          <button type="button" class="ghost" id="usersReload">Refresh</button>
        </div>
        <div class="bulkbar" id="usersBulk" hidden></div>
        <div id="usersTable"><div class="loading">Loading users…</div></div>
      </div>
    </div>`;
    const tableHost = host.querySelector<HTMLElement>("#usersTable")!;
    const bulk = host.querySelector<HTMLElement>("#usersBulk")!;

    const paintBulk = () => {
      bulk.hidden = selected.size === 0;
      bulk.innerHTML = `<b>${fmtNum(selected.size)} selected</b>
        <button type="button" class="sm" data-bulk="enable">Enable</button>
        <button type="button" class="sm" data-bulk="disable">Disable</button>
        <button type="button" class="sm" data-bulk="revoke">Sign out everywhere</button>
        <button type="button" class="sm danger" data-bulk="delete">Delete…</button>
        <span class="spacer"></span>
        <button type="button" class="sm ghost" data-bulk="clear">Clear selection</button>`;
    };

    const load = async () => {
      replaceParams({ ...filters, ...state, page: state.page > 1 ? state.page : "", pageSize: state.pageSize !== 50 ? state.pageSize : "" });
      const data = await api<{ rows: UserRow[]; total: number }>(`/api/admin/users${qs({ ...filters, ...state })}`);
      if (!ctx.isCurrent()) return;
      const counts = await api<{ users: { total: number; admins: number; active: number; disabled: number; pending: number; amazon: number } }>("/api/admin/overview");
      if (!ctx.isCurrent()) return;
      const c = counts.users;
      host.querySelector("#usersSummary")!.textContent = `${fmtNum(c.total)} accounts · ${fmtNum(c.admins)} admins · ${fmtNum(c.pending)} waiting for email confirmation`;
      host.querySelector("#usersChips")!.innerHTML = chips(
        "status",
        [
          { value: "", label: "All", count: c.total },
          { value: "active", label: "Active", count: c.active },
          { value: "disabled", label: "Disabled", count: c.disabled },
          { value: "pending", label: "Pending email", count: c.pending },
          { value: "amazon", label: "Amazon", count: c.amazon },
        ],
        filters.status,
      );
      renderTable(tableHost, {
        columns: COLUMNS,
        rows: data.rows,
        total: data.total,
        state,
        rowKey: (u) => u.id,
        selectable: true,
        selected,
        flashKey: flash,
        empty: filters.q || filters.status || filters.role ? "No users match these filters." : "No users yet.",
        onState: (next) => {
          state = next;
          void load();
        },
        onRow: (u) => openUser(u.id, reload),
        onAction: (_act, u) => openUser(u.id, reload),
        onSelect: paintBulk,
      });
      flash = null;
      paintBulk();
    };
    const reload = () => {
      void load();
      void ctx.refreshCounts();
    };

    host.querySelector("#usersChips")!.addEventListener("click", (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-value]");
      if (!b) return;
      filters.status = b.dataset.value ?? "";
      state = { ...state, page: 1 };
      void load();
    });
    host.querySelector("#usersQ")!.addEventListener(
      "input",
      debounce((ev: Event) => {
        filters.q = (ev.target as HTMLInputElement).value.trim();
        state = { ...state, page: 1 };
        void load();
      }, 300),
    );
    host.querySelector("#usersRole")!.addEventListener("change", (ev) => {
      filters.role = (ev.target as HTMLSelectElement).value;
      state = { ...state, page: 1 };
      void load();
    });
    host.querySelector("#usersReload")!.addEventListener("click", reload);
    host.querySelector("#usersExport")!.addEventListener("click", () => downloadUrl(`/api/admin/users/export.csv${qs(filters)}`));
    host.querySelector("#usersNew")!.addEventListener("click", () => newUser(reload));
    bulk.addEventListener("click", async (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-bulk]");
      if (!b) return;
      const action = b.dataset.bulk!;
      if (action === "clear") {
        selected.clear();
        void load();
        return;
      }
      const ids = [...selected];
      const verbs: Record<string, string> = { enable: "Enable", disable: "Disable", revoke: "Sign out", delete: "Delete" };
      const ok = await confirmDialog({
        title: `${verbs[action]} ${ids.length} account${ids.length === 1 ? "" : "s"}?`,
        body:
          action === "delete"
            ? `<p>This permanently removes the accounts with their heroes, stash, wallet, friends, custom characters, and the saves they own. It cannot be undone.</p>`
            : action === "disable"
              ? `<p>Disabled accounts are signed out at once and cannot sign in until you enable them.</p>`
              : action === "revoke"
                ? `<p>Every device signed in to these accounts has to sign in again.</p>`
                : `<p>These accounts can sign in again.</p>`,
        confirm: verbs[action],
        danger: action === "delete" || action === "disable",
        typeToConfirm: action === "delete" ? `DELETE ${ids.length}` : undefined,
      });
      if (!ok) return;
      try {
        const out = await api<{ done: number; failed: Array<{ id: string; error: string }> }>("/api/admin/users/bulk", { body: { ids, action } });
        saved(`${verbs[action]}: ${out.done} account${out.done === 1 ? "" : "s"}`, out.failed.length ? `${out.failed.length} skipped (${out.failed.map((f) => f.error).join(", ")})` : "");
        selected.clear();
        reload();
      } catch (err) {
        failed("Bulk action", err);
      }
    });
    await load();
  },
};

function newUser(reload: () => void): void {
  const d = openDrawer({ title: "New user", subtitle: "Creates a confirmed account right away" });
  d.body.innerHTML = `<form class="stack" id="nu">
      <div class="grid-2">
        ${field("Username", `<input name="username" required autocomplete="off" pattern="[a-zA-Z0-9._-]{2,32}" />`, { hint: "2 to 32 letters, numbers, dots, or dashes" })}
        ${field("Email", `<input name="email" type="email" autocomplete="off" />`, { hint: "Optional" })}
        ${field("Password", `<input name="password" type="password" required minlength="4" autocomplete="new-password" />`)}
        ${field("Role", `<select name="role"><option value="player">Player</option><option value="admin">Admin</option></select>`)}
      </div>
    </form>`;
  d.footer.hidden = false;
  d.footer.innerHTML = `<span class="spacer"></span><button type="button" data-cancel>Cancel</button><button type="button" class="primary" data-save>Create user</button>`;
  d.footer.querySelector("[data-cancel]")!.addEventListener("click", () => void d.close());
  const form = d.body.querySelector<HTMLFormElement>("#nu")!;
  const submit = async () => {
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form));
    const out = await write(d.footer.querySelector("[data-save]"), `User ${String(data.username)} created`, () => api<UserDetail>("/api/admin/users", { body: data }));
    if (!out) return;
    flash = out.user.id;
    await d.close(true);
    reload();
  };
  d.footer.querySelector("[data-save]")!.addEventListener("click", () => void submit());
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    void submit();
  });
  form.querySelector("input")!.focus();
}

function openUser(id: string, reload: () => void): void {
  let dirty = false;
  const d = openDrawer({
    title: "User",
    subtitle: id,
    xl: true,
    canClose: async () => !dirty || confirmDialog({ title: "Discard changes?", body: "<p>The profile has edits that are not saved.</p>", confirm: "Discard", danger: true }),
  });
  const paint = async () => {
    const data = await api<UserDetail>(`/api/admin/users/${encodeURIComponent(id)}`);
    const u = data.user;
    dirty = false;
    d.setTitle(u.username, `${u.id} · created ${new Date(u.createdAt).toLocaleString()}`);
    d.body.innerHTML = `
      <div class="row">${statusBadge(u)} ${u.role === "admin" ? badge("Admin", "accent") : badge("Player")} ${u.amazon ? badge("Login with Amazon", "info") : ""}
        <span class="faint">${fmtNum(u.sessions)} active session${u.sessions === 1 ? "" : "s"} · last sign-in ${fmtDate(u.lastSignIn)}</span></div>
      ${u.pendingConfirm ? `<div class="notice warn row"><span class="spacer">This account never clicked the confirmation email, so it cannot sign in.</span><button type="button" class="sm" id="uConfirm">Confirm now</button></div>` : ""}
      <section>
        <h3>Profile</h3>
        <form id="uProfile" class="grid-2">
          ${field("Username", `<input name="username" value="${esc(u.username)}" autocomplete="off" />`)}
          ${field("Email", `<input name="email" type="email" value="${esc(u.email ?? "")}" autocomplete="off" />`)}
          ${field("Role", `<select name="role"><option value="player" ${u.role === "player" ? "selected" : ""}>Player</option><option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option></select>`)}
          ${field("Status", `<select name="disabled"><option value="0" ${!u.disabled ? "selected" : ""}>Active</option><option value="1" ${u.disabled ? "selected" : ""}>Disabled</option></select>`, { hint: "Disabling signs the account out everywhere." })}
        </form>
        <div class="row end"><span class="faint" id="uDirty"></span><button type="button" class="primary" id="uSave" disabled>Save profile</button></div>
      </section>
      <hr />
      <div class="grid-2">
        <section>
          <h3>Password</h3>
          <div class="row"><input id="uPass" type="password" placeholder="New password (min 4)" autocomplete="new-password" style="flex:1" /><button type="button" id="uPassSave">Set password</button></div>
        </section>
        <section>
          <h3>Wallet · ${fmtNum(data.wallet.gold)} gold · ${fmtNum(data.wallet.hard)} gems · ${fmtNum(data.stashItems)} stash items</h3>
          <div class="row"><input id="uGold" type="number" step="1" placeholder="+500 or -200" style="flex:1" /><button type="button" id="uGoldSave">Change gold</button></div>
        </section>
      </div>
      <section>
        <h3>Heroes (${data.heroes.length})</h3>
        ${
          data.heroes.length
            ? `<div class="card"><table class="data"><thead><tr><th>Name</th><th>Classes</th><th>Species</th><th class="right">Level</th><th class="right">XP</th><th>Created</th><th></th></tr></thead><tbody>${data.heroes
                .map(
                  (h) => `<tr><td><b>${esc(h.name)}</b><span class="sub mono">${esc(h.id)}</span></td><td>${esc(h.classes)}</td><td>${esc(h.species)}</td>
                    <td class="right">${h.level}</td><td class="right">${fmtNum(h.xp)}</td><td>${fmtDate(h.createdAt)}</td>
                    <td class="actions"><button type="button" class="sm" data-xp="${esc(h.id)}" data-name="${esc(h.name)}">Grant XP</button></td></tr>`,
                )
                .join("")}</tbody></table></div>`
            : `<p class="faint">No account heroes.</p>`
        }
      </section>
      ${
        data.customCharacters.length
          ? `<section><h3>Custom characters (${data.customCharacters.length})</h3><p class="muted">${data.customCharacters.map((c) => `${esc(c.name)} · ${esc(c.class)} ${c.level}`).join("<br />")}</p></section>`
          : ""
      }
      <section>
        <h3>Saves owned (${data.saves.length})</h3>
        ${
          data.saves.length
            ? `<div class="card"><table class="data"><thead><tr><th>Save</th><th>Campaign</th><th>Scene</th><th>Heroes</th><th>Saved</th><th></th></tr></thead><tbody>${data.saves
                .map(
                  (s) => `<tr><td class="mono">${esc(s.saveId)}</td><td>${esc(s.campaignId)}</td><td class="mono">${esc(s.nodeId)}</td><td>${esc(s.players.join(", "))}</td><td>${fmtDate(s.updatedAt)}</td>
                    <td class="actions"><button type="button" class="sm danger" data-del-save="${esc(s.saveId)}">Delete</button></td></tr>`,
                )
                .join("")}</tbody></table></div>`
            : `<p class="faint">No saves.</p>`
        }
      </section>
      <hr />
      <section>
        <h3>Danger zone</h3>
        <div class="row">
          <button type="button" id="uRevoke">Sign out everywhere</button>
          <button type="button" class="danger" id="uDelete">Delete account…</button>
        </div>
      </section>`;
    const form = d.body.querySelector<HTMLFormElement>("#uProfile")!;
    const saveBtn = d.body.querySelector<HTMLButtonElement>("#uSave")!;
    form.addEventListener("input", () => {
      dirty = true;
      saveBtn.disabled = false;
      d.body.querySelector("#uDirty")!.innerHTML = `<span class="dirty-dot"></span> Unsaved changes`;
    });
    saveBtn.addEventListener("click", async () => {
      const f = new FormData(form);
      const patch: Record<string, unknown> = {};
      if (String(f.get("username")) !== u.username) patch.username = String(f.get("username"));
      if (String(f.get("email")) !== (u.email ?? "")) patch.email = String(f.get("email"));
      if (String(f.get("role")) !== u.role) patch.role = String(f.get("role"));
      const disabled = f.get("disabled") === "1";
      if (disabled !== u.disabled) patch.disabled = disabled;
      if (!Object.keys(patch).length) return;
      if (patch.role === "admin") {
        const ok = await confirmDialog({ title: `Make ${u.username} an admin?`, body: "<p>Admins can open this portal and change every account, save, and campaign.</p>", confirm: "Make admin" });
        if (!ok) return;
      }
      const out = await write(saveBtn, `Profile of ${u.username}`, () => api(`/api/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }), () => Object.keys(patch).join(", "));
      if (!out) return;
      flash = id;
      reload();
      await paint();
    });
    d.body.querySelector("#uConfirm")?.addEventListener("click", async (ev) => {
      const out = await write(ev.currentTarget as HTMLButtonElement, `${u.username} confirmed`, () => api(`/api/admin/users/${encodeURIComponent(id)}/confirm`, { method: "POST" }));
      if (out) {
        reload();
        await paint();
      }
    });
    d.body.querySelector("#uPassSave")!.addEventListener("click", async (ev) => {
      const input = d.body.querySelector<HTMLInputElement>("#uPass")!;
      if (input.value.length < 4) {
        input.focus();
        return;
      }
      const out = await write(ev.currentTarget as HTMLButtonElement, `Password of ${u.username}`, () =>
        api(`/api/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body: { password: input.value } }),
      );
      if (out) input.value = "";
    });
    d.body.querySelector("#uGoldSave")!.addEventListener("click", async (ev) => {
      const amount = Number(d.body.querySelector<HTMLInputElement>("#uGold")!.value);
      if (!Number.isInteger(amount) || amount === 0) return;
      const out = await write(ev.currentTarget as HTMLButtonElement, `Gold ${amount > 0 ? "+" : ""}${amount} for ${u.username}`, () =>
        api<{ gold: number }>(`/api/admin/users/${encodeURIComponent(id)}/gold`, { body: { amount } }),
        (o) => `balance ${fmtNum(o.gold)}`,
      );
      if (out) {
        reload();
        await paint();
      }
    });
    d.body.querySelectorAll<HTMLButtonElement>("[data-xp]").forEach((b) =>
      b.addEventListener("click", async () => {
        const raw = await promptDialog({ title: `Grant XP to ${b.dataset.name}`, label: "XP (negative removes)", type: "number", confirm: "Grant XP" });
        const amount = Number(raw);
        if (raw == null || !Number.isInteger(amount) || amount === 0) return;
        const out = await write(b, `XP ${amount > 0 ? "+" : ""}${amount} for ${b.dataset.name}`, () =>
          api<{ hero: { xp: number } }>(`/api/admin/heroes/${encodeURIComponent(b.dataset.xp!)}/xp`, { body: { amount } }),
          (o) => `total ${fmtNum(o.hero.xp)} XP`,
        );
        if (out) await paint();
      }),
    );
    d.body.querySelectorAll<HTMLButtonElement>("[data-del-save]").forEach((b) =>
      b.addEventListener("click", async () => {
        const saveId = b.dataset.delSave!;
        if (!(await confirmDialog({ title: "Delete this save?", body: `<p><code>${esc(saveId)}</code> is removed from disk. A table already open from it keeps playing.</p>`, confirm: "Delete save", danger: true }))) return;
        const out = await write(b, `Save ${saveId} deleted`, () => api(`/api/admin/saves/${encodeURIComponent(saveId)}`, { method: "DELETE" }));
        if (out) {
          reload();
          await paint();
        }
      }),
    );
    d.body.querySelector("#uRevoke")!.addEventListener("click", async (ev) => {
      if (!(await confirmDialog({ title: `Sign ${u.username} out everywhere?`, body: "<p>Every TV, phone, and browser on this account has to sign in again.</p>", confirm: "Sign out" }))) return;
      const out = await write(ev.currentTarget as HTMLButtonElement, `Sessions of ${u.username} revoked`, () =>
        api<{ revoked: number }>(`/api/admin/users/${encodeURIComponent(id)}/revoke-sessions`, { method: "POST" }),
        (o) => `${o.revoked} session${o.revoked === 1 ? "" : "s"}`,
      );
      if (out) await paint();
    });
    d.body.querySelector("#uDelete")!.addEventListener("click", async (ev) => {
      const ok = await confirmDialog({
        title: `Delete ${u.username}?`,
        body: `<p>This permanently removes:</p><ul><li>the account and its sessions</li><li>${data.heroes.length} hero${data.heroes.length === 1 ? "" : "es"}, the stash, and the wallet</li><li>${data.customCharacters.length} custom character${data.customCharacters.length === 1 ? "" : "s"}</li><li>${data.saves.length} owned save${data.saves.length === 1 ? "" : "s"}</li></ul><p>It cannot be undone.</p>`,
        confirm: "Delete account",
        danger: true,
        typeToConfirm: u.username,
      });
      if (!ok) return;
      const out = await write(ev.currentTarget as HTMLButtonElement, `Account ${u.username} deleted`, () =>
        api<{ savesDeleted: number; heroesDeleted: number }>(`/api/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" }),
        (o) => `${o.heroesDeleted} heroes, ${o.savesDeleted} saves removed`,
      );
      if (!out) return;
      await d.close(true);
      reload();
    });
  };
  paint().catch((err) => {
    d.body.innerHTML = `<div class="notice bad">Could not load this user. ${esc(String(err instanceof Error ? err.message : err))}</div>`;
  });
}
