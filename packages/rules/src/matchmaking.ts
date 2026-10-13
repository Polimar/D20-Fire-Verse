/** One Elo per account. Party Elo is the average. The level window uses the highest hero. */

export type QueueType = "solo" | "duo" | "full_team";

export type QueueTicket = {
  userId: string;
  elo: number;
  heroLevel: number;
  queuedAt: number;
  partyUserIds: string[];
};

export function partyElo(elos: readonly number[]): number {
  if (!elos.length) return 1000;
  return Math.round(elos.reduce((n, e) => n + e, 0) / elos.length);
}

export function partyLevel(levels: readonly number[]): number {
  return levels.reduce((n, level) => Math.max(n, level), 1);
}

export function windowForWait(waitMs: number): { level: number; elo: number } {
  const steps = Math.max(0, Math.floor(waitMs / 15_000));
  return {
    level: Math.min(5, 2 + steps),
    elo: Math.min(300, 100 + steps * 50),
  };
}

export function ticketsMatch(a: QueueTicket, b: QueueTicket, now: number): boolean {
  const wait = Math.max(now - a.queuedAt, now - b.queuedAt);
  const window = windowForWait(wait);
  return Math.abs(a.heroLevel - b.heroLevel) <= window.level && Math.abs(a.elo - b.elo) <= window.elo;
}

export function seasonResetElo(rating: number): number {
  return Math.round(rating * 0.6 + 1000 * 0.4);
}

export const SEASON_MS = 60 * 24 * 60 * 60 * 1000;

export const RANKED_DISCONNECT_MS = 45_000;

export function rankedAbsenceIsLoss(leftAt: number, now: number): boolean {
  return now - leftAt >= RANKED_DISCONNECT_MS;
}
