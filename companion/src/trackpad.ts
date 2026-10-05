/**
 * A strip of the phone that drives the pointer on the TV. Drags send relative movement (batched per
 * frame so a slow link is not flooded), a short touch without movement is a tap: OK on the TV.
 */

type Send = (msg: Record<string, unknown>) => boolean;

const TAP_MS = 280;
const TAP_SLOP_PX = 8;

export function mountTrackpad(zone: HTMLElement, send: Send): void {
  const pts = new Map<number, { x: number; y: number }>();
  let lastX = 0;
  let lastY = 0;
  let travelled = 0;
  let downAt = 0;
  let pendingX = 0;
  let pendingY = 0;
  let frame = 0;
  let pinch = 0;
  let midX = 0;
  let midY = 0;
  let mode: "move" | "pinch" = "move";

  const flush = () => {
    frame = 0;
    const dx = Math.round(pendingX);
    const dy = Math.round(pendingY);
    if (!dx && !dy) return;
    pendingX -= dx;
    pendingY -= dy;
    send({ action: "POINTER", dx, dy });
  };

  const pair = () => [...pts.values()];

  zone.addEventListener("pointerdown", (ev) => {
    pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    try {
      zone.setPointerCapture(ev.pointerId);
    } catch {
      /* the zone still hears the release */
    }
    ev.preventDefault();
    if (pts.size === 1) {
      mode = "move";
      lastX = ev.clientX;
      lastY = ev.clientY;
      travelled = 0;
      downAt = performance.now();
      zone.classList.add("touching");
    } else if (pts.size >= 2) {
      mode = "pinch";
      const [a, b] = pair();
      pinch = a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
      midX = a && b ? (a.x + b.x) / 2 : ev.clientX;
      midY = a && b ? (a.y + b.y) / 2 : ev.clientY;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      pendingX = 0;
      pendingY = 0;
    }
  });

  zone.addEventListener("pointermove", (ev) => {
    const p = pts.get(ev.pointerId);
    if (!p) return;
    p.x = ev.clientX;
    p.y = ev.clientY;
    ev.preventDefault();
    if (pts.size >= 2 && mode === "pinch") {
      const [a, b] = pair();
      if (!a || !b) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const pdx = Math.round(cx - midX);
      const pdy = Math.round(cy - midY);
      midX = cx;
      midY = cy;
      if (pdx || pdy) send({ action: "POINTER_PAN", dx: pdx, dy: pdy });
      if (pinch > 8 && d > 8) {
        const factor = Math.max(0.85, Math.min(1.18, d / pinch));
        if (Math.abs(factor - 1) > 0.02) {
          send({ action: "POINTER_ZOOM", factor });
          pinch = d;
        }
      }
      return;
    }
    if (mode !== "move" || ev.pointerId !== pts.keys().next().value) return;
    const dx = ev.clientX - lastX;
    const dy = ev.clientY - lastY;
    lastX = ev.clientX;
    lastY = ev.clientY;
    travelled += Math.hypot(dx, dy);
    pendingX += dx;
    pendingY += dy;
    if (!frame) frame = requestAnimationFrame(flush);
  });

  const release = (ev: PointerEvent, cancelled: boolean) => {
    if (!pts.has(ev.pointerId)) return;
    const wasPinch = mode === "pinch";
    pts.delete(ev.pointerId);
    if (pts.size < 2) mode = "move";
    if (pts.size === 0) {
      zone.classList.remove("touching");
      if (frame) {
        cancelAnimationFrame(frame);
        flush();
      }
      if (!wasPinch && !cancelled && travelled < TAP_SLOP_PX && performance.now() - downAt < TAP_MS) {
        if (navigator.vibrate) navigator.vibrate(10);
        send({ action: "POINTER_TAP" });
      }
      return;
    }
    const left = pts.values().next().value;
    if (left) {
      lastX = left.x;
      lastY = left.y;
    }
  };
  zone.addEventListener("pointerup", (ev) => release(ev, false));
  zone.addEventListener("pointercancel", (ev) => release(ev, true));
}

/** A narrow wheel beside the trackpad. Dragging up or down scrolls the TV page. */
export function mountScrollWheel(zone: HTMLElement, send: Send): void {
  let active: number | null = null;
  let lastY = 0;
  let pending = 0;
  let frame = 0;

  const flush = () => {
    frame = 0;
    const dy = Math.round(pending);
    if (!dy) return;
    pending -= dy;
    send({ action: "POINTER_SCROLL", dy: dy * 3 });
  };

  zone.addEventListener("pointerdown", (ev) => {
    if (active !== null) return;
    active = ev.pointerId;
    lastY = ev.clientY;
    zone.classList.add("touching");
    try {
      zone.setPointerCapture(ev.pointerId);
    } catch {
      /* the wheel still hears the release */
    }
    ev.preventDefault();
  });
  zone.addEventListener("pointermove", (ev) => {
    if (ev.pointerId !== active) return;
    pending += ev.clientY - lastY;
    lastY = ev.clientY;
    if (!frame) frame = requestAnimationFrame(flush);
    ev.preventDefault();
  });
  const release = (ev: PointerEvent) => {
    if (ev.pointerId !== active) return;
    active = null;
    zone.classList.remove("touching");
    if (frame) {
      cancelAnimationFrame(frame);
      flush();
    }
  };
  zone.addEventListener("pointerup", release);
  zone.addEventListener("pointercancel", release);
}
