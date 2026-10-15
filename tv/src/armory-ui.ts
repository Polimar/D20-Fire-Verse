/** Stash & equip on TV / browser — same APIs as the companion armory. */

import { describeError } from "@d20-fireverse/protocol";
import { sfx } from "./sfx";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

type StashRow = {
  id: string;
  name: string;
  itemDefId: string;
  equippedBy: string | null;
  attunedBy: string | null;
  inUseBy?: string;
};

type HeroSummary = { id: string; name: string; level: number; classes: Array<{ id: string; level: number }> };

export type ArmoryOptions = {
  inCombat?: boolean;
  onMessage?: (text: string, kind?: "bad" | "ok" | "info") => void;
};

let overlay: HTMLElement | null = null;
let opener: HTMLElement | null = null;
let onCloseCb: (() => void) | null = null;
let opts: ArmoryOptions = {};
let heroes: HeroSummary[] = [];
let stash: StashRow[] = [];
let gold = 0;
let heroId = "";
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
  const data = await api<{ heroes: HeroSummary[]; wallet: { gold: number } }>("/api/heroes");
  const bag = await api<{ stash: StashRow[] }>("/api/stash");
  heroes = data.heroes;
  gold = data.wallet.gold;
  stash = bag.stash;
  if (!heroId || !heroes.some((h) => h.id === heroId)) heroId = heroes[0]?.id ?? "";
}

function itemActions(item: StashRow): string {
  if (!heroId) return "";
  const onHero = item.equippedBy === heroId;
  const elsewhere = item.equippedBy && item.equippedBy !== heroId;
  const attuned = item.attunedBy === heroId;
  const parts: string[] = [];
  if (!elsewhere && !onHero) parts.push(`<button type="button" class="ghost sm" data-equip="${esc(item.id)}">Equip</button>`);
  if (onHero) {
    parts.push(`<button type="button" class="ghost sm" data-unequip="${esc(item.id)}">Unequip</button>`);
    parts.push(
      `<button type="button" class="ghost sm" data-attune="${esc(item.id)}">${attuned ? "Unattune" : "Attune"}</button>`,
    );
  }
  return parts.join("");
}

function paint(): void {
  if (!overlay) return;
  const hero = heroes.find((h) => h.id === heroId);
  const heroPick =
    heroes.length > 1
      ? `<div class="armory-heroes" role="tablist">${heroes
          .map(
            (h) =>
              `<button type="button" class="ghost sm ${h.id === heroId ? "picked" : ""}" data-hero-pick="${esc(h.id)}" role="tab">${esc(h.name)} · L${h.level}</button>`,
          )
          .join("")}</div>`
      : hero
        ? `<p class="meta"><strong>${esc(hero.name)}</strong> · level ${hero.level}</p>`
        : `<p class="meta">Forge a hero to equip gear.</p>`;
  const rows =
    stash.length && heroId
      ? stash
          .map((item) => {
            const status = item.equippedBy === heroId
              ? "Equipped"
              : item.inUseBy
                ? `On ${item.inUseBy}`
                : item.attunedBy === heroId
                  ? "Attuned"
                  : "In stash";
            return `<li class="armory-item">
              <span class="armory-item-name"><strong>${esc(item.name)}</strong><em>${esc(status)}</em></span>
              <span class="armory-item-actions">${itemActions(item)}</span>
            </li>`;
          })
          .join("")
      : `<li class="meta">${heroId ? "Stash is empty." : "No hero selected."}</li>`;
  overlay.querySelector("#armoryBody")!.innerHTML = `
    <p class="meta">${gold} gold · ${stash.length} item${stash.length === 1 ? "" : "s"}</p>
    ${heroPick}
    <ul class="armory-list">${rows}</ul>
    ${opts.inCombat ? `<p class="meta">Some changes are blocked during combat.</p>` : ""}`;
  wireBody();
}

function wireBody(): void {
  if (!overlay) return;
  overlay.querySelectorAll<HTMLButtonElement>("[data-hero-pick]").forEach((b) =>
    b.addEventListener("click", () => {
      heroId = b.dataset.heroPick!;
      paint();
    }),
  );
  overlay.querySelectorAll<HTMLButtonElement>("[data-equip]").forEach((b) =>
    b.addEventListener("click", () => void act("equip", b.dataset.equip!)),
  );
  overlay.querySelectorAll<HTMLButtonElement>("[data-unequip]").forEach((b) =>
    b.addEventListener("click", () => void act("unequip", b.dataset.unequip!)),
  );
  overlay.querySelectorAll<HTMLButtonElement>("[data-attune]").forEach((b) =>
    b.addEventListener("click", () => void act("attune", b.dataset.attune!)),
  );
}

async function act(kind: "equip" | "unequip" | "attune", instanceId: string): Promise<void> {
  if (!heroId || busy) return;
  busy = true;
  try {
    if (kind === "equip") {
      await api("/api/stash/equip", {
        method: "POST",
        body: JSON.stringify({ heroId, itemInstanceId: instanceId, inCombat: Boolean(opts.inCombat) }),
      });
      msg("Equipped.", "ok");
    } else if (kind === "unequip") {
      await api("/api/stash/unequip", { method: "POST", body: JSON.stringify({ heroId, itemInstanceId: instanceId }) });
      msg("Returned to stash.", "ok");
    } else {
      await api("/api/stash/attune", {
        method: "POST",
        body: JSON.stringify({ heroId, itemInstanceId: instanceId, inCombat: Boolean(opts.inCombat) }),
      });
      msg("Attunement updated.", "ok");
    }
    await reload();
    paint();
    sfx("uiConfirm");
  } catch (err) {
    msg(describeError(err instanceof Error ? err.message : "ERROR"), "bad");
    sfx("uiError");
  } finally {
    busy = false;
  }
}

export function armoryOpen(): boolean {
  return Boolean(overlay && !overlay.hidden);
}

export async function openArmory(options: ArmoryOptions = {}): Promise<void> {
  opts = options;
  const active = document.activeElement;
  opener = active instanceof HTMLElement && active !== document.body && !overlay?.contains(active) ? active : null;
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "modal settings-modal armory-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Armory and stash");
    overlay.innerHTML = `
      <div class="modal-card">
        <p class="modal-kicker">Your account</p>
        <h2>Armory &amp; stash</h2>
        <p class="meta">Equip starting gear and loot. Changes apply to the hero you pick below.</p>
        <div id="armoryBody"></div>
        <div class="row modal-actions">
          <button type="button" class="primary" id="armoryClose" data-autofocus>Back</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#armoryClose")!.addEventListener("click", closeArmory);
  }
  overlay.hidden = false;
  try {
    await reload();
    paint();
    requestAnimationFrame(() => overlay?.querySelector<HTMLElement>("#armoryClose")?.focus());
    sfx("uiConfirm");
  } catch (err) {
    msg(describeError(err instanceof Error ? err.message : "AUTH_REQUIRED"), "bad");
    closeArmory();
  }
}

export function closeArmory(): void {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  sfx("uiBack");
  if (opener?.isConnected && opener.offsetParent) opener.focus({ preventScroll: true });
  opener = null;
  onCloseCb?.();
  onCloseCb = null;
}

export function setArmoryOnClose(fn: (() => void) | null): void {
  onCloseCb = fn;
}
