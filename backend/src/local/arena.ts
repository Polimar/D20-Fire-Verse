import { assertCanPlayCharacter, getPregen, portraitForCharacter } from "./campaign.js";
import type { Player } from "./types.js";
import {
  ARENA_THEMES,
  arenaMapId,
  getArenaMap,
  scalePregenToLevel,
  type ArenaSize,
  type ArenaThemeId,
} from "./arena-maps.js";
import { startArenaCombat, type CombatState } from "./combat.js";
import { heroPending } from "./hero.js";
import { settleHero } from "./rewards.js";
import type { Room } from "./room.js";
import { listArenaMonsters, srdMonsterId } from "./srd-monsters.js";
import { getMonster } from "./campaign.js";
import { enabledMonsters } from "./content-catalog.js";

export type ArenaFoe = ReturnType<typeof listArenaMonsters>[number];

/** PvE foes: compiled SRD stat blocks whose catalog entry an admin enabled and the review cleared. */
export function arenaRoster(): ArenaFoe[] {
  const inPlay = new Set(enabledMonsters().map((m) => srdMonsterId(m.name)));
  return listArenaMonsters().filter((m) => inPlay.has(m.id));
}

function defaultFoe(roster: ArenaFoe[], level: number): string | undefined {
  const cap = level <= 1 ? 0.25 : level === 2 ? 1 : 2;
  const fitting = roster.filter((m) => m.crValue <= cap).sort((a, b) => b.crValue - a.crValue || a.name.localeCompare(b.name));
  return (fitting[0] ?? [...roster].sort((a, b) => a.crValue - b.crValue)[0])?.id;
}

export const ARENA_FORMATS = {
  ffa_1v1: { seats: 2, teams: 0, label: "Duel 1v1" },
  ffa_3: { seats: 3, teams: 0, label: "Free-for-all 3" },
  ffa_4: { seats: 4, teams: 0, label: "Free-for-all 4" },
  ffa_5: { seats: 5, teams: 0, label: "Free-for-all 5" },
  ffa_6: { seats: 6, teams: 0, label: "Free-for-all 6" },
  teams_2v2: { seats: 4, teams: 2, label: "Teams 2v2" },
  teams_3v3: { seats: 6, teams: 2, label: "Teams 3v3" },
  pve_1v1: { seats: 1, teams: 0, label: "PvE Duel 1v1" },
} as const;

export type ArenaFormatId = keyof typeof ARENA_FORMATS;

export type ArenaPlayer = Player & {
  teamId?: "a" | "b";
  ready?: boolean;
};

export type ArenaConfig = {
  format: ArenaFormatId;
  theme: ArenaThemeId;
  size: ArenaSize;
  mapId?: string;
  level: 1 | 2 | 3;
  privacy: "public" | "private";
  name: string;
  phase: "lobby" | "active" | "ended" | "hero_swap";
  heroSwapEndsAt?: number;
  lastResult?: string;
  monsterId?: string;
  /** Ranked counts a 45s absence as a loss. Arcade and test keep Dodge. */
  mode?: "ranked" | "arcade" | "test";
  queueType?: "solo" | "duo" | "full_team";
};

const HERO_SWAP_MS = 30_000;

export function isArenaFormat(id: string): id is ArenaFormatId {
  return id in ARENA_FORMATS;
}

export function isArenaTheme(id: string): id is ArenaThemeId {
  return ARENA_THEMES.some((t) => t.id === id);
}

export function isArenaSize(id: string): id is ArenaSize {
  return id === "small" || id === "medium" || id === "large";
}

export function arenaSeatCap(room: { arena?: ArenaConfig }): number {
  if (!room.arena) return 3;
  return ARENA_FORMATS[room.arena.format].seats;
}

export function parseCreateArena(body: {
  format?: string;
  theme?: string;
  mapSize?: string;
  mapId?: string;
  level?: number;
  privacy?: string;
  name?: string;
  monsterId?: string;
}): Omit<ArenaConfig, "phase"> {
  const format = body.format ?? "ffa_1v1";
  if (!isArenaFormat(format)) throw new Error("ARENA_BAD_FORMAT");
  let theme = (body.theme ?? "brewery") as string;
  let size = (body.mapSize ?? suggestedSize(format)) as string;
  let mapId: string | undefined;
  const requested = String(body.mapId ?? "").trim();
  if (requested) {
    const map = getArenaMap(requested);
    if (!map) throw new Error("BAD_MAP");
    if (body.mapSize && body.mapSize !== map.size) throw new Error("ARENA_BAD_SIZE");
    theme = map.theme;
    size = map.size;
    mapId = map.id;
  }
  if (!isArenaTheme(theme)) throw new Error("ARENA_BAD_THEME");
  if (!isArenaSize(size)) throw new Error("ARENA_BAD_SIZE");
  const level = Number(body.level ?? 1);
  if (level !== 1 && level !== 2 && level !== 3) throw new Error("BAD_LEVEL");
  const privacy = body.privacy === "private" ? "private" : "public";
  const name = String(body.name ?? "").trim().slice(0, 24);
  let monsterId: string | undefined;
  if (format === "pve_1v1") {
    const roster = arenaRoster();
    if (!roster.length) throw new Error("ARENA_NO_MONSTERS");
    monsterId = body.monsterId ? String(body.monsterId) : defaultFoe(roster, level);
    if (!monsterId || !roster.some((m) => m.id === monsterId) || !getMonster(monsterId)) throw new Error("ARENA_BAD_MONSTER");
  }
  return { format, theme, size, mapId, level, privacy, name, monsterId };
}

export function suggestedSize(format: ArenaFormatId): ArenaSize {
  const n = ARENA_FORMATS[format].seats;
  if (n <= 2) return "small";
  if (n <= 4) return "medium";
  return "large";
}

export function listOpenArenas(rooms: Iterable<Room>): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const room of rooms) {
    const a = room.arena;
    if (!a || a.privacy !== "public" || a.phase !== "lobby") continue;
    const cap = ARENA_FORMATS[a.format].seats;
    if (room.players.length >= cap) continue;
    out.push({
      roomCode: room.roomCode,
      name: a.name || room.roomCode,
      format: a.format,
      formatLabel: ARENA_FORMATS[a.format].label,
      theme: a.theme,
      size: a.size,
      level: a.level,
      seats: room.players.length,
      cap,
      pve: a.format === "pve_1v1",
      monsterName: a.monsterId ? getMonster(a.monsterId)?.name ?? a.monsterId : undefined,
    });
  }
  return out.sort((x, y) => String(x.roomCode).localeCompare(String(y.roomCode)));
}

export function publicArena(room: Room) {
  const a = room.arena;
  if (!a) return null;
  const cap = ARENA_FORMATS[a.format].seats;
  const teams = ARENA_FORMATS[a.format].teams;
  return {
    format: a.format,
    formatLabel: ARENA_FORMATS[a.format].label,
    theme: a.theme,
    size: a.size,
    level: a.level,
    privacy: a.privacy,
    name: a.name,
    phase: a.phase,
    heroSwapEndsAt: a.heroSwapEndsAt ?? null,
    lastResult: a.lastResult ?? null,
    cap,
    teams,
    pve: a.format === "pve_1v1",
    monsterId: a.monsterId ?? null,
    monsterName: a.monsterId ? getMonster(a.monsterId)?.name ?? a.monsterId : null,
    mapId: a.mapId ?? arenaMapId(a.theme, a.size),
    art: (() => {
      const id = a.mapId ?? arenaMapId(a.theme, a.size);
      const art = getArenaMap(id)?.art;
      return art && art.startsWith("/") ? art : `/art/arena/${a.theme}-${a.size}.png`;
    })(),
    catalog: {
      formats: Object.entries(ARENA_FORMATS).map(([id, v]) => ({ id, ...v })),
      themes: ARENA_THEMES,
      sizes: ["small", "medium", "large"],
      monsters: arenaRoster(),
    },
    seats: room.players.map((p) => {
      const ap = p as ArenaPlayer;
      return {
        playerId: ap.playerId,
        displayName: ap.displayName,
        characterId: ap.characterId,
        characterName: ap.characterName,
        portrait: portraitForCharacter(ap.characterId),
        teamId: ap.teamId ?? null,
        ready: ap.ready === true,
      };
    }),
  };
}

export function joinArenaSeat(
  room: Room,
  displayName: string,
  characterId: string,
  userId?: string,
): string {
  if (!room.arena) throw new Error("NOT_ARENA");
  if (room.arena.phase === "active") throw new Error("ARENA_IN_FIGHT");
  const cap = arenaSeatCap(room);
  if (room.players.length >= cap) throw new Error("ARENA_FULL");
  const raw = getPregen(characterId);
  if (!raw) throw new Error("BAD_CHARACTER");
  assertCanPlayCharacter(raw, userId);
  const pregen = scalePregenToLevel(raw, room.arena.level);
  if (userId && room.players.some((p) => p.userId === userId)) throw new Error("ALREADY_SEATED");
  let n = 1;
  while (room.players.some((p) => p.playerId === `P${n}`)) n += 1;
  const playerId = `P${n}`;
  const seat: ArenaPlayer = {
    playerId,
    displayName: displayName || pregen.name,
    characterId: raw.id,
    characterName: pregen.name,
    userId,
    ready: true,
  };
  room.players.push(seat);
  return playerId;
}

export function setArenaTeam(room: Room, playerId: string, teamId: string): void {
  if (!room.arena) throw new Error("NOT_ARENA");
  if (ARENA_FORMATS[room.arena.format].teams < 2) throw new Error("ARENA_TEAMS");
  if (teamId !== "a" && teamId !== "b") throw new Error("ARENA_TEAMS");
  const p = room.players.find((x) => x.playerId === playerId) as ArenaPlayer | undefined;
  if (!p) throw new Error("NO_PLAYER");
  p.teamId = teamId;
  p.ready = false;
}

export function setArenaReady(room: Room, playerId: string, ready: boolean): void {
  if (!room.arena) throw new Error("NOT_ARENA");
  const p = room.players.find((x) => x.playerId === playerId) as ArenaPlayer | undefined;
  if (!p) throw new Error("NO_PLAYER");
  if (!p.characterId) throw new Error("BAD_CHARACTER");
  p.ready = ready;
}

export function pickArenaHero(room: Room, playerId: string, characterId: string, userId?: string): void {
  if (!room.arena) throw new Error("NOT_ARENA");
  if (room.arena.phase !== "hero_swap" && room.arena.phase !== "lobby") throw new Error("ARENA_NO_SWAP");
  const raw = getPregen(characterId);
  if (!raw) throw new Error("BAD_CHARACTER");
  assertCanPlayCharacter(raw, userId);
  const p = room.players.find((x) => x.playerId === playerId) as ArenaPlayer | undefined;
  if (!p) throw new Error("NO_PLAYER");
  const scaled = scalePregenToLevel(raw, room.arena.level);
  p.characterId = raw.id;
  p.characterName = scaled.name;
}

export function assertCanStart(room: Room, actorId?: string): void {
  if (!room.arena) throw new Error("NOT_ARENA");
  if (actorId && room.ownerUserId && actorId !== room.ownerUserId) throw new Error("ARENA_NOT_OWNER");
  const spec = ARENA_FORMATS[room.arena.format];
  if (room.players.length !== spec.seats) throw new Error("ARENA_NOT_READY");
  if (!(room.players as ArenaPlayer[]).every((p) => p.ready && p.characterId)) throw new Error("ARENA_NOT_READY");
  if (spec.teams === 2) {
    const a = (room.players as ArenaPlayer[]).filter((p) => p.teamId === "a").length;
    const b = (room.players as ArenaPlayer[]).filter((p) => p.teamId === "b").length;
    if (a !== spec.seats / 2 || b !== spec.seats / 2) throw new Error("ARENA_TEAMS");
  }
}

export function beginArenaFight(room: Room, holdPcIds: string[] = []): CombatState {
  if (!room.arena) throw new Error("NOT_ARENA");
  const map = getArenaMap(room.arena.mapId ?? arenaMapId(room.arena.theme, room.arena.size));
  if (!map) throw new Error("BAD_MAP");
  const teams = ARENA_FORMATS[room.arena.format].teams === 2;
  const pve = room.arena.format === "pve_1v1";
  const combat = startArenaCombat({
    map,
    players: room.players as ArenaPlayer[],
    level: room.arena.level,
    teams,
    pve,
    monsterId: room.arena.monsterId,
    holdPcIds,
  });
  room.arena.phase = "active";
  room.arena.heroSwapEndsAt = undefined;
  room.combat = combat;
  return combat;
}

export function finishArena(room: Room, combat: CombatState): void {
  if (!room.arena) return;
  if (room.arena.mode === "ranked" || room.arena.mode === "arcade" || room.arena.mode === "test" || !room.arena.mode) {
    for (const player of room.players) {
      if (!player.characterId?.startsWith("hero_")) continue;
      const won = combat.pvpWinner === player.characterName;
      settleHero({ heroId: player.characterId, mode: room.arena.mode === "test" ? "test" : room.arena.mode === "ranked" ? "ranked" : "arcade", won });
      if (heroPending(player.characterId)) room.levelUpPending = { heroId: player.characterId, playerId: player.playerId };
    }
  }
  const line =
    combat.status === "draw"
      ? "The last blow drops every remaining fighter. Draw."
      : combat.pvpWinner
        ? `${combat.pvpWinner} stands. The arena is still.`
        : "The arena falls quiet.";
  room.arena.phase = "hero_swap";
  room.arena.heroSwapEndsAt = Date.now() + HERO_SWAP_MS;
  room.arena.lastResult = line;
  room.combat = undefined;
  room.outro = { combat, text: line };
  for (const p of room.players as ArenaPlayer[]) p.ready = false;
}

export function closeHeroSwap(room: Room): void {
  if (!room.arena || room.arena.phase !== "hero_swap") return;
  room.arena.phase = "lobby";
  room.arena.heroSwapEndsAt = undefined;
}

export const HERO_SWAP_MS_EXPORT = HERO_SWAP_MS;
