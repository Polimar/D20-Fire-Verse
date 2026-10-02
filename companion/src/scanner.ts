/**
 * The camera, and nothing else, until this phone is linked to a TV. Reads the TV's QR with the
 * browser's BarcodeDetector where it exists, else with jsQR on downscaled frames.
 */

import jsQR from "jsqr";

type Detector = { detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>> };
type DetectorCtor = {
  new (opts: { formats: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
};

export type ScanProblem = "insecure" | "denied" | "no-camera" | "failed";

export type ScannerHandle = { stop(): void };

const FRAME_MS = 180;
const MAX_SIDE = 720;

/** The pair token from a scanned D20 FireVerse link, or null for any other QR. */
export function pairTokenFrom(text: string): string | null {
  try {
    const url = new URL(text.trim());
    const token = url.searchParams.get("pair");
    if (!token || !url.pathname.startsWith("/companion")) return null;
    return /^[A-Za-z0-9_-]{16,64}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

async function nativeDetector(): Promise<Detector | null> {
  const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const formats = (await Ctor.getSupportedFormats?.()) ?? ["qr_code"];
    return formats.includes("qr_code") ? new Ctor({ formats: ["qr_code"] }) : null;
  } catch {
    return null;
  }
}

function problemOf(err: unknown): ScanProblem {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no-camera";
  return "failed";
}

/**
 * Start the camera in `video` and call `onText` for every QR it reads. `onProblem` explains why
 * the camera could not start; the caller shows only that, and a way to ask again.
 */
export async function startScanner(
  video: HTMLVideoElement,
  onText: (text: string) => void,
  onProblem: (problem: ScanProblem) => void,
): Promise<ScannerHandle | null> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    onProblem("insecure");
    return null;
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (err) {
    onProblem(problemOf(err));
    return null;
  }
  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  video.muted = true;
  await video.play().catch(() => undefined);

  const detector = await nativeDetector();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let stopped = false;
  let timer = 0;

  const read = async (): Promise<string | null> => {
    if (video.readyState < 2 || !video.videoWidth) return null;
    if (detector) {
      const hits = await detector.detect(video).catch(() => []);
      return hits[0]?.rawValue ?? null;
    }
    if (!ctx) return null;
    const k = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * k);
    canvas.height = Math.round(video.videoHeight * k);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "dontInvert" })?.data ?? null;
  };

  const tick = async () => {
    if (stopped) return;
    const text = await read();
    if (stopped) return;
    if (text) onText(text);
    timer = window.setTimeout(() => void tick(), FRAME_MS);
  };
  void tick();

  return {
    stop() {
      stopped = true;
      window.clearTimeout(timer);
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    },
  };
}
