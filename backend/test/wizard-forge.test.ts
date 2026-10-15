import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, test } from "node:test";
import { createUser, openAuth } from "../src/local/auth.js";
import { getAbility, getPregen } from "../src/local/campaign.js";
import { performPcAction, type CombatState, type CombatToken } from "../src/local/combat.js";
import { commitBuilderDraft } from "../src/local/builder-commit.js";
import { resolveContent, setContentEnabled } from "../src/local/content-catalog.js";
import { deriveHero } from "@d20-fireverse/rules";
import { builderCatalog, classDefForBuilder } from "../src/local/builder-catalog.js";
import { initSheet, refreshMenus } from "../src/local/srd-sheet.js";
import type { HeroPregen } from "../src/local/hero-pregen.js";
import { boot } from "./helpers.js";

before(() => {
  boot();
  openAuth();
});

const WIZARD_SPELLS = [
  "fire_bolt",
  "light",
  "mage_hand",
  "prestidigitation",
  "chromatic_orb",
  "magic_missile",
  "shield",
  "sleep",
  "thunderwave",
  "detect_magic",
  "find_familiar",
];

function enableWizardLine(): void {
  for (const [kind, id] of [
    ["class", "wizard"],
    ["species", "human"],
    ["background", "sage"],
  ] as const) {
    setContentEnabled(kind, id, true);
  }
  for (const id of WIZARD_SPELLS) {
    resolveContent("spell", id, { adminNote: "wizard forge test" });
    setContentEnabled("spell", id, true);
  }
}

function wizardDraft() {
  const catalog = builderCatalog();
  const cls = classDefForBuilder("wizard")!;
  const l1 = cls.levels.find((row) => row.level === 1)!;
  const cantrips = catalog.spells.filter((s) => s.classes.includes("wizard") && s.level === 0).slice(0, l1.cantrips ?? 3).map((s) => s.id);
  const prepared = catalog.spells.filter((s) => s.classes.includes("wizard") && s.level === 1).slice(0, l1.preparedSpells ?? 4).map((s) => s.id);
  const bookNeed = 6;
  const level1 = catalog.spells.filter((s) => s.classes.includes("wizard") && s.level === 1).map((s) => s.id);
  const book = [...new Set([...prepared, ...level1])].slice(0, bookNeed);
  return {
    name: "Zephyr Ink",
    classId: "wizard",
    speciesId: "human",
    backgroundId: "sage",
    method: "standard_array" as const,
    baseAbilities: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 },
    classSkills: ["insight", "investigation"],
    backgroundAsi: { mode: "plus2plus1" as const, plus2: "int" as const, plus1: "wis" as const },
    equipChoice: "A" as const,
    cantrips,
    spellsPrepared: prepared,
    spellbook: book,
  };
}

test("wizard L1 derive requires exact cantrip and prepared counts", () => {
  enableWizardLine();
  const catalog = builderCatalog();
  const cls = classDefForBuilder("wizard")!;
  const l1 = cls.levels.find((row) => row.level === 1);
  const sheet = deriveHero(wizardDraft(), catalog, {
    hitDie: cls.hitDie,
    saves: cls.saves,
    spellSlotsL1: l1?.spellSlots,
  });
  assert.equal(sheet.ok, true);
  assert.equal(sheet.cantripIds?.length, l1?.cantrips);
  assert.equal(sheet.preparedSpellIds?.length, l1?.preparedSpells);
  assert.deepEqual(sheet.spellSlots, l1?.spellSlots ?? { "1": 2 });
});

test("wizard builder hero spends a level-1 slot when casting in arena combat", () => {
  enableWizardLine();
  const player = createUser(`wiz${randomUUID().replace(/-/g, "").slice(0, 8)}`, "password", "player");
  const hero = commitBuilderDraft(player, wizardDraft());
  const pregen = getPregen(hero.id) as HeroPregen;
  assert.ok(pregen.spellSlots?.["1"] >= 1);
  assert.ok(pregen.spellsKnown.length >= 1);

  const token: CombatToken = {
    id: "pc-P1",
    kind: "pc",
    name: pregen.name,
    x: 0,
    y: 0,
    hp: pregen.hp,
    maxHp: pregen.hp,
    ac: pregen.ac,
    speedCells: 6,
    movementLeft: 6,
    hasAction: true,
    hasBonusAction: true,
    initiative: 20,
    playerId: "P1",
    characterId: pregen.id,
    actionIds: [],
    bonusActionIds: [],
    inventory: [],
    dead: false,
    dodging: false,
    disengaging: false,
    hidden: false,
    secondWindUsed: false,
    reactionReady: true,
  };
  initSheet(token, pregen);
  refreshMenus(token, pregen, getAbility);

  const leveled = pregen.spellsKnown.find((id) => {
    const ab = getAbility(id);
    return ab && Number((ab as { level?: number }).level ?? 1) > 0;
  });
  assert.ok(leveled, "prepared spell should appear in combat menu");
  assert.ok(token.actionIds.includes(leveled) || token.actionIds.includes(`spell_${leveled.replace(/^spell_/, "")}`));

  const castId = token.actionIds.find((id) => id.includes("magic_missile") || id.includes("thunderwave") || id === leveled) ?? leveled!;
  const before = token.slots?.["1"] ?? 0;

  const dummy: CombatToken = {
    id: "en-1",
    kind: "enemy",
    name: "Dummy",
    x: 1,
    y: 0,
    hp: 30,
    maxHp: 30,
    ac: 10,
    speedCells: 0,
    movementLeft: 0,
    hasAction: true,
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
  };
  const combat: CombatState = {
    encounterId: "test",
    mapId: "test",
    width: 4,
    height: 1,
    walls: [[false, false, false, false]],
    hazards: [[false, false, false, false]],
    tokens: [token, dummy],
    turnOrder: [token.id, dummy.id],
    turnIndex: 0,
    round: 1,
    log: [],
    reachable: [],
    status: "active",
    events: [],
    seq: 0,
  };

  performPcAction(combat, "P1", castId, "en-1");
  assert.equal(token.slots?.["1"], before - 1);
});
