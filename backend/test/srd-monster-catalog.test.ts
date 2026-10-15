import assert from "node:assert/strict";
import { test } from "node:test";
import { compileCatalogMonsters, srdMonsterId } from "../src/local/srd-monsters.js";

test("all 235 SRD monsters compile into a fightable stat block", () => {
  const { monsters, abilities, skipped } = compileCatalogMonsters();
  const list = Object.values(monsters);
  assert.equal(list.length, 235);
  const letters = new Set(list.map((m) => m.name[0]!.toUpperCase()));
  assert.ok(letters.has("A") && letters.has("M") && letters.has("N") && letters.has("Z"));
  for (const mon of list) {
    assert.ok(mon.hp > 0, mon.name);
    assert.ok(mon.ac > 0, mon.name);
    assert.ok(mon.actions.length >= 1, mon.name);
    for (const id of mon.actions) assert.ok(abilities[id], id);
  }
  assert.ok(monsters[srdMonsterId("Aboleth")]);
  assert.ok(monsters[srdMonsterId("Zombie")]);
  assert.ok(skipped.length < 40, `fallback strikes: ${skipped.join(", ")}`);
});
