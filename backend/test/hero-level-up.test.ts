import assert from "node:assert/strict";
import { before, test } from "node:test";
import { accountDb, createUser, openAuth } from "../src/local/auth.js";
import { commitBuilderDraft } from "../src/local/builder-commit.js";
import { resolveContent, setContentEnabled } from "../src/local/content-catalog.js";
import { applyLevelUp, getHero, levelOptions } from "../src/local/hero.js";
import { boot } from "./helpers.js";

before(() => {
  boot();
  openAuth();
});

test("fighter hero level-up to 2 via progression picks and keeps split spell columns", () => {
  for (const [kind, id] of [
    ["class", "fighter"],
    ["species", "human"],
    ["background", "soldier"],
    ["feat", "defense"],
  ] as const) {
    if (kind === "feat") resolveContent(kind, id, { adminNote: "level-up test" });
    setContentEnabled(kind, id, true);
  }
  const player = createUser("lvlup01", "password", "player");
  const hero = commitBuilderDraft(player, {
    name: "Level Test",
    classId: "fighter",
    speciesId: "human",
    backgroundId: "soldier",
    method: "standard_array",
    baseAbilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    classSkills: ["perception", "survival"],
    fightingStyleFeatId: "defense",
    equipChoice: "A",
    backgroundAsi: { mode: "plus2plus1", plus2: "str", plus1: "con" },
    cantrips: [],
    spellsPrepared: [],
  });
  accountDb().prepare("UPDATE heroes SET xp = 300, pending_choices_json = '[]' WHERE id = ?").run(hero.id);
  const opts = levelOptions(hero.id);
  assert.equal(opts.ask?.kind, "class");
  const leveled = applyLevelUp(hero.id, { kind: "class", classId: "fighter" });
  assert.equal(leveled.level, 2);
  assert.equal(leveled.classes[0]?.level, 2);
  assert.deepEqual(leveled.cantrips, []);
  assert.deepEqual(leveled.spellsPrepared, []);
});
