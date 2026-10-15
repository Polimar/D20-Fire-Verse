/** Account profile on the TV / browser: stats, heroes, and today's shop. */

import { describeError } from "@d20-fireverse/protocol";
import { sfx } from "./sfx";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

type Profile = {
  user: { username: string; friendTag?: string };
  friends?: { pendingIn: number };
  wallet: { gold: number; hard: number };
  season: { id: string; endsAt: string };
  ranked: { elo: number; rank: number | null; wins: number; losses: number };
  arena: { wins: number; losses: number };
  heroes: Array<{
    id: string;
    name: string;
    classes: Array<{ id: string; level: number }>;
    level: number;
    xp: number;
    pendingLevelUp: boolean;
    equipped: number;
  }>;
  economy: { goldEarned: number; goldSpent: number; itemsBought: number };
  milestones: Array<{ kind: string; count: number }>;
};

type FriendRow = { id: string; username: string; friendTag: string; status: string; incoming: boolean };

type Shop = { payToWin: string; slots: Array<{ itemId: string; name: string; priceGold: number }> };
type BoardRow = { userId?: string; username?: string; wins: number; elo?: number };

export type ProfileOptions = {
  onMessage?: (text: string, kind?: "bad" | "ok" | "info") => void;
  onForge?: () => void;
  onCustomize?: (heroId: string) => void;
};

let overlay: HTMLElement | null = null;
let opener: HTMLElement | null = null;
let tab: "overview" | "heroes" | "shop" | "friends" = "overview";
let profile: Profile | null = null;
let shop: Shop | null = null;
let board: BoardRow[] = [];
let friends: FriendRow[] = [];
let opts: ProfileOptions = {};
let busy = false;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}

function msg(text: string, kind: "bad" | "ok" | "info" = "info"): void {
  opts.onMessage?.(text, kind);
}

async function reload(): Promise<void> {
  const [p, s, b, f] = await Promise.all([
    api<Profile>("/api/me/profile"),
    api<Shop>("/api/vendor"),
    api<{ rows: BoardRow[] }>("/api/arena/board?mode=ranked").catch(() => ({ rows: [] })),
    api<{ friends: FriendRow[] }>("/api/friends").catch(() => ({ friends: [] })),
  ]);
  profile = p;
  shop = s;
  board = b.rows ?? [];
  friends = f.friends ?? [];
}

function paint(): void {
  if (!overlay || !profile) return;
  const p = profile;
  const tabs = (["overview", "heroes", "shop", "friends"] as const)
    .map((id) => `<button type="button" class="ghost sm ${tab === id ? "picked" : ""}" data-tab="${id}">${id[0]!.toUpperCase()}${id.slice(1)}</button>`)
    .join("");
  let body = "";
  if (tab === "overview") {
    body = `<div class="profile-cards">
        <p class="meta">Friend ID <strong>${esc(p.user.friendTag ?? "------")}</strong>${p.friends?.pendingIn ? ` · ${p.friends.pendingIn} request${p.friends.pendingIn === 1 ? "" : "s"} waiting` : ""}</p>
        <p class="meta">${p.wallet.gold} gold · ${p.wallet.hard} gems</p>
        <p class="meta">Ranked Elo ${p.ranked.elo}${p.ranked.rank ? ` · #${p.ranked.rank}` : ""} · ${p.ranked.wins}–${p.ranked.losses}</p>
        <p class="meta">Arena ${p.arena.wins}–${p.arena.losses} · earned ${p.economy.goldEarned} · spent ${p.economy.goldSpent}</p>
        <p class="meta">Season ends ${esc(new Date(p.season.endsAt).toLocaleDateString())}</p>
        <h3>Top ranked</h3>
        <ol class="profile-list">${board.slice(0, 20).map((r, i) => `<li>#${i + 1} ${esc(r.username ?? r.userId ?? "player")} · ${r.wins} wins${r.elo != null ? ` · ${r.elo}` : ""}</li>`).join("") || "<li class='meta'>No ranked games yet.</li>"}</ol>
      </div>`;
  } else if (tab === "heroes") {
    body = `<ul class="profile-list">${p.heroes
      .map(
        (h) => `<li class="profile-hero">
          <strong>${esc(h.name)}</strong> · L${h.level} ${esc(h.classes.map((c) => c.id).join("/"))} · ${h.xp} XP · ${h.equipped} equipped
          ${h.pendingLevelUp ? "<em>level-up waiting</em>" : ""}
          <span class="row">
            <button type="button" class="ghost sm" data-custom="${esc(h.id)}">Customize</button>
            ${h.pendingLevelUp ? `<button type="button" class="ghost sm" data-level="${esc(h.id)}">Level up</button>` : ""}
          </span>
        </li>`,
      )
      .join("") || "<li class='meta'>Forge a hero to start.</li>"}</ul>
      <button type="button" class="primary" id="profForge">New hero</button>`;
  } else if (tab === "friends") {
    const incoming = friends.filter((f) => f.status === "pending" && f.incoming);
    const outgoing = friends.filter((f) => f.status === "pending" && !f.incoming);
    const accepted = friends.filter((f) => f.status === "accepted");
    const row = (f: FriendRow, actions: string) =>
      `<li><strong>${esc(f.username)}</strong> · ${esc(f.friendTag)} ${actions}</li>`;
    body = `<p class="meta">Your Friend ID <strong>${esc(p.user.friendTag ?? "------")}</strong> <button type="button" class="ghost sm" id="profRerollTag">New ID</button></p>
      <form id="friendForm" class="row"><input id="friendIdent" placeholder="Friend ID or username" maxlength="32" /><button type="submit" class="primary">Ask</button></form>
      <h3>Incoming</h3>
      <ul class="profile-list">${incoming.map((f) => row(f, `<button type="button" class="ghost sm" data-accept="${esc(f.id)}">Accept</button> <button type="button" class="ghost sm" data-reject="${esc(f.id)}">Decline</button>`)).join("") || "<li class='meta'>No requests.</li>"}</ul>
      <h3>Outgoing</h3>
      <ul class="profile-list">${outgoing.map((f) => row(f, `<button type="button" class="ghost sm" data-reject="${esc(f.id)}">Cancel</button>`)).join("") || "<li class='meta'>None waiting.</li>"}</ul>
      <h3>Friends</h3>
      <ul class="profile-list">${accepted.map((f) => row(f, `<button type="button" class="ghost sm" data-remove="${esc(f.id)}">Remove</button>`)).join("") || "<li class='meta'>Add a friend with their Friend ID.</li>"}</ul>`;
  } else {
    body = `<p class="meta">${esc(shop?.payToWin ?? "")}</p>
      <p class="meta">${p.wallet.gold} gold</p>
      <ul class="profile-list">${(shop?.slots ?? [])
        .map((slot) => `<li>${esc(slot.name)} · ${slot.priceGold} gold <button type="button" class="ghost sm" data-buy="${esc(slot.itemId)}">Buy</button></li>`)
        .join("") || "<li class='meta'>Nothing enabled for sale.</li>"}</ul>`;
  }
  overlay.querySelector("#profileBody")!.innerHTML = `
    <div class="row">${tabs}</div>
    ${body}`;
  overlay.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      tab = b.dataset.tab as typeof tab;
      paint();
    }),
  );
  overlay.querySelector("#profForge")?.addEventListener("click", () => {
    closeProfile();
    opts.onForge?.();
  });
  overlay.querySelectorAll<HTMLButtonElement>("[data-custom]").forEach((b) =>
    b.addEventListener("click", () => {
      closeProfile();
      opts.onCustomize?.(b.dataset.custom!);
    }),
  );
  overlay.querySelectorAll<HTMLButtonElement>("[data-level]").forEach((b) =>
    b.addEventListener("click", () => {
      if (busy) return;
      busy = true;
      void api(`/api/heroes/${b.dataset.level}/level-up`, { method: "POST", body: "{}" })
        .then(() => reload())
        .then(() => {
          msg("Level applied.", "ok");
          paint();
        })
        .catch((err) => msg(describeError(err instanceof Error ? err.message : "ERROR"), "bad"))
        .finally(() => {
          busy = false;
        });
    }),
  );
  overlay.querySelectorAll<HTMLButtonElement>("[data-buy]").forEach((b) =>
    b.addEventListener("click", () => {
      if (busy) return;
      busy = true;
      void api("/api/vendor/buy", { method: "POST", body: JSON.stringify({ itemId: b.dataset.buy }) })
        .then(() => reload())
        .then(() => {
          msg("Purchased.", "ok");
          paint();
        })
        .catch((err) => msg(describeError(err instanceof Error ? err.message : "ERROR"), "bad"))
        .finally(() => {
          busy = false;
        });
    }),
  );
  const friendAct = (url: string, body: unknown, ok: string) => {
    if (busy) return;
    busy = true;
    void api(url, { method: "POST", body: JSON.stringify(body) })
      .then(() => reload())
      .then(() => {
        msg(ok, "ok");
        paint();
      })
      .catch((err) => msg(describeError(err instanceof Error ? err.message : "ERROR"), "bad"))
      .finally(() => {
        busy = false;
      });
  };
  overlay.querySelector("#friendForm")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const ident = (overlay!.querySelector("#friendIdent") as HTMLInputElement | null)?.value.trim() ?? "";
    if (!ident) return;
    friendAct("/api/friends", { username: ident, tag: ident }, "Request sent.");
  });
  overlay.querySelectorAll<HTMLButtonElement>("[data-accept]").forEach((b) =>
    b.addEventListener("click", () => friendAct("/api/friends/accept", { userId: b.dataset.accept }, "Friend added.")),
  );
  overlay.querySelectorAll<HTMLButtonElement>("[data-reject]").forEach((b) =>
    b.addEventListener("click", () => friendAct("/api/friends/reject", { userId: b.dataset.reject }, "Request closed.")),
  );
  overlay.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((b) =>
    b.addEventListener("click", () => friendAct("/api/friends/remove", { userId: b.dataset.remove }, "Friend removed.")),
  );
  overlay.querySelector("#profRerollTag")?.addEventListener("click", () =>
    friendAct("/api/friends/tag", {}, "Friend ID updated."),
  );
}

export function profileOpen(): boolean {
  return Boolean(overlay && !overlay.hidden);
}

export async function openProfile(options: ProfileOptions = {}): Promise<void> {
  opts = options;
  const active = document.activeElement;
  opener = active instanceof HTMLElement && active !== document.body && !overlay?.contains(active) ? active : null;
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "modal settings-modal profile-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Profile");
    overlay.innerHTML = `
      <div class="modal-card">
        <p class="modal-kicker">Your account</p>
        <h2>Profile</h2>
        <div id="profileBody"></div>
        <div class="row modal-actions">
          <button type="button" class="primary" id="profileClose" data-autofocus>Back</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#profileClose")!.addEventListener("click", closeProfile);
  }
  overlay.hidden = false;
  tab = "overview";
  try {
    await reload();
    paint();
    requestAnimationFrame(() => overlay?.querySelector<HTMLElement>("#profileClose")?.focus());
    sfx("uiConfirm");
  } catch (err) {
    msg(describeError(err instanceof Error ? err.message : "AUTH_REQUIRED"), "bad");
    closeProfile();
  }
}

export function closeProfile(): void {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  sfx("uiBack");
  if (opener?.isConnected && opener.offsetParent) opener.focus({ preventScroll: true });
  opener = null;
}
