/** Self-hosted event log. The admin dashboard only reads it. */

import { randomBytes } from "node:crypto";
import { accountDb } from "./auth.js";

export function recordEvent(userId: string, heroId: string | null, eventType: string, payload: unknown): void {
  accountDb()
    .prepare("INSERT INTO events (id, hero_id, user_id, event_type, payload_json, ts) VALUES (?, ?, ?, ?, ?, ?)")
    .run(`ev_${randomBytes(8).toString("hex")}`, heroId, userId, eventType, JSON.stringify(payload ?? {}), new Date().toISOString());
}

export type Analytics = {
  goldFlow: { earned: number; spent: number };
  drops: Array<{ rarity: string; n: number }>;
  iap: { receipts: number; byProduct: Array<{ product: string; n: number }> };
  winRate: Array<{ classId: string; wins: number; fights: number }>;
  dau: number;
};

export function analytics(): Analytics {
  const db = accountDb();
  const gold = db.prepare("SELECT event_type, payload_json FROM events WHERE event_type = 'gold'").all() as Array<{ payload_json: string }>;
  let earned = 0;
  let spent = 0;
  for (const row of gold) {
    const delta = Number((JSON.parse(row.payload_json) as { delta?: number }).delta ?? 0);
    if (delta > 0) earned += delta;
    else spent += -delta;
  }
  const drops = new Map<string, number>();
  for (const row of db.prepare("SELECT payload_json FROM events WHERE event_type = 'drop'").all() as Array<{ payload_json: string }>) {
    const rarity = String((JSON.parse(row.payload_json) as { rarity?: string }).rarity ?? "common");
    drops.set(rarity, (drops.get(rarity) ?? 0) + 1);
  }
  const products = new Map<string, number>();
  const receipts = db.prepare("SELECT payload_json FROM events WHERE event_type = 'iap'").all() as Array<{ payload_json: string }>;
  for (const row of receipts) {
    const product = String((JSON.parse(row.payload_json) as { productId?: string }).productId ?? "unknown");
    products.set(product, (products.get(product) ?? 0) + 1);
  }
  const fights = new Map<string, { wins: number; fights: number }>();
  for (const row of db.prepare("SELECT payload_json FROM events WHERE event_type = 'match_end'").all() as Array<{ payload_json: string }>) {
    const body = JSON.parse(row.payload_json) as { classId?: string; won?: boolean };
    const classId = body.classId || "unknown";
    const cur = fights.get(classId) ?? { wins: 0, fights: 0 };
    cur.fights += 1;
    if (body.won) cur.wins += 1;
    fights.set(classId, cur);
  }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const dau = (db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM events WHERE ts >= ?").get(since) as { n: number }).n;
  return {
    goldFlow: { earned, spent },
    drops: [...drops.entries()].map(([rarity, n]) => ({ rarity, n })),
    iap: { receipts: receipts.length, byProduct: [...products.entries()].map(([product, n]) => ({ product, n })) },
    winRate: [...fights.entries()].map(([classId, row]) => ({ classId, ...row })),
    dau,
  };
}
