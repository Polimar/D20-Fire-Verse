import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { before, test } from "node:test";
import { accountDb, createUser, login, openAuth } from "../src/local/auth.js";
import { mountAccountRoutes } from "../src/local/admin-http.js";
import { mountV2Routes } from "../src/local/v2-http.js";
import { commitBuilderDraft } from "../src/local/builder-commit.js";
import { resolveContent, setContentEnabled } from "../src/local/content-catalog.js";
import { boot } from "./helpers.js";

before(() => {
  boot();
  openAuth();
});

function enableFighter(): void {
  for (const [kind, id] of [
    ["class", "fighter"],
    ["species", "human"],
    ["background", "soldier"],
    ["feat", "defense"],
  ] as const) {
    if (kind === "feat") resolveContent(kind, id, { adminNote: "level-up flow" });
    setContentEnabled(kind, id, true);
  }
}

test("level-up API mirrors TV/companion flow (options then apply)", async () => {
  enableFighter();
  const player = createUser("lvflow1", "password", "player");
  const { token } = login("lvflow1", "password")!;
  const hero = commitBuilderDraft(player, {
    name: "Level Flow",
    classId: "fighter",
    speciesId: "human",
    backgroundId: "soldier",
    method: "standard_array",
    baseAbilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    classSkills: ["perception", "survival"],
    fightingStyleFeatId: "defense",
    equipChoice: "A",
    backgroundAsi: { mode: "plus2plus1", plus2: "str", plus1: "con" },
  });
  accountDb().prepare("UPDATE heroes SET xp = 300, pending_choices_json = '[]' WHERE id = ?").run(hero.id);

  const app = express();
  app.use(express.json());
  mountAccountRoutes(app);
  mountV2Routes(app);
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  const cookie = { Cookie: `fv_session=${token}` };

  const optsRes = await fetch(`http://127.0.0.1:${port}/api/heroes/${hero.id}/level-options`, { headers: cookie });
  assert.equal(optsRes.status, 200);
  const opts = (await optsRes.json()) as { ask?: { kind: string } };
  assert.equal(opts.ask?.kind, "class");

  const upRes = await fetch(`http://127.0.0.1:${port}/api/heroes/${hero.id}/level-up`, {
    method: "POST",
    headers: { ...cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "class", classId: "fighter" }),
  });
  assert.equal(upRes.status, 200);
  const body = (await upRes.json()) as { hero: { level: number } };
  assert.equal(body.hero.level, 2);

  server.close();
});
