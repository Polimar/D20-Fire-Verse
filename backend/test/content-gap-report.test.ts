import assert from "node:assert/strict";
import { before, test } from "node:test";
import { normalizeGapBucket, primaryGapBucket } from "../src/local/content-gap-buckets.js";
import { buildGapReport, GAP_REPORT_BASELINE } from "../src/local/content-gap-report.js";
import { boot } from "./helpers.js";

before(boot);

test("normalizeGapBucket maps common admin reasons", () => {
  assert.equal(
    normalizeGapBucket("No combat ability wired: add spell_foo in content/rules/srd51_combat.json"),
    "spell_no_combat_ability",
  );
  assert.equal(
    normalizeGapBucket("SRD rule not applied in combat: No battlefield effect is run for this spell yet."),
    "spell_no_battlefield_effect",
  );
  assert.equal(primaryGapBucket(["Parser could not map field: effects", "other"]), "parser_unparsed_field");
});

test("buildGapReport matches admin-scale missing mechanic queue", () => {
  const report = buildGapReport();
  assert.ok(report.catalogTotal > 500);
  assert.ok(report.missingTotal > 200);
  assert.ok((report.missingByKind.spell ?? 0) > 100);
  assert.ok(report.spellsWithoutGap > 100);
  assert.ok(Object.keys(report.bucketCounts).length >= 3);
  const sumKinds = Object.values(report.missingByKind).reduce((a, b) => a + b, 0);
  assert.equal(sumKinds, report.missingTotal);
  assert.equal(typeof report.deltaFromBaseline, "number");
  assert.equal(GAP_REPORT_BASELINE.missingTotal, 556);
});
