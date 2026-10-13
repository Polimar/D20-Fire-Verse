/**
 * SRD 5.2.1 files on disk. Nothing is in play until an admin enables it.
 * A file Zod rejects is listed and skipped; it does not stop the table.
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

export type CatalogRow = {
  kind: string;
  id: string;
  name: string;
  enabled: boolean;
  valid: boolean;
  issues: string[];
  inPlay: boolean;
  reviewStatus: "auto_ok" | "needs_review" | "resolved" | "rejected" | "none";
  confidence: "high" | "medium" | "low" | "none";
  unparsedFields: string[];
  usage: string;
};

type Bucket = "class" | "subclass" | "species" | "background" | "spell" | "feat" | "item" | "monster";

const FILES: Array<{ file: string; kind: Bucket; schema: ZodTypeAny }> = [
  { file: "classes.json", kind: "class", schema: classDef },
  { file: "subclasses.json", kind: "subclass", schema: subclassDef },
  { file: "species.json", kind: "species", schema: speciesDef },
  { file: "backgrounds.json", kind: "background", schema: backgroundDef },
  { file: "spells.json", kind: "spell", schema: spellDef },
  { file: "feats.json", kind: "feat", schema: featDef },
  { file: "items/gear.json", kind: "item", schema: itemDef },
  { file: "items/magic.json", kind: "item", schema: itemDef },
  { file: "monsters.json", kind: "monster", schema: monsterDef },
];

type Stored = { kind: Bucket; id: string; name: string; valid: boolean; issues: string[]; raw: unknown };

let cache: Stored[] | null = null;

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
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
      });
      continue;
    }
    const entries = (data as { entries?: unknown[] }).entries ?? [];
    for (const entry of entries) {
      const parsed = spec.schema.safeParse(entry);
      const id = typeof (entry as { id?: string }).id === "string" ? (entry as { id: string }).id : "unknown";
      const name = typeof (entry as { name?: string }).name === "string" ? (entry as { name: string }).name : id;
      rows.push({
        kind: spec.kind,
        id,
        name,
        valid: parsed.success,
        issues: parsed.success ? [] : parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
        raw: parsed.success ? parsed.data : entry,
      });
    }
  }
  const review = path.join(ROOT, "review");
  if (fs.existsSync(review)) {
    for (const name of fs.readdirSync(review)) {
      if (!name.endsWith(".json")) continue;
      const data = readJson(path.join(review, name)) as { kind?: string; entry?: unknown };
      const schema = FILES.find((spec) => spec.kind === data.kind)?.schema;
      const entry = data.entry ?? {};
      const id = typeof (entry as { id?: string }).id === "string" ? (entry as { id: string }).id : name;
      const parsed = schema ? schema.safeParse(entry) : { success: false as const, error: { issues: [{ path: [], message: "unknown kind" }] } };
      rows.push({
        kind: (data.kind as Bucket) || "spell",
        id,
        name: typeof (entry as { name?: string }).name === "string" ? (entry as { name: string }).name : id,
        valid: parsed.success,
        issues: parsed.success ? [] : parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
        raw: entry,
      });
    }
  }
  const queue = path.join(ROOT, "_queue");
  if (fs.existsSync(queue)) {
    for (const name of fs.readdirSync(queue)) {
      if (!name.endsWith(".json")) continue;
      const data = readJson(path.join(queue, name)) as { id?: string; reason?: string; kind?: string };
      rows.push({
        kind: (data.kind as Bucket) || "spell",
        id: data.id || name,
        name: data.id || name,
        valid: false,
        issues: [data.reason || "queued"],
        raw: data,
      });
    }
  }
  cache = rows;
  return rows;
}

export function reloadCatalog(): void {
  cache = null;
}

type ReviewFile = {
  status?: CatalogRow["reviewStatus"];
  confidence?: CatalogRow["confidence"];
  unparsedFields?: string[];
  usage?: string;
  srd?: Record<string, unknown>;
  ambiguities?: unknown[];
  adminNote?: string;
};

function reviewFile(kind: string, id: string): ReviewFile | undefined {
  const file = path.join(ROOT, "review", kind, `${id}.json`);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, "utf8")) as ReviewFile;
}

function resolution(kind: string, id: string): { status: string; patch: Record<string, unknown>; note: string } | undefined {
  const row = accountDb()
    .prepare("SELECT status, patch_json, admin_note FROM content_resolutions WHERE kind = ? AND entry_id = ?")
    .get(kind, id) as { status: string; patch_json: string; admin_note: string } | undefined;
  if (!row) return undefined;
  return { status: row.status, patch: JSON.parse(row.patch_json) as Record<string, unknown>, note: row.admin_note };
}

function reviewOf(kind: string, id: string): Pick<CatalogRow, "reviewStatus" | "confidence" | "unparsedFields" | "usage"> {
  const file = reviewFile(kind, id);
  const saved = resolution(kind, id);
  const status = (saved?.status as CatalogRow["reviewStatus"]) || file?.status || "none";
  return {
    reviewStatus: status,
    confidence: file?.confidence ?? "none",
    unparsedFields: file?.unparsedFields ?? [],
    usage: file?.usage ?? "",
  };
}

function reviewAllowsPlay(status: CatalogRow["reviewStatus"]): boolean {
  return status === "auto_ok" || status === "resolved" || status === "none";
}

function enabledSet(): Set<string> {
  const rows = accountDb().prepare("SELECT kind, entry_id, enabled FROM content_flags").all() as Array<{
    kind: string;
    entry_id: string;
    enabled: number;
  }>;
  return new Set(rows.filter((row) => row.enabled === 1).map((row) => `${row.kind}:${row.entry_id}`));
}

export function listCatalog(): CatalogRow[] {
  const on = enabledSet();
  return load().map((row) => {
    const enabled = on.has(`${row.kind}:${row.id}`);
    const review = reviewOf(row.kind, row.id);
    return {
      kind: row.kind,
      id: row.id,
      name: row.name,
      enabled,
      valid: row.valid,
      issues: row.issues,
      ...review,
      inPlay: enabled && row.valid && reviewAllowsPlay(review.reviewStatus),
    };
  });
}

export function setContentEnabled(kind: string, id: string, enabled: boolean): CatalogRow {
  if (enabled && !reviewAllowsPlay(reviewOf(kind, id).reviewStatus)) throw new Error("REVIEW_OPEN");
  accountDb()
    .prepare(
      `INSERT INTO content_flags (kind, entry_id, enabled) VALUES (?, ?, ?)
       ON CONFLICT(kind, entry_id) DO UPDATE SET enabled = excluded.enabled`,
    )
    .run(kind, id, enabled ? 1 : 0);
  const row = listCatalog().find((entry) => entry.kind === kind && entry.id === id);
  if (!row) throw new Error("BAD_CONTENT");
  return row;
}

function inPlay<T>(kind: Bucket): T[] {
  const allowed = new Set(listCatalog().filter((row) => row.kind === kind && row.inPlay).map((row) => row.id));
  return load()
    .filter((row) => row.kind === kind && allowed.has(row.id))
    .map((row) => row.raw as T);
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
  return inPlay<T>(kind).find((row) => (row as { id: string }).id === id);
}

export function xpThresholds(): number[] {
  const file = path.join(ROOT, "xp-table.json");
  const parsed = xpTable.safeParse(readJson(file));
  if (!parsed.success) return [0];
  return parsed.data.levels;
}

export function contentDetail(kind: string, id: string): Record<string, unknown> {
  const row = listCatalog().find((entry) => entry.kind === kind && entry.id === id);
  if (!row) throw new Error("BAD_CONTENT");
  const stored = load().find((entry) => entry.kind === kind && entry.id === id);
  const file = reviewFile(kind, id);
  const saved = resolution(kind, id);
  return {
    ...row,
    game: stored?.raw ?? null,
    srd: file?.srd ?? {},
    ambiguities: file?.ambiguities ?? [],
    adminNote: saved?.note ?? file?.adminNote ?? "",
    patch: saved?.patch ?? {},
  };
}

export function resolveContent(kind: string, id: string, input: { optionIndex?: number; patch?: Record<string, unknown>; adminNote?: string; reject?: boolean }): CatalogRow {
  const file = reviewFile(kind, id);
  const option = file?.ambiguities?.[input.optionIndex ?? -1] as { patch?: Record<string, unknown> } | undefined;
  const patch = input.patch ?? option?.patch ?? {};
  const status = input.reject ? "rejected" : "resolved";
  accountDb()
    .prepare(
      `INSERT INTO content_resolutions (kind, entry_id, status, patch_json, admin_note, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(kind, entry_id) DO UPDATE SET status = excluded.status, patch_json = excluded.patch_json, admin_note = excluded.admin_note, updated_at = excluded.updated_at`,
    )
    .run(kind, id, status, JSON.stringify(patch), input.adminNote ?? "", new Date().toISOString());
  reloadCatalog();
  const row = listCatalog().find((entry) => entry.kind === kind && entry.id === id);
  if (!row) throw new Error("BAD_CONTENT");
  return row;
}

export function saveCustomEntry(kind: string, id: string, body: unknown): void {
  accountDb()
    .prepare(
      `INSERT INTO content_custom (kind, entry_id, body_json) VALUES (?, ?, ?)
       ON CONFLICT(kind, entry_id) DO UPDATE SET body_json = excluded.body_json`,
    )
    .run(kind, id, JSON.stringify(body));
  reloadCatalog();
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
