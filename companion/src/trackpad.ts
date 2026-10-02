/**
 * A strip of the phone that drives the pointer on the TV. Drags send relative movement (batched per
 * frame so a slow link is not flooded), a short touch without movement is a tap: OK on the TV.
 */

type Send = (msg: Record<string, unknown>) => boolean;

const TAP_MS = 280;
const TAP_SLOP_PX = 8;

export function mountTrackpad(zone: HTMLElement, send: Send): void {
  let active: number | null = null;
  let lastX = 0;
  let lastY = 0;
  let travelled = 0;
  let downAt = 0;
  let pendingX = 0;
  let pendingY = 0;
  let frame = 0;

  const flush = () => {
    frame = 0;
    const dx = Math.round(pendingX);
    const dy = Math.round(pendingY);
    if (!dx && !dy) return;
    pendingX -= dx;
    pendingY -= dy;
    send({ action: "POINTER", dx, dy });
  };

  zone.addEventListener("pointerdown", (ev) => {
    if (active !== null) return;
    active = ev.pointerId;
    lastX = ev.clientX;
    lastY = ev.clientY;
    travelled = 0;
    downAt = performance.now();
    zone.classList.add("touching");
    try {
      zone.setPointerCapture(ev.pointerId);
    } catch {
      /* the zone still hears the release */
    }
    ev.preventDefault();
  });

  zone.addEventListener("pointermove", (ev) => {
    if (ev.pointerId !== active) return;
    const dx = ev.clientX - lastX;
    const dy = ev.clientY - lastY;
    lastX = ev.clientX;
    lastY = ev.clientY;
    travelled += Math.hypot(dx, dy);
    pendingX += dx;
    pendingY += dy;
    if (!frame) frame = requestAnimationFrame(flush);
    ev.preventDefault();
  });

  const release = (ev: PointerEvent, cancelled: boolean) => {
    if (ev.pointerId !== active) return;
    active = null;
    zone.classList.remove("touching");
    if (frame) {
      cancelAnimationFrame(frame);
      flush();
    }
    if (!cancelled && travelled < TAP_SLOP_PX && performance.now() - downAt < TAP_MS) {
      if (navigator.vibrate) navigator.vibrate(10);
      send({ action: "POINTER_TAP" });
    }
  };
  zone.addEventListener("pointerup", (ev) => release(ev, false));
  zone.addEventListener("pointercancel", (ev) => release(ev, true));
}
