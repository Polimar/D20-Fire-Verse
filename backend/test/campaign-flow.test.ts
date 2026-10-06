import assert from "node:assert/strict";
import { before, test } from "node:test";
import { startCombat } from "../src/local/combat.js";
import {
  beginCombat,
  choose,
  createRoom,
  joinRoom,
  playerDisconnect,
  publicState,
  withdraw,
} from "../src/local/room.js";
import { boot, scriptDice } from "./helpers.js";

before(boot);

function seat(characterId: string) {
  const created = createRoom();
  return joinRoom(created.roomCode, "A", characterId);
}

test("cellar, well, and store doors offer Leave back to the hub", () => {
  const { room, playerId } = seat("brenna_ironveal");
  room.flags.push("tiles_done");
  for (const node of ["cellar_enter", "well_enter", "store_enter"] as const) {
    room.nodeId = node;
    const leave = publicState(room).choices.find((c) => c.id === "leave");
    assert.ok(leave, `Leave missing at ${node}`);
    choose(room.roomCode, "leave", playerId);
    assert.equal(room.nodeId, "corridor_hub");
  }
});

test("withdraw from the well swarm returns to the well chamber, not the lock", () => {
  const { room } = seat("brenna_ironveal");
  room.nodeId = "fight_well_centipedes";
  beginCombat(room.roomCode);
  room.combat!.status = "defeat";
  withdraw(room.roomCode);
  assert.equal(room.nodeId, "well_enter");
  assert.ok(publicState(room).choices.some((c) => c.id === "leave"));
});

test("lab Perception DC 14 spots the spider; a miss sets surprise and she goes first", () => {
  const { room, playerId } = seat("mira_softstep");
  room.nodeId = "enter_lab_look";
  const see = scriptDice([[20, 20]]);
  choose(room.roomCode, "attempt", playerId);
  see();
  assert.equal(room.nodeId, "spider_spotted");
  assert.ok(!room.flags.includes("spider_surprise"));
  assert.match(room.voiceText ?? "", /\[\[spider:/);

  room.nodeId = "enter_lab_look";
  const miss = scriptDice([[20, 1]]);
  choose(room.roomCode, "attempt", playerId);
  miss();
  assert.equal(room.nodeId, "spider_ambush");
  assert.ok(room.flags.includes("spider_surprise"));
  choose(room.roomCode, "steel", playerId);
  assert.equal(room.nodeId, "fight_spider");
  beginCombat(room.roomCode);
  assert.ok(!room.flags.includes("spider_surprise"));
  const combat = room.combat!;
  const spider = combat.tokens.find((t) => t.kind === "enemy");
  assert.ok(spider);
  assert.equal(spider!.initiative, 999);
  assert.equal(combat.turnOrder[0], spider!.id);
});

test("a spotted approach does not give the spider surprise", () => {
  const combat = startCombat(
    "lab_infernal_spider",
    [{ playerId: "P1", displayName: "M", characterId: "mira_softstep", characterName: "Mira Softstep" }],
    undefined,
    undefined,
    [],
    { surpriseEnemy: false },
  );
  const spider = combat.tokens.find((t) => t.kind === "enemy")!;
  assert.ok(spider.initiative < 999);
});

test("killing the spider grants a Phial of the Last Pale that carries into the next fight", () => {
  const { room, playerId } = seat("quill_ashmere");
  room.nodeId = "fight_spider";
  beginCombat(room.roomCode);
  const combat = room.combat!;
  for (const t of combat.tokens.filter((tok) => tok.kind === "enemy")) {
    t.hp = 0;
    t.dead = true;
  }
  combat.status = "victory";
  playerDisconnect(room.roomCode, playerId);
  assert.ok(room.flags.includes("lab_phial"));
  assert.ok(room.flags.includes("spider_dead"));
  assert.deepEqual(room.lootInventory, ["potion_healing"]);
  assert.equal(room.nodeId, "post_spider");

  room.nodeId = "fight_magma";
  beginCombat(room.roomCode);
  const hero = room.combat!.tokens.find((t) => t.kind === "pc")!;
  assert.ok(hero.inventory.includes("potion_healing"));
  assert.ok(hero.actionIds.includes("use_potion_healing") || hero.bonusActionIds.includes("use_potion_healing"));
});

test("the mosaic poem still uses the wizard voice when the puzzle opens", () => {
  const { room, playerId } = seat("brenna_ironveal");
  room.flags.push("mosaic_spotted");
  room.nodeId = "corridor_hub";
  choose(room.roomCode, "tiles", playerId);
  assert.equal(room.nodeId, "corridor_tiles");
  assert.match(room.voiceText ?? "", /\[\[wizard:/);
});
