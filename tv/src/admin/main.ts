/** /admin: the operator portal. Separate bundle from the game; same host and session cookie. */

import "@fontsource/cinzel/700.css";
import "./admin.css";
import { activityPage } from "./pages/activity";
import { campaignsPage } from "./pages/campaigns";
import { contentPage } from "./pages/content";
import { labPage } from "./pages/lab";
import { mapsPage } from "./pages/maps";
import { overviewPage } from "./pages/overview";
import { roomsPage } from "./pages/rooms";
import { savesPage } from "./pages/saves";
import { amazonPage, mailPage } from "./pages/settings";
import { statsPage } from "./pages/stats";
import { shopPage } from "./pages/shop";
import { balancePage } from "./pages/balance";
import { systemPage } from "./pages/system";
import { usersPage } from "./pages/users";
import type { Overview, Page } from "./types";
import { api, closeDrawer, errorText, esc, fmtNum, setAuthLostHandler, toast } from "./ui";

type Me = { id: string; username: string; role: string };

const PAGES: Page[] = [
  overviewPage,
  usersPage,
  roomsPage,
  savesPage,
  campaignsPage,
  mapsPage,
  contentPage,
  labPage,
  shopPage,
  balancePage,
  statsPage,
  activityPage,
  mailPage,
  amazonPage,
  systemPage,
];

const root = document.getElementById("admin")!;
let me: Me | null = null;
let current: Page | null = null;
let renderSeq = 0;

function routeId(): string {
  return location.hash.replace(/^#\/?/, "").split("?")[0]!.split("/")[0] || "overview";
}

function navCount(page: Page, o: Overview | null): string {
  if (!o) return "";
  const n = page.count?.(o);
  if (!n) return "";
  return `<span class="count${n.alert ? " alert" : ""}">${fmtNum(n.value)}</span>`;
}

let overview: Overview | null = null;

export async function refreshCounts(): Promise<void> {
  try {
    overview = await api<Overview>("/api/admin/overview");
    paintNav();
  } catch {
    /* counts are decoration */
  }
}

function paintNav(): void {
  const nav = root.querySelector<HTMLElement>(".nav");
  if (!nav) return;
  const groups = new Map<string, Page[]>();
  for (const p of PAGES) groups.set(p.group, [...(groups.get(p.group) ?? []), p]);
  const id = routeId();
  nav.innerHTML = [...groups.entries()]
    .map(
      ([group, pages]) =>
        `<h6>${esc(group)}</h6>${pages
          .map((p) => `<a href="#/${p.id}" class="${p.id === id ? "on" : ""}" data-nav="${p.id}">${esc(p.label)}${navCount(p, overview)}</a>`)
          .join("")}`,
    )
    .join("");
}

function shell(): void {
  root.innerHTML = `<div class="shell">
    <aside class="side">
      <div class="brand"><img src="/icons/favicon-32.png" alt="" /><div><b>D20 FireVerse</b><small>Admin portal</small></div></div>
      <nav class="nav" aria-label="Admin sections"></nav>
      <div class="side-foot">
        <div class="who"><span class="avatar">${esc(me!.username.slice(0, 1).toUpperCase())}</span><div><b>${esc(me!.username)}</b><div class="faint">Admin</div></div></div>
        <div class="row"><a class="btn" href="/" style="height:28px;font-size:12.5px">Open the game</a><button type="button" class="sm" id="signOut">Sign out</button></div>
      </div>
    </aside>
    <main class="main" id="main"></main>
  </div>`;
  root.querySelector("#signOut")!.addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" }).catch(() => undefined);
    location.reload();
  });
  paintNav();
}

let skipRoute = false;

async function route(): Promise<void> {
  if (skipRoute) {
    skipRoute = false;
    return;
  }
  const id = routeId();
  const next = PAGES.find((p) => p.id === id) ?? overviewPage;
  if (current?.leave && !(await current.leave())) {
    skipRoute = true;
    history.back();
    return;
  }
  await closeDrawer();
  const seq = ++renderSeq;
  current = next;
  paintNav();
  document.title = `${next.label} · Admin · D20 FireVerse`;
  const main = root.querySelector<HTMLElement>("#main")!;
  main.scrollTop = 0;
  main.innerHTML = `<div class="loading">Loading ${esc(next.label)}…</div>`;
  try {
    await next.render(main, { isCurrent: () => seq === renderSeq, refreshCounts, me: me! });
  } catch (err) {
    if (seq !== renderSeq) return;
    main.innerHTML = `<div class="page"><div class="notice bad">${esc(next.label)} could not load: ${esc(errorText(err))}</div></div>`;
  }
}

function loginView(note = ""): void {
  root.innerHTML = `<div class="login"><div class="card">
      <form id="login">
        <div class="brand"><img src="/icons/favicon-32.png" alt="" /><div><b>D20 FireVerse</b><small>Admin portal</small></div></div>
        ${note ? `<div class="notice warn">${esc(note)}</div>` : ""}
        <label class="field"><span>Username</span><input name="username" autocomplete="username" required /></label>
        <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required /></label>
        <button type="submit" class="primary">Sign in</button>
        <p class="faint" style="margin:0">Only admin accounts can open this portal. Players sign in from the game.</p>
      </form></div></div>`;
  const form = root.querySelector<HTMLFormElement>("#login")!;
  form.querySelector("input")!.focus();
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const data = new FormData(form);
    try {
      await api("/api/login", { body: { username: data.get("username"), password: data.get("password") } });
      await boot();
    } catch (err) {
      toast("bad", "Sign-in failed", esc(errorText(err)));
    }
  });
}

async function boot(): Promise<void> {
  try {
    me = (await api<{ user: Me }>("/api/me")).user;
  } catch {
    loginView();
    return;
  }
  if (me.role !== "admin") {
    loginView(`${me.username} is a player account. Sign in with an admin account.`);
    return;
  }
  shell();
  await refreshCounts();
  await route();
}

setAuthLostHandler(() => {
  if (me) {
    me = null;
    loginView("Your session ended. Sign in again.");
  }
});

window.addEventListener("hashchange", () => {
  if (me) void route();
});

window.addEventListener("beforeunload", (ev) => {
  if (current?.dirty?.()) {
    ev.preventDefault();
    ev.returnValue = "";
  }
});

void boot();
