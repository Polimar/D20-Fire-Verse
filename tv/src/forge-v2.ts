/**
 * PG Builder V2 (web / Fire TV). Shared UI from protocol; D-pad uses focusable controls.
 */

import { mountForgeApp } from "@d20-fireverse/protocol/forge-app";
import "./styles.css";

const RETURN_FORGE = `/?return=${encodeURIComponent("/forge")}`;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}

function mount(): void {
  const root = document.querySelector<HTMLElement>("#forge-app");
  if (!root) return;
  document.body.classList.add("forge-page");
  void mountForgeApp(root, {
    api,
    loginHref: RETURN_FORGE,
    onAuthRequired: () => {
      window.location.replace(RETURN_FORGE);
    },
    onDone: () => {
      window.location.href = "/";
    },
    backLabel: "← Home",
    onBack: () => {
      window.location.href = "/";
    },
  });
}

mount();
