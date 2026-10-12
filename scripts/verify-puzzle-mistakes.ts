import {
  beginCombat,
  bootLocal,
  choose,
  createRoom,
  getRoom,
  joinRoom,
  playerDisconnect,
  publicState,
  solvePuzzleSequence,
} from "../backend/src/local/room.js";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

bootLocal();
const room = createRoom();
const seated = joinRoom(room.roomCode, "Brenna", "brenna_ironveal");
const pid = seated.playerId;
const code = room.roomCode;

function pub() {
  return publicState(getRoom(code)!);
}
function pick(id: string) {
  return choose(code, id, pid);
}

pick("go_money");
pick("accept");
pick("down");
pick("hub");
room.nodeId = "corridor_hub";
room.flags.push("mosaic_spotted");
pick("tiles");

choose(code, "green", pid);
let s = pub();
assert(s.nodeId === "corridor_tiles", `decoy left the puzzle: ${s.nodeId}`);
assert((s.puzzle?.fails ?? 0) === 1, `decoy should be a fault, fails=${s.puzzle?.fails}`);
assert((s.puzzle?.picked.length ?? 0) === 0, "chain should reset");

choose(code, "gold", pid);
s = pub();
assert(s.nodeId === "corridor_tiles", `second fault left tiles: ${s.nodeId}`);
assert((s.puzzle?.fails ?? 1) === 0, "penalty should reset the fault counter");
assert((s.puzzle?.feedback ?? "").includes("try again"), s.puzzle?.feedback || "no feedback");

choose(code, "__reset__", pid);
assert(pub().nodeId === "corridor_tiles", "reset left the puzzle");

for (const id of ["violet", "slate", "black", "fire"]) choose(code, id, pid);
s = pub();
assert(s.flags.includes("tiles_done"), `tiles not solved after mistakes: ${s.nodeId}`);

pick("cellar");
pick("fight");
function fightClear() {
  if (!pub().combat) {
    try {
      beginCombat(code);
    } catch {
      return;
    }
  }
  const live = getRoom(code)!;
  const c = live.combat;
  if (!c) return;
  for (const t of c.tokens) {
    if (t.kind === "enemy") {
      t.hp = 0;
      t.dead = true;
    }
  }
  c.status = "victory";
  playerDisconnect(code, pid);
}
fightClear();
assert(pub().nodeId === "cellar_vessels", pub().nodeId);

solvePuzzleSequence(code, ["x", "eye", "wave", "spiral"]);
solvePuzzleSequence(code, ["spiral", "eye", "x", "wave"]);
s = pub();
assert(s.nodeId === "cellar_vessels", `vessels penalty left the puzzle: ${s.nodeId}`);
assert(!s.flags.includes("seal_cellar"), "wrong vessels granted the seal");
assert((s.puzzle?.feedback ?? "").length > 0, "no vessel feedback");
solvePuzzleSequence(code, ["eye", "x", "wave", "spiral"]);
s = pub();
assert(s.flags.includes("seal_cellar") || s.nodeId.includes("hole"), `correct vessels failed ${s.nodeId}`);

fightClear();
if (pub().choices.some((c) => c.id === "hub")) pick("hub");

pick("well");
pick("lock");
solvePuzzleSequence(code, ["stone", "sun", "skull", "wave"]);
s = pub();
assert(s.nodeId === "well_lock", `well penalty left the lock: ${s.nodeId} ${s.puzzle?.feedback}`);
assert(!s.combat, "well mistake started a fight");
solvePuzzleSequence(code, ["tooth", "spark", "moon", "wave"]);
assert(pub().nodeId === "well_bucket", `well solve went to ${pub().nodeId}`);
pick("take");
fightClear();
if (pub().choices.some((c) => c.id === "hub")) pick("hub");
else if (pub().choices.some((c) => c.id === "leave")) pick("leave");

pick("store");
pick("vials");
solvePuzzleSequence(code, ["poison", "poison", "poison", "poison"]);
solvePuzzleSequence(code, ["vit", "heal", "heal", "invis"]);
s = pub();
assert(s.nodeId === "store_vials", `vials penalty left the puzzle: ${s.nodeId}`);
solvePuzzleSequence(code, ["heal", "invis", "vit", "heal"]);
assert(pub().nodeId === "store_mixture", pub().nodeId);
solvePuzzleSequence(code, ["mercury", "hop_ash", "quicklime"]);
solvePuzzleSequence(code, ["stone_oil", "moon_dust", "black_salt"]);
s = pub();
assert(s.nodeId === "store_mixture", `mixture penalty left the puzzle: ${s.nodeId}`);
solvePuzzleSequence(code, ["moon_dust", "black_salt", "stone_oil"]);
s = pub();
assert(s.flags.includes("seal_store") || s.nodeId.includes("hole") || s.nodeId === "corridor_hub", s.nodeId);

console.log(JSON.stringify({ ok: true, node: s.nodeId, flags: s.flags }));
