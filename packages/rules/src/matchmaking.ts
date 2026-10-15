/** One Elo per account. Party Elo is the average. The level window uses the highest hero. */

import { DEFAULT_ECONOMY, type EconomyConfig } from "./economy-config.js";

export type QueueType = "solo" | "duo" | "full_team";

export type RankedFormat = "ffa_1v1" | "ffa_3" | "ffa_4" | "teams_2v2";

export const RANKED_FORMAT_SEATS: Record<RankedFormat, { seats: number; teams: 0 | 2 }> = {
  ffa_1v1: { seats: 2, teams: 0 },
  ffa_3: { seats: 3, teams: 0 },
  ffa_4: { seats: 4, teams: 0 },
  teams_2v2: { seats: 4, teams: 2 },
};

export type QueueTicket = {
  id: string;
  userId: string;
  elo: number;
  heroLevel: number;
  queuedAt: number;
  partyUserIds: string[];
  partyHeroIds: string[];
  format: RankedFormat;
};

export function partyElo(elos: readonly number[], config: EconomyConfig = DEFAULT_ECONOMY): number {
  if (!elos.length) return config.elo.seasonResetAnchor;
  return Math.round(elos.reduce((n, e) => n + e, 0) / elos.length);
}

export function partyLevel(levels: readonly number[]): number {
  return levels.reduce((n, level) => Math.max(n, level), 1);
}

export function windowForWait(waitMs: number, config: EconomyConfig = DEFAULT_ECONOMY): { level: number; elo: number } {
  const mm = config.matchmaking;
  const steps = Math.max(0, Math.floor(waitMs / mm.stepMs));
  return {
    level: Math.min(mm.maxLevel, mm.baseLevel + steps * mm.stepLevel),
    elo: Math.min(mm.maxElo, mm.baseElo + steps * mm.stepElo),
  };
}

export function ticketsMatch(a: QueueTicket, b: QueueTicket, now: number, config: EconomyConfig = DEFAULT_ECONOMY): boolean {
  const wait = Math.max(now - a.queuedAt, now - b.queuedAt);
  const w = windowForWait(wait, config);
  return Math.abs(a.heroLevel - b.heroLevel) <= w.level && Math.abs(a.elo - b.elo) <= w.elo;
}

export function seasonResetElo(rating: number, config: EconomyConfig = DEFAULT_ECONOMY): number {
  const oldWeight = config.elo.seasonResetOldWeight;
  const anchor = config.elo.seasonResetAnchor;
  return Math.round(rating * oldWeight + anchor * (1 - oldWeight));
}

/** Legacy constant kept for existing callers; prefer seasonMs(config). */
export const SEASON_MS = DEFAULT_ECONOMY.elo.seasonDays * 24 * 60 * 60 * 1000;

export function seasonMs(config: EconomyConfig = DEFAULT_ECONOMY): number {
  return config.elo.seasonDays * 24 * 60 * 60 * 1000;
}

export const RANKED_DISCONNECT_MS = DEFAULT_ECONOMY.elo.disconnectMs;

export function rankedAbsenceIsLoss(leftAt: number, now: number, config: EconomyConfig = DEFAULT_ECONOMY): boolean {
  return now - leftAt >= config.elo.disconnectMs;
}

// --- Elo deltas ------------------------------------------------------------

function expected(rA: number, rB: number): number {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

/**
 * Standard 1v1 Elo delta from the perspective of A. `score` is 1 for A win,
 * 0 for A loss, 0.5 for a draw.
 */
export function eloDelta(ratingA: number, ratingB: number, score: number, config: EconomyConfig = DEFAULT_ECONOMY): number {
  return Math.round(config.elo.k * (score - expected(ratingA, ratingB)));
}

/**
 * FFA Elo: score every pair of fighters as a 1v1, with placement deciding the
 * score (1 for the better finish, 0.5 for a tie, 0 for the worse). The K is
 * scaled by 1/(N-1) so a win against three opponents is comparable to a single
 * 1v1 win.
 */
export function ffaEloDeltas(
  placements: readonly number[],
  ratings: readonly number[],
  config: EconomyConfig = DEFAULT_ECONOMY,
): number[] {
  const n = placements.length;
  if (n < 2) return placements.map(() => 0);
  const scaled = { ...config, elo: { ...config.elo, k: config.elo.k / (n - 1) } };
  const deltas = new Array(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const score = placements[i]! < placements[j]! ? 1 : placements[i]! > placements[j]! ? 0 : 0.5;
      const d = eloDelta(ratings[i]!, ratings[j]!, score, scaled);
      deltas[i] += d;
      deltas[j] -= d;
    }
  }
  return deltas.map((v) => Math.round(v));
}

/**
 * Team Elo: compare the average Elo of each team as if it were a 1v1 and
 * apply the same delta to every member of the team.
 */
export function teamEloDeltas(
  teamRatings: readonly (readonly number[])[],
  winningTeam: number | null,
  config: EconomyConfig = DEFAULT_ECONOMY,
): number[][] {
  if (teamRatings.length !== 2) throw new Error("teamEloDeltas: expected 2 teams");
  const avgA = partyElo(teamRatings[0]!);
  const avgB = partyElo(teamRatings[1]!);
  const scoreA = winningTeam == null ? 0.5 : winningTeam === 0 ? 1 : 0;
  const dA = eloDelta(avgA, avgB, scoreA, config);
  return [teamRatings[0]!.map(() => dA), teamRatings[1]!.map(() => -dA)];
}

export type MatchSeat = {
  ticketId: string;
  userIds: string[];
  heroIds: string[];
  teamId?: "a" | "b";
};

export type AssembledMatch = {
  format: RankedFormat;
  seats: MatchSeat[];
  ticketIds: string[];
};

function ticketsCompatible(group: readonly QueueTicket[], now: number, config: EconomyConfig): boolean {
  if (group.length < 2) return false;
  const avgElo = partyElo(group.map((t) => t.elo), config);
  const avgLevel = Math.round(group.reduce((n, t) => n + t.heroLevel, 0) / group.length);
  const wait = Math.max(...group.map((t) => now - t.queuedAt));
  const w = windowForWait(wait, config);
  return group.every((t) => Math.abs(t.elo - avgElo) <= w.elo && Math.abs(t.heroLevel - avgLevel) <= w.level);
}

function combos<T>(arr: readonly T[], k: number): T[][] {
  if (k <= 0 || k > arr.length) return k === 0 ? [[]] : [];
  const out: T[][] = [];
  const walk = (start: number, acc: T[]): void => {
    if (acc.length === k) {
      out.push(acc.slice());
      return;
    }
    for (let i = start; i < arr.length; i += 1) {
      acc.push(arr[i]!);
      walk(i + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return out;
}

function seatOf(ticket: QueueTicket, teamId?: "a" | "b"): MatchSeat {
  return { ticketId: ticket.id, userIds: [...ticket.partyUserIds], heroIds: [...ticket.partyHeroIds], ...(teamId ? { teamId } : {}) };
}

function pack(format: RankedFormat, tickets: QueueTicket[], seats: MatchSeat[]): AssembledMatch {
  return { format, seats, ticketIds: tickets.map((t) => t.id) };
}

function oldest(groups: QueueTicket[][]): QueueTicket[] | undefined {
  if (!groups.length) return undefined;
  groups.sort((a, b) => {
    const aw = a.reduce((n, t) => n + t.queuedAt, 0) / a.length;
    const bw = b.reduce((n, t) => n + t.queuedAt, 0) / b.length;
    return aw - bw;
  });
  return groups[0];
}

function pairSolosForTeams(solos: QueueTicket[]): [QueueTicket, QueueTicket, QueueTicket, QueueTicket] | undefined {
  if (solos.length !== 4) return undefined;
  const s = [...solos].sort((a, b) => a.elo - b.elo);
  // Low+high vs mid+mid keeps team averages close.
  return [s[0]!, s[3]!, s[1]!, s[2]!];
}

/**
 * Build a legal ranked match from the live queue. Returns seats (and team ids
 * for 2v2) once enough compatible tickets exist. A duo is never split.
 */
export function assembleMatch(
  format: RankedFormat,
  tickets: readonly QueueTicket[],
  now: number,
  config: EconomyConfig = DEFAULT_ECONOMY,
): AssembledMatch | undefined {
  const spec = RANKED_FORMAT_SEATS[format];
  const pool = tickets.filter((t) => t.format === format);
  if (format === "teams_2v2") {
    const duos = pool.filter((t) => t.partyUserIds.length === 2);
    const solos = pool.filter((t) => t.partyUserIds.length === 1);
    const candidates: Array<{ tickets: QueueTicket[]; seats: MatchSeat[] }> = [];
    for (const pair of combos(duos, 2)) {
      if (!ticketsCompatible(pair, now, config)) continue;
      candidates.push({
        tickets: pair,
        seats: [seatOf(pair[0]!, "a"), seatOf(pair[1]!, "b")],
      });
    }
    for (const duo of duos) {
      for (const pair of combos(solos, 2)) {
        const group = [duo, ...pair];
        if (!ticketsCompatible(group, now, config)) continue;
        candidates.push({
          tickets: group,
          seats: [seatOf(duo, "a"), seatOf(pair[0]!, "b"), seatOf(pair[1]!, "b")],
        });
      }
    }
    for (const four of combos(solos, 4)) {
      if (!ticketsCompatible(four, now, config)) continue;
      const paired = pairSolosForTeams(four);
      if (!paired) continue;
      candidates.push({
        tickets: four,
        seats: [seatOf(paired[0]!, "a"), seatOf(paired[1]!, "a"), seatOf(paired[2]!, "b"), seatOf(paired[3]!, "b")],
      });
    }
    candidates.sort((a, b) => {
      const aw = a.tickets.reduce((n, t) => n + t.queuedAt, 0) / a.tickets.length;
      const bw = b.tickets.reduce((n, t) => n + t.queuedAt, 0) / b.tickets.length;
      return aw - bw;
    });
    const match = candidates[0];
    return match ? pack(format, match.tickets, match.seats) : undefined;
  }

  const solos = pool.filter((t) => t.partyUserIds.length === 1);
  const groups = combos(solos, spec.seats).filter((g) => ticketsCompatible(g, now, config));
  const picked = oldest(groups);
  if (!picked) return undefined;
  return pack(format, picked, picked.map((t) => seatOf(t)));
}
