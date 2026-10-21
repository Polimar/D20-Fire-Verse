/** Stash writes shared by heroes, loot, and the vendor. */

import { randomBytes } from "node:crypto";
import { accountDb } from "./auth.js";

export type OwnedItem = { instanceId: string; itemDefId: string };

function safeMoney(raw: string | number | null | undefined): number {
  const n = typeof raw === "number" ? raw : Number(raw ?? 0);
  if (!Number.isFinite(n) || !Number.isSafeInteger(n) || n < 0) return 0;
  return n;
}

export function wallet(userId: string): { gold: number; hard: number } {
  accountDb().prepare("INSERT OR IGNORE INTO account_wallet (user_id, gold_balance, hard_currency_balance) VALUES (?, 0, 0)").run(userId);
  const row = accountDb().prepare(
    "SELECT CAST(gold_balance AS TEXT) AS gold_balance, CAST(hard_currency_balance AS TEXT) AS hard_currency_balance FROM account_wallet WHERE user_id = ?",
  ).get(userId) as { gold_balance: string; hard_currency_balance: string };
  return { gold: safeMoney(row.gold_balance), hard: safeMoney(row.hard_currency_balance) };
}

export function addGold(userId: string, amount: number): void {
  if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000) return;
  wallet(userId);
  accountDb().prepare("UPDATE account_wallet SET gold_balance = gold_balance + ? WHERE user_id = ?").run(amount, userId);
}

export function insertStashItem(
  userId: string,
  itemDefId: string,
  opts?: { boundHeroId?: string | null; instanceId?: string },
): string {
  const instanceId = opts?.instanceId ?? `item_${randomBytes(8).toString("hex")}`;
  accountDb()
    .prepare(
      `INSERT INTO account_stash (id, user_id, item_def_id, item_instance_data_json, acquired_at, bound_hero_id)
       VALUES (?, ?, ?, '{}', ?, ?)`,
    )
    .run(instanceId, userId, itemDefId, new Date().toISOString(), opts?.boundHeroId ?? null);
  return instanceId;
}

/** Vendor, loot, and other account-wide rewards — shared stash. */
export function giveItemOwned(userId: string, itemDefId: string, spendGold = 0): OwnedItem {
  const bag = wallet(userId);
  if (spendGold > bag.gold) throw new Error("NEED_GOLD");
  if (spendGold) accountDb().prepare("UPDATE account_wallet SET gold_balance = gold_balance - ? WHERE user_id = ?").run(spendGold, userId);
  const instanceId = insertStashItem(userId, itemDefId);
  return { instanceId, itemDefId };
}
