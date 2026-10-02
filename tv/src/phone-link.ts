/**
 * This TV's phone. Once signed in, the TV asks the table for a one-time pair code and shows it as a
 * QR. The first phone to scan it becomes this player's personal controller; the QR then gives way
 * to a "phone linked" card until the link ends (log out, back to the title, app closed).
 */

import { companionUrl, paintCompanionQr } from "./onboarding";

const CONSOLE_KEY = "fireverse.console.v1";
/** Ask for a fresh code this long before the current one expires. */
const REFRESH_EARLY_MS = 15_000;

type Offer = { token: string; expiresAt: number; now: number };
type Host = { qr: HTMLElement; hint: HTMLElement | null; idleHint: string; linkedHint: string };

let linked = false;
let online = false;
let offer: { token: string; url: string | null } | null = null;
let refreshTimer = 0;
let deliver: (msg: Record<string, unknown>) => boolean = () => false;
let onChange: () => void = () => undefined;
const hosts = new Map<string, Host>();

/**
 * The id the server knows this TV by, for as long as the app stays open. sessionStorage dies with
 * the Fire TV app, so closing the app ends the phone link as promised.
 */
export function consoleId(): string {
  try {
    const known = sessionStorage.getItem(CONSOLE_KEY);
    if (known && /^[A-Za-z0-9_-]{16,64}$/.test(known)) return known;
    const fresh = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, "0")).join("");
    sessionStorage.setItem(CONSOLE_KEY, fresh);
    return fresh;
  } catch {
    return `tv${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function mountPhoneLink(opts: { deliver: (msg: Record<string, unknown>) => boolean; onChange: () => void }): void {
  deliver = opts.deliver;
  onChange = opts.onChange;
}

/** Register a QR spot (home, lobby). It is repainted whenever the link changes. */
export function phoneLinkHost(
  id: string,
  qr: HTMLElement,
  hint: HTMLElement | null,
  copy: { idle: string; linked: string },
): void {
  hosts.set(id, { qr, hint, idleHint: copy.idle, linkedHint: copy.linked });
  paintHost(hosts.get(id)!);
}

export function phoneLinked(): boolean {
  return linked;
}

function request(): void {
  window.clearTimeout(refreshTimer);
  if (!linked) deliver({ action: "PAIR_REQUEST" });
}

export function phoneLinkOffer(next: Offer): void {
  if (linked) return;
  const token = next.token;
  offer = { token, url: null };
  window.clearTimeout(refreshTimer);
  const ttl = Math.max(30_000, next.expiresAt - next.now);
  refreshTimer = window.setTimeout(request, ttl - REFRESH_EARLY_MS);
  void companionUrl(token).then((url) => {
    if (offer?.token !== token) return;
    offer.url = url;
    paintAll();
  });
}

export function phoneLinkStatus(next: { linked: boolean; online: boolean }): void {
  const was = linked;
  linked = next.linked;
  online = next.online;
  if (linked) {
    window.clearTimeout(refreshTimer);
    offer = null;
  } else if (was || !offer) {
    offer = null;
    request();
  }
  paintAll();
  if (was !== linked) onChange();
}

/** End the link on purpose: log out, or back to the title from a table. */
export function unlinkPhone(reason: "logout" | "title"): void {
  if (!linked) return;
  deliver({ action: "UNPAIR", reason });
}

/** Signed out or socket gone for good: forget everything until the next sign-in. */
export function resetPhoneLink(): void {
  window.clearTimeout(refreshTimer);
  linked = false;
  online = false;
  offer = null;
  paintAll();
}

function paintAll(): void {
  for (const host of hosts.values()) paintHost(host);
}

function paintHost(host: Host): void {
  const card = host.qr.closest<HTMLElement>(".qr-card, .room-card");
  card?.classList.toggle("phone-on", linked);
  if (linked) {
    host.qr.innerHTML = `<div class="phone-linked ${online ? "awake" : ""}" role="status">
      <span class="phone-glyph" aria-hidden="true"></span>
      <strong>Phone linked</strong>
      <em>${online ? "Your sheet, your dice and a trackpad are on it." : "The phone is asleep. Wake it to play from it."}</em>
    </div>`;
    if (host.hint) host.hint.textContent = host.linkedHint;
    return;
  }
  if (offer?.url) {
    paintCompanionQr(host.qr, offer.url);
    if (host.hint) host.hint.textContent = host.idleHint;
    return;
  }
  host.qr.innerHTML = `<div class="phone-linked waiting" role="status"><em>Preparing your phone code…</em></div>`;
  if (host.hint) host.hint.textContent = host.idleHint;
}
