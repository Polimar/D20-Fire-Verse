import assert from "node:assert/strict";
import { before, test } from "node:test";
import { commitBuilderDraft } from "../src/local/builder-commit.js";
import { classStarters, backgroundStarters, resolveClassStarter } from "../src/local/starter-equipment.js";
import { resolveContent, setContentEnabled } from "../src/local/content-catalog.js";
import { createUser, openAuth } from "../src/local/auth.js";
import { wallet } from "../src/local/hero.js";
import { boot } from "./helpers.js";

before(() => {
  boot();
  openAuth();
});

test("SRD review parses starting equipment for all 12 SRD classes", () => {
  const starters = classStarters();
  assert.equal(starters.length, 12);
  for (const row of starters) {
    assert.ok(row.options.length >= 2, `${row.classId} needs at least options A and B`);
    const ids = row.options.map((o) => o.id);
    assert.ok(ids.includes("A") && ids.includes("B"), `${row.classId} options ${ids.join(",")}`);
  }
});

test("SRD review parses background equipment A/B for all origins", () => {
  const starters = backgroundStarters();
  assert.ok(starters.length >= 16, `expected >=16 origins, got ${starters.length}`);
  for (const row of starters) {
    assert.ok(row.options.length >= 2, `${row.backgroundId} needs A and B`);
  }
});

test("fighter gold bundle credits wallet on commit", () => {
  for (const [kind, id] of [
    ["class", "fighter"],
    ["species", "human"],
    ["background", "soldier"],
    ["feat", "defense"],
  ] as const) {
    if (kind === "feat") resolveContent(kind, id, { adminNote: "starter gold" });
    setContentEnabled(kind, id, true);
  }
  const pick = resolveClassStarter("fighter", "C");
  assert.ok(pick && pick.gold > 0, "fighter option C should include GP");
  const player = createUser("starter_gp", "password", "player");
  const before = wallet(player.id).gold;
  commitBuilderDraft(player, {
    name: "Gold Hero",
    classId: "fighter",
    speciesId: "human",
    backgroundId: "soldier",
    method: "standard_array",
    baseAbilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    classSkills: ["perception", "survival"],
    fightingStyleFeatId: "defense",
    equipChoice: "C",
    backgroundEquipChoice: "B",
    backgroundAsi: { mode: "plus2plus1", plus2: "str", plus1: "con" },
  });
  const after = wallet(player.id).gold;
  assert.ok(after > before, "commit should credit class and/or background gold");
});
