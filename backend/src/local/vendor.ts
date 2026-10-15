/**
 * Daily vendor. If the admin scheduled a day, that day's rows are used;
 * otherwise a deterministic seed from the date picks N random enabled items.
 */

import { placeholderPrice, type RarityId } from "@d20-fireverse/rules";
import type { ItemDef } from "@d20-fireverse/content-schema";
import { enabledItems } from "./content-catalog.js";
import { recordEvent } from "./events.js";
import { giveItemOwned, wallet, type OwnedItem } from "./stash-mut.js";
import { accountDb } from "./auth.js";
import { getEconomyConfig } from "./economy-config.js";

export type VendorSlot = { itemId: string; name: string; rarity: RarityId; priceGold: number };

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function vendorDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function priceFor(item: ItemDef): number {
  return item.priceGold ?? placeholderPrice(item.rarity, getEconomyConfig());
}

type ScheduledRow = { position: number; item_id: string; price_gold: number | null };

function scheduledSlots(day: string, items: ItemDef[]): VendorSlot[] {
  const rows = accountDb()
    .prepare("SELECT position, item_id, price_gold FROM vendor_schedule WHERE day = ? ORDER BY position ASC")
    .all(day) as ScheduledRow[];
  if (!rows.length) return [];
  const byId = new Map(items.map((i) => [i.id, i] as const));
  const out: VendorSlot[] = [];
  for (const row of rows) {
    const item = byId.get(row.item_id);
    if (!item) continue;
    out.push({
      itemId: item.id,
      name: item.name,
      rarity: item.rarity,
      priceGold: row.price_gold ?? priceFor(item),
    });
  }
  return out;
}

function autoSlots(day: string, items: ItemDef[]): VendorSlot[] {
  const config = getEconomyConfig();
  const { autoMin, autoMax } = config.vendor;
  const span = Math.max(0, autoMax - autoMin);
  const roll = rng(hash(day));
  const count = autoMin + Math.floor(roll() * (span + 1));
  const pool = [...items];
  const slots: VendorSlot[] = [];
  while (slots.length < count && pool.length) {
    const index = Math.floor(roll() * pool.length);
    const item = pool.splice(index, 1)[0];
    if (!item) break;
    slots.push({
      itemId: item.id,
      name: item.name,
      rarity: item.rarity,
      priceGold: priceFor(item),
    });
  }
  return slots;
}

export function vendorStock(now = new Date()): VendorSlot[] {
  const items = enabledItems();
  const day = vendorDay(now);
  const scheduled = scheduledSlots(day, items);
  if (scheduled.length) return scheduled;
  return autoSlots(day, items);
}

/** The auto stock for a given day, ignoring any schedule. Admin uses this to seed the editor. */
export function autoStockFor(day: string): VendorSlot[] {
  return autoSlots(day, enabledItems());
}

export type VendorDay = {
  day: string;
  source: "scheduled" | "auto";
  slots: VendorSlot[];
};

export function vendorCalendar(from: Date, days: number): VendorDay[] {
  const items = enabledItems();
  const out: VendorDay[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(from);
    d.setUTCDate(d.getUTCDate() + i);
    const day = vendorDay(d);
    const scheduled = scheduledSlots(day, items);
    out.push({
      day,
      source: scheduled.length ? "scheduled" : "auto",
      slots: scheduled.length ? scheduled : autoSlots(day, items),
    });
  }
  return out;
}

export function buyVendorSlot(userId: string, itemId: string, now = new Date()): OwnedItem {
  const slot = vendorStock(now).find((row) => row.itemId === itemId);
  if (!slot) throw new Error("NOT_IN_SHOP");
  const bag = wallet(userId);
  if (bag.gold < slot.priceGold) throw new Error("NEED_GOLD");
  const item = giveItemOwned(userId, itemId, slot.priceGold);
  recordEvent(userId, null, "gold", { delta: -slot.priceGold, reason: "vendor", itemId });
  return item;
}

export function declarePayToWin(): string {
  return "Gold bought with real money can purchase magic items. This is pay-to-win.";
}

/** Admin: replace the slots scheduled for one day. Past days are refused. */
export function setScheduledDay(day: string, slots: Array<{ itemId: string; priceGold?: number | null }>): VendorDay {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("BAD_DAY");
  const today = vendorDay();
  if (day < today) throw new Error("PAST_DAY");
  const config = getEconomyConfig();
  if (slots.length > config.vendor.maxSlots) throw new Error("TOO_MANY_SLOTS");
  const items = new Map(enabledItems().map((i) => [i.id, i] as const));
  for (const slot of slots) {
    if (!items.has(slot.itemId)) throw new Error("ITEM_NOT_ENABLED");
    if (slot.priceGold != null && (!Number.isInteger(slot.priceGold) || slot.priceGold < 0)) throw new Error("BAD_PRICE");
  }
  const db = accountDb();
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM vendor_schedule WHERE day = ?").run(day);
    const insert = db.prepare("INSERT INTO vendor_schedule (day, position, item_id, price_gold) VALUES (?, ?, ?, ?)");
    slots.forEach((slot, i) => insert.run(day, i, slot.itemId, slot.priceGold ?? null));
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return vendorCalendar(new Date(`${day}T00:00:00Z`), 1)[0]!;
}

export function clearScheduledDay(day: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("BAD_DAY");
  const today = vendorDay();
  if (day < today) throw new Error("PAST_DAY");
  accountDb().prepare("DELETE FROM vendor_schedule WHERE day = ?").run(day);
}

export function fillFromAuto(day: string): VendorDay {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("BAD_DAY");
  const today = vendorDay();
  if (day < today) throw new Error("PAST_DAY");
  const auto = autoStockFor(day);
  return setScheduledDay(day, auto.map((s) => ({ itemId: s.itemId, priceGold: s.priceGold })));
}

export type { ItemDef };
