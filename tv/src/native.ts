/**
 * The Fire TV app (firetv/) wraps the table in a WebView. It exposes `window.FireVerseApp`
 * and asks the page what Back means through `window.fireverseNative.back()`. Login with Amazon
 * answers through `window.fireverseNative.amazonToken()` / `amazonError()`.
 */

type AppBridge = {
  changeTable(): void;
  exit(): void;
  version(): string;
  /** Apps built before Login with Amazon do not have these. */
  amazonAvailable?(): boolean;
  amazonSignIn?(interactive: boolean): void;
  amazonSignOut?(): void;
};

type NativeHooks = {
  back(): "handled" | "exit";
  amazonToken(token: string): void;
  amazonError(code: string): void;
};

export function nativeApp(): AppBridge | null {
  return (window as unknown as { FireVerseApp?: AppBridge }).FireVerseApp ?? null;
}

/** The Fire TV shell appends this token to the WebView user agent. */
export function onFireTv(): boolean {
  if (typeof navigator !== "undefined" && /FireVerseTV\//.test(navigator.userAgent)) return true;
  return nativeApp() !== null;
}

let amazonListener: { token(t: string): void; error(code: string): void } = {
  token: () => undefined,
  error: () => undefined,
};

function hooks(): NativeHooks {
  const w = window as unknown as { fireverseNative?: NativeHooks };
  if (!w.fireverseNative) {
    w.fireverseNative = {
      back: () => "handled",
      amazonToken: (t) => amazonListener.token(t),
      amazonError: (code) => amazonListener.error(code),
    };
  }
  return w.fireverseNative;
}

/**
 * Back from the remote arrives outside the page's key events. It goes through the same
 * keydown path as Escape; if nothing claims it on `canExit()` screens, the app may close.
 */
export function registerNativeBack(canExit: () => boolean) {
  hooks().back = () => {
    const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
    const event = new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true, cancelable: true });
    const claimed = !target.dispatchEvent(event);
    return !claimed && canExit() ? "exit" : "handled";
  };
}

/** True inside a Fire TV app that carries the LWA SDK and its API key. */
export function nativeAmazonReady(): boolean {
  try {
    return nativeApp()?.amazonAvailable?.() === true;
  } catch {
    return false;
  }
}

/**
 * Ask the Fire TV app for an Amazon access token. `interactive: false` only succeeds when the
 * player approved this app before, so it can run silently at start.
 */
export function nativeAmazonSignIn(interactive: boolean, listener: { token(t: string): void; error(code: string): void }): boolean {
  const app = nativeApp();
  if (!app?.amazonSignIn) return false;
  hooks();
  amazonListener = listener;
  app.amazonSignIn(interactive);
  return true;
}

/** Log out forgets the Amazon approval too, so the next start does not sign the same account back in. */
export function nativeAmazonSignOut(): void {
  try {
    nativeApp()?.amazonSignOut?.();
  } catch {
    /* older app builds have no Amazon bridge */
  }
}
