import assert from "node:assert/strict";
import { test, before } from "node:test";
import { randomUUID } from "node:crypto";
import { createUser, openAuth, accountDb } from "../src/local/auth.js";
import { createCustomCharacter, type ChargenDraft } from "../src/local/chargen.js";
import { ensureForgeContentDefaults } from "../src/local/content-catalog.js";
import { listPregens } from "../src/local/campaign.js";
import { migrateCustomCharacters } from "../src/local/migrate-custom.js";
import { markMasterySwapReady, swapWeaponMastery } from "../src/local/mastery-swap.js";
import { getHero } from "../src/local/hero.js";
import { boot } from "./helpers.js";

before(() => {
  boot();
  openAuth();
  ensureForgeContentDefaults();
});

function fighter(name: string): ChargenDraft {
  return {
    name,
    level: 1,
    raceId: "human",
    classId: "fighter",
    backgroundId: "soldier",
    method: "standard_array",
    baseAbilities: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
    classSkills: ["perception", "survival"],
    fightingStyle: "defense",
  };
}

test("a legacy custom file becomes a hero and leaves the public list", () => {
  const user = createUser(`mig${randomUUID().replace(/-/g, "").slice(0, 8)}`, "password", "player");
  const custom = createCustomCharacter(fighter("Old Aldric"), undefined, user.id);
  assert.equal(listPregens(user.id).some((p) => p.id === custom.id), false);
  const report = migrateCustomCharacters();
  assert.equal(report.failed.filter((line) => line.includes("Old Aldric") || line.includes(custom.id)).join(";"), "");
  assert.ok(report.migrated >= 1);
  const heroes = listPregens(user.id).filter((p) => p.name === "Old Aldric");
  assert.equal(heroes.length, 1);
  assert.ok(heroes[0]!.id.startsWith("hero_"));
});

test("mastery swaps after a long rest and legacy ritual API is retired", () => {
  const user = createUser(`rit${randomUUID().replace(/-/g, "").slice(0, 8)}`, "password", "admin");
  const hero = createCustomCharacter(fighter("Rite Wren"), undefined, user.id);
  const report = migrateCustomCharacters();
  const mine = report.failed.filter((line) => line.includes("Rite") || line.includes(hero.id));
  assert.equal(mine.join(";"), "");
  const row = listPregens(user.id).find((p) => p.name === "Rite Wren");
  assert.ok(row);
  accountDb().prepare("UPDATE heroes SET spellbook_json = ? WHERE id = ?").run(JSON.stringify(["alarm"]), row!.id);
  const stored = getHero(row!.id);
  assert.ok(stored);
  stored!.classes = [{ id: "wizard", level: 1 }];
  accountDb().prepare("UPDATE heroes SET classes_json = ? WHERE id = ?").run(JSON.stringify(stored!.classes), row!.id);
  assert.throws(() => swapWeaponMastery(user.id, row!.id, "nick", "push"), /MASTERY_LOCKED/);
  markMasterySwapReady(row!.id);
  const meta = JSON.parse(
    (accountDb().prepare("SELECT builder_meta_json FROM heroes WHERE id = ?").get(row!.id) as { builder_meta_json?: string }).builder_meta_json ?? "{}",
  ) as { masteries?: string[] };
  const drop = meta.masteries?.[0] ?? "cleave";
  const take = drop === "nick" ? "push" : "nick";
  const swapped = swapWeaponMastery(user.id, row!.id, drop, take);
  assert.ok(swapped.masteries.includes(take));
  assert.throws(() => swapWeaponMastery(user.id, row!.id, take, "sap"), /MASTERY_LOCKED/);
  void hero;
});
