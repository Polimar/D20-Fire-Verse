import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { before, test } from "node:test";
import { createUser, login, openAuth } from "../src/local/auth.js";
import { mountAccountRoutes } from "../src/local/admin-http.js";
import { mountV2Routes } from "../src/local/v2-http.js";
import { resolveContent, setContentEnabled } from "../src/local/content-catalog.js";
import { listHeroes, stashView } from "../src/local/hero.js";
import { deriveHero } from "@d20-fireverse/rules";
import { builderCatalog } from "../src/local/builder-catalog.js";
import { boot } from "./helpers.js";

before(() => {
  boot();
  openAuth();
});

function enableFighterLine(): void {
  for (const [kind, id] of [
    ["class", "fighter"],
    ["species", "human"],
    ["background", "soldier"],
    ["item", "longsword"],
    ["item", "chain_mail"],
    ["item", "greatsword"],
    ["item", "flail"],
    ["item", "javelin"],
    ["feat", "defense"],
    ["feat", "savage_attacker"],
  ] as const) {
    if (kind === "feat" || kind === "item") resolveContent(kind, id, { adminNote: "builder test" });
    setContentEnabled(kind, id, true);
  }
}

test("derive fighter L1 preview has HP and attacks", () => {
  enableFighterLine();
  const catalog = builderCatalog();
  const sheet = deriveHero(
    {
      classId: "fighter",
      speciesId: "human",
      backgroundId: "soldier",
      method: "standard_array",
      baseAbilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
      classSkills: ["perception", "survival"],
      fightingStyleFeatId: "defense",
      equipChoice: "A",
      backgroundAsi: { mode: "plus2plus1", plus2: "str", plus1: "con" },
    },
    catalog,
    { hitDie: 10, saves: ["str", "con"] },
  );
  assert.equal(sheet.ok, true);
  assert.ok(sheet.hp >= 10);
  assert.ok(sheet.attacks.some((a) => a.name.includes("Greatsword") || a.id === "greatsword"));
});

test("builder commit creates hero and stash", async () => {
  enableFighterLine();
  const player = createUser("builder1", "password", "player");
  const { token } = login("builder1", "password")!;
  const app = express();
  app.use(express.json());
  mountAccountRoutes(app);
  mountV2Routes(app);
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;

  const draft = {
    name: "Edda Forge",
    classId: "fighter",
    speciesId: "human",
    backgroundId: "soldier",
    method: "standard_array",
    baseAbilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    classSkills: ["perception", "survival"],
    fightingStyleFeatId: "defense",
    equipChoice: "A",
    backgroundAsi: { mode: "plus2plus1", plus2: "str", plus1: "con" },
  };

  const preview = await fetch(`http://127.0.0.1:${port}/api/builder/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `fv_session=${token}` },
    body: JSON.stringify(draft),
  });
  assert.equal(preview.status, 200);

  const commit = await fetch(`http://127.0.0.1:${port}/api/builder/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `fv_session=${token}` },
    body: JSON.stringify(draft),
  });
  assert.equal(commit.status, 200);
  const heroes = listHeroes(player.id);
  assert.equal(heroes.length, 1);
  assert.ok(heroes[0]!.id.startsWith("hero_"));
  assert.ok(stashView(player.id).length >= 1);
  server.close();
});
