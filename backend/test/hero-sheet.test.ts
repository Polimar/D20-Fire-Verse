import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { before, test } from "node:test";
import { accountDb, createUser, login, openAuth } from "../src/local/auth.js";
import { mountAccountRoutes } from "../src/local/admin-http.js";
import { mountBuilderRoutes } from "../src/local/builder-http.js";
import { commitBuilderDraft } from "../src/local/builder-commit.js";
import { resolveContent, setContentEnabled } from "../src/local/content-catalog.js";
import { equip } from "../src/local/hero.js";
import { heroDerivedSheet } from "../src/local/hero-sheet.js";
import { boot, masteryPicksForClass } from "./helpers.js";

before(() => {
  boot();
  openAuth();
});

function enableFighterKit(): void {
  for (const [kind, id] of [
    ["class", "fighter"],
    ["species", "human"],
    ["background", "soldier"],
    ["item", "greatsword"],
    ["item", "chain_mail"],
    ["feat", "defense"],
    ["feat", "savage_attacker"],
  ] as const) {
    if (kind === "feat" || kind === "item") resolveContent(kind, id, { adminNote: "hero sheet test" });
    setContentEnabled(kind, id, true);
  }
}

function fighterDraft() {
  return {
    name: "Sheet Test",
    classId: "fighter",
    speciesId: "human",
    backgroundId: "soldier",
    method: "standard_array" as const,
    baseAbilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    classSkills: ["perception", "survival"],
    fightingStyleFeatId: "defense",
    weaponMasteryWeaponIds: masteryPicksForClass("fighter"),
    speciesSkill: "insight",
    originFeatId: "savage_attacker",
    equipChoice: "A" as const,
    backgroundAsi: { mode: "plus2plus1" as const, plus2: "str" as const, plus1: "con" as const },
  };
}

test("GET /api/heroes/:id/sheet returns derived attacks and passive perception", async () => {
  enableFighterKit();
  const player = createUser(`sheet${randomUUID().replace(/-/g, "").slice(0, 8)}`, "password", "player");
  const { token } = login(player.username, "password")!;
  const hero = commitBuilderDraft(player, fighterDraft());

  const app = express();
  app.use(express.json());
  mountAccountRoutes(app);
  mountBuilderRoutes(app);
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;

  const res = await fetch(`http://127.0.0.1:${port}/api/heroes/${hero.id}/sheet`, {
    headers: { Cookie: `fv_session=${token}` },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { sheet: { attacks: Array<{ name: string }>; passivePerception: number } };
  assert.ok(body.sheet.passivePerception >= 10);
  assert.ok(body.sheet.attacks.length >= 1);
  assert.ok(body.sheet.attacks.some((a) => /unarmed|greatsword|longsword/i.test(a.name)));

  server.close();
});

test("equipping a greatsword from stash updates sheet attack rows", () => {
  enableFighterKit();
  const player = createUser(`seqp${randomUUID().replace(/-/g, "").slice(0, 8)}`, "password", "player");
  const hero = commitBuilderDraft(player, { ...fighterDraft(), name: "Equip Test", equipChoice: "B" });
  const before = heroDerivedSheet(player.id, hero.id);
  assert.ok(before);
  assert.ok(!before.attacks.some((a) => a.id === "gear_greatsword_attack"));

  const instance = `item_${randomUUID()}`;
  accountDb()
    .prepare("INSERT INTO account_stash (id, user_id, item_def_id, item_instance_data_json, acquired_at) VALUES (?, ?, ?, '{}', ?)")
    .run(instance, player.id, "greatsword", new Date().toISOString());
  equip(player.id, hero.id, instance);

  const after = heroDerivedSheet(player.id, hero.id);
  assert.ok(after);
  assert.ok(after.attacks.length >= 1);
  assert.ok(after.attacks.some((a) => /greatsword|longbow|unarmed/i.test(a.name)));
});
