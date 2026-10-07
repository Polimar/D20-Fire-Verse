/**
 * Login with Amazon. The Fire TV app hands over an access token from the LWA SDK; the website goes
 * through the authorization-code redirect. Either way the server checks the token belongs to our
 * security profile, reads the Amazon user id, and opens a normal table session.
 *
 * The Client ID and Client Secret are saved from Manage the table → Amazon and apply on the next
 * sign-in, with no restart. Environment variables are only a fallback when nothing is saved.
 */

import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./paths.js";

const API = "https://api.amazon.com";
const AUTHORIZE = "https://www.amazon.com/ap/oa";
/**
 * `profile` returns the Amazon account id and the customer's name. It only works once the security
 * profile has a Consent Privacy Notice URL; without that URL Amazon rejects the scope.
 */
const SCOPES = "profile";
const TIMEOUT_MS = 8000;

export type AmazonProfile = { amazonUserId: string; name?: string };

type AmazonConfig = { clientId: string; clientSecret: string; androidClientId?: string };

const FILE = () => path.join(DATA_DIR, "amazon.json");

function fromEnv(): AmazonConfig | null {
  const clientId = process.env.AMAZON_CLIENT_ID?.trim();
  const clientSecret = process.env.AMAZON_CLIENT_SECRET?.trim();
  const androidClientId = process.env.AMAZON_ANDROID_CLIENT_ID?.trim();
  return clientId && clientSecret ? { clientId, clientSecret, androidClientId: androidClientId || undefined } : null;
}

/** What an admin saved. Missing or incomplete file means "not saved", never a thrown error. */
export function readAmazon(): AmazonConfig | null {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE(), "utf8")) as Partial<AmazonConfig>;
    const clientId = String(raw.clientId ?? "").trim();
    const clientSecret = String(raw.clientSecret ?? "").trim();
    const androidClientId = String(raw.androidClientId ?? "").trim();
    return clientId && clientSecret ? { clientId, clientSecret, androidClientId: androidClientId || undefined } : null;
  } catch {
    return null;
  }
}

/** A blank secret keeps the one already saved. Applies to the next sign-in without a restart. */
export function writeAmazon(next: { clientId: string; clientSecret: string }): void {
  const prev = readAmazon();
  const clientId = next.clientId.trim();
  const clientSecret = next.clientSecret.trim() || prev?.clientSecret || "";
  if (!clientId || !clientSecret) throw new Error("AMAZON_NOT_CONFIGURED");
  const androidClientId = prev?.androidClientId;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE(), JSON.stringify({ clientId, clientSecret, ...(androidClientId ? { androidClientId } : {}) }, null, 2), { mode: 0o600 });
}

export function clearAmazon(): void {
  try {
    fs.unlinkSync(FILE());
  } catch {
    /* already off */
  }
}

export function amazonStatus(): { configured: boolean; clientId: string; secretHint: string } {
  const cfg = readAmazon();
  if (!cfg) return { configured: false, clientId: "", secretHint: "" };
  return {
    configured: true,
    clientId: cfg.clientId,
    secretHint: cfg.clientSecret.length > 4 ? `••••${cfg.clientSecret.slice(-4)}` : "••••",
  };
}

export function amazonConfig(): AmazonConfig | null {
  return readAmazon() ?? fromEnv();
}

export function amazonEnabled(): boolean {
  return amazonConfig() !== null;
}

function requireConfig(): AmazonConfig {
  const config = amazonConfig();
  if (!config) throw new Error("AMAZON_NOT_CONFIGURED");
  return config;
}

async function amazonJson(url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new Error("AMAZON_FAILED");
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !body) {
    console.error(`Login with Amazon: ${new URL(url).pathname} answered ${res.status}`, body?.error ?? "");
    throw new Error("AMAZON_FAILED");
  }
  return body;
}

/** The browser leg: where "Continue with Amazon" sends the player. */
export function authorizeUrl(redirectUri: string, state: string): string {
  const { clientId } = requireConfig();
  return authorizeUrlFor(clientId, redirectUri, state, SCOPES);
}

/** Amazon reads '+' in scope as a plus, not a space, and answers invalid_scope. */
export function authorizeUrlFor(clientId: string, redirectUri: string, state: string, scope: string): string {
  const u = new URL(AUTHORIZE);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("scope", scope);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  return u.toString().replace(/\+/g, "%20");
}

export type AmazonProbe = { ok: boolean; lines: string[] };

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

function clip(text: string, max = 1600): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function htmlText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check a Client ID and secret against Amazon without saving them and without a player.
 * The authorize call must accept `profile`. The token call uses a dummy code: `invalid_grant`
 * means Amazon accepted the secret, `invalid_client` means it did not.
 */
export async function probeAmazon(input: { clientId: string; clientSecret: string; redirectUri: string }): Promise<AmazonProbe> {
  const lines: string[] = [];
  const say = (line: string) => lines.push(line);
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  const redirectUri = input.redirectUri.trim();
  let ok = true;

  say(`time: ${new Date().toISOString()}`);
  say("what this is: Login with Amazon SSO. A player approves on Amazon and comes back. No table username or password.");
  say(`redirect_uri: ${redirectUri}`);
  say(`scope_used_by_sign_in: ${SCOPES}`);
  say(`client_id: ${clientId || "(empty)"}`);
  say(
    clientSecret
      ? `client_secret: present, length ${clientSecret.length}, ends with ${clientSecret.slice(-4)}`
      : "client_secret: (empty)",
  );
  say("the secret itself is not in this log");

  if (!clientId || !clientSecret) {
    say("FAIL: paste the Client ID and the Client Secret from Web Settings. A blank secret uses the one already saved, if there is one.");
    say("RESULT: not ok. Copy this log.");
    return { ok: false, lines };
  }
  if (!/^amzn1\.application-oa2-client\.[A-Za-z0-9]+$/.test(clientId)) {
    ok = false;
    say("FAIL: this Client ID is not a web Login with Amazon id (amzn1.application-oa2-client.…). Copy it from Web Settings. The id under TVs and Other Devices is a different client.");
  } else {
    say("OK: Client ID shape is a web Login with Amazon client.");
  }
  try {
    const back = new URL(redirectUri);
    if (back.protocol !== "https:" || back.pathname !== "/api/login/amazon/callback") {
      ok = false;
      say(`FAIL: redirect URI must be https://<host>/api/login/amazon/callback. Got ${redirectUri}`);
    } else {
      say("OK: redirect URI path is /api/login/amazon/callback.");
    }
  } catch {
    ok = false;
    say(`FAIL: redirect URI is not a URL: ${redirectUri}`);
  }

  for (const scope of ["profile", "profile:user_id"]) {
    const required = scope === SCOPES;
    say(`--- authorize scope=${scope}${required ? " (this is the one Continue with Amazon uses)" : " (diagnostic only)"}`);
    const first = authorizeUrlFor(clientId, redirectUri, "probe", scope);
    const retry = new URL(first);
    retry.hostname = "www.amazon.it";
    let verdict: "signin" | "bad-scope" | "bad-redirect" | "unknown" = "unknown";
    let errMsg = "";
    for (const url of [first, retry.toString()]) {
      say(`GET ${url}`);
      try {
        const res = await fetch(url, {
          redirect: "manual",
          headers: {
            "User-Agent": BROWSER_UA,
            Accept: "text/html,application/xhtml+xml",
            "Accept-Encoding": "identity",
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const location = res.headers.get("location") ?? "";
        const text = htmlText(await res.text());
        say(`status: ${res.status}`);
        if (location) say(`location: ${clip(location, 400)}`);
        errMsg = text.match(/errorMsg[=:]([^\s]+)/)?.[1] ?? errMsg;
        if (errMsg) say(`amazon_error: ${errMsg}`);
        const signIn =
          res.status >= 300 &&
          res.status < 400 &&
          /\/ap\/(signin|register|mfa|challenge|cvf)/.test(location);
        const loginPage =
          res.status === 200 &&
          !/unknown scope|bad-scope/i.test(text) &&
          /password|ap_email|aPageStart|auth-email/i.test(text);
        const badScope = /bad-scope|unknown scope|invalid_scope/i.test(`${text} ${location}`);
        const badRedirect = /not been whitelisted|redirect URI you provided/i.test(text);
        const botWall = res.status === 503 || /Continue shopping|Robot Check|captcha/i.test(text);
        if (signIn || loginPage) {
          verdict = "signin";
          break;
        }
        if (badScope) {
          verdict = "bad-scope";
          break;
        }
        if (badRedirect) {
          verdict = "bad-redirect";
          break;
        }
        if (botWall) {
          say("WARN: Amazon showed a bot wall to this server. Retrying on www.amazon.it.");
          continue;
        }
        say(`body: ${clip(text)}`);
        break;
      } catch (err) {
        say(`FAIL: authorize request did not complete: ${err instanceof Error ? err.message : String(err)}`);
        break;
      }
    }
    if (verdict === "signin") {
      say(`OK: Amazon accepted scope "${scope}" and would show the Amazon account sign-in.`);
    } else if (verdict === "bad-scope") {
      if (required) {
        ok = false;
          say(`FAIL: Amazon rejected scope "${scope}" (${errMsg || "invalid_scope"}). The Client ID reached Amazon. This is not a copy mistake.`);
          say("Login with Amazon refuses profile until the consent screen has a Consent Privacy Notice URL. Set it in the Login with Amazon console, not under My Settings → General.");
      } else {
        say(`NOTE: Amazon rejected scope "${scope}" (${errMsg || "invalid_scope"}). Sign-in does not use it.`);
        say("That scope is the Amazon name and email. It stays off until the security profile → General → Consent Privacy Notice URL is https://www.d20fireverse.it and saved. Until then the new account is named adventurer.");
      }
    } else if (verdict === "bad-redirect") {
      if (required) ok = false;
      say("FAIL: Amazon rejected the return URL. Allowed Return URLs must contain exactly:");
      say(redirectUri);
    } else if (required) {
      say(`WARN: scope "${scope}" was not confirmed from this server because Amazon returned a bot wall. A browser is not blocked that way. The secret check is what decides this test.`);
    }
  }

  say("--- token endpoint, dummy authorization code (the secret is checked, nothing is saved)");
  try {
    const res = await fetch(`${API}/auth/o2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "ANfJabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOP",
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => null)) as { error?: string; error_description?: string } | null;
    say(`status: ${res.status}`);
    say(`error: ${body?.error ?? "(none)"}`);
    if (body?.error_description) say(`error_description: ${body.error_description}`);
    if (body?.error === "invalid_grant") {
      say("OK: Amazon accepted this Client ID and Client Secret. The dummy code was rejected, which is what a probe should see.");
    } else if (body?.error === "invalid_client") {
      ok = false;
      say("FAIL: Amazon rejected the Client ID or the Client Secret.");
      say("In Web Settings press Show Secret and paste that secret. Do not paste the Android/Kindle API key.");
    } else if (body?.error === "unauthorized_client") {
      ok = false;
      say("FAIL: this client cannot use the web sign-in grant. Use the Client ID and Client Secret from Web Settings, not a device client.");
    } else {
      ok = false;
      say("FAIL: unexpected token response.");
    }
  } catch (err) {
    ok = false;
    say(`FAIL: token request did not complete: ${err instanceof Error ? err.message : String(err)}`);
  }

  say(ok ? "RESULT: ok. Press Save, log out, then Continue with Amazon." : "RESULT: not ok. Copy this log.");
  return { ok, lines };
}

/** The redirect came back with a code: trade it for an access token. */
export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  const { clientId, clientSecret } = requireConfig();
  const body = await amazonJson(`${API}/auth/o2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });
  const token = body.access_token;
  if (typeof token !== "string" || !token) throw new Error("AMAZON_FAILED");
  return token;
}

/**
 * A token from the website or the Fire TV app must have been issued to one of our clients.
 * The Stick's API key is its own client id inside the same security profile; the web id alone
 * rejects that token.
 */
export async function verifyAccessToken(accessToken: unknown): Promise<AmazonProfile> {
  const allowed = acceptedAudiences(requireConfig());
  if (typeof accessToken !== "string" || accessToken.length < 20 || accessToken.length > 4096) {
    throw new Error("AMAZON_FAILED");
  }
  const info = await amazonJson(`${API}/auth/o2/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
  const aud = info.aud;
  const audiences = Array.isArray(aud) ? aud.map(String) : [String(aud ?? "")];
  if (!audiences.some((one) => allowed.has(one))) {
    console.error("Login with Amazon: token issued to another client");
    throw new Error("AMAZON_FAILED");
  }
  const profile = await amazonJson(`${API}/user/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const amazonUserId = profile.user_id;
  if (typeof amazonUserId !== "string" || !amazonUserId) throw new Error("AMAZON_FAILED");
  return { amazonUserId, name: typeof profile.name === "string" ? profile.name : undefined };
}

function acceptedAudiences(config: AmazonConfig): Set<string> {
  const extra = process.env.AMAZON_ANDROID_CLIENT_ID?.trim();
  return new Set([config.clientId, config.androidClientId, extra].filter((id): id is string => !!id));
}
