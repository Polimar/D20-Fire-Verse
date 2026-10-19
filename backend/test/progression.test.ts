import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  applyPick,
  blankProgress,
  catchUpOrderAsk,
  firstLevel,
  hpGain,
  maxSpellLevel,
  multiclassSlots,
  nextAsk,
  type CatalogSlice,
  type ProgressionHero,
} from "@d20-fireverse/rules";
import { freeCast } from "../src/local/class-runtime.js";
import type { CombatToken } from "../src/local/combat.js";
import { refreshMenus } from "../src/local/srd-sheet.js";
import type { Pregen } from "../src/local/campaign.js";
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
  metamagic: load("metamagic.json").entries as CatalogSlice["metamagic"],
  invocations: load("invocations.json").entries as CatalogSlice["invocations"],
  languages: load("languages.json").entries as CatalogSlice["languages"],
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
  pc.pending = [{ kind: "spells", atLevel: 2, classId: "fighter", cantrips: 0, spells: 1, maxSpellLevel: 1 }];
  assert.throws(() => applyPick(pc, { kind: "spells", spells: ["magic_missile"], cantrips: [] }, book), /NO_SPELL_PROGRESSION/);
});

test("wizard level 2 asks for scholar expertise then spellbook and prepared picks", () => {
  const book = catalog();
  let pc = hero("wizard", 300);
  pc.abilities = { ...pc.abilities, int: 16 };
  pc.proficiency = ["arcana", "investigation"];
  pc.cantrips = ["fire_bolt", "light", "mage_hand"];
  pc.spells = ["mage_armor", "shield", "magic_missile", "sleep"];
  pc.spellbook = ["mage_armor", "shield", "magic_missile", "sleep", "detect_magic", "burning_hands"];
  pc.pending = [];
  pc = applyPick(pc, { kind: "class", classId: "wizard" }, book);
  assert.equal(pc.level, 2);
  assert.equal(pc.pending[0]?.kind, "expertise");
  const exp = pc.pending[0];
  assert.ok(exp && exp.kind === "expertise");
  if (exp && exp.kind === "expertise") assert.equal(exp.count, 1);
  pc = applyPick(pc, { kind: "expertise", skills: ["arcana"] }, book);
  assert.ok(pc.features.includes("expertise:arcana"));
  const spellAsk = pc.pending[0];
  assert.equal(spellAsk?.kind, "spells");
  assert.ok(spellAsk && spellAsk.kind === "spells");
  if (spellAsk && spellAsk.kind === "spells") {
    assert.equal(spellAsk.spells, 1);
    assert.equal(spellAsk.spellbook, 2);
  }
});

test("bard level 2 asks for expertise and a prepared spell", () => {
  const book = catalog();
  let pc = hero("bard", 300);
  pc.proficiency = ["performance", "persuasion", "insight"];
  pc.cantrips = ["vicious_mockery", "mage_hand"];
  pc.spells = ["charm_person", "healing_word", "dissonant_whispers", "faerie_fire"];
  pc.pending = [];
  pc = applyPick(pc, { kind: "class", classId: "bard" }, book);
  assert.equal(pc.level, 2);
  assert.ok(pc.pending.some((p) => p.kind === "expertise" && p.count === 2));
  assert.ok(pc.pending.some((p) => p.kind === "spells" && p.spells === 1));
});

test("level-up spell delta is not pruned just because the sheet already has many prepared spells", () => {
  const book = catalog();
  const pc = hero("wizard", 300);
  pc.level = 2;
  pc.classes[0]!.level = 2;
  pc.cantrips = ["fire_bolt", "light", "mage_hand"];
  pc.spells = ["mage_armor", "shield", "magic_missile", "sleep", "thunderwave"];
  pc.spellbook = ["mage_armor", "shield", "magic_missile", "sleep", "detect_magic", "burning_hands"];
  pc.pending = [{ kind: "spells", atLevel: 2, classId: "wizard", cantrips: 0, spells: 1, spellbook: 2, maxSpellLevel: 1 }];
  assert.equal(nextAsk(pc, book)?.kind, "spells");
});

test("cleric L1 queues Divine Order; catch-up if missing", () => {
  const book = catalog();
  let pc = firstLevel(hero("cleric"), book);
  assert.ok(pc.pending.some((p) => p.kind === "feature_choice" && "featureId" in p && p.featureId === "order"));
  const orderAsk = pc.pending.find((p) => p.kind === "feature_choice")!;
  assert.ok(orderAsk.kind === "feature_choice" && orderAsk.options.includes("protector"));
  pc.pending = [orderAsk];
  pc = applyPick(pc, { kind: "feature_choice", featureId: "order", picks: ["protector"] }, book);
  assert.ok(pc.features.includes("order:protector"));
  const orphan = hero("cleric");
  orphan.features = ["Divine Order"];
  orphan.classes[0]!.level = 1;
  orphan.pending = [];
  const catchUp = catchUpOrderAsk(orphan, book);
  assert.equal(catchUp?.kind, "feature_choice");
});

test("sorcerer L2 asks for 2 metamagic; L10 asks for +2", () => {
  const book = catalog();
  let pc = hero("sorcerer", 300);
  pc.abilities = { ...pc.abilities, cha: 16 };
  pc.cantrips = ["fire_bolt", "light", "prestidigitation", "shocking_grasp"];
  pc.spells = ["magic_missile", "shield"];
  pc.pending = [];
  pc = applyPick(pc, { kind: "class", classId: "sorcerer" }, book);
  assert.equal(pc.level, 2);
  const meta = pc.pending.find((p) => p.kind === "metamagic");
  assert.ok(meta && meta.kind === "metamagic" && meta.count === 2, JSON.stringify(pc.pending));
  pc.pending = [meta];
  pc = applyPick(pc, { kind: "metamagic", options: ["quickened", "empowered"] }, book);
  assert.ok(pc.features.includes("metamagic:quickened"));
  assert.ok(pc.features.includes("metamagic:empowered"));
  // L10 metamagic gain from followUps (skip catch-up by matching table totals).
  pc.level = 9;
  pc.classes[0]!.level = 9;
  pc.xp = 64000;
  pc.cantrips = book.spells.filter((s) => s.classes.includes("sorcerer") && s.level === 0).slice(0, 5).map((s) => s.id);
  pc.spells = book.spells.filter((s) => s.classes.includes("sorcerer") && s.level > 0 && s.level <= 5).slice(0, 14).map((s) => s.id);
  pc.pending = [];
  pc = applyPick(pc, { kind: "class", classId: "sorcerer" }, book);
  const meta10 = pc.pending.find((p) => p.kind === "metamagic");
  assert.ok(meta10 && meta10.kind === "metamagic" && meta10.count === 2, JSON.stringify(pc.pending));
});

test("warlock L1 asks for 1 invocation; L2 asks for +2; L11 arcanum exact level 6", () => {
  const book = catalog();
  let pc = firstLevel(hero("warlock"), book);
  const inv1 = pc.pending.find((p) => p.kind === "invocation");
  assert.ok(inv1 && inv1.kind === "invocation" && inv1.count === 1, JSON.stringify(pc.pending));
  pc.pending = [inv1];
  pc = applyPick(pc, { kind: "invocation", options: ["armor_of_shadows"] }, book);
  assert.ok(pc.features.includes("invocation:armor_of_shadows"));
  pc.cantrips = ["eldritch_blast", "prestidigitation"];
  pc.spells = ["hex", "charm_person"];
  pc.xp = 300;
  pc.pending = [];
  pc = applyPick(pc, { kind: "class", classId: "warlock" }, book);
  const inv2 = pc.pending.find((p) => p.kind === "invocation");
  assert.ok(inv2 && inv2.kind === "invocation" && inv2.count === 2, JSON.stringify(pc.pending));
  pc.level = 10;
  pc.classes[0]!.level = 10;
  pc.xp = 85000;
  pc.cantrips = book.spells.filter((s) => s.classes.includes("warlock") && s.level === 0).slice(0, 4).map((s) => s.id);
  pc.spells = book.spells.filter((s) => s.classes.includes("warlock") && s.level > 0 && s.level <= 5).slice(0, 10).map((s) => s.id);
  pc.pending = [];
  while (pc.features.filter((f) => f.startsWith("invocation:")).length < 7) {
    pc.features.push(`invocation:filler_${pc.features.length}`);
  }
  pc = applyPick(pc, { kind: "class", classId: "warlock" }, book);
  const arc = pc.pending.find((p) => p.kind === "spells" && "purpose" in p && p.purpose === "arcanum");
  assert.ok(arc && arc.kind === "spells" && arc.exactLevel === 6 && arc.spells === 1, JSON.stringify(pc.pending));
});

test("bard L10 Magical Secrets pools from four lists", () => {
  const book = catalog();
  let pc = hero("bard", 64000);
  pc.level = 9;
  pc.classes[0]!.level = 9;
  pc.abilities = { ...pc.abilities, cha: 16 };
  pc.proficiency = ["performance", "persuasion", "insight", "deception"];
  pc.features = ["expertise:performance", "expertise:persuasion", "expertise:insight", "expertise:deception"];
  pc.cantrips = ["vicious_mockery", "mage_hand", "prestidigitation"];
  pc.spells = [
    "charm_person", "healing_word", "dissonant_whispers", "faerie_fire", "invisibility", "suggestion",
    "hypnotic_pattern", "major_image", "dimension_door", "greater_invisibility", "hold_monster", "seeming",
    "animate_objects", "mislead",
  ];
  pc.pending = [];
  pc = applyPick(pc, { kind: "class", classId: "bard" }, book);
  const secrets = pc.pending.find((p) => p.kind === "spells" && "purpose" in p && p.purpose === "magical_secrets");
  assert.ok(secrets && secrets.kind === "spells", JSON.stringify(pc.pending));
  assert.deepEqual(secrets.lists, ["bard", "cleric", "druid", "wizard"]);
});

test("ranger L2 asks expertise, languages, and fighting style including Druidic Warrior", () => {
  const book = catalog();
  let pc = hero("ranger", 300);
  pc.proficiency = ["survival", "perception", "stealth"];
  // Satisfy L1 prepared catch-up so the class pick is offered.
  pc.spells = book.spells.filter((s) => s.classes.includes("ranger") && s.level === 1).slice(0, 2).map((s) => s.id);
  pc.pending = [];
  pc = applyPick(pc, { kind: "class", classId: "ranger" }, book);
  assert.ok(pc.pending.some((p) => p.kind === "expertise"), JSON.stringify(pc.pending));
  assert.ok(pc.pending.some((p) => p.kind === "language" && p.count === 2));
  assert.ok(pc.pending.some((p) => p.kind === "fighting_style"));
  while (pc.pending[0] && pc.pending[0].kind !== "fighting_style") {
    if (pc.pending[0].kind === "expertise") {
      pc = applyPick(pc, { kind: "expertise", skills: ["survival"] }, book);
    } else if (pc.pending[0].kind === "language") {
      pc = applyPick(pc, { kind: "language", languages: ["elvish", "dwarvish"] }, book);
    } else if (pc.pending[0].kind === "spells") {
      const ask = pc.pending[0];
      const cantrips = book.spells.filter((s) => s.classes.includes("ranger") && s.level === 0 && !pc.cantrips.includes(s.id)).slice(0, ask.cantrips).map((s) => s.id);
      const spells = book.spells
        .filter((s) => s.classes.includes("ranger") && s.level > 0 && s.level <= ask.maxSpellLevel && !pc.spells.includes(s.id))
        .slice(0, ask.spells)
        .map((s) => s.id);
      pc = applyPick(pc, { kind: "spells", cantrips, spells }, book);
    } else {
      break;
    }
  }
  assert.equal(pc.pending[0]?.kind, "fighting_style");
  pc = applyPick(pc, { kind: "fighting_style", featId: "druidic_warrior" }, book);
  assert.ok(pc.features.includes("druidic_warrior"));
  assert.ok(pc.pending.some((p) => p.kind === "spells" && "purpose" in p && p.purpose === "warrior_cantrips"));
});

test("freeCast only for chosen mastery / arcanum spell ids", () => {
  const token = {
    features: ["mastery:1:magic_missile", "mastery:2:scorching_ray", "arcanum:6:circle_of_death", "signature:fireball"],
    abilityUses: { signature_cast: 2, arcanum: 1, arcanum_6: 1 },
  } as CombatToken;
  assert.equal(freeCast(token, 1, "magic_missile"), true);
  assert.equal(freeCast(token, 1, "shield"), false);
  assert.equal(freeCast(token, 2, "scorching_ray"), true);
  assert.equal(freeCast(token, 3, "fireball"), true);
  assert.equal(freeCast(token, 3, "lightning_bolt"), false);
  assert.equal(freeCast(token, 6, "circle_of_death"), true);
  assert.equal(freeCast(token, 6, "disintegrate"), false);
});

test("quicken menu requires metamagic:quickened", () => {
  const pregen = {
    id: "s",
    name: "Sorc",
    class: "sorcerer",
    level: 2,
    abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 16 },
  } as Pregen;
  const lookup = (id: string) =>
    id === "spell_fire_bolt"
      ? ({ id, name: "Fire Bolt", actionType: "action", level: 0, effects: [] } as never)
      : undefined;
  const without = {
    kind: "pc",
    sheetDriven: true,
    actionIds: [] as string[],
    bonusActionIds: [] as string[],
    cantrips: ["spell_fire_bolt"],
    spells: [] as string[],
    sorceryPoints: 2,
    features: [] as string[],
    inventory: [] as string[],
  } as CombatToken;
  refreshMenus(without, pregen, lookup);
  assert.ok(!(without.bonusActionIds ?? []).some((id) => id.startsWith("quicken:")));
  const withMeta = {
    kind: "pc",
    sheetDriven: true,
    actionIds: [] as string[],
    bonusActionIds: [] as string[],
    cantrips: ["spell_fire_bolt"],
    spells: [] as string[],
    sorceryPoints: 2,
    features: ["metamagic:quickened"],
    inventory: [] as string[],
  } as CombatToken;
  refreshMenus(withMeta, pregen, lookup);
  assert.ok((withMeta.bonusActionIds ?? []).some((id) => id.startsWith("quicken:")), JSON.stringify(withMeta.bonusActionIds));
});
