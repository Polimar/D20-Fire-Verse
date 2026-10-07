import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";
import { announceScene } from "../src/local/alexa.js";
import { amazonEnabled, clearAmazon, probeAmazon, readAmazon, verifyAccessToken, writeAmazon } from "../src/local/amazon.js";
import { openAuth, signInWithAmazon, userFromToken } from "../src/local/auth.js";
import {
  claimConsole,
  consoleForKey,
  getConsole,
  issuePairToken,
  PAIR_TTL_MS,
  redeemPairToken,
  unlinkPhone,
} from "../src/local/companion-link.js";
import { arenaReady, arenaStart, createArena, createRoom, heroSheet, joinRoom } from "../src/local/room.js";
import { boot } from "./helpers.js";

before(() => {
  boot();
  openAuth();
});

const savedEnv = { ...process.env };
afterEach(() => {
  clearAmazon();
  for (const key of ["ALEXA_DEMO_WEBHOOK", "AMAZON_CLIENT_ID", "AMAZON_CLIENT_SECRET"]) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

let consoleSeq = 0;
const freshConsole = (userId = "user_tv") => {
  consoleSeq += 1;
  const id = `console-test-${String(consoleSeq).padStart(4, "0")}`;
  claimConsole(id, userId);
  return id;
};

// ------------------------------------------------------------------ pairing

test("a pair token links one phone once, and the key brings it back", () => {
  const id = freshConsole();
  const { token } = issuePairToken(id);
  const { consoleId, key } = redeemPairToken(token);
  assert.equal(consoleId, id);
  assert.equal(consoleForKey(key)?.id, id);
  assert.throws(() => redeemPairToken(token), /PAIR_EXPIRED/);
  assert.throws(() => issuePairToken(id), /PHONE_LINKED/);
});

test("a pair token stops working when it expires or a newer one is shown", () => {
  const id = freshConsole();
  const now = Date.now();
  const old = issuePairToken(id, now);
  assert.throws(() => redeemPairToken(old.token, now + PAIR_TTL_MS + 1), /PAIR_EXPIRED/);
  const first = issuePairToken(id, now);
  const second = issuePairToken(id, now);
  assert.throws(() => redeemPairToken(first.token, now), /PAIR_EXPIRED/);
  assert.equal(redeemPairToken(second.token, now).consoleId, id);
  assert.throws(() => redeemPairToken("not-a-real-token-at-all"), /PAIR_EXPIRED/);
  assert.throws(() => issuePairToken("console-nobody-claimed"), /BAD_CONSOLE/);
});

test("unlinking frees the TV for a new phone and voids the old key", () => {
  const id = freshConsole();
  const { key } = redeemPairToken(issuePairToken(id).token);
  assert.equal(unlinkPhone(id), true);
  assert.equal(consoleForKey(key), null);
  assert.equal(unlinkPhone(id), false);
  assert.ok(issuePairToken(id).token);
});

test("another account signing in on the same TV drops its phone", () => {
  const id = freshConsole("user_first");
  const { key } = redeemPairToken(issuePairToken(id).token);
  assert.equal(claimConsole(id, "user_first"), false);
  assert.equal(consoleForKey(key)?.id, id);
  assert.equal(claimConsole(id, "user_second"), true);
  assert.equal(consoleForKey(key), null);
  assert.equal(getConsole(id)?.userId, "user_second");
});

// ------------------------------------------------------------------ Alexa demo hook

type Posted = { url: string; body: Record<string, unknown> };
const recorder = () => {
  const posted: Posted[] = [];
  const post = (async (url: string | URL | Request, init?: RequestInit) => {
    posted.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  return { posted, post };
};

test("without ALEXA_DEMO_WEBHOOK no scene is ever posted", () => {
  delete process.env.ALEXA_DEMO_WEBHOOK;
  const { posted, post } = recorder();
  assert.equal(announceScene("ALEXA1", "explore", post), false);
  assert.equal(announceScene("ALEXA1", "combat", post), false);
  assert.equal(posted.length, 0);
});

test("with ALEXA_DEMO_WEBHOOK each scene change is posted once", () => {
  process.env.ALEXA_DEMO_WEBHOOK = "https://hooks.example.test/scene";
  const { posted, post } = recorder();
  assert.equal(announceScene("ALEXA2", "explore", post), true);
  assert.equal(announceScene("ALEXA2", "explore", post), false);
  assert.equal(announceScene("ALEXA2", "boss", post), true);
  assert.equal(announceScene("ALEXA3", "boss", post), true);
  assert.deepEqual(
    posted.map((p) => [p.url, p.body.roomCode, p.body.scene]),
    [
      ["https://hooks.example.test/scene", "ALEXA2", "explore"],
      ["https://hooks.example.test/scene", "ALEXA2", "boss"],
      ["https://hooks.example.test/scene", "ALEXA3", "boss"],
    ],
  );
  assert.equal(typeof posted[0]!.body.at, "string");
});

test("a webhook that is not an http(s) URL is ignored", () => {
  process.env.ALEXA_DEMO_WEBHOOK = "ftp://hooks.example.test/scene";
  const { posted, post } = recorder();
  assert.equal(announceScene("ALEXA4", "victory", post), false);
  assert.equal(posted.length, 0);
});

// ------------------------------------------------------------------ Login with Amazon

test("an Amazon account is created once and found again by its user id", () => {
  const first = signInWithAmazon({ amazonUserId: "amzn1.account.AAAATESTONE", name: "Ada Lovelace" });
  assert.equal(first.user.username, "Ada.Lovelace");
  assert.equal(userFromToken(first.token)?.id, first.user.id);
  const again = signInWithAmazon({ amazonUserId: "amzn1.account.AAAATESTONE", name: "Renamed On Amazon" });
  assert.equal(again.user.id, first.user.id);
  assert.equal(again.user.username, "Ada.Lovelace");
  const namesake = signInWithAmazon({ amazonUserId: "amzn1.account.AAAATESTTWO", name: "Ada Lovelace" });
  assert.notEqual(namesake.user.id, first.user.id);
  assert.equal(namesake.user.username, "Ada.Lovelace2");
  const nameless = signInWithAmazon({ amazonUserId: "amzn1.account.AAAATESTTHREE" });
  assert.equal(nameless.user.username, "adventurer");
  assert.throws(() => signInWithAmazon({ amazonUserId: "someone-else" }), /AMAZON_FAILED/);
});

test("an Amazon sign-in without a name takes the real name on the next visit and then keeps it", () => {
  const id = "amzn1.account.RENAMEONCE";
  const first = signInWithAmazon({ amazonUserId: id });
  assert.match(first.user.username, /^adventurer(\d+)?$/);
  const named = signInWithAmazon({ amazonUserId: id, name: "Valerio Canulli" });
  assert.equal(named.user.id, first.user.id);
  assert.equal(named.user.username, "Valerio.Canulli");
  const kept = signInWithAmazon({ amazonUserId: id, name: "Someone Else" });
  assert.equal(kept.user.username, "Valerio.Canulli");
});

test("an admin can turn Login with Amazon on without a restart, and a blank secret keeps the saved one", () => {
  delete process.env.AMAZON_CLIENT_ID;
  delete process.env.AMAZON_CLIENT_SECRET;
  assert.equal(amazonEnabled(), false);
  assert.throws(() => writeAmazon({ clientId: "amzn1.application-oa2-client.test", clientSecret: "" }), /AMAZON_NOT_CONFIGURED/);
  writeAmazon({ clientId: "amzn1.application-oa2-client.test", clientSecret: "secret-one" });
  assert.equal(amazonEnabled(), true);
  assert.equal(readAmazon()?.clientSecret, "secret-one");
  writeAmazon({ clientId: "amzn1.application-oa2-client.next", clientSecret: "" });
  assert.equal(readAmazon()?.clientId, "amzn1.application-oa2-client.next");
  assert.equal(readAmazon()?.clientSecret, "secret-one");
  clearAmazon();
  assert.equal(amazonEnabled(), false);
  process.env.AMAZON_CLIENT_ID = "amzn1.application-oa2-client.env";
  process.env.AMAZON_CLIENT_SECRET = "from-env";
  assert.equal(readAmazon(), null);
  assert.equal(amazonEnabled(), true);
});

test("the Amazon probe reports a rejected scope and a bad secret without saving anything", async () => {
  const redirectUri = "https://www.d20fireverse.it/api/login/amazon/callback";
  const clientId = "amzn1.application-oa2-client.probe";
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/ap/oa")) {
      const scope = new URL(url).searchParams.get("scope");
      if (scope === "profile") {
        return new Response("<p>An unknown scope was requested</p> errorMsg=lwa-invalid-parameter-bad-scope", { status: 400 });
      }
      return new Response(null, { status: 302, headers: { location: "https://www.amazon.com/ap/signin" } });
    }
    if (url.includes("/auth/o2/token")) return Response.json({ error: "invalid_client", error_description: "Client authentication failed" }, { status: 401 });
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  try {
    const report = await probeAmazon({ clientId, clientSecret: "secret-value", redirectUri });
    assert.equal(report.ok, false);
    assert.equal(readAmazon(), null);
    const log = report.lines.join("\n");
    assert.match(log, /Consent Privacy Notice URL/);
    assert.match(log, /invalid_client/);
    assert.doesNotMatch(log, /secret-value/);
    assert.match(log, /RESULT: not ok/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("the Amazon probe passes when the sign-in page opens and the secret is accepted", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/ap/oa")) return new Response(null, { status: 302, headers: { location: "https://www.amazon.com/ap/signin?openid=1" } });
    if (url.includes("/auth/o2/token")) return Response.json({ error: "invalid_grant", error_description: "The authorization code is invalid" }, { status: 400 });
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  try {
    const report = await probeAmazon({
      clientId: "amzn1.application-oa2-client.probe",
      clientSecret: "secret-value",
      redirectUri: "https://www.d20fireverse.it/api/login/amazon/callback",
    });
    assert.equal(report.ok, true);
    assert.match(report.lines.join("\n"), /RESULT: ok/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("an access token must belong to our security profile", async () => {
  delete process.env.AMAZON_CLIENT_ID;
  delete process.env.AMAZON_CLIENT_SECRET;
  await assert.rejects(verifyAccessToken("Atza|token-that-is-long-enough"), /AMAZON_NOT_CONFIGURED/);

  process.env.AMAZON_CLIENT_ID = "amzn1.application-oa2-client.ours";
  process.env.AMAZON_CLIENT_SECRET = "secret";
  const realFetch = globalThis.fetch;
  let audience = "amzn1.application-oa2-client.ours";
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/auth/o2/tokeninfo")) return Response.json({ aud: audience });
    if (url.endsWith("/user/profile")) return Response.json({ user_id: "amzn1.account.PROFILE", name: "Grace" });
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  try {
    assert.deepEqual(await verifyAccessToken("Atza|token-that-is-long-enough"), {
      amazonUserId: "amzn1.account.PROFILE",
      name: "Grace",
    });
    process.env.AMAZON_ANDROID_CLIENT_ID = "amzn1.application-oa2-client.stick";
    audience = "amzn1.application-oa2-client.stick";
    assert.deepEqual(await verifyAccessToken("Atza|token-that-is-long-enough"), {
      amazonUserId: "amzn1.account.PROFILE",
      name: "Grace",
    });
    delete process.env.AMAZON_ANDROID_CLIENT_ID;
    audience = "amzn1.application-oa2-client.someone-else";
    await assert.rejects(verifyAccessToken("Atza|token-that-is-long-enough"), /AMAZON_FAILED/);
    await assert.rejects(verifyAccessToken("short"), /AMAZON_FAILED/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ------------------------------------------------------------------ the phone's sheet

test("the phone gets the full sheet of the seated hero outside a fight", () => {
  const room = createRoom();
  assert.equal(heroSheet(room, "P1"), null);
  const { playerId } = joinRoom(room.roomCode, "Ada", "quill_ashmere");
  const sheet = heroSheet(room, playerId);
  assert.ok(sheet);
  assert.equal(sheet.name, "Quill Ashmere");
  assert.equal(sheet.level, 3);
  assert.equal(sheet.hp, sheet.maxHp);
  assert.equal(Object.keys(sheet.abilities).length, 6);
  assert.ok(sheet.spellSlots && Object.keys(sheet.spellSlots).length > 0);
});

test("in an arena the phone's sheet is the hero at the arena's level", () => {
  const room = createArena({ format: "pve_1v1", theme: "brewery", mapSize: "small", level: 1, privacy: "private" });
  const { playerId } = joinRoom(room.roomCode, "Ada", "brenna_ironveal", "user_arena_sheet");
  const sheet = heroSheet(room, playerId);
  assert.ok(sheet);
  assert.equal(sheet.level, 1);
  assert.equal(sheet.hp, sheet.maxHp);
  const campaign = createRoom();
  const seated = joinRoom(campaign.roomCode, "Ada", "brenna_ironveal");
  assert.ok(sheet.maxHp < heroSheet(campaign, seated.playerId)!.maxHp);

  arenaReady(room.roomCode, playerId);
  arenaStart(room.roomCode);
  const fighting = heroSheet(room, playerId);
  assert.equal(fighting?.level, 1);
  assert.equal(fighting?.maxHp, sheet.maxHp);
});
