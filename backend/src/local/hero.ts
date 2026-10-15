/**
 * Account heroes, stash, and wallet. The server owns XP, equip, and gold.
 * Level 1 is a single class. A second class is only chosen at level-up.
 */

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ClassDef, ItemDef } from "@d20-fireverse/content-schema";
import {
  applyPick,
  blankProgress,
  canEquip,
  firstLevel,
  levelableClasses,
  levelForXp,
  milestoneReward,
  nextAsk,
  placeholderPrice,
  type CatalogSlice,
  type HeroRules,
  type ItemRules,
  type LevelPick,
  type LoadoutSlots,
  type PendingAsk,
  type ProgressionHero,
} from "@d20-fireverse/rules";
import { accountDb, type SessionUser } from "./auth.js";
import { enabledById, enabledClasses, enabledItems, enabledSpells, listCatalog, xpThresholds } from "./content-catalog.js";
import { classLevelCap } from "./coverage.js";
import { recordEvent } from "./events.js";
import { CONTENT_ROOT, DATA_DIR } from "./paths.js";

type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";
const ABILITIES: Ability[] = ["str", "dex", "con", "int", "wis", "cha"];

export type HeroRow = {
  id: string;
  userId: string;
  name: string;
  classes: Array<{ id: string; level: number; subclass?: string }>;
  species: string;
  background: string;
  alignment: string;
  level: number;
  xp: number;
  abilities: Record<Ability, number>;
  skills: string[];
  portrait: string | null;
  respecFreeCredits: number;
  features: string[];
  spells: string[];
  loadout: LoadoutSlots;
  pending: PendingAsk[];
  maxHp: number;
  deletedAt: string | null;
};

type StashRow = {
  id: string;
  userId: string;
  itemDefId: string;
  equippedBy: string | null;
  attunedBy: string | null;
};

const CLASS_PACK: Record<string, string> = {
  barbarian: "greataxe",
  bard: "dagger",
  cleric: "mace",
  druid: "quarterstaff",
  fighter: "longsword",
  monk: "quarterstaff",
  paladin: "longsword",
  ranger: "shortbow",
  rogue: "dagger",
  sorcerer: "dagger",
  warlock: "dagger",
  wizard: "quarterstaff",
};

function id(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function denylist(): string[] {
  const file = path.join(CONTENT_ROOT, "names", "denylist.txt");
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line && !line.startsWith("#"));
}

export function assertHeroName(name: string): string {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < 2 || clean.length > 32) throw new Error("NEED_NAME");
  const folded = clean.toLowerCase();
  const banned = denylist();
  const words = folded.split(/[^a-z0-9]+/);
  if (banned.some((word) => words.includes(word) || folded.includes(word))) throw new Error("NAME_DENIED");
  return clean;
}

function mapHero(row: Record<string, unknown>): HeroRow {
  const loadout = parseJson<LoadoutSlots>(String(row.loadout_json ?? "{}"), { trinkets: [], consumables: [] });
  loadout.trinkets = loadout.trinkets ?? [];
  loadout.consumables = loadout.consumables ?? [];
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    classes: parseJson(String(row.classes_json), []),
    species: String(row.species),
    background: String(row.background),
    alignment: String(row.alignment),
    level: Number(row.level),
    xp: Number(row.xp),
    abilities: parseJson(String(row.ability_scores_json), { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }),
    skills: parseJson(String(row.skills_json), []),
    portrait: row.portrait == null ? null : String(row.portrait),
    respecFreeCredits: Number(row.respec_free_credits ?? 0),
    features: parseJson(String(row.features_json ?? "[]"), []),
    spells: parseJson(String(row.spells_json ?? "[]"), []),
    loadout,
    pending: parseJson(String(row.pending_choices_json ?? "[]"), []),
    maxHp: Number(row.hp_current ?? 0),
    deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
  };
}

function saveHero(hero: HeroRow): void {
  accountDb()
    .prepare(
      `UPDATE heroes SET name=?, classes_json=?, species=?, background=?, alignment=?, level=?, xp=?,
        ability_scores_json=?, skills_json=?, portrait=?, respec_free_credits=?, features_json=?, spells_json=?, loadout_json=?
       WHERE id=?`,
    )
    .run(
      hero.name,
      JSON.stringify(hero.classes),
      hero.species,
      hero.background,
      hero.alignment,
      hero.level,
      hero.xp,
      JSON.stringify(hero.abilities),
      JSON.stringify(hero.skills),
      hero.portrait,
      hero.respecFreeCredits,
      JSON.stringify(hero.features),
      JSON.stringify(hero.spells),
      JSON.stringify(hero.loadout),
      hero.id,
    );
  accountDb().prepare("UPDATE heroes SET pending_choices_json = ?, hp_current = ? WHERE id = ?").run(JSON.stringify(hero.pending ?? []), hero.maxHp || null, hero.id);
}

export function toRules(hero: HeroRow): HeroRules {
  return {
    id: hero.id,
    name: hero.name,
    level: hero.level,
    xp: hero.xp,
    species: hero.species,
    alignment: hero.alignment,
    classes: hero.classes,
    abilities: hero.abilities,
    proficiency: hero.skills,
    features: hero.features,
    spells: hero.spells,
  };
}

function asItem(def: ItemDef): ItemRules {
  return {
    id: def.id,
    name: def.name,
    rarity: def.rarity,
    slot: def.slot,
    weaponId: def.weaponId,
    weaponMastery: def.weaponMastery,
    requires: def.requires,
    effects: def.effects,
  };
}

export function getHero(heroId: string): HeroRow | undefined {
  const row = accountDb().prepare("SELECT * FROM heroes WHERE id = ? AND deleted_at IS NULL").get(heroId) as Record<string, unknown> | undefined;
  return row ? mapHero(row) : undefined;
}

export function listHeroes(userId: string): HeroRow[] {
  const rows = accountDb().prepare("SELECT * FROM heroes WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at").all(userId) as Array<Record<string, unknown>>;
  return rows.map(mapHero);
}

function ensureWallet(userId: string): void {
  accountDb().prepare("INSERT OR IGNORE INTO account_wallet (user_id, gold_balance, hard_currency_balance) VALUES (?, 0, 0)").run(userId);
}

export function wallet(userId: string): { gold: number; hard: number } {
  ensureWallet(userId);
  const row = accountDb().prepare("SELECT gold_balance, hard_currency_balance FROM account_wallet WHERE user_id = ?").get(userId) as {
    gold_balance: number;
    hard_currency_balance: number;
  };
  return { gold: row.gold_balance, hard: row.hard_currency_balance };
}

export function grantGold(actor: SessionUser, userId: string, amount: number): { gold: number } {
  if (actor.role !== "admin") throw new Error("FORBIDDEN");
  if (!Number.isInteger(amount) || amount === 0) throw new Error("BAD_GOLD");
  ensureWallet(userId);
  accountDb().prepare("UPDATE account_wallet SET gold_balance = gold_balance + ? WHERE user_id = ?").run(amount, userId);
  recordEvent(userId, null, "gold", { delta: amount, reason: "admin" });
  return { gold: wallet(userId).gold };
}

function spend(userId: string, gold: number, hard = 0): void {
  const bag = wallet(userId);
  if (bag.gold < gold || bag.hard < hard) throw new Error("NEED_GOLD");
  accountDb()
    .prepare("UPDATE account_wallet SET gold_balance = gold_balance - ?, hard_currency_balance = hard_currency_balance - ? WHERE user_id = ?")
    .run(gold, hard, userId);
}

function classDef(id: string): ClassDef {
  const found = enabledById<ClassDef>("class", id);
  if (!found) throw new Error("CLASS_DISABLED");
  return found;
}

export function createHero(userId: string, input: {
  name: string;
  species: string;
  classId: string;
  background: string;
  alignment: string;
  abilities: Record<Ability, number>;
  skills?: string[];
  portrait?: string;
}): HeroRow {
  const name = assertHeroName(input.name);
  if (!enabledById("species", input.species)) throw new Error("SPECIES_DISABLED");
  if (!enabledById("background", input.background)) throw new Error("BACKGROUND_DISABLED");
  const cls = classDef(input.classId);
  for (const ability of ABILITIES) {
    const score = input.abilities[ability];
    if (!Number.isInteger(score) || score < 8 || score > 15) throw new Error("BAD_ABILITIES");
  }
  const heroId = id("hero");
  const features = cls.levels[0]?.features ?? [];
  const loadout: LoadoutSlots = { trinkets: [], consumables: [] };
  accountDb()
    .prepare(
      `INSERT INTO heroes (id, user_id, name, classes_json, species, background, alignment, level, xp, ability_scores_json, skills_json, portrait, respec_free_credits, features_json, spells_json, loadout_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, 0, ?, '[]', ?, ?)`,
    )
    .run(
      heroId,
      userId,
      name,
      JSON.stringify([{ id: cls.id, level: 1 }]),
      input.species,
      input.background,
      input.alignment,
      JSON.stringify(input.abilities),
      JSON.stringify(input.skills ?? []),
      input.portrait ?? null,
      JSON.stringify(features),
      JSON.stringify(loadout),
      new Date().toISOString(),
    );
  ensureWallet(userId);
  const packId = CLASS_PACK[cls.id];
  if (packId) giveItem(userId, packId, heroId);
  const hero = getHero(heroId);
  if (!hero) throw new Error("BAD_CHARACTER");
  const opened = firstLevel(blankProgress(toRules(hero), progressionCatalog()), progressionCatalog());
  hero.features = opened.features;
  hero.pending = opened.pending;
  hero.maxHp = opened.maxHp;
  saveHero(hero);
  recordEvent(userId, heroId, "hero_create", { classId: cls.id });
  return getHero(heroId) ?? hero;
}

function giveItem(userId: string, itemDefId: string, equipOn?: string): string {
  const instance = id("item");
  accountDb()
    .prepare(
      "INSERT INTO account_stash (id, user_id, item_def_id, item_instance_data_json, acquired_at) VALUES (?, ?, ?, '{}', ?)",
    )
    .run(instance, userId, itemDefId, new Date().toISOString());
  if (equipOn) {
    try {
      equip(userId, equipOn, instance);
    } catch {
      /* A disabled starter stays in the stash until an admin turns the item on. */
    }
  }
  return instance;
}

export function listStash(userId: string): StashRow[] {
  const rows = accountDb()
    .prepare("SELECT id, user_id, item_def_id, equipped_by_hero_id, attuned_by_hero_id FROM account_stash WHERE user_id = ?")
    .all(userId) as Array<{ id: string; user_id: string; item_def_id: string; equipped_by_hero_id: string | null; attuned_by_hero_id: string | null }>;
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    itemDefId: row.item_def_id,
    equippedBy: row.equipped_by_hero_id,
    attunedBy: row.attuned_by_hero_id,
  }));
}

export function stashView(userId: string): Array<StashRow & { name: string; inUseBy?: string }> {
  const heroes = new Map(listHeroes(userId).map((hero) => [hero.id, hero.name]));
  return (accountDb().prepare("SELECT * FROM account_stash WHERE user_id = ?").all(userId) as Array<Record<string, unknown>>).map((row) => {
    const equippedBy = row.equipped_by_hero_id == null ? null : String(row.equipped_by_hero_id);
    const def = enabledItems().find((item) => item.id === String(row.item_def_id));
    return {
      id: String(row.id),
      userId,
      itemDefId: String(row.item_def_id),
      equippedBy,
      attunedBy: row.attuned_by_hero_id == null ? null : String(row.attuned_by_hero_id),
      name: def?.name ?? String(row.item_def_id),
      ...(equippedBy ? { inUseBy: heroes.get(equippedBy) ?? equippedBy } : {}),
    };
  });
}

export type EquippedItem = { instanceId: string; slot: keyof LoadoutSlots; item: ItemDef; attuned: boolean };

/** What the hero carries into a fight. Items an admin switched off since they were equipped stay home. */
export function equippedGear(hero: HeroRow): EquippedItem[] {
  const rows = accountDb()
    .prepare("SELECT id, item_def_id, attuned_by_hero_id FROM account_stash WHERE equipped_by_hero_id = ?")
    .all(hero.id) as Array<{ id: string; item_def_id: string; attuned_by_hero_id: string | null }>;
  const byInstance = new Map(rows.map((row) => [row.id, row]));
  const slots: Array<[keyof LoadoutSlots, string | undefined]> = [
    ["armor", hero.loadout.armor],
    ["shield", hero.loadout.shield],
    ["mainhand", hero.loadout.mainhand],
    ["offhand", hero.loadout.offhand],
    ...hero.loadout.trinkets.map((id): [keyof LoadoutSlots, string] => ["trinkets", id]),
    ...hero.loadout.consumables.map((id): [keyof LoadoutSlots, string] => ["consumables", id]),
  ];
  const out: EquippedItem[] = [];
  for (const [slot, instanceId] of slots) {
    const row = instanceId ? byInstance.get(instanceId) : undefined;
    const item = row ? enabledById<ItemDef>("item", row.item_def_id) : undefined;
    if (!row || !item) continue;
    out.push({ instanceId: row.id, slot, item, attuned: row.attuned_by_hero_id === hero.id });
  }
  return out;
}

export function classPackWeapon(classId: string): string | undefined {
  return CLASS_PACK[classId];
}

function ownHero(userId: string, heroId: string): HeroRow {
  const hero = getHero(heroId);
  if (!hero || hero.userId !== userId) throw new Error("BAD_CHARACTER");
  return hero;
}

function attunedCount(heroId: string): number {
  const row = accountDb().prepare("SELECT COUNT(*) AS n FROM account_stash WHERE attuned_by_hero_id = ?").get(heroId) as { n: number };
  return row.n;
}

export function equip(userId: string, heroId: string, instanceId: string, inCombat = false): HeroRow {
  const hero = ownHero(userId, heroId);
  const row = accountDb().prepare("SELECT * FROM account_stash WHERE id = ? AND user_id = ?").get(instanceId, userId) as Record<string, unknown> | undefined;
  if (!row) throw new Error("NO_ITEM");
  if (row.equipped_by_hero_id && String(row.equipped_by_hero_id) !== heroId) {
    const other = getHero(String(row.equipped_by_hero_id));
    throw new Error(`ITEM_IN_USE_BY_HERO:${other?.name ?? "another hero"}`);
  }
  const def = enabledById<ItemDef>("item", String(row.item_def_id));
  if (!def) throw new Error("ITEM_DISABLED");
  const check = canEquip(toRules(hero), asItem(def), attunedCount(heroId));
  if (!check.ok) throw new Error(check.reason);
  if (def.requires?.attunement && inCombat) throw new Error("IN_COMBAT");
  const slot = def.slot;
  const replaced = slot === "trinket" || slot === "consumable" ? undefined : hero.loadout[slot];
  if (replaced && replaced !== instanceId) {
    accountDb()
      .prepare("UPDATE account_stash SET equipped_by_hero_id = NULL, attuned_by_hero_id = NULL WHERE id = ? AND equipped_by_hero_id = ?")
      .run(replaced, heroId);
  }
  accountDb().prepare("UPDATE account_stash SET equipped_by_hero_id = ? WHERE id = ?").run(heroId, instanceId);
  if (slot === "trinket") hero.loadout.trinkets = [...new Set([...hero.loadout.trinkets, instanceId])];
  else if (slot === "consumable") hero.loadout.consumables = [...new Set([...hero.loadout.consumables, instanceId])];
  else hero.loadout[slot] = instanceId;
  saveHero(hero);
  return hero;
}

export function unequip(userId: string, heroId: string, instanceId: string): HeroRow {
  const hero = ownHero(userId, heroId);
  accountDb()
    .prepare("UPDATE account_stash SET equipped_by_hero_id = NULL, attuned_by_hero_id = NULL WHERE id = ? AND user_id = ? AND equipped_by_hero_id = ?")
    .run(instanceId, userId, heroId);
  hero.loadout.armor = hero.loadout.armor === instanceId ? undefined : hero.loadout.armor;
  hero.loadout.shield = hero.loadout.shield === instanceId ? undefined : hero.loadout.shield;
  hero.loadout.mainhand = hero.loadout.mainhand === instanceId ? undefined : hero.loadout.mainhand;
  hero.loadout.offhand = hero.loadout.offhand === instanceId ? undefined : hero.loadout.offhand;
  hero.loadout.trinkets = hero.loadout.trinkets.filter((id) => id !== instanceId);
  hero.loadout.consumables = hero.loadout.consumables.filter((id) => id !== instanceId);
  saveHero(hero);
  return hero;
}

export function forceUnequip(userId: string, instanceId: string): void {
  const row = accountDb().prepare("SELECT equipped_by_hero_id FROM account_stash WHERE id = ? AND user_id = ?").get(instanceId, userId) as
    | { equipped_by_hero_id: string | null }
    | undefined;
  if (!row) throw new Error("NO_ITEM");
  if (row.equipped_by_hero_id) unequip(userId, row.equipped_by_hero_id, instanceId);
}

export function toggleAttune(userId: string, heroId: string, instanceId: string, inCombat = false): void {
  if (inCombat) throw new Error("IN_COMBAT");
  ownHero(userId, heroId);
  const row = accountDb().prepare("SELECT * FROM account_stash WHERE id = ? AND user_id = ?").get(instanceId, userId) as Record<string, unknown> | undefined;
  if (!row || String(row.equipped_by_hero_id ?? "") !== heroId) throw new Error("NO_ITEM");
  if (row.attuned_by_hero_id) {
    accountDb().prepare("UPDATE account_stash SET attuned_by_hero_id = NULL WHERE id = ?").run(instanceId);
    return;
  }
  if (attunedCount(heroId) >= 3) throw new Error("Attunement slots are full.");
  accountDb().prepare("UPDATE account_stash SET attuned_by_hero_id = ? WHERE id = ?").run(heroId, instanceId);
}

export function deleteHero(userId: string, heroId: string): void {
  ownHero(userId, heroId);
  accountDb().prepare("UPDATE account_stash SET equipped_by_hero_id = NULL, attuned_by_hero_id = NULL WHERE equipped_by_hero_id = ? OR attuned_by_hero_id = ?").run(heroId, heroId);
  accountDb().prepare("DELETE FROM hero_milestones WHERE hero_id = ?").run(heroId);
  accountDb().prepare("UPDATE heroes SET deleted_at = ? WHERE id = ?").run(new Date().toISOString(), heroId);
}

export function selectHero(userId: string, heroId: string): void {
  ownHero(userId, heroId);
  accountDb().prepare("UPDATE users SET selected_hero_id = ? WHERE id = ?").run(heroId, userId);
}

export function renameHero(userId: string, heroId: string, name: string, payWith: "gold" | "hard"): HeroRow {
  const hero = ownHero(userId, heroId);
  hero.name = assertHeroName(name);
  if (payWith === "hard") spend(userId, 0, 100);
  else spend(userId, 500, 0);
  saveHero(hero);
  recordEvent(userId, heroId, "gold", { delta: payWith === "hard" ? 0 : -500, reason: "rename" });
  return hero;
}

export function buyStarterBundle(userId: string, heroId: string, itemId: string, receipt: string): HeroRow {
  ownHero(userId, heroId);
  if (!/^iap_[A-Za-z0-9]{8,}$/.test(receipt)) throw new Error("BAD_RECEIPT");
  const def = enabledById<ItemDef>("item", itemId);
  if (!def || def.rarity !== "uncommon") throw new Error("BAD_ITEM");
  try {
    accountDb()
      .prepare("INSERT INTO iap_receipts (receipt, user_id, product_id, created_at) VALUES (?, ?, 'hero_starter_bundle', ?)")
      .run(receipt, userId, new Date().toISOString());
  } catch {
    throw new Error("RECEIPT_USED");
  }
  ensureWallet(userId);
  accountDb().prepare("UPDATE account_wallet SET gold_balance = gold_balance + 500 WHERE user_id = ?").run(userId);
  giveItem(userId, itemId);
  recordEvent(userId, heroId, "iap", { productId: "hero_starter_bundle", itemId });
  const hero = getHero(heroId);
  if (!hero) throw new Error("BAD_CHARACTER");
  return hero;
}

/** XP changes immediately. The level number waits until the encounter is over. */
export function addXp(heroId: string, amount: number, source: string): HeroRow {
  const hero = getHero(heroId);
  if (!hero) throw new Error("BAD_CHARACTER");
  hero.xp = Math.max(0, hero.xp + amount);
  saveHero(hero);
  recordEvent(hero.userId, heroId, "xp", { amount, source, xp: hero.xp });
  return hero;
}

export function canLevelUp(heroId: string): boolean {
  const hero = getHero(heroId);
  if (!hero) return false;
  return levelForXp(hero.xp, xpThresholds()) > hero.level;
}

export function progressionCatalog(): CatalogSlice {
  const inPlay = new Set(listCatalog().filter((row) => row.inPlay).map((row) => `${row.kind}:${row.id}`));
  const take = <T extends { id: string }>(kind: string, rows: T[]) => rows.filter((row) => inPlay.has(`${kind}:${row.id}`));
  return {
    classes: take("class", enabledClasses()).map((row) => ({ ...row, cap: classLevelCap(row.id) })) as CatalogSlice["classes"],
    subclasses: take("subclass", listCatalog().filter((row) => row.kind === "subclass").map((row) => enabledById<CatalogSlice["subclasses"][number]>("subclass", row.id)).filter((row): row is CatalogSlice["subclasses"][number] => Boolean(row))),
    feats: take("feat", listCatalog().filter((row) => row.kind === "feat").map((row) => enabledById<CatalogSlice["feats"][number]>("feat", row.id)).filter((row): row is CatalogSlice["feats"][number] => Boolean(row))),
    spells: take("spell", enabledSpells()),
    species: take("species", listCatalog().filter((row) => row.kind === "species").map((row) => enabledById<NonNullable<CatalogSlice["species"]>[number]>("species", row.id)).filter((row): row is NonNullable<CatalogSlice["species"]>[number] => Boolean(row))),
    xpThresholds: xpThresholds(),
  };
}

function toProgress(hero: HeroRow): ProgressionHero {
  return {
    ...toRules(hero),
    cantrips: [],
    pending: hero.pending,
    maxHp: hero.maxHp || 1,
  };
}

export function heroPending(heroId: string): boolean {
  const hero = getHero(heroId);
  if (!hero) return false;
  return nextAsk(toProgress(hero), progressionCatalog()) != null;
}

export function levelOptions(heroId: string): { ask: PendingAsk | null; classes: string[]; subclasses: string[]; feats: string[]; spells: string[] } {
  const hero = getHero(heroId);
  if (!hero) throw new Error("BAD_CHARACTER");
  const catalog = progressionCatalog();
  const ask = nextAsk(toProgress(hero), catalog);
  const classId = ask && "classId" in ask ? ask.classId : hero.classes[0]?.id;
  return {
    ask,
    classes: levelableClasses(toProgress(hero), catalog),
    subclasses: catalog.subclasses.filter((row) => row.classId === classId).map((row) => row.id),
    feats: catalog.feats.map((row) => row.id),
    spells: catalog.spells.filter((row) => !classId || row.classes.includes(classId)).map((row) => row.id),
  };
}

export function applyLevelUp(heroId: string, picks?: LevelPick): HeroRow {
  const hero = getHero(heroId);
  if (!hero) throw new Error("BAD_CHARACTER");
  const catalog = progressionCatalog();
  const ask = nextAsk(toProgress(hero), catalog);
  if (!ask) return hero;
  if (!picks) throw new Error("LEVEL_CHOICE");
  const progress = applyPick(toProgress(hero), picks, catalog);
  hero.level = progress.level;
  hero.classes = progress.classes;
  hero.abilities = progress.abilities;
  hero.features = progress.features;
  hero.skills = progress.proficiency;
  hero.spells = [...progress.spells, ...progress.cantrips];
  hero.pending = progress.pending;
  hero.maxHp = progress.maxHp;
  saveHero(hero);
  return hero;
}

function subclassIds(classId: string): string[] {
  return listCatalog()
    .filter((row) => row.kind === "subclass" && row.inPlay)
    .map((row) => row.id)
    .filter((subclassId) => enabledById<{ classId: string }>("subclass", subclassId)?.classId === classId);
}

function spellIds(classId: string): string[] {
  return enabledSpells().filter((spell) => spell.classes.includes(classId)).map((spell) => spell.id);
}

export function respec(_userId: string, _heroId: string): HeroRow {
  throw new Error("RESPEC_DISABLED");
}

export function setPreset(userId: string, heroId: string, name: string): void {
  const hero = ownHero(userId, heroId);
  accountDb()
    .prepare("INSERT INTO loadout_presets (id, user_id, hero_id, name, loadout_json) VALUES (?, ?, ?, ?, ?)")
    .run(id("preset"), userId, heroId, name.trim() || "Preset", JSON.stringify(hero.loadout));
}

export function listPresets(userId: string, heroId: string): Array<{ id: string; name: string }> {
  ownHero(userId, heroId);
  return accountDb().prepare("SELECT id, name FROM loadout_presets WHERE user_id = ? AND hero_id = ?").all(userId, heroId) as Array<{ id: string; name: string }>;
}

export function applyPreset(userId: string, heroId: string, presetId: string): HeroRow {
  const hero = ownHero(userId, heroId);
  const row = accountDb().prepare("SELECT loadout_json FROM loadout_presets WHERE id = ? AND user_id = ?").get(presetId, userId) as { loadout_json: string } | undefined;
  if (!row) throw new Error("NO_ITEM");
  hero.loadout = parseJson<LoadoutSlots>(row.loadout_json, { trinkets: [], consumables: [] });
  saveHero(hero);
  return hero;
}

export function noteMilestone(heroId: string, kind: string, count: number): { gold: number; cosmetic?: string } | null {
  const hero = getHero(heroId);
  if (!hero) return null;
  const prev = accountDb().prepare("SELECT count, achieved_at FROM hero_milestones WHERE hero_id = ? AND kind = ?").get(heroId, kind) as
    | { count: number; achieved_at: string | null }
    | undefined;
  if (prev && prev.count >= count && prev.achieved_at) return null;
  accountDb()
    .prepare(
      `INSERT INTO hero_milestones (hero_id, kind, count, achieved_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(hero_id, kind) DO UPDATE SET count = excluded.count, achieved_at = excluded.achieved_at`,
    )
    .run(heroId, kind, count, new Date().toISOString());
  const reward = milestoneReward(kind, count);
  if (!reward) return null;
  ensureWallet(hero.userId);
  accountDb().prepare("UPDATE account_wallet SET gold_balance = gold_balance + ? WHERE user_id = ?").run(reward.gold, hero.userId);
  if (reward.cosmetic) {
    accountDb().prepare("INSERT OR IGNORE INTO cosmetics (user_id, cosmetic_id) VALUES (?, ?)").run(hero.userId, reward.cosmetic);
  }
  return reward;
}

export function itemPrice(item: ItemDef): number {
  return item.priceGold ?? placeholderPrice(item.rarity);
}

export function archiveV1Once(): { characters: number; saves: number } {
  const marker = path.join(DATA_DIR, "v1-archived.marker");
  if (fs.existsSync(marker)) return { characters: 0, saves: 0 };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  let characters = 0;
  const custom = path.join(DATA_DIR, "custom-characters");
  if (fs.existsSync(custom)) {
    for (const name of fs.readdirSync(custom)) {
      if (!name.endsWith(".json")) continue;
      const file = path.join(custom, name);
      const data = JSON.parse(fs.readFileSync(file, "utf8")) as { legacy?: boolean };
      data.legacy = true;
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
      characters += 1;
    }
  }
  let saves = 0;
  const saveDir = path.join(DATA_DIR, "saves");
  if (fs.existsSync(saveDir)) {
    for (const name of fs.readdirSync(saveDir)) {
      if (!name.endsWith(".json")) continue;
      const file = path.join(saveDir, name);
      const data = JSON.parse(fs.readFileSync(file, "utf8")) as { archived?: boolean };
      data.archived = true;
      fs.writeFileSync(file, JSON.stringify(data));
      saves += 1;
    }
  }
  fs.writeFileSync(marker, new Date().toISOString());
  return { characters, saves };
}

export { placeholderPrice };
