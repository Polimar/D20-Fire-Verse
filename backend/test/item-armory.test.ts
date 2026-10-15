import assert from "node:assert/strict";
import { test } from "node:test";
import { itemArmoryCopy } from "@d20-fireverse/rules";

test("item armory copy summarizes weapons and mastery", () => {
  const copy = itemArmoryCopy({
    id: "greataxe",
    name: "Greataxe",
    rarity: "common",
    slot: "mainhand",
    weaponMastery: "cleave",
    effects: [],
    weapon: {
      category: "martial_melee",
      damage: "1d12",
      damageType: "slashing",
      properties: ["Heavy", "Two-Handed"],
    },
  });
  assert.match(copy.description, /1d12 slashing/);
  assert.match(copy.equippedBonus, /Cleave/);
});
