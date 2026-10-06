/**
 * The table's d20: a resin die tumbling in 3D that always comes to rest on the face
 * the server rolled, followed by a banner anyone on the couch can read
 * ("17 vs AC 13 — HIT"). Natural 20s stop time; natural 1s get their comic beat.
 */

import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DodecahedronGeometry,
  EdgesGeometry,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PointLight,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { describeRoll, escapeHtml, keptFace } from "./dice-copy";
import { reducedMotion } from "./settings";
import { sfx } from "./sfx";
import type { DiceRoll } from "./types";

export type Face = { number: number; normal: Vector3; up: Vector3 };

type Stage = {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  die: Group;
  body: Mesh;
  material: MeshPhysicalMaterial;
  glow: PointLight;
  faces: Face[];
};

type ClusterDie = {
  group: Group;
  body: Mesh;
  material: MeshPhysicalMaterial;
  faces: Face[];
  sides: number;
  damageType: string;
  rest: Vector3;
};

let cluster: ClusterDie[] = [];
let idleRaf = 0;
let previewLive = false;

let stage: Stage | null = null;
let host: HTMLElement | null = null;
let banner: HTMLElement | null = null;
let flash: HTMLElement | null = null;
let raf = 0;
let chain: Promise<void> = Promise.resolve();

const COLS = 5;
const ROWS = 4;
const TRI = { top: [0.5, 0.07], left: [0.04, 0.87], right: [0.96, 0.87] } as const;

function faceAtlas(): CanvasTexture {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d")!;
  const cw = size / COLS;
  const ch = size / ROWS;
  g.fillStyle = "#3a0d0b";
  g.fillRect(0, 0, size, size);
  for (let n = 1; n <= 20; n += 1) {
    const col = (n - 1) % COLS;
    const row = Math.floor((n - 1) / COLS);
    const ox = col * cw;
    const oy = row * ch;
    const grad = g.createLinearGradient(ox, oy, ox, oy + ch);
    grad.addColorStop(0, "#8e2a1c");
    grad.addColorStop(0.55, "#5c150f");
    grad.addColorStop(1, "#2c0907");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(ox + TRI.top[0] * cw, oy + TRI.top[1] * ch);
    g.lineTo(ox + TRI.left[0] * cw, oy + TRI.left[1] * ch);
    g.lineTo(ox + TRI.right[0] * cw, oy + TRI.right[1] * ch);
    g.closePath();
    g.fill();
    const cx = ox + cw / 2;
    const cy = oy + ch * 0.62;
    g.font = `700 ${n >= 10 ? 70 : 80}px Cinzel, Georgia, serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 6;
    g.strokeStyle = "rgba(20, 6, 4, 0.9)";
    g.strokeText(String(n), cx, cy);
    g.fillStyle = n === 20 ? "#ffd98a" : n === 1 ? "#d9c7b3" : "#f6e6c8";
    g.fillText(String(n), cx, cy);
    if (n === 6 || n === 9) {
      g.fillRect(cx - 18, cy + 40, 36, 6);
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Number the twenty faces so opposite faces sum to 21, like a real d20, and map the atlas onto them. */
function buildDie(): { geometry: IcosahedronGeometry; faces: Face[] } {
  const geometry = new IcosahedronGeometry(1, 0);
  const pos = geometry.getAttribute("position");
  const count = pos.count / 3;
  const tris: Array<{ a: Vector3; b: Vector3; c: Vector3; n: Vector3 }> = [];
  for (let f = 0; f < count; f += 1) {
    const a = new Vector3().fromBufferAttribute(pos, f * 3);
    const b = new Vector3().fromBufferAttribute(pos, f * 3 + 1);
    const c = new Vector3().fromBufferAttribute(pos, f * 3 + 2);
    const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).normalize();
    tris.push({ a, b, c, n });
  }
  const numbers = new Array<number>(count).fill(0);
  let low = 1;
  for (let i = 0; i < count; i += 1) {
    if (numbers[i]) continue;
    let opposite = -1;
    let best = 2;
    for (let j = 0; j < count; j += 1) {
      if (j === i || numbers[j]) continue;
      const d = tris[i]!.n.dot(tris[j]!.n);
      if (d < best) {
        best = d;
        opposite = j;
      }
    }
    numbers[i] = low;
    if (opposite >= 0) numbers[opposite] = 21 - low;
    low += 1;
  }
  const uv = new Float32Array(count * 6);
  const faces: Face[] = [];
  for (let f = 0; f < count; f += 1) {
    const n = numbers[f]!;
    const col = (n - 1) % COLS;
    const row = Math.floor((n - 1) / COLS);
    const put = (k: number, p: readonly [number, number]) => {
      uv[f * 6 + k * 2] = (col + p[0]) / COLS;
      uv[f * 6 + k * 2 + 1] = 1 - (row + p[1]) / ROWS;
    };
    put(0, TRI.top);
    put(1, TRI.left);
    put(2, TRI.right);
    const t = tris[f]!;
    const centroid = new Vector3().add(t.a).add(t.b).add(t.c).multiplyScalar(1 / 3);
    const up = new Vector3().subVectors(t.a, centroid);
    up.sub(t.n.clone().multiplyScalar(up.dot(t.n))).normalize();
    faces.push({ number: n, normal: t.n.clone(), up });
  }
  geometry.setAttribute("uv", new BufferAttribute(uv, 2));
  return { geometry, faces };
}

/** The table's resin d20 at radius 1. The Fire TV films are rendered from this same die. */
export function makeD20(): { die: Group; body: Mesh; material: MeshPhysicalMaterial; faces: Face[] } {
  const { geometry, faces } = buildDie();
  const material = new MeshPhysicalMaterial({
    map: faceAtlas(),
    roughness: 0.32,
    metalness: 0.05,
    clearcoat: 0.8,
    clearcoatRoughness: 0.18,
    emissive: new Color(0x000000),
    flatShading: true,
  });
  const body = new Mesh(geometry, material);
  const edges = new LineSegments(new EdgesGeometry(geometry), new LineBasicMaterial({ color: 0xe6b36a, transparent: true, opacity: 0.55 }));
  const die = new Group();
  die.add(body, edges);
  return { die, body, material, faces };
}

/** The orientation that shows `face` to the camera, number upright. */
function restingQuaternion(face: Face): Quaternion {
  const right = new Vector3().crossVectors(face.up, face.normal).normalize();
  const m = new Matrix4().makeBasis(right, face.up, face.normal).transpose();
  return new Quaternion().setFromRotationMatrix(m);
}

function typeColor(damageType?: string): number {
  switch ((damageType ?? "").toLowerCase()) {
    case "fire":
      return 0xc45a1a;
    case "radiant":
      return 0xe8c24a;
    case "force":
      return 0x6a7cff;
    case "cold":
      return 0x5aa8d4;
    case "poison":
      return 0x4a8a3e;
    case "lightning":
      return 0x6ad4ff;
    case "necrotic":
      return 0x5a3a68;
    case "psychic":
      return 0xb46ad4;
    default:
      return 0x8e2a1c;
  }
}

type Kit = { geometry: BufferGeometry; faces: Face[]; atlas: CanvasTexture };

const kits = new Map<number, Kit>();

function outwardNormal(verts: Vector3[]): Vector3 {
  const n = new Vector3().subVectors(verts[1]!, verts[0]!).cross(new Vector3().subVectors(verts[2]!, verts[0]!)).normalize();
  const c = new Vector3();
  for (const v of verts) c.add(v);
  c.multiplyScalar(1 / verts.length);
  if (n.dot(c) < 0) n.negate();
  return n;
}

function planarRing(verts: Vector3[]): Vector3[] {
  const n = outwardNormal(verts);
  const o = verts[0]!;
  return verts.map((v) => {
    const d = new Vector3().subVectors(v, o);
    return new Vector3().copy(v).addScaledVector(n, -d.dot(n));
  });
}

function basisOf(n: Vector3): { tangent: Vector3; bitan: Vector3 } {
  const tangent = new Vector3();
  if (Math.abs(n.y) < 0.9) tangent.crossVectors(n, new Vector3(0, 1, 0)).normalize();
  else tangent.crossVectors(n, new Vector3(1, 0, 0)).normalize();
  return { tangent, bitan: new Vector3().crossVectors(n, tangent).normalize() };
}

type P2 = { x: number; y: number };

function areaCentroid(pts: P2[]): P2 {
  let a = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    x += (p.x + q.x) * cross;
    y += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-9) return { x: 0, y: 0 };
  return { x: x / (3 * a), y: y / (3 * a) };
}

/** Distance from `o` to the nearest edge of the polygon. */
function inRadiusFrom(pts: P2[], o: P2): number {
  let min = Infinity;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len = Math.hypot(abx, aby) || 1;
    min = Math.min(min, Math.abs((o.x - a.x) * aby - (o.y - a.y) * abx) / len);
  }
  return min;
}

function d4Rings(): Vector3[][] {
  const v = [
    new Vector3(1, 1, 1),
    new Vector3(1, -1, -1),
    new Vector3(-1, 1, -1),
    new Vector3(-1, -1, 1),
  ].map((p) => p.normalize());
  return [
    [v[0]!, v[2]!, v[1]!],
    [v[0]!, v[1]!, v[3]!],
    [v[0]!, v[3]!, v[2]!],
    [v[1]!, v[2]!, v[3]!],
  ];
}

function d6Rings(): Vector3[][] {
  const s = 0.62;
  return [
    [new Vector3(s, s, s), new Vector3(s, s, -s), new Vector3(-s, s, -s), new Vector3(-s, s, s)],
    [new Vector3(s, -s, s), new Vector3(-s, -s, s), new Vector3(-s, -s, -s), new Vector3(s, -s, -s)],
    [new Vector3(s, s, s), new Vector3(s, -s, s), new Vector3(s, -s, -s), new Vector3(s, s, -s)],
    [new Vector3(-s, s, s), new Vector3(-s, s, -s), new Vector3(-s, -s, -s), new Vector3(-s, -s, s)],
    [new Vector3(s, s, s), new Vector3(-s, s, s), new Vector3(-s, -s, s), new Vector3(s, -s, s)],
    [new Vector3(s, s, -s), new Vector3(s, -s, -s), new Vector3(-s, -s, -s), new Vector3(-s, s, -s)],
  ];
}

function d8Rings(): Vector3[][] {
  const x = new Vector3(1.05, 0, 0);
  const nx = new Vector3(-1.05, 0, 0);
  const y = new Vector3(0, 1.05, 0);
  const ny = new Vector3(0, -1.05, 0);
  const z = new Vector3(0, 0, 1.05);
  const nz = new Vector3(0, 0, -1.05);
  return [
    [y, z, x],
    [y, x, nz],
    [y, nz, nx],
    [y, nx, z],
    [ny, x, z],
    [ny, nz, x],
    [ny, nx, nz],
    [ny, z, nx],
  ];
}

/** Ten kite faces of a pentagonal trapezohedron (physical d10). */
function d10Rings(): Vector3[][] {
  const h = 0.11;
  const cos36 = Math.cos(Math.PI / 5);
  const apex = (h * (1 + cos36)) / (1 - cos36);
  const north = new Vector3(0, apex, 0);
  const south = new Vector3(0, -apex, 0);
  const belt: Vector3[] = [];
  for (let i = 0; i < 10; i += 1) {
    const a = (i * Math.PI) / 5;
    belt.push(new Vector3(Math.cos(a), i % 2 === 0 ? h : -h, Math.sin(a)));
  }
  const at = (i: number) => belt[((i % 10) + 10) % 10]!;
  const faces: Vector3[][] = [];
  for (let i = 0; i < 10; i += 2) faces.push([north, at(i), at(i + 1), at(i + 2)]);
  for (let i = 1; i < 10; i += 2) faces.push([south, at(i), at(i + 1), at(i + 2)]);
  return faces;
}

function d12Rings(): Vector3[][] {
  const raw = new DodecahedronGeometry(1.08);
  const geometry = raw.index ? raw.toNonIndexed() : raw;
  if (geometry !== raw) raw.dispose();
  const pos = geometry.getAttribute("position");
  const buckets: Array<{ n: Vector3; tris: Vector3[][] }> = [];
  for (let t = 0; t < pos.count / 3; t += 1) {
    const a = new Vector3().fromBufferAttribute(pos, t * 3);
    const b = new Vector3().fromBufferAttribute(pos, t * 3 + 1);
    const c = new Vector3().fromBufferAttribute(pos, t * 3 + 2);
    const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).normalize();
    const hit = buckets.find((g) => g.n.dot(n) > 0.97);
    if (hit) hit.tris.push([a, b, c]);
    else buckets.push({ n: n.clone(), tris: [[a, b, c]] });
  }
  geometry.dispose();
  return buckets.map((g) => {
    const uniq: Vector3[] = [];
    const key = (v: Vector3) => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    const seen = new Set<string>();
    for (const tri of g.tris) {
      for (const v of tri) {
        const k = key(v);
        if (seen.has(k)) continue;
        seen.add(k);
        uniq.push(v);
      }
    }
    const c = new Vector3();
    for (const v of uniq) c.add(v);
    c.multiplyScalar(1 / uniq.length);
    const { tangent, bitan } = basisOf(g.n);
    uniq.sort((a, b) => {
      const aa = Math.atan2(new Vector3().subVectors(a, c).dot(bitan), new Vector3().subVectors(a, c).dot(tangent));
      const bb = Math.atan2(new Vector3().subVectors(b, c).dot(bitan), new Vector3().subVectors(b, c).dot(tangent));
      return aa - bb;
    });
    return planarRing(uniq);
  });
}

function ringsFor(sides: number): Vector3[][] {
  if (sides <= 4) return d4Rings();
  if (sides <= 6) return d6Rings();
  if (sides <= 8) return d8Rings();
  if (sides <= 10) return d10Rings();
  return d12Rings();
}

function numberOpposites(normals: Vector3[]): number[] {
  const numbers = new Array<number>(normals.length).fill(0);
  let low = 1;
  for (let i = 0; i < normals.length; i += 1) {
    if (numbers[i]) continue;
    let opposite = -1;
    let best = 2;
    for (let j = 0; j < normals.length; j += 1) {
      if (j === i || numbers[j]) continue;
      const d = normals[i]!.dot(normals[j]!);
      if (d < best) {
        best = d;
        opposite = j;
      }
    }
    numbers[i] = low;
    if (opposite >= 0) numbers[opposite] = normals.length + 1 - low;
    low += 1;
  }
  return numbers;
}

function kitFromRings(rings: Vector3[][], key: number): Kit {
  const normals = rings.map(outwardNormal);
  const numbers = numberOpposites(normals);
  const count = rings.length;
  const cols = Math.min(4, count);
  const rows = Math.ceil(count / cols);
  const size = 2048;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#2a0c0a";
  ctx.fillRect(0, 0, size, size);
  const cw = size / cols;
  const ch = size / rows;
  const positions: number[] = [];
  const uvs: number[] = [];
  const faces: Face[] = [];

  for (let i = 0; i < rings.length; i += 1) {
    const ring0 = rings[i]!;
    const nCheck = new Vector3().subVectors(ring0[1]!, ring0[0]!).cross(new Vector3().subVectors(ring0[2]!, ring0[0]!));
    const cCheck = new Vector3();
    for (const v of ring0) cCheck.add(v);
    cCheck.multiplyScalar(1 / ring0.length);
    const ring = nCheck.dot(cCheck) < 0 ? [ring0[0]!, ...ring0.slice(1).reverse()] : ring0;
    const nrm = normals[i]!;
    const num = numbers[i]!;
    const c = new Vector3();
    for (const v of ring) c.add(v);
    c.multiplyScalar(1 / ring.length);
    // Squares read with an edge on top; every other face points its first corner (the d10 apex) up.
    const anchor = key === 6 ? new Vector3().addVectors(ring[0]!, ring[1]!).multiplyScalar(0.5) : ring[0]!.clone();
    const up = new Vector3().subVectors(anchor, c);
    up.addScaledVector(nrm, -up.dot(nrm)).normalize();
    const right = new Vector3().crossVectors(up, nrm).normalize();
    const pts = ring.map((v) => {
      const d = new Vector3().subVectors(v, c);
      return { x: d.dot(right), y: d.dot(up) };
    });
    const center = areaCentroid(pts);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const col = (num - 1) % cols;
    const row = Math.floor((num - 1) / cols);
    const cellX = col * cw + cw / 2;
    const cellY = row * ch + ch / 2;
    const scale = (Math.min(cw, ch) * 0.92) / Math.max(maxX - minX, maxY - minY, 0.001);
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const toCanvas = (p: { x: number; y: number }) => ({
      x: cellX + (p.x - midX) * scale,
      y: cellY - (p.y - midY) * scale,
    });
    const drawn = pts.map(toCanvas);
    const text = toCanvas(center);
    const ir = inRadiusFrom(drawn, text);
    ctx.beginPath();
    drawn.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    const grad = ctx.createRadialGradient(text.x, text.y - ir * 0.3, 2, text.x, text.y, ir * 2.2);
    grad.addColorStop(0, "#b83c28");
    grad.addColorStop(1, "#4a120c");
    ctx.fillStyle = grad;
    ctx.fill();
    const label = key === 10 && num === 10 ? "0" : String(num);
    const fontPx = ir * (label.length > 1 ? 1.0 : 1.3);
    ctx.font = `700 ${fontPx}px Cinzel, Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(3, fontPx * 0.07);
    ctx.strokeStyle = "rgba(18, 6, 4, 0.95)";
    ctx.strokeText(label, text.x, text.y);
    ctx.fillStyle = "#fff1d0";
    ctx.fillText(label, text.x, text.y);
    if (label === "6" || label === "9") ctx.fillRect(text.x - fontPx * 0.2, text.y + fontPx * 0.42, fontPx * 0.4, fontPx * 0.07);

    const uvOf = (p: { x: number; y: number }) => {
      const q = toCanvas(p);
      return [q.x / size, 1 - q.y / size] as const;
    };
    for (let t = 1; t < ring.length - 1; t += 1) {
      const a = ring[0]!;
      const b = ring[t]!;
      const d = ring[t + 1]!;
      const ua = uvOf(pts[0]!);
      const ub = uvOf(pts[t]!);
      const ud = uvOf(pts[t + 1]!);
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z);
      uvs.push(ua[0], ua[1], ub[0], ub[1], ud[0], ud[1]);
    }
    faces.push({ number: num, normal: nrm.clone(), up: up.clone() });
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.computeVertexNormals();
  const atlas = new CanvasTexture(canvas);
  atlas.colorSpace = SRGBColorSpace;
  atlas.anisotropy = 8;
  atlas.needsUpdate = true;
  return { geometry, faces, atlas };
}

function kitFor(sides: number): Kit {
  const key = sides <= 4 ? 4 : sides <= 6 ? 6 : sides <= 8 ? 8 : sides <= 10 ? 10 : sides <= 12 ? 12 : 20;
  const hit = kits.get(key);
  if (hit) return hit;
  if (key === 20) {
    const { geometry, faces } = buildDie();
    const kit = { geometry, faces, atlas: faceAtlas() };
    kits.set(20, kit);
    return kit;
  }
  const rings = ringsFor(key);
  const kit = kitFromRings(rings, key);
  kits.set(key, kit);
  return kit;
}

/** The table's resin die for 4, 6, 8, 10, 12 or 20 faces. The Fire TV films are rendered from this. */
export function makeDie(sides: number): { die: Group; body: Mesh; material: MeshPhysicalMaterial; faces: Face[] } {
  const key = sides <= 4 ? 4 : sides <= 6 ? 6 : sides <= 8 ? 8 : sides <= 10 ? 10 : sides <= 12 ? 12 : 20;
  if (key === 20) return makeD20();
  const kit = kitFor(key);
  const material = new MeshPhysicalMaterial({
    map: kit.atlas,
    roughness: 0.32,
    metalness: 0.05,
    clearcoat: 0.8,
    clearcoatRoughness: 0.18,
    emissive: new Color(0x000000),
    flatShading: true,
  });
  const body = new Mesh(kit.geometry, material);
  const edges = new LineSegments(new EdgesGeometry(kit.geometry), new LineBasicMaterial({ color: 0xe6b36a, transparent: true, opacity: 0.55 }));
  const die = new Group();
  die.add(body, edges);
  return { die, body, material, faces: kit.faces };
}

function stopIdle() {
  if (idleRaf) cancelAnimationFrame(idleRaf);
  idleRaf = 0;
}

function clearCluster() {
  const s = stage;
  stopIdle();
  previewLive = false;
  for (const d of cluster) {
    s?.scene.remove(d.group);
    d.material.dispose();
  }
  cluster = [];
}

function clusterLayout(n: number): Vector3[] {
  const span = n > 4 ? 1.35 : 1.55;
  const start = -((n - 1) * span) / 2;
  return Array.from({ length: n }, (_, i) => new Vector3(start + i * span, 0.45, 0));
}

function spawnCluster(dice: Array<{ sides: number; damageType: string }>): ClusterDie[] {
  const s = ensureStage();
  if (!s) return [];
  clearCluster();
  s.die.visible = false;
  const spots = clusterLayout(dice.length);
  if (dice.length > 3) s.camera.position.set(0, 0, 11);
  else s.camera.position.set(0, 0, 9);
  cluster = dice.map((spec, i) => {
    const sides = spec.sides <= 4 ? 4 : spec.sides <= 6 ? 6 : spec.sides <= 8 ? 8 : spec.sides <= 10 ? 10 : spec.sides <= 12 ? 12 : 20;
    const kit = kitFor(sides);
    const material = new MeshPhysicalMaterial({
      map: kit.atlas,
      color: new Color(0xffffff),
      emissive: new Color(typeColor(spec.damageType)).multiplyScalar(0.08),
      roughness: 0.48,
      metalness: 0,
      clearcoat: 0.1,
      clearcoatRoughness: 0.45,
      flatShading: true,
    });
    const body = new Mesh(kit.geometry, material);
    const edges = new LineSegments(new EdgesGeometry(kit.geometry), new LineBasicMaterial({ color: 0xe6b36a, transparent: true, opacity: 0.45 }));
    const group = new Group();
    group.add(body, edges);
    const scale = sides >= 20 ? 0.58 : 0.72;
    group.scale.setScalar(scale);
    group.position.copy(spots[i]!);
    s.scene.add(group);
    return {
      group,
      body,
      material,
      faces: kit.faces,
      sides,
      damageType: spec.damageType,
      rest: spots[i]!,
    };
  });
  return cluster;
}

function startIdle() {
  const s = stage;
  if (!s || !cluster.length) return;
  stopIdle();
  const tick = () => {
    for (const d of cluster) d.group.rotation.y += 0.012;
    s.renderer.render(s.scene, s.camera);
    idleRaf = requestAnimationFrame(tick);
  };
  idleRaf = requestAnimationFrame(tick);
}

function flattenDamage(rolls: DiceRoll[]): Array<{ sides: number; value: number; damageType: string }> {
  const out: Array<{ sides: number; value: number; damageType: string }> = [];
  for (const roll of rolls) {
    for (let i = 0; i < roll.values.length; i += 1) {
      const sides = roll.sides[i] ?? 6;
      if (sides < 2) continue;
      out.push({
        sides,
        value: roll.values[i] ?? 1,
        damageType: roll.damageType ?? "",
      });
    }
  }
  return out;
}

function typeTitle(t: string): string {
  if (!t) return "Damage";
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function showDamageBanner(rolls: DiceRoll[]) {
  if (!banner) return;
  const parts = rolls
    .filter((r) => r.purpose === "damage" || r.purpose === "heal")
    .map((r) => {
      const kind = r.purpose === "heal" ? "heal" : r.damageType ?? "";
      const name = r.purpose === "heal" ? "Heals" : typeTitle(r.damageType ?? r.label ?? "Damage");
      const mod = r.modifier ? ` ${r.modifier > 0 ? "+" : "−"}${Math.abs(r.modifier)}` : "";
      return `<span class="dice-dmg ${r.purpose} ${kind}">${escapeHtml(name)} ${escapeHtml(r.notation)}${mod} → <strong>${r.total}</strong></span>`;
    })
    .join("");
  const total = rolls.reduce((a, r) => a + (r.purpose === "damage" || r.purpose === "heal" ? r.total : 0), 0);
  const who = rolls[0]?.roller ?? "Damage";
  banner.className = `dice-banner show good`;
  banner.innerHTML = `
    <p class="dice-who">${escapeHtml(who)} · Damage</p>
    <p class="dice-headline">${total}</p>
    <p class="dice-detail">All dice in one throw</p>
    ${parts ? `<p class="dice-damage">${parts}</p>` : ""}
  `;
}

async function throwCluster(faces: Array<{ sides: number; value: number; damageType: string }>, fast: boolean) {
  const s = ensureStage();
  if (!s || !host || !cluster.length) return;
  stopIdle();
  host.hidden = false;
  host.classList.remove("leaving");
  host.classList.add("on");
  banner!.className = "dice-banner";
  const calm = reducedMotion();
  s.glow.intensity = 0;
  const spins = cluster.map((d, i) => {
    const spec = faces[i];
    const value = spec ? Math.max(1, Math.min(d.sides, spec.value)) : 1;
    const face = d.faces.find((f) => f.number === value) ?? d.faces[0]!;
    const target = restingQuaternion(face);
    const rest = d.rest;
    const scale = d.group.scale.x;
    d.group.visible = true;
    if (calm) {
      d.group.quaternion.copy(target);
      d.group.position.copy(rest);
    }
    return {
      d,
      target,
      rest,
      scale,
      axis: new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      spins: (fast ? 2.4 : 3.8) * Math.PI + Math.random() * Math.PI,
      from: new Vector3(rest.x + (Math.random() - 0.5) * 1.4, rest.y - 2.4, 1.1),
      delay: i * 0.06,
    };
  });
  if (calm) {
    await animate(220, () => undefined);
    sfx("diceSettle");
    return;
  }
  sfx("dice", { gain: 0.95 });
  const duration = fast ? 720 : 1100;
  const q = new Quaternion();
  await animate(duration, (t) => {
    for (const item of spins) {
      const local = Math.min(1, Math.max(0, (t - item.delay) / (1 - item.delay)));
      const e = easeOut(local);
      q.setFromAxisAngle(item.axis, item.spins * (1 - e));
      item.d.group.quaternion.copy(item.target).multiply(q);
      const bounce = Math.abs(Math.cos(local * Math.PI * 3.2)) * (1 - local) * 1.1;
      item.d.group.position.set(
        item.from.x + (item.rest.x - item.from.x) * e,
        item.from.y + (item.rest.y - item.from.y) * e + bounce,
        item.from.z * (1 - e),
      );
      item.d.group.scale.setScalar(item.scale);
    }
  });
  for (const item of spins) {
    item.d.group.quaternion.copy(item.target);
    item.d.group.position.copy(item.rest);
  }
  sfx("diceSettle");
}

/** Idle cluster of the right shapes while the table waits for the Damage swipe. */
export function showDamagePreview(dice: Array<{ sides: number; damageType: string }>): Promise<void> {
  const next = chain.then(async () => {
    if (!dice.length) return;
    const s = ensureStage();
    if (!s || !host) return;
    spawnCluster(dice);
    previewLive = true;
    host.hidden = false;
    host.classList.remove("leaving");
    host.classList.add("on");
    banner!.className = "dice-banner show neutral";
    banner!.innerHTML = `<p class="dice-who">Damage</p><p class="dice-headline">Ready</p><p class="dice-detail">Swipe to throw every die</p>`;
    startIdle();
    s.renderer.render(s.scene, s.camera);
  });
  chain = next.catch(() => undefined);
  return next;
}

export function throwDamage(rolls: DiceRoll[], opts: { fast?: boolean } = {}): Promise<void> {
  const next = chain.then(async () => {
    const faces = flattenDamage(rolls);
    if (!faces.length) return;
    const s = ensureStage();
    if (!s || !host) {
      sfx("dice");
      return;
    }
    const match =
      previewLive &&
      cluster.length === faces.length &&
      cluster.every((d, i) => d.sides === (faces[i]!.sides <= 4 ? 4 : faces[i]!.sides <= 6 ? 6 : faces[i]!.sides <= 8 ? 8 : faces[i]!.sides <= 10 ? 10 : faces[i]!.sides <= 12 ? 12 : 20));
    if (!match) spawnCluster(faces.map((f) => ({ sides: f.sides, damageType: f.damageType })));
    await throwCluster(faces, !!opts.fast);
    showDamageBanner(rolls);
    await wait(opts.fast ? 900 : 1400);
    host.classList.add("leaving");
    await wait(260);
    host.classList.remove("on", "leaving");
    host.hidden = true;
    banner!.className = "dice-banner";
    clearCluster();
    if (stage) {
      stage.die.visible = true;
      stage.camera.position.set(0, 0, 9);
    }
  });
  chain = next.catch(() => undefined);
  return next;
}

function ensureStage(): Stage | null {
  if (stage) return stage;
  try {
    host = document.createElement("div");
    host.className = "dice-stage";
    host.hidden = true;
    const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = SRGBColorSpace;
    host.appendChild(renderer.domElement);
    banner = document.createElement("div");
    banner.className = "dice-banner";
    host.appendChild(banner);
    flash = document.createElement("div");
    flash.className = "dice-flash";
    host.appendChild(flash);
    document.body.appendChild(host);

    const scene = new Scene();
    const camera = new PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 50);
    camera.position.set(0, 0, 9);
    scene.add(new AmbientLight(0xffe2c0, 0.55));
    const key = new DirectionalLight(0xffd7a0, 2.4);
    key.position.set(-3, 4, 6);
    scene.add(key);
    const rim = new DirectionalLight(0x6f8cff, 0.9);
    rim.position.set(4, -2, -3);
    scene.add(rim);
    const glow = new PointLight(0xffc060, 0, 8);
    glow.position.set(0, 0, 3);
    scene.add(glow);

    const { die, body, material, faces } = makeD20();
    die.scale.setScalar(0.72);
    scene.add(die);

    window.addEventListener("resize", () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    });
    stage = { renderer, scene, camera, die, body, material, glow, faces };
    return stage;
  } catch {
    return null;
  }
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

function animate(duration: number, step: (t: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const s = stage;
    if (!s) return resolve();
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      step(t);
      s.renderer.render(s.scene, s.camera);
      if (t < 1) raf = requestAnimationFrame(frame);
      else resolve();
    };
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  });
}

function showBanner(roll: DiceRoll, extra: DiceRoll[], tone: string) {
  if (!banner) return;
  const { headline, detail } = describeRoll(roll);
  const damage = extra
    .filter((r) => r.purpose === "damage" || r.purpose === "heal")
    .map((r) => `<span class="dice-dmg ${r.purpose}">${r.purpose === "heal" ? "Heals" : "Damage"} ${escapeHtml(r.notation)} → <strong>${r.total}</strong></span>`)
    .join("");
  banner.className = `dice-banner show ${tone}`;
  banner.innerHTML = `
    <p class="dice-who">${escapeHtml(roll.roller)} · ${escapeHtml(roll.label ?? roll.purpose)}</p>
    <p class="dice-headline">${escapeHtml(headline)}</p>
    <p class="dice-detail">${escapeHtml(detail)}</p>
    ${damage ? `<p class="dice-damage">${damage}</p>` : ""}
  `;
}

function flashScreen(kind: "crit" | "fumble") {
  if (!flash || reducedMotion()) return;
  flash.className = `dice-flash ${kind}`;
  void flash.offsetWidth;
  flash.classList.add("go");
}

async function play(roll: DiceRoll, extra: DiceRoll[], fast: boolean, hold: boolean) {
  const s = ensureStage();
  const natural = keptFace(roll);
  const crit = roll.outcome === "crit" || (roll.isCrit && natural === 20);
  const fumble = roll.outcome === "fumble" || (roll.isFumble && natural === 1);
  const tone = crit ? "crit" : fumble ? "fumble" : roll.outcome === "hit" || roll.outcome === "success" ? "good" : roll.outcome ? "bad" : "neutral";
  if (!s || !host) {
    sfx("dice");
    return;
  }
  stopIdle();
  for (const d of cluster) d.group.visible = false;
  s.die.visible = true;
  s.camera.position.set(0, 0, 9);
  host.hidden = false;
  host.classList.remove("leaving");
  host.classList.add("on");
  banner!.className = "dice-banner";
  s.material.emissive.setHex(0x000000);
  s.glow.intensity = 0;
  s.die.scale.setScalar(0.72);
  const face = s.faces.find((f) => f.number === natural) ?? s.faces[0]!;
  const target = restingQuaternion(face);
  const calm = reducedMotion();
  const rest = new Vector3(0, 0.55, 0);

  if (calm) {
    s.die.quaternion.copy(target);
    s.die.position.copy(rest);
    await animate(260, () => undefined);
    sfx("diceSettle");
  } else {
    sfx("dice", { gain: 0.9 });
    const axis = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const spins = (fast ? 3 : 4.5) * Math.PI + Math.random() * Math.PI;
    const from = new Vector3(3.6 * (Math.random() < 0.5 ? -1 : 1), -2.6, 1.2);
    const duration = fast ? 750 : 1150;
    const spin = new Quaternion();
    await animate(duration, (t) => {
      const e = easeOut(t);
      spin.setFromAxisAngle(axis, spins * (1 - e));
      s.die.quaternion.copy(target).multiply(spin);
      const bounce = Math.abs(Math.cos(t * Math.PI * 3.2)) * (1 - t) * 1.4;
      s.die.position.set(from.x + (rest.x - from.x) * e, from.y + (rest.y - from.y) * e + bounce, from.z * (1 - e));
    });
    s.die.quaternion.copy(target);
    s.die.position.copy(rest);
    await animate(140, (t) => s.die.scale.setScalar(0.72 * (1 + Math.sin(t * Math.PI) * 0.08)));
  }

  showBanner(roll, extra, tone);

  if (crit) {
    sfx("crit");
    flashScreen("crit");
    s.material.emissive.setHex(0x8a4a00);
    await animate(calm ? 200 : 520, (t) => {
      s.glow.intensity = 30 * Math.sin(Math.min(1, t * 1.4) * Math.PI * 0.5);
      s.die.scale.setScalar(0.72 * (1 + 0.38 * easeOut(t)));
    });
    await wait(fast ? 900 : 1500);
  } else if (fumble) {
    sfx("fumble");
    flashScreen("fumble");
    s.material.emissive.setHex(0x101820);
    const base = s.die.quaternion.clone();
    const wobble = new Quaternion();
    await animate(calm ? 200 : 1100, (t) => {
      const angle = Math.sin(t * Math.PI * 5) * 0.35 * (1 - t);
      wobble.setFromAxisAngle(new Vector3(0, 0, 1), angle);
      s.die.quaternion.copy(base).multiply(wobble);
      s.die.position.y = rest.y - easeOut(t) * 0.35;
      s.die.scale.setScalar(0.72 * (1 - 0.12 * easeOut(t)));
    });
    await wait(fast ? 700 : 1100);
  } else {
    await wait(fast ? 850 : 1500);
  }

  if (hold) return;

  host.classList.add("leaving");
  await wait(260);
  host.classList.remove("on", "leaving");
  host.hidden = true;
  banner!.className = "dice-banner";
}

/**
 * Roll the d20 of `roll` on screen. Rolls queue: a flurry of blows plays one die at a time.
 * `extra` carries the damage/heal rolls that ride on the banner.
 */
export function rollD20(roll: DiceRoll, opts: { extra?: DiceRoll[]; fast?: boolean; hold?: boolean } = {}): Promise<void> {
  const next = chain.then(() => play(roll, opts.extra ?? [], !!opts.fast, !!opts.hold));
  chain = next.catch(() => undefined);
  return next;
}

/** Load three.js' shader programs before the first roll so the first throw never stutters. */
export function warmDice() {
  const s = ensureStage();
  if (!s) return;
  for (const n of [4, 6, 8, 10, 12, 20]) kitFor(n);
  s.renderer.compile(s.scene, s.camera);
}

