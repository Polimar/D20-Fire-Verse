/** Arena home/lobby helpers shared by the television UI. */

export const ARENA_FORMATS = [
  { id: "ffa_1v1", label: "Duel 1v1", seats: 2, teams: 0 },
  { id: "ffa_3", label: "Free-for-all 3", seats: 3, teams: 0 },
  { id: "ffa_4", label: "Free-for-all 4", seats: 4, teams: 0 },
  { id: "ffa_5", label: "Free-for-all 5", seats: 5, teams: 0 },
  { id: "ffa_6", label: "Free-for-all 6", seats: 6, teams: 0 },
  { id: "teams_2v2", label: "Teams 2v2", seats: 4, teams: 2 },
  { id: "teams_3v3", label: "Teams 3v3", seats: 6, teams: 2 },
] as const;

export const ARENA_THEMES = [
  { id: "brewery", label: "Wizard's brewery" },
  { id: "crypt", label: "Gothic crypt" },
  { id: "ship", label: "Ship deck" },
  { id: "inn_yard", label: "Inn yard at night" },
  { id: "elf_ruin", label: "Autumn elf ruin" },
  { id: "lava_hall", label: "Magma hall" },
  { id: "ice_court", label: "Icy courtyard" },
  { id: "sand_ruin", label: "Desert ruin" },
  { id: "sewer", label: "Stone sewers" },
  { id: "coliseum", label: "Coliseum sand" },
  { id: "swamp", label: "Boardwalk swamp" },
  { id: "tower_roof", label: "Wizard tower roof" },
] as const;

export type ArenaFormatId = (typeof ARENA_FORMATS)[number]["id"];

export function suggestedSize(format: string): "small" | "medium" | "large" {
  const spec = ARENA_FORMATS.find((f) => f.id === format);
  const n = spec?.seats ?? 2;
  if (n <= 2) return "small";
  if (n <= 4) return "medium";
  return "large";
}

export type ArenaSeat = {
  playerId: string;
  displayName: string;
  characterId: string;
  characterName: string;
  portrait?: string;
  teamId?: string | null;
  ready?: boolean;
};

export type ArenaPublic = {
  format: string;
  formatLabel: string;
  theme: string;
  size: string;
  level: number;
  privacy: string;
  name: string;
  phase: string;
  heroSwapEndsAt?: number | null;
  lastResult?: string | null;
  cap: number;
  teams: number;
  mapId: string;
  art: string;
  seats: ArenaSeat[];
};

export type OpenArena = {
  roomCode: string;
  name: string;
  format: string;
  formatLabel: string;
  theme: string;
  size: string;
  level: number;
  seats: number;
  cap: number;
};
