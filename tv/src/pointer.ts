/**
 * The phone's trackpad as a mouse on the TV. Drags move an on-screen pointer, the control under it
 * takes focus (so the remote picks up exactly where the pointer left off), a tap presses it, and
 * Back steps out like the remote's Back. A remote key hides the pointer: the last command wins.
 */

import { FOCUSABLE, navScope } from "./nav";

export type TrackpadEvent =
  | { kind: "move"; dx: number; dy: number }
  | { kind: "tap" }
  | { kind: "scroll"; dy: number }
  | { kind: "pan"; dx: number; dy: number }
  | { kind: "zoom"; factor: number }
  | { kind: "back" }
  | { kind: "show" }
  | { kind: "hide" };

type PointerHooks = {
  /** Hover over the combat board: returns true when the board took the point. */
  boardPoint(x: number, y: number): boolean;
  /** Drag the zoomed map. Returns false when the map is still full-frame, so the drag moves the pointer. */
  boardPan(dx: number, dy: number): boolean;
  boardZoom(factor: number): boolean;
};

const IDLE_HIDE_MS = 6000;

let el: HTMLElement | null = null;
let x = 0;
let y = 0;
let visible = false;
let idleTimer = 0;
let hooks: PointerHooks = { boardPoint: () => false, boardPan: () => false, boardZoom: () => false };

function cursor(): HTMLElement {
  if (el) return el;
  el = document.createElement("div");
  el.className = "tv-pointer";
  el.setAttribute("aria-hidden", "true");
  el.hidden = true;
  document.body.appendChild(el);
  x = window.innerWidth / 2;
  y = window.innerHeight / 2;
  return el;
}

function paint(): void {
  cursor().style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

function show(): void {
  const c = cursor();
  if (!visible) {
    visible = true;
    c.hidden = false;
    paint();
  }
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(hide, IDLE_HIDE_MS);
}

function hide(): void {
  window.clearTimeout(idleTimer);
  visible = false;
  if (el) el.hidden = true;
}

function chromeBlocked(scope: HTMLElement): boolean {
  return scope.classList.contains("modal") || scope.id === "loginGate" || scope.classList.contains("chargen-panel");
}

/** What sits under the pointer. The D-pad stays in its scope; the phone may also press the top bar. */
function targetAt(px: number, py: number): { hit: Element | null; control: HTMLElement | null } {
  if (el) el.hidden = true;
  const hit = document.elementFromPoint(px, py);
  if (el && visible) el.hidden = false;
  const scope = navScope();
  const scoped = hit?.closest<HTMLElement>(FOCUSABLE) ?? null;
  if (scoped && scope.contains(scoped)) return { hit, control: scoped };
  if (!chromeBlocked(scope)) {
    const bar = hit?.closest<HTMLElement>("header.topbar button, header.topbar summary");
    if (bar) return { hit, control: bar };
  }
  return { hit, control: null };
}

function hover(): void {
  const { hit, control } = targetAt(x, y);
  if (hit?.closest("#board") && hooks.boardPoint(x, y)) return;
  if (control && document.activeElement !== control) control.focus({ preventScroll: true });
}

function closeSelectMenu(): void {
  document.getElementById("pointerSelect")?.remove();
}

/** A native select will not open from a phone tap, so the choices become buttons the pointer can press. */
function openSelectMenu(select: HTMLSelectElement): void {
  closeSelectMenu();
  const menu = document.createElement("div");
  menu.id = "pointerSelect";
  menu.className = "pointer-select";
  const rect = select.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 180))}px`;
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.minWidth = `${Math.max(rect.width, 160)}px`;
  for (const opt of select.options) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = opt.label;
    if (opt.disabled) b.disabled = true;
    if (opt.selected) b.classList.add("on");
    b.addEventListener("click", () => {
      select.value = opt.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      closeSelectMenu();
    });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  const overflow = menu.getBoundingClientRect().bottom - window.innerHeight + 12;
  if (overflow > 0) menu.style.top = `${Math.max(8, rect.bottom + 6 - overflow)}px`;
}

function scrollAt(dy: number): void {
  const { hit } = targetAt(x, y);
  let node: HTMLElement | null = hit instanceof HTMLElement ? hit : null;
  while (node) {
    const style = getComputedStyle(node);
    if ((style.overflowY === "auto" || style.overflowY === "scroll") && node.scrollHeight > node.clientHeight + 4) {
      node.scrollBy({ top: dy });
      return;
    }
    node = node.parentElement;
  }
  window.scrollBy({ top: dy });
}

function tap(): void {
  const { hit, control } = targetAt(x, y);
  const menuBtn = hit?.closest<HTMLButtonElement>("#pointerSelect button");
  if (menuBtn) {
    menuBtn.click();
    return;
  }
  closeSelectMenu();
  if (hit instanceof HTMLCanvasElement && hit.closest("#board")) {
    hit.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, bubbles: true, pointerType: "mouse" }));
    return;
  }
  const select = hit?.closest("select") ?? hit?.querySelector("select") ?? null;
  if (select instanceof HTMLSelectElement) {
    select.focus({ preventScroll: true });
    openSelectMenu(select);
    return;
  }
  if (!control) return;
  control.focus({ preventScroll: true });
  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) return;
  const chevron = hit?.closest<HTMLElement>("[data-dir]");
  if (chevron && control.contains(chevron)) {
    chevron.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return;
  }
  control.click();
}

function back(): void {
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true, cancelable: true }));
}

/** Phone pixels feel slow on a 1080p screen; quick flicks travel further than slow drags. */
function scale(dx: number, dy: number): number {
  const speed = Math.hypot(dx, dy);
  return 1.6 + Math.min(2.6, speed / 10);
}

export function onPointer(ev: TrackpadEvent): void {
  switch (ev.kind) {
    case "move": {
      show();
      const k = scale(ev.dx, ev.dy);
      x = Math.max(0, Math.min(window.innerWidth - 1, x + ev.dx * k));
      y = Math.max(0, Math.min(window.innerHeight - 1, y + ev.dy * k));
      paint();
      hover();
      return;
    }
    case "pan": {
      show();
      const k = scale(ev.dx, ev.dy);
      hooks.boardPan(ev.dx * k, ev.dy * k);
      return;
    }
    case "zoom":
      show();
      hooks.boardZoom(ev.factor);
      return;
    case "scroll": {
      show();
      const overMenu = targetAt(x, y).hit?.closest("#pointerSelect");
      if (overMenu) scrollAt(ev.dy);
      else {
        closeSelectMenu();
        scrollAt(ev.dy);
      }
      return;
    }
    case "tap":
      show();
      cursor().classList.remove("press");
      void cursor().offsetWidth;
      cursor().classList.add("press");
      tap();
      return;
    case "back":
      back();
      return;
    case "show":
      show();
      return;
    case "hide":
      hide();
      return;
    default: {
      const exhaustive: never = ev;
      void exhaustive;
    }
  }
}

export function mountPointer(next: PointerHooks): void {
  hooks = next;
  cursor();
  window.addEventListener("keydown", () => hide(), true);
  window.addEventListener("resize", () => {
    x = Math.min(x, window.innerWidth - 1);
    y = Math.min(y, window.innerHeight - 1);
    if (visible) paint();
  });
}
