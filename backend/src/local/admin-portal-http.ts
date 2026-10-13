/**
 * HTTP behind the /admin portal: paged lists, edits, deletes, and the audit trail.
 * Every write records an "admin" event so the Activity page shows who changed what.
 */

import type { Express, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { accountDb, assertAdmin, createUser, updateUser, type Role, type SessionUser } from "./auth.js";
import {
  assertNotLastAdmin,
  confirmUser,
  deleteUser,
  revokeSessions,
  searchUsers,
  setUserEmail,
  setUsername,
  userCounts,
  userDetail,
  userLabels,
} from "./admin-users.js";
import { requestUser } from "./admin-http.js";
import {
  artFileFor,
  createDraftNode,
  deleteDraftArt,
  deleteDraftNode,
  discardDraft,
  draftChanged,
  draftProblems,
  draftSnapshot,
  listCampaigns,
  listDraftArt,
  nodeLinks,
  saveDraftArt,
  updateDraftEncounter,
  updateDraftManifest,
  updateDraftNode,
} from "./catalog.js";
import type { EncounterDef, StoryNode } from "./campaign.js";
import {
  CONTENT_KINDS,
  contentTemplate,
  queryCatalog,
  reloadCatalog,
  reopenContent,
  resolveContent,
  revertContent,
  saveCustomEntry,
  setContentEnabled,
} from "./content-catalog.js";
import { recordEvent } from "./events.js";
import { grantGold } from "./hero.js";
import { HUB_EXITS } from "./hub-exits.js";
import { REPO_ROOT } from "./paths.js";
import { closeRoom, deleteSave, listRooms, listSaves } from "./room.js";

function fail(res: Response, err: unknown): void {
  const code = err instanceof Error ? err.message : "ERROR";
  const status = code === "AUTH_REQUIRED" ? 401 : code === "FORBIDDEN" ? 403 : /NOT_FOUND$/.test(code) ? 404 : 400;
  res.status(status).json({ error: code });
}

function admin(req: Request): SessionUser {
  return assertAdmin(requestUser(req));
}

function audit(actor: SessionUser, action: string, target: string, detail: Record<string, unknown> = {}): void {
  recordEvent(actor.id, null, "admin", { action, target, by: actor.username, ...detail });
}

function str(v: unknown): string {
  return typeof v === "string" ? v : Array.isArray(v) ? String(v[0] ?? "") : v == null ? "" : String(v);
}

function int(v: unknown, fallback: number): number {
  const n = Number(str(v));
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function paged<T>(rows: T[], req: Request): { rows: T[]; total: number; page: number; pageSize: number } {
  const pageSize = Math.min(200, Math.max(10, int(req.query.pageSize, 50)));
  const page = Math.max(1, int(req.query.page, 1));
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize };
}

function route(handler: (req: Request, res: Response, actor: SessionUser) => unknown | Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      const actor = admin(req);
      const out = await handler(req, res, actor);
      if (!res.headersSent) res.json(out ?? { ok: true });
    } catch (err) {
      fail(res, err);
    }
  };
}

const BUILTIN_ART = path.join(REPO_ROOT, "tv", "public", "art");

function builtinArt(): Array<{ name: string; url: string }> {
  if (!fs.existsSync(BUILTIN_ART)) return [];
  return fs
    .readdirSync(BUILTIN_ART)
    .filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
    .sort()
    .map((name) => ({ name, url: `/art/${name}` }));
}

function saveRows(req: Request) {
  const all = listSaves();
  const owners = userLabels(all.flatMap((s) => [s.ownerUserId ?? "", ...s.playerUserIds]));
  const q = str(req.query.q).trim().toLowerCase();
  const kind = str(req.query.kind);
  const campaign = str(req.query.campaign);
  const days = int(req.query.olderThanDays, 0);
  const cutoff = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
  return all
    .map((s) => {
      const owner = s.ownerUserId ? owners.get(s.ownerUserId) : undefined;
      return {
        ...s,
        ownerUsername: owner?.username ?? null,
        ownerEmail: owner?.email ?? null,
        ownerMissing: Boolean(s.ownerUserId && !owner),
        playerAccounts: s.playerUserIds.map((id) => owners.get(id)?.username ?? id),
      };
    })
    .filter((s) => {
      if (kind === "auto" && s.kind !== "auto") return false;
      if (kind === "manual" && s.kind !== "manual") return false;
      if (kind === "archived" && !s.archived) return false;
      if (kind === "broken" && !s.broken) return false;
      if (kind === "orphan" && !s.ownerMissing) return false;
      if (campaign && s.campaignId !== campaign) return false;
      if (cutoff && (s.updatedAt ?? "") >= cutoff) return false;
      if (!q) return true;
      return [s.saveId, s.ownerUsername, s.ownerEmail, s.nodeId, s.campaignId, ...s.players, ...s.playerAccounts]
        .some((v) => String(v ?? "").toLowerCase().includes(q));
    });
}

function campaignView(id: string) {
  const draft = draftSnapshot(id);
  const problems = draftProblems(draft);
  const incoming = new Map<string, string[]>();
  for (const node of Object.values(draft.nodes)) {
    for (const link of nodeLinks(node)) {
      const list = incoming.get(link.to) ?? [];
      if (!list.includes(node.id)) list.push(node.id);
      incoming.set(link.to, list);
    }
  }
  return {
    id: draft.id,
    manifest: draft.manifest,
    changed: draftChanged(id),
    problems,
    nodes: Object.values(draft.nodes).map((n) => ({
      id: n.id,
      type: n.type,
      title: n.scene?.title ?? "",
      text: (n.narration?.text ?? "").slice(0, 160),
      art: n.scene?.art ?? null,
      speaker: n.speaker?.name ?? null,
      links: nodeLinks(n),
      incoming: incoming.get(n.id) ?? [],
      errors: problems.filter((p) => p.nodeId === n.id && p.level === "error").length,
      warnings: problems.filter((p) => p.nodeId === n.id && p.level === "warning").length,
    })),
    encounters: Object.values(draft.encounters).map((e) => ({ id: e.id, name: e.name, mapId: e.mapId })),
    maps: Object.values(draft.maps).map((m) => ({ id: m.id, name: m.name })),
    monsters: Object.values(draft.monsters).map((m) => ({ id: m.id, name: m.name })),
    cast: Object.entries(draft.manifest.cast ?? {}).map(([castId, c]) => ({ id: castId, name: c.name })),
    art: listDraftArt(id),
    builtinArt: builtinArt(),
    hubExits: HUB_EXITS,
  };
}

function parseNode(raw: unknown, nodeId: string): StoryNode {
  const node = raw as StoryNode | undefined;
  if (!node || typeof node !== "object" || node.id !== nodeId) throw new Error("BAD_NODE");
  const types: ReadonlyArray<StoryNode["type"]> = ["story", "skill_check", "encounter", "puzzle", "hub"];
  if (!types.includes(node.type)) throw new Error("BAD_NODE_TYPE");
  if (node.scene?.art && !/^\/(art|campaigns)\/[\w./-]+$/.test(node.scene.art)) throw new Error("BAD_IMAGE");
  return node;
}

export function handleCampaignArt(req: Request, res: Response): void {
  try {
    const actor = admin(req);
    const id = String(req.params.id);
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? []);
    const saved = saveDraftArt(id, str(req.query.name), buf, String(req.headers["content-type"] ?? ""));
    audit(actor, "campaign.art.upload", `${id}/${saved.name}`, { bytes: saved.bytes });
    res.json(saved);
  } catch (err) {
    fail(res, err);
  }
}

/** Draft art previews before publish; published art wins when both exist. */
export function serveCampaignArt(req: Request, res: Response, next: () => void): void {
  const file = artFileFor(String(req.params.id), req.path.replace(/^\/+/, ""));
  if (!file) {
    next();
    return;
  }
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(file);
}

export function mountAdminPortalRoutes(app: Express): void {
  app.use("/campaigns/:id/art", serveCampaignArt);

  app.get("/api/admin/overview", route(() => {
    const content = queryCatalog({ pageSize: 10 }).totals;
    const saves = listSaves();
    return {
      users: userCounts(),
      rooms: listRooms().length,
      saves: { total: saves.length, auto: saves.filter((s) => s.kind === "auto").length, archived: saves.filter((s) => s.archived).length },
      content,
      campaigns: listCampaigns().length,
    };
  }));

  // ---------------------------------------------------------------- users

  app.get("/api/admin/users", route((req) =>
    searchUsers({
      q: str(req.query.q),
      role: str(req.query.role),
      status: str(req.query.status),
      sort: str(req.query.sort),
      dir: str(req.query.dir),
      page: int(req.query.page, 1),
      pageSize: int(req.query.pageSize, 50),
    }),
  ));

  app.get("/api/admin/users/export.csv", async (req, res) => {
    try {
      const actor = admin(req);
      const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = ["id,username,email,role,status,amazon,created_at,last_sign_in,heroes,gold"];
      for (let page = 1; ; page += 1) {
        const batch = searchUsers({ q: str(req.query.q), role: str(req.query.role), status: str(req.query.status), sort: "created", dir: "asc", page, pageSize: 200 });
        for (const u of batch.rows) {
          const status = u.pendingConfirm ? "pending" : u.disabled ? "disabled" : "active";
          lines.push([u.id, u.username, u.email, u.role, status, u.amazon, u.createdAt, u.lastSignIn, u.heroes, u.gold].map(cell).join(","));
        }
        if (page * batch.pageSize >= batch.total) break;
      }
      audit(actor, "users.export", "users", { rows: lines.length - 1 });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="fireverse-users-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(lines.join("\n"));
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/users", route((req, _res, actor) => {
    const role: Role = req.body?.role === "admin" ? "admin" : "player";
    const user = createUser(str(req.body?.username), str(req.body?.password), role);
    if (str(req.body?.email)) setUserEmail(user.id, str(req.body.email));
    audit(actor, "user.create", user.id, { username: user.username, role });
    return userDetail(user.id);
  }));

  app.post("/api/admin/users/bulk", route((req, _res, actor) => {
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, 500) : [];
    const action = str(req.body?.action);
    const done: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    for (const id of ids) {
      try {
        if (action === "delete") deleteUser(actor, id);
        else if (action === "disable") {
          assertNotLastAdmin(actor, id, { disabled: true });
          updateUser(id, { disabled: true });
        } else if (action === "enable") updateUser(id, { disabled: false });
        else if (action === "revoke") revokeSessions(id);
        else throw new Error("BAD_ACTION");
        done.push(id);
      } catch (err) {
        failed.push({ id, error: err instanceof Error ? err.message : "ERROR" });
      }
    }
    audit(actor, `users.bulk.${action}`, `${done.length} users`, { ids: done });
    return { done: done.length, failed };
  }));

  app.get("/api/admin/users/:id", route((req) => userDetail(String(req.params.id))));

  app.patch("/api/admin/users/:id", route((req, _res, actor) => {
    const id = String(req.params.id);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const changed: string[] = [];
    if (typeof body.username === "string") {
      setUsername(id, body.username);
      changed.push("username");
    }
    if (typeof body.email === "string") {
      setUserEmail(id, body.email);
      changed.push("email");
    }
    const patch: { password?: string; role?: Role; disabled?: boolean } = {};
    if (typeof body.password === "string" && body.password) patch.password = body.password;
    if (body.role === "admin" || body.role === "player") patch.role = body.role;
    if (typeof body.disabled === "boolean") patch.disabled = body.disabled;
    if (patch.role || patch.disabled) assertNotLastAdmin(actor, id, patch);
    if (Object.keys(patch).length) {
      updateUser(id, patch);
      changed.push(...Object.keys(patch));
    }
    if (!changed.length) throw new Error("NOTHING_TO_SAVE");
    audit(actor, "user.update", id, { fields: changed });
    return userDetail(id);
  }));

  app.delete("/api/admin/users/:id", route((req, _res, actor) => {
    const id = String(req.params.id);
    const before = userDetail(id).user;
    const out = deleteUser(actor, id);
    audit(actor, "user.delete", id, { username: before.username, email: before.email, ...out });
    return { ok: true, ...out };
  }));

  app.post("/api/admin/users/:id/confirm", route((req, _res, actor) => {
    const id = String(req.params.id);
    confirmUser(id);
    audit(actor, "user.confirm", id);
    return userDetail(id);
  }));

  app.post("/api/admin/users/:id/revoke-sessions", route((req, _res, actor) => {
    const id = String(req.params.id);
    const n = revokeSessions(id);
    audit(actor, "user.revoke_sessions", id, { sessions: n });
    return { revoked: n };
  }));

  app.post("/api/admin/users/:id/gold", route((req, _res, actor) => {
    const id = String(req.params.id);
    const amount = int(req.body?.amount, 0);
    const out = grantGold(actor, id, amount);
    audit(actor, "user.gold", id, { amount, balance: out.gold });
    return out;
  }));

  // ---------------------------------------------------------------- rooms

  app.get("/api/admin/rooms", route((req) => {
    const all = listRooms();
    const names = userLabels(all.flatMap((r) => [r.ownerUserId ?? "", ...r.players.map((p) => p.userId ?? "")]));
    const q = str(req.query.q).trim().toLowerCase();
    const mode = str(req.query.mode);
    const rows = all
      .map((r) => ({
        ...r,
        ownerUsername: r.ownerUserId ? (names.get(r.ownerUserId)?.username ?? null) : null,
        players: r.players.map((p) => ({ ...p, account: p.userId ? (names.get(p.userId)?.username ?? null) : null })),
      }))
      .filter((r) => (mode ? r.mode === mode : true))
      .filter((r) => !q || [r.roomCode, r.campaignId, r.nodeId, r.ownerUsername, ...r.players.flatMap((p) => [p.name, p.account])].some((v) => String(v ?? "").toLowerCase().includes(q)))
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    return paged(rows, req);
  }));

  app.post("/api/admin/rooms/close", route((req, _res, actor) => {
    const codes: string[] = Array.isArray(req.body?.codes) ? req.body.codes.map(String) : [];
    let closed = 0;
    for (const code of codes) {
      try {
        closeRoom(code);
        closed += 1;
      } catch {
        /* already gone */
      }
    }
    audit(actor, "rooms.close", `${closed} rooms`, { codes });
    return { closed };
  }));

  // ---------------------------------------------------------------- saves

  app.get("/api/admin/saves", route((req) => {
    const rows = saveRows(req);
    return { ...paged(rows, req), campaigns: [...new Set(listSaves().map((s) => s.campaignId).filter(Boolean))] };
  }));

  app.delete("/api/admin/saves/:id", route((req, _res, actor) => {
    const id = String(req.params.id);
    deleteSave(id);
    audit(actor, "save.delete", id);
    return { deleted: 1 };
  }));

  app.post("/api/admin/saves/delete", route((req, _res, actor) => {
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    let deleted = 0;
    for (const id of ids) {
      try {
        deleteSave(id);
        deleted += 1;
      } catch {
        /* already gone */
      }
    }
    audit(actor, "saves.delete", `${deleted} saves`, { ids });
    return { deleted };
  }));

  /** Deletes every save the current filter matches, not just the visible page. */
  app.post("/api/admin/saves/clear", route((req, _res, actor) => {
    const targets = saveRows({ query: { ...(req.body ?? {}) } } as unknown as Request);
    if (str(req.body?.confirm) !== `DELETE ${targets.length}`) throw new Error(`CONFIRM_MISMATCH:${targets.length}`);
    let deleted = 0;
    for (const s of targets) {
      try {
        deleteSave(s.saveId);
        deleted += 1;
      } catch {
        /* already gone */
      }
    }
    audit(actor, "saves.clear", `${deleted} saves`, { filter: req.body ?? {} });
    return { deleted };
  }));

  // ---------------------------------------------------------------- campaigns

  app.get("/api/admin/campaigns", route(() => ({
    campaigns: listCampaigns().map((c) => ({ ...c, changed: draftChanged(c.id) })),
  })));

  app.get("/api/admin/campaigns/:id", route((req) => campaignView(String(req.params.id))));

  app.get("/api/admin/campaigns/:id/nodes/:nodeId", route((req) => {
    const draft = draftSnapshot(String(req.params.id));
    const node = draft.nodes[String(req.params.nodeId)];
    if (!node) throw new Error("NODE_NOT_FOUND");
    return { node, encounter: node.encounterId ? (draft.encounters[node.encounterId] ?? null) : null };
  }));

  app.put("/api/admin/campaigns/:id/nodes/:nodeId", route((req, _res, actor) => {
    const id = String(req.params.id);
    const nodeId = String(req.params.nodeId);
    const draft = draftSnapshot(id);
    if (!draft.nodes[nodeId]) throw new Error("NODE_NOT_FOUND");
    updateDraftNode(id, parseNode(req.body?.node, nodeId));
    if (req.body?.encounter) {
      const enc = req.body.encounter as EncounterDef;
      if (!enc.id || !enc.mapId || !enc.scaling) throw new Error("BAD_ENCOUNTER");
      updateDraftEncounter(id, enc);
    }
    audit(actor, "campaign.node.save", `${id}/${nodeId}`);
    return campaignView(id);
  }));

  app.post("/api/admin/campaigns/:id/nodes", route((req, _res, actor) => {
    const id = String(req.params.id);
    const nodeId = str(req.body?.id).trim();
    const type = str(req.body?.type) as StoryNode["type"];
    const node: StoryNode = { id: nodeId, type, narration: { text: str(req.body?.text) }, choices: [] };
    if (type === "skill_check") {
      node.check = { ability: "wis", dc: 12 };
      node.onSuccess = { next: "" };
      node.onFailure = { next: "" };
    }
    if (type === "puzzle") node.puzzle = { kind: "sequence", options: [], solution: [] };
    createDraftNode(id, parseNode(node, nodeId));
    audit(actor, "campaign.node.create", `${id}/${nodeId}`, { type });
    return campaignView(id);
  }));

  app.delete("/api/admin/campaigns/:id/nodes/:nodeId", route((req, _res, actor) => {
    const id = String(req.params.id);
    const nodeId = String(req.params.nodeId);
    deleteDraftNode(id, nodeId);
    audit(actor, "campaign.node.delete", `${id}/${nodeId}`);
    return campaignView(id);
  }));

  app.put("/api/admin/campaigns/:id/manifest", route((req, _res, actor) => {
    const id = String(req.params.id);
    updateDraftManifest(id, {
      title: typeof req.body?.title === "string" ? req.body.title : undefined,
      startNodeId: typeof req.body?.startNodeId === "string" ? req.body.startNodeId : undefined,
    });
    audit(actor, "campaign.manifest", id);
    return campaignView(id);
  }));

  app.post("/api/admin/campaigns/:id/discard", route((req, _res, actor) => {
    const id = String(req.params.id);
    discardDraft(id);
    audit(actor, "campaign.discard_draft", id);
    return campaignView(id);
  }));

  app.delete("/api/admin/campaigns/:id/art/:name", route((req, _res, actor) => {
    const id = String(req.params.id);
    deleteDraftArt(id, String(req.params.name));
    audit(actor, "campaign.art.delete", `${id}/${String(req.params.name)}`);
    return { art: listDraftArt(id) };
  }));

  // ---------------------------------------------------------------- content

  app.get("/api/admin/content", route((req) =>
    queryCatalog({
      q: str(req.query.q),
      kind: str(req.query.kind),
      status: str(req.query.status),
      enabled: str(req.query.enabled),
      valid: str(req.query.valid),
      source: str(req.query.source),
      sort: str(req.query.sort),
      dir: str(req.query.dir),
      page: int(req.query.page, 1),
      pageSize: int(req.query.pageSize, 50),
    }),
  ));

  app.get("/api/admin/content/template/:kind", route((req) => ({ entry: contentTemplate(String(req.params.kind)), kinds: CONTENT_KINDS })));

  app.post("/api/admin/content/reload", route((_req, _res, actor) => {
    reloadCatalog();
    audit(actor, "content.reload", "catalog");
    return { ok: true };
  }));

  app.post("/api/admin/content/bulk", route((req, _res, actor) => {
    const items: Array<{ kind: string; id: string }> = Array.isArray(req.body?.items)
      ? req.body.items.slice(0, 1000).map((i: { kind?: unknown; id?: unknown }) => ({ kind: String(i.kind ?? ""), id: String(i.id ?? "") }))
      : [];
    const action = str(req.body?.action);
    const note = str(req.body?.adminNote);
    let done = 0;
    const failed: Array<{ kind: string; id: string; error: string }> = [];
    for (const item of items) {
      try {
        switch (action) {
          case "enable":
            setContentEnabled(item.kind, item.id, true);
            break;
          case "disable":
            setContentEnabled(item.kind, item.id, false);
            break;
          case "approve":
            resolveContent(item.kind, item.id, { adminNote: note });
            break;
          case "approve_enable":
            resolveContent(item.kind, item.id, { adminNote: note });
            setContentEnabled(item.kind, item.id, true);
            break;
          case "reject":
            resolveContent(item.kind, item.id, { reject: true, adminNote: note });
            break;
          case "reopen":
            reopenContent(item.kind, item.id);
            break;
          default:
            throw new Error("BAD_ACTION");
        }
        done += 1;
      } catch (err) {
        failed.push({ ...item, error: err instanceof Error ? err.message : "ERROR" });
      }
    }
    audit(actor, `content.bulk.${action}`, `${done} entries`);
    return { done, failed };
  }));

  app.post("/api/admin/content/:kind/:id/resolve", route((req, _res, actor) => {
    const kind = String(req.params.kind);
    const id = String(req.params.id);
    const entry = resolveContent(kind, id, {
      optionIndex: req.body?.optionIndex == null ? undefined : Number(req.body.optionIndex),
      patch: req.body?.patch,
      adminNote: str(req.body?.adminNote) || undefined,
      reject: Boolean(req.body?.reject),
    });
    if (req.body?.enable === true && !req.body?.reject) setContentEnabled(kind, id, true);
    audit(actor, req.body?.reject ? "content.reject" : "content.approve", `${kind}/${id}`);
    return { entry };
  }));

  app.post("/api/admin/content/:kind/:id/reopen", route((req, _res, actor) => {
    const entry = reopenContent(String(req.params.kind), String(req.params.id));
    audit(actor, "content.reopen", `${entry.kind}/${entry.id}`);
    return { entry };
  }));

  app.put("/api/admin/content/:kind/:id", route((req, _res, actor) => {
    const kind = String(req.params.kind);
    const id = String(req.params.id);
    const body = req.body?.entry ?? req.body;
    const entry = saveCustomEntry(kind, id, body);
    audit(actor, "content.save", `${kind}/${id}`, { valid: entry.valid });
    return { entry };
  }));

  app.delete("/api/admin/content/:kind/:id/edit", route((req, _res, actor) => {
    const kind = String(req.params.kind);
    const id = String(req.params.id);
    const entry = revertContent(kind, id);
    audit(actor, entry ? "content.revert" : "content.delete", `${kind}/${id}`);
    return { entry };
  }));

  app.post("/api/admin/content/:kind/:id/enabled", route((req, _res, actor) => {
    const entry = setContentEnabled(String(req.params.kind), String(req.params.id), Boolean(req.body?.enabled));
    audit(actor, entry.enabled ? "content.enable" : "content.disable", `${entry.kind}/${entry.id}`);
    return { entry };
  }));

  // ---------------------------------------------------------------- activity

  app.get("/api/admin/activity", route((req) => {
    const pageSize = Math.min(200, Math.max(10, int(req.query.pageSize, 50)));
    const page = Math.max(1, int(req.query.page, 1));
    const q = str(req.query.q).trim();
    const where = q ? "WHERE event_type = 'admin' AND payload_json LIKE ?" : "WHERE event_type = 'admin'";
    const args = q ? [`%${q}%`] : [];
    const total = (accountDb().prepare(`SELECT COUNT(*) AS n FROM events ${where}`).get(...args) as { n: number }).n;
    const rows = accountDb()
      .prepare(`SELECT id, user_id, payload_json, ts FROM events ${where} ORDER BY ts DESC LIMIT ? OFFSET ?`)
      .all(...args, pageSize, (page - 1) * pageSize) as Array<{ id: string; user_id: string; payload_json: string; ts: string }>;
    return {
      rows: rows.map((r) => ({ id: r.id, userId: r.user_id, ts: r.ts, ...(JSON.parse(r.payload_json) as Record<string, unknown>) })),
      total,
      page,
      pageSize,
    };
  }));
}
