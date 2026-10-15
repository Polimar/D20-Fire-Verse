import assert from "node:assert/strict";
import { test } from "node:test";
import { getAbility } from "../src/local/campaign.js";
import { performPcAction, type CombatState, type CombatToken } from "../src/local/combat.js";
import { classLevelCap, coverageSummary } from "../src/local/coverage.js";
import { refreshMenus } from "../src/local/srd-sheet.js";

function seat(features: string[], extra: Partial<CombatToken> = {}): CombatToken {
  const token: CombatToken = {
    id: "pc-P1",
    kind: "pc",
    name: "Hero",
    x: 0,
    y: 0,
    hp: 8,
    maxHp: 20,
    ac: 12,
    speedCells: 6,
    movementLeft: 6,
    hasAction: true,
    hasBonusAction: true,
    initiative: 10,
    playerId: "P1",
    actionIds: [],
    bonusActionIds: [],
    inventory: [],
    dead: false,
    dodging: false,
    disengaging: false,
    hidden: false,
    secondWindUsed: false,
    sheetDriven: true,
    features,
    abilityUses: {},
    reactionReady: true,
    ...extra,
  };
  refreshMenus(token, undefined, getAbility);
  return token;
}

function fight(hero: CombatToken): CombatState {
  const foe: CombatToken = {
    id: "en-1",
    kind: "enemy",
    name: "Undead Dummy",
    x: 1,
    y: 0,
    hp: 30,
    maxHp: 30,
    ac: 10,
    speedCells: 0,
    movementLeft: 0,
    hasAction: false,
    hasBonusAction: false,
    initiative: 1,
    actionIds: [],
    bonusActionIds: [],
    inventory: [],
    dead: false,
    dodging: false,
    disengaging: false,
    hidden: false,
    secondWindUsed: false,
    traits: ["undead"],
  };
  return {
    encounterId: "test",
    mapId: "test",
    width: 4,
    height: 1,
    walls: [[false, false, false, false]],
    hazards: [[false, false, false, false]],
    tokens: [hero, foe],
    turnOrder: [hero.id, foe.id],
    turnIndex: 0,
    round: 1,
    log: [],
    reachable: [],
    status: "active",
    events: [],
    seq: 0,
  };
}

test("every SRD class is playable through level 20", () => {
  for (const row of coverageSummary()) {
    assert.equal(row.blocked, 0, row.classId);
    assert.equal(classLevelCap(row.classId), 20, row.classId);
  }
});

test("the other eight classes change the fight", () => {
    const cleric = seat(["channel_divinity", "sear_undead"], { channelDivinity: 1 });
    assert.ok(cleric.actionIds.includes("divine_spark"));
    const clericFight = fight(cleric);
    performPcAction(clericFight, "P1", "turn_undead");
    assert.equal(cleric.channelDivinity, 0);
    const foe = clericFight.tokens[1]!;
    assert.ok(foe.hp < foe.maxHp);
    assert.ok(foe.conditions?.includes("frightened"));

    const druid = seat(["wild_shape"], { abilityUses: { wild_shape: 2 } });
    refreshMenus(druid, undefined, getAbility);
    performPcAction(fight(druid), "P1", "wild_shape");
    assert.equal(druid.wildShaped, true);
    assert.ok((druid.tempHp ?? 0) > 0);

    const bard = seat(["countercharm"]);
    performPcAction(fight(bard), "P1", "countercharm");
    assert.equal(bard.countercharm, true);

    const sorc = seat(["innate_sorcery"], { abilityUses: { innate: 2 } });
    refreshMenus(sorc, undefined, getAbility);
    performPcAction(fight(sorc), "P1", "innate_sorcery");
    assert.equal(sorc.innateSorcery, true);
    assert.equal(sorc.abilityUses?.innate, 1);

    const ranger = seat(["tireless"], { abilityUses: { tireless: 1 } });
    refreshMenus(ranger, undefined, getAbility);
    performPcAction(fight(ranger), "P1", "tireless");
    assert.ok((ranger.tempHp ?? 0) > 0);

    const lock = seat(["contact_patron"], { abilityUses: { patron: 1 } });
    refreshMenus(lock, undefined, getAbility);
    performPcAction(fight(lock), "P1", "contact_patron");
    assert.equal(lock.heroicInspiration, true);

    const paladin = seat(["faithful_steed"], { abilityUses: { steed: 1 }, speedCells: 6 });
    refreshMenus(paladin, undefined, getAbility);
    performPcAction(fight(paladin), "P1", "faithful_steed");
    assert.ok(paladin.speedCells > 6);

    const monk = seat(["stunning_strike", "monks_focus"], { ki: 2, stunPrimed: true });
    assert.equal(monk.ki, 2);
});
