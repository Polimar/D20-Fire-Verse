/**
 * Prints missing-mechanic totals (matches admin Content cards).
 * Run: npm run content:gap-report
 * Optional: npm run content:gap-report -- --markdown-row
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildGapReport, formatGapReport, GAP_REPORT_BASELINE } from "../backend/src/local/content-gap-report.ts";
import { ensureDataDir } from "../backend/src/local/paths.ts";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BACKLOG = path.join(ROOT, "..", "docs", "MECHANICS_BACKLOG.md");

function markdownProgressRow(report: ReturnType<typeof buildGapReport>): string {
  const d = new Date().toISOString().slice(0, 10);
  const spell = report.missingByKind.spell ?? 0;
  const item = report.missingByKind.item ?? 0;
  const monster = report.missingByKind.monster ?? 0;
  const delta = report.deltaFromBaseline === 0 ? "—" : String(report.deltaFromBaseline);
  return `| ${d} | snapshot | ${report.missingTotal} | ${delta} | ${spell} | ${item} | ${monster} | \`npm run content:gap-report\` |`;
}

function appendProgressRow(row: string): void {
  const text = fs.readFileSync(BACKLOG, "utf8");
  const marker = "| | implement-1 |";
  if (!text.includes(marker)) {
    console.warn("MECHANICS_BACKLOG.md: implement-1 placeholder not found; row not appended.");
    console.log(row);
    return;
  }
  const next = text.replace(marker, `${row}\n${marker}`);
  fs.writeFileSync(BACKLOG, next);
  console.log("Appended progress row to docs/MECHANICS_BACKLOG.md");
}

function main(): void {
  ensureDataDir();
  const report = buildGapReport();
  console.log(formatGapReport(report));
  console.log("");
  console.log(`Baseline reference: ${GAP_REPORT_BASELINE.date} ${GAP_REPORT_BASELINE.label}`);

  const args = process.argv.slice(2);
  if (args.includes("--markdown-row")) {
    console.log("");
    console.log("Markdown progress row (paste into MECHANICS_BACKLOG.md):");
    console.log(markdownProgressRow(report));
  }
  if (args.includes("--append-progress")) {
    appendProgressRow(markdownProgressRow(report));
  }
}

main();
