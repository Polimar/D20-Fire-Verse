import assert from "node:assert/strict";
import { before, test } from "node:test";
import { normalizeGapBucket, primaryGapBucket } from "../src/local/content-gap-buckets.js";
import { spellWorkFamily } from "../src/local/content-gap-families.js";
import { buildGapReport, formatGapReport, GAP_REPORT_BASELINE } from "../src/local/content-gap-report.js";
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
  // Post mega-4–8: spell/monster queues cleared; items still dominate Missing.
  assert.ok(report.missingTotal >= 150);
  assert.equal(report.missingByKind.spell ?? 0, 0);
  assert.ok((report.missingByKind.item ?? 0) >= 150);
  assert.ok(report.spellsWithoutGap > 100);
  assert.ok(Object.keys(report.bucketCounts).length >= 1);
  const sumKinds = Object.values(report.missingByKind).reduce((a, b) => a + b, 0);
  assert.equal(sumKinds, report.missingTotal);
  assert.equal(typeof report.deltaFromBaseline, "number");
  assert.equal(GAP_REPORT_BASELINE.missingTotal, 556);
  const familySum = Object.values(report.workFamilyCounts).reduce((a, b) => a + b, 0);
  assert.equal(familySum, report.missingTotal);
  assert.ok((report.workFamilyCounts.item_batch_unparsed_other ?? 0) + (report.workFamilyCounts.item_batch_unparsed_magic_gear ?? 0) > 50);
  const text = formatGapReport(report);
  assert.match(text, /Work families/);
  assert.match(text, /item families:/i);
});

test("spellWorkFamily routes exploration vs note stub", () => {
  assert.equal(
    spellWorkFamily(
      { id: "detect_magic", name: "Detect Magic", level: 1, school: "divination", description: "", concentration: false },
      "spell_no_battlefield_effect",
    ),
    "spell_batch_note_or_wire",
  );
  assert.equal(
    spellWorkFamily(
      { id: "detect_magic", name: "Detect Magic", level: 1, school: "divination", description: "", concentration: false },
      "review_not_modeled",
    ),
    "spell_batch_exploration_policy",
  );
});
