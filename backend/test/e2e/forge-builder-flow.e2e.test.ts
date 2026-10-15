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
import { REPO_ROOT } from "../../src/local/paths.js";
import { boot } from "../helpers.js";

const tvDist = path.join(REPO_ROOT, "tv", "dist");
const SHOT_DIR = path.join(REPO_ROOT, "docs", "e2e", "forge-builder", "screenshots");

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
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  assert.ok(fs.existsSync(path.join(tvDist, "forge.html")), "Run npm run build:tv before forge E2E tests");
});

test("logged-in forge flow: home button → L1 fighter → saved hero (with screenshots)", async () => {
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

    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#btnHeroBuilder", { timeout: 15_000 });
    await page.screenshot({ path: path.join(SHOT_DIR, "01-home-hero-builder-button.png"), fullPage: true });

    await page.click("#btnHeroBuilder");
    await page.waitForURL(/\/forge/, { timeout: 10_000 });
    await page.waitForSelector("#forgeForm", { timeout: 20_000 });
    await page.screenshot({ path: path.join(SHOT_DIR, "02-forge-form-initial.png"), fullPage: true });

    await page.locator("#fgBg").selectOption("soldier");
    await page.locator("#fgClass").selectOption("fighter");
    await page.locator("#fgName").fill("Screenshot Hero");
    const scores: Record<string, string> = { str: "15", dex: "14", con: "13", int: "12", wis: "10", cha: "8" };
    for (const [ab, val] of Object.entries(scores)) {
      await page.locator(`select[data-ab="${ab}"]`).selectOption(val);
    }
    const asi2 = page.locator("#asi2");
    const asi1 = page.locator("#asi1");
    if ((await asi2.count()) > 0) {
      await asi2.selectOption("str");
      await asi1.selectOption("con");
    }
    await page.locator('input[data-skill="perception"]').check();
    await page.locator('input[data-skill="survival"]').check();
    const style = page.locator("#fgStyle");
    if ((await style.count()) > 0) {
      await style.selectOption("defense");
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOT_DIR, "03-forge-form-filled.png"), fullPage: true });

    const review = page.locator(".forge-review");
    await review.waitFor({ state: "visible", timeout: 10_000 });
    await page.screenshot({ path: path.join(SHOT_DIR, "04-forge-live-preview.png"), fullPage: true });

    await page.locator("#forgeForm button.primary").click();
    const errLine = page.locator("#fgErr");
    await Promise.race([
      page.waitForURL((url) => url.pathname === "/" || url.pathname === "", { timeout: 25_000 }),
      errLine
        .filter({ hasText: /\S/ })
        .waitFor({ timeout: 25_000 })
        .then(async () => {
          throw new Error(`Forge commit failed: ${await errLine.textContent()}`);
        }),
    ]);
    await page.screenshot({ path: path.join(SHOT_DIR, "05-after-commit-title.png"), fullPage: true });

    const heroesRes = await fetch(`${base}/api/heroes`, { headers: { Cookie: `fv_session=${token}` } });
    assert.equal(heroesRes.status, 200);
    const heroes = (await heroesRes.json()) as { heroes: Array<{ name: string }> };
    assert.ok(heroes.heroes.some((h) => h.name === "Screenshot Hero"), "hero should exist after commit");

    const uncaughtPageError = consoleErrors.find((line) => /uncaught|unhandled/i.test(line));
    assert.equal(uncaughtPageError, undefined, consoleErrors.join("\n"));
  } finally {
    await browser.close();
    server.close();
  }
});
