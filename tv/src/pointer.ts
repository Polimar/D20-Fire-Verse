/**
 * The phone's trackpad as a mouse on the TV. Drags move an on-screen pointer, the control under it
 * takes focus (so the remote picks up exactly where the pointer left off), a tap presses it, and
 * Back steps out like the remote's Back. A remote key hides the pointer: the last command wins.
 */

import { FOCUSABLE, navScope } from "./nav";

export type TrackpadEvent =
  | { kind: "move"; dx: number; dy: number }
  | { kind: "tap" }
  | { kind: "back" }
  | { kind: "show" }
  | { kind: "hide" };

type PointerHooks = {
  /** Hover over the combat board: returns true when the board took the point. */
  boardPoint(x: number, y: number): boolean;
};

const IDLE_HIDE_MS = 6000;

let el: HTMLElement | null = null;
let x = 0;
let y = 0;
let visible = false;
let idleTimer = 0;
let hooks: PointerHooks = { boardPoint: () => false };

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

/** What sits under the pointer, inside the screen the remote may roam right now. */
function targetAt(px: number, py: number): { hit: Element | null; control: HTMLElement | null } {
  if (el) el.hidden = true;
  const hit = document.elementFromPoint(px, py);
  if (el && visible) el.hidden = false;
  const control = hit?.closest<HTMLElement>(FOCUSABLE) ?? null;
  const scope = navScope();
  return { hit, control: control && scope.contains(control) ? control : null };
}

function hover(): void {
  const { hit, control } = targetAt(x, y);
  if (hit?.closest("#board") && hooks.boardPoint(x, y)) return;
  if (control && document.activeElement !== control) control.focus({ preventScroll: true });
}

function tap(): void {
  const { hit, control } = targetAt(x, y);
  if (hit instanceof HTMLCanvasElement && hit.closest("#board")) {
    hit.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, bubbles: true, pointerType: "mouse" }));
    return;
  }
  if (!control) return;
  control.focus({ preventScroll: true });
  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) return;
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
