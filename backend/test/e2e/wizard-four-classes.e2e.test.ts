import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import http from "node:http";
import { before, test } from "node:test";
import { chromium, type Page } from "playwright";
import { createUser, login, openAuth } from "../../src/local/auth.js";
import { mountAccountRoutes } from "../../src/local/admin-http.js";
import { mountV2Routes } from "../../src/local/v2-http.js";
import { REPO_ROOT } from "../../src/local/paths.js";
import { boot } from "../helpers.js";

const tvDist = path.join(REPO_ROOT, "tv", "dist");
const SHOT = path.join(REPO_ROOT, "docs", "e2e", "wizard");

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
  if (fs.existsSync(path.join(tvDist, "index.html"))) app.use(express.static(tvDist));
  return app;
}

async function shot(page: Page, name: string): Promise<void> {
  await page
    .waitForFunction(() => /HP \d+/.test(document.querySelector(".hw-sheet")?.textContent ?? ""), undefined, { timeout: 8_000 })
    .catch(() => undefined);
  await page.evaluate(async () => {
    const running = document.getAnimations().filter((anim) => anim.playState === "running");
    await Promise.all(running.map((anim) => anim.finished.catch(() => undefined)));
  });
  const opacity = await page.evaluate(() => {
    const modal = document.querySelector<HTMLElement>("#heroWizard");
    const card = document.querySelector<HTMLElement>(".hero-wizard-card");
    const modalOpacity = modal ? Number(getComputedStyle(modal).opacity) : 1;
    const cardOpacity = card ? Number(getComputedStyle(card).opacity) : 1;
    return { modalOpacity, cardOpacity };
  });
  assert.ok(opacity.modalOpacity >= 0.99, `modal opacity ${opacity.modalOpacity} on ${name}`);
  assert.ok(opacity.cardOpacity >= 0.99, `card opacity ${opacity.cardOpacity} on ${name}`);
  await page.screenshot({ path: path.join(SHOT, `${name}.png`) });
}

async function forgeOne(page: Page, base: string, token: string, classId: string, heroName: string, label: string): Promise<void> {
  const catRes = await fetch(`${base}/api/builder/catalog`, { headers: { Cookie: `fv_session=${token}` } });
  assert.equal(catRes.status, 200);
  const cat = (await catRes.json()) as Cat;
  const cls = cat.classes.find((c) => c.id === classId);
  assert.ok(cls, classId);
  const bg = cat.backgrounds.find((b) => !cls!.skillList.slice(0, cls!.skillChoices).every((s) => b.skills.includes(s))) ?? cat.backgrounds[0]!;
  const originFeats = cat.feats.filter((f) => f.category === "origin");
  const species = originFeats.length ? cat.species.find((s) => s.id === "human") ?? cat.species[0]! : cat.species.find((s) => s.id !== "human") ?? cat.species[0]!;

  await page.goto(`${base}/?builder=open`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".hw", { timeout: 20_000 });
  await shot(page, `${label}-01-class`);
  await page.locator(`[data-class="${classId}"]`).click();
  await page.locator("#hwNext").click();
  await shot(page, `${label}-02-origin`);
  await page.locator(`[data-bg="${bg.id}"]`).click();
  await page.locator("#hwNext").click();
  await shot(page, `${label}-03-species`);
  await page.locator(`[data-species="${species.id}"]`).click();
  await page.locator("#hwNext").click();
  await shot(page, `${label}-04-scores`);
  await page.locator("#hwNext").click();
  await shot(page, `${label}-05-training`);
  const skills = cls.skillList.filter((id) => !bg.skills.includes(id)).slice(0, cls.skillChoices);
  assert.equal(skills.length, cls.skillChoices, `skills for ${classId}`);
  for (const id of skills) await page.locator(`[data-skill="${id}"]`).click();
  if (classId === "rogue") {
    const expert = [...new Set([...bg.skills, ...skills])].slice(0, 2);
    assert.equal(expert.length, 2);
    for (const id of expert) await page.locator(`[data-expert="${id}"]`).click();
  }
  if (cls.fightingStyleRequired && cls.fightingStyleFeatIds[0]) {
    await page.locator(`[data-style="${cls.fightingStyleFeatIds[0]}"]`).click();
  }
  if (species.id === "human") {
    const extra = Object.keys(cat.skills).find((id) => !skills.includes(id) && !bg.skills.includes(id));
    assert.ok(extra);
    await page.locator(`[data-hskill="${extra}"]`).click();
    assert.ok(originFeats[0]);
    await page.locator(`[data-ofeat="${originFeats[0]!.id}"]`).click();
  }
  await page.locator("#hwNext").click();
  await shot(page, `${label}-06-gear`);
  await page.locator("#hwNext").click();
  if ((cls.level1.cantrips ?? 0) + (cls.level1.preparedSpells ?? 0) + (cls.level1.spellsKnown ?? 0) > 0) {
    await shot(page, `${label}-07-spells`);
    const pool = cat.spells.filter((s) => s.classes.includes(classId));
    for (const spell of pool.filter((s) => s.level === 0).slice(0, cls.level1.cantrips ?? 0)) {
      await page.locator(`[data-spell="${spell.id}"][data-bag="cantrip"]`).click();
    }
    for (const spell of pool.filter((s) => s.level > 0).slice(0, cls.level1.preparedSpells ?? 0)) {
      await page.locator(`[data-spell="${spell.id}"][data-bag="prepared"]`).click();
    }
    for (const spell of pool.filter((s) => s.level > 0).slice(0, cls.level1.spellsKnown ?? 0)) {
      await page.locator(`[data-spell="${spell.id}"][data-bag="known"]`).click();
    }
    await page.locator("#hwNext").click();
  }
  await shot(page, `${label}-08-details`);
  await page.locator("#hwName").fill(heroName);
  await page.locator("#hwNext").click();
  await shot(page, `${label}-09-review`);
  const err = (await page.locator("#hwErr").textContent()) ?? "";
  assert.equal(err.trim(), "", err);
  await page.locator("#hwNext").click();
  await page.waitForSelector("#heroWizard[hidden], #pageHome", { timeout: 20_000 }).catch(() => undefined);
  await page.waitForFunction(() => document.querySelector("#heroWizard")?.hasAttribute("hidden") !== false, undefined, { timeout: 20_000 });
  await shot(page, `${label}-10-home`);
  const heroesRes = await fetch(`${base}/api/heroes`, { headers: { Cookie: `fv_session=${token}` } });
  const body = (await heroesRes.json()) as { heroes: Array<{ name: string; level: number }> };
  const hero = body.heroes.find((h) => h.name === heroName);
  assert.ok(hero, `${heroName} missing`);
  assert.equal(hero!.level, 1);
}

before(() => {
  boot();
  openAuth();
  fs.mkdirSync(SHOT, { recursive: true });
  assert.ok(fs.existsSync(path.join(tvDist, "index.html")));
});

const CLASSES = [
  ["fighter", "Martial"],
  ["wizard", "Arcane"],
  ["cleric", "Divine"],
  ["rogue", "Special"],
] as const;

test("TV 1920x1080 keyboard forges four classes", async () => {
  const user = `wiz${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  createUser(user, "password", "player");
  const { token } = login(user, "password")!;
  const app = mountSite();
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await context.addCookies([{ name: "fv_session", value: token, url: base }]);
    const page = await context.newPage();
    let i = 0;
    for (const [classId] of CLASSES) {
      i += 1;
      await forgeOne(page, base, token, classId, `Tv ${classId}`, `tv-${i}-${classId}`);
      await page.keyboard.press("Escape").catch(() => undefined);
    }
  } finally {
    await browser.close();
    server.close();
  }
});

test("phone 390x844 touch forges a fighter", async () => {
  const user = `ph${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  createUser(user, "password", "player");
  const { token } = login(user, "password")!;
  const app = mountSite();
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await context.addCookies([{ name: "fv_session", value: token, url: base }]);
    const page = await context.newPage();
    await forgeOne(page, base, token, "fighter", "Phone Fighter", "phone-fighter");
  } finally {
    await browser.close();
    server.close();
  }
});

test("TV D-pad moves the wizard with arrows and track skip", async () => {
  const user = `dp${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  createUser(user, "password", "player");
  const { token } = login(user, "password")!;
  const app = mountSite();
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await context.addCookies([{ name: "fv_session", value: token, url: base }]);
    const page = await context.newPage();
    await page.goto(`${base}/?builder=open`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".hw h2");
    await page.locator(".hw h2").first().waitFor();
    const title = async () => (await page.locator(".hw h2").innerText()).trim();
    assert.match(await title(), /class/i);
    await page.keyboard.press("ArrowDown");
    const focused = await page.evaluate(() => document.activeElement?.className ?? "");
    assert.match(focused, /hw-/);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "MediaTrackNext", bubbles: true })));
    await page.waitForTimeout(200);
    assert.match(await title(), /origin/i);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "MediaTrackPrevious", bubbles: true })));
    await page.waitForTimeout(200);
    assert.match(await title(), /class/i);
    await shot(page, "tv-dpad-class");
  } finally {
    await browser.close();
    server.close();
  }
});
