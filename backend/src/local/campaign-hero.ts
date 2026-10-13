/** A campaign hero never enters the arena. A second run of the same campaign grants no XP. */

import { randomBytes } from "node:crypto";
import { accountDb } from "./auth.js";
import { getPregen } from "./campaign.js";

export type CampaignHero = {
  id: string;
  userId: string;
  campaignId: string;
  name: string;
  classId: string;
  species: string;
  level: number;
  xp: number;
  runCount: number;
};

function map(row: Record<string, unknown>): CampaignHero {
  const classes = JSON.parse(String(row.classes_json)) as Array<{ id: string }>;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    campaignId: String(row.campaign_id),
    name: String(row.name),
    classId: classes[0]?.id ?? "fighter",
    species: String(row.species),
    level: Number(row.level),
    xp: Number(row.xp),
    runCount: Number(row.run_count),
  };
}

export function createCampaignHero(input: {
  userId: string;
  campaignId: string;
  name: string;
  classId?: string;
  species?: string;
  presetId?: string;
}): CampaignHero {
  const preset = input.presetId ? getPregen(input.presetId) : undefined;
  if (input.presetId && !preset) throw new Error("BAD_CHARACTER");
  const id = `campaignhero_${randomBytes(6).toString("hex")}`;
  const classId = preset?.class ?? input.classId ?? "fighter";
  const species = input.species ?? "human";
  accountDb()
    .prepare(
      `INSERT INTO campaign_heroes (id, user_id, campaign_id, name, classes_json, species, level, xp, run_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, ?)`,
    )
    .run(id, input.userId, input.campaignId, preset?.name ?? input.name, JSON.stringify([{ id: classId, level: 1 }]), species, new Date().toISOString());
  const row = accountDb().prepare("SELECT * FROM campaign_heroes WHERE id = ?").get(id) as Record<string, unknown>;
  return map(row);
}

export function listCampaignHeroes(userId: string, campaignId: string): CampaignHero[] {
  const rows = accountDb().prepare("SELECT * FROM campaign_heroes WHERE user_id = ? AND campaign_id = ?").all(userId, campaignId) as Array<Record<string, unknown>>;
  return rows.map(map);
}

export function campaignXpGain(heroId: string, amount: number): number {
  const row = accountDb().prepare("SELECT run_count FROM campaign_heroes WHERE id = ?").get(heroId) as { run_count: number } | undefined;
  if (!row) return amount;
  return row.run_count > 0 ? 0 : amount;
}

export function finishCampaignRun(heroId: string): void {
  accountDb().prepare("UPDATE campaign_heroes SET run_count = run_count + 1 WHERE id = ?").run(heroId);
}

export function isCampaignHero(id: string): boolean {
  return id.startsWith("campaignhero_");
}
