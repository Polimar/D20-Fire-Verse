import {
  applyMastery,
  clampExhaustion,
  effectiveMaxHp,
  exhaustionKills,
  setExhaustion,
  type MasteryId,
} from "@d20-fireverse/rules";
import {
  abilityMod,
  getAbility,
  getEncounter,
  getMap,
  getMonster,
  getPregen,
  portraitForCharacter,
  portraitForMonster,
  type MapDef,
  type Pregen,
} from "./campaign.js";
import {
  getArenaMap,
  isCustomArenaId,
  resolveArenaArtPublicPath,
  scalePregenToLevel,
  type ArenaMapDef,
} from "./arena-maps.js";
import {
  critNotation,
  makeDiceRoll,
  parseNotation,
  rollAttack,
  rollCheck,
  rollD20,
  rollNotation,
  type D20Mode,
  type DiceOutcome,
  type DiceRoll,
} from "./dice.js";
import {
  ATTACK_VARIANTS,
  exportVitals,
  initSheet,
  longRestResources,
  refreshMenus,
  scaledDice,
  shortRestResources,
  slotReady,
  spendSlot,
  splitVariant,
  strengthWeapon,
  type AttackVariant,
  type Vitals,
} from "./srd-sheet.js";
import type { SpellDef } from "@d20-fireverse/content-schema";
import { catalogEntry } from "./content-catalog.js";
import { durationToPcTurns } from "./spell-duration.js";
import {
  delayedOnHitFromEffect,
  queueStartOfTurnDamage,
  takeStartOfTurnDamage,
} from "./acid-arrow.js";
import { clearCasterSpell, restorePolymorph, type SpellLink, type SpellZone } from "./spell-fields.js";
import type { ClassKit } from "./class-kit.js";
import {
  auraSaveBonus,
  castClassFeature,
  checkBonusAdjust,
  classDamageRider,
  classMenus,
  endWildShape,
  evasionDamage,
  favoredMarkFree,
  fiendLuck,
  freeCast,
  ignorePhysicalResistance,
  onClassLongRest,
  onClassShortRest,
  onClassTurn,
  onKillBlessing,
  openHandProne,
  potentCantripHalf,
  prowessSavesMiss,
  reliableFloor,
  sculptSucceeds,
  seedClassResources,
  spellRecall,
  strokeSavesMiss,
  stunOnHit,
  wantsSpellAdvantage,
  wantsSteadyAdvantage,
} from "./class-runtime.js";
import { actionCategory, actionSummary, type ActionCategory } from "./action-menu.js";
import type { Player } from "./types.js";
import {
  auraAppliesTo,
  plantAura as placeAura,
  pullAura as removePlantedAura,
  refreshAuras as syncAuras,
  type AuraMods,
  type CombatAura,
} from "./combat-aura.js";
import { healingPotionByInventory } from "./healing-potions.js";
import {
  GIANT_STRENGTH_DURATION_PC_TURNS,
  GIANT_STRENGTH_EFFECT_ID,
  giantStrengthPotionByInventory,
} from "./giant-strength-potions.js";
import {
  INVISIBILITY_POTION_DURATION_PC_TURNS,
  INVISIBILITY_POTION_EFFECT_ID,
  endPotionInvisibility,
  invisibilityPotionByInventory,
} from "./invisibility-potion.js";

export type Cell = { x: number; y: number };

export type CombatToken = {
  id: string;
  kind: "pc" | "enemy";
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Unmodified maximum HP before exhaustion tier 4 halves it. */
  baseMaxHp?: number;
  /** Damage absorbs here before real HP (5e temp HP). */
  tempHp?: number;
  ac: number;
  speedCells: number;
  movementLeft: number;
  hasAction: boolean;
  hasBonusAction: boolean;
  initiative: number;
  playerId?: string;
  characterId?: string;
  /** The hero's level when it differs from the catalog pregen (arena heroes are scaled). */
  level?: number;
  monsterId?: string;
  teamId?: string;
  actionIds: string[];
  bonusActionIds: string[];
  inventory: string[];
  dead: boolean;
  dodging: boolean;
  disengaging: boolean;
  hidden: boolean;
  helpingTargetId?: string;
  secondWindUsed: boolean;
  blessed?: boolean;
  /** Guiding Bolt: the next attack against this token has advantage. */
  marked?: boolean;
  sneakUsed?: boolean;
  webCooldown?: number;
  /** Sheet-driven heroes rebuild their menu from class, spells and slots. */
  sheetDriven?: boolean;
  slots?: Record<string, number>;
  cantrips?: string[];
  spells?: string[];
  spellAbility?: string;
  reactionIds?: string[];
  reactionReady?: boolean;
  features?: string[];
  fightingStyle?: string;
  conditions?: string[];
  dying?: boolean;
  stable?: boolean;
  deathSuccesses?: number;
  deathFailures?: number;
  acBonus?: number;
  acFloor?: number;
  /** From the equipped loadout. Weapon mastery riders stay in packages/rules. */
  gearAttackBonus?: number;
  gearDamageBonus?: number;
  /** Magic weapon bonuses, keyed by the attack they ride on. */
  weaponGear?: Record<
    string,
    {
      attack: number;
      damage: number;
      onHit: Array<{ damage: string; damageType?: string; saveAbility?: string; saveDc?: number; halfDamage?: string }>;
      mastery?: string;
    }
  >;
  masteries?: string[];
  grantedSpells?: string[];
  /** Spell id → the equipped item that casts it. */
  gearSpells?: Record<string, string>;
  /** Item instance → charges left this fight. */
  gearCharges?: Record<string, number>;
  blur?: boolean;
  invisible?: boolean;
  raging?: boolean;
  ragesLeft?: number;
  reckless?: boolean;
  actionSurge?: boolean;
  extraAction?: boolean;
  /** Dash this turn, still reversible if you have not walked since. */
  dashUndo?: { abilityId: string; granted: number; movementLeft: number; bonus: boolean; extra: boolean; attacked: boolean };
  ki?: number;
  kiMax?: number;
  layOnHands?: number;
  layOnHandsMax?: number;
  channelDivinity?: number;
  bardicLeft?: number;
  inspiration?: number;
  sorceryPoints?: number;
  castLeveled?: boolean;
  castBonusSpell?: boolean;
  /** Magic standard action: next leveled spell skips the action cost once. */
  magicActionReady?: boolean;
  spiritualRounds?: number;
  concentrating?: { spellId: string; targetId?: string };
  brand?: { by: string; dice: string; damageType?: string; hexAbility?: string; huntersMark?: boolean };
  /** After a marked foe dies, the caster may spend a later BA to move Hex / Hunter's Mark. */
  pendingMarkRetarget?: string;
  baned?: boolean;
  hasted?: boolean;
  hasteSkipLethargy?: boolean;
  hasteBaseSpeed?: number;
  hitDie?: number;
  hitDice?: number;
  /** 2024 exhaustion tier 0–6 on this token. */
  exhaustionLevel?: number;
  arcaneRecovery?: boolean;
  attackedThisTurn?: boolean;
  saves?: Record<string, number>;
  damageResistances?: string[];
  damageImmunities?: string[];
  damageVulnerabilities?: string[];
  traits?: string[];
  legendaryUses?: number;
  legendaryLeft?: number;
  legendaryActions?: string[];
  legendaryResistLeft?: number;
  abilityUses?: Record<string, number>;
  rechargeReady?: Record<string, boolean>;
  multiattack?: string[];
  actionPool?: string[];
  /** Class table numbers and feature flags for this seat. */
  kit?: ClassKit;
  fightingStyles?: string[];
  heavyArmor?: boolean;
  secondWindLeft?: number;
  indomitableLeft?: number;
  /** Weapon attacks still owed by the Attack action already taken this turn (Extra Attack). */
  attacksLeft?: number;
  /** An attack roll was made this turn; Reckless Attack is decided on the first one. */
  rolledAttack?: boolean;
  /** End-of-your-turn ticks left on Rage. Entering or maintaining sets this to 2 on your turn. */
  rageLife?: number;
  /** The Rage was fed this turn (attack, forced save, or Extend Rage) and lasts to the next turn. */
  rageKept?: boolean;
  frenzyUsed?: boolean;
  brutalUsed?: boolean;
  savageUsed?: boolean;
  cleaveUsed?: boolean;
  heroicInspiration?: boolean;
  /** Movement left this turn that provokes no opportunity attacks. */
  freeMove?: number;
  /** Sap: disadvantage on this creature's next attack roll; cleared when the sapper's turn starts. */
  sappedBy?: string;
  /** Slow and Hamstring Blow: Speed penalty in cells until the source's next turn. */
  slowedBy?: { by: string; cells: number };
  /** Vex: advantage on the next attack roll against this target id. */
  vexTarget?: string;
  countercharm?: boolean;
  wildShaped?: boolean;
  wildShapeFormId?: string;
  wildShapePick?: string;
  wildShapeBackup?: { hp: number; maxHp: number; ac: number; speedCells: number };
  /** Spell and effect durations counted in PC-turn ticks (6s each). */
  timedEffects?: Array<{ label: string; pcTurnsLeft: number; spellId?: string }>;
  /** Damage that fires at the start of this creature's next turn (Acid Arrow). */
  startOfTurnDamage?: Array<{ dice: string; damageType: string; label: string; sourceSpellId: string }>;
  spellLinks?: SpellLink[];
  polymorphBackup?: { hp: number; maxHp: number; ac: number; name: string; actionIds: string[]; bonusActionIds: string[] };
  polymorphBy?: string;
  summonOwner?: string;
  summonSpellId?: string;
  /** Temporary ability scores from drinks (Giant Strength). */
  abilityOverride?: Partial<Record<"str" | "dex" | "con" | "int" | "wis" | "cha", number>>;
  innateSorcery?: boolean;
  steadyAim?: boolean;
  channelAttack?: number;
  auraBonus?: number;
  auraAc?: number;
  auraSaveAdv?: "all" | "vs_magic";
  auraStealth?: number;
  auraAttackDisadvAgainst?: boolean;
  auraResistances?: string[];
  auraSpeedMult?: number;
  auraObscured?: boolean;
  followAuras?: AuraMods[];
  plantAuras?: AuraMods[];
  gearSaveBonus?: number;
  auraEnterTicked?: string[];
  blessedStrikeUsed?: boolean;
  furyUsed?: boolean;
  preyUsed?: boolean;
  foeUsed?: boolean;
  affinityUsed?: boolean;
  evokeUsed?: boolean;
  prowessUsed?: boolean;
  stunPrimed?: boolean;
  nickNext?: boolean;
  nickMod?: number;
};

export type StrikeHit = {
  targetId: string;
  outcome: DiceOutcome;
  damage: number;
  hp: number;
};

export type CombatEvent = { seq: number; line: string } & (
  | { kind: "start"; order: string[] }
  | { kind: "turn"; tokenId: string; round: number }
  | { kind: "move"; tokenId: string; path: Cell[] }
  | {
      kind: "strike";
      tokenId: string;
      ability: string;
      style: "melee" | "ranged" | "spell";
      rolls: DiceRoll[];
      hits: StrikeHit[];
    }
  | { kind: "dice"; tokenId: string; rolls: DiceRoll[] }
  | { kind: "heal"; tokenId: string; targetId: string; ability: string; amount: number; hp: number; rolls: DiceRoll[] }
  | { kind: "status"; tokenId: string; ability: string; rolls: DiceRoll[] }
  | { kind: "down"; tokenId: string }
  | { kind: "end"; outcome: "victory" | "defeat" }
);

type EventInput = CombatEvent extends infer E ? (E extends CombatEvent ? Omit<E, "seq"> : never) : never;

const STANDARD_ACTIONS = [
  "std_attack",
  "std_dash",
  "std_disengage",
  "std_dodge",
  "std_help",
  "std_hide",
  "std_influence",
  "std_magic",
  "std_ready",
  "std_search",
  "std_study",
  "std_utilize",
] as const;

export type PendingReaction = {
  kind: "shield" | "opportunity" | "smite" | "retaliation" | "uncanny_dodge" | "deflect_attacks";
  playerId: string;
  tokenId: string;
  prompt: string;
  acceptLabel: string;
  declineLabel: string;
  abilityId?: string;
  targetId?: string;
  attackTotal?: number;
  damage: number;
  crit?: boolean;
  damageType?: string;
  negateAuto?: boolean;
  rolls: DiceRoll[];
  abilityName: string;
  style: "melee" | "ranged" | "spell";
  attackerId: string;
  moverId?: string;
  path?: Cell[];
  cost?: number;
  dest?: Cell;
  resumePath?: Cell[];
  resumeMoverId?: string;
};

const EVENT_WINDOW = 80;
const REACTION_WAIT_MS = 30_000;

function bonusActionsFor(pregen: Pregen): string[] {
  const out: string[] = [];
  if (pregen.actions?.includes("second_wind") || pregen.class === "fighter") {
    out.push("second_wind");
  }
  if (pregen.traits?.includes("cunning_action") || pregen.class === "rogue") {
    out.push("cunning_dash", "cunning_disengage", "cunning_hide");
  }
  return out;
}

function castsSpellAction(
  castId: string,
  ability: { level?: number; effects: Array<{ slot?: number; type?: string }> },
  token: CombatToken,
): boolean {
  if (castId.startsWith("spell_")) return true;
  if (token.cantrips?.includes(castId)) return true;
  const level = Number(ability.level ?? ability.effects[0]?.slot ?? 0);
  return level > 0;
}

function actionIdsFor(pregen: Pregen): string[] {
  const base = [...(pregen.actions ?? ["longsword_attack"]).filter((id) => id !== "second_wind")];
  for (const id of STANDARD_ACTIONS) {
    if (!base.includes(id)) base.push(id);
  }
  for (const token of pregen.inventory ?? []) {
    const potion =
      healingPotionByInventory(token) ??
      giantStrengthPotionByInventory(token) ??
      invisibilityPotionByInventory(token);
    if (potion && !base.includes(potion.abilityId)) base.push(potion.abilityId);
  }
  return base;
}

export type DamageDiePreview = { sides: number; damageType: string };

export type StrikeHold = {
  abilityId: string;
  targetId: string;
  attackRoll: DiceRoll;
  style: "melee" | "ranged" | "spell";
  ranged: boolean;
  mode: D20Mode;
  crit: boolean;
  rolls: DiceRoll[];
  preview: DamageDiePreview[];
};

export type CombatState = {
  encounterId: string;
  mapId: string;
  width: number;
  height: number;
  walls: boolean[][];
  /** Liquids: block movement, not line of fire. */
  hazards: boolean[][];
  tokens: CombatToken[];
  zones?: SpellZone[];
  auras?: CombatAura[];
  turnOrder: string[];
  turnIndex: number;
  round: number;
  log: string[];
  reachable: Array<{ x: number; y: number }>;
  status: "active" | "victory" | "defeat" | "draw";
  events: CombatEvent[];
  seq: number;
  pending?: PendingReaction;
  reactionExpiresAt?: number;
  aimRequest?: { playerId: string; abilityId: string };
  /** Player ids whose dice wait for a phone swipe. Set by the table for this action, not saved as authority. */
  phoneIds?: string[];
  awaiting?: Array<{
    id: string;
    playerId: string;
    label: string;
    step: "d20" | "damage" | "initiative" | "death" | "save";
    abilityId?: string;
    targetId?: string;
    x?: number;
    y?: number;
    once?: boolean;
    saveAbility?: string;
    saveDc?: number;
    saveDamage?: number;
    saveHalf?: boolean;
    saveFail?: string;
    saveSourceSpellId?: string;
    saveRepeat?: boolean;
    saveCondition?: string;
  }>;
  /** Initiative is still being thrown; the fight has not taken its first turn. */
  gathering?: boolean;
  strikeHold?: StrikeHold;
  /** Physical damage dice waiting for the Damage swipe (no faces yet). */
  damagePreview?: DamageDiePreview[];
  pvp?: "ffa" | "teams";
  pvpWinner?: string;
  pve?: boolean;
  /** 1-indexed finishing place by token id. Shared when several fighters drop in the same blow. */
  placements?: Record<string, number>;
  /** Death order (token ids) for FFA placement. */
  elimOrder?: string[];
  /** Groups deaths that share a place (same attack / forfeit). */
  elimPulse?: number;
};

function rectGrid(
  width: number,
  height: number,
  rects: Array<{ x: number; y: number; w: number; h: number }> | undefined,
): boolean[][] {
  const g = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
  for (const w of rects ?? []) {
    for (let y = w.y; y < w.y + w.h; y += 1) {
      for (let x = w.x; x < w.x + w.w; x += 1) {
        if (y >= 0 && y < height && x >= 0 && x < width) g[y][x] = true;
      }
    }
  }
  return g;
}

function wallGrid(map: MapDef): boolean[][] {
  return rectGrid(map.width, map.height, map.walls);
}

function hazardGrid(map: MapDef): boolean[][] {
  return rectGrid(map.width, map.height, map.hazards);
}

function blockedMove(combat: CombatState, x: number, y: number): boolean {
  return Boolean(combat.walls[y]?.[x] || combat.hazards[y]?.[x]);
}

function isFoe(combat: CombatState, actor: CombatToken, t: CombatToken): boolean {
  if (t.dead || t.id === actor.id) return false;
  if (!combat.pvp) {
    if (actor.kind === "pc") return t.kind === "enemy";
    return t.kind === "pc";
  }
  if (t.kind !== "pc") return false;
  if (combat.pvp === "ffa") return true;
  return Boolean(actor.teamId && t.teamId && actor.teamId !== t.teamId);
}

function isFriend(combat: CombatState, actor: CombatToken, t: CombatToken): boolean {
  if (t.dead) return false;
  if (!combat.pvp) return t.kind === "pc";
  if (t.kind !== "pc") return false;
  if (combat.pvp === "ffa") return t.id === actor.id;
  return actor.teamId === t.teamId;
}

function tokenAt(combat: CombatState, x: number, y: number, ignoreId?: string): CombatToken | undefined {
  return combat.tokens.find((t) => !t.dead && t.id !== ignoreId && t.x === x && t.y === y);
}

function inBounds(combat: CombatState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < combat.width && y < combat.height;
}

const STEPS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

type Visit = { x: number; y: number; cost: number; parity: number; prev: string | null };

/**
 * Dijkstra over (cell, diagonal parity) with the SRD 5-10-5 diagonal rule.
 * Allies can be passed through but never ended on; walls and foes block.
 */
function explore(combat: CombatState, token: CombatToken, budget: number): Map<string, Visit> {
  const visits = new Map<string, Visit>();
  const startKey = `${token.x},${token.y},0`;
  visits.set(startKey, { x: token.x, y: token.y, cost: 0, parity: 0, prev: null });
  const open: string[] = [startKey];
  while (open.length) {
    open.sort((a, b) => visits.get(a)!.cost - visits.get(b)!.cost);
    const key = open.shift()!;
    const cur = visits.get(key)!;
    for (const [dx, dy] of STEPS) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!inBounds(combat, nx, ny) || blockedMove(combat, nx, ny)) continue;
      const blocker = tokenAt(combat, nx, ny, token.id);
      if (blocker && isFoe(combat, token, blocker)) continue;
      if (blocker && !combat.pvp && blocker.kind !== token.kind) continue;
      const diagonal = dx !== 0 && dy !== 0;
      if (diagonal && (blockedMove(combat, nx, cur.y) || blockedMove(combat, cur.x, ny))) continue;
      const step = diagonal ? (cur.parity === 0 ? 1 : 2) : 1;
      const cost = cur.cost + step;
      if (cost > budget) continue;
      const parity = diagonal ? 1 - cur.parity : cur.parity;
      const nextKey = `${nx},${ny},${parity}`;
      const seen = visits.get(nextKey);
      if (seen && seen.cost <= cost) continue;
      visits.set(nextKey, { x: nx, y: ny, cost, parity, prev: key });
      if (!open.includes(nextKey)) open.push(nextKey);
    }
  }
  return visits;
}

function bestVisits(combat: CombatState, token: CombatToken, visits: Map<string, Visit>): Map<string, Visit> {
  const best = new Map<string, Visit>();
  for (const v of visits.values()) {
    if (v.x === token.x && v.y === token.y) continue;
    if (tokenAt(combat, v.x, v.y, token.id)) continue;
    const cellKey = `${v.x},${v.y}`;
    const prev = best.get(cellKey);
    if (!prev || v.cost < prev.cost) best.set(cellKey, v);
  }
  return best;
}

function unwind(visits: Map<string, Visit>, end: Visit): Cell[] {
  const path: Cell[] = [];
  let cur: Visit | undefined = end;
  while (cur) {
    path.unshift({ x: cur.x, y: cur.y });
    cur = cur.prev ? visits.get(cur.prev) : undefined;
  }
  return path;
}

export function computeReachable(combat: CombatState, tokenId: string): Array<{ x: number; y: number }> {
  const token = combat.tokens.find((t) => t.id === tokenId);
  if (!token || token.dead) return [];
  const visits = explore(combat, token, token.movementLeft);
  return [...bestVisits(combat, token, visits).values()].map((v) => ({ x: v.x, y: v.y }));
}

/** Cheapest legal path to an empty cell, start cell included, or null. */
export function pathTo(
  combat: CombatState,
  token: CombatToken,
  tx: number,
  ty: number,
): { path: Cell[]; cost: number } | null {
  const visits = explore(combat, token, token.movementLeft);
  const end = bestVisits(combat, token, visits).get(`${tx},${ty}`);
  if (!end) return null;
  return { path: unwind(visits, end), cost: end.cost };
}

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/**
 * Supercover line from cell center to cell center. Start and end cells are ignored.
 * A grid corner counts as blocked if either adjacent wall cell is occupied (no peeking).
 */
export function clearShot(combat: CombatState, ax: number, ay: number, bx: number, by: number): boolean {
  const walls = combat.walls;
  if (!walls?.length) return true;
  if (ax === bx && ay === by) return true;
  const nx = Math.abs(bx - ax);
  const ny = Math.abs(by - ay);
  const sx = Math.sign(bx - ax);
  const sy = Math.sign(by - ay);
  const blocked = (cx: number, cy: number) => {
    if ((cx === ax && cy === ay) || (cx === bx && cy === by)) return false;
    return Boolean(walls[cy]?.[cx]);
  };
  let x = ax;
  let y = ay;
  let ix = 0;
  let iy = 0;
  while (ix < nx || iy < ny) {
    const t = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (t === 0) {
      if (blocked(x + sx, y) || blocked(x, y + sy)) return false;
      x += sx;
      y += sy;
      ix += 1;
      iy += 1;
    } else if (t < 0) {
      x += sx;
      ix += 1;
    } else {
      y += sy;
      iy += 1;
    }
    if (x === bx && y === by) return true;
    if (blocked(x, y)) return false;
  }
  return true;
}

function demandShot(combat: CombatState, from: CombatToken, to: CombatToken): void {
  if (!clearShot(combat, from.x, from.y, to.x, to.y)) throw new Error("NO_SHOT");
}

function refreshReachable(combat: CombatState): void {
  const current = currentToken(combat);
  if (current && current.kind === "pc" && !current.dead && combat.status === "active") {
    combat.reachable = computeReachable(combat, current.id);
  } else {
    combat.reachable = [];
  }
}

function pushLog(combat: CombatState, line: string): void {
  combat.log.push(line);
  if (combat.log.length > 40) combat.log.shift();
}

function emit(combat: CombatState, event: EventInput): void {
  combat.seq += 1;
  combat.events.push({ ...event, seq: combat.seq } as CombatEvent);
  if (combat.events.length > EVENT_WINDOW) combat.events.splice(0, combat.events.length - EVENT_WINDOW);
  if (event.line) pushLog(combat, event.line);
}

export function startCombat(
  encounterId: string,
  players: Player[],
  wounds?: Record<string, number>,
  carry?: Record<string, Vitals>,
  holdPcIds: string[] = [],
  opts?: { surpriseEnemy?: boolean; extraInventory?: string[] },
): CombatState {
  const encounter = getEncounter(encounterId);
  if (!encounter) throw new Error("BAD_ENCOUNTER");
  const map = getMap(encounter.mapId);
  if (!map) throw new Error("BAD_MAP");
  const n = Math.min(3, Math.max(1, players.length));
  const scale = encounter.scaling[String(n)] || encounter.scaling["1"];
  const walls = wallGrid(map);
  const hazards = hazardGrid(map);
  const tokens: CombatToken[] = [];

  players.forEach((p, i) => {
    const pregen = getPregen(p.characterId);
    if (!pregen) throw new Error("BAD_CHARACTER");
    const spot = map.spawn.pcs[i] || map.spawn.pcs[0];
    const maxHp = pregen.hp;
      const missing = wounds?.[p.playerId] ?? 0;
      const hp = Math.max(0, maxHp - missing);
      tokens.push({
      id: `pc-${p.playerId}`,
      kind: "pc",
      name: pregen.name,
      x: spot.x,
      y: spot.y,
      hp,
      maxHp,
      ac: pregen.ac,
      speedCells: pregen.speedCells ?? 6,
      movementLeft: pregen.speedCells ?? 6,
      hasAction: true,
      hasBonusAction: true,
      initiative: 0,
      playerId: p.playerId,
      characterId: pregen.id,
      actionIds: actionIdsFor(pregen),
      bonusActionIds: bonusActionsFor(pregen),
      inventory: [...(pregen.inventory ?? [])],
      dead: false,
      dodging: false,
      disengaging: false,
      hidden: false,
      secondWindUsed: false,
      reactionReady: true,
    });
    const hero = tokens[tokens.length - 1]!;
    initSheet(hero, pregen, carry?.[p.playerId]);
    refreshMenus(hero, pregen, getAbility);
    if (!holdPcIds.includes(p.playerId)) hero.initiative = rollLiveInitiative(hero, pregen);
  });

  let enemySpot = 0;
  let enemySeq = 0;
  for (const group of scale) {
    const mon = getMonster(group.monsterId);
    if (!mon) continue;
    for (let i = 0; i < group.count; i += 1) {
      const spot = map.spawn.enemies[enemySpot % map.spawn.enemies.length];
      enemySpot += 1;
      enemySeq += 1;
      const hp = group.hpOverride ?? mon.hp;
      const initRoll = opts?.surpriseEnemy
        ? 999
        : rollD20() + abilityMod(mon.abilities.dex ?? 10);
      tokens.push({
        id: `en-${enemySeq}`,
        kind: "enemy",
        name: `${mon.name}${group.count > 1 ? ` ${i + 1}` : ""}`,
        x: spot.x,
        y: spot.y,
        hp,
        maxHp: hp,
        ac: mon.ac,
        speedCells: mon.speedCells,
        movementLeft: mon.speedCells,
        hasAction: true,
        hasBonusAction: false,
        initiative: initRoll,
        monsterId: mon.id,
        actionIds: mon.actions,
        bonusActionIds: [],
        inventory: [],
        dead: false,
        dodging: false,
        disengaging: false,
        hidden: false,
        secondWindUsed: false,
        reactionReady: true,
      });
      stampMonster(tokens[tokens.length - 1]!, mon);
    }
  }

  if (opts?.extraInventory?.length) {
    const hero = tokens.find((t) => t.kind === "pc");
    if (hero?.characterId) {
      hero.inventory = [...(hero.inventory ?? []), ...opts.extraInventory];
      const pregen = getPregen(hero.characterId);
      if (pregen) refreshMenus(hero, pregen, getAbility);
    }
  }

  for (let i = 0; i < tokens.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (tokens[i].x !== tokens[j].x || tokens[i].y !== tokens[j].y) continue;
      for (const [dx, dy] of STEPS) {
        const nx = tokens[i].x + dx;
        const ny = tokens[i].y + dy;
        if (
          nx >= 0 &&
          ny >= 0 &&
          nx < map.width &&
          ny < map.height &&
          !walls[ny][nx] &&
          !hazards[ny][nx] &&
          !tokens.some((t) => t.x === nx && t.y === ny)
        ) {
          tokens[i].x = nx;
          tokens[i].y = ny;
          break;
        }
      }
    }
  }

  // Ties go to the higher Dexterity, then to the heroes.
  const dexOf = (t: CombatToken) =>
    t.kind === "pc"
      ? getPregen(t.characterId!)?.abilities.dex ?? 10
      : getMonster(t.monsterId!)?.abilities.dex ?? 10;
  const turnOrder = [...tokens]
    .sort(
      (a, b) =>
        b.initiative - a.initiative ||
        dexOf(b) - dexOf(a) ||
        (a.kind === "pc" ? -1 : 1) - (b.kind === "pc" ? -1 : 1),
    )
    .map((t) => t.id);

  const combat: CombatState = {
    encounterId,
    mapId: map.id,
    width: map.width,
    height: map.height,
    walls,
    hazards,
    tokens,
    turnOrder,
    turnIndex: 0,
    round: 1,
    log: [],
    reachable: [],
    status: "active",
    events: [],
    seq: 0,
  };
  if (holdPcIds.length) {
    combat.gathering = true;
    combat.phoneIds = holdPcIds;
    combat.awaiting = holdPcIds.map((id) => ({
      id: `init-${id}`,
      playerId: id,
      label: "Initiative",
      step: "initiative" as const,
    }));
    emit(combat, {
      kind: "status",
      tokenId: tokens.find((t) => t.playerId === holdPcIds[0])?.id ?? tokens[0]!.id,
      ability: "Initiative",
      rolls: [],
      line: "Throw initiative on your phone.",
    });
    return combat;
  }
  emit(combat, {
    kind: "start",
    order: turnOrder,
    line: `Initiative: ${turnOrder.map((id) => tokens.find((t) => t.id === id)!.name).join(", ")}.`,
  });
  beginTurn(combat);
  settleEnemies(combat);
  return combat;
}

function stampMonster(token: CombatToken, mon: ReturnType<typeof getMonster>): void {
  if (!mon) return;
  token.saves = mon.saves;
  token.damageResistances = mon.damageResistances;
  token.damageImmunities = mon.damageImmunities;
  token.damageVulnerabilities = mon.damageVulnerabilities;
  token.traits = mon.traits;
  token.legendaryUses = mon.legendaryUses;
  token.legendaryLeft = mon.legendaryUses ?? 0;
  token.legendaryActions = mon.legendaryActions;
  token.legendaryResistLeft = mon.traits?.includes("legendary_resistance") ? 3 : 0;
  token.bonusActionIds = mon.bonusActions ?? token.bonusActionIds;
  token.hasBonusAction = Boolean(token.bonusActionIds.length);
  token.multiattack = mon.multiattack;
  token.actionPool = mon.actionPool ?? mon.actions;
  token.actionIds = token.actionPool ?? mon.actions;
  if (mon.traits?.includes("magma_aura")) {
    const effect = getAbility("magma_aura")?.effects[0] as
      | { type?: string; radiusCells?: number; damage?: Array<{ dice?: string; damageType?: string }> }
      | undefined;
    const part = effect?.damage?.[0];
    token.followAuras = [
      {
        radiusCells: Number(effect?.radiusCells ?? 1),
        filter: "all",
        excludeSource: true,
        onStartTurn: part?.dice ? { dice: part.dice, damageType: part.damageType ?? "fire" } : undefined,
      },
    ];
  }
}

function makeEnemyToken(
  mon: NonNullable<ReturnType<typeof getMonster>>,
  spot: { x: number; y: number },
  seq: number,
  nameExtra = "",
): CombatToken {
  const initRoll = rollD20() + abilityMod(mon.abilities.dex ?? 10);
  const token: CombatToken = {
    id: `en-${seq}`,
    kind: "enemy",
    name: `${mon.name}${nameExtra}`,
    x: spot.x,
    y: spot.y,
    hp: mon.hp,
    maxHp: mon.hp,
    ac: mon.ac,
    speedCells: mon.speedCells,
    movementLeft: mon.speedCells,
    hasAction: true,
    hasBonusAction: false,
    initiative: initRoll,
    monsterId: mon.id,
    actionIds: mon.actions,
    bonusActionIds: mon.bonusActions ?? [],
    inventory: [],
    dead: false,
    dodging: false,
    disengaging: false,
    hidden: false,
    secondWindUsed: false,
    reactionReady: true,
  };
  stampMonster(token, mon);
  return token;
}

export function startArenaCombat(opts: {
  map: ArenaMapDef;
  players: Array<{ playerId: string; characterId: string; characterName?: string; teamId?: string }>;
  level: number;
  teams: boolean;
  pve?: boolean;
  monsterId?: string;
  holdPcIds?: string[];
  /** Ranked keeps each hero's real level instead of scaling to the lobby number. */
  keepHeroLevels?: boolean;
}): CombatState {
  const map = opts.map;
  const walls = wallGrid(map as unknown as MapDef);
  const hazards = hazardGrid(map as unknown as MapDef);
  const tokens: CombatToken[] = [];
  opts.players.forEach((p, i) => {
    const raw = getPregen(p.characterId);
    if (!raw) throw new Error("BAD_CHARACTER");
    const pregen = opts.keepHeroLevels ? raw : scalePregenToLevel(raw, opts.level);
    const spot = opts.teams
      ? (p.teamId === "b" ? map.spawn.teamB : map.spawn.teamA)[opts.players.filter((x, j) => j < i && (x.teamId ?? "a") === (p.teamId ?? "a")).length] ??
        map.spawn.teamA[0]
      : map.spawn.ffa[i] ?? map.spawn.ffa[0];
    tokens.push({
      id: `pc-${p.playerId}`,
      kind: "pc",
      name: pregen.name,
      level: pregen.level,
      x: spot.x,
      y: spot.y,
      hp: pregen.hp,
      maxHp: pregen.hp,
      ac: pregen.ac,
      speedCells: pregen.speedCells ?? 6,
      movementLeft: pregen.speedCells ?? 6,
      hasAction: true,
      hasBonusAction: true,
      initiative: 0,
      playerId: p.playerId,
      characterId: pregen.id,
      teamId: opts.teams ? p.teamId ?? "a" : `ffa:${p.playerId}`,
      actionIds: actionIdsFor(pregen),
      bonusActionIds: bonusActionsFor(pregen),
      inventory: [...(pregen.inventory ?? [])],
      dead: false,
      dodging: false,
      disengaging: false,
      hidden: false,
      secondWindUsed: false,
      reactionReady: true,
    });
    const hero = tokens[tokens.length - 1]!;
    initSheet(hero, pregen);
    refreshMenus(hero, pregen, getAbility);
    if (!opts.holdPcIds?.includes(p.playerId)) hero.initiative = rollLiveInitiative(hero, pregen);
  });
  if (opts.pve) {
    const mon = getMonster(opts.monsterId ?? "");
    if (!mon) throw new Error("BAD_MONSTER");
    const heroSpot = tokens[0];
    const spot =
      map.spawn.teamB[0] ??
      map.spawn.ffa[1] ??
      map.spawn.ffa[0] ??
      { x: Math.min(map.width - 1, (heroSpot?.x ?? 0) + 4), y: heroSpot?.y ?? 0 };
    tokens.push(makeEnemyToken(mon, spot, 1));
  }
  const dexOf = (t: CombatToken) =>
    t.kind === "pc"
      ? (getPregen(t.characterId!)?.abilities.dex ?? 10)
      : (getMonster(t.monsterId!)?.abilities.dex ?? 10);
  const turnOrder = [...tokens].sort((a, b) => b.initiative - a.initiative || dexOf(b) - dexOf(a)).map((t) => t.id);
  const combat: CombatState = {
    encounterId: map.id,
    mapId: map.id,
    width: map.width,
    height: map.height,
    walls,
    hazards,
    tokens,
    turnOrder,
    turnIndex: 0,
    round: 1,
    log: [],
    reachable: [],
    status: "active",
    events: [],
    seq: 0,
    pvp: opts.pve ? undefined : opts.teams ? "teams" : "ffa",
    pve: opts.pve || undefined,
    placements: {},
    elimOrder: [],
    elimPulse: 0,
  };
  const holdIds = opts.holdPcIds ?? [];
  if (holdIds.length) {
    combat.gathering = true;
    combat.phoneIds = holdIds;
    combat.awaiting = holdIds.map((id) => ({
      id: `init-${id}`,
      playerId: id,
      label: "Initiative",
      step: "initiative" as const,
    }));
    emit(combat, {
      kind: "status",
      tokenId: tokens.find((t) => t.playerId === holdIds[0])?.id ?? tokens[0]!.id,
      ability: "Initiative",
      rolls: [],
      line: "Throw initiative on your phone.",
    });
    return combat;
  }
  emit(combat, {
    kind: "start",
    order: turnOrder,
    line: `Arena initiative: ${turnOrder.map((id) => tokens.find((t) => t.id === id)!.name).join(", ")}.`,
  });
  beginTurn(combat);
  settleEnemies(combat);
  return combat;
}

/** Older saves predate the event timeline; give them one so playback can resume. */
export function hydrateCombat(combat: CombatState): CombatState {
  if (!Array.isArray(combat.events)) combat.events = [];
  if (typeof combat.seq !== "number") combat.seq = 0;
  if (typeof combat.round !== "number") combat.round = 1;
  if (!combat.hazards?.length) {
    combat.hazards = Array.from({ length: combat.height }, () => Array.from({ length: combat.width }, () => false));
  }
  refreshReachable(combat);
  return combat;
}

function currentToken(combat: CombatState): CombatToken | undefined {
  const id = combat.turnOrder[combat.turnIndex];
  return combat.tokens.find((t) => t.id === id);
}

function stepIndex(combat: CombatState): void {
  combat.turnIndex += 1;
  if (combat.turnIndex >= combat.turnOrder.length) {
    combat.turnIndex = 0;
    combat.round += 1;
  }
}

function hasCondition(token: CombatToken, id: string): boolean {
  return Boolean(token.conditions?.includes(id));
}

export function refreshAuras(combat: CombatState): void {
  syncAuras(combat, (source) => {
    const token = combat.tokens.find((t) => t.id === source.id);
    if (!token) return 0;
    const pregen = token.characterId ? getPregen(token.characterId) : undefined;
    return auraSaveBonus(token, liveAbilities(token, pregen));
  });
}

function tickAuraPulse(combat: CombatState, token: CombatToken, aura: CombatAura, when: "start" | "enter"): void {
  const spec = when === "start" ? aura.onStartTurn : aura.onEnterOrEndTurn;
  if (!spec) return;
  if (when === "enter") {
    token.auraEnterTicked = token.auraEnterTicked ?? [];
    if (token.auraEnterTicked.includes(aura.id)) return;
    token.auraEnterTicked.push(aura.id);
  }
  if (spec.heal && token.hp <= 0 && !token.dead) {
    token.hp = Math.min(token.maxHp, token.hp + spec.heal);
  }
  if (spec.dice && spec.damageType) {
    applyDamage(combat, token, rollNotation(spec.dice).total, false, spec.damageType, true);
  }
}

export function tickAuraStart(combat: CombatState, token: CombatToken): void {
  for (const aura of combat.auras ?? []) {
    if (!auraAppliesTo(combat, aura, token)) continue;
    tickAuraPulse(combat, token, aura, "start");
  }
}

function tickAuraEnter(combat: CombatState, token: CombatToken): void {
  for (const aura of combat.auras ?? []) {
    if (!aura.onEnterOrEndTurn) continue;
    if (!auraAppliesTo(combat, aura, token)) continue;
    tickAuraPulse(combat, token, aura, "enter");
  }
}

function hasFeature(token: CombatToken, flag: string): boolean {
  return Boolean(token.features?.includes(flag) || token.kit?.flags.includes(flag));
}

function styleHas(token: CombatToken, style: string): boolean {
  return Boolean(token.fightingStyles?.includes(style) || token.fightingStyle === style);
}

function keepRage(token: CombatToken, onOwnTurn: boolean): void {
  if (!token.raging) return;
  token.rageLife = onOwnTurn ? 2 : 1;
  token.rageKept = true;
}

function grantFreeMove(token: CombatToken, cells: number): void {
  const n = Math.max(0, cells);
  token.freeMove = (token.freeMove ?? 0) + n;
  token.movementLeft += n;
}

function pushAway(combat: CombatState, from: CombatToken, target: CombatToken, cells: number): number {
  const dx = Math.sign(target.x - from.x);
  const dy = Math.sign(target.y - from.y);
  if (!dx && !dy) return 0;
  let moved = 0;
  for (let i = 0; i < cells; i += 1) {
    const nx = target.x + dx;
    const ny = target.y + dy;
    if (!inBounds(combat, nx, ny) || blockedMove(combat, nx, ny) || tokenAt(combat, nx, ny, target.id)) break;
    target.x = nx;
    target.y = ny;
    moved += 1;
  }
  return moved;
}

function saveBonus(token: CombatToken, ability: string): number {
  if (token.saves && token.saves[ability] != null) return token.saves[ability]!;
  return monsterSaveBonus(token, ability);
}

function d20Mode(advantage: boolean, disadvantage: boolean): D20Mode {
  return advantage === disadvantage ? "normal" : advantage ? "advantage" : "disadvantage";
}

function isWeaponAttack(effect: Record<string, unknown> | undefined): boolean {
  return Boolean(effect && effect.type === "attack" && !effect.spellAttack);
}

function cannotAct(token: CombatToken): boolean {
  const tier = token.exhaustionLevel ?? 0;
  if (tier >= 5) return true;
  return hasCondition(token, "incapacitated") || hasCondition(token, "paralyzed") || hasCondition(token, "unconscious");
}

function syncExhaustionCap(token: CombatToken): void {
  if (token.baseMaxHp == null) token.baseMaxHp = token.maxHp;
  const tier = clampExhaustion(token.exhaustionLevel ?? 0);
  token.maxHp = effectiveMaxHp(token.baseMaxHp, tier);
  if (token.hp > token.maxHp) token.hp = token.maxHp;
  token.conditions = tier > 0 ? setExhaustion(token.conditions ?? [], tier) : (token.conditions ?? []).filter((c) => c !== "exhaustion");
}

export function applyExhaustionLevel(combat: CombatState, token: CombatToken, level: number): void {
  token.exhaustionLevel = clampExhaustion(level);
  syncExhaustionCap(token);
  if (exhaustionKills(token.exhaustionLevel)) markDead(combat, token);
}

function wakeFromDying(token: CombatToken): void {
  token.dying = false;
  token.stable = false;
  token.deathSuccesses = 0;
  token.deathFailures = 0;
}

function stripTurn(token: CombatToken): void {
  token.movementLeft = 0;
  token.hasAction = false;
  token.hasBonusAction = false;
  token.extraAction = false;
}

function beginTurn(combat: CombatState): void {
  let guard = 0;
  while (guard < combat.turnOrder.length + 1) {
    const t = currentToken(combat);
    if (t && exhaustionKills(t.exhaustionLevel ?? 0)) {
      markDead(combat, t);
      stepIndex(combat);
      guard += 1;
      continue;
    }
    if (!t || t.dead) {
      stepIndex(combat);
      guard += 1;
      continue;
    }
    if (t.kind === "pc" && (t.dying || t.stable)) {
      if (t.dying && !t.stable) {
        if (t.playerId && combat.phoneIds?.includes(t.playerId)) {
          const id = `death-${t.playerId}`;
          if (!combat.awaiting?.some((a) => a.id === id)) {
            combat.awaiting = [...(combat.awaiting ?? []), { id, playerId: t.playerId, label: "Death save", step: "death" }];
          }
          emit(combat, { kind: "turn", tokenId: t.id, round: combat.round, line: `Round ${combat.round} — ${t.name} is down.` });
          combat.reachable = [];
          return;
        }
        resolveDeathSave(combat, t);
      }
      if (combat.status !== "active") return;
      if (t.dead || t.dying || t.stable) {
        if (!t.dead) {
          emit(combat, { kind: "turn", tokenId: t.id, round: combat.round, line: `Round ${combat.round} — ${t.name} is down.` });
        }
        stepIndex(combat);
        guard += 1;
        continue;
      }
    } else if (hasCondition(t, "incapacitated") || hasCondition(t, "paralyzed") || hasCondition(t, "unconscious")) {
      if (t.kind === "pc") {
        t.movementLeft = 0;
        t.hasAction = false;
        t.hasBonusAction = false;
        t.reactionReady = false;
        emit(combat, { kind: "turn", tokenId: t.id, round: combat.round, line: `Round ${combat.round} — ${t.name} cannot act.` });
        combat.reachable = [];
        return;
      }
      stepIndex(combat);
      guard += 1;
      continue;
    }
    break;
  }
  const t = currentToken(combat);
  if (!t || t.dead) {
    checkEnd(combat);
    combat.reachable = [];
    return;
  }
  resolveStartOfTurnDamage(combat, t);
  if (t.dead) {
    checkEnd(combat);
    combat.reachable = [];
    return;
  }
  t.movementLeft = t.speedCells;
  if (hasCondition(t, "restrained") || hasCondition(t, "paralyzed") || hasCondition(t, "unconscious") || hasCondition(t, "grappled")) t.movementLeft = 0;
  if (hasCondition(t, "slowed")) t.movementLeft = Math.max(0, t.movementLeft - 2);
  if (t.slowedBy) t.movementLeft = Math.max(0, t.movementLeft - t.slowedBy.cells);
  t.hasAction = true;
  t.hasBonusAction = t.kind === "pc";
  t.dashUndo = undefined;
  t.dodging = false;
  t.disengaging = false;
  t.helpingTargetId = undefined;
  t.sneakUsed = false;
  t.acBonus = 0;
  t.reactionReady = true;
  t.castLeveled = false;
  t.castBonusSpell = false;
  t.reckless = false;
  t.extraAction = false;
  t.attackedThisTurn = false;
  t.attacksLeft = 0;
  t.rolledAttack = false;
  t.frenzyUsed = false;
  t.brutalUsed = false;
  t.savageUsed = false;
  t.cleaveUsed = false;
  t.freeMove = 0;
  t.rageKept = false;
  t.auraEnterTicked = [];
  if (hasFeature(t, "heroic_warrior") && !t.heroicInspiration) t.heroicInspiration = true;
  if (hasFeature(t, "countercharm")) {
    for (const other of combat.tokens) other.countercharm = false;
  }
  const pregenTurn = t.characterId ? getPregen(t.characterId) : undefined;
  onClassTurn(t, t.level ?? pregenTurn?.level ?? 1, pregenTurn?.abilities ?? {}, combat.round);
  refreshAuras(combat);
  if ((t.auraSpeedMult ?? 1) < 1) t.movementLeft = Math.floor(t.movementLeft * (t.auraSpeedMult ?? 1));
  tickAuraStart(combat, t);
  if (t.raging && hasFeature(t, "mindless_rage")) {
    t.conditions = (t.conditions ?? []).filter((c) => c !== "charmed" && c !== "frightened");
  }
  for (const other of combat.tokens) {
    if (other.sappedBy === t.id) other.sappedBy = undefined;
    if (other.slowedBy?.by === t.id) other.slowedBy = undefined;
  }
  if (t.spiritualRounds) t.spiritualRounds -= 1;
  if (t.webCooldown) t.webCooldown -= 1;
  if (t.kind === "enemy") {
    t.legendaryLeft = t.legendaryUses ?? 0;
    t.hasBonusAction = Boolean(t.bonusActionIds.length);
    const recIds = [...t.actionIds, ...t.bonusActionIds, ...(t.legendaryActions ?? [])];
    if (!t.rechargeReady) t.rechargeReady = {};
    for (const id of recIds) {
      const rec = resolvedEffect(id)?.recharge as { min: number; max: number } | undefined;
      if (!rec || t.rechargeReady[id] !== false) continue;
      const roll = rollNotation("1d6");
      const ready = roll.total >= rec.min && roll.total <= rec.max;
      if (ready) t.rechargeReady[id] = true;
      emit(combat, {
        kind: "status",
        tokenId: t.id,
        ability: "recharge",
        rolls: [
          makeDiceRoll({
            roller: t.name,
            notation: "1d6",
            values: roll.values,
            sides: roll.sides,
            modifier: roll.modifier,
            total: roll.total,
            purpose: "check",
            label: "Recharge",
          }),
        ],
        line: ready
          ? `${t.name} recharges a special action (${roll.total}).`
          : `${t.name} fails to recharge (${roll.total}).`,
      });
    }
  }
  if (t.sheetDriven && t.characterId) refreshMenus(t, getPregen(t.characterId), getAbility);
  emit(combat, { kind: "turn", tokenId: t.id, round: combat.round, line: `Round ${combat.round} — ${t.name}.` });
  refreshReachable(combat);
}

/** Resolve every enemy turn in initiative order until a living hero is up or the fight ends. */
function settleEnemies(combat: CombatState): void {
  const startRound = combat.round;
  let guard = 0;
  while (combat.status === "active" && !combat.pending && guard < combat.turnOrder.length * 2 + 4) {
    guard += 1;
    const cur = currentToken(combat);
    if (!cur || cur.dead) {
      checkEnd(combat);
      return;
    }
    if (cur.kind === "pc") {
      refreshReachable(combat);
      return;
    }
    if (combat.round > startRound) return;
    runEnemyTurn(combat, cur);
    if (combat.status !== "active" || combat.pending) return;
    stepIndex(combat);
    beginTurn(combat);
  }
  checkEnd(combat);
}

function advanceTurn(combat: CombatState): void {
  if (combat.status !== "active") return;
  stepIndex(combat);
  beginTurn(combat);
  settleEnemies(combat);
}

type AttackSpec = {
  id: string;
  name: string;
  range: number;
  bonus: number;
  damage: Array<{ dice: string; damageType: string }>;
  onHitSave?: { ability: string; dc: number; damage?: Array<{ dice: string; damageType: string }>; condition?: string };
  fireOnHit?: string;
};

type DamagePart = { dice: string; damageType: string; ability?: string };

function abilityScore(token: CombatToken | undefined, pregen: Pregen | undefined, key: string): number {
  const k = key as "str" | "dex" | "con" | "int" | "wis" | "cha";
  const over = token?.abilityOverride?.[k];
  if (over != null) return over;
  return pregen?.abilities[key] ?? 10;
}

function liveAbilities(token: CombatToken | undefined, pregen: Pregen | undefined): Record<string, number> {
  return {
    ...(pregen?.abilities ?? {}),
    str: abilityScore(token, pregen, "str"),
    dex: abilityScore(token, pregen, "dex"),
    con: abilityScore(token, pregen, "con"),
    int: abilityScore(token, pregen, "int"),
    wis: abilityScore(token, pregen, "wis"),
    cha: abilityScore(token, pregen, "cha"),
  };
}

/** "finesse" weapons use whichever of Strength or Dexterity is higher. */
function weaponAbility(token: CombatToken | undefined, pregen: Pregen | undefined, named: string): string {
  if (named !== "finesse") return named;
  return abilityScore(token, pregen, "dex") > abilityScore(token, pregen, "str") ? "dex" : "str";
}

function weaponNotation(part: DamagePart, token: CombatToken | undefined, pregen: Pregen | undefined): string {
  if (part.ability && /^\d+d\d+$/i.test(part.dice)) {
    const mod = abilityMod(abilityScore(token, pregen, weaponAbility(token, pregen, part.ability)));
    return `${part.dice}${mod >= 0 ? "+" : ""}${mod}`;
  }
  return part.dice;
}

function previewFromNotation(notation: string, damageType: string, crit: boolean): DamageDiePreview[] {
  const p = parseNotation(notation);
  if (!p) return [];
  const count = crit ? p.count * 2 : p.count;
  return Array.from({ length: count }, () => ({ sides: p.sides, damageType }));
}

function resolveStartOfTurnDamage(combat: CombatState, token: CombatToken): void {
  const pending = takeStartOfTurnDamage(token);
  for (const row of pending) {
    const rolls: DiceRoll[] = [];
    const amount = pushPartDamage(rolls, token.name, row.dice, row.damageType, row.label, false);
    applyDamage(combat, token, amount, false, row.damageType, true);
    statusEvent(
      combat,
      token,
      row.label,
      `${row.label} burns ${token.name} for ${amount} ${row.damageType} at the start of the turn.`,
      rolls,
    );
    if (token.dead) break;
  }
}

function sneakDice(token: CombatToken, pregen: Pregen | undefined): number {
  if (token.kit?.sneakDice) return token.kit.sneakDice;
  if (pregen?.traits?.includes("sneak_attack_2d6") || pregen?.class === "rogue") return 2;
  return 0;
}

function pushPartDamage(
  rolls: DiceRoll[],
  roller: string,
  notation: string,
  damageType: string,
  label: string,
  crit: boolean,
  opts: { floor?: number; twice?: boolean } = {},
): number {
  const r = rollNotation(notation, { crit, floor: opts.floor, twice: opts.twice });
  rolls.push(
    makeDiceRoll({
      roller,
      notation: crit ? critNotation(notation) : notation,
      values: r.values,
      sides: r.sides,
      modifier: r.modifier,
      total: r.total,
      purpose: "damage",
      label,
      damageType,
    }),
  );
  return r.total;
}

function resolvedEffect(id: string): Record<string, unknown> | undefined {
  const ability = getAbility(id);
  const effect = ability?.effects[0];
  if (!effect) return undefined;
  if (effect.ref) return resolvedEffect(String(effect.ref));
  return effect;
}

function abilityReady(token: CombatToken, id: string): boolean {
  const effect = resolvedEffect(id);
  if (!effect) return false;
  const rec = effect.recharge as { min: number; max: number } | undefined;
  if (rec && token.rechargeReady?.[id] === false) return false;
  const uses = effect.usesPerDay as number | undefined;
  if (uses != null && (token.abilityUses?.[id] ?? uses) <= 0) return false;
  return true;
}

function spendMonsterAbility(token: CombatToken, id: string): void {
  const effect = resolvedEffect(id);
  if (!effect) return;
  if (effect.recharge) {
    if (!token.rechargeReady) token.rechargeReady = {};
    token.rechargeReady[id] = false;
  }
  const uses = effect.usesPerDay as number | undefined;
  if (uses != null) {
    if (!token.abilityUses) token.abilityUses = {};
    token.abilityUses[id] = (token.abilityUses[id] ?? uses) - 1;
  }
}

function harmAmount(target: CombatToken, amount: number, damageType: string): number {
  const t = damageType.toLowerCase();
  if (target.damageImmunities?.includes(t)) return 0;
  let n = amount;
  if (target.damageVulnerabilities?.includes(t)) n *= 2;
  if (target.damageResistances?.includes(t) || target.auraResistances?.includes(t)) n = Math.floor(n / 2);
  return n;
}

function creatureSave(
  token: CombatToken,
  ability: string,
  dc: number,
  isMagic: boolean,
): { roll: DiceRoll; ok: boolean } {
  const key = ability.toLowerCase();
  let advantage = Boolean(isMagic && token.traits?.includes("magic_resistance"));
  if (token.auraSaveAdv === "all" || (token.auraSaveAdv === "vs_magic" && isMagic)) advantage = true;
  let disadvantage = false;
  if (key === "dex" && hasFeature(token, "danger_sense") && !cannotAct(token) && !hasCondition(token, "blinded")) advantage = true;
  if (token.countercharm && (key === "wis" || key === "cha")) advantage = true;
  if (key === "str" && token.raging) advantage = true;
  if (hasCondition(token, "poisoned") || hasCondition(token, "frightened")) disadvantage = true;
  let banePenalty = 0;
  if (token.baned) banePenalty = rollNotation("1d4").total;
  const bonus = saveBonus(token, key) + (token.auraBonus ?? 0) - banePenalty;
  const label = `${ability.toUpperCase()} save`;
  const once = (mode: D20Mode, extra = 0) =>
    rollCheck({
      roller: token.name,
      label,
      bonus: bonus + extra,
      dc,
      purpose: "save",
      mode,
    });
  let mode = d20Mode(advantage, disadvantage);
  let roll = once(mode);
  let ok = roll.outcome === "success";
  if (!ok) {
    const luck = fiendLuck(token);
    if (luck) {
      const total = roll.total + luck;
      roll = { ...roll, total, outcome: total >= dc ? "success" : "fail" };
      ok = roll.outcome === "success";
    }
  }
  if (!ok && (token.indomitableLeft ?? 0) > 0) {
    token.indomitableLeft = (token.indomitableLeft ?? 0) - 1;
    const extra = token.kit?.fighterLevel ?? token.level ?? 1;
    roll = once("normal", extra);
    ok = roll.outcome === "success";
  }
  if (!ok && token.heroicInspiration) {
    token.heroicInspiration = false;
    roll = once(mode);
    ok = roll.outcome === "success";
  }
  if (!ok && token.traits?.includes("legendary_resistance") && (token.legendaryResistLeft ?? 0) > 0) {
    token.legendaryResistLeft = (token.legendaryResistLeft ?? 0) - 1;
    ok = true;
  }
  return { roll, ok };
}

function enemyAttacks(enemy: CombatToken): AttackSpec[] {
  const out: AttackSpec[] = [];
  for (const id of enemy.actionIds) {
    if (!abilityReady(enemy, id)) continue;
    const ability = getAbility(id);
    const effect = resolvedEffect(id);
    if (!ability || !effect || effect.type !== "attack") continue;
    const perTurn = (effect.onHit as Array<{ type: string; dice?: string }> | undefined)?.find(
      (h) => h.type === "damage_per_turn_start",
    );
    out.push({
      id,
      name: ability.name,
      range: Number(effect.rangeCells ?? 1),
      bonus: Number(effect.attackBonus ?? 0),
      damage: (effect.damage as AttackSpec["damage"] | undefined) ?? [],
      onHitSave: effect.onHitSave as AttackSpec["onHitSave"],
      fireOnHit: perTurn?.dice,
    });
  }
  return out;
}

function pickEnemyAttack(
  combat: CombatState,
  enemy: CombatToken,
  attacks: AttackSpec[],
  target: CombatToken,
): AttackSpec | undefined {
  if (!clearShot(combat, enemy.x, enemy.y, target.x, target.y)) return undefined;
  const dist = chebyshev(enemy.x, enemy.y, target.x, target.y);
  const inReach = attacks.filter((a) => a.range >= dist && (a.range <= 1 || !enemy.webCooldown));
  if (!inReach.length) return undefined;
  if (dist <= 1) return inReach.find((a) => a.range <= 1) ?? inReach[0];
  return inReach.sort((a, b) => a.range - b.range)[0];
}

function runEnemyTurn(combat: CombatState, enemy: CombatToken): void {
  bumpElimPulse(combat);
  const pcs = combat.tokens.filter((t) => t.kind === "pc" && !t.dead);
  if (!pcs.length) {
    checkEnd(combat);
    return;
  }
  pcs.sort(
    (a, b) =>
      chebyshev(enemy.x, enemy.y, a.x, a.y) - chebyshev(enemy.x, enemy.y, b.x, b.y) ||
      a.hp - b.hp,
  );
  const target = pcs[0]!;
  const attacks = enemyAttacks(enemy);
  const melee = attacks.some((a) => a.range <= 1);
  const startDist = chebyshev(enemy.x, enemy.y, target.x, target.y);

  const shouldMove =
    startDist > 1 &&
    !hasCondition(enemy, "frightened") &&
    (melee || !pickEnemyAttack(combat, enemy, attacks, target));
  let moved = false;
  if (shouldMove) {
    const visits = explore(combat, enemy, enemy.movementLeft);
    let best: Visit | null = null;
    let bestDist = startDist;
    for (const v of bestVisits(combat, enemy, visits).values()) {
      const d = chebyshev(v.x, v.y, target.x, target.y);
      if (d < bestDist || (best && d === bestDist && v.cost < best.cost)) {
        best = v;
        bestDist = d;
      }
    }
    if (best) {
      const path = unwind(visits, best);
      enemy.x = best.x;
      enemy.y = best.y;
      enemy.movementLeft = Math.max(0, enemy.movementLeft - best.cost);
      moved = true;
      emit(combat, {
        kind: "move",
        tokenId: enemy.id,
        path,
        line: `${enemy.name} ${bestDist <= 1 ? "closes on" : "stalks toward"} ${target.name}.`,
      });
    }
  }

  const saveId = pickEnemySave(combat, enemy, target);
  const attack = pickEnemyAttack(combat, enemy, attacks, target);
  if (enemy.hasAction) {
    enemy.hasAction = false;
    if (saveId && resolvedEffect(saveId)?.recharge) {
      enemySaveCast(combat, enemy, target, saveId);
    } else if (enemy.multiattack?.length) {
      for (const id of enemy.multiattack) {
        if (!abilityReady(enemy, id) || combat.status !== "active") continue;
        const spec = enemyAttacks({ ...enemy, actionIds: [id] })[0];
        if (spec) {
          spendMonsterAbility(enemy, id);
          enemyStrike(combat, enemy, target, spec);
          if (combat.pending) break;
        } else if (resolvedEffect(id)?.type === "save") {
          enemySaveCast(combat, enemy, target, id);
        }
      }
    } else if (saveId) {
      enemySaveCast(combat, enemy, target, saveId);
    } else if (attack) {
      spendMonsterAbility(enemy, attack.id);
      enemyStrike(combat, enemy, target, attack);
    } else if (!moved) {
      emit(combat, {
        kind: "status",
        tokenId: enemy.id,
        ability: "wait",
        rolls: [],
        line: `${enemy.name} hisses and waits for an opening.`,
      });
    }
  } else if (!moved) {
    emit(combat, {
      kind: "status",
      tokenId: enemy.id,
      ability: "wait",
      rolls: [],
      line: `${enemy.name} hisses and waits for an opening.`,
    });
  }
  if (enemy.hasBonusAction) {
    const bonus = enemy.bonusActionIds.find((id) => resolvedEffect(id)?.type === "disengage");
    if (bonus) {
      enemy.hasBonusAction = false;
      enemy.disengaging = true;
      emit(combat, {
        kind: "status",
        tokenId: enemy.id,
        ability: getAbility(bonus)?.name ?? "Disengage",
        rolls: [],
        line: `${enemy.name} slips away (Disengage).`,
      });
    }
  }
  enemy.hasAction = false;
  enemy.movementLeft = 0;
  checkEnd(combat);
}

function pickEnemySave(combat: CombatState, enemy: CombatToken, target: CombatToken): string | undefined {
  if (!clearShot(combat, enemy.x, enemy.y, target.x, target.y)) return undefined;
  const dist = chebyshev(enemy.x, enemy.y, target.x, target.y);
  const ids = enemy.actionIds.filter((id) => {
    const effect = resolvedEffect(id);
    return effect?.type === "save" && abilityReady(enemy, id) && Number(effect.rangeCells ?? 1) >= dist;
  });
  ids.sort((a, b) => (resolvedEffect(a)?.recharge ? 0 : 1) - (resolvedEffect(b)?.recharge ? 0 : 1));
  return ids[0];
}

function enemySaveCast(combat: CombatState, enemy: CombatToken, target: CombatToken, id: string): void {
  const ability = getAbility(id);
  const effect = resolvedEffect(id);
  if (!ability || !effect) return;
  spendMonsterAbility(enemy, id);
  const dc = Number(effect.dc ?? 12);
  const saveKey = String(effect.ability ?? "dex");
  const { roll, ok } = creatureSave(target, saveKey, dc, false);
  const rolls: DiceRoll[] = [roll];
  const parts = (effect.damage as AttackSpec["damage"] | undefined) ?? [];
  let damage = 0;
  for (const part of parts) {
    const r = rollNotation(part.dice);
    damage += r.total;
    rolls.push(
      makeDiceRoll({
        roller: enemy.name,
        notation: part.dice,
        values: r.values,
        sides: r.sides,
        modifier: r.modifier,
        total: r.total,
        purpose: "damage",
        label: `${part.damageType} damage`,
        damageType: part.damageType,
      }),
    );
  }
  if (ok && effect.halfOnSuccess) damage = Math.floor(damage / 2);
  else if (ok) damage = 0;
  if (!ok && effect.condition) addCondition(target, String(effect.condition));
  const dtype = parts[0]?.damageType ?? "untyped";
  emit(combat, {
    kind: "strike",
    tokenId: enemy.id,
    ability: ability.name,
    style: "spell",
    rolls,
    hits: [{ targetId: target.id, outcome: ok ? "success" : "fail", damage, hp: Math.max(0, target.hp - damage) }],
    line: `${enemy.name} uses ${ability.name}. ${target.name} ${ok ? "saves" : "fails"} (DC ${dc}). ${damage} damage.`,
  });
  if (damage > 0) applyDamage(combat, target, damage, false, dtype);
}

function runLegendaryWindow(combat: CombatState, justActed: CombatToken): void {
  if (combat.status !== "active") return;
  for (const t of combat.tokens) {
    if (t.kind !== "enemy" || t.dead || t.id === justActed.id) continue;
    if (!(t.legendaryLeft && t.legendaryLeft > 0)) continue;
    const target = combat.tokens.filter((p) => p.kind === "pc" && !p.dead)[0];
    if (!target) continue;
    const ids = (t.legendaryActions ?? []).filter((id) => abilityReady(t, id));
    if (!ids.length) continue;
    t.legendaryLeft -= 1;
    const spec = enemyAttacks({ ...t, actionIds: ids })[0];
    emit(combat, {
      kind: "status",
      tokenId: t.id,
      ability: "legendary",
      rolls: [],
      line: `${t.name} takes a legendary action.`,
    });
    if (spec) {
      spendMonsterAbility(t, spec.id);
      enemyStrike(combat, t, target, spec);
    } else if (resolvedEffect(ids[0]!)?.type === "save") {
      enemySaveCast(combat, t, target, ids[0]!);
    }
    if (combat.status !== "active") return;
  }
}

function enemyStrike(combat: CombatState, enemy: CombatToken, target: CombatToken, attack: AttackSpec): void {
  if (!clearShot(combat, enemy.x, enemy.y, target.x, target.y)) return;
  const pack =
    enemy.traits?.includes("pack_tactics") &&
    combat.tokens.some((a) => a.kind === "enemy" && !a.dead && a.id !== enemy.id && chebyshev(a.x, a.y, target.x, target.y) <= 1);
  const unseen = Boolean(target.invisible) || Boolean(target.blur);
  const advantage = pack || Boolean(target.reckless);
  const disadvantage =
    target.dodging ||
    unseen ||
    hasCondition(enemy, "poisoned") ||
    hasCondition(enemy, "blinded") ||
    Boolean(enemy.sappedBy);
  const mode: D20Mode = d20Mode(advantage, disadvantage);
  if (enemy.sappedBy) enemy.sappedBy = undefined;
  const roll = rollAttack({
    roller: enemy.name,
    label: `${attack.name} vs ${target.name}`,
    bonus: attack.bonus,
    ac: effectiveAc(target),
    mode,
  });
  const rolls: DiceRoll[] = [roll];
  const landed = roll.outcome === "hit" || roll.outcome === "crit";
  const crit = roll.outcome === "crit";
  let damage = 0;
  if (landed) {
    for (const part of attack.damage) {
      const r = rollNotation(part.dice, { crit });
      damage += r.total;
      rolls.push(
        makeDiceRoll({
          roller: enemy.name,
          notation: crit ? critNotation(part.dice) : part.dice,
          values: r.values,
          sides: r.sides,
          modifier: r.modifier,
          total: r.total,
          purpose: "damage",
          label: `${part.damageType} damage`,
          damageType: part.damageType,
        }),
      );
    }
    if (attack.fireOnHit) {
      const r = rollNotation(attack.fireOnHit, { crit });
      damage += r.total;
      enemy.webCooldown = 2;
      rolls.push(
        makeDiceRoll({
          roller: enemy.name,
          notation: attack.fireOnHit,
          values: r.values,
          sides: r.sides,
          modifier: r.modifier,
          total: r.total,
          purpose: "damage",
          label: "burning silk",
          damageType: "fire",
        }),
      );
    }
    if (attack.onHitSave?.damage?.length) {
      const pregen = target.characterId ? getPregen(target.characterId) : undefined;
      const score = abilityScore(target, pregen, attack.onHitSave.ability);
      const proficient = (pregen as { savingThrows?: string[] } | undefined)?.savingThrows?.includes(
        attack.onHitSave.ability,
      );
      const bonus = abilityMod(score) + (proficient ? pregen?.proficiencyBonus ?? 2 : 0);
      const save = rollCheck({
        roller: target.name,
        label: `${attack.onHitSave.ability.toUpperCase()} save`,
        bonus,
        dc: attack.onHitSave.dc,
        purpose: "save",
      });
      rolls.push(save);
      if (save.outcome === "fail") {
        const part = attack.onHitSave.damage[0];
        const r = rollNotation(part.dice);
        damage += r.total;
        rolls.push(
          makeDiceRoll({
            roller: enemy.name,
            notation: part.dice,
            values: r.values,
            sides: r.sides,
            modifier: r.modifier,
            total: r.total,
            purpose: "damage",
            label: `${part.damageType} damage`,
            damageType: part.damageType,
          }),
        );
      }
    }
  } else if (attack.fireOnHit) {
    enemy.webCooldown = 1;
  }
  const verb = attack.range > 1 ? "lashes a strand at" : "lunges at";
  const tail = landed
    ? `${crit ? "Critical! " : ""}${damage} damage.`
    : roll.outcome === "fumble"
      ? "It trips over its own feet."
      : "Miss.";
  const dtype = attack.damage[0]?.damageType ?? "piercing";
  if (
    landed &&
    damage > 0 &&
    holdForShield(combat, enemy, target, {
      damage,
      crit,
      attackTotal: roll.total,
      damageType: dtype,
      rolls,
      abilityName: attack.name,
      style: attack.range > 1 ? "ranged" : "melee",
      attackerId: enemy.id,
      targetId: target.id,
    })
  ) {
    return;
  }
  const hpAfter = Math.max(0, target.hp - damage);
  emit(combat, {
    kind: "strike",
    tokenId: enemy.id,
    ability: attack.name,
    style: attack.range > 1 ? "ranged" : "melee",
    rolls,
    hits: [{ targetId: target.id, outcome: roll.outcome ?? "miss", damage, hp: hpAfter }],
    line: `${enemy.name} ${verb} ${target.name}: ${roll.total} vs AC ${effectiveAc(target)}${mode === "disadvantage" ? (target.dodging ? " (dodging)" : " (unseen)") : ""}. ${tail}`,
  });
  if (damage > 0) applyDamage(combat, target, damage, crit, dtype);
  if (combat.status === "active" && damage > 0) offerRetaliation(combat, enemy, target);
}

function bumpElimPulse(combat: CombatState): void {
  combat.elimPulse = (combat.elimPulse ?? 0) + 1;
}

function recordElimination(combat: CombatState, target: CombatToken): void {
  if (target.kind !== "pc" || !combat.pvp) return;
  combat.elimOrder = combat.elimOrder ?? [];
  if (combat.elimOrder.some((row) => row.startsWith(`${target.id}:`))) return;
  combat.elimOrder.push(`${target.id}:${combat.elimPulse ?? 0}`);
}

function finalizePlacements(combat: CombatState): void {
  if (!combat.pvp) return;
  const pcs = combat.tokens.filter((t) => t.kind === "pc");
  const placements: Record<string, number> = { ...(combat.placements ?? {}) };
  const groups = new Map<number, string[]>();
  for (const row of combat.elimOrder ?? []) {
    const [id, pulse] = row.split(":");
    if (!id) continue;
    const wave = Number(pulse);
    const list = groups.get(wave) ?? [];
    list.push(id);
    groups.set(wave, list);
  }
  const waves = [...groups.keys()].sort((a, b) => a - b);
  let remaining = pcs.length;
  for (const wave of waves) {
    const ids = groups.get(wave) ?? [];
    remaining -= ids.length;
    const place = Math.max(1, remaining + 1);
    for (const id of ids) placements[id] = place;
  }
  const survivors = pcs.filter((t) => !t.dead);
  const survivorPlace = survivors.length > 1 && combat.status === "draw" ? 1 : 1;
  for (const t of survivors) placements[t.id] = survivorPlace;
  combat.placements = placements;
}

function checkEnd(combat: CombatState): void {
  if (combat.status !== "active") return;
  if (combat.pvp) {
    const live = combat.tokens.filter((t) => t.kind === "pc" && !t.dead);
    if (combat.pvp === "ffa") {
      if (live.length === 1) {
        combat.status = "victory";
        combat.pvpWinner = live[0]!.name;
        combat.reachable = [];
        finalizePlacements(combat);
        emit(combat, { kind: "end", outcome: "victory", line: `${live[0]!.name} is the last one standing.` });
      } else if (live.length === 0) {
        combat.status = "draw";
        combat.reachable = [];
        finalizePlacements(combat);
        emit(combat, { kind: "end", outcome: "defeat", line: "No one remains standing. Draw." });
      }
      return;
    }
    const standing = new Set(
      live.filter((t) => !t.dying || t.hp > 0).map((t) => t.teamId).filter(Boolean),
    );
    // Dying still counts for the team.
    const teamsLeft = new Set(live.map((t) => t.teamId).filter(Boolean));
    if (teamsLeft.size <= 1) {
      const id = [...teamsLeft][0];
      const name = id === "a" ? "Team A" : id === "b" ? "Team B" : "The last team";
      if (!id) {
        combat.status = "draw";
        finalizePlacements(combat);
        emit(combat, { kind: "end", outcome: "defeat", line: "Both teams fall. Draw." });
      } else {
        combat.status = "victory";
        combat.pvpWinner = name;
        finalizePlacements(combat);
        emit(combat, { kind: "end", outcome: "victory", line: `${name} holds the floor.` });
      }
      combat.reachable = [];
    }
    void standing;
    return;
  }
  const pcsAlive = combat.tokens.some((t) => t.kind === "pc" && !t.dead);
  const enemiesAlive = combat.tokens.some((t) => t.kind === "enemy" && !t.dead);
  if (!enemiesAlive) {
    combat.status = "victory";
    combat.reachable = [];
    const hero = combat.tokens.find((t) => t.kind === "pc");
    if (combat.pve && hero) combat.pvpWinner = hero.name;
    emit(combat, { kind: "end", outcome: "victory", line: "The last foe falls. Victory!" });
  } else if (!pcsAlive) {
    combat.status = "defeat";
    combat.reachable = [];
    const foe = combat.tokens.find((t) => t.kind === "enemy");
    if (combat.pve && foe) combat.pvpWinner = foe.name;
    emit(combat, { kind: "end", outcome: "defeat", line: "The party falls…" });
  }
}

export function proposeMove(
  combat: CombatState,
  playerId: string,
  x: number,
  y: number,
): void {
  if (combat.status !== "active") throw new Error("COMBAT_OVER");
  if (combat.pending) throw new Error("REACTION_PENDING");
  const t = currentToken(combat);
  if (!t || t.kind !== "pc" || t.playerId !== playerId) throw new Error("NOT_YOUR_TURN");
  if (t.dying || t.stable || cannotAct(t)) throw new Error("DYING");
  const route = pathTo(combat, t, x, y);
  if (!route || route.cost > t.movementLeft) throw new Error("UNREACHABLE");
  commitMove(combat, t, route.path, route.cost);
  refreshReachable(combat);
}

/** Attack, heal, and save spells are dice. Dash and the like are not. */
export function actionNeedsThrow(abilityId: string): "attack" | "once" | "none" {
  const id = abilityId.startsWith("quicken:") ? abilityId.slice("quicken:".length) : abilityId;
  const type = getAbility(id)?.effects[0]?.type;
  if (type === "attack") return "attack";
  if (type === "auto_hit" || type === "save" || type === "heal") return "once";
  return "none";
}

export function performAttack(
  combat: CombatState,
  playerId: string,
  abilityId: string,
  targetId?: string,
  dest?: Cell,
  gate?: { phase: "d20" } | { phase: "damage"; strike: StrikeHold },
): { rolls: DiceRoll[]; strike?: StrikeHold } {
  return performPcAction(combat, playerId, abilityId, targetId, dest, gate);
}

function pcSpellDc(token: CombatToken | undefined, pregen: Pregen | undefined, ability: string): number {
  const prof = pregen?.proficiencyBonus ?? 2;
  return 8 + prof + abilityMod(abilityScore(token, pregen, ability));
}

function monsterSaveBonus(token: CombatToken, ability: string): number {
  if (token.saves && token.saves[ability] != null) return token.saves[ability]!;
  const mon = token.monsterId ? getMonster(token.monsterId) : undefined;
  if (mon?.saves && mon.saves[ability] != null) return mon.saves[ability]!;
  return abilityMod(mon?.abilities[ability] ?? 10);
}

function statusEvent(combat: CombatState, t: CombatToken, ability: string, line: string, rolls: DiceRoll[] = []): void {
  emit(combat, { kind: "status", tokenId: t.id, ability, rolls, line });
}

function attachSpellDuration(token: CombatToken, castId: string): void {
  const bare = castId.replace(/^spell_/, "");
  const spell = catalogEntry<SpellDef>("spell", bare);
  const turns = durationToPcTurns(spell?.duration);
  if (!turns || turns <= 0) return;
  token.timedEffects = [...(token.timedEffects ?? []), { label: spell?.name ?? bare, pcTurnsLeft: turns, spellId: castId }];
}

function setConcentration(combat: CombatState, token: CombatToken, castId: string, targetId?: string): void {
  if (token.concentrating && token.concentrating.spellId !== castId) breakConcentration(combat, token);
  token.concentrating = { spellId: castId, targetId };
  attachSpellDuration(token, castId);
}

function tokenCastBlocked(token: CombatToken, level: number, asBonus: boolean): boolean {
  if (level <= 0) return false;
  if (token.castBonusSpell) return true;
  if (asBonus && token.castLeveled) return true;
  return false;
}

function addCondition(token: CombatToken, id: string): void {
  if (!token.conditions) token.conditions = [];
  if (!token.conditions.includes(id)) token.conditions.push(id);
}

function spellKey(token: CombatToken, pregen: Pregen | undefined, named: string): string {
  if (named === "spell") return token.spellAbility ?? (pregen as { spellAbility?: string } | undefined)?.spellAbility ?? "int";
  return weaponAbility(token, pregen, named);
}

function castSpecial(
  combat: CombatState,
  t: CombatToken,
  pregen: Pregen | undefined,
  name: string,
  effect: Record<string, unknown>,
  isBonus: boolean,
  targetId: string | undefined,
  dest: Cell | undefined,
  castId: string,
): { rolls: DiceRoll[] } | null {
  const classCast = castClassFeature(t, String(effect.type ?? ""), {
    allies: combat.tokens.filter((a) => isFriend(combat, t, a) && !a.dead),
    foes: combat.tokens.filter((a) => isFoe(combat, t, a) && !a.dead),
    target: targetId ? combat.tokens.find((x) => x.id === targetId) : undefined,
    level: pregen?.level ?? t.level ?? 1,
    abilities: liveAbilities(t, pregen),
    prof: pregen?.proficiencyBonus ?? 2,
    maxSlots: (pregen as { spellSlots?: Record<string, number> } | undefined)?.spellSlots,
  });
  if (classCast) {
    spendEconomy(t, isBonus);
    statusEvent(combat, t, name, classCast.line, classCast.rolls);
    refreshReachable(combat);
    return { rolls: classCast.rolls };
  }
  if (effect.type === "rage") {
    if ((t.ragesLeft ?? 0) <= 0) throw new Error("ALREADY_USED");
    if (t.heavyArmor) throw new Error("HEAVY_ARMOR");
    t.ragesLeft = (t.ragesLeft ?? 0) - 1;
    t.raging = true;
    keepRage(t, true);
    if (t.concentrating) breakConcentration(combat, t);
    if (hasFeature(t, "mindless_rage")) {
      t.conditions = (t.conditions ?? []).filter((c) => c !== "charmed" && c !== "frightened");
    }
    if (hasFeature(t, "instinctive_pounce")) grantFreeMove(t, Math.floor(t.speedCells / 2));
    spendEconomy(t, true);
    statusEvent(combat, t, name, `${t.name} rages. Blows land harder, and steel bites less.`);
    refreshReachable(combat);
    return { rolls: [] };
  }
  if (effect.type === "rage_extend") {
    if (!t.raging) throw new Error("BAD_ABILITY");
    keepRage(t, true);
    spendEconomy(t, true);
    statusEvent(combat, t, name, `${t.name} feeds the rage. It will last.`);
    return { rolls: [] };
  }
  if (effect.type === "reckless") {
    t.reckless = true;
    statusEvent(combat, t, name, `${t.name} attacks with abandon. Foes will find the opening.`);
    return { rolls: [] };
  }
  if (effect.type === "surge") {
    if (!t.actionSurge) throw new Error("ALREADY_USED");
    t.actionSurge = false;
    t.extraAction = true;
    t.hasAction = true;
    statusEvent(combat, t, name, `${t.name} surges into a second action.`);
    return { rolls: [] };
  }
  if (effect.type === "pool_heal") {
    const ally = targetId ? combat.tokens.find((x) => x.id === targetId && isFriend(combat, t, x)) : t;
    if (!ally) throw new Error("NEED_TARGET");
    const pool = t.layOnHands ?? 0;
    if (pool <= 0) throw new Error("ALREADY_USED");
    const need = ally.dying ? 1 : Math.max(0, ally.maxHp - ally.hp);
    const spent = Math.min(pool, Math.max(1, need));
    t.layOnHands = pool - spent;
    ally.hp = Math.min(ally.maxHp, ally.hp + spent);
    if (ally.hp > 0) wakeFromDying(ally);
    spendEconomy(t, false);
    statusEvent(combat, t, name, `${t.name} lays on hands. ${ally.name} recovers ${spent}.`);
    return { rolls: [] };
  }
  if (effect.type === "channel_preserve") {
    if ((t.channelDivinity ?? 0) <= 0) throw new Error("ALREADY_USED");
    t.channelDivinity = (t.channelDivinity ?? 0) - 1;
    let pool = 5 * (pregen?.level ?? 1);
    const allies = combat.tokens.filter((a) => isFriend(combat, t, a) && !a.dead && chebyshev(a.x, a.y, t.x, t.y) <= 6);
    for (const ally of allies) {
      const half = Math.floor(ally.maxHp / 2);
      if (ally.hp >= half || pool <= 0) continue;
      const gain = Math.min(pool, half - ally.hp);
      ally.hp += gain;
      pool -= gain;
      if (ally.hp > 0) wakeFromDying(ally);
    }
    spendEconomy(t, false);
    statusEvent(combat, t, name, `${t.name} releases a warm light. The wounded are drawn back from the edge.`);
    return { rolls: [] };
  }
  if (effect.type === "inspire") {
    if ((t.bardicLeft ?? 0) <= 0) throw new Error("ALREADY_USED");
    const ally = combat.tokens.find((x) => x.id === targetId && isFriend(combat, t, x) && x.id !== t.id);
    if (!ally) throw new Error("NEED_TARGET");
    t.bardicLeft = (t.bardicLeft ?? 0) - 1;
    ally.inspiration = (ally.inspiration ?? 0) + 1;
    spendEconomy(t, true);
    statusEvent(combat, t, name, `${t.name} inspires ${ally.name}. A d6 waits on their next roll.`);
    return { rolls: [] };
  }
  if (effect.type === "ki_dodge") {
    if ((t.ki ?? 0) < 1) throw new Error("NO_KI");
    t.ki = (t.ki ?? 0) - 1;
    t.dodging = true;
    if (hasFeature(t, "heightened_focus")) t.tempHp = Math.max(t.tempHp ?? 0, pregen?.level ?? 1);
    spendEconomy(t, true);
    statusEvent(combat, t, name, `${t.name} spends ki and dodges.`);
    return { rolls: [] };
  }
  if (effect.type === "ki_step") {
    if ((t.ki ?? 0) < 1) throw new Error("NO_KI");
    t.ki = (t.ki ?? 0) - 1;
    t.disengaging = true || hasFeature(t, "fleet_step");
    t.movementLeft += t.speedCells;
    spendEconomy(t, true);
    statusEvent(combat, t, name, `${t.name} spends ki, steps clear, and dashes.`);
    refreshReachable(combat);
    return { rolls: [] };
  }
  if (effect.type === "flurry") {
    if ((t.ki ?? 0) < 1) throw new Error("NO_KI");
    if (!targetId) throw new Error("NEED_TARGET");
    t.ki = (t.ki ?? 0) - 1;
    spendEconomy(t, true);
    const strike = getAbility("unarmed_strike");
    const blow = strike?.effects[0];
    if (!blow) throw new Error("NO_EFFECT");
    const first = resolveSpellAttack(combat, t, pregen, "Flurry of Blows", { ...blow, type: "attack" }, targetId, true, true);
    if (combat.status === "active" && !combat.pending) {
      resolveSpellAttack(combat, t, pregen, "Flurry of Blows", { ...blow, type: "attack" }, targetId, true, true);
    }
    if (hasFeature(t, "heightened_focus") && combat.status === "active" && !combat.pending) {
      resolveSpellAttack(combat, t, pregen, "Flurry of Blows", { ...blow, type: "attack" }, targetId, true, true);
    }
    return first;
  }
  if (effect.type === "mage_armor") {
    const dex = abilityMod(abilityScore(t, pregen, "dex"));
    t.ac = 13 + dex;
    if (effect.concentration) setConcentration(combat, t, castId);
    spendEconomy(t, isBonus);
    statusEvent(combat, t, name, `${t.name} is wrapped in mage armor. AC ${t.ac}.`);
    return { rolls: [] };
  }
  if (effect.type === "ward") {
    const ally = targetId ? combat.tokens.find((x) => x.id === targetId) : t;
    const who = ally && ally.kind === "pc" ? ally : t;
    if (effect.acBonus) who.acBonus = (who.acBonus ?? 0) + Number(effect.acBonus);
    if (effect.acFloor) who.acFloor = Number(effect.acFloor);
    if (effect.blur) who.blur = true;
    if (effect.invisible) who.invisible = true;
    if (effect.concentration || effect.duration === "concentration") setConcentration(combat, t, castId, who.id);
    spendEconomy(t, isBonus);
    statusEvent(combat, t, name, `${t.name} casts ${name}.`);
    return { rolls: [] };
  }
  if (effect.type === "brand") {
    if (!targetId) throw new Error("NEED_TARGET");
    const foe = combat.tokens.find((x) => x.id === targetId && isFoe(combat, t, x));
    if (!foe) throw new Error("BAD_TARGET");
    demandShot(combat, t, foe);
    for (const other of combat.tokens) {
      if (other.brand?.by === t.id) other.brand = undefined;
    }
    foe.brand = {
      by: t.id,
      dice: String(effect.dice ?? "1d6"),
      damageType: effect.damageType ? String(effect.damageType) : undefined,
      hexAbility: effect.hexAbility ? String(effect.hexAbility) : undefined,
      huntersMark: castId === "spell_hunters_mark",
    };
    setConcentration(combat, t, castId, foe.id);
    spendEconomy(t, isBonus);
    statusEvent(combat, t, name, `${t.name} brands ${foe.name}.`);
    return { rolls: [] };
  }
  if (effect.type === "teleport") {
    if (!dest) throw new Error("NEED_TARGET");
    const range = Number(effect.rangeCells ?? 6);
    if (chebyshev(t.x, t.y, dest.x, dest.y) > range) throw new Error("OUT_OF_RANGE");
    if (tokenAt(combat, dest.x, dest.y) || blockedMove(combat, dest.x, dest.y)) throw new Error("UNREACHABLE");
    t.x = dest.x;
    t.y = dest.y;
    spendEconomy(t, isBonus);
    emit(combat, { kind: "move", tokenId: t.id, path: [{ x: t.x, y: t.y }], line: `${t.name} steps through silver mist.` });
    refreshReachable(combat);
    return { rolls: [] };
  }
  if (effect.type === "sleep") {
    const rolled = rollNotation(String(effect.dice ?? "5d8"));
    let pool = rolled.total;
    const radius = Number(effect.radius ?? 4);
    const origin = targetId ? combat.tokens.find((x) => x.id === targetId) : t;
    if (!origin) throw new Error("NEED_TARGET");
    const victims = combat.tokens
      .filter(
        (e) =>
          isFoe(combat, t, e) &&
          !hasCondition(e, "unconscious") &&
          chebyshev(e.x, e.y, origin.x, origin.y) <= radius &&
          clearShot(combat, origin.x, origin.y, e.x, e.y),
      )
      .sort((a, b) => a.hp - b.hp);
    const names: string[] = [];
    for (const foe of victims) {
      if (pool < foe.hp) continue;
      pool -= foe.hp;
      addCondition(foe, "unconscious");
      names.push(foe.name);
    }
    spendEconomy(t, isBonus);
    const dice = makeDiceRoll({
      roller: t.name,
      notation: String(effect.dice ?? "5d8"),
      values: rolled.values,
      sides: rolled.sides,
      modifier: rolled.modifier,
      total: rolled.total,
      purpose: "damage",
      label: "Sleep",
    });
    statusEvent(
      combat,
      t,
      name,
      names.length ? `${t.name} casts sleep (${rolled.total}). ${names.join(", ")} slump.` : `${t.name} casts sleep (${rolled.total}). No one falls.`,
      [dice],
    );
    return { rolls: [dice] };
  }
  if (effect.type === "spiritual_weapon") {
    t.spiritualRounds = 10;
    spendEconomy(t, true);
    statusEvent(combat, t, name, `${t.name} calls a floating weapon. It strikes as a bonus action.`);
    if (t.characterId) refreshMenus(t, pregen, getAbility);
    return { rolls: [] };
  }
  if (effect.type === "restore") {
    const ally = targetId ? combat.tokens.find((x) => x.id === targetId && isFriend(combat, t, x)) : t;
    if (!ally) throw new Error("NEED_TARGET");
    ally.conditions = (ally.conditions ?? []).filter((c) => !["blinded", "paralyzed", "poisoned"].includes(c));
    spendEconomy(t, false);
    statusEvent(combat, t, name, `${t.name} restores ${ally.name}.`);
    return { rolls: [] };
  }
  if (effect.type === "aid") {
    const amount = Number(effect.amount ?? 5);
    const allies = combat.tokens.filter((a) => isFriend(combat, t, a) && !a.dead).slice(0, Number(effect.allies ?? 3));
    for (const ally of allies) {
      ally.maxHp += amount;
      ally.hp += amount;
      if (ally.hp > 0) wakeFromDying(ally);
    }
    spendEconomy(t, false);
    statusEvent(combat, t, name, `${t.name} casts aid. ${allies.map((a) => a.name).join(", ")} gain ${amount} hit points.`);
    return { rolls: [] };
  }
  if (effect.type === "rays") {
    if (!targetId) throw new Error("NEED_TARGET");
    const rayTarget = combat.tokens.find((x) => x.id === targetId && !x.dead);
    if (!rayTarget) throw new Error("BAD_TARGET");
    demandShot(combat, t, rayTarget);
    const rays = Number(effect.rays ?? 3);
    const rolls: DiceRoll[] = [];
    spendEconomy(t, isBonus);
    for (let i = 0; i < rays; i += 1) {
      if (combat.status !== "active" || combat.pending) break;
      const part = resolveSpellAttack(combat, t, pregen, `${name} ${i + 1}`, effect, targetId, true, true);
      rolls.push(...part.rolls);
    }
    return { rolls };
  }
  return null;
}

export function performPcAction(
  combat: CombatState,
  playerId: string,
  abilityId: string,
  targetId?: string,
  dest?: Cell,
  gate?: { phase: "d20" } | { phase: "damage"; strike: StrikeHold },
): { rolls: DiceRoll[]; strike?: StrikeHold } {
  bumpElimPulse(combat);
  expireReactionIfStale(combat);
  if (combat.status !== "active") throw new Error("COMBAT_OVER");
  if (combat.pending) throw new Error("REACTION_PENDING");
  combat.aimRequest = undefined;
  const t = currentToken(combat);
  if (!t || t.kind !== "pc" || t.playerId !== playerId) throw new Error("NOT_YOUR_TURN");
  if (t.dying || t.stable || cannotAct(t)) throw new Error("DYING");
  if (t.sheetDriven && t.characterId) refreshMenus(t, getPregen(t.characterId), getAbility);

  let quicken = false;
  let castId = abilityId;
  let hexAbilityPick: string | undefined;
  if (abilityId.startsWith("spell_hex:")) {
    hexAbilityPick = abilityId.slice("spell_hex:".length);
    castId = "spell_hex";
  }
  if (castId.startsWith("wild_shape:")) {
    t.wildShapePick = castId.slice("wild_shape:".length);
    castId = "wild_shape";
  }
  if (abilityId.startsWith("quicken:")) {
    quicken = true;
    castId = abilityId.slice("quicken:".length);
    const freeMeta =
      (hasFeature(t, "arcane_apotheosis") && !t.abilityUses?.meta_spent) ||
      (hasFeature(t, "sorcery_incarnate") && Boolean(t.innateSorcery));
    if (!freeMeta && (t.sorceryPoints ?? 0) < 2) throw new Error("NO_SORCERY");
    t.abilityUses = { ...(t.abilityUses ?? {}), quicken_free: freeMeta ? 1 : 0 };
  }
  const split = splitVariant(castId);
  const variant: AttackVariant | undefined = split.variant;
  castId = split.id;

  const menuId = abilityId.startsWith("wild_shape:") ? castId : abilityId;
  const isBonus =
    t.bonusActionIds.includes(abilityId) || t.bonusActionIds.includes(menuId) || t.bonusActionIds.includes(castId) || quicken;
  const isAction = t.actionIds.includes(abilityId) || t.actionIds.includes(castId);
  if (!isBonus && !isAction) throw new Error("BAD_ABILITY");

  const ability = getAbility(castId);
  if (!ability) throw new Error("BAD_ABILITY");

  if (gate?.phase !== "damage" && castsSpellAction(castId, ability, t)) endPotionInvisibility(t);

  const abilityLevel = Number(
    (ability as { level?: number }).level ?? (ability.effects[0] as { slot?: number } | undefined)?.slot ?? 0,
  );
  const magicSkip = !isBonus && abilityLevel > 0 && t.magicActionReady && isAction;
  if (magicSkip) t.magicActionReady = false;

  if (gate?.phase !== "damage") {
    const undoingDash = dashStillUndoable(t, abilityId);
    if (isBonus) {
      if (!t.hasBonusAction && !undoingDash) throw new Error("NO_BONUS");
    } else if (!t.hasAction && !t.extraAction && !undoingDash && !magicSkip) {
      const extraSwing = isWeaponAttack(ability.effects[0]) && (t.attacksLeft ?? 0) > 0;
      if (!extraSwing) throw new Error("NO_ACTION");
    }
  }

  const effect = { ...(ability.effects[0] ?? {}) };
  if (!ability.effects[0]) throw new Error("NO_EFFECT");
  if (hexAbilityPick && effect.type === "brand") effect.hexAbility = hexAbilityPick;
  const markRetargetFree =
    (castId === "spell_hex" || castId === "spell_hunters_mark") && t.pendingMarkRetarget === castId;
  const pregen = t.characterId ? getPregen(t.characterId) : undefined;
  const prof = pregen?.proficiencyBonus ?? 2;
  if (t.raging && !(t.wildShaped && hasFeature(t, "beast_spells")) && (castId.startsWith("spell_") || t.cantrips?.includes(castId) || t.spells?.includes(castId))) {
    throw new Error("RAGING");
  }
  if (variant === "reckless" || variant === "brutal_force" || variant === "brutal_hamstring") t.reckless = true;
  const level = Number((ability as { level?: number }).level ?? effect.slot ?? 0);
  if (level > 0 && tokenCastBlocked(t, level, isBonus || quicken)) throw new Error("BONUS_SPELL");
  let slotUsed = 0;
  const pool = t.gearSpells?.[castId];
  const charges = pool ? (t.gearCharges?.[pool] ?? 0) : 0;
  const fromItem = t.sheetDriven && level > 0 && charges > 0 && !(t.spells?.includes(castId) && slotReady(t, level));
  if (fromItem) {
    t.gearCharges![pool!] = charges - 1;
  } else if (
    t.sheetDriven &&
    level > 0 &&
    castId !== "spell_spiritual_weapon_strike" &&
    !(castId === "spell_hunters_mark" && favoredMarkFree(t)) &&
    !markRetargetFree &&
    !freeCast(t, level)
  ) {
    slotUsed = spendSlot(t, level);
    if (spellRecall(t, slotUsed) && t.slots) t.slots[String(slotUsed)] = (t.slots[String(slotUsed)] ?? 0) + 1;
    const grown = scaledDice(effect, slotUsed);
    if (grown && Array.isArray(effect.damage)) {
      const parts = effect.damage as Array<{ dice: string }>;
      if (effect.scalingAll) {
        effect.damage = parts.map((part) => ({ ...part, dice: grown }));
      } else {
        effect.damage = parts.map((part, index) => (index === 0 ? { ...part, dice: grown } : part));
      }
    }
    if (grown && typeof effect.dice === "string") effect.dice = grown;
  }
  if (markRetargetFree) t.pendingMarkRetarget = undefined;
  if (quicken && !t.abilityUses?.quicken_free) t.sorceryPoints = (t.sorceryPoints ?? 0) - 2;
  if (quicken) t.abilityUses = { ...(t.abilityUses ?? {}), meta_spent: 1, quicken_free: 0 };
  if (level > 0) {
    t.castLeveled = true;
    if (isBonus || quicken) t.castBonusSpell = true;
  }
  if (t.sheetDriven && t.characterId) refreshMenus(t, pregen, getAbility);

  if (level > 0 && spellStopped(combat, t, level, castId)) {
    spendEconomy(t, isBonus || quicken);
    refreshReachable(combat);
    return { rolls: [] };
  }

  const special = castSpecial(combat, t, pregen, ability.name, effect, isBonus || quicken, targetId, dest, castId);
  if (special) {
    if (t.sheetDriven) refreshMenus(t, pregen, getAbility);
    return special;
  }

  if (effect.type === "dash") {
    if (dashStillUndoable(t, abilityId)) {
      undoDash(combat, t);
      return { rolls: [] };
    }
    const granted = t.speedCells;
    const extra = !isBonus && !t.hasAction && Boolean(t.extraAction);
    const attacked = Boolean(t.attackedThisTurn);
    t.movementLeft += granted;
    spendEconomy(t, isBonus);
    t.dashUndo = {
      abilityId,
      granted,
      movementLeft: t.movementLeft,
      bonus: isBonus,
      extra,
      attacked,
    };
    statusEvent(combat, t, ability.name, `${t.name} dashes — ${t.movementLeft * 5} ft of movement left.`);
    refreshReachable(combat);
    return { rolls: [] };
  }
  if (effect.type === "disengage") {
    t.disengaging = true;
    spendEconomy(t, isBonus);
    statusEvent(combat, t, ability.name, `${t.name} disengages and can slip away freely.`);
    refreshReachable(combat);
    return { rolls: [] };
  }
  if (effect.type === "dodge") {
    t.dodging = true;
    spendEconomy(t, isBonus);
    statusEvent(combat, t, ability.name, `${t.name} takes the Dodge — attacks against them have disadvantage.`);
    refreshReachable(combat);
    return { rolls: [] };
  }
  if (effect.type === "help") {
    if (!targetId) throw new Error("NEED_TARGET");
    const ally = combat.tokens.find((x) => x.id === targetId && isFriend(combat, t, x) && x.id !== t.id);
    if (!ally) throw new Error("BAD_TARGET");
    if (chebyshev(t.x, t.y, ally.x, ally.y) > 1) throw new Error("OUT_OF_RANGE");
    ally.helpingTargetId = t.id;
    spendEconomy(t, isBonus);
    statusEvent(combat, t, ability.name, `${t.name} helps ${ally.name} — their next attack has advantage.`);
    refreshReachable(combat);
    return { rolls: [] };
  }
  if (effect.type === "hide" || effect.type === "search") {
    const hide = effect.type === "hide";
    const key = hide ? "dex" : "wis";
    const skill = hide ? "stealth" : "perception";
    const skilled = Boolean((pregen as { skills?: string[] } | undefined)?.skills?.includes(skill));
    const bonus = abilityMod(abilityScore(t, pregen, key)) + checkBonusAdjust(t, skilled, prof, skill);
    const dc = hide ? 12 : 10;
    let roll = rollCheck({
      roller: t.name,
      label: hide ? "Hide (Stealth)" : "Search (Perception)",
      bonus,
      dc,
      purpose: "check",
      mode: hide && hasFeature(t, "supreme_sneak") ? "advantage" : "normal",
    });
    const natural = roll.values[roll.kept ?? 0] ?? roll.total;
    const floored = reliableFloor(t, skilled, natural);
    if (floored !== natural) {
      const total = roll.total + (floored - natural);
      roll = { ...roll, total, outcome: total >= dc ? "success" : "fail" };
    }
    if (roll.outcome !== "success" && hasFeature(t, "tactical_mind") && (t.secondWindLeft ?? 0) > 0) {
      t.secondWindLeft = (t.secondWindLeft ?? 0) - 1;
      t.secondWindUsed = (t.secondWindLeft ?? 0) <= 0;
      const extra = rollNotation("1d10");
      const total = roll.total + extra.total;
      roll = { ...roll, total, outcome: total >= dc ? "success" : "fail" };
    }
    if (hide && roll.outcome === "success") t.hidden = true;
    spendEconomy(t, isBonus);
    statusEvent(
      combat,
      t,
      ability.name,
      hide
        ? roll.outcome === "success"
          ? `${t.name} melts into the shadows (${roll.total} vs DC ${dc}).`
          : `${t.name} is spotted trying to hide (${roll.total} vs DC ${dc}).`
        : roll.outcome === "success"
          ? `${t.name} studies the room — nothing hides from them (${roll.total}).`
          : `${t.name} searches, but the dark keeps its secrets (${roll.total}).`,
      [roll],
    );
    refreshReachable(combat);
    return { rolls: [roll] };
  }
  if (effect.type === "attack_action") {
    spendEconomy(t, isBonus);
    t.attacksLeft = (t.kit?.extraAttacks ?? 0) + 1;
    statusEvent(combat, t, ability.name, `${t.name} takes the Attack action — weapon strikes are ready.`);
    refreshReachable(combat);
    return { rolls: [] };
  }
  if (effect.type === "influence" || effect.type === "study") {
    const key = effect.type === "influence" ? "cha" : "int";
    const skill = effect.type === "influence" ? "persuasion" : "investigation";
    const skilled = Boolean((pregen as { skills?: string[] } | undefined)?.skills?.includes(skill));
    const bonus = abilityMod(abilityScore(t, pregen, key)) + checkBonusAdjust(t, skilled, prof, skill);
    const roll = rollCheck({
      roller: t.name,
      label: ability.name,
      bonus,
      dc: 12,
      purpose: "check",
    });
    spendEconomy(t, isBonus);
    statusEvent(
      combat,
      t,
      ability.name,
      roll.outcome === "success"
        ? `${t.name} succeeds at ${ability.name} (${roll.total} vs DC 12).`
        : `${t.name} fails ${ability.name} (${roll.total} vs DC 12).`,
      [roll],
    );
    refreshReachable(combat);
    return { rolls: [roll] };
  }
  if (effect.type === "plant_aura") {
    const spec = (t.plantAuras ?? [])[0];
    if (!spec) throw new Error("BAD_ABILITY");
    if ((t.abilityUses?.rod_plant ?? 1) <= 0) throw new Error("ALREADY_USED");
    const planted = placeAura(combat, t, spec);
    if (!planted) throw new Error("ALREADY_USED");
    t.abilityUses = { ...(t.abilityUses ?? {}), rod_plant: 0 };
    spendEconomy(t, isBonus);
    refreshAuras(combat);
    statusEvent(combat, t, ability.name, `${t.name} plants the rod — allies in 60 feet gain +1 AC and saves.`);
    refreshReachable(combat);
    return { rolls: [] };
  }
  if (effect.type === "pull_aura") {
    if (!removePlantedAura(combat, t)) throw new Error("UNREACHABLE");
    spendEconomy(t, isBonus);
    refreshAuras(combat);
    statusEvent(combat, t, ability.name, `${t.name} pulls the rod from the ground. The light fades.`);
    refreshReachable(combat);
    return { rolls: [] };
  }
  if (effect.type === "magic_action") {
    spendEconomy(t, isBonus);
    t.magicActionReady = true;
    statusEvent(combat, t, ability.name, `${t.name} uses the Magic action — the next leveled spell needs no action.`);
    refreshReachable(combat);
    return { rolls: [] };
  }
  if (effect.type === "utilize") {
    spendEconomy(t, isBonus);
    statusEvent(combat, t, ability.name, `${t.name} utilizes an object.`);
    refreshReachable(combat);
    return { rolls: [] };
  }
  if (effect.type === "stat_drink") {
    if (effect.consume) {
      const item = String(effect.consume);
      const idx = t.inventory.indexOf(item);
      if (idx < 0) throw new Error("NO_ITEM");
      t.inventory.splice(idx, 1);
    }
    const key = String(effect.ability ?? "str") as "str" | "dex" | "con" | "int" | "wis" | "cha";
    const score = Number(effect.score);
    const duration = Number(effect.durationPcTurns ?? GIANT_STRENGTH_DURATION_PC_TURNS);
    const effective = abilityScore(t, pregen, key);
    spendEconomy(t, isBonus);
    if (!Number.isFinite(score) || effective >= score) {
      statusEvent(combat, t, ability.name, `${t.name} drinks ${ability.name} — it has no effect.`);
      refreshReachable(combat);
      return { rolls: [] };
    }
    t.abilityOverride = { ...(t.abilityOverride ?? {}), [key]: score };
    t.timedEffects = [
      ...(t.timedEffects ?? []).filter((row) => row.spellId !== GIANT_STRENGTH_EFFECT_ID),
      { label: ability.name, pcTurnsLeft: duration, spellId: GIANT_STRENGTH_EFFECT_ID },
    ];
    if (t.saves) {
      const kitProf = t.kit?.saves.includes(key) ? (pregen?.proficiencyBonus ?? 2) : 0;
      t.saves[key] = abilityMod(score) + kitProf + (t.gearSaveBonus ?? 0);
    }
    statusEvent(combat, t, ability.name, `${t.name} drinks ${ability.name} — ${key.toUpperCase()} becomes ${score}.`);
    refreshReachable(combat);
    return { rolls: [] };
  }
  if (effect.type === "haste" || effect.type === "haste_drink") {
    const ally = targetId ? combat.tokens.find((x) => x.id === targetId && isFriend(combat, t, x)) : t;
    if (!ally) throw new Error("BAD_TARGET");
    if (effect.consume) {
      const item = String(effect.consume);
      const idx = t.inventory.indexOf(item);
      if (idx < 0) throw new Error("NO_ITEM");
      t.inventory.splice(idx, 1);
    }
    applyHaste(ally, true);
    if (effect.type === "haste" && effect.concentration) setConcentration(combat, t, castId, ally.id);
    spendEconomy(t, isBonus);
    statusEvent(combat, t, ability.name, `${ally.name} moves with supernatural speed.`);
    refreshReachable(combat);
    return { rolls: [] };
  }
  if (effect.type === "bane") {
    return castBaneSpell(combat, t, pregen, ability.name, effect, isBonus, castId, targetId, slotUsed || level);
  }
  if (effect.type === "invisibility_drink") {
    if (effect.consume) {
      const item = String(effect.consume);
      const idx = t.inventory.indexOf(item);
      if (idx < 0) throw new Error("NO_ITEM");
      t.inventory.splice(idx, 1);
    }
    const duration = Number(effect.durationPcTurns ?? INVISIBILITY_POTION_DURATION_PC_TURNS);
    spendEconomy(t, isBonus);
    t.invisible = true;
    t.timedEffects = [
      ...(t.timedEffects ?? []).filter((row) => row.spellId !== INVISIBILITY_POTION_EFFECT_ID),
      { label: ability.name, pcTurnsLeft: duration, spellId: INVISIBILITY_POTION_EFFECT_ID },
    ];
    statusEvent(combat, t, ability.name, `${t.name} drinks ${ability.name} and fades from sight.`);
    refreshReachable(combat);
    return { rolls: [] };
  }
  if (effect.type === "ready") {
    spendEconomy(t, isBonus);
    statusEvent(combat, t, ability.name, `${t.name} readies a strike and waits.`);
    refreshReachable(combat);
    return { rolls: [] };
  }
  if (effect.type === "buff") {
    const allies = combat.tokens.filter((a) => a.kind === "pc" && !a.dead);
    for (const a of allies.slice(0, 3)) a.blessed = true;
    if (effect.concentration || effect.duration === "concentration") setConcentration(combat, t, castId);
    spendEconomy(t, isBonus);
    statusEvent(combat, t, ability.name, `${t.name} casts ${ability.name} — the party adds 1d4 to attack rolls.`);
    refreshReachable(combat);
    return { rolls: [] };
  }
  if (effect.type === "heal") {
    let patient = t;
    if (!effect.self) {
      const chosen = targetId ? combat.tokens.find((x) => x.id === targetId && x.kind === "pc" && !x.dead) : undefined;
      if (targetId && !chosen) throw new Error("BAD_TARGET");
      patient = chosen ?? t;
      if (chebyshev(t.x, t.y, patient.x, patient.y) > Number(effect.rangeCells ?? 1)) throw new Error("OUT_OF_RANGE");
    }
    if (castId === "second_wind") {
      if ((t.secondWindLeft ?? 0) <= 0) throw new Error("ALREADY_USED");
      t.secondWindLeft = (t.secondWindLeft ?? 0) - 1;
      t.secondWindUsed = (t.secondWindLeft ?? 0) <= 0;
      if (hasFeature(t, "tactical_shift")) grantFreeMove(t, Math.floor(t.speedCells / 2));
    }
    if (effect.consume) {
      const item = String(effect.consume);
      const idx = t.inventory.indexOf(item);
      if (idx < 0) throw new Error("NO_ITEM");
      t.inventory.splice(idx, 1);
    }
    let notation = String(effect.dice);
    if (castId === "second_wind") notation = `1d10+${t.kit?.fighterLevel ?? pregen?.level ?? 3}`;
    if (effect.ability) {
      const mod = abilityMod(abilityScore(t, pregen, String(effect.ability)));
      if (/^\d+d\d+$/i.test(notation)) notation = `${notation}${mod >= 0 ? "+" : ""}${mod}`;
    }
    const rolled = rollNotation(notation);
    let healed = rolled.total;
    if (t.features?.includes("disciple_of_life") || t.features?.includes("domain_life")) healed += 2 + Math.max(1, slotUsed);
    const patients = effect.mass
      ? combat.tokens.filter((a) => isFriend(combat, t, a) && !a.dead && chebyshev(t.x, t.y, a.x, a.y) <= Number(effect.rangeCells ?? 12)).slice(0, Number(effect.mass))
      : [patient];
    if (effect.mass && !patients.length) throw new Error("BAD_TARGET");
    let healedShown = 0;
    for (const who of patients.length ? patients : [patient]) {
      const beforeOne = who.hp;
      who.hp = Math.min(who.maxHp, who.hp + healed);
      if (healed > 0 && who.hp > 0) wakeFromDying(who);
      healedShown += who.hp - beforeOne;
    }
    spendEconomy(t, isBonus);
    const dice = makeDiceRoll({
      roller: t.name,
      notation,
      values: rolled.values,
      sides: rolled.sides,
      modifier: rolled.modifier,
      total: rolled.total,
      purpose: "heal",
      label: ability.name,
    });
    emit(combat, {
      kind: "heal",
      tokenId: t.id,
      targetId: patient.id,
      ability: ability.name,
      amount: healedShown,
      hp: patient.hp,
      rolls: [dice],
      line: effect.mass
        ? `${t.name} casts ${ability.name}: ${patients.length} allies regain ${healed} HP each.`
        : patient === t
          ? `${t.name} uses ${ability.name} and recovers ${healedShown} HP.`
          : `${t.name} casts ${ability.name} on ${patient.name}: +${healedShown} HP.`,
    });
    refreshReachable(combat);
    return { rolls: [dice] };
  }

  if (effect.type === "note" || effect.type === "dispel" || effect.type === "polymorph" || effect.type === "summon" || effect.type === "counterspell") {
    return castFieldSpell(combat, t, pregen, ability.name, effect, isBonus, targetId, castId, level);
  }

  if (!targetId) throw new Error("NEED_TARGET");
  const target = combat.tokens.find((x) => x.id === targetId);
  if (!target || target.dead) throw new Error("BAD_TARGET");
  if (!isFoe(combat, t, target)) throw new Error("BAD_TARGET");

  if (effect.type === "save") {
    return castSaveArea(combat, t, target, ability.name, effect, pregen, isBonus, castId);
  }

  const atkEffect =
    effect.type === "attack" || effect.type === "auto_hit"
      ? effect
      : ability.effects.find((e) => e.type === "attack" || e.type === "auto_hit");
  if (!atkEffect) throw new Error("NOT_ATTACK");

  const range = Number(atkEffect.rangeCells ?? 1);
  const dist = chebyshev(t.x, t.y, target.x, target.y);
  if (dist > range) throw new Error("OUT_OF_RANGE");
  demandShot(combat, t, target);

  if (atkEffect.type === "auto_hit") {
    const missiles = Number(atkEffect.missiles ?? 1);
    const dmgSpec = (atkEffect.damage as Array<{ dice: string; damageType: string }>)[0];
    let totalDmg = 0;
    const values: number[] = [];
    const sides: number[] = [];
    let modifier = 0;
    for (let i = 0; i < missiles; i += 1) {
      const r = rollNotation(dmgSpec.dice);
      totalDmg += r.total;
      values.push(...r.values);
      sides.push(...r.sides);
      modifier += r.modifier;
    }
    t.hidden = false;
    spendEconomy(t, isBonus);
    const dice = makeDiceRoll({
      roller: t.name,
      notation: `${missiles}×(${dmgSpec.dice})`,
      values,
      sides,
      modifier,
      total: totalDmg,
      purpose: "damage",
      label: `${ability.name} · ${missiles} darts`,
      damageType: dmgSpec.damageType ?? "force",
    });
    if (
      holdForShield(combat, t, target, {
        damage: totalDmg,
        negateAuto: true,
        attackTotal: 99,
        damageType: "force",
        rolls: [dice],
        abilityName: ability.name,
        style: "spell",
        attackerId: t.id,
        targetId: target.id,
      })
    ) {
      return { rolls: [dice] };
    }
    emit(combat, {
      kind: "strike",
      tokenId: t.id,
      ability: ability.name,
      style: "spell",
      rolls: [dice],
      hits: [{ targetId: target.id, outcome: "hit", damage: totalDmg, hp: Math.max(0, target.hp - totalDmg) }],
      line: `${t.name} casts ${ability.name}: ${missiles} darts strike ${target.name} for ${totalDmg}.`,
    });
    applyDamage(combat, target, totalDmg, false, "force");
    checkEnd(combat);
    refreshReachable(combat);
    return { rolls: [dice] };
  }

  let attackBonus = Number(atkEffect.attackBonus ?? 0);
  if (atkEffect.ability) {
    const ab = spellKey(t, pregen, String(atkEffect.ability));
    attackBonus = abilityMod(abilityScore(t, pregen, ab)) + (atkEffect.proficient || atkEffect.spellAttack ? prof : 0);
  }
  const ranged = range > 1;
  const weaponSwing = isWeaponAttack(atkEffect);
  const strongSwing = strengthWeapon(atkEffect, pregen, t);
  if (styleHas(t, "archery") && ranged && weaponSwing) attackBonus += 2;
  if (styleHas(t, "dueling") && !ranged && weaponSwing) attackBonus += 2;
  if (!atkEffect.spellAttack && t.channelAttack) attackBonus += t.channelAttack;
  const magicWeapon = t.weaponGear?.[castId];
  attackBonus += (t.gearAttackBonus ?? 0) + (magicWeapon?.attack ?? 0);
  const foeAdjacent = combat.tokens.some(
    (e) => isFoe(combat, t, e) && chebyshev(e.x, e.y, t.x, t.y) <= 1,
  );
  const brutal = variant === "brutal_force" || variant === "brutal_hamstring";
  const recklessAdv = t.reckless && strongSwing && !brutal;
  const easyTarget =
    Boolean(target.marked) ||
    hasCondition(target, "outlined") ||
    hasCondition(target, "restrained") ||
    hasCondition(target, "paralyzed") ||
    hasCondition(target, "unconscious") ||
    Boolean(target.dying || target.stable) ||
    (hasCondition(target, "prone") && !ranged) ||
    Boolean(target.reckless) ||
    t.vexTarget === target.id;
  const advantage =
    (t.hidden || Boolean(t.helpingTargetId) || t.invisible || recklessAdv || easyTarget || (Boolean(atkEffect.spellAttack) && wantsSpellAdvantage(t)) || wantsSteadyAdvantage(t)) &&
    !hasFeature(target, "elusive");
  const disadvantage =
    (ranged && foeAdjacent) ||
    hasCondition(t, "prone") ||
    hasCondition(t, "restrained") ||
    hasCondition(t, "frightened") ||
    hasCondition(t, "blinded") ||
    (Boolean(target.invisible) &&
      !(
        (hasFeature(t, "feral_senses") || hasFeature(t, "boon_of_truesight")) &&
        chebyshev(t.x, t.y, target.x, target.y) <= (hasFeature(t, "boon_of_truesight") ? 12 : 6)
      )) ||
    Boolean(target.blur) ||
    Boolean(t.sappedBy) ||
    Boolean(target.auraAttackDisadvAgainst) ||
    Boolean(t.auraObscured) ||
    Boolean(target.auraObscured) ||
    (hasCondition(target, "prone") && ranged);
  const mode: D20Mode = d20Mode(advantage, disadvantage);
  let blessBonus = 0;
  if (gate?.phase !== "damage" && t.blessed) blessBonus = rollNotation("1d4").total;
  let banePenalty = 0;
  if (gate?.phase !== "damage" && target.baned) banePenalty = rollNotation("1d4").total;

  const resumed = gate?.phase === "damage" ? gate.strike : null;
  const attackRoll = resumed
    ? resumed.attackRoll
    : rollAttack({
        roller: t.name,
        label: `${ability.name} vs ${target.name}${blessBonus ? " · Bless" : ""}`,
        bonus: attackBonus + blessBonus - banePenalty,
        ac: effectiveAc(target),
        mode,
        critMin: weaponSwing ? t.kit?.critMin : undefined,
      });
  const rolls: DiceRoll[] = resumed ? [...resumed.rolls] : [attackRoll];
  if (!resumed) {
    endPotionInvisibility(t);
    t.hidden = false;
    t.helpingTargetId = undefined;
    target.marked = false;
    if (t.vexTarget === target.id) t.vexTarget = undefined;
    if (t.sappedBy) t.sappedBy = undefined;
    t.rolledAttack = true;
    t.steadyAim = false;
    spendEconomy(t, isBonus, { attack: weaponSwing });
    if (t.raging && (weaponSwing || effect.type === "save")) keepRage(t, true);
  }

  const crit = resumed ? resumed.crit : attackRoll.outcome === "crit";
  let landed = crit || attackRoll.outcome === "hit";
  if (!resumed && !landed && weaponSwing && (prowessSavesMiss(t) || strokeSavesMiss(t))) landed = true;
  const style = resumed ? resumed.style : atkEffect.spellAttack ? "spell" : ranged ? "ranged" : "melee";
  if (!resumed && !landed) {
    const fumble = attackRoll.outcome === "fumble";
    const graze = applyMastery({
      mastery: t.masteries?.includes("graze") ? "graze" : undefined,
      granted: Boolean(t.masteries?.includes("graze")),
      hit: false,
      melee: !ranged,
      abilityMod: abilityMod(abilityScore(t, pregen, "str")),
    });
    let splash = graze.grazeDamage;
    let splashType = "slashing";
    if (graze.grazeDamage > 0) applyDamage(combat, target, graze.grazeDamage, false, "slashing");
    if (atkEffect.missHalfInitial) {
      const dmgParts = (atkEffect.damage as DamagePart[]) ?? [];
      const part = dmgParts[0];
      if (part) {
        const rolled = pushPartDamage(rolls, t.name, weaponNotation(part, t, pregen), part.damageType, `${part.damageType} splash`, false);
        splash = Math.floor(rolled / 2);
        splashType = part.damageType;
        applyDamage(combat, target, splash, false, splashType);
      }
    }
    emit(combat, {
      kind: "strike",
      tokenId: t.id,
      ability: ability.name,
      style,
      rolls,
      hits: [{ targetId: target.id, outcome: attackRoll.outcome ?? "miss", damage: splash, hp: target.hp }],
      line: fumble
        ? `${t.name} swings ${ability.name} — a natural 1. ${target.name} looks almost embarrassed for them.`
        : splash > 0 && atkEffect.missHalfInitial
          ? `${t.name} attacks ${target.name} with ${ability.name}: ${attackRoll.total} vs AC ${target.ac} — miss. Acid splashes for ${splash}.`
          : `${t.name} attacks ${target.name} with ${ability.name}: ${attackRoll.total} vs AC ${target.ac} — miss.`,
    });
    refreshReachable(combat);
    return { rolls };
  }
  const sneakN = sneakDice(t, pregen);
  const finesse = Boolean(atkEffect.sneakAttackEligible) || ranged;
  const allyNear = combat.tokens.some(
    (a) => a.kind === "pc" && !a.dead && a.id !== t.id && chebyshev(a.x, a.y, target.x, target.y) <= 1,
  );
  const sneakOk = sneakN > 0 && finesse && !t.sneakUsed && (mode === "advantage" || allyNear) && mode !== "disadvantage";
  const sneakNote = sneakN > 0 ? `${sneakN}d6` : "2d6";
  if (!resumed && gate?.phase === "d20" && landed) {
    const dmgParts = (atkEffect.damage as DamagePart[]) ?? [];
    const weaponType = dmgParts[0]?.damageType ?? "slashing";
    const preview: DamageDiePreview[] = [];
    for (const part of dmgParts) {
      preview.push(...previewFromNotation(weaponNotation(part, t, pregen), part.damageType, crit));
    }
    if (sneakOk) preview.push(...previewFromNotation(sneakNote, weaponType, crit));
    for (const rider of magicWeapon?.onHit ?? []) {
      preview.push(...previewFromNotation(rider.damage, rider.damageType ?? weaponType, crit));
    }
    if (target.brand?.by === t.id) preview.push(...previewFromNotation(target.brand.dice, weaponType, crit));
    combat.damagePreview = preview;
    emit(combat, {
      kind: "status",
      tokenId: t.id,
      ability: ability.name,
      rolls: [attackRoll],
      line: crit
        ? `Natural 20! ${t.name}'s ${ability.name} vs ${target.name}. Roll damage.`
        : `${t.name} hits ${target.name} with ${ability.name}: ${attackRoll.total} vs AC ${effectiveAc(target)}. Roll damage.`,
    });
    return {
      rolls,
      strike: { abilityId, targetId: target.id, attackRoll, style, ranged, mode, crit, rolls, preview },
    };
  }

  combat.damagePreview = undefined;
  let dmgTotal = 0;
  const dmgParts = (atkEffect.damage as DamagePart[]) ?? [];
  const weaponType = dmgParts[0]?.damageType ?? "slashing";
  const sneakMode = resumed?.mode ?? mode;
  const sneakLand = sneakN > 0 && finesse && !t.sneakUsed && (sneakMode === "advantage" || allyNear) && sneakMode !== "disadvantage";
  const props = ((atkEffect.properties as string[] | undefined) ?? []).map((p) => p.toLowerCase());
  const gwf = styleHas(t, "great_weapon_fighting") && weaponSwing && props.some((p) => p.includes("two-handed"));
  const savage = hasFeature(t, "savage_attacker") && weaponSwing && !t.savageUsed;
  for (const [index, part] of dmgParts.entries()) {
    dmgTotal += pushPartDamage(
      rolls,
      t.name,
      weaponNotation(part, t, pregen),
      part.damageType,
      `${part.damageType} damage`,
      crit,
      { floor: gwf ? 3 : undefined, twice: savage && index === 0 },
    );
  }
  if (savage) t.savageUsed = true;
  if (sneakLand) {
    t.sneakUsed = true;
    dmgTotal += pushPartDamage(rolls, t.name, sneakNote, weaponType, "sneak attack", crit);
  }
  for (const rider of magicWeapon?.onHit ?? []) {
    const riderType = rider.damageType ?? weaponType;
    dmgTotal += pushPartDamage(rolls, t.name, rider.damage, riderType, `${riderType} damage`, crit);
  }

  const onHit = (atkEffect.onHit as Array<{ type?: string; condition?: string }> | undefined) ?? [];
  for (const h of onHit) {
    if (h.condition === "attack_advantage_next") target.marked = true;
    else if (h.type === "condition" && h.condition) addCondition(target, h.condition);
  }

  if (atkEffect.onHitSave && dmgTotal < target.hp) {
    const save = atkEffect.onHitSave as {
      ability: string;
      dc: number;
      damage?: Array<{ dice: string; damageType: string }>;
    };
    const { roll: saveRoll, ok } = creatureSave(target, save.ability, save.dc, false);
    rolls.push(saveRoll);
    if (!ok && save.damage?.length) {
      const extraPart = save.damage[0];
      dmgTotal += pushPartDamage(rolls, t.name, extraPart.dice, extraPart.damageType, `${extraPart.damageType} damage`, false);
    }
  }

  if (target.brand?.by === t.id) {
    const brandType = target.brand.damageType ?? weaponType;
    dmgTotal += pushPartDamage(rolls, t.name, target.brand.dice, brandType, "brand", crit);
  }
  if (landed) {
    for (const rider of magicWeapon?.onHit ?? []) {
      if (!rider.saveAbility || !rider.saveDc) continue;
      const { roll: saveRoll, ok: saved } = creatureSave(target, rider.saveAbility, rider.saveDc, true);
      rolls.push(saveRoll);
      const dice = saved ? rider.halfDamage ?? "0" : rider.damage;
      if (dice && dice !== "0") {
        dmgTotal += pushPartDamage(rolls, t.name, dice, rider.damageType ?? "force", "on hit", crit);
      }
    }
  }
  if (variant === "striking_1" || variant === "striking_2" || variant === "striking_3") {
    const spend = variant === "striking_1" ? 1 : variant === "striking_2" ? 2 : 3;
    const pool = staffStrikingChargePool(t);
    if (!pool || (t.gearCharges?.[pool] ?? 0) < spend) throw new Error("NO_CHARGES");
    t.gearCharges![pool] = (t.gearCharges![pool] ?? 0) - spend;
    dmgTotal += pushPartDamage(rolls, t.name, `${spend}d6`, "force", "staff strike", crit);
  }
  if (t.nickNext) {
    dmgTotal += t.nickMod ?? 0;
    t.nickNext = false;
    t.nickMod = 0;
  }
  const riderDie = classDamageRider(t, pregen?.level ?? t.level ?? 1, liveAbilities(t, pregen), {
    weapon: weaponSwing,
    cantrip: Boolean(atkEffect.spellAttack) && level === 0,
    spell: Boolean(atkEffect.spellAttack),
    targetHurt: target.hp < target.maxHp,
    marked: Boolean(target.brand),
  });
  if (riderDie?.dice) dmgTotal += pushPartDamage(rolls, t.name, riderDie.dice, riderDie.type, riderDie.type, crit);
  if (riderDie?.flat) dmgTotal += riderDie.flat;
  if (stunOnHit(t)) {
    const dc = 8 + prof + abilityMod(abilityScore(t, pregen, "wis"));
    const { roll: saveRoll, ok } = creatureSave(target, "con", dc, false);
    rolls.push(saveRoll);
    if (!ok) addCondition(target, "stunned");
  }
  if (openHandProne(t) && String(ability.name).toLowerCase().includes("flurry")) addCondition(target, "prone");
  const rageBonus = t.kit?.rageDamage || 2;
  if (t.raging && strongSwing) {
    dmgTotal += rageBonus;
    keepRage(t, true);
  }
  if (t.raging && t.reckless && strongSwing && hasFeature(t, "frenzy") && !t.frenzyUsed) {
    t.frenzyUsed = true;
    dmgTotal += rageBonus;
  }
  if (brutal && strongSwing) {
    t.brutalUsed = true;
    dmgTotal += pushPartDamage(rolls, t.name, "1d10", weaponType, "brutal strike", crit);
    if (variant === "brutal_force") {
      pushAway(combat, t, target, 3);
      grantFreeMove(t, 3);
    } else {
      target.slowedBy = { by: t.id, cells: 3 };
    }
  }
  dmgTotal += (t.gearDamageBonus ?? 0) + (magicWeapon?.damage ?? 0);
  const knownMastery = new Set<MasteryId>(["cleave", "graze", "nick", "push", "sap", "slow", "topple", "vex"]);
  const beside = combat.tokens.find((other) => other.id !== target.id && !other.dead && chebyshev(other.x, other.y, target.x, target.y) <= 1)?.id;
  const masteryOverride: MasteryId | undefined =
    variant === "tm_push" ? "push" : variant === "tm_sap" ? "sap" : variant === "tm_slow" ? "slow" : undefined;
  const masteries = masteryOverride ? [masteryOverride] : (t.masteries ?? []);
  for (const raw of masteries) {
    if (!knownMastery.has(raw as MasteryId)) continue;
    const rider = applyMastery({
      mastery: raw as MasteryId,
      granted: Boolean(hasFeature(t, "weapon_mastery") || masteryOverride),
      hit: true,
      melee: !ranged,
      abilityMod: 0,
      targetAdjacentId: beside,
    });
    if (rider.vexAdvantageNext) t.vexTarget = target.id;
    if (rider.sap) target.sappedBy = t.id;
    if (rider.slowFeet) target.slowedBy = { by: t.id, cells: Math.ceil(rider.slowFeet / 5) };
    if (rider.pushFeet) pushAway(combat, t, target, Math.ceil(rider.pushFeet / 5));
    if (rider.vexAdvantageNext || rider.sap) target.marked = true;
    if (rider.nickBonusAttack && !t.nickNext) {
      t.nickNext = true;
      t.attacksLeft = (t.attacksLeft ?? 0) + 1;
      if (styleHas(t, "two_weapon_fighting")) {
        const key = strengthWeapon(atkEffect, pregen, t) ? "str" : "dex";
        t.nickMod = abilityMod(abilityScore(t, pregen, key));
      }
    }
  }
  if (crit && hasFeature(t, "remarkable_athlete")) grantFreeMove(t, Math.floor(t.speedCells / 2));
  const dtype = weaponType;
  const delayed = delayedOnHitFromEffect(atkEffect);
  if (delayed?.dice) queueStartOfTurnDamage(target, delayed, ability.name, castId);
  if (
    !ranged &&
    t.playerId &&
    t.features?.includes("divine_smite") &&
    t.slots &&
    Object.values(t.slots).some((n) => n > 0)
  ) {
    combat.pending = {
      kind: "smite",
      playerId: t.playerId,
      tokenId: t.id,
      prompt: `${t.name} can pour a spell slot into the blow.`,
      acceptLabel: "Divine Smite",
      declineLabel: "Leave it",
      damage: dmgTotal,
      crit,
      damageType: dtype,
      rolls,
      abilityName: ability.name,
      style,
      attackerId: t.id,
      targetId: target.id,
      attackTotal: attackRoll.total,
    };
    return { rolls };
  }
  if (
    holdForShield(combat, t, target, {
      damage: dmgTotal,
      crit,
      attackTotal: attackRoll.total,
      damageType: dtype,
      rolls,
      abilityName: ability.name,
      style,
      attackerId: t.id,
      targetId: target.id,
    })
  ) {
    return { rolls };
  }
  const hpAfter = Math.max(0, target.hp - dmgTotal);
  const shown = resumed ? rolls.filter((r) => r.purpose !== "attack") : rolls;
  emit(combat, {
    kind: "strike",
    tokenId: t.id,
    ability: ability.name,
    style,
    rolls: shown,
    hits: [{ targetId: target.id, outcome: attackRoll.outcome!, damage: dmgTotal, hp: hpAfter }],
    line: crit
      ? `Natural 20! ${t.name}'s ${ability.name} tears into ${target.name} for ${dmgTotal}.`
      : `${t.name} hits ${target.name} with ${ability.name}: ${attackRoll.total} vs AC ${effectiveAc(target)}, ${dmgTotal} damage.`,
  });
  applyDamage(combat, target, dmgTotal, crit, dtype);
  if (target.hp <= 0) onKillBlessing(t, liveAbilities(t, pregen), pregen?.level ?? t.level ?? 1);
  if (hasFeature(t, "boon_of_dimensional_travel")) grantFreeMove(t, 6);
  if (combat.status === "active") offerRetaliation(combat, t, target);
  checkEnd(combat);
  refreshReachable(combat);
  return { rolls };
}

/** A cone is as wide as it is long, so the half-angle from the aim line is atan(0.5) ≈ 26.5°. */
const CONE_HALF_ANGLE = Math.atan(0.5);

function spellStopped(combat: CombatState, caster: CombatToken, level: number, castId: string): boolean {
  if (castId === "spell_counterspell" || level <= 0) return false;
  const reactor = combat.tokens.find(
    (other) =>
      isFoe(combat, caster, other) &&
      other.reactionReady &&
      (other.actionIds.includes("spell_counterspell") || other.spells?.includes("spell_counterspell")),
  );
  if (!reactor) return false;
  reactor.reactionReady = false;
  const counterLevel = Number((getAbility("spell_counterspell") as { level?: number } | undefined)?.level ?? 3);
  if (counterLevel >= level) {
    statusEvent(combat, reactor, "Counterspell", `${reactor.name} counters ${caster.name}'s spell.`);
    return true;
  }
  const bonus = abilityMod(abilityScore(reactor, reactor.characterId ? getPregen(reactor.characterId) : undefined, reactor.spellAbility ?? "int"));
  const dc = 10 + level;
  const roll = rollCheck({ roller: reactor.name, label: "Counterspell", bonus, dc, purpose: "save" });
  statusEvent(
    combat,
    reactor,
    "Counterspell",
    roll.outcome === "success"
      ? `${reactor.name} counters the spell (${roll.total} vs DC ${dc}).`
      : `${reactor.name} fails to counter (${roll.total} vs DC ${dc}).`,
    [roll],
  );
  return roll.outcome === "success";
}

function queueRepeatSave(combat: CombatState, token: CombatToken): boolean {
  const link = (token.spellLinks ?? []).find((row) => row.repeat);
  if (!link) return false;
  if (token.kind === "pc" && token.playerId) {
    const id = `repeat-${token.id}-${link.spellId}`;
    if ((combat.awaiting ?? []).some((row) => row.id === id)) return true;
    combat.awaiting = [
      ...(combat.awaiting ?? []),
      {
        id,
        playerId: token.playerId,
        label: `${link.saveAbility.toUpperCase()} save`,
        step: "save",
        targetId: token.id,
        saveAbility: link.saveAbility,
        saveDc: link.saveDc,
        saveDamage: 0,
        saveHalf: false,
        saveRepeat: true,
        saveCondition: link.condition,
      },
    ];
    statusEvent(combat, token, "Save", `${token.name} repeats the save.`);
    return true;
  }
  const { roll, ok } = creatureSave(token, link.saveAbility, link.saveDc, false);
  if (ok) {
    token.conditions = (token.conditions ?? []).filter((c) => c !== link.condition);
    token.spellLinks = (token.spellLinks ?? []).filter((row) => row !== link);
    statusEvent(combat, token, "Save", `${token.name} shakes it off (${roll.total} vs DC ${link.saveDc}).`, [roll]);
  } else {
    statusEvent(combat, token, "Save", `${token.name} is still held (${roll.total} vs DC ${link.saveDc}).`, [roll]);
  }
  return false;
}

function tickZones(combat: CombatState, token: CombatToken): void {
  const key = `${combat.round}:${combat.turnIndex}`;
  for (const zone of combat.zones ?? []) {
    if (zone.turnKey !== key) {
      zone.turnKey = key;
      zone.touched = [];
    }
    if (zone.touched.includes(token.id) || token.dead) continue;
    if (chebyshev(token.x, token.y, zone.x, zone.y) > zone.radius) continue;
    zone.touched.push(token.id);
    const rolled = rollNotation(zone.dice);
    const { roll, ok } = creatureSave(token, zone.saveAbility, zone.dc, false);
    const amount = ok ? (zone.half ? Math.floor(rolled.total / 2) : 0) : rolled.total;
    if (amount > 0) applyDamage(combat, token, amount, false, zone.damageType);
    statusEvent(combat, token, zone.name, `${token.name} ${ok ? "saves against" : "is caught in"} ${zone.name} for ${amount}.`, [roll]);
  }
}

function castFieldSpell(
  combat: CombatState,
  t: CombatToken,
  pregen: Pregen | undefined,
  name: string,
  effect: Record<string, unknown>,
  isBonus: boolean,
  targetId: string | undefined,
  castId: string,
  level: number,
): { rolls: DiceRoll[] } {
  const target = targetId ? combat.tokens.find((x) => x.id === targetId && !x.dead) : t;
  if (effect.type === "note") {
    if (effect.concentration) setConcentration(combat, t, castId);
    spendEconomy(t, isBonus);
    statusEvent(combat, t, name, `${t.name} casts ${name}. It does nothing else in this fight.`);
    refreshReachable(combat);
    return { rolls: [] };
  }
  if (!target) throw new Error("NEED_TARGET");
  if (chebyshev(t.x, t.y, target.x, target.y) > Number(effect.rangeCells ?? 12)) throw new Error("OUT_OF_RANGE");
  if (effect.type === "dispel") {
    const focus = target.concentrating?.spellId;
    const spellLevel = Number((focus ? (getAbility(focus) as { level?: number } | undefined) : undefined)?.level ?? 0);
    const auto = level >= spellLevel;
    const bonus = abilityMod(abilityScore(t, pregen, t.spellAbility ?? "int"));
    const dc = 10 + spellLevel;
    const roll = auto ? undefined : rollCheck({ roller: t.name, label: "Dispel", bonus, dc, purpose: "save" });
    const ok = auto || roll?.outcome === "success";
    if (ok && target.concentrating) breakConcentration(combat, target);
    spendEconomy(t, isBonus);
    statusEvent(
      combat,
      t,
      name,
      ok ? `${t.name} dispels the magic on ${target.name}.` : `${t.name} fails to dispel (${roll?.total} vs DC ${dc}).`,
      roll ? [roll] : [],
    );
    refreshReachable(combat);
    return { rolls: roll ? [roll] : [] };
  }
  if (effect.type === "polymorph") {
    if (target.polymorphBackup) throw new Error("BAD_TARGET");
    target.polymorphBackup = {
      hp: target.hp,
      maxHp: target.maxHp,
      ac: target.ac,
      name: target.name,
      actionIds: [...target.actionIds],
      bonusActionIds: [...target.bonusActionIds],
    };
    const beast = getMonster("wolf");
    target.name = beast?.name ?? "Wolf";
    target.maxHp = beast?.hp ?? 11;
    target.hp = target.maxHp;
    target.ac = beast?.ac ?? 13;
    target.actionIds = ["ws_wolf_bite"];
    target.bonusActionIds = [];
    target.polymorphBy = t.id;
    if (effect.concentration) setConcentration(combat, t, castId, target.id);
    spendEconomy(t, isBonus);
    statusEvent(combat, t, name, `${target.polymorphBackup.name} is polymorphed into ${target.name}.`);
    refreshReachable(combat);
    return { rolls: [] };
  }
  if (effect.type === "summon") {
    const summon: CombatToken = {
      id: `summon-${t.id}-${combat.seq}`,
      kind: "pc",
      name,
      x: target.x,
      y: target.y,
      hp: 10 + level * 5,
      maxHp: 10 + level * 5,
      ac: 12,
      speedCells: 6,
      movementLeft: 0,
      hasAction: false,
      hasBonusAction: false,
      initiative: t.initiative,
      actionIds: ["ws_wolf_bite"],
      bonusActionIds: [],
      inventory: [],
      dead: false,
      dodging: false,
      disengaging: false,
      hidden: false,
      secondWindUsed: false,
      summonOwner: t.id,
      summonSpellId: castId,
    };
    combat.tokens.push(summon);
    if (effect.concentration) setConcentration(combat, t, castId);
    spendEconomy(t, isBonus);
    statusEvent(combat, t, name, `${t.name} summons ${name}.`);
    refreshReachable(combat);
    return { rolls: [] };
  }
  if (target.concentrating) breakConcentration(combat, target);
  spendEconomy(t, isBonus);
  statusEvent(combat, t, name, `${t.name} counters the magic on ${target.name}.`);
  refreshReachable(combat);
  return { rolls: [] };
}

/** Cone spells: every foe inside the cone makes the save. The aimed foe is always included. */
function queueDelayedSaveDamage(
  target: CombatToken,
  saved: boolean,
  effect: Record<string, unknown>,
  spellName: string,
  castId: string,
): void {
  if (saved) return;
  const delayed = delayedOnHitFromEffect(effect);
  if (delayed?.dice) queueStartOfTurnDamage(target, delayed, spellName, castId);
}

function castSaveArea(
  combat: CombatState,
  t: CombatToken,
  aim: CombatToken,
  name: string,
  effect: Record<string, unknown>,
  pregen: Pregen | undefined,
  isBonus: boolean,
  castId: string,
): { rolls: DiceRoll[] } {
  const shape = String(effect.shape ?? "cone");
  const length = Number(effect.lengthCells ?? effect.rangeCells ?? 3);
  const radius = Number(effect.radius ?? length);
  if (shape !== "cube" && chebyshev(t.x, t.y, aim.x, aim.y) > length) throw new Error("OUT_OF_RANGE");
  demandShot(combat, t, aim);
  const origin = shape === "sphere" ? aim : t;
  const dirX = aim.x - t.x;
  const dirY = aim.y - t.y;
  const dirLen = Math.hypot(dirX, dirY) || 1;
  const caught = combat.tokens.filter((e) => {
    if (!isFoe(combat, t, e) || e.dead) return false;
    if (!clearShot(combat, origin.x, origin.y, e.x, e.y)) return false;
    if (shape === "one") return e.id === aim.id;
    if (shape === "sphere") return chebyshev(aim.x, aim.y, e.x, e.y) <= radius;
    if (shape === "cube") return chebyshev(t.x, t.y, e.x, e.y) <= length && e.id !== t.id;
    if (shape === "line") {
      const ux = dirX / dirLen;
      const uy = dirY / dirLen;
      const ex = e.x - t.x;
      const ey = e.y - t.y;
      const along = ex * ux + ey * uy;
      if (along < 0 || along > length) return false;
      const perp = Math.abs(ex * uy - ey * ux);
      return perp <= 0.75;
    }
    if (e.id === aim.id) return true;
    const d = chebyshev(t.x, t.y, e.x, e.y);
    if (d < 1 || d > length) return false;
    const ex = e.x - t.x;
    const ey = e.y - t.y;
    const cos = (ex * dirX + ey * dirY) / ((Math.hypot(ex, ey) || 1) * dirLen);
    return cos >= Math.cos(CONE_HALF_ANGLE);
  });
  const dmgParts = (effect.damage as Array<{ dice: string; damageType: string }>) ?? [];
  const dc = pcSpellDc(t, pregen, spellKey(t, pregen, String(effect.dcFrom ?? "int")));
  const saveKey = String(effect.ability ?? "dex");
  const rolls: DiceRoll[] = [];
  let rolledTotal = 0;
  for (const part of dmgParts) {
    if (!part.dice || part.dice === "0") continue;
    const rolled = rollNotation(part.dice);
    rolledTotal += rolled.total;
    rolls.push(
      makeDiceRoll({
        roller: t.name,
        notation: part.dice,
        values: rolled.values,
        sides: rolled.sides,
        modifier: rolled.modifier,
        total: rolled.total,
        purpose: "damage",
        label: `${name} · ${part.damageType}`,
        damageType: part.damageType,
      }),
    );
  }
  const hits: StrikeHit[] = [];
  for (const e of caught) {
    if (e.kind === "pc" && e.playerId && combat.phoneIds?.includes(e.playerId)) {
      combat.awaiting = [
        ...(combat.awaiting ?? []),
        {
          id: `save-${e.playerId}-${combat.seq}`,
          playerId: e.playerId,
          label: `${saveKey.toUpperCase()} save`,
          step: "save",
          targetId: e.id,
          saveAbility: saveKey,
          saveDc: dc,
          saveDamage: rolledTotal,
          saveHalf: Boolean(effect.halfOnSuccess),
          saveFail: effect.onFail ? String(effect.onFail) : undefined,
          saveSourceSpellId: castId,
        },
      ];
      continue;
    }
    const { roll: save, ok: saved } = creatureSave(e, saveKey, dc, true);
    rolls.push(save);
    const cantrip = Number(effect.slot ?? effect.level ?? 1) === 0;
    let dmg = saved
      ? effect.halfOnSuccess || potentCantripHalf(t, cantrip, true)
        ? Math.floor(rolledTotal / 2)
        : 0
      : rolledTotal;
    if (sculptSucceeds(t, isFriend(combat, t, e))) dmg = 0;
    const evaded = evasionDamage(e, saveKey, saved, rolledTotal, Boolean(effect.halfOnSuccess));
    if (evaded != null) dmg = evaded;
    if (!saved && effect.onFail) {
      addCondition(e, String(effect.onFail));
      if (effect.repeatSave) {
        e.spellLinks = [
          ...(e.spellLinks ?? []),
          { condition: String(effect.onFail), spellId: castId, by: t.id, saveAbility: saveKey, saveDc: dc, repeat: true },
        ];
      }
    }
    hits.push({
      targetId: e.id,
      outcome: saved ? "success" : "fail",
      damage: dmg,
      hp: Math.max(0, e.hp - dmg),
    });
  }
  t.hidden = false;
  spendEconomy(t, isBonus);
  if (effect.concentration) setConcentration(combat, t, castId);
  if (effect.persistentZone) {
    const part = dmgParts[0];
    combat.zones = [
      ...(combat.zones ?? []),
      {
        id: `zone-${combat.seq}-${t.id}`,
        by: t.id,
        spellId: castId,
        name,
        x: aim.x,
        y: aim.y,
        radius: Number(effect.radius ?? effect.lengthCells ?? 2),
        saveAbility: saveKey,
        dc,
        dice: part?.dice && part.dice !== "0" ? part.dice : "1d4",
        damageType: part?.damageType && part.damageType !== "none" ? part.damageType : "fire",
        half: Boolean(effect.halfOnSuccess),
        touched: caught.map((e) => e.id),
      },
    ];
  }
  const blow = hits
    .map((h) => {
      const foe = combat.tokens.find((x) => x.id === h.targetId);
      const who = foe?.name ?? "A creature";
      if (h.damage <= 0) return `${who} saves`;
      return h.outcome === "success" ? `${who} takes ${h.damage} (half)` : `${who} takes ${h.damage}`;
    })
    .join("; ");
  emit(combat, {
    kind: "strike",
    tokenId: t.id,
    ability: name,
    style: "spell",
    rolls,
    hits,
    line: `${t.name} casts ${name}: ${blow}. DC ${dc} ${saveKey.toUpperCase()}.`,
  });
  for (const h of hits) {
    const e = combat.tokens.find((x) => x.id === h.targetId)!;
    if (h.damage > 0) applyDamage(combat, e, h.damage);
    if (h.outcome === "fail") queueDelayedSaveDamage(e, false, effect, name, castId);
  }
  if (!(combat.awaiting ?? []).some((a) => a.step === "save")) checkEnd(combat);
  refreshReachable(combat);
  return { rolls };
}

export function commitAreaSave(combat: CombatState, playerId: string): void {
  const mine = (combat.awaiting ?? []).find((a) => a.playerId === playerId && a.step === "save");
  if (!mine || !mine.targetId || mine.saveDc == null || mine.saveDamage == null) throw new Error("NO_ROLL");
  const token = combat.tokens.find((t) => t.id === mine.targetId);
  if (!token) throw new Error("BAD_TARGET");
  combat.awaiting = (combat.awaiting ?? []).filter((a) => a.id !== mine.id);
  const { roll, ok } = creatureSave(token, mine.saveAbility ?? "dex", mine.saveDc, true);
  const damage = ok ? (mine.saveHalf ? Math.floor(mine.saveDamage / 2) : 0) : mine.saveDamage;
  if (!ok && mine.saveFail) addCondition(token, mine.saveFail);
  if (ok && mine.saveRepeat && mine.saveCondition) {
    token.conditions = (token.conditions ?? []).filter((c) => c !== mine.saveCondition);
    token.spellLinks = (token.spellLinks ?? []).filter((link) => link.condition !== mine.saveCondition);
  }
  statusEvent(
    combat,
    token,
    mine.label,
    ok ? `${token.name} saves (${roll.total} vs DC ${mine.saveDc}).` : `${token.name} fails and takes ${damage}.`,
    [roll],
  );
  if (damage > 0) applyDamage(combat, token, damage);
  if (!ok && mine.saveSourceSpellId) {
    const ability = getAbility(mine.saveSourceSpellId);
    const eff = ability?.effects[0] as Record<string, unknown> | undefined;
    if (eff) queueDelayedSaveDamage(token, false, eff, ability?.name ?? mine.label, mine.saveSourceSpellId);
  }
  if (!(combat.awaiting ?? []).some((a) => a.step === "save")) checkEnd(combat);
}

function dashStillUndoable(t: CombatToken, abilityId: string): boolean {
  const u = t.dashUndo;
  return Boolean(u && u.abilityId === abilityId && t.movementLeft === u.movementLeft);
}

function undoDash(combat: CombatState, t: CombatToken): void {
  const u = t.dashUndo;
  if (!u || t.movementLeft !== u.movementLeft) throw new Error("NO_ACTION");
  t.movementLeft = Math.max(0, t.movementLeft - u.granted);
  if (u.bonus) t.hasBonusAction = true;
  else if (u.extra) t.extraAction = true;
  else t.hasAction = true;
  t.attackedThisTurn = u.attacked;
  t.dashUndo = undefined;
  statusEvent(combat, t, "Dash", `${t.name} takes back the Dash.`);
  refreshReachable(combat);
}

function spendEconomy(t: CombatToken, bonus: boolean, opts: { attack?: boolean } = {}): void {
  if (bonus) {
    t.hasBonusAction = false;
    return;
  }
  if (opts.attack && !t.hasAction && (t.attacksLeft ?? 0) > 0) {
    t.attacksLeft = (t.attacksLeft ?? 0) - 1;
    t.attackedThisTurn = true;
    return;
  }
  if (t.hasAction) t.hasAction = false;
  else t.extraAction = false;
  t.attackedThisTurn = true;
  t.attacksLeft = opts.attack ? (t.kit?.extraAttacks ?? 0) : 0;
}

function effectiveAc(token: CombatToken): number {
  return Math.max(token.ac, token.acFloor ?? 0) + (token.acBonus ?? 0) + (token.auraAc ?? 0);
}

function offerDamageDefense(
  combat: CombatState,
  target: CombatToken,
  kind: "uncanny_dodge" | "deflect_attacks",
  harm: number,
  damageType: string,
): boolean {
  if (combat.pending || !target.playerId || harm <= 0) return false;
  const label = kind === "uncanny_dodge" ? "Uncanny Dodge" : "Deflect Attacks";
  combat.pending = {
    kind,
    playerId: target.playerId,
    tokenId: target.id,
    prompt: `${target.name} can use ${label}.`,
    acceptLabel: kind === "uncanny_dodge" ? "Halve damage" : "Deflect",
    declineLabel: "Take full damage",
    damage: harm,
    damageType,
    rolls: [],
    abilityName: label,
    style: "melee",
    attackerId: "",
  };
  combat.reactionExpiresAt = Date.now() + REACTION_WAIT_MS;
  return true;
}

export function expireReactionIfStale(combat: CombatState): void {
  if (!combat.pending || !combat.reactionExpiresAt) return;
  if (Date.now() <= combat.reactionExpiresAt) return;
  const pending = combat.pending;
  combat.pending = undefined;
  combat.reactionExpiresAt = undefined;
  resolveReaction(combat, pending.playerId, false);
}

function tickGlobalTimedEffects(combat: CombatState): void {
  for (const token of combat.tokens) {
    if (!token.timedEffects?.length) continue;
    const next = token.timedEffects
      .map((row) => ({ ...row, pcTurnsLeft: row.pcTurnsLeft - 1 }))
      .filter((row) => row.pcTurnsLeft > 0);
    const ended = token.timedEffects.filter((row) => row.pcTurnsLeft === 1);
    token.timedEffects = next.length ? next : undefined;
    for (const row of ended) {
      if (row.spellId === GIANT_STRENGTH_EFFECT_ID) {
        const nextOverride = { ...(token.abilityOverride ?? {}) };
        delete nextOverride.str;
        token.abilityOverride = Object.keys(nextOverride).length ? nextOverride : undefined;
        const pregen = token.characterId ? getPregen(token.characterId) : undefined;
        if (token.saves && pregen) {
          const kitProf = token.kit?.saves.includes("str") ? (pregen.proficiencyBonus ?? 2) : 0;
          token.saves.str = abilityMod(pregen.abilities.str ?? 10) + kitProf + (token.gearSaveBonus ?? 0);
        }
        statusEvent(combat, token, row.label, `${row.label} ends on ${token.name}.`);
        continue;
      }
      if (row.spellId === INVISIBILITY_POTION_EFFECT_ID) {
        const spellInvis =
          token.concentrating?.spellId === "spell_invisibility" &&
          (!token.concentrating.targetId || token.concentrating.targetId === token.id);
        if (!spellInvis) token.invisible = false;
        statusEvent(combat, token, row.label, `${row.label} wears off — ${token.name} is visible again.`);
        continue;
      }
      if (row.spellId === "wild_shape" && token.wildShaped) {
        try {
          statusEvent(combat, token, row.label, endWildShape(token));
        } catch {
          /* already reverted */
        }
        continue;
      }
      if (token.concentrating?.spellId === row.spellId) breakConcentration(combat, token);
      statusEvent(combat, token, row.label, `${row.label} ends on ${token.name}.`);
    }
  }
}

export function applyDamage(
  combat: CombatState,
  target: CombatToken,
  amount: number,
  crit = false,
  damageType = "untyped",
  skipDefensePrompt = false,
): void {
  let harm = harmAmount(target, amount, damageType);
  if (ignorePhysicalResistance(target, damageType)) {
    harm = amount;
    if (target.damageVulnerabilities?.includes(damageType)) harm *= 2;
  }
  if (target.raging && ["bludgeoning", "piercing", "slashing"].includes(damageType)) harm = Math.floor(harm / 2);
  const physical = ["bludgeoning", "piercing", "slashing"].includes(damageType);
  if (
    !skipDefensePrompt &&
    target.reactionReady &&
    physical &&
    harm > 0 &&
    target.kind === "pc" &&
    hasFeature(target, "uncanny_dodge") &&
    offerDamageDefense(combat, target, "uncanny_dodge", harm, damageType)
  ) {
    return;
  }
  if (
    !skipDefensePrompt &&
    target.reactionReady &&
    harm > 0 &&
    target.kind === "pc" &&
    hasFeature(target, "deflect_attacks") &&
    (physical || hasFeature(target, "deflect_energy")) &&
    offerDamageDefense(combat, target, "deflect_attacks", harm, damageType)
  ) {
    return;
  }
  if (hasFeature(target, "superior_hunters_defense") && harm > 0) {
    const attacker = combat.tokens.find((x) => x.id !== target.id && !x.dead && chebyshev(x.x, x.y, target.x, target.y) <= 1);
    if (attacker) attacker.hp = Math.max(0, attacker.hp - rollNotation("1d8").total);
  }
  if (target.kind === "pc" && (target.dying || target.stable || target.hp <= 0)) {
    if (harm > 0) {
      target.stable = false;
      target.dying = true;
      stripTurn(target);
      target.deathFailures = (target.deathFailures ?? 0) + (crit ? 2 : 1);
      if (harm >= target.maxHp) target.deathFailures = 3;
      if ((target.deathFailures ?? 0) >= 3) markDead(combat, target);
    }
    return;
  }
  if (harm > 0 && (target.tempHp ?? 0) > 0) {
    const soak = Math.min(target.tempHp ?? 0, harm);
    target.tempHp = (target.tempHp ?? 0) - soak;
    harm -= soak;
  }
  if (harm <= 0) return;
  const over = harm - target.hp;
  target.hp = Math.max(0, target.hp - harm);
  if (target.concentrating && harm > 0) concentrationCheck(combat, target, harm);
  if (target.hp === 0 && !target.dead) {
    if (combat.pvp === "ffa" || combat.pve) {
      markDead(combat, target);
    } else if (target.kind === "pc" && over < target.maxHp) {
      target.dying = true;
      target.stable = false;
      target.deathSuccesses = 0;
      target.deathFailures = 0;
      stripTurn(target);
      emit(combat, { kind: "down", tokenId: target.id, line: `${target.name} collapses!` });
      if (currentToken(combat)?.id === target.id) advanceTurn(combat);
    } else {
      markDead(combat, target);
    }
  }
}

function applyHaste(token: CombatToken, skipLethargy: boolean): void {
  if (!token.hasteBaseSpeed) token.hasteBaseSpeed = token.speedCells;
  token.hasted = true;
  token.hasteSkipLethargy = skipLethargy;
  token.speedCells = token.hasteBaseSpeed * 2;
  token.movementLeft = Math.max(token.movementLeft, token.speedCells);
  token.acBonus = (token.acBonus ?? 0) + 2;
  token.extraAction = true;
}

function staffStrikingChargePool(token: CombatToken): string | undefined {
  if (!token.gearCharges) return undefined;
  return Object.keys(token.gearCharges).find((key) => key.includes("staff_of_striking") || key.includes("striking"));
}

function castBaneSpell(
  combat: CombatState,
  caster: CombatToken,
  pregen: Pregen | undefined,
  name: string,
  effect: Record<string, unknown>,
  isBonus: boolean,
  castId: string,
  targetId: string | undefined,
  slotLevel: number,
): { rolls: DiceRoll[] } {
  if (!targetId) throw new Error("NEED_TARGET");
  const range = Number(effect.rangeCells ?? 6);
  const baseCap = Number(effect.maxTargets ?? 3);
  const baseSlot = Number(effect.baseSlot ?? 1);
  const cap = baseCap + Math.max(0, slotLevel - baseSlot);
  const origin = combat.tokens.find((x) => x.id === targetId);
  if (!origin || !isFoe(combat, caster, origin)) throw new Error("BAD_TARGET");
  const picked: CombatToken[] = [origin];
  for (const foe of combat.tokens) {
    if (picked.length >= cap) break;
    if (foe.dead || !isFoe(combat, caster, foe) || picked.includes(foe)) continue;
    if (chebyshev(foe.x, foe.y, caster.x, caster.y) > range) continue;
    if (!clearShot(combat, caster.x, caster.y, foe.x, foe.y)) continue;
    picked.push(foe);
  }
  const prof = pregen?.proficiencyBonus ?? 2;
  const dc = 8 + prof + abilityMod(abilityScore(caster, pregen, caster.spellAbility ?? "cha"));
  const rolls: DiceRoll[] = [];
  const names: string[] = [];
  for (const foe of picked) {
    foe.baned = false;
    const { roll, ok } = creatureSave(foe, "cha", dc, true);
    rolls.push(roll);
    if (!ok) {
      foe.baned = true;
      names.push(foe.name);
    }
  }
  if (effect.concentration) setConcentration(combat, caster, castId);
  spendEconomy(caster, isBonus);
  statusEvent(
    combat,
    caster,
    name,
    names.length ? `${caster.name} casts ${name} on ${names.join(", ")}.` : `${caster.name} casts ${name}, but everyone resists.`,
    rolls,
  );
  refreshReachable(combat);
  return { rolls };
}

function markDead(combat: CombatState, target: CombatToken): void {
  if (target.brand?.by) {
    const caster = combat.tokens.find((x) => x.id === target.brand!.by);
    if (caster?.concentrating?.targetId === target.id && (caster.concentrating.spellId === "spell_hex" || caster.concentrating.spellId === "spell_hunters_mark")) {
      caster.pendingMarkRetarget = caster.concentrating.spellId;
    }
  }
  target.dead = true;
  target.dying = false;
  target.hp = 0;
  recordElimination(combat, target);
  emit(combat, {
    kind: "down",
    tokenId: target.id,
    line: target.kind === "enemy" ? `${target.name} goes still.` : `${target.name} is gone.`,
  });
}

function concentrationCheck(combat: CombatState, token: CombatToken, damage: number): void {
  const focus = token.concentrating;
  if (!focus) return;
  if (hasFeature(token, "relentless_hunter") && /hunter/.test(focus.spellId)) return;
  const bonus = saveBonus(token, "con") + (token.auraBonus ?? 0);
  const dc = Math.max(10, Math.floor(damage / 2));
  const roll = rollCheck({
    roller: token.name,
    label: "Concentration",
    bonus,
    dc,
    purpose: "save",
  });
  if (roll.outcome === "success") {
    statusEvent(combat, token, "Concentration", `${token.name} holds the spell (${roll.total} vs DC ${dc}).`, [roll]);
    return;
  }
  breakConcentration(combat, token);
  statusEvent(combat, token, "Concentration", `${token.name} loses the spell (${roll.total} vs DC ${dc}).`, [roll]);
}

function breakConcentration(combat: CombatState, token: CombatToken): void {
  const focus = token.concentrating;
  token.concentrating = undefined;
  if (!focus) return;
  if (focus.spellId === "spell_bless") {
    for (const ally of combat.tokens) ally.blessed = false;
  }
  if (focus.spellId === "spell_bane") {
    for (const foe of combat.tokens) foe.baned = false;
  }
  if (focus.targetId) {
    const marked = combat.tokens.find((x) => x.id === focus.targetId);
    if (marked?.brand?.by === token.id) marked.brand = undefined;
    if (marked && (focus.spellId === "spell_shield_of_faith" || focus.spellId === "spell_blur" || focus.spellId === "spell_invisibility" || focus.spellId === "spell_barkskin")) {
      marked.blur = false;
      marked.invisible = false;
      marked.acFloor = undefined;
      marked.acBonus = 0;
    }
  }
  clearCasterSpell(combat.tokens, token.id, focus.spellId);
  for (const other of combat.tokens) {
    if (other.polymorphBy === token.id) {
      restorePolymorph(other);
      other.polymorphBy = undefined;
    }
  }
  combat.zones = (combat.zones ?? []).filter((zone) => zone.by !== token.id);
  combat.tokens = combat.tokens.filter((other) => other.summonOwner !== token.id);
  if (combat.tokens.every((other) => other.summonOwner !== token.id)) {
    combat.turnOrder = combat.turnOrder.filter((id) => combat.tokens.some((other) => other.id === id));
  }
  token.blur = false;
  token.invisible = false;
}

function shieldReady(target: CombatToken): boolean {
  return Boolean(
    target.kind === "pc" &&
      target.playerId &&
      target.reactionReady &&
      target.reactionIds?.includes("spell_shield") &&
      (target.slots?.["1"] ?? 0) > 0 &&
      !target.dead &&
      !target.dying,
  );
}

function offerRetaliation(combat: CombatState, attacker: CombatToken, target: CombatToken): boolean {
  if (combat.pending) return false;
  if (target.dead || target.dying || !target.reactionReady) return false;
  if (!hasFeature(target, "retaliation")) return false;
  if (chebyshev(attacker.x, attacker.y, target.x, target.y) > 1) return false;
  const melee = meleeOf(target);
  if (!melee || !target.playerId) return false;
  combat.pending = {
    kind: "retaliation",
    playerId: target.playerId,
    tokenId: target.id,
    prompt: `${target.name} can strike ${attacker.name} back.`,
    acceptLabel: "Retaliation",
    declineLabel: "Let it go",
    abilityId: melee,
    targetId: attacker.id,
    damage: 0,
    rolls: [],
    abilityName: "Retaliation",
    style: "melee",
    attackerId: target.id,
  };
  return true;
}

function holdForShield(
  combat: CombatState,
  attacker: CombatToken,
  target: CombatToken,
  blow: Omit<PendingReaction, "kind" | "playerId" | "tokenId" | "prompt" | "acceptLabel" | "declineLabel">,
): boolean {
  if (!shieldReady(target) || !target.playerId) return false;
  combat.pending = {
    kind: "shield",
    playerId: target.playerId,
    tokenId: target.id,
    prompt: `${target.name} can cast Shield against ${attacker.name}.`,
    acceptLabel: "Cast Shield",
    declineLabel: "Take the hit",
    ...blow,
  };
  combat.reactionExpiresAt = Date.now() + REACTION_WAIT_MS;
  return true;
}

function resolveDeathSave(combat: CombatState, token: CombatToken): void {
  const face = rollD20();
  const extra = (token.gearSaveBonus ?? 0) + (token.auraBonus ?? 0);
  const total = face + extra;
  const roll = makeDiceRoll({
    roller: token.name,
    notation: extra ? `1d20${extra >= 0 ? "+" : ""}${extra}` : "1d20",
    values: [face],
    sides: [20],
    modifier: extra,
    total,
    purpose: "save",
    label: "Death save",
  });
  if (face === 20) {
    token.hp = 1;
    token.dying = false;
    token.stable = false;
    token.deathSuccesses = 0;
    token.deathFailures = 0;
    statusEvent(combat, token, "Death save", `Natural 20. ${token.name} springs back with 1 hit point.`, [roll]);
    return;
  }
  if (face === 1) token.deathFailures = (token.deathFailures ?? 0) + 2;
  else if (total >= 10) token.deathSuccesses = (token.deathSuccesses ?? 0) + 1;
  else token.deathFailures = (token.deathFailures ?? 0) + 1;
  if ((token.deathFailures ?? 0) >= 3) {
    statusEvent(combat, token, "Death save", `${token.name} fails the last death save.`, [roll]);
    markDead(combat, token);
    checkEnd(combat);
    return;
  }
  if ((token.deathSuccesses ?? 0) >= 3) {
    token.stable = true;
    token.dying = false;
    statusEvent(combat, token, "Death save", `${token.name} stabilizes, still unconscious.`, [roll]);
    return;
  }
  statusEvent(
    combat,
    token,
    "Death save",
    `${token.name} death save ${face}. ${token.deathSuccesses ?? 0} successes, ${token.deathFailures ?? 0} failures.`,
    [roll],
  );
}

function dexOfToken(t: CombatToken): number {
  return t.kind === "pc"
    ? (getPregen(t.characterId!)?.abilities.dex ?? 10)
    : (getMonster(t.monsterId!)?.abilities.dex ?? 10);
}

/** One hero's initiative, then the fight starts once every held die has landed. */
function initiativeBonus(token: CombatToken, pregen: Pregen | undefined): number {
  let bonus = abilityMod(pregen?.abilities.dex ?? 10);
  if (hasFeature(token, "alert")) bonus += pregen?.proficiencyBonus ?? 2;
  return bonus;
}

function rollLiveInitiative(token: CombatToken, pregen: Pregen | undefined): number {
  const bonus = initiativeBonus(token, pregen);
  if (!hasFeature(token, "feral_instinct")) return rollD20() + bonus;
  return rollCheck({
    roller: token.name,
    label: "Initiative",
    bonus,
    dc: 0,
    purpose: "check",
    mode: "advantage",
  }).total;
}

export function commitInitiative(combat: CombatState, playerId: string): void {
  const t = combat.tokens.find((token) => token.kind === "pc" && token.playerId === playerId);
  if (!t) throw new Error("NO_PLAYER");
  const pregen = t.characterId ? getPregen(t.characterId) : undefined;
  const bonus = initiativeBonus(t, pregen);
  const mode: D20Mode = hasFeature(t, "feral_instinct") ? "advantage" : "normal";
  const roll = rollCheck({
    roller: t.name,
    label: "Initiative",
    bonus,
    dc: 0,
    purpose: "check",
    mode,
  });
  t.initiative = roll.total;
  combat.awaiting = (combat.awaiting ?? []).filter((a) => !(a.playerId === playerId && a.step === "initiative"));
  statusEvent(combat, t, "Initiative", `${t.name} rolls initiative ${t.initiative}.`, [roll]);
  if ((combat.awaiting ?? []).some((a) => a.step === "initiative")) return;
  combat.turnOrder = [...combat.tokens]
    .sort(
      (a, b) =>
        b.initiative - a.initiative ||
        dexOfToken(b) - dexOfToken(a) ||
        (a.kind === "pc" ? -1 : 1) - (b.kind === "pc" ? -1 : 1),
    )
    .map((token) => token.id);
  combat.gathering = false;
  combat.turnIndex = 0;
  emit(combat, {
    kind: "start",
    order: combat.turnOrder,
    line: `Initiative: ${combat.turnOrder.map((id) => combat.tokens.find((token) => token.id === id)!.name).join(", ")}.`,
  });
  beginTurn(combat);
  settleEnemies(combat);
}

export function commitDeathSave(combat: CombatState, playerId: string): void {
  const t = combat.tokens.find((token) => token.kind === "pc" && token.playerId === playerId);
  if (!t) throw new Error("NO_PLAYER");
  combat.awaiting = (combat.awaiting ?? []).filter((a) => a.id !== `death-${playerId}`);
  resolveDeathSave(combat, t);
  if (combat.status !== "active") return;
  if (t.dead || t.dying || t.stable) advanceTurn(combat);
  else beginTurn(combat);
}

function meleeOf(token: CombatToken): string | undefined {
  const ids = token.actionIds.map((id) => splitVariant(id).id);
  return (
    ids.find((id) => id.endsWith("_attack") || id === "unarmed_strike") ??
    ids.find((id) => {
      const ability = getAbility(id);
      const effect = ability?.effects[0];
      return effect?.type === "attack" && Number(effect.rangeCells ?? 1) <= 1;
    })
  );
}

function reactorLeaving(combat: CombatState, mover: CombatToken, from: Cell, to: Cell): CombatToken | undefined {
  if (mover.disengaging) return undefined;
  return combat.tokens.find((other) => {
    if (other.dead || other.dying || other.id === mover.id || other.kind === mover.kind) return false;
    if (!other.reactionReady) return false;
    const was = chebyshev(other.x, other.y, from.x, from.y) <= 1;
    const still = chebyshev(other.x, other.y, to.x, to.y) <= 1;
    if (!was || still) return false;
    if (!clearShot(combat, other.x, other.y, from.x, from.y)) return false;
    if (other.kind === "pc") return Boolean(meleeOf(other));
    return enemyAttacks(other).some((attack) => attack.range <= 1);
  });
}

function finishMove(combat: CombatState, mover: CombatToken, path: Cell[], cost: number): void {
  const end = path[path.length - 1];
  if (!end) return;
  mover.x = end.x;
  mover.y = end.y;
  mover.movementLeft = Math.max(0, mover.movementLeft - cost);
  if (cost > 0) mover.dashUndo = undefined;
  emit(combat, {
    kind: "move",
    tokenId: mover.id,
    path,
    line: `${mover.name} moves ${cost * 5} ft.`,
  });
  refreshAuras(combat);
  tickAuraEnter(combat, mover);
  tickZones(combat, mover);
}

function commitMove(combat: CombatState, mover: CombatToken, path: Cell[], cost: number): void {
  const free = mover.freeMove ?? 0;
  if (free > 0 && cost > 0) {
    const freeCost = Math.min(free, cost);
    const freeEnd = Math.min(path.length - 1, freeCost);
    if (freeEnd >= 1) {
      finishMove(combat, mover, path.slice(0, freeEnd + 1), freeEnd);
      mover.freeMove = Math.max(0, free - freeEnd);
      if (freeEnd >= path.length - 1 || cost <= freeEnd) return;
      commitMove(combat, mover, path.slice(freeEnd), cost - freeEnd);
      return;
    }
  }
  let threatAt = -1;
  let reactor: CombatToken | undefined;
  for (let i = 1; i < path.length; i += 1) {
    reactor = reactorLeaving(combat, mover, path[i - 1]!, path[i]!);
    if (reactor) {
      threatAt = i;
      break;
    }
  }
  if (!reactor || threatAt < 0) {
    finishMove(combat, mover, path, cost);
    return;
  }
  const prefix = path.slice(0, threatAt);
  if (prefix.length > 1) finishMove(combat, mover, prefix, prefix.length - 1);
  const rest = path.slice(threatAt - 1);
  if (reactor.kind === "pc" && reactor.playerId && reactor.reactionReady) {
    combat.pending = {
      kind: "opportunity",
      playerId: reactor.playerId,
      tokenId: reactor.id,
      prompt: `${mover.name} leaves ${reactor.name}'s reach.`,
      acceptLabel: "Opportunity attack",
      declineLabel: "Let them pass",
      abilityId: meleeOf(reactor),
      targetId: mover.id,
      damage: 0,
      rolls: [],
      abilityName: "Opportunity Attack",
      style: "melee",
      attackerId: reactor.id,
      moverId: mover.id,
      path: rest,
      cost: rest.length - 1,
      dest: rest[rest.length - 1],
    };
    combat.reactionExpiresAt = Date.now() + REACTION_WAIT_MS;
    return;
  }
  const attack = enemyAttacks(reactor).find((item) => item.range <= 1);
  if (attack && reactor.kind === "enemy") {
    reactor.reactionReady = false;
    enemyStrike(combat, reactor, mover, attack);
    if (combat.pending) {
      combat.pending.resumePath = rest;
      combat.pending.resumeMoverId = mover.id;
      return;
    }
  }
  continueAfterThreat(combat, mover, rest);
}

/** The provoking step is taken once, then the rest of the path is checked again. */
function continueAfterThreat(combat: CombatState, mover: CombatToken, rest: Cell[]): void {
  if (mover.dead || mover.dying || rest.length < 2) return;
  const from = rest[0]!;
  const to = rest[1]!;
  if (mover.x === from.x && mover.y === from.y) finishMove(combat, mover, [from, to], 1);
  if (mover.dead || mover.dying) return;
  if (rest.length > 2 && mover.x === to.x && mover.y === to.y) commitMove(combat, mover, rest.slice(1), rest.length - 2);
}

function resolveSpellAttack(
  combat: CombatState,
  attacker: CombatToken,
  pregen: Pregen | undefined,
  name: string,
  effect: Record<string, unknown>,
  targetId: string,
  alreadySpent: boolean,
  free: boolean,
): { rolls: DiceRoll[] } {
  const target = combat.tokens.find((x) => x.id === targetId && !x.dead);
  if (!target) throw new Error("BAD_TARGET");
  const range = Number(effect.rangeCells ?? 1);
  if (chebyshev(attacker.x, attacker.y, target.x, target.y) > range) throw new Error("OUT_OF_RANGE");
  demandShot(combat, attacker, target);
  const key = spellKey(attacker, pregen, String(effect.ability ?? "str"));
  const prof = pregen?.proficiencyBonus ?? 2;
  const bonus = abilityMod(abilityScore(attacker, pregen, key)) + (effect.spellAttack || effect.proficient ? prof : 0);
  const roll = rollAttack({
    roller: attacker.name,
    label: `${name} vs ${target.name}`,
    bonus,
    ac: effectiveAc(target),
    mode: "normal",
  });
  const rolls: DiceRoll[] = [roll];
  const landed = roll.outcome === "hit" || roll.outcome === "crit";
  let damage = 0;
  if (landed) {
    const part = ((effect.damage as Array<{ dice: string; damageType: string }> | undefined) ?? [])[0];
    if (part) {
      const rolled = rollNotation(part.dice, { crit: roll.outcome === "crit" });
      damage = rolled.total;
      rolls.push(
        makeDiceRoll({
          roller: attacker.name,
          notation: part.dice,
          values: rolled.values,
          sides: rolled.sides,
          modifier: rolled.modifier,
          total: rolled.total,
          purpose: "damage",
          label: part.damageType,
          damageType: part.damageType,
        }),
      );
    }
  }
  if (!alreadySpent && !free) spendEconomy(attacker, false);
  if (landed && holdForShield(combat, attacker, target, {
    damage,
    crit: roll.outcome === "crit",
    attackTotal: roll.total,
    damageType: "force",
    rolls,
    abilityName: name,
    style: "spell",
    attackerId: attacker.id,
    targetId: target.id,
  })) {
    return { rolls };
  }
  emit(combat, {
    kind: "strike",
    tokenId: attacker.id,
    ability: name,
    style: "spell",
    rolls,
    hits: [{ targetId: target.id, outcome: roll.outcome ?? "miss", damage, hp: Math.max(0, target.hp - damage) }],
    line: landed
      ? `${attacker.name} hits ${target.name} with ${name} for ${damage}.`
      : `${attacker.name} misses ${target.name} with ${name}.`,
  });
  if (damage > 0) applyDamage(combat, target, damage, roll.outcome === "crit");
  checkEnd(combat);
  return { rolls };
}

function expireRage(combat: CombatState, t: CombatToken): void {
  if (!t.raging) return;
  t.rageLife = (t.rageLife ?? 0) - 1;
  if ((t.rageLife ?? 0) > 0 && !t.heavyArmor && !cannotAct(t)) return;
  t.raging = false;
  t.rageLife = 0;
  statusEvent(combat, t, "Rage", `${t.name}'s rage ends.`);
}

export function endTurn(combat: CombatState, playerId: string): void {
  if (combat.status !== "active") throw new Error("COMBAT_OVER");
  if (combat.pending) throw new Error("REACTION_PENDING");
  const t = currentToken(combat);
  if (!t || t.kind !== "pc" || t.playerId !== playerId) throw new Error("NOT_YOUR_TURN");
  if ((combat.awaiting ?? []).some((a) => a.step === "death" && a.playerId === playerId)) throw new Error("NO_ROLL");
  if (queueRepeatSave(combat, t)) return;
  tickZones(combat, t);
  expireRage(combat, t);
  tickGlobalTimedEffects(combat);
  runLegendaryWindow(combat, t);
  advanceTurn(combat);
}

function abilityModLabel(score: number): string {
  const m = abilityMod(score);
  return m >= 0 ? `+${m}` : `${m}`;
}

type MenuAction = {
  id: string;
  name: string;
  actionType: string;
  economy: string;
  needsTarget: boolean;
  targetKind: "enemy" | "ally" | "none" | "cell";
  range: number;
  guided: boolean;
  available: boolean;
  category: ActionCategory;
  summary: string;
};

export function buildPcSheet(
  token: CombatToken,
  actionMenu: { actions: MenuAction[]; bonusActions: MenuAction[] } | null,
) {
  const pregen = token.characterId ? getPregen(token.characterId) : undefined;
  const abs = liveAbilities(token, pregen);
  const prof = pregen?.proficiencyBonus ?? 2;
  const skilled = (pregen as { skills?: string[] }).skills ?? [];
  const wisMod = abilityMod(abs.wis ?? 10);
  const passivePerception = 10 + wisMod + (skilled.includes("perception") ? prof : 0);
  return {
    characterId: token.characterId,
    portrait: portraitForCharacter(token.characterId),
    name: token.name,
    summary: pregen?.summary ?? "",
    level: token.level ?? pregen?.level ?? 1,
    className: pregen?.class ?? "adventurer",
    race: (pregen as { race?: string } | undefined)?.race ?? "",
    background: (pregen as { background?: string } | undefined)?.background ?? "",
    hp: token.hp,
    maxHp: token.maxHp,
    tempHp: token.tempHp ?? 0,
    ac: token.ac,
    speedCells: token.speedCells,
    proficiencyBonus: prof,
    passivePerception,
    abilities: Object.fromEntries(
      Object.entries(abs).map(([k, v]) => [
        k,
        { score: v, mod: abilityMod(v), modLabel: abilityModLabel(v) },
      ]),
    ),
    savingThrows: token.kit?.saves ?? (pregen as { savingThrows?: string[] } | undefined)?.savingThrows ?? [],
    skills: (pregen as { skills?: string[] } | undefined)?.skills ?? [],
    features: token.features ?? (pregen as { features?: string[] } | undefined)?.features ?? [],
    traits: pregen?.traits ?? [],
    inventory: token.inventory ?? [],
    weapons: (pregen as { weapons?: string[] } | undefined)?.weapons ?? [],
    spellSlots: token.slots ?? null,
    spellSlotMax: (pregen as { spellSlots?: Record<string, number> } | undefined)?.spellSlots ?? token.slots ?? null,
    conditions: token.conditions ?? [],
    concentrating: token.concentrating?.spellId ?? null,
    dying: Boolean(token.dying),
    stable: Boolean(token.stable),
    deathSuccesses: token.deathSuccesses ?? 0,
    deathFailures: token.deathFailures ?? 0,
    resources: {
      ki: token.ki ?? null,
      layOnHands: token.layOnHands ?? null,
      sorceryPoints: token.sorceryPoints ?? null,
      ragesLeft: token.ragesLeft ?? null,
      secondWindLeft: token.secondWindLeft ?? null,
      indomitableLeft: token.indomitableLeft ?? null,
      bardicLeft: token.bardicLeft ?? null,
      channelDivinity: token.channelDivinity ?? null,
      hitDice: token.hitDice ?? null,
      extraAttacks: token.kit?.extraAttacks ?? null,
      heroicInspiration: token.heroicInspiration ?? null,
    },
    economy: {
      movementLeft: token.movementLeft,
      hasAction: token.hasAction,
      hasBonusAction: token.hasBonusAction,
      extraAction: Boolean(token.extraAction),
      attacksLeft: token.attacksLeft ?? 0,
      dodging: token.dodging,
      disengaging: token.disengaging,
      hidden: token.hidden,
    },
    actions: actionMenu?.actions ?? [],
    bonusActions: actionMenu?.bonusActions ?? [],
  };
}

function describeAction(id: string, economy: "action" | "bonus_action", owner: CombatToken, guidedId?: string): MenuAction {
  const quicken = id.startsWith("quicken:");
  const split = splitVariant(quicken ? id.slice("quicken:".length) : id);
  const realId = split.id;
  const a = getAbility(realId);
  const effect = a?.effects?.[0];
  const type = String(effect?.type ?? "");
  let targetKind: MenuAction["targetKind"] = "none";
  if (["attack", "auto_hit", "save", "rays", "brand", "sleep"].includes(type)) targetKind = "enemy";
  if (type === "help" || type === "inspire" || type === "restore" || (type === "heal" && !effect?.self) || type === "pool_heal") targetKind = "ally";
  if ((a as { aim?: string }).aim === "cell" || type === "teleport") targetKind = "cell";
  const range = Number(effect?.rangeCells ?? effect?.lengthCells ?? (targetKind === "none" ? 0 : 1));
  let available = economy === "bonus_action" ? owner.hasBonusAction : owner.hasAction || Boolean(owner.extraAction);
  if (economy === "action" && isWeaponAttack(effect) && (owner.attacksLeft ?? 0) > 0) available = true;
  if (realId === "second_wind" && (owner.secondWindLeft ?? 0) <= 0) available = false;
  if (effect?.consume && !owner.inventory.includes(String(effect.consume))) available = false;
  const undoDash = type === "dash" && dashStillUndoable(owner, id);
  if (undoDash) available = true;
  const variantName = split.variant ? ATTACK_VARIANTS[split.variant] : undefined;
  return {
    id,
    name: undoDash ? "Cancel Dash" : quicken ? `Quicken: ${a?.name ?? realId}` : variantName ? `${variantName}` : (a?.name ?? id),
    actionType: economy,
    economy,
    needsTarget: targetKind === "enemy" || type === "help",
    targetKind,
    range,
    guided: id === guidedId,
    available,
    category: actionCategory(realId, a),
    summary: undoDash ? "Take it back — you have not moved yet" : variantName ? `${variantName} · ${a?.name ?? realId}` : actionSummary(id, a),
  };
}

export function publicCombat(combat: CombatState, viewerPlayerId?: string) {
  const current = currentToken(combat);
  const menuFor = (tok: CombatToken, live: boolean) => {
    const guidedId = tok.characterId ? getPregen(tok.characterId)?.guidedDefaultAction : undefined;
    const lock = (a: MenuAction) => (live ? a : { ...a, available: false });
    return {
      movement: {
        left: tok.movementLeft,
        speed: tok.speedCells,
        hint: live ? "Move on your turn (walk / optional Dash)." : "Not your turn",
      },
      actions: tok.actionIds.map((id) => lock(describeAction(id, "action", tok, guidedId))),
      bonusActions: tok.bonusActionIds
        .filter((id) => !(id === "second_wind" && (tok.secondWindLeft ?? 0) <= 0))
        .map((id) => lock(describeAction(id, "bonus_action", tok, guidedId))),
      flags: {
        dodging: tok.dodging,
        disengaging: tok.disengaging,
        hidden: tok.hidden,
        hasAction: tok.hasAction,
        hasBonusAction: tok.hasBonusAction,
        extraAction: Boolean(tok.extraAction),
        attacksLeft: tok.attacksLeft ?? 0,
        raging: Boolean(tok.raging),
        reckless: Boolean(tok.reckless),
      },
    };
  };

  const liveMenu =
    current?.kind === "pc" && !current.dead && !current.dying && !current.stable && combat.status === "active"
      ? menuFor(current, true)
      : null;

  const sheetTok = viewerPlayerId
    ? combat.tokens.find((t) => t.playerId === viewerPlayerId && t.kind === "pc")
    : current?.kind === "pc"
      ? current
      : combat.tokens.find((t) => t.kind === "pc" && !t.dead);
  const sheetMenu = sheetTok ? (sheetTok.id === current?.id && liveMenu ? liveMenu : menuFor(sheetTok, false)) : null;

  return {
    encounterId: combat.encounterId,
    mapId: combat.mapId,
    pvp: combat.pvp ?? null,
    pve: Boolean(combat.pve),
    pvpWinner: combat.pvpWinner ?? null,
    placements: combat.placements ?? {},
    art: resolveArenaArtPublicPath(combat.mapId),
    width: combat.width,
    height: combat.height,
    walls: combat.walls,
    hazards: combat.hazards ?? [],
    round: combat.round,
    seq: combat.seq,
    tokens: combat.tokens.map((t) => ({
      id: t.id,
      kind: t.kind,
      name: t.name,
      x: t.x,
      y: t.y,
      hp: t.hp,
      maxHp: t.maxHp,
      ac: t.ac,
      dead: t.dead,
      dying: Boolean(t.dying),
      stable: Boolean(t.stable),
      deathSuccesses: t.deathSuccesses ?? 0,
      deathFailures: t.deathFailures ?? 0,
      initiative: t.initiative,
      playerId: t.playerId,
      characterId: t.characterId,
      monsterId: t.monsterId,
      teamId: t.teamId ?? null,
      portrait: t.kind === "pc" ? portraitForCharacter(t.characterId) : portraitForMonster(t.monsterId),
      boss: t.kind === "enemy" && t.maxHp >= 30,
      actionIds: t.actionIds,
      movementLeft: t.movementLeft,
      hasAction: t.hasAction,
      hasBonusAction: t.hasBonusAction,
      dodging: t.dodging,
      disengaging: t.disengaging,
      hidden: t.hidden,
      blessed: Boolean(t.blessed),
      marked: Boolean(t.marked),
    })),
    turnOrder: combat.turnOrder,
    currentTokenId: current?.id,
    currentName: current?.name,
    reachable: combat.reachable,
    log: combat.log.slice(-12),
    events: combat.events,
    status: combat.status,
    damagePreview: combat.damagePreview ?? combat.strikeHold?.preview ?? [],
    awaiting: (combat.awaiting ?? []).map((a) => ({ id: a.id, playerId: a.playerId, label: a.label, step: a.step })),
    pendingReaction: combat.pending
      ? {
          playerId: combat.pending.playerId,
          kind: combat.pending.kind,
          prompt: combat.pending.prompt,
          acceptLabel: combat.pending.acceptLabel,
          declineLabel: combat.pending.declineLabel,
        }
      : null,
    aimRequest: combat.aimRequest ?? null,
    actions: [...(liveMenu?.actions ?? []), ...(liveMenu?.bonusActions ?? [])],
    actionMenu: liveMenu,
    sheet: sheetTok ? buildPcSheet(sheetTok, sheetMenu) : null,
  };
}

export type PublicCombat = ReturnType<typeof publicCombat>;

/** A hero whose table dropped for good Dodges and passes the rest of the turn. */
export function applyDisconnectDodge(combat: CombatState, playerId: string): void {
  if (combat.status !== "active") return;
  const t = currentToken(combat);
  if (!t || t.kind !== "pc" || t.playerId !== playerId || t.dead) return;
  combat.awaiting = (combat.awaiting ?? []).filter((a) => a.playerId !== playerId);
  if (t.dying || t.stable) {
    advanceTurn(combat);
    return;
  }
  t.hasAction = false;
  t.movementLeft = 0;
  t.dodging = true;
  statusEvent(combat, t, "Dodge", `${t.name} loses the thread — Dodges and passes the turn.`);
  advanceTurn(combat);
}

/** Ranked forfeit: the absent fighter is eliminated last among those still alive. */
export function applyDisconnectForfeit(combat: CombatState, playerId: string): void {
  if (combat.status !== "active") return;
  const t = combat.tokens.find((tok) => tok.playerId === playerId && tok.kind === "pc" && !tok.dead);
  if (!t) return;
  bumpElimPulse(combat);
  combat.awaiting = (combat.awaiting ?? []).filter((a) => a.playerId !== playerId);
  statusEvent(combat, t, "Forfeit", `${t.name} is gone too long. The arena counts that as a forfeit.`);
  markDead(combat, t);
  if (currentToken(combat)?.id === t.id) {
    t.hasAction = false;
    t.movementLeft = 0;
    advanceTurn(combat);
  }
  checkEnd(combat);
}

function deliverBlow(combat: CombatState, pending: PendingReaction, damage: number): void {
  const target = combat.tokens.find((token) => token.id === pending.targetId);
  emit(combat, {
    kind: "strike",
    tokenId: pending.attackerId,
    ability: pending.abilityName,
    style: pending.style,
    rolls: pending.rolls,
    hits: [
      {
        targetId: pending.targetId ?? pending.attackerId,
        outcome: damage > 0 ? "hit" : "miss",
        damage,
        hp: Math.max(0, (target?.hp ?? 0) - damage),
      },
    ],
    line:
      damage > 0
        ? `${pending.abilityName} hits for ${damage}.`
        : `${pending.abilityName} is turned aside.`,
  });
  if (target && damage > 0) applyDamage(combat, target, damage, pending.crit, pending.damageType);
  if (combat.status === "active" && target && damage > 0) {
    const attacker = combat.tokens.find((token) => token.id === pending.attackerId);
    if (attacker) offerRetaliation(combat, attacker, target);
  }
  checkEnd(combat);
  if (pending.resumePath && pending.resumeMoverId && !combat.pending) {
    const mover = combat.tokens.find((token) => token.id === pending.resumeMoverId);
    if (mover) continueAfterThreat(combat, mover, pending.resumePath);
  }
}

export function requestAim(combat: CombatState, playerId: string, abilityId: string): void {
  if (combat.status !== "active") throw new Error("COMBAT_OVER");
  const token = combat.tokens.find((item) => item.playerId === playerId && item.kind === "pc");
  if (!token) throw new Error("NO_PLAYER");
  if (token.sheetDriven && token.characterId) refreshMenus(token, getPregen(token.characterId), getAbility);
  if (!token.actionIds.includes(abilityId) && !token.bonusActionIds.includes(abilityId)) throw new Error("BAD_ABILITY");
  combat.aimRequest = { playerId, abilityId };
}

/** Re-read after a callee such as holdForShield, which may have stored a new reaction. */
function pendingAfter(combat: CombatState): PendingReaction | undefined {
  return combat.pending;
}

export function resolveReaction(combat: CombatState, playerId: string, accept: boolean): void {
  const pending = combat.pending;
  if (!pending || pending.playerId !== playerId) throw new Error("NO_REACTION");
  combat.pending = undefined;
  combat.reactionExpiresAt = undefined;
  if (pending.kind === "uncanny_dodge" || pending.kind === "deflect_attacks") {
    const target = combat.tokens.find((token) => token.id === pending.tokenId);
    if (!target) {
      continueAfterReaction(combat);
      return;
    }
    let harm = pending.damage;
    if (accept) {
      target.reactionReady = false;
      if (pending.kind === "uncanny_dodge") harm = Math.floor(harm / 2);
      else {
        const pregen = target.characterId ? getPregen(target.characterId) : undefined;
        const reduce = rollNotation("1d10").total + abilityMod(abilityScore(target, pregen, "dex")) + (target.level ?? pregen?.level ?? 1);
        harm = Math.max(0, harm - reduce);
      }
    }
    applyDamage(combat, target, harm, false, pending.damageType ?? "untyped", true);
    continueAfterReaction(combat);
    return;
  }
  if (pending.kind === "shield") {
    const target = combat.tokens.find((token) => token.id === pending.tokenId);
    let damage = pending.damage;
    if (accept && target) {
      spendSlot(target, 1);
      target.reactionReady = false;
      target.acBonus = (target.acBonus ?? 0) + 5;
      if (pending.negateAuto || (pending.attackTotal ?? 0) < effectiveAc(target)) damage = 0;
      statusEvent(combat, target, "Shield", `${target.name} snaps a shield of force into place.`);
    }
    deliverBlow(combat, pending, damage);
    continueAfterReaction(combat);
    return;
  }
  if (pending.kind === "retaliation") {
    const reactor = combat.tokens.find((token) => token.id === pending.tokenId);
    const foe = combat.tokens.find((token) => token.id === pending.targetId);
    if (accept && reactor && foe && pending.abilityId && !reactor.dead && !reactor.dying) {
      reactor.reactionReady = false;
      keepRage(reactor, false);
      const ability = getAbility(splitVariant(pending.abilityId).id);
      const effect = ability?.effects[0];
      const pregen = reactor.characterId ? getPregen(reactor.characterId) : undefined;
      if (effect) resolveSpellAttack(combat, reactor, pregen, ability?.name ?? "Retaliation", effect, foe.id, true, true);
    }
    continueAfterReaction(combat);
    return;
  }
  if (pending.kind === "smite") {
    let damage = pending.damage;
    const attacker = combat.tokens.find((token) => token.id === pending.attackerId);
    if (accept && attacker) {
      const slot = spendSlot(attacker, 1);
      const rolled = rollNotation(`${slot + 1}d8`, { crit: pending.crit });
      damage += rolled.total;
      statusEvent(combat, attacker, "Divine Smite", `${attacker.name} smites for ${rolled.total} more radiant.`);
    }
    const target = combat.tokens.find((token) => token.id === pending.targetId);
    if (target && attacker && holdForShield(combat, attacker, target, { ...pending, damage })) return;
    deliverBlow(combat, pending, damage);
    continueAfterReaction(combat);
    return;
  }
  const reactor = combat.tokens.find((token) => token.id === pending.tokenId);
  const mover = combat.tokens.find((token) => token.id === pending.moverId);
  if (accept && reactor && mover && pending.abilityId) {
    reactor.reactionReady = false;
    const ability = getAbility(pending.abilityId);
    const effect = ability?.effects[0];
    const pregen = reactor.characterId ? getPregen(reactor.characterId) : undefined;
    if (effect) resolveSpellAttack(combat, reactor, pregen, ability?.name ?? "Opportunity Attack", effect, mover.id, true, true);
    const follow = pendingAfter(combat);
    if (follow && pending.path) {
      follow.resumePath = pending.path;
      follow.resumeMoverId = mover.id;
    }
  }
  if (!combat.pending && mover && pending.path) continueAfterThreat(combat, mover, pending.path);
  continueAfterReaction(combat);
}

/**
 * A reaction pauses the enemy phase on the creature that provoked it.
 * Answering must walk the rest of that phase, or the next foe's turn is announced and never played.
 */
function continueAfterReaction(combat: CombatState): void {
  if (combat.status !== "active" || combat.pending) {
    refreshReachable(combat);
    return;
  }
  const cur = currentToken(combat);
  if (!cur || cur.dead) {
    checkEnd(combat);
    return;
  }
  if (cur.kind === "pc") {
    refreshReachable(combat);
    return;
  }
  stepIndex(combat);
  beginTurn(combat);
  settleEnemies(combat);
}

export { exportVitals, longRestResources, shortRestResources, type Vitals };
