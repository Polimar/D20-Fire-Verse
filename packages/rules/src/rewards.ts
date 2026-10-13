/** Post-encounter rewards. Level does not change until the encounter is over. */

export type RewardMode = "pve" | "ranked" | "arcade" | "test" | "story";

export function pveXp(monsterXp: readonly number[]): number {
  return monsterXp.reduce((n, xp) => n + Math.max(0, xp), 0);
}

export function rankedWinXp(heroLevel: number, opponentLevel: number): number {
  return 100 + 200 + 10 * (opponentLevel - heroLevel);
}

export function rankedLossDelta(opponentLevel: number): number {
  return -50 + 5 * opponentLevel;
}

export function arcadeXp(won: boolean, matchesAlreadyCounted: number, dailyCap = 10): number {
  if (matchesAlreadyCounted >= dailyCap) return 0;
  return won ? 150 : 40;
}

export function modeXp(mode: RewardMode, input: {
  monsterXp?: readonly number[];
  won?: boolean;
  heroLevel?: number;
  opponentLevel?: number;
  arcadeMatches?: number;
}): number {
  switch (mode) {
    case "pve":
    case "story":
      return pveXp(input.monsterXp ?? []);
    case "ranked":
      return input.won
        ? rankedWinXp(input.heroLevel ?? 1, input.opponentLevel ?? 1)
        : rankedLossDelta(input.opponentLevel ?? 1);
    case "arcade":
      return arcadeXp(Boolean(input.won), input.arcadeMatches ?? 0);
    case "test":
      return 0;
    default: {
      const neverMode: never = mode;
      return neverMode;
    }
  }
}

export const MILESTONES = [
  { kind: "games_10", count: 10, gold: 50, cosmetic: "title_regular" },
  { kind: "games_100", count: 100, gold: 200, cosmetic: "frame_iron" },
  { kind: "games_1000", count: 1000, gold: 1000, cosmetic: "banner_veteran" },
  { kind: "wins_10", count: 10, gold: 80, cosmetic: "title_winner" },
  { kind: "wins_100", count: 100, gold: 400, cosmetic: "frame_gold" },
  { kind: "wins_1000", count: 1000, gold: 2000, cosmetic: "skin_champion" },
] as const;

export function milestoneReward(kind: string, count: number): { gold: number; cosmetic?: string } | null {
  const row = MILESTONES.find((m) => m.kind === kind && count >= m.count);
  if (!row) return null;
  return { gold: row.gold, cosmetic: row.cosmetic };
}
