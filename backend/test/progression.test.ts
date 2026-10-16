import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  applyPick,
  blankProgress,
  hpGain,
  maxSpellLevel,
  multiclassSlots,
  nextAsk,
  type CatalogSlice,
  type ProgressionHero,
} from "@d20-fireverse/rules";
import { CONTENT_ROOT } from "../src/local/paths.js";

function load(name: string): { entries: Array<Record<string, unknown>> } {
  return JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, "srd-5.2.1", name), "utf8")) as { entries: Array<Record<string, unknown>> };
}

const catalog = (): CatalogSlice => ({
  classes: load("classes.json").entries as CatalogSlice["classes"],
  subclasses: load("subclasses.json").entries as CatalogSlice["subclasses"],
  feats: load("feats.json").entries as CatalogSlice["feats"],
  spells: load("spells.json").entries as CatalogSlice["spells"],
  species: load("species.json").entries as CatalogSlice["species"],
  xpThresholds: [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000],
});

function hero(classId: string, xp = 0): ProgressionHero {
  return blankProgress(
    {
      id: "h",
      name: "H",
      level: 1,
      xp,
      species: "human",
      alignment: "neutral",
      classes: [{ id: classId, level: 1 }],
      abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 },
      proficiency: [],
      features: [],
      spells: [],
    },
    catalog(),
  );
}

test("average hit points add the die average and Constitution", () => {
  const fighter = catalog().classes.find((row) => row.id === "fighter")!;
  assert.equal(hpGain(fighter, 14), Math.floor(10 / 2) + 1 + 2);
});

test("maxSpellLevel follows class spell slot and pact tables", () => {
  const book = catalog();
  const wizard = book.classes.find((row) => row.id === "wizard")!;
  const warlock = book.classes.find((row) => row.id === "warlock")!;
  assert.equal(maxSpellLevel(wizard, 1), 1);
  assert.equal(maxSpellLevel(wizard, 5), 3);
  assert.equal(maxSpellLevel(warlock, 1), 1);
  assert.equal(maxSpellLevel(warlock, 5), 3);
});

test("a second level is one class choice, not a repeated subclass", () => {
  const book = catalog();
  let pc = hero("fighter", 300);
  assert.equal(nextAsk(pc, book)?.kind, "class");
  pc = applyPick(pc, { kind: "class", classId: "fighter" }, book);
  assert.equal(pc.level, 2);
  assert.equal(pc.classes[0]?.level, 2);
  assert.equal(pc.pending.length, 0);
});

test("fighter 5 / wizard 3 uses the full-caster slot row for the summed caster level", () => {
  const book = catalog();
  const pc = hero("fighter");
  pc.classes = [
    { id: "fighter", level: 5 },
    { id: "wizard", level: 3 },
  ];
  const slots = multiclassSlots(pc, book);
  assert.equal(slots.slots["1"], 4);
  assert.equal(slots.slots["2"], 2);
});

test("warlock pact slots stay beside the multiclass table", () => {
  const book = catalog();
  const pc = hero("warlock");
  pc.classes = [
    { id: "warlock", level: 5 },
    { id: "fighter", level: 2 },
  ];
  const slots = multiclassSlots(pc, book);
  assert.equal(slots.pact?.count, 2);
  assert.equal(slots.pact?.slotLevel, 3);
});

test("two +1 choices stay at or under 20", () => {
  const book = catalog();
  let pc = hero("fighter", 6500);
  pc.level = 3;
  pc.classes[0]!.level = 3;
  pc.pending = [{ kind: "asi", atLevel: 4, classId: "fighter", epic: false }];
  pc = applyPick(pc, { kind: "asi", mode: "plus1", abilities: ["str", "con"] }, book);
  assert.equal(pc.abilities.str, 17);
  assert.equal(pc.abilities.con, 15);
});

test("berserker at 3 grants Frenzy only, not later path features", () => {
  const book = catalog();
  let pc = hero("barbarian", 900);
  pc = applyPick(pc, { kind: "class", classId: "barbarian" }, book);
  pc = applyPick(pc, { kind: "class", classId: "barbarian" }, book);
  assert.equal(nextAsk(pc, book)?.kind, "subclass");
  pc = applyPick(pc, { kind: "subclass", subclassId: "path_of_the_berserker" }, book);
  assert.ok(pc.features.includes("Frenzy"));
  assert.equal(pc.features.includes("Retaliation"), false);
  assert.equal(pc.features.includes("Intimidating Presence"), false);
});

test("a class cap blocks the next level in that class", () => {
  const book = catalog();
  book.classes = book.classes.map((row) => (row.id === "fighter" ? { ...row, cap: 2 } : row));
  let pc = hero("fighter", 900);
  pc = applyPick(pc, { kind: "class", classId: "fighter" }, book);
  assert.equal(pc.level, 2);
  assert.throws(() => applyPick(pc, { kind: "class", classId: "fighter" }, book), /CLASS_LEVEL_CAP/);
});

test("a class without spellProgression cannot take spell choices", () => {
  const book = catalog();
  const pc = hero("fighter");
  pc.pending = [{ kind: "spells", atLevel: 2, classId: "fighter", cantrips: 0, spells: 1 }];
  assert.throws(() => applyPick(pc, { kind: "spells", spells: ["magic_missile"], cantrips: [] }, book), /NO_SPELL_PROGRESSION/);
});
