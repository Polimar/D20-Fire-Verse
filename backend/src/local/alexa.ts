/**
 * Alexa demo hook. When a table's mood changes (explore, combat, boss, victory…) the server posts it
 * to ALEXA_DEMO_WEBHOOK, if that is set. Whatever listens there (a bridge you run to a virtual switch,
 * a light, an Echo routine) is outside the game. Without the variable nothing is called, and a
 * failing hook never reaches the players.
 */

const lastScene = new Map<string, string>();
const TIMEOUT_MS = 4000;

export function alexaWebhook(): string | null {
  const raw = process.env.ALEXA_DEMO_WEBHOOK?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Remember the scene and post it when it moved. Returns true when a post went out. */
export function announceScene(roomCode: string, scene: string, post: typeof fetch = fetch): boolean {
  if (lastScene.get(roomCode) === scene) return false;
  lastScene.set(roomCode, scene);
  const url = alexaWebhook();
  if (!url) return false;
  void post(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomCode, scene, at: new Date().toISOString() }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((err: unknown) => console.warn(`Alexa demo hook: ${err instanceof Error ? err.message : String(err)}`));
  return true;
}
