/** One shop for everyone, reshuffled at UTC midnight from the date. */

import { placeholderPrice, type RarityId } from "@d20-fireverse/rules";
import type { ItemDef } from "@d20-fireverse/content-schema";
import { enabledItems } from "./content-catalog.js";
import { recordEvent } from "./events.js";
import { giveItemOwned, wallet, type OwnedItem } from "./stash-mut.js";

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

export function vendorStock(now = new Date()): VendorSlot[] {
  const items = enabledItems();
  const roll = rng(hash(vendorDay(now)));
  const count = 6 + Math.floor(roll() * 5);
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
      priceGold: item.priceGold ?? placeholderPrice(item.rarity),
    });
  }
  return slots;
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

export type { ItemDef };
