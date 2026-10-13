/**
 * Ten extraction strategies. Every entry tries all of them.
 * Whatever is still missing after the tenth goes to the admin queue.
 */

export type PartialEntry = Record<string, unknown>;

export type Strategy = {
  id: string;
  run: (markdown: string) => PartialEntry;
};

const first = (markdown: string, re: RegExp): string | undefined => {
  const m = markdown.match(re);
  return m?.[1]?.trim();
};

export const STRATEGIES: Strategy[] = [
  {
    id: "heading",
    run: (markdown) => {
      const title = first(markdown, /^#{2,3}\s+(.+)$/m);
      return title ? { name: title.replace(/\s+/g, " ") } : {};
    },
  },
  {
    id: "type_line",
    run: (markdown) => {
      const line = first(markdown, /^_([^_\n]+)_/m);
      if (!line) return {};
      const [left, align] = line.split(",").map((p) => p.trim());
      const bits = (left ?? "").split(/\s+/);
      const size = bits[0];
      const type = bits.slice(1).join(" ");
      return {
        ...(size ? { size } : {}),
        ...(type ? { creatureType: type } : {}),
        ...(align ? { alignment: align } : {}),
      };
    },
  },
  {
    id: "bold_stats",
    run: (markdown) => {
      const ac = first(markdown, /\*\*AC\*\*\s+(\d+)/);
      const hp = first(markdown, /\*\*HP\*\*\s+(\d+)/);
      const cr = first(markdown, /\*\*CR\*\*\s+([0-9/]+)/);
      const xp = first(markdown, /\(XP\s+([\d,]+)/);
      const out: PartialEntry = {};
      if (ac) out.ac = Number(ac);
      if (hp) out.hp = Number(hp);
      if (cr) out.cr = cr;
      if (xp) out.xp = Number(xp.replace(/,/g, ""));
      return out;
    },
  },
  {
    id: "ability_grid",
    run: (markdown) => {
      const scores: Record<string, number> = {};
      for (const key of ["STR", "DEX", "CON", "INT", "WIS", "CHA"]) {
        const n = first(markdown, new RegExp(`${key}\\s*\\n+\\s*(\\d+)`));
        if (n) scores[key.toLowerCase()] = Number(n);
      }
      return Object.keys(scores).length ? { abilities: scores } : {};
    },
  },
  {
    id: "trait_blocks",
    run: (markdown) => {
      const names = [...markdown.matchAll(/\*\*_([^_]+)\._\*\*/g)].map((m) => m[1]?.trim()).filter(Boolean);
      return names.length ? { traits: names } : {};
    },
  },
  {
    id: "markdown_table",
    run: (markdown) => {
      const rows = markdown
        .split("\n")
        .filter((line) => line.trim().startsWith("|") && !/^\|\s*-+/.test(line.trim()))
        .map((line) => line.split("|").map((cell) => cell.trim()).filter(Boolean));
      return rows.length ? { table: rows } : {};
    },
  },
  {
    id: "inline_pairs",
    run: (markdown) => {
      const skills = first(markdown, /\*\*Skills\*\*\s+([^\n]+)/);
      const senses = first(markdown, /\*\*Senses\*\*\s+([^\n]+)/);
      const out: PartialEntry = {};
      if (skills) out.skills = skills;
      if (senses) out.senses = senses;
      return out;
    },
  },
  {
    id: "frontmatter",
    run: (markdown) => {
      const block = markdown.match(/^---\n([\s\S]*?)\n---/);
      if (!block?.[1]) return {};
      const fields: Record<string, string> = {};
      for (const line of block[1].split("\n")) {
        const idx = line.indexOf(":");
        if (idx < 1) continue;
        fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
      return Object.keys(fields).length ? { frontmatter: fields } : {};
    },
  },
  {
    id: "spell_line",
    run: (markdown) => {
      const line = first(markdown, /^_(\d(?:st|nd|rd|th)-level [^_\n]+|cantrip[^_\n]*)_/im);
      return line ? { spellLine: line } : {};
    },
  },
  {
    id: "prose_fallback",
    run: (markdown) => {
      const para = markdown
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith("#") && !line.startsWith("|") && !line.startsWith("**") && !line.startsWith("_"));
      return para ? { prose: para.slice(0, 280) } : {};
    },
  },
];

if (STRATEGIES.length !== 10) {
  throw new Error(`Expected 10 extraction strategies, found ${STRATEGIES.length}`);
}

export function runStrategies(markdown: string): { partial: PartialEntry; tried: string[] } {
  const partial: PartialEntry = {};
  const tried: string[] = [];
  for (const strategy of STRATEGIES) {
    tried.push(strategy.id);
    Object.assign(partial, strategy.run(markdown));
  }
  return { partial, tried };
}

export function crValue(cr: string): number {
  if (cr.includes("/")) {
    const [num, den] = cr.split("/").map(Number);
    if (!den) return 0;
    return (num ?? 0) / den;
  }
  const n = Number(cr);
  return Number.isFinite(n) ? n : 0;
}

export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64);
}
