/** Ranked queue, matcher, and in-memory parties for 2v2 duos. */

import { randomBytes } from "node:crypto";
import {
  assembleMatch,
  RANKED_FORMAT_SEATS,
  type RankedFormat,
} from "@d20-fireverse/rules";
import {
  dropTickets,
  dropUserTickets,
  enqueue,
  queuedTickets,
  ticketForUser,
} from "./arena-queue.js";
import { findUserByUsername, listFriends } from "./auth.js";
import { getEconomyConfig } from "./economy-config.js";
import { getHero, heroPending } from "./hero.js";
import { arenaStart, createArena, getRoom, joinRoom, roomSeatingUser, type Room } from "./room.js";

const FORMATS: RankedFormat[] = ["ffa_1v1", "teams_2v2", "ffa_3", "ffa_4"];
const COUNTDOWN_MS = 10_000;

export type RankedClient = {
  userId: string;
  username: string;
  send: (event: { eventType: string; payload: unknown }) => void;
  /** TV sockets win over a paired companion on the same account. */
  surface?: "tv" | "other";
  id?: string;
};

export type RankedMatchMade = {
  room: Room;
  binds: Array<{ userId: string; playerId: string }>;
  format: RankedFormat;
};

type PartyMember = { userId: string; username: string; characterId?: string; accepted: boolean };
type Party = { id: string; leaderId: string; members: PartyMember[] };

const clients = new Map<string, RankedClient[]>();
const parties = new Map<string, Party>();
const partyByUser = new Map<string, string>();
const startTimers = new Map<string, ReturnType<typeof setTimeout>>();
let clientSeq = 0;

function clientKey(client: RankedClient): string {
  return client.id ?? `${client.surface ?? "other"}:${client.userId}:${++clientSeq}`;
}

function socketsOf(userId: string): RankedClient[] {
  return clients.get(userId) ?? [];
}

function fanout(userId: string, event: { eventType: string; payload: unknown }): void {
  for (const client of socketsOf(userId)) client.send(event);
}

export function rankedAttach(client: RankedClient): void {
  const id = client.id ?? clientKey(client);
  const row = { ...client, id };
  const list = socketsOf(client.userId).filter((c) => c.id !== id);
  if (row.surface === "tv") list.unshift(row);
  else list.push(row);
  clients.set(client.userId, list);
}

export function rankedDetach(userId: string, opts?: { id?: string; dropQueue?: boolean }): void {
  if (opts?.id) {
    const list = socketsOf(userId).filter((c) => c.id !== opts.id);
    if (list.length) clients.set(userId, list);
    else clients.delete(userId);
  } else {
    clients.delete(userId);
  }
  const tvLeft = socketsOf(userId).some((c) => c.surface === "tv");
  if (opts?.dropQueue !== false && !tvLeft) cancelRanked(userId, "drop");
}

function isFormat(id: string): id is RankedFormat {
  return FORMATS.includes(id as RankedFormat);
}

function partyOf(userId: string): Party | undefined {
  const id = partyByUser.get(userId);
  return id ? parties.get(id) : undefined;
}

function emitParty(party: Party): void {
  const payload = {
    partyId: party.id,
    leaderId: party.leaderId,
    members: party.members.map((m) => ({
      userId: m.userId,
      username: m.username,
      characterId: m.characterId ?? null,
      accepted: m.accepted,
      ready: Boolean(m.characterId) && m.accepted,
    })),
  };
  for (const m of party.members) fanout(m.userId, { eventType: "PARTY_STATE", payload });
}

function dissolveParty(party: Party): void {
  for (const m of party.members) {
    dropUserTickets(m.userId);
    partyByUser.delete(m.userId);
  }
  parties.delete(party.id);
  emitParty({ ...party, members: [] });
}

function assertRankedHero(userId: string, characterId: string): { id: string; name: string; level: number } {
  if (!characterId.startsWith("hero_")) throw new Error("BAD_CHARACTER");
  const hero = getHero(characterId);
  if (!hero || hero.userId !== userId) throw new Error("BAD_CHARACTER");
  if (heroPending(characterId)) throw new Error("LEVEL_UP_PENDING");
  return hero;
}

function statusFor(ticketUserId: string, now: number): Record<string, unknown> {
  const ticket = ticketForUser(ticketUserId);
  if (!ticket) return { state: "idle" };
  const spec = RANKED_FORMAT_SEATS[ticket.format];
  const found = queuedTickets()
    .filter((t) => t.format === ticket.format)
    .reduce((n, t) => n + t.partyUserIds.length, 0);
  return {
    state: "searching",
    format: ticket.format,
    waitMs: Math.max(0, now - ticket.queuedAt),
    elo: ticket.elo,
    found,
    needed: spec.seats,
  };
}

function pushStatus(userId: string, now = Date.now()): void {
  fanout(userId, { eventType: "RANKED_STATUS", payload: statusFor(userId, now) });
}

function stampPartyHero(userId: string, characterId: string): void {
  const party = partyOf(userId);
  const member = party?.members.find((m) => m.userId === userId);
  if (!member) return;
  assertRankedHero(userId, characterId);
  member.characterId = characterId;
}

export function rankedQueue(userId: string, username: string, format: string, characterId: string): void {
  if (!isFormat(format)) throw new Error("BAD_FORMAT");
  if (ticketForUser(userId)) throw new Error("ALREADY_QUEUED");
  const seated = roomSeatingUser(userId);
  if (seated?.arena?.mode === "ranked" && seated.arena.phase !== "ended") throw new Error("RANKED_BUSY");
  if (characterId) stampPartyHero(userId, characterId);
  const party = partyOf(userId);
  if (format === "teams_2v2" && party && party.members.filter((m) => m.accepted).length === 2) {
    if (party.leaderId !== userId) throw new Error("NOT_PARTY_LEADER");
    const accepted = party.members.filter((m) => m.accepted);
    if (accepted.some((m) => !m.characterId)) throw new Error("BAD_CHARACTER");
    const heroes = accepted.map((m) => assertRankedHero(m.userId, m.characterId!));
    enqueue({
      userIds: accepted.map((m) => m.userId),
      heroLevels: heroes.map((h) => h.level),
      heroIds: heroes.map((h) => h.id),
      queue: "duo",
      format,
    });
    for (const m of accepted) pushStatus(m.userId);
    return;
  }
  const hero = assertRankedHero(userId, characterId);
  enqueue({
    userIds: [userId],
    heroLevels: [hero.level],
    heroIds: [hero.id],
    queue: "solo",
    format,
  });
  void username;
  pushStatus(userId);
}

export function cancelRanked(userId: string, reason: "cancel" | "drop" = "cancel"): void {
  const gone = dropUserTickets(userId);
  if (gone.length && reason === "cancel") {
    fanout(userId, { eventType: "RANKED_STATUS", payload: { state: "idle" } });
  }
  const party = partyOf(userId);
  if (party && reason === "drop") dissolveParty(party);
  else if (gone.length) {
    for (const ticket of gone) {
      for (const uid of ticket.partyUserIds) {
        if (uid !== userId) fanout(uid, { eventType: "RANKED_STATUS", payload: { state: "idle" } });
      }
    }
  }
}

export function partyInvite(fromUserId: string, fromUsername: string, username: string): void {
  const target = findUserByUsername(username);
  if (!target) throw new Error("USER_NOT_FOUND");
  if (target.id === fromUserId) throw new Error("FRIEND_SELF");
  const friends = listFriends(fromUserId);
  if (!friends.some((f) => f.id === target.id && f.status === "accepted")) throw new Error("PARTY_NOT_FRIEND");
  let party = partyOf(fromUserId);
  if (!party) {
    party = {
      id: `pty_${randomBytes(4).toString("hex")}`,
      leaderId: fromUserId,
      members: [{ userId: fromUserId, username: fromUsername, accepted: true }],
    };
    parties.set(party.id, party);
    partyByUser.set(fromUserId, party.id);
  }
  if (party.leaderId !== fromUserId) throw new Error("NOT_PARTY_LEADER");
  if (party.members.some((m) => m.userId === target.id)) {
    emitParty(party);
    return;
  }
  if (party.members.length >= 2) throw new Error("PARTY_FULL");
  if (partyOf(target.id)) throw new Error("PARTY_FULL");
  party.members.push({ userId: target.id, username: target.username, accepted: false });
  partyByUser.set(target.id, party.id);
  emitParty(party);
}

export function partyAccept(userId: string, username: string, partyId: string): void {
  const party = parties.get(partyId);
  if (!party) throw new Error("PARTY_NOT_FOUND");
  const member = party.members.find((m) => m.userId === userId);
  if (!member) throw new Error("PARTY_NOT_FOUND");
  member.accepted = true;
  member.username = username;
  emitParty(party);
}

export function partyLeave(userId: string): void {
  const party = partyOf(userId);
  if (!party) return;
  dissolveParty(party);
}

export function partyHero(userId: string, characterId: string): void {
  const party = partyOf(userId);
  if (!party) throw new Error("PARTY_NOT_FOUND");
  const member = party.members.find((m) => m.userId === userId);
  if (!member) throw new Error("PARTY_NOT_FOUND");
  assertRankedHero(userId, characterId);
  member.characterId = characterId;
  emitParty(party);
}

function seatMatch(match: ReturnType<typeof assembleMatch> & object): RankedMatchMade {
  if (!match) throw new Error("BAD_FORMAT");
  const levels: number[] = [];
  for (const seat of match.seats) {
    for (const heroId of seat.heroIds) {
      const hero = getHero(heroId);
      if (hero) levels.push(hero.level);
    }
  }
  const room = createArena({
    ownerUserId: match.seats[0]?.userIds[0],
    format: match.format,
    theme: "coliseum",
    mapSize: match.format === "ffa_1v1" ? "small" : "medium",
    level: Math.max(1, ...levels, 1),
    privacy: "private",
    name: "Ranked",
    mode: "ranked",
    queueType: match.seats.some((s) => s.userIds.length === 2) ? "duo" : "solo",
    autoStartAt: Date.now() + COUNTDOWN_MS,
  });
  const binds: Array<{ userId: string; playerId: string }> = [];
  for (const seat of match.seats) {
    for (let i = 0; i < seat.userIds.length; i += 1) {
      const uid = seat.userIds[i]!;
      const hid = seat.heroIds[i]!;
      const hero = getHero(hid);
      const joined = joinRoom(room.roomCode, hero?.name ?? "Hero", hid, uid, seat.teamId);
      binds.push({ userId: uid, playerId: joined.playerId });
    }
  }
  dropTickets(match.ticketIds);
  return { room, binds, format: match.format };
}

export function tickRanked(now = Date.now()): RankedMatchMade[] {
  const config = getEconomyConfig();
  const made: RankedMatchMade[] = [];
  for (const format of FORMATS) {
    const match = assembleMatch(format, queuedTickets(), now, config);
    if (!match) continue;
    made.push(seatMatch(match));
  }
  for (const ticket of queuedTickets()) {
    for (const uid of ticket.partyUserIds) pushStatus(uid, now);
  }
  for (const madeMatch of made) {
    const room = getRoom(madeMatch.room.roomCode);
    if (!room?.arena) continue;
    if (room.arena.autoStartAt && room.arena.autoStartAt <= now) {
      try {
        arenaStart(room.roomCode);
      } catch {
        /* not ready yet */
      }
    }
  }
  return made;
}

export function armRankedStart(roomCode: string, start: (code: string) => void, ms = COUNTDOWN_MS): void {
  const prev = startTimers.get(roomCode);
  if (prev) clearTimeout(prev);
  startTimers.set(
    roomCode,
    setTimeout(() => {
      startTimers.delete(roomCode);
      try {
        start(roomCode);
      } catch {
        /* seats moved */
      }
    }, ms),
  );
}

export function rankedPartyState(userId: string): Party | undefined {
  return partyOf(userId);
}

export function resetRankedForTests(): void {
  for (const t of startTimers.values()) clearTimeout(t);
  startTimers.clear();
  parties.clear();
  partyByUser.clear();
  clients.clear();
  dropTickets(queuedTickets().map((t) => t.id));
}
