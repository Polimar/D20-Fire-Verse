/**
 * Admin queries over accounts: server-side search and paging, a detail view, and a hard delete
 * that removes every row the account owns. Analytics events stay, keyed by a user id nobody holds.
 */

import { accountDb, type Role, type SessionUser } from "./auth.js";
import { deleteCustomCharacter, listCustomCharacters } from "./chargen.js";
import { deleteSave, listSaves } from "./room.js";

export type UserQuery = {
  q?: string;
  role?: string;
  status?: string;
  sort?: string;
  dir?: string;
  page?: number;
  pageSize?: number;
};

export type AdminUserRow = {
  id: string;
  username: string;
  email: string | null;
  role: Role;
  disabled: boolean;
  pendingConfirm: boolean;
  amazon: boolean;
  createdAt: string;
  lastSignIn: string | null;
  sessions: number;
  heroes: number;
  gold: number;
};

const SORTS: Record<string, string> = {
  username: "u.username COLLATE NOCASE",
  email: "u.email COLLATE NOCASE",
  role: "u.role",
  created: "u.created_at",
  lastSignIn: "last_sign_in",
  heroes: "heroes",
  gold: "gold",
};

function rowOut(r: Record<string, unknown>): AdminUserRow {
  return {
    id: String(r.id),
    username: String(r.username),
    email: (r.email as string | null) ?? null,
    role: r.role === "admin" ? "admin" : "player",
    disabled: r.disabled === 1,
    pendingConfirm: r.confirm_token != null,
    amazon: r.amazon_user_id != null,
    createdAt: String(r.created_at),
    lastSignIn: (r.last_sign_in as string | null) ?? null,
    sessions: Number(r.sessions ?? 0),
    heroes: Number(r.heroes ?? 0),
    gold: Number(r.gold ?? 0),
  };
}

const SELECT = `
  SELECT u.id, u.username, u.email, u.role, u.disabled, u.confirm_token, u.amazon_user_id, u.created_at,
    (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id) AS last_sign_in,
    (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS sessions,
    (SELECT COUNT(*) FROM heroes h WHERE h.user_id = u.id AND h.deleted_at IS NULL) AS heroes,
    COALESCE((SELECT w.gold_balance FROM account_wallet w WHERE w.user_id = u.id), 0) AS gold
  FROM users u`;

export function searchUsers(query: UserQuery): { rows: AdminUserRow[]; total: number; page: number; pageSize: number } {
  const where: string[] = [];
  const args: Array<string | number> = [];
  const q = (query.q ?? "").trim();
  if (q) {
    where.push("(u.username LIKE ? COLLATE NOCASE OR u.email LIKE ? COLLATE NOCASE OR u.id = ?)");
    args.push(`%${q}%`, `%${q}%`, q);
  }
  if (query.role === "admin" || query.role === "player") {
    where.push("u.role = ?");
    args.push(query.role);
  }
  switch (query.status) {
    case "active":
      where.push("u.disabled = 0");
      break;
    case "disabled":
      where.push("u.disabled = 1 AND u.confirm_token IS NULL");
      break;
    case "pending":
      where.push("u.confirm_token IS NOT NULL");
      break;
    case "amazon":
      where.push("u.amazon_user_id IS NOT NULL");
      break;
    default:
      break;
  }
  const clause = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const pageSize = Math.min(200, Math.max(10, Math.floor(query.pageSize ?? 50)));
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const order = SORTS[query.sort ?? ""] ?? SORTS.created!;
  const dir = query.dir === "asc" ? "ASC" : "DESC";
  const total = (accountDb().prepare(`SELECT COUNT(*) AS n FROM users u${clause}`).get(...args) as { n: number }).n;
  const rows = accountDb()
    .prepare(`${SELECT}${clause} ORDER BY ${order} ${dir}, u.id LIMIT ? OFFSET ?`)
    .all(...args, pageSize, (page - 1) * pageSize) as Array<Record<string, unknown>>;
  return { rows: rows.map(rowOut), total, page, pageSize };
}

export function userCounts(): { total: number; admins: number; active: number; disabled: number; pending: number; amazon: number } {
  const row = accountDb()
    .prepare(
      `SELECT COUNT(*) AS total,
        SUM(role = 'admin') AS admins,
        SUM(disabled = 0) AS active,
        SUM(disabled = 1 AND confirm_token IS NULL) AS disabled,
        SUM(confirm_token IS NOT NULL) AS pending,
        SUM(amazon_user_id IS NOT NULL) AS amazon
       FROM users`,
    )
    .get() as Record<string, number | null>;
  return {
    total: row.total ?? 0,
    admins: row.admins ?? 0,
    active: row.active ?? 0,
    disabled: row.disabled ?? 0,
    pending: row.pending ?? 0,
    amazon: row.amazon ?? 0,
  };
}

function oneUser(id: string): AdminUserRow {
  const row = accountDb().prepare(`${SELECT} WHERE u.id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!row) throw new Error("USER_NOT_FOUND");
  return rowOut(row);
}

export function userDetail(id: string) {
  const user = oneUser(id);
  const heroes = accountDb()
    .prepare("SELECT id, name, classes_json, species, level, xp, created_at FROM heroes WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at")
    .all(id) as Array<{ id: string; name: string; classes_json: string; species: string; level: number; xp: number; created_at: string }>;
  const wallet = accountDb().prepare("SELECT gold_balance, hard_currency_balance FROM account_wallet WHERE user_id = ?").get(id) as
    | { gold_balance: number; hard_currency_balance: number }
    | undefined;
  const stash = (accountDb().prepare("SELECT COUNT(*) AS n FROM account_stash WHERE user_id = ?").get(id) as { n: number }).n;
  return {
    user,
    wallet: { gold: wallet?.gold_balance ?? 0, hard: wallet?.hard_currency_balance ?? 0 },
    stashItems: stash,
    heroes: heroes.map((h) => ({
      id: h.id,
      name: h.name,
      classes: (JSON.parse(h.classes_json) as Array<{ id: string; level: number }>).map((c) => `${c.id} ${c.level}`).join(" / "),
      species: h.species,
      level: h.level,
      xp: h.xp,
      createdAt: h.created_at,
    })),
    customCharacters: listCustomCharacters(id).map((p) => ({ id: p.id, name: p.name, class: p.class, level: p.level })),
    saves: listSaves().filter((s) => s.ownerUserId === id),
  };
}

export function setUserEmail(id: string, raw: string): AdminUserRow {
  oneUser(id);
  const email = raw.trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("BAD_EMAIL");
  try {
    accountDb().prepare("UPDATE users SET email = ? WHERE id = ?").run(email || null, id);
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new Error("EMAIL_TAKEN");
    throw err;
  }
  return oneUser(id);
}

export function setUsername(id: string, raw: string): AdminUserRow {
  oneUser(id);
  const name = raw.trim();
  if (!/^[a-zA-Z0-9._-]{2,32}$/.test(name)) throw new Error("BAD_USERNAME");
  try {
    accountDb().prepare("UPDATE users SET username = ? WHERE id = ?").run(name, id);
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new Error("USERNAME_TAKEN");
    throw err;
  }
  return oneUser(id);
}

/** Mark a pending registration as confirmed without the mail link. */
export function confirmUser(id: string): AdminUserRow {
  oneUser(id);
  accountDb().prepare("UPDATE users SET disabled = 0, confirm_token = NULL WHERE id = ?").run(id);
  return oneUser(id);
}

export function revokeSessions(id: string): number {
  oneUser(id);
  return Number(accountDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(id).changes);
}

function adminCount(): number {
  return (accountDb().prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0").get() as { n: number }).n;
}

export function assertNotLastAdmin(actor: SessionUser, id: string, next: { role?: Role; disabled?: boolean; deleting?: boolean }): void {
  const target = oneUser(id);
  if (actor.id === id && (next.deleting || next.disabled || next.role === "player")) throw new Error("SELF_LOCKOUT");
  const losesAdmin = target.role === "admin" && !target.disabled && (next.deleting || next.disabled || next.role === "player");
  if (losesAdmin && adminCount() <= 1) throw new Error("LAST_ADMIN");
}

const OWNED_TABLES: Array<[table: string, column: string]> = [
  ["sessions", "user_id"],
  ["account_stash", "user_id"],
  ["account_wallet", "user_id"],
  ["account_rating", "user_id"],
  ["loadout_presets", "user_id"],
  ["season_pass", "user_id"],
  ["campaign_heroes", "user_id"],
  ["iap_receipts", "user_id"],
  ["arcade_daily", "user_id"],
  ["cosmetics", "user_id"],
];

/** Hard delete. Removes heroes, stash, wallet, friendships, custom characters, and owned saves. */
export function deleteUser(actor: SessionUser, id: string): { savesDeleted: number; heroesDeleted: number } {
  assertNotLastAdmin(actor, id, { deleting: true });
  const db = accountDb();
  const heroIds = (db.prepare("SELECT id FROM heroes WHERE user_id = ?").all(id) as Array<{ id: string }>).map((r) => r.id);
  db.exec("BEGIN");
  try {
    for (const heroId of heroIds) db.prepare("DELETE FROM hero_milestones WHERE hero_id = ?").run(heroId);
    db.prepare("DELETE FROM heroes WHERE user_id = ?").run(id);
    for (const [table, column] of OWNED_TABLES) db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(id);
    db.prepare("DELETE FROM friendships WHERE user_a = ? OR user_b = ?").run(id, id);
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  for (const pregen of listCustomCharacters(id)) deleteCustomCharacter(pregen.id, id, false);
  let savesDeleted = 0;
  for (const save of listSaves()) {
    if (save.ownerUserId !== id) continue;
    deleteSave(save.saveId);
    savesDeleted += 1;
  }
  return { savesDeleted, heroesDeleted: heroIds.length };
}

/** Usernames and emails by id, for joining onto saves, rooms, and maps. */
export function userLabels(ids: Iterable<string>): Map<string, { username: string; email: string | null }> {
  const out = new Map<string, { username: string; email: string | null }>();
  const list = [...new Set(ids)].filter(Boolean);
  for (let i = 0; i < list.length; i += 500) {
    const batch = list.slice(i, i + 500);
    const rows = accountDb()
      .prepare(`SELECT id, username, email FROM users WHERE id IN (${batch.map(() => "?").join(",")})`)
      .all(...batch) as Array<{ id: string; username: string; email: string | null }>;
    for (const r of rows) out.set(r.id, { username: r.username, email: r.email });
  }
  return out;
}
