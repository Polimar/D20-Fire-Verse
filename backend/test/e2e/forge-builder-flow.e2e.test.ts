import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import http from "node:http";
import { before, test } from "node:test";
import { chromium, type ConsoleMessage } from "playwright";
import { createUser, login, openAuth } from "../../src/local/auth.js";
import { mountAccountRoutes } from "../../src/local/admin-http.js";
import { mountV2Routes } from "../../src/local/v2-http.js";
import { ensureForgeContentDefaults } from "../../src/local/content-catalog.js";
import { REPO_ROOT } from "../../src/local/paths.js";
import { boot, enableMasteryWeapons } from "../helpers.js";

const tvDist = path.join(REPO_ROOT, "tv", "dist");
const SHOT_DIR = path.join(REPO_ROOT, "docs", "e2e", "forge-builder", "screenshots");

type Cat = {
  classes: Array<{
    id: string;
    fightingStyleRequired?: boolean;
    fightingStyleFeatIds: string[];
    weaponMastery?: boolean;
    weaponMasteryCountL1?: number;
  }>;
  masteryWeaponsByClass?: Record<string, Array<{ id: string; masteryId: string }>>;
};

function mountSite(): express.Express {
  const app = express();
  app.use(express.json());
  mountAccountRoutes(app);
  mountV2Routes(app);
  app.get(["/forge", "/forge/"], (_req, res) => {
    const page = path.join(tvDist, "forge.html");
    res.setHeader("Cache-Control", "no-store");
    if (fs.existsSync(page)) res.sendFile(page);
    else res.status(503).send("build tv first");
  });
  if (fs.existsSync(path.join(tvDist, "index.html"))) {
    app.use(express.static(tvDist));
  }
  return app;
}

before(() => {
  boot();
  openAuth();
  ensureForgeContentDefaults();
  enableMasteryWeapons();
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  assert.ok(fs.existsSync(path.join(tvDist, "forge.html")), "Run npm run build:tv before forge E2E tests");
});

test("logged-in forge flow: home button → L1 fighter class detail + mastery (with screenshots)", async () => {
  const user = `flow${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  createUser(user, "password", "player");
  const { token } = login(user, "password")!;
  const app = mountSite();
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const consoleErrors: string[] = [];
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addCookies([{ name: "fv_session", value: token, url: base }]);
    const page = await context.newPage();
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));

    const catRes = await fetch(`${base}/api/builder/catalog`, { headers: { Cookie: `fv_session=${token}` } });
    assert.equal(catRes.status, 200);
    const cat = (await catRes.json()) as Cat;
    const fighter = cat.classes.find((c) => c.id === "fighter");
    assert.ok(fighter);

    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#btnHeroBuilder", { timeout: 15_000 });
    await page.click("#btnHeroBuilder");
    await page.waitForSelector(".hw", { timeout: 20_000 });
    await page.screenshot({ path: path.join(SHOT_DIR, "01-home-hero-builder-button.png"), fullPage: true });
    await page.screenshot({ path: path.join(SHOT_DIR, "02-wizard-open.png"), fullPage: true });

    await page.locator('[data-class="fighter"]').click();
    await page.waitForSelector(".hw-detail");
    await page.screenshot({ path: path.join(SHOT_DIR, "03-fighter-preview.png"), fullPage: true });
    await page.locator('[data-class="fighter"]').click();
    assert.ok(await page.locator(".hw-badge", { hasText: "Selected" }).count());

    if (fighter.fightingStyleRequired && fighter.fightingStyleFeatIds[0]) {
      await page.locator(`[data-style="${fighter.fightingStyleFeatIds[0]}"]`).click();
    }
    if (fighter.weaponMastery && (fighter.weaponMasteryCountL1 ?? 0) > 0) {
      const need = fighter.weaponMasteryCountL1!;
      const pool = cat.masteryWeaponsByClass?.fighter ?? [];
      const picks: string[] = [];
      const props = new Set<string>();
      for (const w of pool) {
        if (props.has(w.masteryId)) continue;
        picks.push(w.id);
        props.add(w.masteryId);
        if (picks.length >= need) break;
      }
      assert.equal(picks.length, need, "fighter mastery picks");
      for (const id of picks) await page.locator(`[data-mastery-w="${id}"]`).first().click();
    }
    await page.screenshot({ path: path.join(SHOT_DIR, "04-fighter-mastery-fs.png"), fullPage: true });
    assert.equal(await page.locator("#hwNext").isDisabled(), false);

    await page.locator("#hwNext").click();
    await page.waitForFunction(() => /species/i.test(document.querySelector(".hw h2")?.textContent ?? ""));
    await page.screenshot({ path: path.join(SHOT_DIR, "05-species.png"), fullPage: true });

    const uncaughtPageError = consoleErrors.find((line) => /uncaught|unhandled/i.test(line));
    assert.equal(uncaughtPageError, undefined, consoleErrors.join("\n"));
  } finally {
    await browser.close();
    server.close();
  }
});
