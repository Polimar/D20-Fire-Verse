/**
 * One phone per television. A signed-in TV (a "console") asks for a short-lived pair token and shows
 * it in a QR. The first phone that presents it becomes that console's companion and gets a private
 * key to come back with. The link ends when the TV logs out, returns to the title, signs in as
 * someone else, or stays away longer than the grace period.
 */

import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./paths.js";

export const PAIR_TTL_MS = Number(process.env.PAIR_TTL_MS || 5 * 60_000);
export const CONSOLE_GRACE_MS = Number(process.env.CONSOLE_GRACE_MS || 45_000);

export const CONSOLE_VIEWS = ["title", "campaign", "arena", "lobby", "story", "combat"] as const;
export type ConsoleView = (typeof CONSOLE_VIEWS)[number];

type Console = {
  id: string;
  userId: string;
  view: ConsoleView;
  /** sha256 of the phone's key; null while no phone is linked. */
  phoneKeyHash: string | null;
};

type PairOffer = { consoleId: string; expiresAt: number };

const consoles = new Map<string, Console>();
/** Pair tokens live only in memory: a restart simply asks the TV for a fresh QR. */
const offers = new Map<string, PairOffer>();
const graceTimers = new Map<string, NodeJS.Timeout>();
let loaded = false;

const file = () => path.join(DATA_DIR, "consoles.json");
const digest = (secret: string) => createHash("sha256").update(secret).digest("hex");

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const rows = JSON.parse(fs.readFileSync(file(), "utf8")) as Console[];
    for (const row of rows) {
      if (row?.id && row.userId) {
        consoles.set(row.id, {
          id: row.id,
          userId: row.userId,
          view: isConsoleView(row.view) ? row.view : "title",
          phoneKeyHash: row.phoneKeyHash ?? null,
        });
      }
    }
  } catch {
    /* first boot, or a damaged file: every TV pairs again */
  }
}

function persist(): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file(), JSON.stringify([...consoles.values()]));
  } catch (err) {
    console.error("consoles.json not written:", err);
  }
}

export function isConsoleView(v: unknown): v is ConsoleView {
  return typeof v === "string" && (CONSOLE_VIEWS as readonly string[]).includes(v);
}

export function isConsoleId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(id);
}

export function getConsole(consoleId: string): Console | null {
  load();
  return consoles.get(consoleId) ?? null;
}

/** Consoles left over from before a restart. The server arms their grace timers at boot. */
export function knownConsoles(): string[] {
  load();
  return [...consoles.keys()];
}

/**
 * A signed-in TV shows up. A console that was signed in as someone else loses its phone.
 * Returns true when an existing phone link was dropped.
 */
export function claimConsole(consoleId: string, userId: string): boolean {
  load();
  cancelGrace(consoleId);
  const known = consoles.get(consoleId);
  if (known && known.userId === userId) return false;
  const dropped = Boolean(known?.phoneKeyHash);
  forgetOffers(consoleId);
  consoles.set(consoleId, { id: consoleId, userId, view: known?.view ?? "title", phoneKeyHash: null });
  persist();
  return dropped;
}

export function setConsoleView(consoleId: string, view: ConsoleView): void {
  const c = getConsole(consoleId);
  if (!c || c.view === view) return;
  c.view = view;
  persist();
}

export function phoneLinked(consoleId: string): boolean {
  return Boolean(getConsole(consoleId)?.phoneKeyHash);
}

function forgetOffers(consoleId: string): void {
  for (const [hash, offer] of offers) {
    if (offer.consoleId === consoleId) offers.delete(hash);
  }
}

/** A fresh one-time token for the console's QR. Earlier tokens of that console stop working. */
export function issuePairToken(consoleId: string, now = Date.now()): { token: string; expiresAt: number } {
  const c = getConsole(consoleId);
  if (!c) throw new Error("BAD_CONSOLE");
  if (c.phoneKeyHash) throw new Error("PHONE_LINKED");
  forgetOffers(consoleId);
  for (const [hash, offer] of offers) {
    if (offer.expiresAt <= now) offers.delete(hash);
  }
  const token = randomBytes(16).toString("base64url");
  const expiresAt = now + PAIR_TTL_MS;
  offers.set(digest(token), { consoleId, expiresAt });
  return { token, expiresAt };
}

/** The first phone to present a live token becomes the companion. The token is spent either way. */
export function redeemPairToken(token: unknown, now = Date.now()): { consoleId: string; key: string } {
  if (typeof token !== "string" || token.length < 16 || token.length > 64) throw new Error("PAIR_EXPIRED");
  const hash = digest(token);
  const offer = offers.get(hash);
  offers.delete(hash);
  if (!offer || offer.expiresAt <= now) throw new Error("PAIR_EXPIRED");
  const c = consoles.get(offer.consoleId);
  if (!c || c.phoneKeyHash) throw new Error("PAIR_EXPIRED");
  const key = randomBytes(32).toString("base64url");
  c.phoneKeyHash = digest(key);
  forgetOffers(c.id);
  persist();
  return { consoleId: c.id, key };
}

export function consoleForKey(key: unknown): Console | null {
  if (typeof key !== "string" || key.length < 32 || key.length > 64) return null;
  load();
  const hash = digest(key);
  for (const c of consoles.values()) {
    if (c.phoneKeyHash === hash) return c;
  }
  return null;
}

/** End the phone link but keep the console, so the TV can show a new QR right away. */
export function unlinkPhone(consoleId: string): boolean {
  const c = getConsole(consoleId);
  if (!c?.phoneKeyHash) return false;
  c.phoneKeyHash = null;
  persist();
  return true;
}

export function forgetConsole(consoleId: string): void {
  load();
  cancelGrace(consoleId);
  forgetOffers(consoleId);
  if (consoles.delete(consoleId)) persist();
}

/** The TV went quiet. If it is not back in time, `expire` runs once. */
export function armGrace(consoleId: string, expire: () => void, ms = CONSOLE_GRACE_MS): void {
  cancelGrace(consoleId);
  graceTimers.set(
    consoleId,
    setTimeout(() => {
      graceTimers.delete(consoleId);
      expire();
    }, ms),
  );
}

export function cancelGrace(consoleId: string): void {
  const t = graceTimers.get(consoleId);
  if (t) clearTimeout(t);
  graceTimers.delete(consoleId);
}
