/** A season lasts 60 days. The pass resets. Unlocked cosmetics stay. */

import { SEASON_MS, seasonResetElo } from "@d20-fireverse/rules";
import { accountDb } from "./auth.js";
import { softResetElos } from "./arena-queue.js";

export type Season = { id: string; startsAt: string; endsAt: string };

function map(row: { id: string; starts_at: string; ends_at: string }): Season {
  return { id: row.id, startsAt: row.starts_at, endsAt: row.ends_at };
}

export function currentSeason(now = new Date()): Season {
  const iso = now.toISOString();
  const open = accountDb().prepare("SELECT * FROM seasons WHERE starts_at <= ? AND ends_at > ? ORDER BY starts_at DESC LIMIT 1").get(iso, iso) as
    | { id: string; starts_at: string; ends_at: string }
    | undefined;
  if (open) return map(open);
  const start = now;
  const end = new Date(start.getTime() + SEASON_MS);
  const id = `season_${start.toISOString().slice(0, 10)}`;
  accountDb().prepare("INSERT OR IGNORE INTO seasons (id, starts_at, ends_at) VALUES (?, ?, ?)").run(id, start.toISOString(), end.toISOString());
  return { id, startsAt: start.toISOString(), endsAt: end.toISOString() };
}

export function closeSeasonIfDue(now = new Date()): Season {
  const season = currentSeason(now);
  if (new Date(season.endsAt).getTime() > now.getTime()) return season;
  softResetElos();
  accountDb().prepare("UPDATE season_pass SET xp = 0 WHERE season_id = ?").run(season.id);
  const start = now;
  const end = new Date(start.getTime() + SEASON_MS);
  const id = `season_${start.toISOString().slice(0, 10)}_${start.getTime().toString(36)}`;
  accountDb().prepare("INSERT INTO seasons (id, starts_at, ends_at) VALUES (?, ?, ?)").run(id, start.toISOString(), end.toISOString());
  return { id, startsAt: start.toISOString(), endsAt: end.toISOString() };
}

export function grantPassXp(userId: string, amount: number, now = new Date()): number {
  const season = currentSeason(now);
  accountDb().prepare("INSERT OR IGNORE INTO season_pass (user_id, season_id, xp, premium) VALUES (?, ?, 0, 0)").run(userId, season.id);
  accountDb().prepare("UPDATE season_pass SET xp = xp + ? WHERE user_id = ? AND season_id = ?").run(amount, userId, season.id);
  const row = accountDb().prepare("SELECT xp FROM season_pass WHERE user_id = ? AND season_id = ?").get(userId, season.id) as { xp: number };
  return row.xp;
}

export function buyPremium(userId: string, now = new Date()): void {
  const season = currentSeason(now);
  accountDb().prepare("INSERT OR IGNORE INTO season_pass (user_id, season_id, xp, premium) VALUES (?, ?, 0, 1)").run(userId, season.id);
  accountDb().prepare("UPDATE season_pass SET premium = 1 WHERE user_id = ? AND season_id = ?").run(userId, season.id);
}

export function skipPassTier(userId: string, now = new Date()): number {
  return grantPassXp(userId, 1000, now);
}

export { seasonResetElo };
