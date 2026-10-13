import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { CONTENT_ROOT } from "../src/local/paths.js";

test("the vendored import produced classes, spells, and a review queue", () => {
  const sha = fs.readFileSync(path.join(CONTENT_ROOT, "srd", "VENDOR_SHA"), "utf8").trim();
  assert.match(sha, /^[0-9a-f]{40}$/);
  const classes = JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, "srd-5.2.1", "classes.json"), "utf8")) as { entries: Array<{ id: string; levels: unknown[] }> };
  assert.equal(classes.entries.length, 12);
  assert.equal(classes.entries[0]?.levels.length, 20);
  const spells = JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, "srd-5.2.1", "spells.json"), "utf8")) as { entries: Array<{ id: string }> };
  assert.ok(spells.entries.some((spell) => spell.id === "acid_arrow"));
  const report = JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, "srd-5.2.1", "import-report.json"), "utf8")) as { needsReview: number };
  assert.ok(report.needsReview > 0);
  assert.ok(fs.existsSync(path.join(CONTENT_ROOT, "srd-5.2.1", "review", "class", "fighter.json")));
});
