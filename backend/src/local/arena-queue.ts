/** Account Elo, cross-account parties, and the mode × queue leaderboard. */

import { randomBytes } from "node:crypto";
import { partyElo, partyLevel, seasonResetElo, ticketsMatch, type QueueTicket, type QueueType, type RankedFormat } from "@d20-fireverse/rules";
import { accountDb, accountUsername } from "./auth.js";
import { recordEvent } from "./events.js";
import { getEconomyConfig } from "./economy-config.js";

export type ArenaMode = "ranked" | "arcade" | "test";

const tickets: QueueTicket[] = [];

export function accountElo(userId: string): number {
  const anchor = getEconomyConfig().elo.seasonResetAnchor;
  accountDb().prepare("INSERT OR IGNORE INTO account_rating (user_id, elo) VALUES (?, ?)").run(userId, anchor);
  const row = accountDb().prepare("SELECT elo FROM account_rating WHERE user_id = ?").get(userId) as { elo: number };
  return row.elo;
}

export function setAccountElo(userId: string, elo: number): void {
  accountElo(userId);
  accountDb().prepare("UPDATE account_rating SET elo = ? WHERE user_id = ?").run(Math.max(0, Math.round(elo)), userId);
}

export function enqueue(input: {
  userIds: string[];
  heroLevels: number[];
  queue: QueueType;
  now?: number;
  format?: RankedFormat;
  heroIds?: string[];
}): QueueTicket {
  if (input.queue === "solo" && input.userIds.length !== 1) throw new Error("BAD_PARTY");
  if (input.queue === "duo" && input.userIds.length !== 2) throw new Error("BAD_PARTY");
  if (input.queue === "full_team" && input.userIds.length < 3) throw new Error("BAD_PARTY");
  const ticket: QueueTicket = {
    id: `q_${randomBytes(6).toString("hex")}`,
    userId: input.userIds[0] ?? "",
    elo: partyElo(input.userIds.map(accountElo)),
    heroLevel: partyLevel(input.heroLevels),
    queuedAt: input.now ?? Date.now(),
    partyUserIds: input.userIds,
    partyHeroIds: input.heroIds ?? input.userIds.map(() => ""),
    format: input.format ?? "ffa_1v1",
  };
  tickets.push(ticket);
  return ticket;
}

export function queuedTickets(): QueueTicket[] {
  return tickets.slice();
}

export function ticketForUser(userId: string): QueueTicket | undefined {
  return tickets.find((t) => t.partyUserIds.includes(userId));
}

export function dropTickets(ids: readonly string[]): void {
  const drop = new Set(ids);
  for (let i = tickets.length - 1; i >= 0; i -= 1) {
    if (drop.has(tickets[i]!.id)) tickets.splice(i, 1);
  }
}

export function dropUserTickets(userId: string): QueueTicket[] {
  const gone = tickets.filter((t) => t.partyUserIds.includes(userId));
  dropTickets(gone.map((t) => t.id));
  return gone;
}

export function takeMatch(queue: QueueType, now = Date.now()): [QueueTicket, QueueTicket] | undefined {
  const mine = tickets.filter((ticket) => (queue === "solo" ? ticket.partyUserIds.length === 1 : queue === "duo" ? ticket.partyUserIds.length === 2 : ticket.partyUserIds.length >= 3));
  for (let i = 0; i < mine.length; i += 1) {
    for (let j = i + 1; j < mine.length; j += 1) {
      const a = mine[i];
      const b = mine[j];
      if (!a || !b) continue;
      if (a.partyUserIds.some((id) => b.partyUserIds.includes(id))) continue;
      if (!ticketsMatch(a, b, now, getEconomyConfig())) continue;
      const drop = (ticket: QueueTicket) => {
        const at = tickets.indexOf(ticket);
        if (at >= 0) tickets.splice(at, 1);
      };
      drop(a);
      drop(b);
      return [a, b];
    }
  }
  return undefined;
}

export function recordMatch(input: {
  mode: ArenaMode;
  queue: QueueType;
  format?: RankedFormat | string;
  winnerUserId?: string;
  loadout: unknown;
  elo: unknown;
  placements?: unknown;
}): void {
  accountDb()
    .prepare(
      "INSERT INTO match_board (id, mode, queue_type, winner_user_id, loadout_json, elo_json, ended_at, format, placements_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      `match_${randomBytes(6).toString("hex")}`,
      input.mode,
      input.queue,
      input.winnerUserId ?? null,
      JSON.stringify(input.loadout),
      JSON.stringify(input.elo),
      new Date().toISOString(),
      input.format ?? null,
      input.placements != null ? JSON.stringify(input.placements) : null,
    );
  if (input.winnerUserId) {
    recordEvent(input.winnerUserId, null, "match_end", { won: true, mode: input.mode, classId: "unknown", format: input.format ?? null });
  }
}

export function leaderboard(
  mode: ArenaMode,
  queue?: QueueType | "all",
  format?: string,
): Array<{ userId: string; username: string; wins: number; losses: number; elo: number; loadout: unknown }> {
  const allQueues = !queue || queue === "all";
  const rows = (
    format
      ? (accountDb()
          .prepare(
            allQueues
              ? "SELECT winner_user_id, loadout_json, elo_json, placements_json FROM match_board WHERE mode = ? AND format = ?"
              : "SELECT winner_user_id, loadout_json, elo_json, placements_json FROM match_board WHERE mode = ? AND (format = ? OR (format IS NULL AND queue_type = ?))",
          )
          .all(...(allQueues ? [mode, format] : [mode, format, queue])) as Array<{
            winner_user_id: string | null;
            loadout_json: string;
            elo_json: string;
            placements_json: string | null;
          }>)
      : (accountDb()
          .prepare(
            allQueues
              ? "SELECT winner_user_id, loadout_json, elo_json, placements_json FROM match_board WHERE mode = ?"
              : "SELECT winner_user_id, loadout_json, elo_json, placements_json FROM match_board WHERE mode = ? AND queue_type = ?",
          )
          .all(...(allQueues ? [mode] : [mode, queue])) as Array<{
            winner_user_id: string | null;
            loadout_json: string;
            elo_json: string;
            placements_json: string | null;
          }>)
  );
  const byUser = new Map<string, { wins: number; losses: number; loadout: unknown }>();
  const bump = (userId: string, won: boolean, loadout: unknown) => {
    const cur = byUser.get(userId) ?? { wins: 0, losses: 0, loadout };
    if (won) cur.wins += 1;
    else cur.losses += 1;
    cur.loadout = loadout;
    byUser.set(userId, cur);
  };
  for (const row of rows) {
    const loadout = JSON.parse(row.loadout_json);
    if (row.placements_json) {
      const places = JSON.parse(row.placements_json) as Array<{ userId?: string; placement?: number }>;
      for (const p of places) {
        if (!p.userId) continue;
        bump(p.userId, p.placement === 1, loadout);
      }
    } else if (row.winner_user_id) {
      bump(row.winner_user_id, true, loadout);
    }
  }
  return [...byUser.entries()]
    .map(([userId, row]) => ({
      userId,
      username: accountUsername(userId),
      wins: row.wins,
      losses: row.losses,
      elo: accountElo(userId),
      loadout: row.loadout,
    }))
    .sort((a, b) => b.elo - a.elo || b.wins - a.wins);
}

export function softResetElos(): number {
  const rows = accountDb().prepare("SELECT user_id, elo FROM account_rating").all() as Array<{ user_id: string; elo: number }>;
  const config = getEconomyConfig();
  for (const row of rows) setAccountElo(row.user_id, seasonResetElo(row.elo, config));
  return rows.length;
}

export function clearQueue(): void {
  tickets.splice(0, tickets.length);
}
