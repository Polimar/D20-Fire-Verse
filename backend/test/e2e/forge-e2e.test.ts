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
  assert.ok(fs.existsSync(path.join(tvDist, "forge.html")), "Run npm run build:tv before forge E2E tests");
});

test("forge page is not blank when logged out (auth wall or redirect)", async () => {
  const app = mountSite();
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const consoleErrors: string[] = [];
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));
    await page.goto(`${base}/forge`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const url = page.url();
    const onHome = url.includes("return=%2Fforge") || url.endsWith("/") || url.includes("?return=");
    const hasForgeUi =
      (await page.locator("#forgeForm, .forge-error, #loginGate").count()) > 0 ||
      (await page.locator("text=Sign in").count()) > 0;
    assert.ok(onHome || hasForgeUi, `expected auth UI, got url=${url} body=${await page.locator("body").innerText().catch(() => "")}`);
    const uncaughtPageError = consoleErrors.find((line) => /uncaught|unhandled/i.test(line));
    assert.equal(uncaughtPageError, undefined, consoleErrors.join("\n"));
  } finally {
    await browser.close();
    server.close();
  }
});

test("forge page shows builder form when logged in", async () => {
  const name = `forge${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  createUser(name, "password", "player");
  const { token } = login(name, "password")!;
  const app = mountSite();
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const consoleErrors: string[] = [];
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.addCookies([{ name: "fv_session", value: token, url: base }]);
    const page = await context.newPage();
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));
    await page.goto(`${base}/?builder=open`, { waitUntil: "domcontentloaded" });
    const form = page.locator(".hw");
    try {
      await form.waitFor({ state: "visible", timeout: 20_000 });
    } catch (err) {
      const snippet = await page.locator("body").innerText().catch(() => "");
      throw new Error(`${err instanceof Error ? err.message : err}\n--- page ---\n${snippet.slice(0, 800)}`);
    }
    assert.ok((await page.locator("[data-class]").count()) >= 1);
    assert.ok((await page.locator("#hwNext").count()) === 1);
    const uncaughtPageError = consoleErrors.find((line) => /uncaught|unhandled/i.test(line));
    assert.equal(uncaughtPageError, undefined, consoleErrors.join("\n"));
  } finally {
    await browser.close();
    server.close();
  }
});
