/**
 * SRD 5.2.1 files on disk plus the admin's edits in sqlite. Nothing is in play until an admin enables it.
 * A file Zod rejects is listed and skipped; it does not stop the table.
 * An admin edit (content_custom) replaces the parsed entry with the same kind and id, or adds a new one.
 */

import fs from "node:fs";
import path from "node:path";
import {
  backgroundDef,
  classDef,
  featDef,
  itemDef,
  monsterDef,
  speciesDef,
  spellDef,
  subclassDef,
  xpTable,
  type ClassDef,
  type ItemDef,
  type MonsterDef,
  type SpellDef,
} from "@d20-fireverse/content-schema";
import type { ZodTypeAny } from "zod";
import { accountDb } from "./auth.js";
import { CONTENT_ROOT } from "./paths.js";

const ROOT = path.join(CONTENT_ROOT, "srd-5.2.1");

export type ReviewStatus = "auto_ok" | "needs_review" | "resolved" | "rejected" | "none";

export type CatalogRow = {
  kind: string;
  id: string;
  name: string;
  enabled: boolean;
  valid: boolean;
  issues: string[];
  inPlay: boolean;
  reviewStatus: ReviewStatus;
  confidence: "high" | "medium" | "low" | "none";
  unparsedFields: string[];
  usage: string;
  source: "srd" | "custom" | "queue";
  edited: boolean;
  /** One line of mechanics for the list: dice, AC, effects. */
  summary: string;
  /** SRD rules this entry states that the game does not apply. */
  notModeled: number;
};

export const CONTENT_KINDS = ["class", "subclass", "species", "background", "spell", "feat", "item", "monster"] as const;
type Bucket = (typeof CONTENT_KINDS)[number];

const SCHEMA: Record<Bucket, ZodTypeAny> = {
  class: classDef,
  subclass: subclassDef,
  species: speciesDef,
  background: backgroundDef,
  spell: spellDef,
  feat: featDef,
  item: itemDef,
  monster: monsterDef,
};

const FILES: Array<{ file: string; kind: Bucket }> = [
  { file: "classes.json", kind: "class" },
  { file: "subclasses.json", kind: "subclass" },
  { file: "species.json", kind: "species" },
  { file: "backgrounds.json", kind: "background" },
  { file: "spells.json", kind: "spell" },
  { file: "feats.json", kind: "feat" },
  { file: "items/gear.json", kind: "item" },
  { file: "items/magic.json", kind: "item" },
  { file: "monsters.json", kind: "monster" },
];

type ReviewFile = {
  status?: ReviewStatus;
  confidence?: CatalogRow["confidence"];
  unparsedFields?: string[];
  usage?: string;
  srd?: Record<string, unknown>;
  notModeled?: string[];
  ambiguities?: unknown[];
  adminNote?: string;
};

type Stored = {
  kind: Bucket;
  id: string;
  name: string;
  valid: boolean;
  issues: string[];
  raw: unknown;
  parsed: unknown;
  source: CatalogRow["source"];
  edited: boolean;
  review?: ReviewFile;
};

let cache: Stored[] | null = null;
let index: Map<string, Stored> | null = null;

function isBucket(kind: string): kind is Bucket {
  return (CONTENT_KINDS as readonly string[]).includes(kind);
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
}

function check(kind: Bucket, entry: unknown): Pick<Stored, "valid" | "issues" | "parsed"> {
  const parsed = SCHEMA[kind].safeParse(entry);
  return parsed.success
    ? { valid: true, issues: [], parsed: parsed.data }
    : { valid: false, issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`), parsed: null };
}

function nameOf(entry: unknown, fallback: string): string {
  const name = (entry as { name?: unknown } | null)?.name;
  return typeof name === "string" && name.trim() ? name : fallback;
}

function idOf(entry: unknown, fallback: string): string {
  const id = (entry as { id?: unknown } | null)?.id;
  return typeof id === "string" && id ? id : fallback;
}

function reviewFile(kind: string, id: string): ReviewFile | undefined {
  const file = path.join(ROOT, "review", kind, `${id}.json`);
  if (!fs.existsSync(file)) return undefined;
  return readJson(file) as ReviewFile;
}

function load(): Stored[] {
  if (cache) return cache;
  const rows: Stored[] = [];
  for (const spec of FILES) {
    const full = path.join(ROOT, spec.file);
    if (!fs.existsSync(full)) continue;
    let data: unknown;
    try {
      data = readJson(full);
    } catch (err) {
      rows.push({
        kind: spec.kind,
        id: spec.file,
        name: spec.file,
        valid: false,
        issues: [err instanceof Error ? err.message : "bad json"],
        raw: null,
        parsed: null,
        source: "srd",
        edited: false,
      });
      continue;
    }
    for (const entry of (data as { entries?: unknown[] }).entries ?? []) {
      const id = idOf(entry, "unknown");
      rows.push({
        kind: spec.kind,
        id,
        name: nameOf(entry, id),
        ...check(spec.kind, entry),
        raw: entry,
        source: "srd",
        edited: false,
        review: reviewFile(spec.kind, id),
      });
    }
  }
  const queue = path.join(ROOT, "_queue");
  if (fs.existsSync(queue)) {
    for (const name of fs.readdirSync(queue)) {
      if (!name.endsWith(".json")) continue;
      const data = readJson(path.join(queue, name)) as { id?: string; reason?: string; kind?: string };
      const kind = data.kind && isBucket(data.kind) ? data.kind : "spell";
      rows.push({
        kind,
        id: data.id || name,
        name: data.id || name,
        valid: false,
        issues: [data.reason || "queued"],
        raw: data,
        parsed: null,
        source: "queue",
        edited: false,
        review: { status: "needs_review", confidence: "none", unparsedFields: [] },
      });
    }
  }
  const byKey = new Map(rows.map((row) => [`${row.kind}:${row.id}`, row]));
  const custom = accountDb().prepare("SELECT kind, entry_id, body_json FROM content_custom").all() as Array<{
    kind: string;
    entry_id: string;
    body_json: string;
  }>;
  for (const row of custom) {
    if (!isBucket(row.kind)) continue;
    let body: unknown;
    try {
      body = JSON.parse(row.body_json);
    } catch {
      continue;
    }
    const existing = byKey.get(`${row.kind}:${row.entry_id}`);
    const next: Stored = {
      kind: row.kind,
      id: row.entry_id,
      name: nameOf(body, row.entry_id),
      ...check(row.kind, body),
      raw: body,
      source: existing && existing.source !== "custom" ? existing.source : "custom",
      edited: true,
      review: existing?.review,
    };
    if (existing) Object.assign(existing, next);
    else {
      rows.push(next);
      byKey.set(`${row.kind}:${row.entry_id}`, next);
    }
  }
  cache = rows;
  index = byKey;
  return rows;
}

function stored(kind: string, id: string): Stored | undefined {
  load();
  return index?.get(`${kind}:${id}`);
}

export function reloadCatalog(): void {
  cache = null;
  index = null;
}

type Resolution = { status: string; patch: Record<string, unknown>; note: string; updatedAt: string };

function resolutions(): Map<string, Resolution> {
  const rows = accountDb().prepare("SELECT kind, entry_id, status, patch_json, admin_note, updated_at FROM content_resolutions").all() as Array<{
    kind: string;
    entry_id: string;
    status: string;
    patch_json: string;
    admin_note: string;
    updated_at: string;
  }>;
  return new Map(
    rows.map((r) => [
      `${r.kind}:${r.entry_id}`,
      { status: r.status, patch: JSON.parse(r.patch_json) as Record<string, unknown>, note: r.admin_note, updatedAt: r.updated_at },
    ]),
  );
}

function reviewAllowsPlay(status: ReviewStatus): boolean {
  return status === "auto_ok" || status === "resolved" || status === "none";
}

function enabledSet(): Set<string> {
  const rows = accountDb().prepare("SELECT kind, entry_id FROM content_flags WHERE enabled = 1").all() as Array<{
    kind: string;
    entry_id: string;
  }>;
  return new Set(rows.map((row) => `${row.kind}:${row.entry_id}`));
}

function toRow(row: Stored, on: Set<string>, saved: Map<string, Resolution>): CatalogRow {
  const key = `${row.kind}:${row.id}`;
  const enabled = on.has(key);
  const status = (saved.get(key)?.status as ReviewStatus | undefined) || row.review?.status || "none";
  return {
    kind: row.kind,
    id: row.id,
    name: row.name,
    enabled,
    valid: row.valid,
    issues: row.issues,
    reviewStatus: status,
    confidence: row.review?.confidence ?? "none",
    unparsedFields: row.edited ? [] : (row.review?.unparsedFields ?? []),
    usage: row.review?.usage ?? "",
    source: row.source,
    edited: row.edited,
    inPlay: enabled && row.valid && reviewAllowsPlay(status),
    summary: summarize(row.kind, row.raw),
    notModeled: row.review?.notModeled?.length ?? 0,
  };
}

type Loose = Record<string, unknown>;

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function dmg(parts: unknown): string {
  return list<{ dice?: string; damageType?: string }>(parts)
    .map((p) => `${p.dice ?? "?"} ${p.damageType ?? ""}`.trim())
    .join(" + ");
}

function effectShort(e: Loose): string {
  switch (e.kind) {
    case "ac_bonus":
      return `+${String(e.amount)} AC`;
    case "attack_bonus":
      return `+${String(e.amount)} attack`;
    case "damage_bonus":
      return `+${String(e.amount)} damage`;
    case "on_hit_rider":
      return `+${String(e.damage)} ${String(e.damageType)} on hit`;
    case "resistance":
      return `resist ${String(e.damageType)}`;
    case "immunity":
      return `immune ${String(e.damageType)}`;
    case "grant_spell":
      return `casts ${String(e.spellId).replace(/_/g, " ")}`;
    case "grant_feature":
      return `feature ${String(e.featureId)}`;
    case "stat_set":
      return `${String(e.ability).toUpperCase()} ${String(e.score)}`;
    case "stat_increase_cap":
      return `${String(e.ability).toUpperCase()} cap ${String(e.cap)}`;
    default:
      return String(e.kind ?? "?");
  }
}

/** A list cell, not a rules engine: it reads whatever shape the entry has and never throws. */
function summarize(kind: string, raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const e = raw as Loose;
  switch (kind) {
    case "monster": {
      const actions = list<Loose>(e.actions).filter((a) => a.name !== "Multiattack");
      const first = actions.find((a) => a.attack || a.save);
      const lead = first
        ? `${String(first.name)} ${first.attack ? `+${String((first.attack as Loose).bonus)}` : `DC ${String((first.save as Loose).dc)}`} ${dmg(first.damage)}`.trim()
        : "";
      return [`CR ${String(e.cr ?? "?")}`, `AC ${String(e.ac ?? "?")}`, `HP ${String(e.hp ?? "?")}${e.hitDice ? ` (${String(e.hitDice)})` : ""}`, `${actions.length} actions`, lead].filter(Boolean).join(" · ");
    }
    case "spell": {
      const m = (e.mechanics ?? {}) as Loose;
      const save = m.save as Loose | undefined;
      const area = m.area as Loose | undefined;
      return [
        Number(e.level) === 0 ? "Cantrip" : `L${String(e.level)}`,
        m.attack ? `${String(m.attack)} attack` : save ? `${String(save.ability).toUpperCase()} save` : "",
        dmg(m.damage),
        m.heal ? `heals ${String(m.heal)}` : "",
        area ? `${String(area.sizeFt)} ft ${String(area.shape)}` : "",
        e.concentration ? "conc." : "",
      ]
        .filter(Boolean)
        .join(" · ");
    }
    case "item": {
      const weapon = e.weapon as Loose | undefined;
      const armor = e.armor as Loose | undefined;
      return [
        weapon ? `${String(weapon.damage)} ${String(weapon.damageType)}` : "",
        armor ? (armor.category === "shield" ? `+${String(armor.baseAc)} AC` : `AC ${String(armor.baseAc)}${armor.dexCap === null ? " + DEX" : Number(armor.dexCap) > 0 ? ` + DEX (max ${String(armor.dexCap)})` : ""}`) : "",
        ...list<Loose>(e.effects).filter((x) => !(armor?.category === "shield" && x.kind === "ac_bonus")).map(effectShort),
      ]
        .filter(Boolean)
        .join(" · ") || "no typed effects";
    }
    case "class":
      return `d${String(e.hitDie ?? "?")} · saves ${list<string>(e.saves).join("/").toUpperCase()} · ${String(e.caster ?? "none")} caster`;
    case "species":
      return `${String(e.size ?? "")} · ${String(e.speedFt ?? "?")} ft · ${list(e.traits).length} traits`;
    case "background":
      return list<string>(e.skills).join(", ").replace(/_/g, " ");
    case "subclass":
      return `${String(e.classId ?? "")} · from level ${String(e.level ?? "?")}`;
    case "feat":
      return list<string>(e.prerequisites).join("; ") || (e.repeatable ? "repeatable" : "");
    default:
      return "";
  }
}

export function listCatalog(): CatalogRow[] {
  const on = enabledSet();
  const saved = resolutions();
  return load().map((row) => toRow(row, on, saved));
}

function rowFor(kind: string, id: string): CatalogRow {
  const row = stored(kind, id);
  if (!row) throw new Error("BAD_CONTENT");
  return toRow(row, enabledSet(), resolutions());
}

export type CatalogQuery = {
  q?: string;
  kind?: string;
  status?: string;
  enabled?: string;
  valid?: string;
  source?: string;
  gaps?: string;
  sort?: string;
  dir?: string;
  page?: number;
  pageSize?: number;
};

export function queryCatalog(query: CatalogQuery) {
  const all = listCatalog();
  const q = (query.q ?? "").trim().toLowerCase();
  const matches = (row: CatalogRow, skip: "kind" | "status" | null) => {
    if (q && !row.name.toLowerCase().includes(q) && !row.id.includes(q)) return false;
    if (skip !== "kind" && query.kind && row.kind !== query.kind) return false;
    if (skip !== "status" && query.status && row.reviewStatus !== query.status) return false;
    if (query.enabled === "on" && !row.enabled) return false;
    if (query.enabled === "off" && row.enabled) return false;
    if (query.enabled === "in_play" && !row.inPlay) return false;
    if (query.valid === "yes" && !row.valid) return false;
    if (query.valid === "no" && row.valid) return false;
    if (query.source === "edited" && !row.edited) return false;
    if (query.source === "custom" && row.source !== "custom") return false;
    if (query.source === "queue" && row.source !== "queue") return false;
    if (query.gaps === "yes" && !row.notModeled) return false;
    if (query.gaps === "no" && row.notModeled) return false;
    return true;
  };
  const kinds: Record<string, number> = {};
  const statuses: Record<string, number> = {};
  for (const row of all) {
    if (matches(row, "kind")) kinds[row.kind] = (kinds[row.kind] ?? 0) + 1;
    if (matches(row, "status")) statuses[row.reviewStatus] = (statuses[row.reviewStatus] ?? 0) + 1;
  }
  const rows = all.filter((row) => matches(row, null));
  const dir = query.dir === "desc" ? -1 : 1;
  const sorters: Record<string, (a: CatalogRow, b: CatalogRow) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    kind: (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name),
    status: (a, b) => a.reviewStatus.localeCompare(b.reviewStatus) || a.name.localeCompare(b.name),
    enabled: (a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name),
  };
  rows.sort((a, b) => (sorters[query.sort ?? ""] ?? sorters.kind!)(a, b) * dir);
  const pageSize = Math.min(200, Math.max(10, Math.floor(query.pageSize ?? 50)));
  const page = Math.max(1, Math.floor(query.page ?? 1));
  return {
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    total: rows.length,
    page,
    pageSize,
    facets: { kinds, statuses },
    totals: {
      all: all.length,
      inPlay: all.filter((r) => r.inPlay).length,
      needsReview: all.filter((r) => r.reviewStatus === "needs_review").length,
      invalid: all.filter((r) => !r.valid).length,
      edited: all.filter((r) => r.edited).length,
    },
  };
}

export function setContentEnabled(kind: string, id: string, enabled: boolean): CatalogRow {
  const current = rowFor(kind, id);
  if (enabled && !reviewAllowsPlay(current.reviewStatus)) throw new Error("REVIEW_OPEN");
  if (enabled && !current.valid) throw new Error("CONTENT_INVALID");
  accountDb()
    .prepare(
      `INSERT INTO content_flags (kind, entry_id, enabled) VALUES (?, ?, ?)
       ON CONFLICT(kind, entry_id) DO UPDATE SET enabled = excluded.enabled`,
    )
    .run(kind, id, enabled ? 1 : 0);
  return rowFor(kind, id);
}

function inPlay<T>(kind: Bucket): T[] {
  const on = enabledSet();
  const saved = resolutions();
  return load()
    .filter((row) => row.kind === kind && toRow(row, on, saved).inPlay)
    .map((row) => row.parsed as T);
}

export function enabledClasses(): ClassDef[] {
  return inPlay<ClassDef>("class");
}

export function enabledItems(): ItemDef[] {
  return inPlay<ItemDef>("item");
}

export function enabledSpells(): SpellDef[] {
  return inPlay<SpellDef>("spell");
}

export function enabledMonsters(): MonsterDef[] {
  return inPlay<MonsterDef>("monster");
}

export function enabledById<T>(kind: Bucket, id: string): T | undefined {
  const row = stored(kind, id);
  if (!row) return undefined;
  return toRow(row, enabledSet(), resolutions()).inPlay ? (row.parsed as T) : undefined;
}

export function xpThresholds(): number[] {
  const file = path.join(ROOT, "xp-table.json");
  const parsed = xpTable.safeParse(readJson(file));
  if (!parsed.success) return [0];
  return parsed.data.levels;
}

export function contentDetail(kind: string, id: string): Record<string, unknown> {
  const row = rowFor(kind, id);
  const entry = stored(kind, id)!;
  const saved = resolutions().get(`${kind}:${id}`);
  const original = entry.edited && entry.source === "srd" ? srdOriginal(kind, id) : null;
  return {
    ...row,
    game: entry.raw ?? null,
    original,
    srd: entry.review?.srd ?? {},
    notModeledRules: entry.review?.notModeled ?? [],
    ambiguities: entry.review?.ambiguities ?? [],
    parsedUnparsedFields: entry.review?.unparsedFields ?? [],
    adminNote: saved?.note ?? entry.review?.adminNote ?? "",
    reviewedAt: saved?.updatedAt ?? null,
    fileStatus: entry.review?.status ?? "none",
  };
}

function srdOriginal(kind: string, id: string): unknown {
  for (const spec of FILES) {
    if (spec.kind !== kind) continue;
    const full = path.join(ROOT, spec.file);
    if (!fs.existsSync(full)) continue;
    const found = ((readJson(full) as { entries?: unknown[] }).entries ?? []).find((e) => idOf(e, "") === id);
    if (found) return found;
  }
  return null;
}

/** Approve (resolved), reject, or apply one of the parser's options as an edit and approve. */
export function resolveContent(
  kind: string,
  id: string,
  input: { optionIndex?: number; patch?: Record<string, unknown>; adminNote?: string; reject?: boolean },
): CatalogRow {
  const entry = stored(kind, id);
  if (!entry) throw new Error("BAD_CONTENT");
  const option = entry.review?.ambiguities?.[input.optionIndex ?? -1] as { options?: Array<{ patch?: Record<string, unknown> }>; patch?: Record<string, unknown> } | undefined;
  const patch = input.patch ?? option?.options?.[0]?.patch ?? option?.patch ?? {};
  if (Object.keys(patch).length && !input.reject) {
    saveCustomEntry(kind, id, { ...(entry.raw as Record<string, unknown>), ...patch });
  }
  const status = input.reject ? "rejected" : "resolved";
  accountDb()
    .prepare(
      `INSERT INTO content_resolutions (kind, entry_id, status, patch_json, admin_note, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(kind, entry_id) DO UPDATE SET status = excluded.status, patch_json = excluded.patch_json, admin_note = excluded.admin_note, updated_at = excluded.updated_at`,
    )
    .run(kind, id, status, JSON.stringify(patch), input.adminNote ?? "", new Date().toISOString());
  if (input.reject) {
    accountDb().prepare("UPDATE content_flags SET enabled = 0 WHERE kind = ? AND entry_id = ?").run(kind, id);
  }
  return rowFor(kind, id);
}

/** Drops the admin decision; the entry goes back to what the parser said. Disables it if that blocks play. */
export function reopenContent(kind: string, id: string): CatalogRow {
  rowFor(kind, id);
  accountDb().prepare("DELETE FROM content_resolutions WHERE kind = ? AND entry_id = ?").run(kind, id);
  const row = rowFor(kind, id);
  if (row.enabled && !reviewAllowsPlay(row.reviewStatus)) return setContentEnabled(kind, id, false);
  return row;
}

/** Writes the admin's version of an entry. Invalid JSON for the schema is saved but stays out of play. */
export function saveCustomEntry(kind: string, id: string, body: unknown): CatalogRow {
  if (!isBucket(kind)) throw new Error("BAD_CONTENT_KIND");
  if (!/^[a-z0-9_]{2,64}$/.test(id)) throw new Error("BAD_CONTENT_ID");
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("BAD_CONTENT_BODY");
  const entry = { ...(body as Record<string, unknown>), id };
  accountDb()
    .prepare(
      `INSERT INTO content_custom (kind, entry_id, body_json) VALUES (?, ?, ?)
       ON CONFLICT(kind, entry_id) DO UPDATE SET body_json = excluded.body_json`,
    )
    .run(kind, id, JSON.stringify(entry));
  reloadCatalog();
  const row = rowFor(kind, id);
  if (row.enabled && !row.valid) return setContentEnabled(kind, id, false);
  return row;
}

/** Removes the admin edit. A parsed entry goes back to the SRD version; a custom one is gone. */
export function revertContent(kind: string, id: string): CatalogRow | null {
  const before = stored(kind, id);
  if (!before?.edited) throw new Error("NOT_EDITED");
  accountDb().prepare("DELETE FROM content_custom WHERE kind = ? AND entry_id = ?").run(kind, id);
  reloadCatalog();
  if (!stored(kind, id)) {
    accountDb().prepare("DELETE FROM content_flags WHERE kind = ? AND entry_id = ?").run(kind, id);
    accountDb().prepare("DELETE FROM content_resolutions WHERE kind = ? AND entry_id = ?").run(kind, id);
    return null;
  }
  return rowFor(kind, id);
}

/** A valid entry of the same kind with the name cleared, so a new entry starts schema-shaped. */
export function contentTemplate(kind: string): Record<string, unknown> {
  if (!isBucket(kind)) throw new Error("BAD_CONTENT_KIND");
  const sample = load().find((row) => row.kind === kind && row.valid && row.source === "srd")?.raw as Record<string, unknown> | undefined;
  const { id: _id, ...rest } = sample ?? {};
  return { ...rest, name: "" };
}

export function playbook(): Array<{ id: string; done: boolean }> {
  const steps = ["classes", "subclasses", "feats", "spells"];
  const rows = accountDb().prepare("SELECT step_id, done FROM content_playbook").all() as Array<{ step_id: string; done: number }>;
  const done = new Map(rows.map((row) => [row.step_id, row.done === 1]));
  return steps.map((id) => ({ id, done: done.get(id) ?? false }));
}

export function setPlaybook(stepId: string, done: boolean): void {
  accountDb()
    .prepare(
      `INSERT INTO content_playbook (step_id, done, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(step_id) DO UPDATE SET done = excluded.done, updated_at = excluded.updated_at`,
    )
    .run(stepId, done ? 1 : 0, new Date().toISOString());
}

export function savePending(id: string, body: unknown): void {
  const queue = path.join(ROOT, "_queue");
  fs.mkdirSync(queue, { recursive: true });
  fs.writeFileSync(path.join(queue, `${id}.pending.json`), `${JSON.stringify(body, null, 2)}\n`);
  reloadCatalog();
}
