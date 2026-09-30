import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { parseSrdMarkdown, srdMonsterId } from "../src/local/srd-monsters.js";

const here = path.dirname(fileURLToPath(import.meta.url));

test("SRD parser reads Goblin Minion dagger and Nimble Escape", () => {
  const md = fs.readFileSync(path.join(here, "fixtures", "srd-goblin.min.md"), "utf8");
  const { monsters, abilities } = parseSrdMarkdown(md, new Set(["spell_hold_person"]));
  const gob = monsters[srdMonsterId("Goblin Minion")];
  assert.ok(gob);
  assert.equal(gob.ac, 12);
  assert.equal(gob.hp, 7);
  assert.equal(gob.speedCells, 6);
  assert.equal(gob.abilities.dex, 15);
  const dagger = Object.values(abilities).find((a) => a.name === "Dagger");
  assert.ok(dagger);
  assert.equal(dagger.effects[0]?.type, "attack");
  assert.equal(dagger.effects[0]?.attackBonus, 4);
  assert.equal((dagger.effects[0]?.damage as Array<{ dice: string }>)[0]?.dice, "1d4+2");
  const escape = Object.values(abilities).find((a) => a.name === "Nimble Escape");
  assert.equal(escape?.effects[0]?.type, "disengage");
  assert.ok(gob.bonusActions?.length);
});

test("SRD parser reads Multiattack, Recharge, and mapped Spellcasting", () => {
  const md = fs.readFileSync(path.join(here, "fixtures", "srd-sample.min.md"), "utf8");
  const { monsters, abilities } = parseSrdMarkdown(md, new Set(["spell_hold_person"]));
  const war = monsters[srdMonsterId("Goblin Warrior")];
  assert.ok(war?.multiattack && war.multiattack.length >= 2);
  const mage = monsters[srdMonsterId("Test Mage")];
  assert.ok(mage?.actions.includes("spell_hold_person"));
  const breath = Object.values(abilities).find((a) => a.name === "Fire Breath");
  assert.equal(breath?.effects[0]?.type, "save");
  assert.ok(breath?.effects[0]?.recharge);
});
