/**
 * The phone when it is not at a table: Amazon sign-in, forged heroes, and a quiet watch
 * for the same account signing in on a TV.
 */

import { mountForgeWizard } from "@d20-fireverse/protocol/forge-wizard";
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
        <button type="button" class="ghost" id="pocketForgeWeb">Hero builder (browser)</button>
        <button type="button" id="pocketArmory">Armory</button>
        <button type="button" id="pocketSocial">Friends & board</button>
      </div>`;
    card().querySelector("#pocketOut")!.addEventListener("click", () => {
      void fetch("/api/logout", { method: "POST", credentials: "same-origin" }).then(() => {
        user = null;
        paintLogin();
      });
    });
    card().querySelector("#pocketForge")!.addEventListener("click", () => void openForge());
    card().querySelector("#pocketForgeWeb")!.addEventListener("click", () => {
      window.location.href = "/forge";
    });
    card().querySelector("#pocketArmory")!.addEventListener("click", () => void openArmory());
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
          <button type="button" id="pocketForgeNew">Forge another</button>
          <button type="button" id="pocketDelete" ${data.seated ? "disabled" : ""}>Delete</button>
        </div>
        ${data.seated ? `<p class="meta">This hero is seated. Delete waits until that table closes.</p>` : ""}`;
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
      card().querySelector("#pocketForgeNew")!.addEventListener("click", () => void openForgeV2());
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

  const openForgeV2 = async () => {
    card().innerHTML = `<div id="pocketForgeHost" class="pocket-forge"></div>`;
    const hostEl = card().querySelector<HTMLElement>("#pocketForgeHost")!;
    await mountForgeWizard(hostEl, {
      api,
      layout: "phone",
      onClose: () => void refresh().then(paintHome),
      onDone: () => {
        void refresh().then(paintHome);
      },
    });
  };

  const openForge = async (reforgeId?: string) => {
    if (reforgeId?.startsWith("custom_")) {
      card().innerHTML = `<button type="button" class="ghost" id="pocketBack">← Heroes</button><h2>Legacy hero</h2><p class="meta">This portrait was forged on the old bench. Forge a new level-1 hero with the guided steps. A keeper can run the one-shot custom migration on the server.</p><button type="button" class="primary" id="pocketForgeNew">Forge a new hero</button>`;
      card().querySelector("#pocketBack")!.addEventListener("click", paintHome);
      card().querySelector("#pocketForgeNew")!.addEventListener("click", () => void openForgeV2());
      return;
    }
    await openForgeV2();
  };

  let armoryHeroId = "";

  const openArmory = async () => {
    const [heroesBody, stashBody, shop] = await Promise.all([
      api<{ heroes: Array<{ id: string; name: string; level: number; xp: number; classes: Array<{ id: string; level: number }> }> }>("/api/heroes"),
      api<{
        stash: Array<{
          id: string;
          name: string;
          inUseBy?: string;
          itemDefId: string;
          equippedBy?: string | null;
          boundToHeroId?: string | null;
          description?: string;
          equippedBonus?: string;
        }>;
      }>("/api/stash"),
      api<{ payToWin: string; slots: Array<{ itemId: string; name: string; priceGold: number }> }>("/api/vendor"),
    ]);
    if (!armoryHeroId || !heroesBody.heroes.some((h) => h.id === armoryHeroId)) armoryHeroId = heroesBody.heroes[0]?.id ?? "";
    const hero = heroesBody.heroes.find((h) => h.id === armoryHeroId);
    const heroPick =
      heroesBody.heroes.length > 1
        ? `<label class="meta">Equip for <select id="armHero">${heroesBody.heroes.map((h) => `<option value="${esc(h.id)}" ${h.id === armoryHeroId ? "selected" : ""}>${esc(h.name)}</option>`).join("")}</select></label>`
        : "";
    const visible = hero
      ? stashBody.stash.filter((item) => !item.boundToHeroId || item.boundToHeroId === hero.id)
      : [];
    const renderRow = (item: (typeof stashBody.stash)[0]) => {
      const onHero = hero && item.equippedBy === hero.id;
      const busy = item.inUseBy && !onHero;
      const tag = item.boundToHeroId ? " · personal" : item.inUseBy ? (onHero ? " · equipped" : ` · on ${item.inUseBy}`) : " · shared";
      const blurb =
        item.description || item.equippedBonus
          ? `<span class="armory-blurb">${item.description ? `<span>${esc(item.description)}</span>` : ""}${
              item.equippedBonus ? `<span><strong>If equipped:</strong> ${esc(item.equippedBonus)}</span>` : ""
            }</span>`
          : "";
      return `<li class="armory-row">${esc(item.name)}${tag}${blurb}
          ${hero && !busy && !onHero ? `<button type="button" data-equip="${esc(item.id)}">Equip</button>` : ""}
          ${onHero ? `<button type="button" data-unequip="${esc(item.id)}">Unequip</button>` : ""}</li>`;
    };
    const personal = visible.filter((i) => i.boundToHeroId === hero?.id);
    const shared = visible.filter((i) => !i.boundToHeroId);
    const list =
      visible.length === 0
        ? "<li class='meta'>No gear for this hero.</li>"
        : `${personal.length ? `<h3>Starting kit</h3><ul class="sheet-list">${personal.map(renderRow).join("")}</ul>` : ""}
           ${shared.length ? `<h3>Shared stash</h3><ul class="sheet-list">${shared.map(renderRow).join("")}</ul>` : ""}`;
    card().innerHTML = `
      <h2>Armory</h2>
      <p class="meta">${esc(shop.payToWin)}</p>
      ${heroPick}
      ${hero ? `<p><strong>${esc(hero.name)}</strong> level ${hero.level} · XP ${hero.xp}</p>
        <button type="button" class="primary" id="armLevel">Level up</button>` : `<p class="meta">Forge a V2 hero from the web content list once a class is enabled.</p>`}
      ${list}
      <h3>Today's shop</h3>
      <ul class="sheet-list">${shop.slots.map((slot) => `<li>${esc(slot.name)} · ${slot.priceGold} gold <button type="button" data-buy="${esc(slot.itemId)}">Buy</button></li>`).join("") || "<li class='meta'>Nothing enabled for sale</li>"}</ul>
      <button type="button" class="ghost" id="armBack">Back</button>`;
    card().querySelector("#armBack")!.addEventListener("click", () => paintHome());
    card().querySelector<HTMLSelectElement>("#armHero")?.addEventListener("change", (ev) => {
      armoryHeroId = (ev.target as HTMLSelectElement).value;
      void openArmory();
    });
    card().querySelector("#armLevel")?.addEventListener("click", () => {
      if (!hero) return;
      void api(`/api/heroes/${hero.id}/level-up`, { method: "POST", body: "{}" }).then(() => openArmory());
    });
    card().querySelectorAll<HTMLButtonElement>("[data-equip]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!hero) return;
        void api("/api/stash/equip", { method: "POST", body: JSON.stringify({ heroId: hero.id, itemInstanceId: button.dataset.equip }) }).then(() => openArmory());
      });
    });
    card().querySelectorAll<HTMLButtonElement>("[data-unequip]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!hero) return;
        void api("/api/stash/unequip", { method: "POST", body: JSON.stringify({ heroId: hero.id, itemInstanceId: button.dataset.unequip }) }).then(() => openArmory());
      });
    });
    card().querySelectorAll<HTMLButtonElement>("[data-buy]").forEach((button) => {
      button.addEventListener("click", () => {
        void api("/api/vendor/buy", { method: "POST", body: JSON.stringify({ itemId: button.dataset.buy }) }).then(() => openArmory());
      });
    });
  };

  const refresh = async () => {
    try {
      const me = await api<{ user: { username: string } }>("/api/me");
      user = me.user.username;
      void api("/api/session/surface", { method: "POST", body: JSON.stringify({ surface: "companion" }) });
      const legacy = (await api<Pregen[]>("/api/pregens")).filter((p) => p.custom || String(p.id).startsWith("custom_"));
      const v2 = await api<{ heroes: Array<{ id: string; name: string; level: number; classes: Array<{ id: string }> }> }>("/api/heroes");
      heroes = [
        ...v2.heroes.map((h) => ({
          id: h.id,
          name: h.name,
          summary: `Level ${h.level} ${h.classes[0]?.id ?? "hero"}`,
          portrait: "/art/portraits/human_fighter.png",
          level: h.level,
        })),
        ...legacy,
      ];
      const scanFrame = document.getElementById("scanFrame");
      const scanHint = document.getElementById("scanHint");
      if (scanFrame) scanFrame.hidden = true;
      if (scanHint) scanHint.textContent = "Signed in — forge heroes below. Scan a TV code from Home when you sit at a table.";
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
