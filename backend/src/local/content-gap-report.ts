/**
 * Aggregates catalog missing-mechanic stats (same totals as admin Content).
 */

import type { CatalogRow } from "./content-catalog.js";
import { catalogEntry, contentDetail, listCatalog } from "./content-catalog.js";
import { primaryGapBucket } from "./content-gap-buckets.js";
import { FAMILY_HINTS, workFamilyForKind } from "./content-gap-families.js";

export const GAP_REPORT_BASELINE = {
  date: "2026-10-16",
  label: "baseline design",
  missingTotal: 556,
  byKind: { spell: 188, item: 198, monster: 170, other: 0 },
} as const;

export type GapReport = {
  catalogTotal: number;
  missingTotal: number;
  missingByKind: Record<string, number>;
  spellsWithoutGap: number;
  spellsTotal: number;
  bucketCounts: Record<string, number>;
  bucketSamples: Record<string, string[]>;
  workFamilyCounts: Record<string, number>;
  workFamilySamples: Record<string, string[]>;
  workFamiliesByKind: Record<string, Record<string, number>>;
  deltaFromBaseline: number;
};

const KINDS = ["spell", "item", "monster", "class", "species", "subclass", "background", "feat"] as const;

function countByKind(rows: CatalogRow[], pick: (r: CatalogRow) => boolean): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (!pick(row)) continue;
    out[row.kind] = (out[row.kind] ?? 0) + 1;
  }
  return out;
}

export function buildGapReport(): GapReport {
  const all = listCatalog();
  const gaps = all.filter((r) => r.missingMechanic);
  const missingByKind = countByKind(gaps, () => true);
  const bucketCounts: Record<string, number> = {};
  const bucketSamples: Record<string, string[]> = {};
  const workFamilyCounts: Record<string, number> = {};
  const workFamilySamples: Record<string, string[]> = {};
  const workFamiliesByKind: Record<string, Record<string, number>> = {};

  for (const row of gaps) {
    const label = `${row.kind}/${row.id}`;
    if (!row.valid) {
      const b = "catalog_invalid";
      bucketCounts[b] = (bucketCounts[b] ?? 0) + 1;
      pushSample(bucketSamples, b, label);
      continue;
    }
    const detail = contentDetail(row.kind, row.id) as { missingMechanicReasons: string[] };
    const bucket = primaryGapBucket(detail.missingMechanicReasons);
    bucketCounts[bucket] = (bucketCounts[bucket] ?? 0) + 1;
    pushSample(bucketSamples, bucket, label);

    const game =
      row.kind === "spell" || row.kind === "item" || row.kind === "monster"
        ? catalogEntry(row.kind, row.id)
        : undefined;
    const family = workFamilyForKind(row.kind, row.id, game, bucket);
    workFamilyCounts[family] = (workFamilyCounts[family] ?? 0) + 1;
    pushSample(workFamilySamples, family, label);
    const byKind = workFamiliesByKind[row.kind] ?? {};
    byKind[family] = (byKind[family] ?? 0) + 1;
    workFamiliesByKind[row.kind] = byKind;
  }

  const spells = all.filter((r) => r.kind === "spell");
  return {
    catalogTotal: all.length,
    missingTotal: gaps.length,
    missingByKind,
    spellsWithoutGap: spells.filter((r) => !r.missingMechanic).length,
    spellsTotal: spells.length,
    bucketCounts,
    bucketSamples,
    workFamilyCounts,
    workFamilySamples,
    workFamiliesByKind,
    deltaFromBaseline: gaps.length - GAP_REPORT_BASELINE.missingTotal,
  };
}

function pushSample(samples: Record<string, string[]>, bucket: string, id: string): void {
  const list = samples[bucket] ?? [];
  if (list.length >= 5) return;
  if (!list.includes(id)) list.push(id);
  samples[bucket] = list;
}

export function formatGapReport(report: GapReport): string {
  const lines: string[] = [];
  lines.push("Content missing mechanic (combat) — gap report");
  lines.push(`Catalog entries: ${report.catalogTotal}`);
  lines.push(`Missing mechanic total: ${report.missingTotal} (baseline ${GAP_REPORT_BASELINE.missingTotal}, Δ ${report.deltaFromBaseline >= 0 ? "+" : ""}${report.deltaFromBaseline})`);
  lines.push("");
  lines.push("By kind (missing):");
  for (const kind of KINDS) {
    const n = report.missingByKind[kind];
    if (n) lines.push(`  ${kind}: ${n}`);
  }
  const otherKinds = Object.keys(report.missingByKind).filter((k) => !(KINDS as readonly string[]).includes(k));
  for (const kind of otherKinds.sort()) {
    lines.push(`  ${kind}: ${report.missingByKind[kind]}`);
  }
  lines.push("");
  lines.push(`Spells without gap: ${report.spellsWithoutGap} / ${report.spellsTotal}`);
  lines.push("");
  lines.push("Top buckets (primary reason per entry):");
  const sortedBuckets = Object.entries(report.bucketCounts).sort((a, b) => b[1] - a[1]);
  for (const [bucket, count] of sortedBuckets.slice(0, 12)) {
    const samples = (report.bucketSamples[bucket] ?? []).join(", ");
    lines.push(`  ${count.toString().padStart(4)}  ${bucket}${samples ? ` — e.g. ${samples}` : ""}`);
  }
  if (sortedBuckets.length > 12) {
    lines.push(`  … ${sortedBuckets.length - 12} more bucket(s)`);
  }
  lines.push("");
  lines.push("Work families (batch planning — same fix unlocks many rows):");
  const sortedFamilies = Object.entries(report.workFamilyCounts).sort((a, b) => b[1] - a[1]);
  for (const [family, count] of sortedFamilies.slice(0, 15)) {
    const hint = FAMILY_HINTS[family] ?? "";
    const samples = (report.workFamilySamples[family] ?? []).join(", ");
    lines.push(`  ${count.toString().padStart(4)}  ${family}${hint ? ` — ${hint}` : ""}`);
    if (samples) lines.push(`         e.g. ${samples}`);
  }
  if (sortedFamilies.length > 15) {
    lines.push(`  … ${sortedFamilies.length - 15} more family(s)`);
  }
  for (const kind of ["spell", "item", "monster"] as const) {
    const map = report.workFamiliesByKind[kind];
    if (!map || !Object.keys(map).length) continue;
    lines.push("");
    lines.push(`${kind} families:`);
    for (const [family, count] of Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      lines.push(`  ${count.toString().padStart(4)}  ${family}`);
    }
  }
  return lines.join("\n");
}
