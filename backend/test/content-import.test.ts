import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { ItemDef, MonsterDef as CatalogMonster, SpellDef } from "@d20-fireverse/content-schema";
import { engineView } from "../src/local/content-engine.js";
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

type Entries<T> = { entries: T[] };
const readPack = <T>(file: string): T[] =>
  (JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, "srd-5.2.1", file), "utf8")) as Entries<T>).entries;

test("monster stat blocks keep every action with its dice, to-hit, and save", () => {
  const aboleth = readPack<CatalogMonster>("monsters.json").find((m) => m.id === "aboleth");
  assert.ok(aboleth);
  assert.deepEqual(aboleth.abilities, { str: 21, dex: 9, con: 15, int: 18, wis: 15, cha: 18 });
  assert.equal(aboleth.hitDice, "20d10+40");
  const tentacle = aboleth.actions?.find((a) => a.name === "Tentacle");
  assert.deepEqual(tentacle?.attack, { kind: "melee", bonus: 9, reachFt: 15 });
  assert.deepEqual(tentacle?.damage, [{ dice: "2d6+5", damageType: "bludgeoning", average: 12 }]);
  const memories = aboleth.actions?.find((a) => a.name === "Consume Memories");
  assert.deepEqual(memories?.save, { ability: "int", dc: 16, onSuccess: "half" });
  assert.equal(aboleth.legendaryUses, 3);
});

test("magic items say what they do when equipped, and flag what the engine cannot check", () => {
  const items = readPack<ItemDef>("items/magic.json");
  assert.deepEqual(items.find((i) => i.id === "armor_plus_2")?.effects, [{ kind: "ac_bonus", amount: 2 }]);
  const review = JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, "srd-5.2.1", "review", "item", "flame_tongue.json"), "utf8")) as {
    status: string;
    ambiguities: Array<{ field: string; options: Array<{ label: string }> }>;
  };
  assert.equal(review.status, "needs_review");
  assert.ok(review.ambiguities.some((a) => a.options.some((o) => /2d6 fire/i.test(o.label))));
});

test("the engine panel reports what combat really runs", () => {
  const spells = readPack<SpellDef>("spells.json");
  const healing = engineView("spell", "healing_word", spells.find((s) => s.id === "healing_word"));
  assert.equal(healing?.state, "runs");
  assert.ok(healing?.lines.some((l) => /heals 2d4/.test(l.detail)));
  const drift = [
    ...spells.map((s) => [s.id, engineView("spell", s.id, s)?.mismatches ?? []] as const),
    ...readPack<CatalogMonster>("monsters.json").map((m) => [m.id, engineView("monster", m.id, m)?.mismatches ?? []] as const),
  ].filter(([, list]) => list.length);
  assert.deepEqual(drift, [], "combat dice, saves, and levels match SRD 5.2.1");

  const fireball = engineView("spell", "fireball", readPack<SpellDef>("spells.json").find((s) => s.id === "fireball"));
  assert.equal(fireball?.state, "sheet");

  const aboleth = engineView("monster", "aboleth", readPack<CatalogMonster>("monsters.json").find((m) => m.id === "aboleth"));
  assert.equal(aboleth?.state, "runs");
  assert.ok(aboleth?.lines.some((l) => l.label === "Action: Tentacle" && l.ok && /2d6\+5/.test(l.detail)));

  const plate = engineView("item", "armor_plus_1", readPack<ItemDef>("items/magic.json").find((i) => i.id === "armor_plus_1"));
  assert.equal(plate?.state, "runs", "account heroes wear it over a mundane base");
  assert.ok(plate?.lines.some((l) => l.label === "Base" && /Plate Armor/.test(l.detail)));
  const crab = engineView("item", "apparatus_of_the_crab", readPack<ItemDef>("items/magic.json").find((i) => i.id === "apparatus_of_the_crab"));
  assert.equal(crab?.state, "sheet", "no typed effects, nothing for a fight to apply");
});
