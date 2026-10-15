/**
 * Lists SRD class features (L1–20) that are not marked green in coverage.ts.
 * Run: npm run coverage:report
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COVERAGE, classLevelCap, PACK_A_CLASS_IDS, type CoverageStatus } from "../backend/src/local/coverage.ts";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CLASSES_FILE = path.join(ROOT, "..", "content", "srd-5.2.1", "classes.json");

const GREEN = new Set<CoverageStatus>(["runs", "progression", "no_combat"]);

type ClassFile = {
  entries: Array<{
    id: string;
    name: string;
    levels: Array<{ level: number; features: string[] }>;
  }>;
};

function main(): void {
  const raw = JSON.parse(fs.readFileSync(CLASSES_FILE, "utf8")) as ClassFile;
  const covered = new Map<string, CoverageStatus>();
  for (const row of COVERAGE) {
    const key = `${row.classId}:${row.level}:${row.feature}:${row.subclassId ?? ""}`;
    covered.set(key, row.status);
  }

  const gaps: string[] = [];
  const packOnly = process.env.PACK_A === "1";
  const classFilter = packOnly ? new Set<string>(PACK_A_CLASS_IDS) : null;
  for (const cls of raw.entries) {
    if (classFilter && !classFilter.has(cls.id)) continue;
    const cap = classLevelCap(cls.id);
    for (const row of cls.levels) {
      if (row.level > 20) continue;
      for (const feature of row.features) {
        const key = `${cls.id}:${row.level}:${feature}:`;
        const status = covered.get(key);
        if (!status) {
          gaps.push(`missing registry row: ${cls.id} L${row.level} — ${feature}`);
          continue;
        }
        if (!GREEN.has(status)) {
          gaps.push(`not green (${status}): ${cls.id} L${row.level} — ${feature}`);
        }
      }
    }
    if (cap < 20) {
      gaps.push(`cap ${cap}/20: ${cls.id}`);
    }
  }

  const summary = [...new Set(COVERAGE.map((r) => r.classId))].map((classId) => ({
    classId,
    cap: classLevelCap(classId),
  }));

  console.log("Coverage summary (playable cap by class):");
  for (const row of summary.sort((a, b) => a.classId.localeCompare(b.classId))) {
    console.log(`  ${row.classId}: L${row.cap}`);
  }
  console.log("");
  if (!gaps.length) {
    console.log(packOnly ? "Pack A (barbarian, fighter, rogue, wizard): no gaps." : "No gaps reported against classes.json feature names.");
    process.exit(0);
  }
  console.log(`Gaps (${gaps.length}):`);
  for (const line of gaps.slice(0, 200)) console.log(`  - ${line}`);
  if (gaps.length > 200) console.log(`  … and ${gaps.length - 200} more`);
  process.exit(packOnly ? 1 : 0);
}

main();
