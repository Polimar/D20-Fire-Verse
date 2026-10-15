import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import http from "node:http";
import { before, test } from "node:test";
import { chromium, devices, type Page } from "playwright";
import { createUser, login, openAuth } from "../../src/local/auth.js";
import { mountAccountRoutes } from "../../src/local/admin-http.js";
import { mountV2Routes } from "../../src/local/v2-http.js";
import { REPO_ROOT } from "../../src/local/paths.js";
import { boot } from "../helpers.js";

const companionDist = path.join(REPO_ROOT, "companion", "dist");
const SHOT = path.join(REPO_ROOT, "docs", "e2e", "companion-wizard");

type Cat = {
  classes: Array<{ id: string; skillChoices: number; skillList: string[]; fightingStyleRequired?: boolean; fightingStyleFeatIds: string[]; level1: { cantrips?: number; preparedSpells?: number; spellsKnown?: number } }>;
  backgrounds: Array<{ id: string; skills: string[] }>;
  species: Array<{ id: string }>;
  feats: Array<{ id: string; category: string }>;
  spells: Array<{ id: string; level: number; classes: string[] }>;
  skills: Record<string, { label: string }>;
};

function mountSite(): express.Express {
  const app = express();
  app.use(express.json());
  mountAccountRoutes(app);
  mountV2Routes(app);
  app.use("/companion", express.static(companionDist));
  return app;
}

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(async () => {
    const running = document.getAnimations().filter((anim) => anim.playState === "running");
    await Promise.all(running.map((anim) => anim.finished.catch(() => undefined)));
  });
  const opacity = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".pocket-forge") ?? document.querySelector<HTMLElement>(".hw");
    return shell ? Number(getComputedStyle(shell).opacity) : 1;
  });
  assert.ok(opacity >= 0.99, `companion wizard opacity ${opacity} on ${name}`);
  await page.screenshot({ path: path.join(SHOT, `${name}.png`) });
}

before(() => {
  boot();
  openAuth();
  fs.mkdirSync(SHOT, { recursive: true });
  assert.ok(fs.existsSync(path.join(companionDist, "index.html")), "companion dist missing — npm run build");
});

test("iPhone 13 companion PWA forges a wizard with touch", async () => {
  const iphone = devices["iPhone 13"];
  assert.equal(iphone.viewport?.width, 390);
  assert.equal(iphone.viewport?.height, 844);
  assert.equal(iphone.hasTouch, true);
  assert.equal(iphone.isMobile, true);

  const user = `cp${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  createUser(user, "password", "player");
  const { token } = login(user, "password")!;
  const app = mountSite();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  try {
    const context = await browser.newContext({ ...iphone });
    await context.addCookies([{ name: "fv_session", value: token, url: base }]);
    const page = await context.newPage();
    const catRes = await fetch(`${base}/api/builder/catalog`, { headers: { Cookie: `fv_session=${token}` } });
    assert.equal(catRes.status, 200);
    const cat = (await catRes.json()) as Cat;
    const cls = cat.classes.find((row) => row.id === "wizard");
    assert.ok(cls, "wizard");
    const bg = cat.backgrounds.find((row) => !cls.skillList.slice(0, cls.skillChoices).every((id) => row.skills.includes(id))) ?? cat.backgrounds[0]!;
    const originFeats = cat.feats.filter((feat) => feat.category === "origin");
    const species = originFeats.length ? cat.species.find((row) => row.id === "human") ?? cat.species[0]! : cat.species.find((row) => row.id !== "human") ?? cat.species[0]!;

    await page.goto(`${base}/companion/`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#pocketForge", { timeout: 20_000 });
    assert.equal(await page.locator("#heroWizard").count(), 0, "this run is the companion PWA, not the TV modal");
    await page.locator("#pocketForge").scrollIntoViewIfNeeded();
    await shot(page, "00-library");

    await page.locator("#pocketForge").tap();
    await page.waitForSelector(".hw.phone h2", { timeout: 20_000 });
    await page.waitForFunction(() => /HP \d+/.test(document.querySelector(".hw-sheet")?.textContent ?? ""), undefined, { timeout: 8_000 });
    await shot(page, "01-class");

    const peek = (await page.locator("#hwSheetPeek").innerText()).trim();
    assert.match(peek, /Pick \d+ class skills \(\d+\/\d+\)/);
    assert.doesNotMatch(peek, /NEED_/);
    await page.locator("#hwSheetPeek").tap();
    await page.waitForSelector(".hw-sheet.open");
    const sheet = (await page.locator("#hwSheet").innerText()).trim();
    assert.match(sheet, /Pick \d+ class skills \(\d+\/\d+\)/);
    assert.match(sheet, /Pick \d+ cantrips \(\d+\/\d+\)/);
    assert.match(sheet, /Prepare \d+ spells \(\d+\/\d+\)/);
    assert.doesNotMatch(sheet, /NEED_/);
    assert.doesNotMatch(await page.locator(".hw").innerText(), /NEED_/);
    await shot(page, "01-sheet");
    await page.locator("#hwSheetClose").tap();
    await page.waitForSelector(".hw-sheet.open", { state: "detached" });

    const chrome = await page.evaluate(() => {
      const body = document.querySelector<HTMLElement>(".hw-body");
      const nav = document.querySelector<HTMLElement>(".hw-nav");
      const cards = [...document.querySelectorAll<HTMLElement>(".hw-body .hw-card")];
      const last = cards[cards.length - 1];
      if (!body || !nav || !last) return null;
      body.scrollTop = body.scrollHeight;
      const navBox = nav.getBoundingClientRect();
      const bodyBox = body.getBoundingClientRect();
      const lastBox = last.getBoundingClientRect();
      return {
        cards: cards.length,
        navTop: navBox.top,
        navBottom: navBox.bottom,
        viewH: window.innerHeight,
        bodyBottom: bodyBox.bottom,
        lastTop: lastBox.top,
        lastBottom: lastBox.bottom,
        overflow: body.scrollHeight - body.clientHeight,
      };
    });
    assert.ok(chrome, "phone chrome");
    assert.ok(chrome.cards >= 4, "class list");
    assert.ok(chrome.navBottom <= chrome.viewH + 1, "nav stays inside the viewport");
    assert.ok(chrome.navTop > chrome.viewH * 0.72, "nav stays in the thumb zone");
    assert.ok(chrome.bodyBottom <= chrome.navTop + 2, "the list ends above Back / Next");
    assert.ok(chrome.lastBottom <= chrome.bodyBottom + 2, "the last class is inside the scroller");
    assert.ok(chrome.lastTop < chrome.viewH, "the last class is on screen after scrolling");
    await shot(page, "01-class-bottom");

    await page.locator('[data-class="wizard"]').tap();
    await page.locator("#hwNext").tap();
    await page.waitForFunction(() => /origin/i.test(document.querySelector(".hw h2")?.textContent ?? ""));
    await shot(page, "02-origin");
    await page.locator(`[data-bg="${bg.id}"]`).tap();
    await page.locator("#hwNext").tap();
    await page.waitForFunction(() => /species/i.test(document.querySelector(".hw h2")?.textContent ?? ""));
    await shot(page, "03-species");
    await page.locator(`[data-species="${species.id}"]`).tap();
    await page.locator("#hwNext").tap();
    await page.waitForFunction(() => /ability/i.test(document.querySelector(".hw h2")?.textContent ?? ""));
    await shot(page, "04-scores");
    await page.locator("#hwNext").tap();
    await page.waitForFunction(() => /training/i.test(document.querySelector(".hw h2")?.textContent ?? ""));
    await shot(page, "05-training");

    const skills = cls.skillList.filter((id) => !bg.skills.includes(id)).slice(0, cls.skillChoices);
    assert.equal(skills.length, cls.skillChoices);
    for (const id of skills) await page.locator(`[data-skill="${id}"]`).tap();
    if (species.id === "human") {
      const extra = Object.keys(cat.skills).find((id) => !skills.includes(id) && !bg.skills.includes(id));
      assert.ok(extra);
      await page.locator(`[data-hskill="${extra}"]`).tap();
      assert.ok(originFeats[0]);
      await page.locator(`[data-ofeat="${originFeats[0]!.id}"]`).tap();
    }
    await page.locator("#hwNext").tap();
    await page.waitForFunction(() => /gear/i.test(document.querySelector(".hw h2")?.textContent ?? ""));
    await shot(page, "06-gear");
    await page.locator("#hwNext").tap();

    if ((cls.level1.cantrips ?? 0) + (cls.level1.preparedSpells ?? 0) + (cls.level1.spellsKnown ?? 0) > 0) {
      await page.waitForFunction(() => /spell/i.test(document.querySelector(".hw h2")?.textContent ?? ""));
      await shot(page, "07-spells");
      const pool = cat.spells.filter((spell) => spell.classes.includes("wizard"));
      for (const spell of pool.filter((spell) => spell.level === 0).slice(0, cls.level1.cantrips ?? 0)) {
        await page.locator(`[data-spell="${spell.id}"][data-bag="cantrip"]`).tap();
      }
      for (const spell of pool.filter((spell) => spell.level > 0).slice(0, cls.level1.preparedSpells ?? 0)) {
        await page.locator(`[data-spell="${spell.id}"][data-bag="prepared"]`).tap();
      }
      for (const spell of pool.filter((spell) => spell.level > 0).slice(0, cls.level1.spellsKnown ?? 0)) {
        await page.locator(`[data-spell="${spell.id}"][data-bag="known"]`).tap();
      }
      await page.locator("#hwNext").tap();
    }

    await page.waitForFunction(() => /name/i.test(document.querySelector(".hw h2")?.textContent ?? ""));
    await shot(page, "08-details");
    await page.locator("#hwName").fill("Pocket Zephyr");
    await page.locator("#hwNext").tap();
    await page.waitForFunction(() => /review/i.test(document.querySelector(".hw h2")?.textContent ?? ""));
    await page.locator("#hwSheetPeek").tap();
    await page.waitForSelector(".hw-sheet.open");
    const review = (await page.locator("#hwSheet").innerText()).trim();
    assert.match(review, /AC 12/);
    assert.doesNotMatch(review, /NEED_/);
    await shot(page, "09-review");
    const err = ((await page.locator("#hwErr").textContent()) ?? "").trim();
    assert.equal(err, "", err);
    await page.locator("#hwNext").tap();
    await page.waitForSelector("#pocketForge", { timeout: 20_000 });
    await shot(page, "10-saved");

    const heroesRes = await fetch(`${base}/api/heroes`, { headers: { Cookie: `fv_session=${token}` } });
    const body = (await heroesRes.json()) as { heroes: Array<{ name: string; level: number }> };
    const hero = body.heroes.find((row) => row.name === "Pocket Zephyr");
    assert.ok(hero, "Pocket Zephyr missing");
    assert.equal(hero.level, 1);
  } finally {
    await browser.close();
    server.close();
  }
});
