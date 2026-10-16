import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  applyPick,
  blankProgress,
  nextAsk,
  type CatalogSlice,
  type ProgressionHero,
} from "@d20-fireverse/rules";
import { catalogEntry, ensureForgeContentDefaults, listCatalog, reloadCatalog } from "../src/local/content-catalog.js";
import { SUBCLASS_IDS, WIRED_SUBCLASS_FEATURE_SLUGS, frenzyDice, preserveLifePool } from "../src/local/subclass-effects.js";
import { HANDLED } from "../src/local/feature-handled.js";
import { boot } from "./helpers.js";
import fs from "node:fs";
import path from "node:path";
import { CONTENT_ROOT } from "../src/local/paths.js";

before(() => {
  boot();
  reloadCatalog();
  ensureForgeContentDefaults();
});

function loadCatalog(): CatalogSlice {
  const load = (name: string) =>
    JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, "srd-5.2.1", name), "utf8")) as {
      entries: Array<Record<string, unknown>>;
    };
  return {
    classes: load("classes.json").entries as CatalogSlice["classes"],
    subclasses: load("subclasses.json").entries as CatalogSlice["subclasses"],
    feats: load("feats.json").entries as CatalogSlice["feats"],
    spells: load("spells.json").entries as CatalogSlice["spells"],
    species: load("species.json").entries as CatalogSlice["species"],
    xpThresholds: [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000],
  };
}

test("catalog has exactly 48 subclasses, 4 per class", () => {
  const rows = listCatalog().filter((r) => r.kind === "subclass");
  assert.equal(rows.length, 48, String(rows.length));
  const byClass = new Map<string, number>();
  for (const row of rows) {
    const body = catalogEntry<{ classId: string }>("subclass", row.id);
    assert.ok(body, row.id);
    byClass.set(body!.classId, (byClass.get(body!.classId) ?? 0) + 1);
  }
  assert.equal(byClass.size, 12);
  for (const [classId, n] of byClass) assert.equal(n, 4, `${classId}=${n}`);
  for (const id of SUBCLASS_IDS) {
    assert.ok(rows.some((r) => r.id === id), id);
  }
});

test("all 48 subclasses are in play after forge bootstrap", () => {
  const inPlay = listCatalog().filter((r) => r.kind === "subclass" && r.inPlay).map((r) => r.id);
  assert.equal(inPlay.length, 48, `inPlay=${inPlay.length}`);
});

test("every guide feature slug is HANDLED and WIRED", () => {
  for (const slug of WIRED_SUBCLASS_FEATURE_SLUGS) {
    assert.ok(HANDLED[slug], `HANDLED missing ${slug}`);
  }
  assert.ok(WIRED_SUBCLASS_FEATURE_SLUGS.length >= 200);
});

test("level-up at 3 offers 4 subclasses for fighter", () => {
  const book = loadCatalog();
  let pc: ProgressionHero = blankProgress(
    {
      id: "h",
      name: "H",
      level: 2,
      xp: 900,
      species: "human",
      alignment: "neutral",
      classes: [{ id: "fighter", level: 2 }],
      abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 },
      proficiency: [],
      features: [],
      spells: [],
    },
    book,
  );
  pc = applyPick(pc, { kind: "class", classId: "fighter" }, book);
  assert.equal(pc.level, 3);
  const ask = nextAsk(pc, book);
  assert.equal(ask?.kind, "subclass");
  const options = book.subclasses.filter((s) => s.classId === "fighter");
  assert.equal(options.length, 4);
  assert.ok(options.some((s) => s.id === "champion"));
  assert.ok(options.some((s) => s.id === "battle_master"));
  assert.ok(options.some((s) => s.id === "eldritch_knight"));
  assert.ok(options.some((s) => s.id === "psi_warrior"));
});

test("picking battle_master grants Combat Superiority at 3", () => {
  const book = loadCatalog();
  let pc: ProgressionHero = blankProgress(
    {
      id: "h",
      name: "H",
      level: 3,
      xp: 900,
      species: "human",
      alignment: "neutral",
      classes: [{ id: "fighter", level: 3 }],
      abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 },
      proficiency: [],
      features: ["Fighter Subclass"],
      spells: [],
    },
    book,
  );
  pc.pending = [{ kind: "subclass", atLevel: 3, classId: "fighter" }];
  pc = applyPick(pc, { kind: "subclass", subclassId: "battle_master" }, book);
  assert.equal(pc.classes[0]?.subclass, "battle_master");
  assert.ok(pc.features.some((f) => /combat superiority/i.test(f)));
});

test("frenzy and preserve life scaling match the guide", () => {
  assert.equal(frenzyDice(3), 2);
  assert.equal(frenzyDice(9), 3);
  assert.equal(frenzyDice(16), 4);
  assert.equal(preserveLifePool(5), 25);
});
