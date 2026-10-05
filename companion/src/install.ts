/**
 * The QR opens this page in the phone's browser. If the controller is not installed yet, ask once.
 * Chrome can show its own install dialog; Safari on iPhone cannot, so the steps stay on the page.
 * The camera app only opens the default browser. It cannot choose Chrome or Safari.
 */

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const ASKED = "fireverse.install.asked";

function installed(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function ios(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

function remember(): void {
  try {
    sessionStorage.setItem(ASKED, "1");
  } catch {
    /* asking again next visit is fine */
  }
}

function sheet(iosDevice: boolean): void {
  if (document.getElementById("installSheet")) return;
  const el = document.createElement("div");
  el.id = "installSheet";
  el.className = "install";
  el.innerHTML = `
    <div class="install-card" role="dialog" aria-label="Install the controller">
      <img src="/companion/icons/icon-192.png" alt="" width="72" height="72" />
      <h2>Install the controller</h2>
      <p id="installCopy">${
        iosDevice
          ? "Tap the Share button in Safari, then Add to Home Screen. The camera opens this page; iPhone does not install it on its own."
          : "Add D20 FireVerse to your home screen so it opens full screen, without the browser bar."
      }</p>
      <button type="button" class="primary" id="installGo" hidden>Install</button>
      <button type="button" class="ghost" id="installLater">Not now</button>
    </div>`;
  document.body.appendChild(el);
  el.querySelector("#installLater")!.addEventListener("click", () => {
    remember();
    el.remove();
  });
}

function arm(prompt: InstallPrompt): void {
  const go = document.querySelector<HTMLButtonElement>("#installGo");
  const copy = document.getElementById("installCopy");
  if (go) {
    go.hidden = false;
    go.addEventListener("click", () => {
      void prompt.prompt().finally(() => {
        remember();
        document.getElementById("installSheet")?.remove();
      });
    });
  }
  if (copy) copy.textContent = "Add D20 FireVerse to your home screen. It opens full screen, without the browser bar.";
  void prompt.prompt().then(() => {
    remember();
    document.getElementById("installSheet")?.remove();
  }).catch(() => {
    /* Chrome kept the dialog for the Install button */
  });
}

export function mountInstall(): void {
  if (installed()) return;
  let asked = false;
  try {
    asked = sessionStorage.getItem(ASKED) === "1";
  } catch {
    asked = false;
  }
  if (asked) return;

  const apple = ios();
  sheet(apple);
  if (apple) return;

  window.addEventListener("beforeinstallprompt", (ev) => {
    ev.preventDefault();
    arm(ev as InstallPrompt);
  });
}
