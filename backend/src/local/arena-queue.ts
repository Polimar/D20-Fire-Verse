/** Account Elo, cross-account parties, and the mode × queue leaderboard. */

import { randomBytes } from "node:crypto";
import { partyElo, partyLevel, seasonResetElo, ticketsMatch, type QueueTicket, type QueueType } from "@d20-fireverse/rules";
import { accountDb } from "./auth.js";
import { recordEvent } from "./events.js";

export type ArenaMode = "ranked" | "arcade" | "test";

const tickets: QueueTicket[] = [];

export function accountElo(userId: string): number {
  accountDb().prepare("INSERT OR IGNORE INTO account_rating (user_id, elo) VALUES (?, 1000)").run(userId);
  const row = accountDb().prepare("SELECT elo FROM account_rating WHERE user_id = ?").get(userId) as { elo: number };
  return row.elo;
}

export function setAccountElo(userId: string, elo: number): void {
  accountElo(userId);
  accountDb().prepare("UPDATE account_rating SET elo = ? WHERE user_id = ?").run(Math.max(0, Math.round(elo)), userId);
}

export function enqueue(input: { userIds: string[]; heroLevels: number[]; queue: QueueType; now?: number }): QueueTicket {
  if (input.queue === "solo" && input.userIds.length !== 1) throw new Error("BAD_PARTY");
  if (input.queue === "duo" && input.userIds.length !== 2) throw new Error("BAD_PARTY");
  if (input.queue === "full_team" && input.userIds.length < 3) throw new Error("BAD_PARTY");
  const ticket: QueueTicket = {
    userId: input.userIds[0] ?? "",
    elo: partyElo(input.userIds.map(accountElo)),
    heroLevel: partyLevel(input.heroLevels),
    queuedAt: input.now ?? Date.now(),
    partyUserIds: input.userIds,
  };
  tickets.push(ticket);
  return ticket;
}

export function takeMatch(queue: QueueType, now = Date.now()): [QueueTicket, QueueTicket] | undefined {
  const mine = tickets.filter((ticket) => (queue === "solo" ? ticket.partyUserIds.length === 1 : queue === "duo" ? ticket.partyUserIds.length === 2 : ticket.partyUserIds.length >= 3));
  for (let i = 0; i < mine.length; i += 1) {
    for (let j = i + 1; j < mine.length; j += 1) {
      const a = mine[i];
      const b = mine[j];
      if (!a || !b) continue;
      if (a.partyUserIds.some((id) => b.partyUserIds.includes(id))) continue;
      if (!ticketsMatch(a, b, now)) continue;
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
  winnerUserId?: string;
  loadout: unknown;
  elo: Record<string, number>;
}): void {
  accountDb()
    .prepare("INSERT INTO match_board (id, mode, queue_type, winner_user_id, loadout_json, elo_json, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(`match_${randomBytes(6).toString("hex")}`, input.mode, input.queue, input.winnerUserId ?? null, JSON.stringify(input.loadout), JSON.stringify(input.elo), new Date().toISOString());
  if (input.winnerUserId) {
    recordEvent(input.winnerUserId, null, "match_end", { won: true, mode: input.mode, classId: "unknown" });
  }
}

export function leaderboard(mode: ArenaMode, queue: QueueType): Array<{ userId: string; wins: number; elo: number; loadout: unknown }> {
  const rows = accountDb()
    .prepare("SELECT winner_user_id, loadout_json, elo_json FROM match_board WHERE mode = ? AND queue_type = ? AND winner_user_id IS NOT NULL")
    .all(mode, queue) as Array<{ winner_user_id: string; loadout_json: string; elo_json: string }>;
  const byUser = new Map<string, { wins: number; loadout: unknown }>();
  for (const row of rows) {
    const cur = byUser.get(row.winner_user_id) ?? { wins: 0, loadout: JSON.parse(row.loadout_json) };
    cur.wins += 1;
    cur.loadout = JSON.parse(row.loadout_json);
    byUser.set(row.winner_user_id, cur);
  }
  return [...byUser.entries()]
    .map(([userId, row]) => ({ userId, wins: row.wins, elo: accountElo(userId), loadout: row.loadout }))
    .sort((a, b) => b.elo - a.elo || b.wins - a.wins);
}

export function softResetElos(): number {
  const rows = accountDb().prepare("SELECT user_id, elo FROM account_rating").all() as Array<{ user_id: string; elo: number }>;
  for (const row of rows) setAccountElo(row.user_id, seasonResetElo(row.elo));
  return rows.length;
}

export function clearQueue(): void {
  tickets.splice(0, tickets.length);
}
