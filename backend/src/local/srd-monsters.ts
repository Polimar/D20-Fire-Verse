/**
 * Parse SRD 5.2.1 markdown stat blocks into MonsterDef / AbilityDef the table can run.
 */
import fs from "node:fs";
import path from "node:path";
import type { AbilityDef, MonsterDef } from "./campaign.js";
import { CONTENT_ROOT } from "./paths.js";

export type SrdCompiled = {
  monsters: Record<string, MonsterDef>;
  abilities: Record<string, AbilityDef>;
  skipped: string[];
};

const WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

const DAMAGE_TYPES = [
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
];

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function srdMonsterId(name: string): string {
  return `srd_${slug(name)}`;
}

function abilityId(monsterId: string, move: string): string {
  return `${monsterId}:${slug(move)}`;
}

function flatten(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function parseCount(raw: string): number {
  const w = WORDS[raw.toLowerCase()];
  if (w) return w;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 1;
}

export function crValue(cr: string | undefined): number {
  if (!cr) return 0;
  if (cr.includes("/")) {
    const [a, b] = cr.split("/");
    return Number(a) / Number(b);
  }
  return Number(cr) || 0;
}

function ftToCells(ft: number): number {
  return Math.max(1, Math.ceil(ft / 5));
}

function cleanDice(raw: string): string {
  return raw.replace(/[−–]/g, "-").replace(/\s+/g, "");
}

function parseSigned(raw: string): number {
  const t = raw.replace(/[−–]/g, "-").replace(/\s/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function splitTypes(list: string): string[] {
  return list
    .split(/[,;]/)
    .map((p) => p.trim().toLowerCase().replace(/\s+/g, " "))
    .filter((p) => DAMAGE_TYPES.includes(p.split(" ")[0]!))
    .map((p) => p.split(" ")[0]!);
}

function parseSpeedCells(speedLine: string): number {
  const walk = speedLine.match(/^(\d+)\s*ft/i);
  if (walk) return ftToCells(Number(walk[1]));
  const fly = speedLine.match(/Fly\s+(\d+)\s*ft/i);
  if (fly) return ftToCells(Number(fly[1]));
  const swim = speedLine.match(/Swim\s+(\d+)\s*ft/i);
  if (swim) return ftToCells(Number(swim[1]));
  return 6;
}

function parseAbilities(block: string): { scores: Record<string, number>; saves: Record<string, number> } {
  const flat = flatten(block);
  const keys = ["str", "dex", "con", "int", "wis", "cha"] as const;
  const scores: Record<string, number> = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  const saves: Record<string, number> = {};
  const re =
    /STR\s+(\d+)\s+([+\-−]?\d+)\s+([+\-−]?\d+)\s+DEX\s+(\d+)\s+([+\-−]?\d+)\s+([+\-−]?\d+)\s+CON\s+(\d+)\s+([+\-−]?\d+)\s+([+\-−]?\d+)\s+INT\s+(\d+)\s+([+\-−]?\d+)\s+([+\-−]?\d+)\s+WIS\s+(\d+)\s+([+\-−]?\d+)\s+([+\-−]?\d+)\s+CHA\s+(\d+)\s+([+\-−]?\d+)\s+([+\-−]?\d+)/i;
  const m = flat.match(re);
  if (!m) return { scores, saves };
  keys.forEach((k, i) => {
    const score = Number(m[1 + i * 3]);
    const save = parseSigned(m[3 + i * 3]!);
    scores[k] = score;
    saves[k] = save;
  });
  return { scores, saves };
}

function section(block: string, title: string): string {
  const re = new RegExp(`#### ${title}\\s*([\\s\\S]*?)(?=#### |$)`, "i");
  return block.match(re)?.[1] ?? "";
}

function actionChunks(sectionText: string): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = [];
  const re = /\*\*_([\s\S]+?)\._\*\*\s*([\s\S]*?)(?=\*\*_|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sectionText))) {
    out.push({ name: flatten(m[1]!), body: m[2]!.trim() });
  }
  return out;
}

function parseRecharge(name: string, body: string): { min: number; max: number } | undefined {
  const blob = `${name} ${body}`;
  const m = blob.match(/Recharge\s+(\d+)\s*[–\-−]\s*(\d+)/i);
  if (!m) return undefined;
  return { min: Number(m[1]), max: Number(m[2]) };
}

function parseDayUses(name: string, body: string): number | undefined {
  const blob = `${name} ${body}`;
  const m = blob.match(/(\d+)\s*\/\s*Day/i);
  return m ? Number(m[1]) : undefined;
}

function stripLimitLabel(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function parseDamageParts(text: string): Array<{ dice: string; damageType: string }> {
  const parts: Array<{ dice: string; damageType: string }> = [];
  const re = /(\d+d\d+(?:\s*[+\-−]\s*\d+)?)\s*\)?\s+([A-Za-z]+)\s+damage/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const dtype = m[2]!.toLowerCase();
    if (!DAMAGE_TYPES.includes(dtype)) continue;
    parts.push({ dice: cleanDice(m[1]!), damageType: dtype });
  }
  if (!parts.length) {
    const hit = text.match(/Hit:_?\s*(\d+)\s*\((\d+d\d+(?:\s*[+\-−]\s*\d+)?)\)\s+([A-Za-z]+)\s+damage/i);
    if (hit && DAMAGE_TYPES.includes(hit[3]!.toLowerCase())) {
      parts.push({ dice: cleanDice(hit[2]!), damageType: hit[3]!.toLowerCase() });
    }
  }
  return parts;
}

function parseRangeCells(body: string): number {
  const reach = body.match(/reach\s+(\d+)\s*ft/i);
  const range = body.match(/range\s+(\d+)/i);
  const within = body.match(/within\s+(\d+)\s*(?:feet|ft)/i);
  const emanation = body.match(/(\d+)-foot\s+Emanation/i);
  const cone = body.match(/(\d+)-foot\s+Cone/i);
  const ft = Number(reach?.[1] ?? range?.[1] ?? within?.[1] ?? emanation?.[1] ?? cone?.[1] ?? 5);
  return ftToCells(ft);
}

function isAttackLine(body: string): boolean {
  return /Attack Roll:/i.test(body);
}

function isSaveLine(body: string): boolean {
  return /Saving Throw:/i.test(body);
}

function parseAttackBonus(body: string): number {
  const m = body.match(/Attack Roll:_?\s*\+(\d+)/i);
  return m ? Number(m[1]) : 0;
}

function parseSave(body: string): { ability: string; dc: number; half: boolean; condition?: string } | undefined {
  const m = body.match(/_(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+Saving Throw:_?\s*DC\s+(\d+)/i)
    ?? body.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+Saving Throw:?\s*DC\s+(\d+)/i);
  if (!m) return undefined;
  const ability = m[1]!.slice(0, 3).toLowerCase();
  const half = /half damage|success:\s*half/i.test(body);
  const cond = body.match(/the\s+(\w+)\s+condition/i);
  const known = ["poisoned", "grappled", "restrained", "frightened", "blinded", "paralyzed", "incapacitated", "charmed", "stunned", "prone"];
  const condition = cond && known.includes(cond[1]!.toLowerCase()) ? cond[1]!.toLowerCase() : undefined;
  return { ability, dc: Number(m[2]), half, condition };
}

function parseSpells(body: string, known: Set<string>): string[] {
  const ids: string[] = [];
  const re = /_([A-Za-z][A-Za-z' ]{2,40})_/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const id = `spell_${slug(m[1]!)}`;
    if (known.has(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function parseMultiattack(body: string, moveNames: string[]): string[] {
  const seq: string[] = [];
  for (const n of moveNames) {
    const re = new RegExp(`(\\d+|one|two|three|four|five|six)\\s+${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+attacks?`, "i");
    const m = body.match(re);
    if (m) {
      const c = parseCount(m[1]!);
      for (let i = 0; i < c; i += 1) seq.push(n);
    }
  }
  if (seq.length) return seq;
  const m = body.match(/makes\s+(\d+|two|three|four|five|six)\s+attacks/i);
  if (m && moveNames[0]) {
    const c = parseCount(m[1]!);
    return Array.from({ length: c }, () => moveNames[0]!);
  }
  return moveNames.slice(0, 2);
}

function traitIds(traitsText: string): string[] {
  const ids: string[] = [];
  if (/Pack Tactics/i.test(traitsText)) ids.push("pack_tactics");
  if (/Legendary Resistance/i.test(traitsText)) ids.push("legendary_resistance");
  if (/Magic Resistance/i.test(traitsText)) ids.push("magic_resistance");
  return ids;
}

function creatureType(italic: string): string {
  const m = italic.match(/_(Tiny|Small|Medium|Large|Huge|Gargantuan)\s+([^,_]+)/i);
  return m ? m[2]!.replace(/\(.*\)/, "").trim().toLowerCase() : "monstrosity";
}

type RawMove = {
  name: string;
  body: string;
  section: "action" | "bonus" | "legendary";
};

export function parseSrdMarkdown(markdown: string, knownSpells: Set<string>): SrdCompiled {
  const monsters: Record<string, MonsterDef> = {};
  const abilities: Record<string, AbilityDef> = {};
  const skipped: string[] = [];
  const parts = markdown.split(/^### /m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf("\n");
    const name = (nl < 0 ? part : part.slice(0, nl)).trim();
    if (!name || name === "Monsters A–Z") continue;
    const block = part;
    const id = srdMonsterId(name);
    const ac = Number(block.match(/\*\*AC\*\*\s+(\d+)/)?.[1] ?? 10);
    const hp = Number(block.match(/\*\*HP\*\*\s+(\d+)/)?.[1] ?? 1);
    const speedLine = block.match(/\*\*Speed\*\*\s+([^\n]+)/)?.[1] ?? "30 ft.";
    const cr = block.match(/\*\*CR\*\*\s+([0-9/]+)/)?.[1] ?? "0";
    const { scores, saves } = parseAbilities(block);
    const italic = block.match(/_(Tiny|Small|Medium|Large|Huge|Gargantuan)[^_]*_/i)?.[0] ?? "";
    const type = creatureType(italic);
    const resistLine = block.match(/\*\*Resistances\*\*\s+([^\n*]+)/)?.[1] ?? "";
    const immuneLine = block.match(/\*\*Immunities\*\*\s+([^\n*]+)/)?.[1] ?? "";
    const vulnLine = block.match(/\*\*Vulnerabilities\*\*\s+([^\n*]+)/)?.[1] ?? "";
    const traitsText = section(block, "Traits");
    const actionsText = section(block, "Actions");
    const bonusText = section(block, "Bonus Actions");
    const legendaryText = section(block, "Legendary Actions");
    const moves: RawMove[] = [
      ...actionChunks(actionsText).map((c) => ({ ...c, section: "action" as const })),
      ...actionChunks(bonusText).map((c) => ({ ...c, section: "bonus" as const })),
      ...actionChunks(legendaryText).map((c) => ({ ...c, section: "legendary" as const })),
    ];
    const combatMoves = moves.filter((m) => {
      const n = stripLimitLabel(m.name);
      return n.toLowerCase() !== "multiattack" && n.toLowerCase() !== "spellcasting";
    });
    const actionNames = combatMoves.filter((m) => m.section === "action").map((m) => stripLimitLabel(m.name));
    const actionIds: string[] = [];
    const bonusActionIds: string[] = [];
    const legendaryActionIds: string[] = [];
    let multiattack: string[] | undefined;
    const spellIds: string[] = [];

    for (const move of moves) {
      const label = stripLimitLabel(move.name);
      const key = label.toLowerCase();
      if (key === "spellcasting") {
        spellIds.push(...parseSpells(move.body, knownSpells));
        continue;
      }
      if (key === "multiattack") {
        continue;
      }
      const aid = abilityId(id, label);
      const recharge = parseRecharge(move.name, move.body);
      const usesPerDay = parseDayUses(move.name, move.body);
      const meta: Record<string, unknown> = {};
      if (recharge) meta.recharge = recharge;
      if (usesPerDay) meta.usesPerDay = usesPerDay;

      if (isAttackLine(move.body)) {
        const damage = parseDamageParts(move.body);
        if (!damage.length) continue;
        abilities[aid] = {
          id: aid,
          name: label,
          actionType: move.section === "bonus" ? "bonus_action" : "action",
          needsTarget: true,
          effects: [
            {
              type: "attack",
              attackBonus: parseAttackBonus(move.body),
              rangeCells: parseRangeCells(move.body),
              damage,
              ...meta,
            },
          ],
        };
      } else if (isSaveLine(move.body)) {
        const save = parseSave(move.body);
        const damage = parseDamageParts(move.body);
        if (!save) continue;
        abilities[aid] = {
          id: aid,
          name: label,
          actionType: move.section === "bonus" ? "bonus_action" : "action",
          needsTarget: true,
          effects: [
            {
              type: "save",
              ability: save.ability,
              dc: save.dc,
              rangeCells: parseRangeCells(move.body),
              damage,
              halfOnSuccess: save.half,
              condition: save.condition,
              ...meta,
            },
          ],
        };
      } else if (/Disengage/i.test(move.body)) {
        abilities[aid] = {
          id: aid,
          name: label,
          actionType: "bonus_action",
          effects: [{ type: "disengage", ...meta }],
        };
      } else if (/Hide action/i.test(move.body) && /Disengage/i.test(move.body) === false) {
        abilities[aid] = {
          id: aid,
          name: label,
          actionType: "bonus_action",
          effects: [{ type: "hide", ...meta }],
        };
      } else if (/\bDash\b/i.test(move.body)) {
        abilities[aid] = {
          id: aid,
          name: label,
          actionType: "bonus_action",
          effects: [{ type: "dash", ...meta }],
        };
      } else {
        const hit = move.body.match(/makes one ([^.]+) attack/i);
        if (hit) {
          const ref = stripLimitLabel(hit[1]!.trim());
          const refId = abilityId(id, ref);
          if (abilities[refId]) {
            abilities[aid] = {
              id: aid,
              name: label,
              actionType: "action",
              effects: [{ type: "attack", ref: refId, ...meta }],
            };
          } else continue;
        } else continue;
      }

      if (move.section === "bonus") bonusActionIds.push(aid);
      else if (move.section === "legendary") legendaryActionIds.push(aid);
      else actionIds.push(aid);
    }

    const multi = moves.find((m) => stripLimitLabel(m.name).toLowerCase() === "multiattack");
    if (multi) {
      const names = parseMultiattack(multi.body, actionNames);
      multiattack = names.map((n) => abilityId(id, n)).filter((aid) => abilities[aid]);
    }

    for (const sid of spellIds) {
      if (!actionIds.includes(sid)) actionIds.push(sid);
    }

    const executable = actionIds.length > 0 || bonusActionIds.length > 0 || Boolean(multiattack?.length) || spellIds.length > 0;
    if (!executable) {
      skipped.push(name);
      continue;
    }

    const legendaryUses = Number(
      legendaryText.match(/Legendary Action Uses:\s*(\d+)/i)?.[1] ?? (legendaryActionIds.length ? 3 : 0),
    );
    const melee = actionIds.some((aid) => Number(abilities[aid]?.effects[0]?.rangeCells ?? 1) <= 1);

    monsters[id] = {
      id,
      name,
      ac,
      hp,
      speedCells: parseSpeedCells(speedLine),
      abilities: scores,
      actions: actionIds,
      aiProfile: melee ? "aggressive_melee" : "boss_ranged_then_melee",
      cr,
      crValue: crValue(cr),
      creatureType: type,
      saves,
      damageResistances: splitTypes(resistLine),
      damageImmunities: splitTypes(immuneLine.split(";")[0] ?? immuneLine),
      damageVulnerabilities: splitTypes(vulnLine),
      traits: traitIds(traitsText),
      legendaryUses: legendaryUses || undefined,
      legendaryActions: legendaryActionIds.length ? legendaryActionIds : undefined,
      bonusActions: bonusActionIds.length ? bonusActionIds : undefined,
      multiattack: multiattack?.length ? multiattack : undefined,
      actionPool: actionIds,
    };
  }
  return { monsters, abilities, skipped };
}

let cache: SrdCompiled | undefined;

function knownSpellIds(): Set<string> {
  const ids = new Set<string>();
  const files = [
    path.join(CONTENT_ROOT, "abilities", "oneshot_v1.json"),
    path.join(CONTENT_ROOT, "rules", "srd51_combat.json"),
  ];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const json = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, { id?: string }>;
    for (const [k, v] of Object.entries(json)) {
      if (k.startsWith("spell_")) ids.add(k);
      if (v.id?.startsWith("spell_")) ids.add(v.id);
    }
  }
  return ids;
}

export function loadSrdCatalog(): SrdCompiled {
  if (cache) return cache;
  const file = path.join(CONTENT_ROOT, "srd", "monsters-A-Z.md");
  if (!fs.existsSync(file)) {
    cache = { monsters: {}, abilities: {}, skipped: [] };
    return cache;
  }
  cache = parseSrdMarkdown(fs.readFileSync(file, "utf8"), knownSpellIds());
  return cache;
}

export function listArenaMonsters(): Array<{ id: string; name: string; cr: string; crValue: number; creatureType: string }> {
  const { monsters } = loadSrdCatalog();
  return Object.values(monsters)
    .map((m) => ({
      id: m.id,
      name: m.name,
      cr: m.cr ?? "0",
      crValue: m.crValue ?? 0,
      creatureType: m.creatureType ?? "monstrosity",
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function defaultMonsterId(level: number): string {
  const cap = level <= 1 ? 0.25 : level === 2 ? 1 : 2;
  const list = listArenaMonsters().filter((m) => m.crValue <= cap);
  return (list[0] ?? listArenaMonsters()[0])?.id ?? "giant_rat";
}

export function mergeSrdInto(snap: { monsters: Record<string, MonsterDef>; abilities: Record<string, AbilityDef> }): void {
  const srd = loadSrdCatalog();
  for (const [id, mon] of Object.entries(srd.monsters)) {
    if (!snap.monsters[id]) snap.monsters[id] = mon;
  }
  for (const [id, ab] of Object.entries(srd.abilities)) {
    if (!snap.abilities[id]) snap.abilities[id] = ab;
  }
}
