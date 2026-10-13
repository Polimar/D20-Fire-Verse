/**
 * Text and dice helpers shared by every SRD 5.2.1 parser.
 * The vendored markdown mixes HTML tables, <br>, and &emsp; indents; this turns it into readable markdown.
 */

export type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";
export type DamagePart = { dice: string; damageType: string; average?: number };

export const DAMAGE_TYPES = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
] as const;

export const CONDITIONS = [
  "blinded",
  "charmed",
  "deafened",
  "exhaustion",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
] as const;

const ABILITY_WORDS: Record<string, Ability> = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
};

export function abilityFromWord(word: string): Ability | undefined {
  return ABILITY_WORDS[word.toLowerCase()];
}

export function slug(name: string): string {
  return name.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 64);
}

function decode(text: string): string {
  return text
    .replace(/&emsp;|&ensp;|&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function cellText(html: string): string {
  return decode(html.replace(/<br\s*\/?>/gi, " ").replace(/<\/?(strong|b)>/gi, "**").replace(/<\/?(em|i)>/gi, "_").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function tableToPipes(table: string): string {
  const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((row) =>
    [...row[0].matchAll(/<t[dh]([^>]*)>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cellText(cell[2] ?? "")),
  );
  const width = Math.max(0, ...rows.map((row) => row.length));
  if (!width) return "";
  const lines = rows
    .filter((row) => row.some((cell) => cell))
    .map((row) => `| ${[...row, ...Array(width - row.length).fill("")].join(" | ")} |`);
  if (lines.length > 1) lines.splice(1, 0, `| ${Array(width).fill("---").join(" | ")} |`);
  return lines.join("\n");
}

/** Readable markdown: pipe tables, real line breaks, no HTML. */
export function plainMarkdown(body: string): string {
  return decode(
    body
      .replace(/<table[\s\S]*?<\/table>/gi, (table) => `\n${tableToPipes(table)}\n`)
      .replace(/<hr\s*\/?>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?(div|span|p)[^>]*>/gi, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Prose without markdown marks, for regex work. */
export function flat(text: string): string {
  return plainMarkdown(text).replace(/\*\*|__?/g, "").replace(/\s+/g, " ").trim();
}

export function cleanDice(raw: string): string {
  return raw.replace(/[−–]/g, "-").replace(/\s+/g, "");
}

export function signed(raw: string): number {
  const n = Number(raw.replace(/[−–]/g, "-").replace(/\s+/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function isDamageType(word: string): boolean {
  return (DAMAGE_TYPES as readonly string[]).includes(word.toLowerCase());
}

/**
 * Every "N (XdY + Z) Type damage" or bare "XdY Type damage" in the text, in order.
 * Flat hits such as "1 Piercing damage" become dice "1".
 */
export function damageParts(text: string): DamagePart[] {
  const source = flat(text);
  const parts: DamagePart[] = [];
  const seen = new Set<number>();
  const withAverage = /(\d+)\s*\((\d+d\d+(?:\s*[+−–-]\s*\d+)?)\)\s+([A-Za-z]+)\s+damage/g;
  for (const m of source.matchAll(withAverage)) {
    if (!isDamageType(m[3]!)) continue;
    parts.push({ dice: cleanDice(m[2]!), damageType: m[3]!.toLowerCase(), average: Number(m[1]) });
    for (let i = m.index!; i < m.index! + m[0].length; i += 1) seen.add(i);
  }
  const bare = /(\d+d\d+(?:\s*[+−–-]\s*\d+)?)\s+([A-Za-z]+)\s+damage/g;
  for (const m of source.matchAll(bare)) {
    if (seen.has(m.index!) || !isDamageType(m[2]!)) continue;
    parts.push({ dice: cleanDice(m[1]!), damageType: m[2]!.toLowerCase() });
  }
  const flatHit = /Hit:\s*(\d+)\s+([A-Za-z]+)\s+damage/g;
  for (const m of source.matchAll(flatHit)) {
    if (!isDamageType(m[2]!)) continue;
    parts.push({ dice: m[1]!, damageType: m[2]!.toLowerCase(), average: Number(m[1]) });
  }
  return parts;
}

export function conditionsIn(text: string): string[] {
  const source = flat(text).toLowerCase();
  return CONDITIONS.filter((c) => new RegExp(`\\b(?:the|is|has the|have the|gains? the)\\s+${c}\\s+condition`).test(source));
}

export function areaIn(text: string): { shape: "sphere" | "cone" | "cube" | "line" | "cylinder" | "emanation"; sizeFt: number } | undefined {
  const m = flat(text).match(/(\d+)-foot(?:-(?:radius|long|wide|tall|high))?(?:,?\s*\d+-foot-(?:wide|tall|high))?\s+(Sphere|Cone|Cube|Line|Cylinder|Emanation)/i);
  if (!m) return undefined;
  return { shape: m[2]!.toLowerCase() as "sphere", sizeFt: Number(m[1]) };
}

export function goldFromCost(cost: string | undefined): number | undefined {
  const m = cost?.replace(/,/g, "").match(/(\d+)\s*(GP|SP|CP|EP|PP)/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  switch (m[2]!.toUpperCase()) {
    case "PP":
      return n * 10;
    case "GP":
      return n;
    case "EP":
      return Math.ceil(n / 2);
    case "SP":
      return Math.ceil(n / 10);
    default:
      return Math.ceil(n / 100);
  }
}
