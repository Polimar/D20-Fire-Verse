/**
 * One-shot import from vendored downfallx markdown into content/srd-5.2.1.
 * Does not read or write content_flags / content_resolutions.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ItemDef, MonsterAction, MonsterDef, SpellDef } from "@d20-fireverse/content-schema";
import { loadSrdCatalog, srdMonsterId } from "../../../backend/src/local/srd-monsters.js";
import { parseArmor, parseMagicItems, parseWeapons, type ParsedItem } from "./parse-items.js";
import { parseMonsterBlock, splitMonsterMarkdown } from "./parse-monsters.js";
import { parseSpellChunk } from "./parse-spells.js";
import { plainMarkdown } from "./srd-text.js";

type EngineMonster = { actions: string[]; bonusActions?: string[]; legendaryActions?: string[]; multiattack?: string[]; traits?: string[] };

type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";

export type ReviewBundle = {
  kind: string;
  id: string;
  status: "auto_ok" | "needs_review" | "resolved" | "rejected";
  confidence: "high" | "medium" | "low";
  unparsedFields: string[];
  usage: string;
  srd?: Record<string, unknown>;
  notModeled?: string[];
  ambiguities: Array<{ field: string; summary: string; options: Array<{ label: string; patch: Record<string, unknown> }>; parserChoice?: number }>;
};

const USAGE: Record<string, string> = {
  spell: "Level-up spell list for the listed classes. Combat runs it only when a wired ability has the same id.",
  class: "Chargen and level-up: hit die, saves, skills, multiclass gates, spell slots.",
  subclass: "Chosen at the subclass level. Feature names are sheet labels until combat wires them.",
  species: "Chargen species. Unparsed trait numbers count as 0 until you fill them in the wizard.",
  background: "Chargen background. Grants the listed skills.",
  feat: "Chosen at an ASI level or as an Epic Boon when the class table says so.",
  item: "Vendor, loot, and stash. Account heroes carry its typed effects into fights while it is equipped (and attuned, when required).",
  monster: "Arena PvE foe once enabled. The engine runs the actions it can compile from the stat block; campaign encounters use their own copies.",
};

/** Long class chapters stay readable in the drawer; the vendored markdown keeps the rest. */
const TEXT_CAP = 60000;

const ABILITIES: Record<string, Ability> = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
};

function slug(name: string): string {
  return name.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 64);
}

function strip(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function cellsOf(tr: string): string[] {
  const out: string[] = [];
  for (const match of tr.matchAll(/<t[dh]([^>]*)>([\s\S]*?)<\/t[dh]>/gi)) {
    const colspan = Number(/colspan="(\d+)"/i.exec(match[1] ?? "")?.[1] ?? 1);
    const text = strip(match[2] ?? "");
    for (let i = 0; i < colspan; i += 1) out.push(i === 0 ? text : "");
  }
  return out;
}

function tables(html: string): string[][][] {
  return [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map((table) =>
    [...table[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((row) => cellsOf(row[0])),
  );
}

function chunks(markdown: string, level: number): Array<{ title: string; body: string }> {
  const mark = `${"#".repeat(level)} `;
  const parts = markdown.split(new RegExp(`\\n(?=${mark.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`));
  const out: Array<{ title: string; body: string }> = [];
  for (const part of parts) {
    const lines = part.trim().split("\n");
    if (!lines[0]?.startsWith(mark)) continue;
    out.push({ title: lines[0].slice(mark.length).trim(), body: lines.slice(1).join("\n") });
  }
  return out;
}

function num(text: string | undefined): number | undefined {
  if (!text || text === "—" || text === "-") return undefined;
  const n = Number(text.replace(/^\+/, ""));
  return Number.isFinite(n) ? n : undefined;
}

function abilitiesIn(text: string): Ability[] {
  const found: Ability[] = [];
  for (const [word, key] of Object.entries(ABILITIES)) {
    if (text.toLowerCase().includes(word)) found.push(key);
  }
  return found;
}

function skillId(label: string): string {
  return slug(label);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const srd = path.join(root, "content", "srd");
const out = path.join(root, "content", "srd-5.2.1");

function read(name: string): string {
  return fs.readFileSync(path.join(srd, name), "utf8");
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

export function importCatalog(): { report: Record<string, number> } {
  const reviews: ReviewBundle[] = [];
  const classes = parseClasses(read("classes.md"), reviews);
  const spells = parseSpells(read("spells.md"), reviews);
  const knownSpells = new Set(spells.map((spell) => spell.id));
  const { species, backgrounds } = parseOrigins(read("character-origins.md"), reviews);
  const feats = parseFeats(read("feats.md"), reviews);
  const gear = parseGear(read("equipment.md"), reviews);
  const magic = parseMagic(read("magic-items.md"), knownSpells, gear, reviews);
  const monsters = parseMonsters(read("monsters-A-Z.md"), reviews);

  writeJson(path.join(out, "classes.json"), { entries: classes.classes });
  writeJson(path.join(out, "subclasses.json"), { entries: classes.subclasses });
  writeJson(path.join(out, "spells.json"), { entries: spells });
  writeJson(path.join(out, "species.json"), { entries: species });
  writeJson(path.join(out, "backgrounds.json"), { entries: backgrounds });
  writeJson(path.join(out, "feats.json"), { entries: feats });
  writeJson(path.join(out, "items", "gear.json"), { entries: gear });
  writeJson(path.join(out, "items", "magic.json"), { entries: magic });
  writeJson(path.join(out, "monsters.json"), { entries: monsters });

  const reviewRoot = path.join(out, "review");
  fs.rmSync(reviewRoot, { recursive: true, force: true });
  for (const bundle of reviews) {
    writeJson(path.join(reviewRoot, bundle.kind, `${bundle.id}.json`), bundle);
  }
  const sha = fs.readFileSync(path.join(srd, "VENDOR_SHA"), "utf8").trim();
  const report = {
    classes: classes.classes.length,
    subclasses: classes.subclasses.length,
    spells: spells.length,
    species: species.length,
    backgrounds: backgrounds.length,
    feats: feats.length,
    gear: gear.length,
    magic: magic.length,
    monsters: monsters.length,
    needsReview: reviews.filter((row) => row.status === "needs_review").length,
    notModeled: reviews.filter((row) => row.notModeled?.length).length,
  };
  writeJson(path.join(out, "import-report.json"), { sha, ...report });
  return { report };
}

function bundle(partial: Omit<ReviewBundle, "ambiguities" | "unparsedFields"> & { ambiguities?: ReviewBundle["ambiguities"]; unparsedFields?: string[] }): ReviewBundle {
  return { ambiguities: [], unparsedFields: [], ...partial };
}

function parseSpells(markdown: string, reviews: ReviewBundle[]): SpellDef[] {
  const section = markdown.slice(markdown.indexOf("## Spell Descriptions"));
  const spellLine = /^_[^_\n]*(Level \d+|Cantrip)[^_\n]*_/im;
  const spellChunks: Array<{ title: string; body: string }> = [];
  for (const chunk of chunks(section, 4)) {
    const last = spellChunks.at(-1);
    // Summon stat blocks carry their own "#### Traits" / "#### Actions" headings.
    if (last && !spellLine.test(chunk.body)) last.body += `\n\n**${chunk.title}.**\n${chunk.body}`;
    else spellChunks.push({ ...chunk });
  }
  const entries: SpellDef[] = [];
  for (const chunk of spellChunks) {
    const parsed = parseSpellChunk(chunk.title, chunk.body);
    entries.push(parsed.spell);
    reviews.push(bundle({
      kind: "spell",
      id: parsed.spell.id,
      status: parsed.missing.length ? "needs_review" : "auto_ok",
      confidence: parsed.missing.length ? "low" : "high",
      unparsedFields: parsed.missing,
      usage: USAGE.spell,
      srd: { line: parsed.line, text: parsed.text },
    }));
  }
  return entries;
}

export function itemReview(parsed: ParsedItem): ReviewBundle {
  const { item } = parsed;
  const noEffects = item.effects.length === 0 && parsed.mechanical > 0 && !item.weapon && !item.armor;
  const open = noEffects || parsed.notModeled.length > 0 || parsed.ambiguities.length > 0;
  return bundle({
    kind: "item",
    id: item.id,
    status: open ? "needs_review" : "auto_ok",
    confidence: !open ? "high" : item.effects.length || item.weapon || item.armor ? "medium" : "low",
    unparsedFields: noEffects ? ["effects"] : [],
    usage: USAGE.item,
    srd: { line: parsed.line, text: parsed.text.slice(0, TEXT_CAP) },
    ...(parsed.notModeled.length ? { notModeled: parsed.notModeled } : {}),
    ambiguities: parsed.ambiguities.length
      ? parsed.ambiguities
      : noEffects
        ? [{
            field: "effects",
            summary: "No typed effect matches this item. The rules listed under Not modeled stay text only.",
            options: [{ label: "Approve with no typed effects", patch: { effects: [] } }],
            parserChoice: 0,
          }]
        : [],
  });
}

function uniqueIds<T extends { item: ItemDef }>(rows: T[]): T[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const n = (seen.get(row.item.id) ?? 0) + 1;
    seen.set(row.item.id, n);
    return n === 1 ? row : { ...row, item: { ...row.item, id: `${row.item.id}_${n}`.slice(0, 64) } };
  });
}

function parseGear(markdown: string, reviews: ReviewBundle[]): ItemDef[] {
  const rows = uniqueIds([...parseWeapons(markdown), ...parseArmor(markdown)]);
  for (const row of rows) reviews.push(itemReview(row));
  return rows.map((row) => row.item);
}

function parseMagic(markdown: string, knownSpells: Set<string>, gear: ItemDef[], reviews: ReviewBundle[]): ItemDef[] {
  const rows = uniqueIds(parseMagicItems(markdown, knownSpells, gear));
  for (const row of rows) reviews.push(itemReview(row));
  return rows.map((row) => row.item);
}

/** Same slug the engine uses for ability ids, without the 64-character cap. */
function engineSlug(name: string): string {
  return name.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function engineGaps(monster: MonsterDef, compiled: EngineMonster | undefined, engineId: string): { gaps: string[]; traits: string[] } {
  if (!compiled) return { gaps: ["The combat engine skips this stat block: none of its actions compile into an attack or save."], traits: [] };
  const ran = new Set([...compiled.actions, ...(compiled.bonusActions ?? []), ...(compiled.legendaryActions ?? [])]);
  const gaps: string[] = [];
  const check = (label: string, list: MonsterAction[] | undefined) => {
    for (const action of list ?? []) {
      const key = engineSlug(action.name);
      if (key === "multiattack") {
        if (!compiled.multiattack?.length) gaps.push(`${label} “Multiattack”: the engine could not read the sequence and makes one attack.`);
        continue;
      }
      if (key === "spellcasting") {
        const spells = compiled.actions.filter((id) => id.startsWith("spell_"));
        gaps.push(`${label} “Spellcasting”: only spells wired in content/rules/srd51_combat.json run${spells.length ? ` (${spells.join(", ")})` : "; none of these are wired"}.`);
        continue;
      }
      if (!ran.has(`${engineId}:${key}`)) gaps.push(`${label} “${action.name}”: the combat engine does not run it.`);
    }
  };
  check("Action", monster.actions);
  check("Bonus action", monster.bonusActions);
  check("Legendary action", monster.legendaryActions);
  for (const reaction of monster.reactions ?? []) gaps.push(`Reaction “${reaction.name}”: monsters take no reactions in combat.`);
  const known = new Set(compiled.traits ?? []);
  const traits = (monster.traits ?? [])
    .filter((trait) => !known.has(engineSlug(trait.name.replace(/\s*\(.*$/, ""))))
    .map((trait) => `Trait “${trait.name}”: text only; the engine ignores it.`);
  return { gaps, traits };
}

function parseMonsters(markdown: string, reviews: ReviewBundle[]): MonsterDef[] {
  const engine = loadSrdCatalog();
  const entries: MonsterDef[] = [];
  const seen = new Set<string>();
  for (const block of splitMonsterMarkdown(markdown)) {
    const parsed = parseMonsterBlock(block);
    const monster = parsed.monster;
    if (seen.has(monster.id)) monster.id = `${monster.id}_${engineSlug(block.group)}`.slice(0, 64);
    seen.add(monster.id);
    const engineId = srdMonsterId(monster.name);
    const compiled = engine.monsters[engineId] as EngineMonster | undefined;
    const { gaps, traits } = engineGaps(monster, compiled, engineId);
    entries.push(monster);
    const open = parsed.missing.length > 0 || gaps.length > 0;
    reviews.push(bundle({
      kind: "monster",
      id: monster.id,
      status: open ? "needs_review" : "auto_ok",
      confidence: !compiled || parsed.missing.length ? "low" : gaps.length ? "medium" : "high",
      unparsedFields: parsed.missing,
      usage: USAGE.monster,
      srd: { engineId, text: parsed.text },
      ...(gaps.length || traits.length ? { notModeled: [...gaps, ...traits] } : {}),
    }));
  }
  return entries;
}

function parseClasses(markdown: string, reviews: ReviewBundle[]): { classes: unknown[]; subclasses: unknown[] } {
  const classEntries = [];
  const subclassEntries = [];
  for (const chunk of chunks(markdown, 2)) {
    const id = slug(chunk.title);
    const core = tables(chunk.body)[0];
    const traits = new Map<string, string>();
    for (const row of core ?? []) {
      if (row[0] && row[1]) traits.set(row[0], row[1]);
    }
    const hitDie = num(traits.get("Hit Point Die")?.match(/D(\d+)/i)?.[1]) ?? 8;
    const saves = abilitiesIn(traits.get("Saving Throw Proficiencies") ?? "");
    const skillText = traits.get("Skill Proficiencies") ?? "";
    const skillChoices = num(skillText.match(/Choose (\d+)/)?.[1]) ?? 2;
    const skillList = skillText.split(":").slice(1).join(":").split(/,| or /).map((skill) => skillId(skill.trim())).filter(Boolean);
    const primary = abilitiesIn(traits.get("Primary Ability") ?? "");
    const primaryText = (traits.get("Primary Ability") ?? "").toLowerCase();
    const multiclass = primaryText.includes(" or ")
      ? { anyOf: primary.map((ability) => ({ ability, min: 13 })) }
      : { allOf: primary.map((ability) => ({ ability, min: 13 })) };
    const featureTable = tables(chunk.body).find((table) => table[0]?.[0] === "Level");
    const header2 = featureTable?.[1]?.[0] === "" && featureTable[1].some((cell) => cell === "1");
    const headers = (header2 ? featureTable?.[1] : featureTable?.[0]) ?? [];
    const top = featureTable?.[0] ?? [];
    const data = (featureTable ?? []).slice(header2 ? 2 : 1);
    const col = (label: string) => top.findIndex((cell) => cell.toLowerCase().includes(label.toLowerCase()));
    const extraCols = top
      .map((label, index) => ({ label, index }))
      .filter(({ label }) => label && !/^(level|proficiency bonus|class features|cantrips|prepared spells)$/i.test(label) && !/spell slots|slot level/i.test(label));
    const levels = data.filter((row) => num(row[0]) != null).map((row) => {
      const level = num(row[0]) ?? 1;
      const featureCol = top.findIndex((cell) => cell.toLowerCase().includes("class features"));
      const features = (row[featureCol >= 0 ? featureCol : 2] ?? "").split(",").map((feature) => feature.trim()).filter((feature) => feature && feature !== "—");
      const columns: Record<string, string> = {};
      for (const { label, index } of extraCols) {
        const value = row[index]?.trim();
        if (value && value !== "—") columns[slug(label)] = value;
      }
      const slots: Record<string, number> = {};
      headers.forEach((label, index) => {
        const slot = num(label);
        const value = num(row[index]);
        if (slot && slot >= 1 && slot <= 9 && value) slots[String(slot)] = value;
      });
      const pactCount = col("Spell Slots") >= 0 && !header2 ? num(row[col("Spell Slots")]) : undefined;
      const pactLevel = col("Slot Level") >= 0 ? num(row[col("Slot Level")]) : undefined;
      return {
        level,
        proficiencyBonus: num(row[1]?.replace("+", "")) ?? 2,
        features,
        ...(Object.keys(slots).length ? { spellSlots: slots } : {}),
        ...(pactCount && pactLevel ? { pactSlots: { slotLevel: pactLevel, count: pactCount } } : {}),
        ...(col("Cantrips") >= 0 && num(row[col("Cantrips")]) != null ? { cantrips: num(row[col("Cantrips")]) } : {}),
        ...(col("Prepared Spells") >= 0 && num(row[col("Prepared Spells")]) != null ? { preparedSpells: num(row[col("Prepared Spells")]) } : {}),
        ...(Object.keys(columns).length ? { columns } : {}),
      };
    });
    while (levels.length < 20) {
      const last = levels[levels.length - 1];
      levels.push({ level: levels.length + 1, proficiencyBonus: last?.proficiencyBonus ?? 2, features: [] });
    }
    const pact = levels.some((level) => "pactSlots" in level && level.pactSlots);
    const hasSlots = levels.some((level) => level.spellSlots && Object.keys(level.spellSlots).length);
    const atFive = levels.find((level) => level.level === 5);
    const half = hasSlots && !pact && !atFive?.spellSlots?.["3"] && Boolean(atFive?.spellSlots?.["2"]);
    const caster = pact ? "pact" : hasSlots ? (half ? "half" : "full") : "none";
    const mode = pact ? "pact" : hasSlots ? "prepared" : undefined;
    const castWith = abilitiesIn(chunk.body.match(/Spellcasting Ability\.?[_*]*\s*(\w+) is (?:your|the) spellcasting ability/i)?.[1] ?? "")[0];
    const unparsed: string[] = [];
    if (!primary.length) unparsed.push("primary");
    if (levels.filter((level) => level.features.length || level.level === 1).length < 10) unparsed.push("levels");
    const game = {
      id,
      name: chunk.title,
      hitDie,
      saves: saves.length ? saves : ["str", "con"],
      skillChoices,
      skillList,
      primary: primary.length ? primary : ["str"],
      multiclass,
      caster,
      ...(caster !== "none" && (castWith ?? primary[0]) ? { spellAbility: castWith ?? primary[0] } : {}),
      ...(mode ? { spellProgression: { mode } } : {}),
      weaponMastery: levels.some((level) => level.level === 1 && level.features.some((feature) => /weapon mastery/i.test(feature))),
      levels: levels.slice(0, 20),
    };
    classEntries.push(game);
    reviews.push(bundle({
      kind: "class",
      id,
      status: unparsed.length ? "needs_review" : "auto_ok",
      confidence: unparsed.length ? "medium" : "high",
      unparsedFields: unparsed,
      usage: USAGE.class,
      srd: { text: plainMarkdown(chunk.body).slice(0, TEXT_CAP) },
    }));
    for (const sub of chunks(chunk.body, 3)) {
      const named = sub.title.match(/Subclass:\s*(.+)$/);
      if (!named?.[1]) continue;
      const featuresByLevel = chunks(sub.body, 4)
        .map((feature) => {
          const level = num(feature.title.match(/Level (\d+)/)?.[1]);
          return level ? { level, features: [feature.title.replace(/^Level \d+:\s*/, "").trim()] } : null;
        })
        .filter((row): row is { level: number; features: string[] } => Boolean(row));
      const subclass = {
        id: slug(named[1]),
        classId: id,
        name: named[1].trim(),
        level: featuresByLevel[0]?.level ?? 3,
        features: featuresByLevel.flatMap((row) => row.features),
        ...(featuresByLevel.length ? { featuresByLevel } : {}),
      };
      subclassEntries.push(subclass);
      reviews.push(bundle({
        kind: "subclass",
        id: subclass.id,
        status: featuresByLevel.length ? "auto_ok" : "needs_review",
        confidence: featuresByLevel.length ? "high" : "low",
        unparsedFields: featuresByLevel.length ? [] : ["featuresByLevel"],
        usage: USAGE.subclass,
        srd: { text: plainMarkdown(sub.body).slice(0, TEXT_CAP) },
      }));
    }
  }
  return { classes: classEntries, subclasses: subclassEntries };
}

function parseOrigins(markdown: string, reviews: ReviewBundle[]): { species: unknown[]; backgrounds: unknown[] } {
  const species = [];
  const backgrounds = [];
  const speciesSection = markdown.slice(markdown.indexOf("### Species Descriptions"));
  const backgroundSection = markdown.slice(markdown.indexOf("### Background Descriptions"), markdown.indexOf("## Character Species"));
  for (const chunk of chunks(backgroundSection, 4)) {
    const skills = [...chunk.body.matchAll(/Skill Proficiencies:\*\*\s*([^\n]+)/g)].flatMap((match) =>
      match[1].split(/,| and /).map((skill) => skillId(skill.trim())),
    );
    const featText = chunk.body.match(/\*\*Feat:\*\*\s*([^\n]+)/)?.[1]?.replace(/\(see[^)]*\)/i, "").trim();
    const featName = featText?.replace(/\(.*$/, "").trim();
    const featChoice = featText?.match(/\(([^)]+)\)/)?.[1];
    const game = {
      id: slug(chunk.title),
      name: chunk.title,
      skills,
      ...(featName ? { feat: slug(featName) } : {}),
      ...(featChoice ? { featChoice: slug(featChoice) } : {}),
    };
    backgrounds.push(game);
    reviews.push(bundle({
      kind: "background",
      id: game.id,
      status: skills.length ? "auto_ok" : "needs_review",
      confidence: skills.length ? "high" : "low",
      unparsedFields: skills.length ? [] : ["skills"],
      usage: USAGE.background,
      srd: { text: plainMarkdown(chunk.body) },
    }));
  }
  for (const chunk of chunks(speciesSection, 4)) {
    const speed = num(chunk.body.match(/\*\*Speed:\*\*\s*(\d+)/)?.[1]) ?? 30;
    const size = /^\W*small/i.test(chunk.body.match(/\*\*Size:\*\*\s*([^\n]+)/)?.[1] ?? "") ? "small" : "medium";
    const traits = [...chunk.body.matchAll(/^_([^_]+)\._/gm)].map((match) => match[1].trim());
    const unparsed = traits.filter((trait) => !/toughness/i.test(trait));
    const hpPerLevel = traits.some((trait) => /toughness/i.test(trait)) ? 1 : undefined;
    const game = {
      id: slug(chunk.title),
      name: chunk.title,
      speedFt: speed,
      size,
      traits,
      ...(hpPerLevel ? { hpPerLevel } : {}),
    };
    species.push(game);
    reviews.push(bundle({
      kind: "species",
      id: game.id,
      status: "auto_ok",
      confidence: unparsed.length ? "medium" : "high",
      unparsedFields: unparsed.map((trait) => `trait:${trait}`),
      usage: USAGE.species,
      srd: { text: plainMarkdown(chunk.body) },
    }));
  }
  return { species, backgrounds };
}

function parseFeats(markdown: string, reviews: ReviewBundle[]): unknown[] {
  const entries = [];
  for (const chunk of chunks(markdown, 4)) {
    const repeatable = /repeatable/i.test(chunk.body);
    const prereq = chunk.body.match(/\*\*Prerequisite:\*\*\s*([^\n]+)/)?.[1];
    const game = {
      id: slug(chunk.title),
      name: chunk.title,
      repeatable,
      description: chunk.body.replace(/\s+/g, " ").trim().slice(0, 500) || chunk.title,
      ...(prereq ? { prerequisites: [prereq] } : {}),
    };
    entries.push(game);
    reviews.push(bundle({
      kind: "feat",
      id: game.id,
      status: "auto_ok",
      confidence: "high",
      usage: USAGE.feat,
      srd: { text: plainMarkdown(chunk.body) },
    }));
  }
  return entries;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { report } = importCatalog();
  console.log(JSON.stringify(report));
}
