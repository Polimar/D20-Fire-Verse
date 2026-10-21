import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { test } from "node:test";
import {
  accountDb,
  authenticate,
  createUser,
  openAuth,
  registerPlayer,
} from "../src/local/auth.js";
import { mountAccountRoutes } from "../src/local/admin-http.js";
import { boot } from "./helpers.js";

test("register rejects missing legal acceptance", async () => {
  boot();
  openAuth();
  await assert.rejects(
    () =>
      registerPlayer({
        username: "rowan",
        password: "secret",
        email: "rowan@example.com",
        firstName: "Rowan",
        lastName: "Ash",
        acceptedLegal: false,
      }),
    /LEGAL_REQUIRED/,
  );
});

test("authenticate accepts username or email", () => {
  boot();
  openAuth();
  createUser("brenna", "secret", "player");
  accountDb().prepare("UPDATE users SET email = ? WHERE username = ?").run("brenna@example.com", "brenna");
  assert.equal(authenticate("brenna", "secret").kind, "ok");
  assert.equal(authenticate("brenna@example.com", "secret").kind, "ok");
  assert.equal(authenticate("BRENNA@example.com", "secret").kind, "ok");
  assert.equal(authenticate("brenna", "wrong").kind, "bad");
});

test("privacy and terms pages are served", async () => {
  boot();
  openAuth();
  const app = express();
  mountAccountRoutes(app);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;
  try {
    const privacy = await fetch(`http://127.0.0.1:${port}/privacy`);
    assert.equal(privacy.status, 200);
    const privacyHtml = await privacy.text();
    assert.match(privacyHtml, /Privacy Policy/);
    assert.match(privacyHtml, /not affiliated/i);
    const terms = await fetch(`http://127.0.0.1:${port}/terms`);
    assert.equal(terms.status, 200);
    const termsHtml = await terms.text();
    assert.match(termsHtml, /Terms of Use/);
    assert.match(termsHtml, /SRD/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
