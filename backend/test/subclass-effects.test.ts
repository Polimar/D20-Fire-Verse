import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SUBCLASS_ACTION_IDS,
  SUBCLASS_IDS,
  WIRED_SUBCLASS_FEATURE_SLUGS,
  absorbArcaneWard,
  arcaneWardMax,
  castSubclassFeature,
  danceUnarmoredAc,
  divineFuryExtra,
  dreadAmbusherDamage,
  dreadfulStrikesDie,
  frenzyDice,
  healingLightDice,
  moonWildShapeTempHp,
  preserveLifePool,
  primalCompanionHp,
  psiDieCount,
  rollWildMagicSurge,
  seedSubclassResources,
  setSubclassChoice,
  subclassDamageRider,
  subclassMenus,
  wildMagicSurgeTable,
  type Subclassful,
} from "../src/local/subclass-effects.js";

function token(features: string[]): Subclassful {
  return {
    name: "Hero",
    features,
    kit: { flags: features },
    hp: 40,
    maxHp: 40,
    ac: 15,
    speedCells: 6,
    x: 0,
    y: 0,
    abilityUses: {},
  };
}

test("48 subclass ids and wired feature coverage", () => {
  assert.equal(SUBCLASS_IDS.length, 48);
  assert.ok(WIRED_SUBCLASS_FEATURE_SLUGS.length >= 200);
  assert.ok(SUBCLASS_ACTION_IDS.length >= 60);
});

test("numeric helpers match the guide", () => {
  assert.equal(frenzyDice(8), 2);
  assert.equal(frenzyDice(9), 3);
  assert.equal(frenzyDice(16), 4);
  assert.deepEqual(divineFuryExtra(6), { dice: "1d6", flat: 3 });
  assert.equal(preserveLifePool(8), 40);
  assert.equal(moonWildShapeTempHp(4), 12);
  assert.equal(danceUnarmoredAc(3, 2), 15);
  assert.equal(psiDieCount(3), 6);
  assert.equal(healingLightDice(5), 6);
  assert.equal(primalCompanionHp(5, 2), 27);
  assert.equal(arcaneWardMax(5, 3), 13);
  assert.equal(dreadAmbusherDamage(), "1d8");
  assert.equal(dreadfulStrikesDie(10), "1d4");
  assert.equal(dreadfulStrikesDie(11), "1d6");
});

test("wild magic table is playable", () => {
  assert.equal(wildMagicSurgeTable().length, 8);
  const once = rollWildMagicSurge(false);
  assert.equal(once.picks.length, 1);
  const twice = rollWildMagicSurge(true);
  assert.equal(twice.picks.length, 2);
});

test("seed resources for battle master and psi warrior", () => {
  const bm = token(["combat_superiority", "know_your_enemy", "improved_combat_superiority"]);
  seedSubclassResources(bm as never, 10, { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 }, 4);
  assert.equal(bm.superiorityDice, 5);
  assert.equal(bm.superiorityDie, "1d10");

  const psi = token(["psionic_power"]);
  seedSubclassResources(psi as never, 3, { str: 10, dex: 14, con: 14, int: 16, wis: 12, cha: 8 }, 2);
  assert.equal(psi.psionicDice, 4);
});

test("subclass menus expose actions for light domain and soulknife", () => {
  const light = token(["warding_flare", "radiance_of_the_dawn", "channel_divinity"]);
  light.channelDivinity = 1;
  light.abilityUses = { warding_flare: 2 };
  const menu = subclassMenus(light as never);
  assert.ok(menu.reactions.includes("warding_flare"));
  assert.ok(menu.actions.includes("radiance_of_the_dawn"));

  const knife = token(["psychic_blades", "psychic_veil"]);
  const m2 = subclassMenus(knife as never);
  assert.ok(m2.bonus.includes("psychic_blades"));
  assert.ok(m2.actions.includes("psychic_veil"));
});

test("frenzy and divine fury damage riders", () => {
  const barb = token(["frenzy"]);
  barb.raging = true;
  const r = subclassDamageRider(barb as never, 9, { str: 16, dex: 14, con: 14, int: 8, wis: 10, cha: 8 }, {
    weapon: true,
    firstHitThisTurn: true,
    targetHurt: true,
    cantrip: false,
    spell: false,
    melee: true,
  });
  assert.equal(r?.dice, "3d6");

  const z = token(["divine_fury"]);
  const r2 = subclassDamageRider(z as never, 6, { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 8 }, {
    weapon: true,
    firstHitThisTurn: true,
    targetHurt: false,
    cantrip: false,
    spell: false,
    melee: true,
  });
  assert.equal(r2?.dice, "1d6");
  assert.equal(r2?.flat, 3);
});

test("arcane ward absorbs damage", () => {
  const w = token(["arcane_ward"]);
  w.arcaneWardHp = 10;
  assert.equal(absorbArcaneWard(w as never, 4), 0);
  assert.equal(w.arcaneWardHp, 6);
  assert.equal(absorbArcaneWard(w as never, 15), 9);
  assert.equal(w.arcaneWardHp, 0);
});

test("castSubclassFeature runs key activatable powers", () => {
  const ctx = {
    allies: [],
    foes: [{ name: "Goblin", hp: 20, maxHp: 20, ac: 12, speedCells: 6, x: 1, y: 0, features: [], abilityUses: {} } as never],
    level: 5,
    abilities: { str: 16, dex: 14, con: 14, int: 14, wis: 12, cha: 14 },
    prof: 3,
  };
  const cases: Array<{ features: string[]; id: string; setup?: (t: Subclassful) => void }> = [
    { features: ["zealous_presence"], id: "zealous_presence", setup: (t) => { t.abilityUses = { zealous_presence: 1 }; } },
    { features: ["tides_of_chaos"], id: "tides_of_chaos" },
    { features: ["steps_of_the_fey"], id: "steps_of_the_fey", setup: (t) => { t.abilityUses = { fey_step: 1 }; } },
    { features: ["healing_light"], id: "healing_light", setup: (t) => { t.healingLightDice = 3; } },
    { features: ["primal_companion"], id: "primal_companion" },
    { features: ["breath_of_the_dragon"], id: "breath_of_the_dragon", setup: (t) => { t.abilityUses = { dragon_breath: 1 }; } },
    { features: ["invoke_duplicity"], id: "invoke_duplicity", setup: (t) => { t.channelDivinity = 1; } },
    { features: ["combat_superiority"], id: "combat_superiority_trip", setup: (t) => { t.superiorityDice = 2; t.superiorityDie = "1d8"; } },
    { features: ["wrath_of_the_sea"], id: "wrath_of_the_sea", setup: (t) => { t.abilityUses = { wild_shape: 1 }; } },
    { features: ["starry_form"], id: "starry_form", setup: (t) => { t.abilityUses = { wild_shape: 1 }; } },
    { features: ["vow_of_enmity"], id: "vow_of_enmity", setup: (t) => { t.channelDivinity = 1; } },
    { features: ["clockwork_cavalcade"], id: "clockwork_cavalcade", setup: (t) => { t.abilityUses = { clockwork_cavalcade: 1 }; } },
    { features: ["warping_implosion"], id: "warping_implosion", setup: (t) => { t.sorceryPoints = 5; } },
    { features: ["searing_vengeance"], id: "searing_vengeance", setup: (t) => { t.abilityUses = { searing_vengeance: 1 }; t.hp = 0; } },
    { features: ["shadow_step"], id: "shadow_step" },
    { features: ["psychic_blades"], id: "psychic_blades" },
    { features: ["radiance_of_the_dawn"], id: "radiance_of_the_dawn", setup: (t) => { t.channelDivinity = 1; } },
    { features: ["dragon_presence"], id: "dragon_presence", setup: (t) => { t.sorceryPoints = 5; } },
    { features: ["create_thrall"], id: "create_thrall" },
    { features: ["mantle_of_inspiration"], id: "mantle_of_inspiration", setup: (t) => { t.bardicLeft = 1; } },
  ];
  for (const row of cases) {
    const t = token(row.features);
    row.setup?.(t);
    const foes = [{ ...(ctx.foes[0] as object), hp: 20, maxHp: 20, conditions: [] as string[], abilityUses: {} }];
    const result = castSubclassFeature(t as never, row.id, { ...ctx, foes: foes as never, allies: [t as never] });
    assert.ok(result, row.id);
    assert.ok(result!.line.length > 0, row.id);
  }
});

test("setSubclassChoice validates options", () => {
  const t = token(["hunters_prey"]);
  setSubclassChoice(t, "hunters_prey", "colossus_slayer");
  assert.equal(t.subclassChoices?.hunters_prey, "colossus_slayer");
  assert.throws(() => setSubclassChoice(t, "hunters_prey", "nope"), /BAD_CHOICE/);
});
