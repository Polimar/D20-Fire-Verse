import { crValue, runStrategies, slug, type PartialEntry } from "./strategies.js";

export type ParsedMonster = {
  id: string;
  name: string;
  size: string;
  creatureType: string;
  alignment: string;
  ac: number;
  hp: number;
  cr: string;
  crValue: number;
  xp: number;
  actions?: string[];
};

export type PendingMonster = {
  id: string;
  kind: "monster";
  reason: string;
  _raw_md: string;
  partial?: Record<string, unknown>;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function monsterFromMarkdown(markdown: string): { monster?: ParsedMonster; pending?: PendingMonster; tried: string[] } {
  const { partial, tried } = runStrategies(markdown);
  const name = asString(partial.name);
  const cr = asString(partial.cr);
  const hp = asNumber(partial.hp);
  const ac = asNumber(partial.ac);
  const id = slug(name || "unknown");
  if (!name || !cr || hp == null || ac == null) {
    const missing = [!name ? "name" : "", !cr ? "cr" : "", hp == null ? "hp" : "", ac == null ? "ac" : ""].filter(Boolean);
    return {
      tried,
      pending: {
        id: id || "unknown",
        kind: "monster",
        reason: `Missing ${missing.join(", ")} after 10 strategies.`,
        _raw_md: markdown.slice(0, 4000),
        partial: partial as PartialEntry,
      },
    };
  }
  const typeLine = asString(partial.alignment) ?? "Unaligned";
  const size = asString(partial.size) ?? "Medium";
  const creatureType = asString(partial.creatureType) ?? "Unknown";
  return {
    tried,
    monster: {
      id,
      name,
      size,
      creatureType,
      alignment: typeLine,
      ac,
      hp,
      cr,
      crValue: crValue(cr),
      xp: asNumber(partial.xp) ?? 0,
    },
  };
}

export function splitMonsterMarkdown(source: string): string[] {
  const body = source.replace(/^# .+\n+/, "");
  return body
    .split(/\n(?=## )/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith("## "));
}
