// Every icon, banner and store image comes from the two sources in brand/source.
// Run `npm run brand` after replacing a source; commit the outputs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EMBLEM = path.join(ROOT, "brand/source/emblem.jpg");
const BANNER = path.join(ROOT, "brand/source/banner.jpg");
const NIGHT = { r: 12, g: 9, b: 6, alpha: 1 };
/** Palette PNGs keep icons small enough for the APK and the first page load. */
const PNG = { palette: true, quality: 92, effort: 10, compressionLevel: 9 };

const out = (rel) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
};

/**
 * The emblem sits on pure black. Brightness becomes opacity, so fire and gold blend onto any dark surface.
 * `zoom` < 1 crops towards the die, which small icons need to stay readable.
 */
async function cutout(size, zoom = 1) {
  const meta = await sharp(EMBLEM).metadata();
  const side = Math.round(Math.min(meta.width, meta.height) * zoom);
  const { data, info } = await sharp(EMBLEM)
    .extract({
      left: Math.round((meta.width - side) / 2),
      top: Math.round((meta.height - side) / 2),
      width: side,
      height: side,
    })
    .resize(size, size, { kernel: "lanczos3" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const peak = Math.max(r, g, b);
    const a = Math.min(1, peak / 96);
    rgba[j] = a > 0 ? Math.min(255, Math.round(r / a)) : 0;
    rgba[j + 1] = a > 0 ? Math.min(255, Math.round(g / a)) : 0;
    rgba[j + 2] = a > 0 ? Math.min(255, Math.round(b / a)) : 0;
    rgba[j + 3] = Math.round(a * 255);
  }
  return sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

/** Below this size the flames swallow the die, so the crop tightens. */
const SMALL = 64;

/** The emblem on the app's night colour, scaled to `fill` of the square and centred. */
async function onNight(size, fill, file) {
  const inner = Math.round(size * fill);
  await sharp({ create: { width: size, height: size, channels: 4, background: NIGHT } })
    .composite([{ input: await cutout(inner, size <= SMALL ? 0.68 : 1), gravity: "center" }])
    .png(PNG)
    .toFile(out(file));
}

/** A transparent emblem on a transparent square, scaled to `fill`. */
async function transparent(size, fill, file) {
  const inner = Math.round(size * fill);
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await cutout(inner), gravity: "center" }])
    .png(PNG)
    .toFile(out(file));
}

async function banner(width, height, file) {
  const img = sharp(BANNER).resize(width, height, { fit: "cover", kernel: "lanczos3" }).flatten({ background: NIGHT });
  await (file.endsWith(".jpg") ? img.jpeg({ quality: 90, mozjpeg: true }) : img.png(PNG)).toFile(out(file));
}

// Website (the table) and its browser tab.
await onNight(32, 1, "tv/public/icons/favicon-32.png");
await onNight(192, 1, "tv/public/icons/icon-192.png");
await onNight(180, 1, "tv/public/icons/apple-touch-icon.png");
await onNight(512, 1, "tv/public/icons/icon-512.png");
await banner(1200, 675, "tv/public/icons/og-banner.jpg");

// Phone companion (PWA). Maskable keeps the emblem inside the 80% safe circle.
await onNight(192, 1, "companion/public/icons/icon-192.png");
await onNight(512, 1, "companion/public/icons/icon-512.png");
await onNight(512, 0.78, "companion/public/icons/maskable-512.png");

// Fire TV app.
for (const [dir, size] of [
  ["mdpi", 48],
  ["hdpi", 72],
  ["xhdpi", 96],
  ["xxhdpi", 144],
  ["xxxhdpi", 192],
]) {
  await onNight(size, 1, `firetv/app/src/main/res/mipmap-${dir}/ic_launcher.png`);
}
await transparent(432, 0.7, "firetv/app/src/main/res/drawable-nodpi/ic_launcher_foreground.png");
await transparent(440, 1, "firetv/app/src/main/res/drawable-nodpi/splash_mark.png");
await banner(320, 180, "firetv/app/src/main/res/drawable-xhdpi/banner.png");

// Uploads: Login with Amazon consent screen and Amazon Appstore listing.
await onNight(150, 1, "brand/export/amazon-consent-logo.png");
await onNight(512, 1, "brand/export/appstore-icon-512.png");
await onNight(114, 1, "brand/export/appstore-icon-114.png");
await banner(1280, 720, "brand/export/firetv-banner-1280x720.jpg");
await banner(1920, 1080, "brand/export/firetv-background-1920x1080.jpg");

console.log("brand assets written");
