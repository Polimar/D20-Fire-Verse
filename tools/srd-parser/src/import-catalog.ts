/**
 * One-shot import from vendored downfallx markdown into content/srd-5.2.1.
 * Does not read or write content_flags / content_resolutions.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { monsterFromMarkdown, splitMonsterMarkdown } from "./parse-monsters.js";

type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";

export type ReviewBundle = {
  kind: string;
  id: string;
  status: "auto_ok" | "needs_review" | "resolved" | "rejected";
  confidence: "high" | "medium" | "low";
  unparsedFields: string[];
  usage: string;
  srd?: Record<string, unknown>;
  ambiguities: Array<{ field: string; summary: string; options: Array<{ label: string; patch: Record<string, unknown> }>; parserChoice?: number }>;
};

const USAGE: Record<string, string> = {
  spell: "Level-up spell list for the listed classes. Combat only if a wired ability uses this id.",
  class: "Chargen and level-up: hit die, saves, skills, multiclass gates, spell slots.",
  subclass: "Chosen at the subclass level. Feature names are sheet labels until combat wires them.",
  species: "Chargen species. Unparsed trait numbers count as 0 until you fill them in the wizard.",
  background: "Chargen background. Grants the listed skills.",
  feat: "Chosen at an ASI level or as an Epic Boon when the class table says so.",
  item: "Vendor, loot, and stash. Typed effects change AC, attack, and damage.",
  monster: "Encounters when enabled. Combat uses a wired ability with the same id when one exists.",
};

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
  const { species, backgrounds } = parseOrigins(read("character-origins.md"), reviews);
  const feats = parseFeats(read("feats.md"), reviews);
  const gear = parseGear(read("equipment.md"), reviews);
  const magic = parseMagic(read("magic-items.md"), reviews);
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
  };
  writeJson(path.join(out, "import-report.json"), { sha, ...report });
  return { report };
}

function bundle(partial: Omit<ReviewBundle, "ambiguities" | "unparsedFields"> & { ambiguities?: ReviewBundle["ambiguities"]; unparsedFields?: string[] }): ReviewBundle {
  return { ambiguities: [], unparsedFields: [], ...partial };
}

function parseSpells(markdown: string, reviews: ReviewBundle[]): unknown[] {
  const section = markdown.slice(markdown.indexOf("## Spell Descriptions"));
  const entries = [];
  const spellLine = /^_[^_\n]*(Level \d+|Cantrip)[^_\n]*_/im;
  const spellChunks: Array<{ title: string; body: string }> = [];
  for (const chunk of chunks(section, 4)) {
    const last = spellChunks.at(-1);
    // Summon stat blocks carry their own "#### Traits" / "#### Actions" headings.
    if (last && !spellLine.test(chunk.body)) last.body += `\n\n**${chunk.title}.**\n${chunk.body}`;
    else spellChunks.push({ ...chunk });
  }
  for (const chunk of spellChunks) {
    const id = slug(chunk.title);
    const line = chunk.body.match(/^_([^_\n]+)_/m)?.[1] ?? "";
    const levelMatch = /Level (\d+)/i.exec(line);
    const level = /cantrip/i.test(line) ? 0 : levelMatch ? Number(levelMatch[1]) : undefined;
    const school = (line.match(/(abjuration|conjuration|divination|enchantment|evocation|illusion|necromancy|transmutation)/i)?.[1] ?? "").toLowerCase();
    const classBlob = line.match(/\(([^)]+)\)/)?.[1] ?? "";
    const classes = classBlob.split(/,| and /).map((name) => slug(name.trim())).filter((name) => name && name !== "cantrip");
    const field = (label: string) => chunk.body.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]+)`))?.[1]?.trim();
    const description = chunk.body.split("\n").filter((row) => row.trim() && !row.startsWith("**") && !row.startsWith("_")).join(" ").trim();
    const unparsed: string[] = [];
    if (level == null) unparsed.push("level");
    if (!school) unparsed.push("school");
    if (!classes.length) unparsed.push("classes");
    const game = {
      id,
      name: chunk.title,
      level: level ?? 0,
      school: school || "evocation",
      classes: classes.length ? classes : ["wizard"],
      castingTime: field("Casting Time") || "Action",
      range: field("Range") || "Self",
      duration: field("Duration") || "Instantaneous",
      description: description || chunk.title,
    };
    entries.push(game);
    reviews.push(bundle({
      kind: "spell",
      id,
      status: unparsed.length ? "needs_review" : "auto_ok",
      confidence: unparsed.length ? "low" : "high",
      unparsedFields: unparsed,
      usage: USAGE.spell,
      srd: { components: field("Components") ?? "", line },
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
    const levels = data.filter((row) => num(row[0]) != null).map((row) => {
      const level = num(row[0]) ?? 1;
      const featureCol = top.findIndex((cell) => cell.toLowerCase().includes("class features"));
      const features = (row[featureCol >= 0 ? featureCol : 2] ?? "").split(",").map((feature) => feature.trim()).filter(Boolean);
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
      ...(primary[0] && caster !== "none" ? { spellAbility: primary[0] } : {}),
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
    const feat = chunk.body.match(/\*\*Feat:\*\*\s*([^\n]+)/)?.[1]?.trim();
    const game = { id: slug(chunk.title), name: chunk.title, skills, ...(feat ? { feat: slug(feat) } : {}) };
    backgrounds.push(game);
    reviews.push(bundle({
      kind: "background",
      id: game.id,
      status: skills.length ? "auto_ok" : "needs_review",
      confidence: skills.length ? "high" : "low",
      unparsedFields: skills.length ? [] : ["skills"],
      usage: USAGE.background,
    }));
  }
  for (const chunk of chunks(speciesSection, 4)) {
    const speed = num(chunk.body.match(/\*\*Speed:\*\*\s*(\d+)/)?.[1]) ?? 30;
    const size = /small/i.test(chunk.body.match(/\*\*Size:\*\*\s*([^\n]+)/)?.[1] ?? "") ? "small" : "medium";
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
    }));
  }
  return entries;
}

const MASTERY = new Set(["cleave", "graze", "nick", "push", "sap", "slow", "topple", "vex"]);

function parseGear(markdown: string, reviews: ReviewBundle[]): unknown[] {
  const entries = [];
  for (const table of tables(markdown)) {
    for (const row of table) {
      const mastery = (row[3] ?? "").toLowerCase();
      if (!MASTERY.has(mastery)) continue;
      const name = row[0];
      if (!name || name === "Name") continue;
      const id = slug(name);
      const game = {
        id,
        name,
        rarity: "common",
        slot: "mainhand",
        weaponId: id,
        weaponMastery: mastery,
        effects: [],
        priceGold: num(row[5]?.match(/(\d+)/)?.[1]) ?? 100,
      };
      entries.push(game);
      reviews.push(bundle({ kind: "item", id, status: "auto_ok", confidence: "high", usage: USAGE.item, srd: { damage: row[1], properties: row[2] } }));
    }
  }
  return entries;
}

function parseMagic(markdown: string, reviews: ReviewBundle[]): unknown[] {
  const section = markdown.slice(markdown.indexOf("## Magic Item Descriptions"));
  const source = section.includes("####") ? section : markdown;
  const entries = [];
  for (const chunk of chunks(source, 4)) {
    const line = chunk.body.match(/^_([^_\n]+)_/m)?.[1] ?? "";
    if (!/common|uncommon|rare|very rare|legendary|artifact/i.test(line) && !/wondrous|weapon|armor|ring|wand|staff|rod|potion|scroll/i.test(line)) continue;
    const rarity = /very rare/i.test(line) ? "very_rare" : /uncommon/i.test(line) ? "uncommon" : /rare/i.test(line) ? "rare" : /legendary/i.test(line) ? "legendary" : "common";
    const attune = /attunement/i.test(line);
    const slot = /armor/i.test(line) ? "armor" : /weapon/i.test(line) ? "mainhand" : /potion|scroll/i.test(line) ? "consumable" : "trinket";
    const effects: unknown[] = [];
    const plus = chunk.body.match(/\+(\d) bonus to (?:Armor Class|AC)/i);
    if (plus) effects.push({ kind: "ac_bonus", amount: Number(plus[1]) });
    const weapon = chunk.body.match(/(?:have|gain) a \+(\d) bonus to attack(?: rolls)? and damage rolls/i);
    if (weapon) {
      effects.push({ kind: "attack_bonus", amount: Number(weapon[1]) });
      effects.push({ kind: "damage_bonus", amount: Number(weapon[1]) });
    }
    const resist = chunk.body.match(/[Rr]esistance to (\w+) damage/);
    if (resist?.[1]) effects.push({ kind: "resistance", damageType: resist[1].toLowerCase() });
    const id = slug(chunk.title);
    const needs = effects.length === 0;
    entries.push({
      id,
      name: chunk.title,
      rarity,
      slot,
      ...(attune ? { requires: { attunement: true } } : {}),
      effects,
    });
    reviews.push(bundle({
      kind: "item",
      id,
      status: needs ? "needs_review" : "auto_ok",
      confidence: needs ? "low" : "high",
      unparsedFields: needs ? ["effects"] : [],
      usage: USAGE.item,
      srd: { line, text: chunk.body.trim().slice(0, 6000) },
      ambiguities: needs
        ? [{ field: "effects", summary: "No typed effect matched the item text.", options: [{ label: "Leave effects empty", patch: { effects: [] } }], parserChoice: 0 }]
        : [],
    }));
  }
  return entries;
}

function parseMonsters(markdown: string, reviews: ReviewBundle[]): unknown[] {
  const entries = [];
  for (const chunk of splitMonsterMarkdown(markdown)) {
    const parsed = monsterFromMarkdown(chunk);
    if (!parsed.monster) continue;
    entries.push(parsed.monster);
    reviews.push(bundle({
      kind: "monster",
      id: parsed.monster.id,
      status: "auto_ok",
      confidence: "high",
      usage: USAGE.monster,
    }));
  }
  return entries;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { report } = importCatalog();
  console.log(JSON.stringify(report));
}
