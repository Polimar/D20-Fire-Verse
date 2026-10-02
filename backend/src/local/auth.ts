/**
 * Username/password accounts. The first boot seeds admin / admin.
 * Sessions are an httpOnly cookie the WebSocket upgrade sends on its own.
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { confirmationLetter, sendMail } from "./mail.js";
import { DATA_DIR } from "./paths.js";

export type Role = "admin" | "player";

export type SessionUser = {
  id: string;
  username: string;
  role: Role;
  disabled: boolean;
};

const COOKIE = "fv_session";

let db: DatabaseSync | null = null;

function database(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, "accounts.sqlite"));
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS friendships (
      user_a TEXT NOT NULL,
      user_b TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_a, user_b)
    );
    CREATE TABLE IF NOT EXISTS arena_results (
      id TEXT PRIMARY KEY,
      room_code TEXT NOT NULL,
      format TEXT NOT NULL,
      level INTEGER NOT NULL,
      winners TEXT NOT NULL,
      participants TEXT NOT NULL,
      ended_at TEXT NOT NULL
    );
  `);
  const cols = new Set(
    (db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>).map((c) => c.name),
  );
  if (!cols.has("email")) db.exec("ALTER TABLE users ADD COLUMN email TEXT");
  if (!cols.has("confirm_token")) db.exec("ALTER TABLE users ADD COLUMN confirm_token TEXT");
  if (!cols.has("confirm_room")) db.exec("ALTER TABLE users ADD COLUMN confirm_room TEXT");
  if (!cols.has("amazon_user_id")) db.exec("ALTER TABLE users ADD COLUMN amazon_user_id TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email) WHERE email IS NOT NULL");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_amazon ON users(amazon_user_id) WHERE amazon_user_id IS NOT NULL");
  const count = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (count.n === 0) {
    createUser("admin", "admin", "admin");
  }
  return db;
}

export function openAuth(): void {
  database();
}

function hashPassword(password: string, salt = randomBytes(16).toString("hex")): string {
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function passwordMatches(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const got = scryptSync(password, salt, 32);
  const want = Buffer.from(hash, "hex");
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}

export function createUser(username: string, password: string, role: Role = "player"): SessionUser {
  const name = username.trim();
  if (!/^[a-zA-Z0-9._-]{2,32}$/.test(name)) throw new Error("BAD_USERNAME");
  if (password.length < 4) throw new Error("BAD_PASSWORD");
  if (role !== "admin" && role !== "player") throw new Error("BAD_ROLE");
  const id = `user_${randomBytes(8).toString("hex")}`;
  try {
    database()
      .prepare("INSERT INTO users (id, username, password, role, disabled, created_at) VALUES (?, ?, ?, ?, 0, ?)")
      .run(id, name, hashPassword(password), role, new Date().toISOString());
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new Error("USERNAME_TAKEN");
    throw err;
  }
  return { id, username: name, role, disabled: false };
}

export function listUsers(): SessionUser[] {
  const rows = database()
    .prepare("SELECT id, username, role, disabled FROM users ORDER BY username COLLATE NOCASE")
    .all() as Array<{ id: string; username: string; role: Role; disabled: number }>;
  return rows.map((r) => ({ id: r.id, username: r.username, role: r.role, disabled: r.disabled === 1 }));
}

export function updateUser(
  id: string,
  patch: { password?: string; role?: Role; disabled?: boolean },
): SessionUser {
  const row = database().prepare("SELECT id, username, role, disabled FROM users WHERE id = ?").get(id) as
    | { id: string; username: string; role: Role; disabled: number }
    | undefined;
  if (!row) throw new Error("USER_NOT_FOUND");
  if (patch.password !== undefined) {
    if (patch.password.length < 4) throw new Error("BAD_PASSWORD");
    database().prepare("UPDATE users SET password = ? WHERE id = ?").run(hashPassword(patch.password), id);
  }
  if (patch.role !== undefined) {
    if (patch.role !== "admin" && patch.role !== "player") throw new Error("BAD_ROLE");
    database().prepare("UPDATE users SET role = ? WHERE id = ?").run(patch.role, id);
  }
  if (patch.disabled !== undefined) {
    database().prepare("UPDATE users SET disabled = ? WHERE id = ?").run(patch.disabled ? 1 : 0, id);
    if (patch.disabled) database().prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  }
  const next = database().prepare("SELECT id, username, role, disabled FROM users WHERE id = ?").get(id) as {
    id: string;
    username: string;
    role: Role;
    disabled: number;
  };
  return { id: next.id, username: next.username, role: next.role, disabled: next.disabled === 1 };
}

type AuthRow = {
  id: string;
  username: string;
  password: string;
  role: Role;
  disabled: number;
  email: string | null;
  confirm_token: string | null;
  confirm_room: string | null;
};

function authRow(username: string): AuthRow | undefined {
  return database()
    .prepare(
      "SELECT id, username, password, role, disabled, email, confirm_token, confirm_room FROM users WHERE username = ? COLLATE NOCASE",
    )
    .get(username.trim()) as AuthRow | undefined;
}

function openSession(userId: string): string {
  const token = randomBytes(32).toString("hex");
  database().prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").run(token, userId, new Date().toISOString());
  return token;
}

export type LoginResult =
  | { kind: "ok"; token: string; user: SessionUser }
  | { kind: "unconfirmed" }
  | { kind: "bad" };

export function authenticate(username: string, password: string): LoginResult {
  const row = authRow(username);
  if (!row || !passwordMatches(password, row.password)) return { kind: "bad" };
  if (row.disabled && row.confirm_token) return { kind: "unconfirmed" };
  if (row.disabled) return { kind: "bad" };
  return {
    kind: "ok",
    token: openSession(row.id),
    user: { id: row.id, username: row.username, role: row.role, disabled: false },
  };
}

export function login(username: string, password: string): { token: string; user: SessionUser } | null {
  const result = authenticate(username, password);
  return result.kind === "ok" ? { token: result.token, user: result.user } : null;
}

/** A readable, unique username from the Amazon profile name ("Ada Lovelace" → "Ada.Lovelace", then "Ada.Lovelace2"). */
function freeUsername(name: string | undefined): string {
  const base =
    (name ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .replace(/\s+/g, ".")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .replace(/^[._-]+|[._-]+$/g, "")
      .slice(0, 28) || "adventurer";
  const stem = base.length >= 2 ? base : `${base}.player`;
  if (!userByName(stem)) return stem;
  for (let n = 2; n < 10_000; n += 1) {
    const candidate = `${stem.slice(0, 32 - String(n).length)}${n}`;
    if (!userByName(candidate)) return candidate;
  }
  return `adventurer.${randomBytes(4).toString("hex")}`;
}

/**
 * Sign in with a verified Amazon profile. The first visit creates a player account bound to the
 * Amazon user id; later visits find it again even if the profile name changed.
 */
export function signInWithAmazon(profile: { amazonUserId: string; name?: string }): { token: string; user: SessionUser } {
  const amazonId = profile.amazonUserId.trim();
  if (!/^amzn1\.account\.[A-Za-z0-9]+$/.test(amazonId)) throw new Error("AMAZON_FAILED");
  const row = database()
    .prepare("SELECT id, username, role, disabled FROM users WHERE amazon_user_id = ?")
    .get(amazonId) as { id: string; username: string; role: Role; disabled: number } | undefined;
  if (row) {
    if (row.disabled) throw new Error("FORBIDDEN");
    return { token: openSession(row.id), user: { id: row.id, username: row.username, role: row.role, disabled: false } };
  }
  const id = `user_${randomBytes(8).toString("hex")}`;
  const username = freeUsername(profile.name);
  database()
    .prepare(
      "INSERT INTO users (id, username, password, role, disabled, created_at, amazon_user_id) VALUES (?, ?, ?, 'player', 0, ?, ?)",
    )
    .run(id, username, hashPassword(randomBytes(24).toString("hex")), new Date().toISOString(), amazonId);
  return { token: openSession(id), user: { id, username, role: "player", disabled: false } };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerPlayer(input: {
  username: string;
  password: string;
  email: string;
  roomCode: string;
}): Promise<void> {
  const name = input.username.trim();
  const email = input.email.trim().toLowerCase();
  const roomCode = input.roomCode.trim().toUpperCase();
  if (!/^[a-zA-Z0-9._-]{2,32}$/.test(name)) throw new Error("BAD_USERNAME");
  if (input.password.length < 4) throw new Error("BAD_PASSWORD");
  if (!EMAIL.test(email)) throw new Error("BAD_EMAIL");
  if (userByName(name)) throw new Error("USERNAME_TAKEN");
  const taken = database().prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(email);
  if (taken) throw new Error("EMAIL_TAKEN");
  const id = `user_${randomBytes(8).toString("hex")}`;
  const token = randomBytes(24).toString("hex");
  database()
    .prepare(
      "INSERT INTO users (id, username, password, role, disabled, created_at, email, confirm_token, confirm_room) VALUES (?, ?, ?, 'player', 1, ?, ?, ?, ?)",
    )
    .run(id, name, hashPassword(input.password), new Date().toISOString(), email, token, roomCode);
  try {
    const letter = confirmationLetter(token);
    await sendMail(email, letter.subject, letter.html);
  } catch (err) {
    database().prepare("DELETE FROM users WHERE id = ?").run(id);
    throw err;
  }
}

export async function resendConfirmation(username: string, password: string): Promise<void> {
  const row = authRow(username);
  if (!row || !passwordMatches(password, row.password) || !row.disabled || !row.confirm_token || !row.email) {
    throw new Error("BAD_LOGIN");
  }
  const letter = confirmationLetter(row.confirm_token);
  await sendMail(row.email, letter.subject, letter.html);
}

export function confirmRegistration(token: string): { session: string; roomCode: string } | null {
  const row = database()
    .prepare("SELECT id, confirm_room FROM users WHERE confirm_token = ?")
    .get(token) as { id: string; confirm_room: string | null } | undefined;
  if (!row) return null;
  database().prepare("UPDATE users SET disabled = 0, confirm_token = NULL WHERE id = ?").run(row.id);
  return { session: openSession(row.id), roomCode: row.confirm_room ?? "" };
}

export function logout(token: string | null): void {
  if (!token) return;
  database().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function userFromToken(token: string | null | undefined): SessionUser | null {
  if (!token) return null;
  const row = database()
    .prepare(
      `SELECT u.id, u.username, u.role, u.disabled
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`,
    )
    .get(token) as { id: string; username: string; role: Role; disabled: number } | undefined;
  if (!row || row.disabled) return null;
  return { id: row.id, username: row.username, role: row.role, disabled: false };
}

export function readSessionCookie(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function sessionCookie(token: string, secure: boolean): string {
  const bits = [`${COOKIE}=${token}`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=2592000"];
  if (secure) bits.push("Secure");
  return bits.join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  const bits = [`${COOKIE}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (secure) bits.push("Secure");
  return bits.join("; ");
}

/** Game actions need a signed-in player. A ping may arrive before the cookie is checked. */
export function actionNeedsAuth(action: string): boolean {
  return action !== "PING";
}

export function assertAdmin(user: SessionUser | null): SessionUser {
  if (!user) throw new Error("AUTH_REQUIRED");
  if (user.role !== "admin" || user.disabled) throw new Error("FORBIDDEN");
  return user;
}

function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** The account behind a paired phone. Null once the account is gone or disabled. */
export function activeUserById(id: string): SessionUser | null {
  const u = userRow(id);
  return u && !u.disabled ? u : null;
}

function userRow(id: string): SessionUser | null {
  const row = database()
    .prepare("SELECT id, username, role, disabled FROM users WHERE id = ?")
    .get(id) as { id: string; username: string; role: Role; disabled: number } | undefined;
  if (!row) return null;
  return { id: row.id, username: row.username, role: row.role, disabled: row.disabled === 1 };
}

function userByName(username: string): SessionUser | null {
  const row = database()
    .prepare("SELECT id, username, role, disabled FROM users WHERE username = ? COLLATE NOCASE")
    .get(username.trim()) as { id: string; username: string; role: Role; disabled: number } | undefined;
  if (!row) return null;
  return { id: row.id, username: row.username, role: row.role, disabled: row.disabled === 1 };
}

export function requestFriend(fromUserId: string, username: string): void {
  const target = userByName(username);
  if (!target) throw new Error("USER_NOT_FOUND");
  if (target.id === fromUserId) throw new Error("FRIEND_SELF");
  const [a, b] = pairKey(fromUserId, target.id);
  const row = database()
    .prepare("SELECT status FROM friendships WHERE user_a = ? AND user_b = ?")
    .get(a, b) as { status: string } | undefined;
  if (row?.status === "accepted") return;
  database()
    .prepare(
      "INSERT INTO friendships (user_a, user_b, status, created_at) VALUES (?, ?, 'pending', ?) ON CONFLICT(user_a, user_b) DO UPDATE SET status = 'pending'",
    )
    .run(a, b, new Date().toISOString());
}

export function acceptFriend(userId: string, otherUserId: string): void {
  const [a, b] = pairKey(userId, otherUserId);
  database()
    .prepare("UPDATE friendships SET status = 'accepted' WHERE user_a = ? AND user_b = ?")
    .run(a, b);
}

export function listFriends(userId: string): { id: string; username: string; status: string }[] {
  const rows = database()
    .prepare("SELECT user_a, user_b, status FROM friendships WHERE user_a = ? OR user_b = ?")
    .all(userId, userId) as { user_a: string; user_b: string; status: string }[];
  return rows.map((r) => {
    const other = r.user_a === userId ? r.user_b : r.user_a;
    const u = userRow(other);
    return { id: other, username: u?.username ?? other, status: r.status };
  });
}

export function recordArenaResult(row: {
  roomCode: string;
  format: string;
  level: number;
  winners: string[];
  participants: string[];
}): void {
  database()
    .prepare(
      "INSERT INTO arena_results (id, room_code, format, level, winners, participants, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      `ar_${randomBytes(8).toString("hex")}`,
      row.roomCode,
      row.format,
      row.level,
      JSON.stringify(row.winners),
      JSON.stringify(row.participants),
      new Date().toISOString(),
    );
}

export function arenaLeaderboard(scope: "global" | "friends", userId?: string): { username: string; wins: number; losses: number }[] {
  const rows = database().prepare("SELECT winners, participants FROM arena_results").all() as {
    winners: string;
    participants: string;
  }[];
  const friendIds =
    scope === "friends" && userId
      ? new Set(listFriends(userId).filter((f) => f.status === "accepted").map((f) => f.id).concat(userId))
      : null;
  const tally = new Map<string, { wins: number; losses: number }>();
  for (const r of rows) {
    const winners = JSON.parse(r.winners) as string[];
    const parts = JSON.parse(r.participants) as string[];
    for (const p of parts) {
      if (friendIds && !friendIds.has(p)) continue;
      const cur = tally.get(p) ?? { wins: 0, losses: 0 };
      if (winners.includes(p)) cur.wins += 1;
      else cur.losses += 1;
      tally.set(p, cur);
    }
  }
  return [...tally.entries()]
    .map(([id, s]) => ({ username: userRow(id)?.username ?? id, wins: s.wins, losses: s.losses }))
    .sort((a, b) => b.wins - a.wins);
}
