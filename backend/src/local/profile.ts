/** Account profile: wallet, ranked Elo, heroes, and economy totals. */

import { accountDb, arenaLeaderboard, friendTagOf, listFriends } from "./auth.js";
import { accountElo, leaderboard } from "./arena-queue.js";
import { getHero, heroPending, listHeroes, stashView, wallet } from "./hero.js";
import { currentSeason } from "./seasons.js";

export function meProfile(userId: string, username: string, role: string) {
  const bag = wallet(userId);
  const heroes = listHeroes(userId).map((h) => ({
    id: h.id,
    name: h.name,
    classes: h.classes,
    level: h.level,
    xp: h.xp,
    pendingLevelUp: heroPending(h.id),
    equipped: stashView(userId).filter((s) => s.equippedBy === h.id).length,
  }));
  const elo = accountElo(userId);
  const rankedBoard = leaderboard("ranked");
  const rankIndex = rankedBoard.findIndex((r) => r.userId === userId);
  const rankedRow = rankedBoard.find((r) => r.userId === userId);
  const rankedWl = arenaLeaderboard("global").find((r) => r.username === username);
  const goldRows = accountDb()
    .prepare("SELECT payload_json FROM events WHERE user_id = ? AND event_type = 'gold'")
    .all(userId) as Array<{ payload_json: string }>;
  let earned = 0;
  let spent = 0;
  for (const row of goldRows) {
    const delta = Number((JSON.parse(row.payload_json) as { delta?: number }).delta ?? 0);
    if (delta > 0) earned += delta;
    else spent += -delta;
  }
  const bought = (
    accountDb()
      .prepare("SELECT COUNT(*) AS n FROM events WHERE user_id = ? AND event_type = 'gold' AND payload_json LIKE '%vendor%'")
      .get(userId) as { n: number }
  ).n;
  const milestones = accountDb()
    .prepare("SELECT kind, count, achieved_at FROM hero_milestones WHERE hero_id IN (SELECT id FROM heroes WHERE user_id = ?)")
    .all(userId) as Array<{ kind: string; count: number; achieved_at: string | null }>;
  const friends = listFriends(userId);
  return {
    user: { id: userId, username, role, friendTag: friendTagOf(userId) },
    friends: { pendingIn: friends.filter((f) => f.status === "pending" && f.incoming).length },
    wallet: bag,
    season: currentSeason(),
    ranked: {
      elo,
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
      wins: rankedRow?.wins ?? 0,
      losses: rankedRow?.losses ?? 0,
    },
    arena: { wins: rankedWl?.wins ?? 0, losses: rankedWl?.losses ?? 0 },
    heroes,
    economy: { goldEarned: earned, goldSpent: spent, itemsBought: bought },
    milestones,
    selected: getHero(heroes[0]?.id ?? "") ? heroes[0]?.id ?? null : null,
  };
}
