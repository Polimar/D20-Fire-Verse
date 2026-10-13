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
    return {
      kind: row.kind,
      id: row.id,
      name: row.name,
      enabled,
      valid: row.valid,
      issues: row.issues,
      inPlay: enabled && row.valid,
    };
  });
}

export function setContentEnabled(kind: string, id: string, enabled: boolean): CatalogRow {
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
  const on = enabledSet();
  return load()
    .filter((row) => row.kind === kind && row.valid && on.has(`${kind}:${row.id}`))
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

export function savePending(id: string, body: unknown): void {
  const queue = path.join(ROOT, "_queue");
  fs.mkdirSync(queue, { recursive: true });
  fs.writeFileSync(path.join(queue, `${id}.pending.json`), `${JSON.stringify(body, null, 2)}\n`);
  reloadCatalog();
}
