/**
 * The phone when it is not at a table: Amazon sign-in, forged heroes, and a quiet watch
 * for the same account signing in on a TV.
 */

import { isSheetTab, pcSheetHtml, type PcSheet, type SheetTab } from "@d20-fireverse/protocol/sheet";

type Pregen = { id: string; name: string; summary: string; portrait: string; level: number; custom?: boolean };
type Catalog = {
  races: Array<{ id: string; label: string }>;
  classes: Array<{
    id: string;
    label: string;
    skillChoices: number;
    skillList: string[];
    fightingStyleRequired?: boolean;
    fightingStyleOptions?: string[] | null;
    spellLists?: Record<string, string[]> | null;
    cantripsKnown?: Record<string, number> | null;
    spellsKnown?: Record<string, number> | null;
  }>;
  backgrounds: Array<{ id: string; label: string; skills: string[] }>;
  skills: Record<string, { label: string }>;
  fightingStyles: Array<{ id: string; label: string }>;
  standardArray: number[];
  spellCatalog: Record<string, { name: string }>;
};
type Friend = { id: string; username: string; status: string };
type BoardRow = { username: string; wins: number; losses: number };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}

export function mountPocket(host: HTMLElement, adopt: (key: string) => void, scanning: () => boolean): void {
  host.innerHTML = `
    <section class="pocket" id="pocketCard">
      <p class="meta" id="pocketStatus">Checking your account…</p>
    </section>`;
  const card = () => host.querySelector<HTMLElement>("#pocketCard")!;
  let user: string | null = null;
  let catalog: Catalog | null = null;
  let heroes: Pregen[] = [];

  const paintLogin = () => {
    card().innerHTML = `
      <h2>Your heroes</h2>
      <p class="meta">Sign in to read and forge heroes while the TV is off. The camera above still joins a friend's table.</p>
      <a class="primary pocket-login" href="/api/login/amazon/start?next=/companion/">Continue with Amazon</a>`;
  };

  const paintHome = () => {
    card().innerHTML = `
      <div class="pocket-head"><h2>${esc(user ?? "Heroes")}</h2><button type="button" class="ghost" id="pocketOut">Log out</button></div>
      <div class="pocket-heroes">${
        heroes.length
          ? heroes.map((h) => `<button type="button" class="ghost pocket-hero" data-hero="${esc(h.id)}"><img src="${esc(h.portrait)}" alt="" /><span><strong>${esc(h.name)}</strong><em>${esc(h.summary)}</em></span></button>`).join("")
          : `<p class="meta">No forged heroes yet.</p>`
      }</div>
      <div class="row2">
        <button type="button" class="primary" id="pocketForge">Forge a hero</button>
        <button type="button" id="pocketSocial">Friends & board</button>
      </div>`;
    card().querySelector("#pocketOut")!.addEventListener("click", () => {
      void fetch("/api/logout", { method: "POST", credentials: "same-origin" }).then(() => {
        user = null;
        paintLogin();
      });
    });
    card().querySelector("#pocketForge")!.addEventListener("click", () => void openForge());
    card().querySelector("#pocketSocial")!.addEventListener("click", () => void openSocial());
    card().querySelectorAll<HTMLElement>("[data-hero]").forEach((b) => b.addEventListener("click", () => void openHero(b.dataset.hero!)));
  };

  const openHero = async (id: string) => {
    const data = await api<{ sheet: PcSheet; seated: boolean }>(`/api/me/characters/${id}`);
    let tab: SheetTab = "overview";
    const draw = () => {
      card().innerHTML = `
        <button type="button" class="ghost" id="pocketBack">← Heroes</button>
        <div class="pocket-sheet">${pcSheetHtml(data.sheet, tab, { isMyTurn: false, showEconomy: false })}</div>
        <div class="row2">
          <button type="button" id="pocketRename" ${data.seated ? "disabled" : ""}>Rename</button>
          <button type="button" id="pocketReforge" ${data.seated ? "disabled" : ""}>Reforge</button>
          <button type="button" id="pocketDelete" ${data.seated ? "disabled" : ""}>Delete</button>
        </div>
        ${data.seated ? `<p class="meta">This hero is seated. Reforge and delete wait until that table closes.</p>` : ""}`;
      card().querySelector("#pocketBack")!.addEventListener("click", paintHome);
      card().querySelector(".pocket-sheet")!.addEventListener("click", (ev) => {
        const t = (ev.target as HTMLElement).closest<HTMLElement>("[data-sheet-tab]");
        if (!t || !isSheetTab(t.dataset.sheetTab)) return;
        tab = t.dataset.sheetTab;
        draw();
      });
      card().querySelector("#pocketRename")!.addEventListener("click", async () => {
        const name = window.prompt("Name", data.sheet.name);
        if (!name) return;
        await api(`/api/characters/${id}/rename`, { method: "POST", body: JSON.stringify({ name }) });
        await refresh();
      });
      card().querySelector("#pocketReforge")!.addEventListener("click", () => void openForge(id));
      card().querySelector("#pocketDelete")!.addEventListener("click", async () => {
        if (!window.confirm("Delete this hero?")) return;
        await api(`/api/characters/${id}`, { method: "DELETE" });
        await refresh();
      });
    };
    draw();
  };

  const openSocial = async () => {
    const friends = await api<{ friends: Friend[] }>("/api/friends");
    const board = await api<{ rows: BoardRow[] }>("/api/arena/leaderboard?scope=global");
    card().innerHTML = `
      <button type="button" class="ghost" id="pocketBack">← Heroes</button>
      <h2>Friends</h2>
      <form id="friendForm" class="row2"><input id="friendName" placeholder="Username" maxlength="32" /><button type="submit">Ask</button></form>
      <ul class="pocket-list">${friends.friends.map((f) => `<li>${esc(f.username)} · ${esc(f.status)}${f.status === "pending" ? ` <button type="button" data-accept="${esc(f.id)}">Accept</button>` : ""}</li>`).join("") || "<li>No friends yet.</li>"}</ul>
      <h2>Arena board</h2>
      <ul class="pocket-list">${board.rows.slice(0, 12).map((r) => `<li>${esc(r.username)} · ${r.wins}–${r.losses}</li>`).join("") || "<li>No arena games yet.</li>"}</ul>`;
    card().querySelector("#pocketBack")!.addEventListener("click", paintHome);
    card().querySelector("#friendForm")!.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const username = (card().querySelector("#friendName") as HTMLInputElement).value.trim();
      if (!username) return;
      await api("/api/friends", { method: "POST", body: JSON.stringify({ username }) });
      await openSocial();
    });
    card().querySelectorAll<HTMLElement>("[data-accept]").forEach((b) =>
      b.addEventListener("click", async () => {
        await api("/api/friends/accept", { method: "POST", body: JSON.stringify({ userId: b.dataset.accept }) });
        await openSocial();
      }),
    );
  };

  const openForge = async (reforgeId?: string) => {
    catalog = catalog ?? (await api<Catalog>("/api/chargen"));
    const cat = catalog;
    const abilities = ["str", "dex", "con", "int", "wis", "cha"] as const;
    const values = [...cat.standardArray];
    const assigned: Record<string, number> = { str: values[0]!, dex: values[1]!, con: values[2]!, int: values[3]!, wis: values[4]!, cha: values[5]! };
    card().innerHTML = `
      <button type="button" class="ghost" id="pocketBack">← Heroes</button>
      <h2>${reforgeId ? "Reforge" : "Forge a hero"}</h2>
      <form id="forgeForm" class="forge">
        <label>Name <input id="fgName" maxlength="40" required /></label>
        <label>Level <select id="fgLevel"><option>1</option><option>2</option><option>3</option></select></label>
        <label>Race <select id="fgRace">${cat.races.map((r) => `<option value="${esc(r.id)}">${esc(r.label)}</option>`).join("")}</select></label>
        <label>Class <select id="fgClass">${cat.classes.map((c) => `<option value="${esc(c.id)}">${esc(c.label)}</option>`).join("")}</select></label>
        <label>Background <select id="fgBg">${cat.backgrounds.map((b) => `<option value="${esc(b.id)}">${esc(b.label)}</option>`).join("")}</select></label>
        <div id="fgScores"></div>
        <div id="fgExtra"></div>
        <p class="meta" id="fgError"></p>
        <button type="submit" class="primary">Save hero</button>
      </form>`;
    const scores = card().querySelector<HTMLElement>("#fgScores")!;
    const extra = card().querySelector<HTMLElement>("#fgExtra")!;
    const paintScores = () => {
      scores.innerHTML = abilities
        .map(
          (a) =>
            `<label>${a.toUpperCase()} <select data-ab="${a}">${cat.standardArray.map((n) => `<option ${assigned[a] === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>`,
        )
        .join("");
      scores.querySelectorAll<HTMLSelectElement>("select").forEach((s) =>
        s.addEventListener("change", () => {
          assigned[s.dataset.ab!] = Number(s.value);
        }),
      );
    };
    const paintExtra = () => {
      const cls = cat.classes.find((c) => c.id === (card().querySelector("#fgClass") as HTMLSelectElement).value)!;
      const bg = cat.backgrounds.find((b) => b.id === (card().querySelector("#fgBg") as HTMLSelectElement).value);
      const taken = new Set(bg?.skills ?? []);
      const skills = cls.skillList.filter((id) => !taken.has(id));
      extra.innerHTML = `
        <p class="meta">Pick ${cls.skillChoices} class skills.</p>
        <div class="skill-picks">${skills.map((id) => `<label><input type="checkbox" value="${esc(id)}" /> ${esc(cat.skills[id]?.label ?? id)}</label>`).join("")}</div>
        ${
          cls.fightingStyleRequired
            ? `<label>Fighting style <select id="fgStyle">${(cls.fightingStyleOptions ?? cat.fightingStyles.map((f) => f.id)).map((id) => `<option value="${esc(id)}">${esc(cat.fightingStyles.find((f) => f.id === id)?.label ?? id)}</option>`).join("")}</select></label>`
            : ""
        }`;
    };
    paintScores();
    paintExtra();
    card().querySelector("#fgClass")!.addEventListener("change", paintExtra);
    card().querySelector("#fgBg")!.addEventListener("change", paintExtra);
    card().querySelector("#pocketBack")!.addEventListener("click", paintHome);
    card().querySelector("#forgeForm")!.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const cls = cat.classes.find((c) => c.id === (card().querySelector("#fgClass") as HTMLSelectElement).value)!;
      const classSkills = [...extra.querySelectorAll<HTMLInputElement>("input:checked")].map((i) => i.value).slice(0, cls.skillChoices);
      const draft = {
        name: (card().querySelector("#fgName") as HTMLInputElement).value,
        level: Number((card().querySelector("#fgLevel") as HTMLSelectElement).value),
        raceId: (card().querySelector("#fgRace") as HTMLSelectElement).value,
        classId: cls.id,
        backgroundId: (card().querySelector("#fgBg") as HTMLSelectElement).value,
        method: "standard_array",
        baseAbilities: assigned,
        classSkills,
        fightingStyle: (card().querySelector("#fgStyle") as HTMLSelectElement | null)?.value,
      };
      try {
        if (reforgeId) await api(`/api/characters/${reforgeId}/reforge`, { method: "POST", body: JSON.stringify(draft) });
        else await api("/api/chargen", { method: "POST", body: JSON.stringify(draft) });
        await refresh();
      } catch (err) {
        const note = card().querySelector("#fgError");
        if (note) note.textContent = err instanceof Error ? err.message : "Could not save.";
      }
    });
  };

  const refresh = async () => {
    try {
      const me = await api<{ user: { username: string } }>("/api/me");
      user = me.user.username;
      heroes = (await api<Pregen[]>("/api/pregens")).filter((p) => p.custom || String(p.id).startsWith("custom_"));
      paintHome();
    } catch {
      user = null;
      paintLogin();
    }
  };

  const align = async () => {
    if (!scanning() || !user) return;
    try {
      const data = await api<{ key: string | null }>("/api/me/align", { method: "POST", body: "{}" });
      if (data.key) adopt(data.key);
    } catch {
      /* still just the library */
    }
  };

  void refresh();
  window.setInterval(() => void align(), 4000);
}
