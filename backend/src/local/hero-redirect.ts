/**
 * Maps legacy custom_* hero ids to regenerated hero_* rows after FIREVERSE_REGEN_CUSTOM.
 */

import { accountDb } from "./auth.js";

export function ensureHeroRedirectTable(): void {
  accountDb().exec(`
    CREATE TABLE IF NOT EXISTS hero_id_redirects (
      old_id TEXT PRIMARY KEY,
      new_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);
}

export function recordHeroRedirect(oldId: string, newId: string, userId: string, note = ""): void {
  ensureHeroRedirectTable();
  accountDb()
    .prepare(
      `INSERT INTO hero_id_redirects (old_id, new_id, user_id, note, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(old_id) DO UPDATE SET new_id = excluded.new_id, note = excluded.note`,
    )
    .run(oldId, newId, userId, note, new Date().toISOString());
}

export function resolveHeroId(heroId: string): string {
  ensureHeroRedirectTable();
  const row = accountDb().prepare("SELECT new_id FROM hero_id_redirects WHERE old_id = ?").get(heroId) as
    | { new_id: string }
    | undefined;
  return row?.new_id ?? heroId;
}

export function listHeroRedirects(): Array<{ oldId: string; newId: string; userId: string; note: string }> {
  ensureHeroRedirectTable();
  return (accountDb().prepare("SELECT old_id, new_id, user_id, note FROM hero_id_redirects ORDER BY created_at").all() as Array<{
    old_id: string;
    new_id: string;
    user_id: string;
    note: string;
  }>).map((r) => ({ oldId: r.old_id, newId: r.new_id, userId: r.user_id, note: r.note }));
}
