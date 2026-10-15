/**
 * Live EconomyConfig store. One row in `economy_config` holds the admin's
 * current values; defaults live in `@d20-fireverse/rules` so unit tests work
 * without a database.
 */

import {
  DEFAULT_ECONOMY,
  cloneEconomy,
  mergeEconomy,
  validateEconomy,
  type EconomyConfig,
} from "@d20-fireverse/rules";
import { accountDb } from "./auth.js";

let cache: EconomyConfig | null = null;
let cacheMeta: { updatedAt: string | null; updatedBy: string | null } = { updatedAt: null, updatedBy: null };

function row(): { json: string; updated_at: string | null; updated_by: string | null } | undefined {
  return accountDb()
    .prepare("SELECT json, updated_at, updated_by FROM economy_config WHERE id = 'live'")
    .get() as { json: string; updated_at: string | null; updated_by: string | null } | undefined;
}

function load(): void {
  const r = row();
  if (!r) {
    cache = cloneEconomy(DEFAULT_ECONOMY);
    cacheMeta = { updatedAt: null, updatedBy: null };
    return;
  }
  try {
    const stored = JSON.parse(r.json) as unknown;
    const merged = mergeEconomy(DEFAULT_ECONOMY, stored);
    validateEconomy(merged);
    cache = merged;
  } catch {
    cache = cloneEconomy(DEFAULT_ECONOMY);
  }
  cacheMeta = { updatedAt: r.updated_at, updatedBy: r.updated_by };
}

export function invalidateEconomyCache(): void {
  cache = null;
}

export function getEconomyConfig(): EconomyConfig {
  if (!cache) load();
  return cache!;
}

export function economyMeta(): { updatedAt: string | null; updatedBy: string | null } {
  if (!cache) load();
  return cacheMeta;
}

export function setEconomyConfig(patch: unknown, actor: { id: string; username: string }): EconomyConfig {
  const next = mergeEconomy(getEconomyConfig(), patch);
  validateEconomy(next);
  const now = new Date().toISOString();
  accountDb()
    .prepare(
      `INSERT INTO economy_config (id, json, updated_at, updated_by)
       VALUES ('live', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .run(JSON.stringify(next), now, actor.username);
  cache = next;
  cacheMeta = { updatedAt: now, updatedBy: actor.username };
  return next;
}

export function resetEconomyConfig(actor: { id: string; username: string }): EconomyConfig {
  const now = new Date().toISOString();
  accountDb().prepare("DELETE FROM economy_config WHERE id = 'live'").run();
  cache = cloneEconomy(DEFAULT_ECONOMY);
  cacheMeta = { updatedAt: null, updatedBy: null };
  // Audit trail is left to the HTTP handler; the actor param is kept for symmetry with set.
  void actor;
  void now;
  return cache;
}
