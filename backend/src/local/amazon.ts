/**
 * Login with Amazon. The Fire TV app hands over an access token from the LWA SDK; the website goes
 * through the authorization-code redirect. Either way the server checks the token belongs to our
 * security profile, reads the Amazon user id, and opens a normal table session.
 *
 * Off until AMAZON_CLIENT_ID and AMAZON_CLIENT_SECRET are set in the server environment.
 */

const API = "https://api.amazon.com";
const AUTHORIZE = "https://www.amazon.com/ap/oa";
const SCOPES = "profile profile:user_id";
const TIMEOUT_MS = 8000;

export type AmazonProfile = { amazonUserId: string; name?: string };

type AmazonConfig = { clientId: string; clientSecret: string };

export function amazonConfig(): AmazonConfig | null {
  const clientId = process.env.AMAZON_CLIENT_ID?.trim();
  const clientSecret = process.env.AMAZON_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
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
  const u = new URL(AUTHORIZE);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("scope", SCOPES);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  return u.toString();
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
 * A token from anywhere must have been issued to our security profile, or another app could sign
 * players in to this table with its own tokens.
 */
export async function verifyAccessToken(accessToken: unknown): Promise<AmazonProfile> {
  const { clientId } = requireConfig();
  if (typeof accessToken !== "string" || accessToken.length < 20 || accessToken.length > 4096) {
    throw new Error("AMAZON_FAILED");
  }
  const info = await amazonJson(`${API}/auth/o2/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
  if (info.aud !== clientId) {
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
