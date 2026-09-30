/** Table management for an admin, opened from the title screen. Same session cookie as the table. */

import { sfx } from "./sfx";

type Tab = "users" | "rooms" | "saves" | "camps";

type AdminUser = { id: string; username: string; role: "admin" | "player"; disabled: boolean };
type RoomRow = {
  roomCode: string;
  campaignId: string;
  campaignVersion?: number;
  nodeId: string;
  players: Array<{ name: string }>;
};
type SaveRow = { saveId: string; campaignId: string; nodeId: string; players: string[]; updatedAt?: string };
type CampRow = { id: string; title: string; publishedVersion: number | null };
type Choice = { id?: string; label: string; next: string; flagsSet?: string[] };
type StoryNode = {
  id: string;
  type: string;
  narration?: { text: string };
  speaker?: { id: string; name: string };
  choices?: Choice[];
  check?: { ability?: string; skill?: string; dc?: number };
  onSuccess?: { narration?: { text: string }; next?: string };
  onFailure?: { narration?: { text: string }; next?: string };
  puzzle?: {
    kind?: string;
    options?: Array<{ id: string; label: string }>;
    solution?: string[];
    hint?: string;
    nudge?: string;
    maxFailsBeforePenalty?: number;
  };
  encounterId?: string;
  onVictory?: string;
};
type Encounter = {
  id: string;
  name?: string;
  mapId?: string;
  intro?: string;
  scaling?: Record<string, Array<{ monsterId: string; count: number }>>;
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

let overlay: HTMLElement | null = null;
let opener: HTMLElement | null = null;
let tab: Tab = "users";
let paintGen = 0;
let resetUserId: string | null = null;

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  if (typeof opts.body === "string") headers.set("Content-Type", "application/json");
  const res = await fetch(path, { credentials: "same-origin", ...opts, headers });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data as T;
}

function field(label: string, html: string): string {
  return `<label class="admin-field"><span>${label}</span>${html}</label>`;
}

function choiceRows(choices: Choice[]): string {
  return choices
    .map(
      (c, i) => `<div class="admin-block" data-choice="${i}">
        ${field("Label", `<input data-k="label" value="${esc(c.label)}" />`)}
        ${field("Next node", `<input data-k="next" value="${esc(c.next)}" />`)}
        ${field("Flags set (commas)", `<input data-k="flagsSet" value="${esc((c.flagsSet || []).join(", "))}" />`)}
      </div>`,
    )
    .join("");
}

export function adminOpen(): HTMLElement | null {
  return overlay && !overlay.hidden ? overlay : null;
}

export function openAdmin() {
  const active = document.activeElement;
  opener = active instanceof HTMLElement && active !== document.body && !overlay?.contains(active) ? active : opener;
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "modal admin-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Manage the table");
    overlay.innerHTML = `
      <div class="modal-card">
        <p class="modal-kicker">Table admin</p>
        <h2>Manage the table</h2>
        <nav class="admin-tabs" aria-label="Admin sections">
          <button type="button" data-tab="users">Users</button>
          <button type="button" class="ghost" data-tab="rooms">Rooms</button>
          <button type="button" class="ghost" data-tab="saves">Saves</button>
          <button type="button" class="ghost" data-tab="camps">Campaigns</button>
        </nav>
        <div id="adminBody"></div>
        <div class="row modal-actions">
          <button type="button" class="primary" id="adminClose">Back to the title</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#adminClose")!.addEventListener("click", closeAdmin);
    overlay.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => {
      b.addEventListener("click", () => {
        const next = b.dataset.tab;
        if (next !== "users" && next !== "rooms" && next !== "saves" && next !== "camps") return;
        tab = next;
        resetUserId = null;
        sfx("uiMove");
        void refresh();
      });
    });
  }
  overlay.hidden = false;
  sfx("uiConfirm");
  void refresh();
}

export function closeAdmin() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  paintGen += 1;
  sfx("uiBack");
  if (opener?.isConnected && opener.offsetParent) opener.focus({ preventScroll: true });
  opener = null;
}

function markTabs() {
  overlay?.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle("primary", on);
    b.classList.toggle("ghost", !on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
}

function body(): HTMLElement | null {
  return overlay?.querySelector<HTMLElement>("#adminBody") ?? null;
}

async function refresh() {
  const gen = ++paintGen;
  const host = body();
  if (!overlay || overlay.hidden || !host) return;
  markTabs();
  host.innerHTML = `<p class="meta">Loading…</p>`;
  try {
    if (tab === "users") await renderUsers(gen);
    else if (tab === "rooms") await renderRooms(gen);
    else if (tab === "saves") await renderSaves(gen);
    else await renderCamps(gen);
  } catch (err) {
    if (gen !== paintGen) return;
    const live = body();
    if (live) live.innerHTML = `<p class="admin-err">${esc(err instanceof Error ? err.message : "ERROR")}</p>`;
  }
}

function still(gen: number): HTMLElement | null {
  if (gen !== paintGen || !overlay || overlay.hidden) return null;
  return body();
}

async function renderUsers(gen: number) {
  const { users } = await api<{ users: AdminUser[] }>("/api/admin/users");
  const host = still(gen);
  if (!host) return;
  host.innerHTML = `<form id="adminNewUser" class="admin-block">
      <h3>New account</h3>
      <div class="admin-grid">
        ${field("Username", `<input id="adminNu" autocomplete="off" />`)}
        ${field("Password", `<input id="adminNp" type="password" autocomplete="new-password" />`)}
      </div>
      ${field("Role", `<select id="adminNr"><option value="player">player</option><option value="admin">admin</option></select>`)}
      <button type="submit" class="primary">Create</button>
      <p class="admin-err" id="adminUserErr"></p>
    </form>
    <table class="admin-table"><tr><th>Name</th><th>Role</th><th>Status</th><th></th></tr>
      ${users
        .map((u) => {
          const resetting = resetUserId === u.id;
          return `<tr><td>${esc(u.username)}</td><td>${esc(u.role)}</td><td>${u.disabled ? "Inactive" : "Active"}</td>
            <td class="admin-actions">
              ${
                resetting
                  ? `<input id="adminResetPass" type="password" autocomplete="new-password" placeholder="New password" />
                     <button type="button" class="primary" id="adminResetSave">Save password</button>
                     <button type="button" class="ghost" id="adminResetCancel">Cancel</button>`
                  : `<button type="button" class="ghost" data-reset="${esc(u.id)}">New password</button>`
              }
              <button type="button" class="ghost" data-role="${esc(u.id)}" data-next="${u.role === "admin" ? "player" : "admin"}">${u.role === "admin" ? "Make player" : "Make admin"}</button>
              <button type="button" class="ghost" data-dis="${esc(u.id)}" data-off="${u.disabled ? "0" : "1"}">${u.disabled ? "Enable" : "Disable"}</button>
            </td></tr>`;
        })
        .join("")}
    </table>`;
  host.querySelector("#adminNewUser")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const err = host.querySelector<HTMLElement>("#adminUserErr");
    if (err) err.textContent = "";
    try {
      await api("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          username: host.querySelector<HTMLInputElement>("#adminNu")?.value ?? "",
          password: host.querySelector<HTMLInputElement>("#adminNp")?.value ?? "",
          role: host.querySelector<HTMLSelectElement>("#adminNr")?.value ?? "player",
        }),
      });
      sfx("uiConfirm");
      void refresh();
    } catch (e) {
      if (err) err.textContent = e instanceof Error ? e.message : "ERROR";
    }
  });
  host.querySelector("#adminResetCancel")?.addEventListener("click", () => {
    resetUserId = null;
    void refresh();
  });
  host.querySelector("#adminResetSave")?.addEventListener("click", async () => {
    const password = host.querySelector<HTMLInputElement>("#adminResetPass")?.value ?? "";
    if (!password || !resetUserId) return;
    await api(`/api/admin/users/${resetUserId}`, { method: "POST", body: JSON.stringify({ password }) });
    resetUserId = null;
    sfx("uiConfirm");
    void refresh();
  });
  host.querySelectorAll<HTMLButtonElement>("[data-reset]").forEach((b) => {
    b.addEventListener("click", () => {
      resetUserId = b.dataset.reset ?? null;
      void refresh();
    });
  });
  host.querySelectorAll<HTMLButtonElement>("[data-role]").forEach((b) => {
    b.addEventListener("click", async () => {
      await api(`/api/admin/users/${b.dataset.role}`, { method: "POST", body: JSON.stringify({ role: b.dataset.next }) });
      void refresh();
    });
  });
  host.querySelectorAll<HTMLButtonElement>("[data-dis]").forEach((b) => {
    b.addEventListener("click", async () => {
      await api(`/api/admin/users/${b.dataset.dis}`, {
        method: "POST",
        body: JSON.stringify({ disabled: b.dataset.off === "1" }),
      });
      void refresh();
    });
  });
}

async function renderRooms(gen: number) {
  const { rooms } = await api<{ rooms: RoomRow[] }>("/api/admin/rooms");
  const host = still(gen);
  if (!host) return;
  host.innerHTML = `<table class="admin-table"><tr><th>Code</th><th>Campaign</th><th>Node</th><th>Players</th><th></th></tr>
    ${
      rooms
        .map(
          (r) => `<tr><td>${esc(r.roomCode)}</td><td>${esc(r.campaignId)} v${esc(r.campaignVersion ?? "—")}</td><td>${esc(r.nodeId)}</td><td>${esc(r.players.map((p) => p.name).join(", "))}</td>
          <td><button type="button" class="ghost" data-close="${esc(r.roomCode)}">Close</button></td></tr>`,
        )
        .join("") || `<tr><td colspan="5">No open tables</td></tr>`
    }</table>`;
  host.querySelectorAll<HTMLButtonElement>("[data-close]").forEach((b) => {
    b.addEventListener("click", async () => {
      await api(`/api/admin/rooms/${b.dataset.close}/close`, { method: "POST" });
      sfx("uiConfirm");
      void refresh();
    });
  });
}

async function renderSaves(gen: number) {
  const { saves } = await api<{ saves: SaveRow[] }>("/api/admin/saves");
  const host = still(gen);
  if (!host) return;
  host.innerHTML = `<table class="admin-table"><tr><th>Id</th><th>Campaign</th><th>Node</th><th>Heroes</th><th>When</th></tr>
    ${
      saves
        .map(
          (s) => `<tr><td>${esc(s.saveId)}</td><td>${esc(s.campaignId)}</td><td>${esc(s.nodeId)}</td><td>${esc(s.players.join(", "))}</td><td>${esc(s.updatedAt)}</td></tr>`,
        )
        .join("") || `<tr><td colspan="5">No saves</td></tr>`
    }</table>`;
}

async function renderCamps(gen: number) {
  const { campaigns } = await api<{ campaigns: CampRow[] }>("/api/admin/campaigns");
  const host = still(gen);
  if (!host) return;
  host.innerHTML = `<div class="admin-block">
      <h3>Import a zip</h3>
      <input id="adminZip" type="file" accept=".zip,application/zip" />
      <button type="button" class="primary" id="adminDoZip">Upload draft</button>
      <p class="admin-note">The zip stays a draft until you publish. Tables already open keep the version they started with.</p>
      <p class="admin-err" id="adminZipErr"></p>
    </div>
    <table class="admin-table"><tr><th>Id</th><th>Title</th><th>Published</th><th></th></tr>
      ${campaigns
        .map(
          (c) => `<tr><td>${esc(c.id)}</td><td>${esc(c.title)}</td><td>${c.publishedVersion ?? "—"}</td>
            <td class="admin-actions">
              <button type="button" data-edit="${esc(c.id)}">Editor</button>
              <button type="button" class="ghost" data-pub="${esc(c.id)}">Publish</button>
              <button type="button" class="ghost" data-un="${esc(c.id)}">Withdraw</button>
            </td></tr>`,
        )
        .join("")}
    </table>
    <div id="adminEditor"></div>`;
  host.querySelector("#adminDoZip")?.addEventListener("click", async () => {
    const err = host.querySelector<HTMLElement>("#adminZipErr");
    if (err) err.textContent = "";
    const file = host.querySelector<HTMLInputElement>("#adminZip")?.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      await api("/api/admin/campaigns/import", { method: "POST", body: buf, headers: { "Content-Type": "application/zip" } });
      sfx("uiConfirm");
      void refresh();
    } catch (e) {
      if (err) err.textContent = e instanceof Error ? e.message : "ERROR";
    }
  });
  host.querySelectorAll<HTMLButtonElement>("[data-pub]").forEach((b) => {
    b.addEventListener("click", async () => {
      await api(`/api/admin/campaigns/${b.dataset.pub}/publish`, { method: "POST" });
      void refresh();
    });
  });
  host.querySelectorAll<HTMLButtonElement>("[data-un]").forEach((b) => {
    b.addEventListener("click", async () => {
      await api(`/api/admin/campaigns/${b.dataset.un}/unpublish`, { method: "POST" });
      void refresh();
    });
  });
  host.querySelectorAll<HTMLButtonElement>("[data-edit]").forEach((b) => {
    b.addEventListener("click", () => {
      const id = b.dataset.edit;
      if (id) void openEditor(id);
    });
  });
}

async function openEditor(id: string) {
  const pack = await api<{
    manifest: { title: string };
    nodes: Array<{ id: string; type: string }>;
  }>(`/api/admin/campaigns/${id}`);
  const editor = body()?.querySelector<HTMLElement>("#adminEditor");
  if (!editor || !overlay || overlay.hidden || tab !== "camps") return;
  editor.innerHTML = `<div class="admin-block">
      <h3>${esc(pack.manifest.title)}</h3>
      <p class="admin-note">Corridor hubs, arrows, and Glowkindle's pay stay server rules. Here you change text and links.</p>
      <label class="admin-field"><span>Node</span><select id="adminNodePick">${pack.nodes
        .map((n) => `<option value="${esc(n.id)}">${esc(n.id)} · ${esc(n.type)}</option>`)
        .join("")}</select></label>
      <div id="adminNodeForm"></div>
    </div>`;
  const load = async () => {
    const nodeId = editor.querySelector<HTMLSelectElement>("#adminNodePick")?.value;
    if (!nodeId) return;
    const { node, encounter } = await api<{ node: StoryNode; encounter: Encounter | null }>(
      `/api/admin/campaigns/${id}/nodes/${nodeId}`,
    );
    const form = editor.querySelector<HTMLElement>("#adminNodeForm");
    if (!form) return;
    const narr = node.narration?.text || "";
    let extra = "";
    if (node.type === "skill_check") {
      extra =
        field("Ability", `<input id="adminAb" value="${esc(node.check?.ability || "wis")}" />`) +
        field("Skill", `<input id="adminSk" value="${esc(node.check?.skill || "")}" />`) +
        field("DC", `<input id="adminDc" value="${esc(node.check?.dc || 10)}" />`) +
        field("Success text", `<textarea id="adminOkText">${esc(node.onSuccess?.narration?.text || "")}</textarea>`) +
        field("Success node", `<input id="adminOkNext" value="${esc(node.onSuccess?.next || "")}" />`) +
        field("Failure text", `<textarea id="adminBadText">${esc(node.onFailure?.narration?.text || "")}</textarea>`) +
        field("Failure node", `<input id="adminBadNext" value="${esc(node.onFailure?.next || "")}" />`);
    } else if (node.type === "puzzle") {
      extra =
        field(
          "Options (id|label, one per line)",
          `<textarea id="adminOpts">${esc((node.puzzle?.options || []).map((o) => o.id + "|" + o.label).join("\n"))}</textarea>`,
        ) +
        field("Solution (comma-separated ids)", `<input id="adminSol" value="${esc((node.puzzle?.solution || []).join(", "))}" />`) +
        field("Hint", `<textarea id="adminHint">${esc(node.puzzle?.hint || "")}</textarea>`) +
        field("Nudge", `<textarea id="adminNudge">${esc(node.puzzle?.nudge || "")}</textarea>`) +
        field("Fails before the penalty", `<input id="adminFails" value="${esc(node.puzzle?.maxFailsBeforePenalty ?? "")}" />`);
    } else if (node.type === "encounter") {
      const groups = encounter?.scaling?.["1"] || [];
      extra =
        field("Encounter", `<input id="adminEnc" value="${esc(node.encounterId || "")}" />`) +
        field("After victory", `<input id="adminWin" value="${esc(node.onVictory || "")}" />`) +
        field("Opening text", `<textarea id="adminIntro">${esc(encounter?.intro || "")}</textarea>`) +
        field("Map", `<input id="adminMap" value="${esc(encounter?.mapId || "")}" />`) +
        field(
          "Monsters (id and count, one line)",
          `<textarea id="adminMons">${esc(groups.map((g) => g.monsterId + " " + g.count).join("\n"))}</textarea>`,
        );
    }
    form.innerHTML =
      field("Text", `<textarea id="adminNarr">${esc(narr)}</textarea>`) +
      field("Speaker id", `<input id="adminSpId" value="${esc(node.speaker?.id || "")}" />`) +
      field("Speaker name", `<input id="adminSpName" value="${esc(node.speaker?.name || "")}" />`) +
      `<h3>Choices</h3><div id="adminChoices">${choiceRows(node.choices || [])}</div><button type="button" class="ghost" id="adminAddCh">Add a choice</button>` +
      extra +
      `<p><button type="button" class="primary" id="adminSaveNode">Save draft</button></p><p class="admin-err" id="adminSaveErr"></p>`;
    form.querySelector("#adminAddCh")?.addEventListener("click", () => {
      form.querySelector("#adminChoices")?.insertAdjacentHTML("beforeend", choiceRows([{ label: "", next: "", flagsSet: [] }]));
    });
    form.querySelector("#adminSaveNode")?.addEventListener("click", async () => {
      const saveErr = form.querySelector<HTMLElement>("#adminSaveErr");
      if (saveErr) saveErr.textContent = "";
      const next = structuredClone(node);
      const text = form.querySelector<HTMLTextAreaElement>("#adminNarr")?.value ?? "";
      next.narration = { text };
      const spId = form.querySelector<HTMLInputElement>("#adminSpId")?.value.trim() ?? "";
      next.speaker = spId ? { id: spId, name: form.querySelector<HTMLInputElement>("#adminSpName")?.value.trim() || spId } : undefined;
      next.choices = [...form.querySelectorAll<HTMLElement>("[data-choice]")]
        .map((box) => ({
          id: (node.choices || [])[Number(box.dataset.choice)]?.id || "choice_" + Math.random().toString(36).slice(2, 7),
          label: box.querySelector<HTMLInputElement>("[data-k=label]")?.value ?? "",
          next: box.querySelector<HTMLInputElement>("[data-k=next]")?.value ?? "",
          flagsSet: (box.querySelector<HTMLInputElement>("[data-k=flagsSet]")?.value ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }))
        .filter((c) => c.label && c.next);
      let encounterBody: Encounter | null = null;
      if (next.type === "skill_check") {
        next.check = {
          ability: form.querySelector<HTMLInputElement>("#adminAb")?.value.trim() ?? "",
          skill: form.querySelector<HTMLInputElement>("#adminSk")?.value.trim() || undefined,
          dc: Number(form.querySelector<HTMLInputElement>("#adminDc")?.value),
        };
        next.onSuccess = {
          narration: { text: form.querySelector<HTMLTextAreaElement>("#adminOkText")?.value ?? "" },
          next: form.querySelector<HTMLInputElement>("#adminOkNext")?.value.trim() ?? "",
        };
        next.onFailure = {
          narration: { text: form.querySelector<HTMLTextAreaElement>("#adminBadText")?.value ?? "" },
          next: form.querySelector<HTMLInputElement>("#adminBadNext")?.value.trim() ?? "",
        };
      } else if (next.type === "puzzle") {
        const options = (form.querySelector<HTMLTextAreaElement>("#adminOpts")?.value ?? "")
          .split(/\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [oid, ...rest] = line.split("|");
            return { id: (oid ?? "").trim(), label: rest.join("|").trim() || (oid ?? "").trim() };
          });
        next.puzzle = {
          ...(next.puzzle || { kind: "sequence" }),
          kind: "sequence",
          options,
          solution: (form.querySelector<HTMLInputElement>("#adminSol")?.value ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          hint: form.querySelector<HTMLTextAreaElement>("#adminHint")?.value ?? "",
          nudge: form.querySelector<HTMLTextAreaElement>("#adminNudge")?.value ?? "",
        };
        const fails = form.querySelector<HTMLInputElement>("#adminFails")?.value.trim() ?? "";
        if (fails) next.puzzle.maxFailsBeforePenalty = Number(fails);
      } else if (next.type === "encounter") {
        next.encounterId = form.querySelector<HTMLInputElement>("#adminEnc")?.value.trim() ?? "";
        next.onVictory = form.querySelector<HTMLInputElement>("#adminWin")?.value.trim() ?? "";
        const monsters = (form.querySelector<HTMLTextAreaElement>("#adminMons")?.value ?? "")
          .split(/\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [monsterId, count] = line.split(/\s+/);
            return { monsterId: monsterId ?? "", count: Number(count || 1) };
          });
        const scaling = { ...(encounter?.scaling || {}) };
        scaling["1"] = monsters;
        if (!scaling["2"]) scaling["2"] = monsters;
        if (!scaling["3"]) scaling["3"] = monsters;
        encounterBody = {
          ...(encounter || { id: next.encounterId, name: next.encounterId, mapId: "", scaling: {} }),
          id: next.encounterId,
          mapId: form.querySelector<HTMLInputElement>("#adminMap")?.value.trim() ?? "",
          intro: form.querySelector<HTMLTextAreaElement>("#adminIntro")?.value ?? "",
          scaling,
        };
      }
      try {
        await api(`/api/admin/campaigns/${id}/nodes/${nodeId}`, {
          method: "PUT",
          body: JSON.stringify({ node: next, encounter: encounterBody }),
        });
        if (saveErr) saveErr.textContent = "Draft saved. Publish it for new tables.";
        sfx("uiConfirm");
      } catch (e) {
        if (saveErr) saveErr.textContent = e instanceof Error ? e.message : "ERROR";
      }
    });
  };
  editor.querySelector("#adminNodePick")?.addEventListener("change", () => void load());
  await load();
}
