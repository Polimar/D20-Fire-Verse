/** Combat auras: follow a token or sit on a planted cell. AC/saves are two of several modifiers. */

export type AuraFilter = "ally" | "enemy" | "all";
export type AuraSaveAdv = "all" | "vs_magic";

export type AuraTick = {
  dice?: string;
  damageType?: string;
  heal?: number;
  saveAbility?: string;
  saveDc?: number;
  halfOnSuccess?: boolean;
};

export type AuraMods = {
  radiusCells: number;
  filter: AuraFilter;
  excludeSource?: boolean;
  creatureTypes?: string[];
  ac?: number;
  saves?: number;
  stealth?: number;
  saveAdv?: AuraSaveAdv;
  attackDisadvAgainst?: boolean;
  resistances?: string[];
  speedMult?: number;
  strip?: Array<"frightened" | "charmed">;
  heavilyObscured?: boolean;
  difficultTerrainFor?: "enemy";
  onStartTurn?: AuraTick;
  onEnterOrEndTurn?: AuraTick;
  blocksMovement?: boolean;
  blocksSpellsFromOutside?: boolean;
  blocksVerbal?: boolean;
  deafenedInside?: boolean;
  thunderImmuneInside?: boolean;
  /** Antimagic Field: leveled spells and magic-item actions fail inside. */
  antimagicInside?: boolean;
  /** Globe of Invulnerability: allies ignore spell effects of this level or lower. */
  spellImmunityMaxLevel?: number;
  /** Daylight: cancels heavilyObscured from overlapping darkness/fog auras. */
  dispelsObscured?: boolean;
  /** Creature types that ignore blocksMovement (antilife shell). */
  passCreatureTypes?: string[];
  /** Ties aura to a concentrating spell for cleanup. */
  spellAuraId?: string;
};

export type CombatAura = AuraMods & {
  id: string;
  ownerId: string;
  origin: { kind: "token"; tokenId: string } | { kind: "cell"; x: number; y: number };
};

export type AuraToken = {
  id: string;
  kind: "pc" | "enemy";
  x: number;
  y: number;
  dead: boolean;
  teamId?: string;
  monsterId?: string;
  creatureType?: string;
  features?: string[];
  kit?: { flags: string[] };
  followAuras?: AuraMods[];
  spellAuras?: AuraMods[];
  auraBonus?: number;
  auraAc?: number;
  auraSaveAdv?: AuraSaveAdv;
  auraStealth?: number;
  auraAttackDisadvAgainst?: boolean;
  auraResistances?: string[];
  auraSpeedMult?: number;
  auraObscured?: boolean;
  auraThunderImmune?: boolean;
  auraSpellImmunityMaxLevel?: number;
  auraDifficultTerrain?: boolean;
  conditions?: string[];
};

export type AuraCombat = {
  pvp?: "ffa" | "teams";
  auras?: CombatAura[];
  tokens: AuraToken[];
};

function hasFlag(token: AuraToken, flag: string): boolean {
  return Boolean(token.features?.includes(flag) || token.kit?.flags.includes(flag));
}

export function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function isAlly(combat: AuraCombat, owner: AuraToken, other: AuraToken): boolean {
  if (other.dead) return false;
  if (!combat.pvp) return other.kind === owner.kind;
  if (other.kind !== "pc" || owner.kind !== "pc") return other.id === owner.id;
  if (combat.pvp === "ffa") return other.id === owner.id;
  return owner.teamId === other.teamId;
}

function originCell(combat: AuraCombat, aura: CombatAura): { x: number; y: number } | undefined {
  if (aura.origin.kind === "cell") return { x: aura.origin.x, y: aura.origin.y };
  const tokenId = aura.origin.tokenId;
  const token = combat.tokens.find((t) => t.id === tokenId);
  if (!token || token.dead) return undefined;
  return { x: token.x, y: token.y };
}

export function inAuraRadius(combat: AuraCombat, aura: CombatAura, x: number, y: number): boolean {
  const origin = originCell(combat, aura);
  if (!origin) return false;
  return chebyshev(origin.x, origin.y, x, y) <= aura.radiusCells;
}

function typeOk(aura: CombatAura, token: AuraToken): boolean {
  if (!aura.creatureTypes?.length) return true;
  const blob = `${token.monsterId ?? ""} ${(token.features ?? []).join(" ")}`.toLowerCase();
  return aura.creatureTypes.some((t) => blob.includes(t.toLowerCase()));
}

export function auraAppliesTo(combat: AuraCombat, aura: CombatAura, token: AuraToken): boolean {
  if (token.dead) return false;
  if (aura.excludeSource && token.id === aura.ownerId) return false;
  if (!inAuraRadius(combat, aura, token.x, token.y)) return false;
  if (!typeOk(aura, token)) return false;
  const owner = combat.tokens.find((t) => t.id === aura.ownerId);
  if (!owner) return false;
  if (aura.filter === "all") return true;
  const ally = isAlly(combat, owner, token) || token.id === owner.id;
  if (aura.filter === "ally") return ally;
  return !ally;
}

function paladinAura(source: AuraToken): CombatAura | undefined {
  if (source.dead) return undefined;
  if (!hasFlag(source, "aura_of_protection") && !hasFlag(source, "aura_of_courage") && !hasFlag(source, "aura_of_devotion")) {
    return undefined;
  }
  const radiusCells = hasFlag(source, "aura_expansion") ? 6 : 2;
  const strip: Array<"frightened" | "charmed"> = [];
  if (hasFlag(source, "aura_of_courage")) strip.push("frightened");
  if (hasFlag(source, "aura_of_devotion")) strip.push("charmed");
  return {
    id: `paladin:${source.id}`,
    ownerId: source.id,
    origin: { kind: "token", tokenId: source.id },
    radiusCells,
    filter: "ally",
    strip: strip.length ? strip : undefined,
  };
}

function followFromToken(source: AuraToken): CombatAura[] {
  const out: CombatAura[] = [];
  const paladin = paladinAura(source);
  if (paladin) out.push(paladin);
  for (const [i, spec] of (source.followAuras ?? []).entries()) {
    out.push({
      ...spec,
      id: `follow:${source.id}:${i}`,
      ownerId: source.id,
      origin: { kind: "token", tokenId: source.id },
    });
  }
  for (const [i, spec] of (source.spellAuras ?? []).entries()) {
    out.push({
      ...spec,
      id: `spell:${source.id}:${spec.spellAuraId ?? i}`,
      ownerId: source.id,
      origin: { kind: "token", tokenId: source.id },
    });
  }
  return out;
}

export function refreshAuras(combat: AuraCombat, paladinSaveBonus: (source: AuraToken) => number): void {
  const planted = (combat.auras ?? []).filter((a) => a.origin.kind === "cell");
  const follow = combat.tokens.flatMap(followFromToken);
  combat.auras = [...planted, ...follow];
  for (const token of combat.tokens) {
    token.auraBonus = 0;
    token.auraAc = 0;
    token.auraSaveAdv = undefined;
    token.auraStealth = 0;
    token.auraAttackDisadvAgainst = false;
    token.auraResistances = [];
    token.auraSpeedMult = 1;
    token.auraObscured = false;
    token.auraThunderImmune = false;
    token.auraSpellImmunityMaxLevel = 0;
    token.auraDifficultTerrain = false;
    token.conditions = (token.conditions ?? []).filter((c) => c !== "deafened");
  }
  const daylightCells = new Set<string>();
  for (const aura of combat.auras) {
    if (!aura.dispelsObscured) continue;
    const origin = originCell(combat, aura);
    if (!origin) continue;
    for (let y = origin.y - aura.radiusCells; y <= origin.y + aura.radiusCells; y += 1) {
      for (let x = origin.x - aura.radiusCells; x <= origin.x + aura.radiusCells; x += 1) {
        if (chebyshev(origin.x, origin.y, x, y) <= aura.radiusCells) daylightCells.add(`${x},${y}`);
      }
    }
  }
  for (const aura of combat.auras) {
    const owner = combat.tokens.find((t) => t.id === aura.ownerId);
    const paladinSaves = aura.id.startsWith("paladin:") && owner ? paladinSaveBonus(owner) : 0;
    for (const token of combat.tokens) {
      if (!auraAppliesTo(combat, aura, token)) continue;
      const saves = (aura.saves ?? 0) + paladinSaves;
      token.auraBonus = (token.auraBonus ?? 0) + saves;
      token.auraAc = (token.auraAc ?? 0) + (aura.ac ?? 0);
      if (aura.stealth) token.auraStealth = (token.auraStealth ?? 0) + aura.stealth;
      if (aura.saveAdv === "all" || (aura.saveAdv === "vs_magic" && token.auraSaveAdv !== "all")) {
        token.auraSaveAdv = aura.saveAdv;
      }
      if (aura.attackDisadvAgainst) token.auraAttackDisadvAgainst = true;
      if (aura.resistances?.length) {
        token.auraResistances = [...new Set([...(token.auraResistances ?? []), ...aura.resistances])];
      }
      if (aura.speedMult != null) token.auraSpeedMult = Math.min(token.auraSpeedMult ?? 1, aura.speedMult);
      if (aura.heavilyObscured && !daylightCells.has(`${token.x},${token.y}`)) token.auraObscured = true;
      if (aura.thunderImmuneInside) token.auraThunderImmune = true;
      if (aura.spellImmunityMaxLevel != null) {
        token.auraSpellImmunityMaxLevel = Math.max(token.auraSpellImmunityMaxLevel ?? 0, aura.spellImmunityMaxLevel);
      }
      if (aura.difficultTerrainFor === "enemy" && !isAlly(combat, owner ?? token, token)) {
        token.auraDifficultTerrain = true;
      }
      if (aura.deafenedInside) {
        if (!token.conditions) token.conditions = [];
        if (!token.conditions.includes("deafened")) token.conditions.push("deafened");
      }
      if (aura.strip?.length) {
        token.conditions = (token.conditions ?? []).filter((c) => !aura.strip!.includes(c as "frightened" | "charmed"));
      }
    }
  }
}

export function antimagicAt(combat: AuraCombat, x: number, y: number): boolean {
  return aurasCovering(combat, x, y).some((a) => a.antimagicInside);
}

export function spellImmunityLevelAt(combat: AuraCombat, token: AuraToken): number {
  return token.auraSpellImmunityMaxLevel ?? 0;
}

export function movementBlockedByAura(combat: AuraCombat, mover: AuraToken, destX: number, destY: number): boolean {
  for (const aura of aurasCovering(combat, destX, destY)) {
    if (!aura.blocksMovement) continue;
    const owner = combat.tokens.find((t) => t.id === aura.ownerId);
    if (!owner) continue;
    if (aura.filter === "enemy" && isAlly(combat, owner, mover)) continue;
    if (aura.filter === "ally" && !isAlly(combat, owner, mover)) continue;
    const pass = aura.passCreatureTypes ?? [];
    const ctype = (mover.creatureType ?? "").toLowerCase();
    if (pass.some((p) => ctype.includes(p.toLowerCase()))) continue;
    return true;
  }
  return false;
}

export function difficultTerrainMult(combat: AuraCombat, mover: AuraToken, x: number, y: number): number {
  for (const aura of aurasCovering(combat, x, y)) {
    if (aura.difficultTerrainFor !== "enemy") continue;
    const owner = combat.tokens.find((t) => t.id === aura.ownerId);
    if (!owner) continue;
    if (isAlly(combat, owner, mover)) continue;
    return 2;
  }
  return 1;
}

export function plantAura(combat: AuraCombat, owner: AuraToken, spec: AuraMods): CombatAura | undefined {
  combat.auras ??= [];
  if (combat.auras.some((a) => a.origin.kind === "cell" && a.ownerId === owner.id)) return undefined;
  const aura: CombatAura = {
    ...spec,
    id: `plant:${owner.id}`,
    ownerId: owner.id,
    origin: { kind: "cell", x: owner.x, y: owner.y },
  };
  combat.auras.push(aura);
  return aura;
}

export function pullAura(combat: AuraCombat, actor: AuraToken): boolean {
  const list = combat.auras ?? [];
  const idx = list.findIndex((a) => {
    if (a.origin.kind !== "cell") return false;
    if (chebyshev(actor.x, actor.y, a.origin.x, a.origin.y) > 1) return false;
    return true;
  });
  if (idx < 0) return false;
  list.splice(idx, 1);
  combat.auras = list;
  return true;
}

export function aurasCovering(combat: AuraCombat, x: number, y: number): CombatAura[] {
  return (combat.auras ?? []).filter((a) => inAuraRadius(combat, a, x, y));
}

export function verbalCastBlocked(combat: AuraCombat, x: number, y: number): boolean {
  return aurasCovering(combat, x, y).some((a) => a.blocksVerbal);
}

export function plantSpellAuraAt(
  combat: AuraCombat,
  owner: AuraToken,
  x: number,
  y: number,
  spec: AuraMods,
): void {
  const spellAuraId = spec.spellAuraId ?? "aura";
  combat.auras ??= [];
  combat.auras = combat.auras.filter((a) => !(a.ownerId === owner.id && a.spellAuraId === spellAuraId));
  combat.auras.push({
    ...spec,
    spellAuraId,
    id: `spellcell:${owner.id}:${spellAuraId}`,
    ownerId: owner.id,
    origin: { kind: "cell", x, y },
  });
}

export function clearSpellAurasForOwner(combat: AuraCombat, ownerId: string, spellId?: string): void {
  const owner = combat.tokens.find((t) => t.id === ownerId);
  if (owner?.spellAuras) {
    owner.spellAuras = spellId
      ? owner.spellAuras.filter((a) => a.spellAuraId !== spellId)
      : undefined;
    if (owner.spellAuras?.length === 0) owner.spellAuras = undefined;
  }
  combat.auras = (combat.auras ?? []).filter((a) => {
    if (a.ownerId !== ownerId) return true;
    if (!spellId) return !a.spellAuraId;
    return a.spellAuraId !== spellId;
  });
}
