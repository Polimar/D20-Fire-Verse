/**
 * Fire TV dice. Each face is a short pre-rendered film, played by the hardware decoder.
 */

import { attackBanner, damageBanner, keptFace, rollTone } from "./dice-copy";
import { reducedMotion } from "./settings";
import { sfx } from "./sfx";
import type { DiceRoll } from "./types";

let host: HTMLElement | null = null;
let video: HTMLVideoElement | null = null;
let banner: HTMLElement | null = null;
let flash: HTMLElement | null = null;
let chain: Promise<void> = Promise.resolve();

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

function stage(): void {
  if (host) return;
  host = document.createElement("div");
  host.className = "dice-stage";
  host.hidden = true;
  video = document.createElement("video");
  video.className = "dice-film";
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.preload = "none";
  host.appendChild(video);
  banner = document.createElement("div");
  banner.className = "dice-banner";
  host.appendChild(banner);
  flash = document.createElement("div");
  flash.className = "dice-flash";
  host.appendChild(flash);
  document.body.appendChild(host);
}

function show(markup: { className: string; html: string }): void {
  stage();
  host!.hidden = false;
  host!.classList.remove("leaving");
  host!.classList.add("on");
  banner!.className = markup.className;
  banner!.innerHTML = markup.html;
}

async function hide(): Promise<void> {
  if (!host) return;
  host.classList.add("leaving");
  await wait(260);
  host.classList.remove("on", "leaving");
  host.hidden = true;
  if (banner) banner.className = "dice-banner";
  if (video) {
    video.removeAttribute("src");
    video.load();
  }
}

function filmOf(sides: number, face: number): string {
  const n = sides <= 4 ? 4 : sides <= 6 ? 6 : sides <= 8 ? 8 : sides <= 10 ? 10 : sides <= 12 ? 12 : 20;
  const f = Math.min(n, Math.max(1, Math.round(face)));
  return `/dice/d${n}-${String(f).padStart(2, "0")}.webm`;
}

function playFilm(sides: number, face: number): Promise<void> {
  stage();
  const clip = video!;
  clip.src = filmOf(sides, face);
  if (reducedMotion()) clip.playbackRate = 4;
  const ended = new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clip.removeEventListener("ended", finish);
      clip.removeEventListener("error", finish);
      resolve();
    };
    clip.addEventListener("ended", finish);
    clip.addEventListener("error", finish);
    window.setTimeout(finish, 6500);
  });
  const started = clip.play();
  if (started) started.catch(() => undefined);
  return ended;
}

function flashScreen(kind: "crit" | "fumble"): void {
  if (!flash || reducedMotion()) return;
  flash.className = `dice-flash ${kind}`;
  void flash.offsetWidth;
  flash.classList.add("go");
}

async function play(roll: DiceRoll, extra: DiceRoll[], fast: boolean, hold: boolean): Promise<void> {
  stage();
  const face = keptFace(roll);
  const tone = rollTone(roll);
  host!.hidden = false;
  host!.classList.remove("leaving");
  host!.classList.add("on");
  banner!.className = "dice-banner";
  sfx("dice", { gain: 0.9 });
  await playFilm(20, face);
  show(attackBanner(roll, extra));
  if (tone === "crit") {
    sfx("crit");
    flashScreen("crit");
    await wait(fast ? 900 : 1500);
  } else if (tone === "fumble") {
    sfx("fumble");
    flashScreen("fumble");
    await wait(fast ? 700 : 1100);
  } else {
    await wait(fast ? 850 : 1200);
  }
  if (!hold) await hide();
}

export function rollD20(roll: DiceRoll, opts: { extra?: DiceRoll[]; fast?: boolean; hold?: boolean } = {}): Promise<void> {
  const next = chain.then(() => play(roll, opts.extra ?? [], !!opts.fast, !!opts.hold));
  chain = next.catch(() => undefined);
  return next;
}

export function showDamagePreview(_dice: Array<{ sides: number; damageType: string }>): Promise<void> {
  const next = chain.then(async () => {
    show({
      className: "dice-banner show neutral",
      html: `<p class="dice-who">Damage</p><p class="dice-headline">Ready</p><p class="dice-detail">Swipe to throw every die</p>`,
    });
  });
  chain = next.catch(() => undefined);
  return next;
}

function rolledFaces(rolls: DiceRoll[]): Array<{ sides: number; value: number }> {
  const out: Array<{ sides: number; value: number }> = [];
  for (const roll of rolls) {
    for (let i = 0; i < roll.values.length; i += 1) {
      const sides = roll.sides[i] ?? 6;
      if (sides < 2) continue;
      out.push({ sides, value: roll.values[i] ?? 1 });
    }
  }
  return out;
}

export function throwDamage(rolls: DiceRoll[], opts: { fast?: boolean } = {}): Promise<void> {
  const next = chain.then(async () => {
    const faces = rolledFaces(rolls);
    if (!faces.length) return;
    stage();
    host!.hidden = false;
    host!.classList.remove("leaving");
    host!.classList.add("on");
    banner!.className = "dice-banner";
    sfx("dice", { gain: 0.9 });
    for (const face of faces) await playFilm(face.sides, face.value);
    show(damageBanner(rolls));
    await wait(opts.fast ? 900 : 1400);
    await hide();
  });
  chain = next.catch(() => undefined);
  return next;
}

export function warmDice(): void {
  /* The films decode on the hardware when a roll starts. */
}
