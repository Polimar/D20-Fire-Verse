/**
 * Export missing-mechanic rows for Plan triage / mega-wave scoping.
 * Run: npm run content:wave-export -- --family spell_batch_note_or_wire --format md
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAbility } from "../backend/src/local/campaign.ts";
import { catalogEntry, contentDetail, listCatalog } from "../backend/src/local/content-catalog.ts";
import { workFamilyForKind } from "../backend/src/local/content-gap-families.ts";
import { primaryGapBucket } from "../backend/src/local/content-gap-buckets.ts";
import { ensureDataDir } from "../backend/src/local/paths.ts";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

type Args = {
  family?: string;
  missingOnly: boolean;
  format: "json" | "md";
  limit?: number;
  effectType?: string;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { missingOnly: true, format: "md" };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--family") out.family = argv[++i];
    else if (a === "--format") out.format = argv[++i] === "json" ? "json" : "md";
    else if (a === "--all") out.missingOnly = false;
    else if (a === "--missing-only") out.missingOnly = true;
    else if (a === "--limit") out.limit = Number(argv[++i]);
    else if (a === "--effect-type") out.effectType = argv[++i];
  }
  return out;
}

type ExportRow = {
  kind: string;
  id: string;
  family: string;
  bucket: string;
  reasons: string[];
  abilityId?: string;
  effectType?: string;
  level?: number;
  name?: string;
};

function main(): void {
  ensureDataDir();
  const args = parseArgs(process.argv.slice(2));
  const rows: ExportRow[] = [];

  for (const row of listCatalog()) {
    if (args.missingOnly && !row.missingMechanic) continue;
    if (!row.valid) continue;
    const detail = contentDetail(row.kind, row.id) as { missingMechanicReasons: string[] };
    const reasons = detail.missingMechanicReasons ?? [];
    if (!reasons.length && args.missingOnly) continue;
    const bucket = primaryGapBucket(reasons);
    const game =
      row.kind === "spell" || row.kind === "item" || row.kind === "monster"
        ? catalogEntry(row.kind, row.id)
        : undefined;
    const family = workFamilyForKind(row.kind, row.id, game, bucket);
    if (args.family && family !== args.family) continue;

    const abilityId = row.kind === "spell" ? `spell_${row.id}` : undefined;
    const ability = abilityId ? getAbility(abilityId) : undefined;
    const effectType = ability?.effects?.[0]?.type as string | undefined;
    if (args.effectType && effectType !== args.effectType) continue;

    const spell = row.kind === "spell" ? (game as { name?: string; level?: number } | undefined) : undefined;
    rows.push({
      kind: row.kind,
      id: row.id,
      family,
      bucket,
      reasons: reasons.slice(0, 3),
      abilityId,
      effectType,
      level: spell?.level,
      name: spell?.name ?? row.name,
    });
  }

  rows.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  const clipped = args.limit ? rows.slice(0, args.limit) : rows;

  if (args.format === "json") {
    console.log(JSON.stringify({ count: clipped.length, totalMatching: rows.length, rows: clipped }, null, 2));
    return;
  }

  const lines: string[] = [
    `# Wave export${args.family ? ` — ${args.family}` : ""}`,
    "",
    `Matching: **${rows.length}** (showing ${clipped.length})`,
    "",
    "| # | kind | id | effect | level | first reason |",
    "|---|------|----|--------|-------|--------------|",
  ];
  clipped.forEach((r, i) => {
    const reason = (r.reasons[0] ?? "").replace(/\|/g, "/").slice(0, 80);
    lines.push(
      `| ${i + 1} | ${r.kind} | \`${r.id}\` | ${r.effectType ?? "—"} | ${r.level ?? "—"} | ${reason} |`,
    );
  });
  console.log(lines.join("\n"));

  const triageHint = path.join(ROOT, "..", "content", "triage", "spell_combat_v1.json");
  if (args.family === "spell_batch_note_or_wire") {
    console.log("");
    console.log(`Triage artifact (optional): ${triageHint}`);
  }
}

main();
