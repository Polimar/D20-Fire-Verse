#!/usr/bin/env node
/**
 * Render d20 films with the table's own three.js die in headless Chromium.
 *
 *   node render.mjs --face 20 --seed 1            # one test film in tools/dice/out/
 *   node render.mjs --all --seed 1 --publish      # twenty films into tv/public/dice/
 *
 * Output is VP9 WebM with an alpha channel, so the film lies over the game.
 * Frames render at fps × blur and are averaged in premultiplied alpha for motion blur.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const ffmpeg = process.env.FFMPEG ?? path.join(os.homedir(), ".local/opt/ffmpeg/ffmpeg");
const libs = process.env.CHROME_LIBS ?? path.join(os.homedir(), ".local/opt/chromelibs/root/usr/lib/x86_64-linux-gnu");

function args() {
  const out = { face: 20, sides: 20, seed: 1, fps: 30, blur: 4, width: 1280, height: 720, all: false, every: false, publish: false, stills: false, solidFloor: false, track: false, jobs: 1, from: 1, to: 20 };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => Number(argv[++i]);
    if (a === "--face") out.face = next();
    else if (a === "--sides") out.sides = next();
    else if (a === "--seed") out.seed = next();
    else if (a === "--fps") out.fps = next();
    else if (a === "--blur") out.blur = next();
    else if (a === "--width") out.width = next();
    else if (a === "--height") out.height = next();
    else if (a === "--jobs") out.jobs = next();
    else if (a === "--from") out.from = next();
    else if (a === "--to") out.to = next();
    else if (a === "--all") out.all = true;
    else if (a === "--every") out.every = true;
    else if (a === "--publish") out.publish = true;
    else if (a === "--stills") out.stills = true;
    else if (a === "--solid-floor") out.solidFloor = true;
    else if (a === "--track") out.track = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

function run(cmd, list) {
  const r = spawnSync(cmd, list, { stdio: ["ignore", "ignore", "pipe"] });
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} failed: ${r.stderr.toString().slice(-800)}`);
}

async function renderOne(page, opts, sides, face, dest) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `d20-${face}-`));
  try {
    await page.reload();
    await page.waitForFunction(() => "film" in window);
    const { frames, settle, seed, track } = await page.evaluate(
      (o) => window.film.setup(o),
      { sides, face, seed: opts.seed + face * 7919 + sides * 104729, fps: opts.fps * opts.blur, width: opts.width, height: opts.height, solidFloor: opts.solidFloor },
    );
    const started = Date.now();
    if (opts.track) {
      console.log(`d${sides}-${face}  seed ${seed}  rest at ${(settle / (opts.fps * opts.blur)).toFixed(2)}s\n${track.join("\n")}`);
      return;
    }
    if (opts.stills) {
      const picks = [0.12, 0.25, 0.4, 0.6, 0.8].map((f) => Math.round(settle * f)).concat([settle, frames - 1]);
      const pngs = [];
      for (const i of picks) {
        const url = await page.evaluate((n) => window.film.frame(n), i);
        const file = path.join(work, `s${String(i).padStart(4, "0")}.png`);
        fs.writeFileSync(file, Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));
        pngs.push(file);
      }
      const bg = path.join(repo, "tv", "public", "art", "combat-rats.png");
      const inputs = pngs.flatMap((p) => ["-i", p]);
      const chains = pngs.map((_, k) => `[0]scale=${opts.width}:${opts.height}[b${k}];[b${k}][${k + 1}]overlay,scale=640:360[o${k}]`);
      const sheet = dest.replace(/\.webm$/, "-stills.png");
      run(ffmpeg, ["-y", "-hide_banner", "-i", bg, ...inputs, "-filter_complex", `${chains.join(";")};${pngs.map((_, k) => `[o${k}]`).join("")}xstack=inputs=${pngs.length}:layout=${pngs.map((_, k) => `${(k % 4) * 640}_${Math.floor(k / 4) * 360}`).join("|")}:fill=black`, "-frames:v", "1", sheet]);
      fs.copyFileSync(pngs[pngs.length - 1], dest.replace(/\.webm$/, "-rest.png"));
      console.log(`${path.basename(sheet)}  seed ${seed}  rest at ${(settle / (opts.fps * opts.blur)).toFixed(2)}s  ${((Date.now() - started) / 1000).toFixed(0)}s`);
      return;
    }
    for (let i = 0; i < frames; i += 1) {
      const url = await page.evaluate((n) => window.film.frame(n), i);
      fs.writeFileSync(path.join(work, `f${String(i).padStart(4, "0")}.png`), Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));
    }
    const blur = opts.blur > 1 ? `premultiply=inplace=1,tmix=frames=${opts.blur},unpremultiply=inplace=1,framestep=${opts.blur},` : "";
    run(ffmpeg, [
      "-y", "-hide_banner",
      "-framerate", String(opts.fps * opts.blur),
      "-i", path.join(work, "f%04d.png"),
      "-vf", `format=rgba,${blur}format=yuva420p`,
      "-r", String(opts.fps),
      "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p",
      "-b:v", "0", "-crf", "28", "-row-mt", "1", "-auto-alt-ref", "0",
      "-an", dest,
    ]);
    if (!opts.publish) {
      const still = path.join(path.dirname(dest), `${path.basename(dest, ".webm")}-rest.png`);
      fs.copyFileSync(path.join(work, `f${String(frames - 1).padStart(4, "0")}.png`), still);
    }
    const kb = Math.round(fs.statSync(dest).size / 1024);
    console.log(`${path.basename(dest)}  seed ${seed}  ${frames} frames (rest at ${(settle / (opts.fps * opts.blur)).toFixed(2)}s)  ${kb} KB  ${((Date.now() - started) / 1000).toFixed(0)}s`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

const DICE = [4, 6, 8, 10, 12, 20];

function snap(sides) {
  return DICE.find((n) => sides <= n) ?? 20;
}

function jobsOf(opts) {
  const kinds = opts.every ? DICE : [snap(opts.sides)];
  const jobs = [];
  for (const sides of kinds) {
    const faces = opts.all || opts.every ? Array.from({ length: sides }, (_, i) => i + 1) : [opts.face];
    for (const face of faces) {
      if (face < opts.from || face > opts.to) continue;
      jobs.push({ sides, face });
    }
  }
  if (!jobs.length) throw new Error("no films match those faces");
  return jobs;
}

async function main() {
  const opts = args();
  const outDir = opts.publish ? path.join(repo, "tv", "public", "dice") : path.join(here, "out");
  fs.mkdirSync(outDir, { recursive: true });
  const jobs = jobsOf(opts);
  const server = await createServer({
    root: here,
    configFile: false,
    logLevel: "error",
    server: { host: "127.0.0.1", port: 4391, strictPort: false, hmr: false, watch: null, fs: { allow: [repo, fs.realpathSync(path.join(repo, "node_modules")), fs.realpathSync(path.join(here, "node_modules"))] } },
    optimizeDeps: { include: ["three", "cannon-es"] },
  });
  await server.listen();
  const url = `${server.resolvedUrls.local[0]}film.html`;
  const browser = await chromium.launch({
    env: { ...process.env, LD_LIBRARY_PATH: [libs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":") },
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  try {
    const workers = Math.max(1, Math.min(opts.jobs, jobs.length));
    console.log(`rendering ${jobs.length} film${jobs.length === 1 ? "" : "s"} on ${workers} workers`);
    const pages = [];
    for (let i = 0; i < workers; i += 1) {
      const page = await browser.newPage({ viewport: { width: opts.width, height: opts.height }, deviceScaleFactor: 1 });
      page.on("pageerror", (e) => console.error("page:", e.message));
      await page.goto(url);
      pages.push(page);
    }
    let next = 0;
    const failed = [];
    await Promise.all(pages.map(async (page) => {
      for (;;) {
        const job = jobs[next];
        next += 1;
        if (!job) return;
        const name = opts.publish
          ? `d${job.sides}-${String(job.face).padStart(2, "0")}.webm`
          : `test-d${job.sides}-${job.face}-seed${opts.seed}.webm`;
        const dest = path.join(outDir, name);
        if (opts.publish && fs.existsSync(dest) && fs.statSync(dest).size > 50_000) {
          console.log(`skip ${name}`);
          continue;
        }
        try {
          await renderOne(page, opts, job.sides, job.face, dest);
        } catch (err) {
          failed.push(`d${job.sides}-${job.face}: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
          console.error(`FAILED d${job.sides}-${job.face}`);
        }
      }
    }));
    if (failed.length) {
      console.error(failed.join("\n"));
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
