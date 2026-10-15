/**
 * One-shot: custom_* files become hero_* rows when FIREVERSE_MIGRATE_CUSTOM=1.
 * Idempotent: a file renamed *.migrated.json is skipped.
 */

import fs from "node:fs";
import path from "node:path";
import type { BuilderDraft } from "@d20-fireverse/protocol/builder";
import { DATA_DIR } from "./paths.js";
import { commitBuilderDraft } from "./builder-commit.js";
import type { SessionUser } from "./auth.js";
import { accountDb } from "./auth.js";

type Legacy = {
  id?: string;
  name?: string;
  ownerUserId?: string;
  class?: string;
  race?: string;
  background?: string;
  abilities?: Record<string, number>;
  level?: number;
};

export function migrateCustomCharacters(): { migrated: number; skipped: number; failed: string[] } {
  const dir = path.join(DATA_DIR, "custom-characters");
  const out = { migrated: 0, skipped: 0, failed: [] as string[] };
  if (!fs.existsSync(dir)) return out;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json") || file.endsWith(".migrated.json")) {
      out.skipped += 1;
      continue;
    }
    const full = path.join(dir, file);
    try {
      const raw = JSON.parse(fs.readFileSync(full, "utf8")) as Legacy;
      if (!raw.ownerUserId || !raw.class || !raw.name) throw new Error("INCOMPLETE");
      const user = accountDb().prepare("SELECT id, username, role FROM users WHERE id = ?").get(raw.ownerUserId) as
        | { id: string; username: string; role: "admin" | "player" }
        | undefined;
      if (!user) throw new Error("NO_OWNER");
      const actor: SessionUser = { id: user.id, username: user.username, role: user.role, disabled: false };
      const abilities = raw.abilities ?? {};
      const draft: BuilderDraft = {
        name: raw.name,
        classId: raw.class,
        speciesId: raw.race || "human",
        backgroundId: raw.background || "soldier",
        method: "standard_array",
        baseAbilities: {
          str: abilities.str ?? 15,
          dex: abilities.dex ?? 14,
          con: abilities.con ?? 13,
          int: abilities.int ?? 12,
          wis: abilities.wis ?? 10,
          cha: abilities.cha ?? 8,
        },
        classSkills: [],
        level: user.role === "admin" ? raw.level : 1,
        backgroundAsi: { mode: "plus2plus1", plus2: "str", plus1: "con" },
      };
      commitBuilderDraft(actor, draft);
      fs.renameSync(full, full.replace(/\.json$/, ".migrated.json"));
      out.migrated += 1;
    } catch (err) {
      out.failed.push(`${file}: ${err instanceof Error ? err.message : "ERROR"}`);
    }
  }
  return out;
}
