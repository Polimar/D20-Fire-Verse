/** Encounter rewards. The level number moves only after the fight, using defaults when the player has not chosen. */

import { modeXp, xpAfterLoss, type RewardMode } from "@d20-fireverse/rules";
import { accountElo, setAccountElo } from "./arena-queue.js";
import { addXp, getHero, heroPending, noteMilestone } from "./hero.js";
import { rollLoot } from "./loot.js";
import { xpThresholds } from "./content-catalog.js";
import { accountDb } from "./auth.js";

export function settleHero(input: {
  heroId: string;
  mode: RewardMode;
  won?: boolean;
  monsterXp?: number[];
  opponentLevel?: number;
  encounterCr?: number;
  picks?: { subclassId?: string; ability?: "str" | "dex" | "con" | "int" | "wis" | "cha"; featId?: string; spellId?: string; classId?: string };
}): { xpGained: number; level: number } {
  const hero = getHero(input.heroId);
  if (!hero) throw new Error("BAD_CHARACTER");
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
  let gained = modeXp(input.mode, {
    monsterXp: input.monsterXp,
    won: input.won,
    heroLevel: hero.level,
    opponentLevel: input.opponentLevel,
    arcadeMatches,
  });
  if (input.mode === "ranked" && !input.won) {
    const next = xpAfterLoss(hero.xp, gained, hero.level, xpThresholds());
    gained = next - hero.xp;
  }
  if (input.mode === "ranked") {
    const elo = accountElo(hero.userId);
    setAccountElo(hero.userId, elo + (input.won ? 15 : -15));
  }
  addXp(hero.id, gained, input.mode);
  const leveled = getHero(hero.id) ?? hero;
  if (input.won) noteMilestone(hero.id, "wins_10", 10);
  noteMilestone(hero.id, "games_10", 10);
  if (input.mode !== "story") {
    rollLoot({
      userId: hero.userId,
      mode: input.mode,
      level: hero.level,
      encounterCr: input.encounterCr,
      opponentLevel: input.opponentLevel,
      won: input.won,
    });
  }
  return { xpGained: gained, level: leveled.level };
}
