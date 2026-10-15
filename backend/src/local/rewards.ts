/** Encounter rewards. The level number moves only after the fight, using defaults when the player has not chosen. */

import { matchGold, modeXp, xpAfterLoss, type RewardMode } from "@d20-fireverse/rules";
import { accountElo, setAccountElo } from "./arena-queue.js";
import { addXp, creditGold, getHero, heroPending, noteMilestone } from "./hero.js";
import { rollLoot } from "./loot.js";
import { xpThresholds } from "./content-catalog.js";
import { accountDb } from "./auth.js";
import { recordEvent } from "./events.js";
import { getEconomyConfig } from "./economy-config.js";

export type SettleOutcome = {
  xpGained: number;
  goldGained: number;
  level: number;
};

function heroCountersAfter(
  heroId: string,
  inc: { games: boolean; wins: boolean },
): { games: number; wins: number } {
  const prev = accountDb()
    .prepare("SELECT kind, count FROM hero_milestones WHERE hero_id = ? AND kind IN ('games_total','wins_total')")
    .all(heroId) as Array<{ kind: string; count: number }>;
  const current: Record<string, number> = { games_total: 0, wins_total: 0 };
  for (const row of prev) current[row.kind] = row.count;
  const games = current.games_total + (inc.games ? 1 : 0);
  const wins = current.wins_total + (inc.wins ? 1 : 0);
  const now = new Date().toISOString();
  if (inc.games) {
    accountDb()
      .prepare(
        `INSERT INTO hero_milestones (hero_id, kind, count, achieved_at) VALUES (?, 'games_total', ?, ?)
         ON CONFLICT(hero_id, kind) DO UPDATE SET count = excluded.count, achieved_at = excluded.achieved_at`,
      )
      .run(heroId, games, now);
  }
  if (inc.wins) {
    accountDb()
      .prepare(
        `INSERT INTO hero_milestones (hero_id, kind, count, achieved_at) VALUES (?, 'wins_total', ?, ?)
         ON CONFLICT(hero_id, kind) DO UPDATE SET count = excluded.count, achieved_at = excluded.achieved_at`,
      )
      .run(heroId, wins, now);
  }
  return { games, wins };
}

export function settleHero(input: {
  heroId: string;
  mode: RewardMode;
  won?: boolean;
  monsterXp?: number[];
  opponentLevel?: number;
  encounterCr?: number;
  placement?: number;
  playerCount?: number;
  config?: ReturnType<typeof getEconomyConfig>;
  picks?: { subclassId?: string; ability?: "str" | "dex" | "con" | "int" | "wis" | "cha"; featId?: string; spellId?: string; classId?: string };
}): SettleOutcome {
  const hero = getHero(input.heroId);
  if (!hero) throw new Error("BAD_CHARACTER");
  const config = input.config ?? getEconomyConfig();
  const day = new Date().toISOString().slice(0, 10);
  let arcadeMatches = 0;
  if (input.mode === "arcade") {
    const row = accountDb().prepare("SELECT matches FROM arcade_daily WHERE user_id = ? AND day = ?").get(hero.userId, day) as { matches: number } | undefined;
    arcadeMatches = row?.matches ?? 0;
    accountDb()
      .prepare(
        `INSERT INTO arcade_daily (user_id, day, matches) VALUES (?, ?, 1)
         ON CONFLICT(user_id, day) DO UPDATE SET matches = matches + 1`,
      )
      .run(hero.userId, day);
  }
  let gained = modeXp(
    input.mode,
    {
      monsterXp: input.monsterXp,
      won: input.won,
      heroLevel: hero.level,
      opponentLevel: input.opponentLevel,
      arcadeMatches,
    },
    config,
  );
  if (input.mode === "ranked" && !input.won) {
    const next = xpAfterLoss(hero.xp, gained, hero.level, xpThresholds());
    gained = next - hero.xp;
  }
  addXp(hero.id, gained, input.mode);
  const leveled = getHero(hero.id) ?? hero;

  // Gold reward (config-driven; honours placement multipliers when set)
  const goldGained = matchGold(
    input.mode,
    {
      won: input.won,
      placement: input.placement,
      playerCount: input.playerCount,
      matchesToday: arcadeMatches,
    },
    config,
  );
  if (goldGained > 0) {
    creditGold(hero.userId, goldGained);
    recordEvent(hero.userId, hero.id, "gold", { delta: goldGained, reason: "match", mode: input.mode, won: !!input.won, placement: input.placement ?? null });
  }

  if (input.mode !== "story" && input.mode !== "test") {
    const counters = heroCountersAfter(hero.id, { games: true, wins: Boolean(input.won) });
    for (const row of config.milestones) {
      if (row.kind.startsWith("wins_") && input.won && counters.wins >= row.count) noteMilestone(hero.id, row.kind, row.count);
      if (row.kind.startsWith("games_") && counters.games >= row.count) noteMilestone(hero.id, row.kind, row.count);
    }
  }

  if (input.mode !== "story") {
    rollLoot({
      userId: hero.userId,
      mode: input.mode as "pve" | "ranked" | "arcade" | "test",
      level: hero.level,
      encounterCr: input.encounterCr,
      opponentLevel: input.opponentLevel,
      won: input.won,
    });
  }
  return { xpGained: gained, goldGained, level: leveled.level };
}
