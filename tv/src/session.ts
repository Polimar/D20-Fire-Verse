/** The seat this television holds, so a reload or Wi-Fi drop walks straight back to the table. */

export type SessionMode = "campaign" | "arena";

export type Session = {
  roomCode: string;
  playerId: string | null;
  hero?: string;
  place?: string;
  autosaveId?: string | null;
  savedAt: number;
  mode?: SessionMode;
};

type Slots = { campaign?: Session; arena?: Session };

const KEY = "fireverse.session.v1";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14;

function stillLive(s: Session | undefined): Session | undefined {
  if (!s?.roomCode || Date.now() - s.savedAt > MAX_AGE_MS) return undefined;
  return s;
}

/** Arena leftovers used campaign scene titles like "ARENA LOBBY". */
export function sessionLooksLikeArena(s: Session): boolean {
  if (s.mode === "arena") return true;
  return /\barena\b/i.test(s.place ?? "");
}

function withMode(s: Session, mode: SessionMode): Session {
  return s.mode === mode ? s : { ...s, mode };
}

function parseRaw(raw: string): Slots {
  const data = JSON.parse(raw) as Session | Slots;
  if (data && typeof data === "object" && "roomCode" in data && (data as Session).roomCode) {
    const one = stillLive(data as Session);
    if (!one) return {};
    return sessionLooksLikeArena(one) ? { arena: withMode(one, "arena") } : { campaign: withMode(one, "campaign") };
  }
  const slots = data as Slots;
  return { campaign: stillLive(slots.campaign), arena: stillLive(slots.arena) };
}

function splitMisfiled(slots: Slots): { slots: Slots; dirty: boolean } {
  let { campaign, arena } = slots;
  let dirty = false;
  if (campaign && sessionLooksLikeArena(campaign)) {
    const moved = withMode(campaign, "arena");
    if (!arena) arena = moved;
    campaign = undefined;
    dirty = true;
  }
  if (arena && arena.mode !== "arena") {
    arena = withMode(arena, "arena");
    dirty = true;
  }
  if (campaign && campaign.mode !== "campaign") {
    campaign = withMode(campaign, "campaign");
    dirty = true;
  }
  return { slots: { campaign, arena }, dirty };
}

function isLegacyFlat(raw: string): boolean {
  const data = JSON.parse(raw) as Session | Slots;
  return Boolean(data && typeof data === "object" && "roomCode" in data && (data as Session).roomCode);
}

function readSlots(): Slots {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const legacy = isLegacyFlat(raw);
    const { slots, dirty } = splitMisfiled(parseRaw(raw));
    if (dirty || legacy) writeSlots(slots);
    return slots;
  } catch {
    return {};
  }
}

function writeSlots(slots: Slots) {
  const next: Slots = {};
  if (slots.campaign) next.campaign = slots.campaign;
  if (slots.arena) next.arena = slots.arena;
  try {
    if (!next.campaign && !next.arena) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}

export function loadSession(mode: SessionMode): Session | null {
  return readSlots()[mode] ?? null;
}

export function saveSession(mode: SessionMode, patch: Partial<Session> & { roomCode: string }) {
  const slots = readSlots();
  const prev = slots[mode];
  slots[mode] = {
    ...(prev?.roomCode === patch.roomCode ? prev : { playerId: null }),
    ...patch,
    mode,
    savedAt: Date.now(),
  } as Session;
  writeSlots(slots);
}

export function clearSession(mode: SessionMode) {
  const slots = readSlots();
  delete slots[mode];
  writeSlots(slots);
}
