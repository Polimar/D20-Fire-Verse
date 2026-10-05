import assert from "node:assert/strict";
import { before, test } from "node:test";
import { actionFolderOf, folderActionLists } from "@d20-fireverse/protocol";
import { actionCategory, actionSummary } from "../src/local/action-menu.js";
import { getAbility } from "../src/local/campaign.js";
import { publicCombat, resolveReaction, startCombat } from "../src/local/combat.js";
import { boot } from "./helpers.js";

before(boot);

function check(id: string) {
  const a = getAbility(id);
  assert.ok(a, `missing ability ${id}`);
  return { category: actionCategory(id, a), summary: actionSummary(id, a) };
}

test("weapon attack summary is range, dice, and damage type", () => {
  const { category, summary } = check("longsword_attack");
  assert.equal(category, "attack");
  assert.match(summary, /Melee/);
  assert.match(summary, /1d8\+STR/);
  assert.match(summary, /slashing/);
});

test("magic missile is a spell auto-hit with slot cost", () => {
  const { category, summary } = check("spell_magic_missile");
  assert.equal(category, "spell");
  assert.match(summary, /Auto-hit/);
  assert.match(summary, /3×/);
  assert.match(summary, /force/);
  assert.match(summary, /slot 1/);
});

test("burning hands is a spell cone save", () => {
  const { category, summary } = check("spell_burning_hands");
  assert.equal(category, "spell");
  assert.match(summary, /15 ft cone/);
  assert.match(summary, /DEX save/);
  assert.match(summary, /3d6 fire/);
  assert.match(summary, /slot 1/);
});

test("mage armor is support spell copy", () => {
  const { category, summary } = check("spell_mage_armor");
  assert.equal(category, "spell");
  assert.match(summary, /13\+DEX/);
  assert.match(summary, /slot 1/);
});

test("dodge is a tactics sentence", () => {
  const { category, summary } = check("std_dodge");
  assert.equal(category, "tactics");
  assert.match(summary, /disadvantage/i);
});

test("dash is a move sentence", () => {
  const { category, summary } = check("std_dash");
  assert.equal(category, "move");
  assert.match(summary, /move again/i);
});

test("healing potion is an item", () => {
  const { category, summary } = check("use_potion_healing");
  assert.equal(category, "item");
  assert.match(summary, /heal 2d4\+2/);
});

test("second wind is a feature; cunning dash is move", () => {
  assert.equal(check("second_wind").category, "feature");
  assert.match(check("second_wind").summary, /1d10/);
  assert.equal(check("cunning_dash").category, "move");
  assert.match(check("cunning_dash").summary, /Bonus/);
});

test("client folders ignore a wrong feature category and split by id", () => {
  const rows = [
    { id: "longsword_attack", name: "Longsword", want: "attack" },
    { id: "spell_magic_missile", name: "Magic Missile", want: "spell" },
    { id: "fire_bolt", name: "Fire Bolt", want: "spell" },
    { id: "std_dodge", name: "Dodge", want: "tactics" },
    { id: "std_dash", name: "Dash", want: "move" },
    { id: "cunning_dash", name: "Cunning Dash", economy: "bonus_action", want: "move" },
    { id: "use_potion_healing", name: "Potion of Healing", want: "item" },
    { id: "second_wind", name: "Second Wind", economy: "bonus_action", want: "bonus" },
  ];
  for (const r of rows) {
    assert.equal(actionFolderOf({ id: r.id, name: r.name, economy: r.economy ?? "action", actionType: "action" }), r.want, r.id);
  }
});

test("dash sits in Move, not Bonus", () => {
  const bonus = [
    { id: "cunning_dash", name: "Dash", economy: "bonus_action" },
    { id: "second_wind", name: "Second Wind", economy: "bonus_action" },
  ];
  const actions = [{ id: "std_dash", name: "Dash", economy: "action" }];
  assert.deepEqual(
    folderActionLists(actions, bonus, "bonus").map((a) => a.id),
    ["second_wind"],
  );
  assert.deepEqual(
    folderActionLists(actions, bonus, "move").map((a) => a.id),
    ["std_dash", "cunning_dash"],
  );
  assert.equal(folderActionLists(actions, bonus, "tactics").length, 0);
});

test("live menus group Quill, Brenna, and Mira into folders with summaries", () => {
  const cases: Array<{ id: string; name: string; attack: string; extra: string; extraCat: string }> = [
    { id: "quill_ashmere", name: "Quill Ashmere", attack: "quarterstaff_attack", extra: "spell_magic_missile", extraCat: "spell" },
    { id: "brenna_ironveal", name: "Brenna Ironveal", attack: "longsword_attack", extra: "second_wind", extraCat: "feature" },
    { id: "mira_softstep", name: "Mira Softstep", attack: "shortbow_attack", extra: "cunning_dash", extraCat: "move" },
  ];
  for (const pc of cases) {
    const c = startCombat("cellar_rats", [{ playerId: "P1", displayName: "H", characterId: pc.id, characterName: pc.name }]);
    const hero = c.tokens.find((t) => t.kind === "pc")!;
    c.turnIndex = c.turnOrder.indexOf(hero.id);
    hero.hasAction = true;
    hero.hasBonusAction = true;
    while (c.pending) resolveReaction(c, c.pending.playerId, false);
    const pub = publicCombat(c, "P1");
    const acts = pub.actionMenu?.actions ?? [];
    const bonus = pub.actionMenu?.bonusActions ?? [];
    const all = [...acts, ...bonus];
    assert.ok(all.every((a) => a.summary && a.category), `${pc.name} missing summary/category`);
    assert.ok(acts.some((a) => a.id === pc.attack && a.category === "attack"), pc.attack);
    const extra = all.find((a) => a.id === pc.extra);
    assert.ok(extra && extra.category === pc.extraCat, pc.extra);
    assert.ok(acts.some((a) => a.id === "std_dodge" && a.category === "tactics"));
    assert.ok(acts.some((a) => a.id === "std_dash" && a.category === "move"));
  }
});
