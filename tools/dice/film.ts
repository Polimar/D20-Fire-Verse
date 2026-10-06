/**
 * One die throw for the Fire TV films, drawn with the table's own dice (tv/src/dice3d.ts).
 * The background is transparent: only the die and its shadow on an unseen floor are opaque,
 * so the film lies over the game the way the live die does on the web.
 *
 * Physics runs once with cannon-es. The die is then turned by a symmetry of its own shape so
 * the requested face ends on top, and the whole throw is turned about the vertical so the
 * number reads upright. A per-seed shift then lands that same throw somewhere else on the
 * floor, still coming in from the bottom of the screen.
 */

import "@fontsource/cinzel/700.css";
import * as CANNON from "cannon-es";
import {
  AmbientLight,
  BackSide,
  CanvasTexture,
  DirectionalLight,
  EquirectangularReflectionMapping,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Quaternion,
  Scene,
  ShadowMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  VSMShadowMap,
  WebGLRenderer,
} from "three";
import { makeDie, type Face } from "../../tv/src/dice3d";

export type FilmOptions = { sides: number; face: number; seed: number; fps: number; width: number; height: number; solidFloor?: boolean };

type Pose = { p: Vector3; q: Quaternion };

/** In die radii per second squared. A real d20 falls at about 900; slower reads as floating, faster as a blur. */
const GRAVITY = 380;
const SUBSTEPS = 8;
const HOLD_S = 0.7;
const MAX_S = 2.6;
/** A throw worth filming: it hops, rolls over a few faces, never drifts back, and rests in time. */
const SETTLE_MIN_S = 1.1;
const SETTLE_BY_S = 1.9;
const MIN_HOPS = 1;
const MIN_ROLLS = 3;
const MAX_BACK = 0.4;
/** How far above a face-down rest counts as landed, and as airborne again, in die radii. */
const LANDED_LIFT = 0.22;
const AIRBORNE_LIFT = 0.34;
/** How far from straight up the screen the throw may run, in radians, before it is shifted. */
const MAX_HEADING = 0.3;
const LAND = new Vector3(0, 0, 0.2);
const SCREEN_UP = new Vector3(0, 0, -1);

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Tri = { a: Vector3; b: Vector3; c: Vector3; n: Vector3 };

function radiusOf(body: Mesh): number {
  const pos = body.geometry.getAttribute("position");
  let r = 0;
  for (let i = 0; i < pos.count; i += 1) r = Math.max(r, Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i)));
  return r || 1;
}

function trianglesOf(body: Mesh, scale: number): Tri[] {
  const pos = body.geometry.getAttribute("position");
  const index = body.geometry.getIndex();
  const out: Tri[] = [];
  const count = index ? index.count : pos.count;
  for (let i = 0; i < count; i += 3) {
    const at = (k: number) => {
      const v = index ? index.getX(i + k) : i + k;
      return new Vector3().fromBufferAttribute(pos, v).multiplyScalar(scale);
    };
    const a = at(0);
    const b = at(1);
    const c = at(2);
    const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).normalize();
    out.push({ a, b, c, n });
  }
  return out;
}

function convexOf(tris: Tri[]): CANNON.ConvexPolyhedron {
  const vertices: CANNON.Vec3[] = [];
  const index = (v: Vector3) => {
    const found = vertices.findIndex((w) => Math.hypot(w.x - v.x, w.y - v.y, w.z - v.z) < 1e-5);
    if (found >= 0) return found;
    vertices.push(new CANNON.Vec3(v.x, v.y, v.z));
    return vertices.length - 1;
  };
  const faces = tris.map((t) => [index(t.a), index(t.b), index(t.c)]);
  return new CANNON.ConvexPolyhedron({ vertices, faces });
}

/** How a throw played out on the floor, to keep only the ones that look like a hand throw. */
class Judge {
  hops = 0;
  rolls = 0;
  back = 0;
  rising = false;
  private landed = false;
  private airborne = true;
  private peak = 0;
  private lastPeak = Infinity;
  private nearest = Infinity;
  private down = -1;

  constructor(
    private readonly normals: Vector3[],
    rest: number,
    private readonly minRolls: number,
  ) {
    this.landedY = rest + LANDED_LIFT;
    this.airY = rest + AIRBORNE_LIFT;
  }

  private readonly landedY: number;
  private readonly airY: number;

  see(position: CANNON.Vec3, quaternion: CANNON.Quaternion): void {
    if (this.airborne) this.peak = Math.max(this.peak, position.y);
    if (this.airborne && position.y < this.landedY) {
      this.airborne = false;
      if (this.landed) {
        this.hops += 1;
        if (this.peak > this.lastPeak + 0.05) this.rising = true;
        this.lastPeak = this.peak;
      }
      this.landed = true;
      this.peak = 0;
    }
    if (!this.airborne && position.y > this.airY) this.airborne = true;
    if (!this.landed) return;
    this.nearest = Math.min(this.nearest, position.z);
    this.back = Math.max(this.back, position.z - this.nearest);
    const q = new Quaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    let face = -1;
    let lowest = Infinity;
    this.normals.forEach((n, i) => {
      const y = n.clone().applyQuaternion(q).y;
      if (y < lowest) {
        lowest = y;
        face = i;
      }
    });
    if (lowest < -0.97 && face !== this.down) {
      if (this.down >= 0) this.rolls += 1;
      this.down = face;
    }
  }
}

function restHeight(tris: Tri[]): number {
  let h = Infinity;
  for (const t of tris) h = Math.min(h, Math.abs(t.a.dot(t.n)));
  return Number.isFinite(h) ? h : 0.8;
}

/** One throw. Poses are kept only by the caller, and only once the die has actually stopped. */
function simulate(
  tris: Tri[],
  normals: Vector3[],
  seed: number,
  fps: number,
  minRolls: number,
  sides: number,
): { poses: Pose[] | null; hops: number; rolls: number; back: number; rising: boolean; rest: number | null } {
  const rand = mulberry32(seed);
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0) });
  (world.solver as CANNON.GSSolver).iterations = 30;
  const dieMat = new CANNON.Material("die");
  const floorMat = new CANNON.Material("floor");
  const friction = sides <= 4 ? 0.28 : sides <= 8 ? 0.5 : 0.6;
  const restitution = sides <= 4 ? 0.88 : sides <= 8 ? 0.58 : 0.55;
  world.addContactMaterial(new CANNON.ContactMaterial(dieMat, floorMat, { friction, restitution }));
  const floor = new CANNON.Body({ mass: 0, material: floorMat, shape: new CANNON.Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);
  const die = new CANNON.Body({ mass: 1, material: dieMat, shape: convexOf(tris), linearDamping: 0.01, angularDamping: sides <= 4 ? 0.02 : sides <= 8 ? 0.035 : 0.08 });
  // Thrown low from the bottom of the screen (towards the camera) into the frame. A hand throw spins
  // the die forward faster than it would roll, so it digs in and tumbles instead of skidding.
  // A d4's big faces swallow a throw unless it is spinning hard and the floor gives it back.
  const forward = (sides <= 4 ? 18 : sides <= 8 ? 24 : 21) * (0.88 + rand() * 0.24);
  die.position.set((rand() - 0.5) * 1.6, 2.6 + rand() * 0.8, 7.8 + rand() * 0.8);
  die.velocity.set((rand() - 0.5) * 2.4, (sides <= 4 ? 6 : sides <= 8 ? 8 : 6) + rand() * 2, -forward);
  // Twist about the vertical is free; spin about the line of the throw would curve it sideways.
  const spin = sides <= 4 ? 2.2 : sides <= 8 ? 1.85 : 1.3;
  die.angularVelocity.set(-forward * spin * (0.85 + rand() * 0.3), (rand() - 0.5) * (sides <= 8 ? 22 : 18), (rand() - 0.5) * 5);
  die.quaternion.setFromEuler(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2);
  world.addBody(die);

  const judge = new Judge(normals, restHeight(tris), minRolls);
  const poses: Pose[] = [];
  const dt = 1 / (fps * SUBSTEPS);
  let still = 0;
  for (let frame = 0; frame < MAX_S * fps; frame += 1) {
    for (let s = 0; s < SUBSTEPS; s += 1) world.step(dt);
    judge.see(die.position, die.quaternion);
    poses.push({
      p: new Vector3(die.position.x, die.position.y, die.position.z),
      q: new Quaternion(die.quaternion.x, die.quaternion.y, die.quaternion.z, die.quaternion.w),
    });
    const calm = die.velocity.length() < 0.05 && die.angularVelocity.length() < 0.08;
    still = calm ? still + 1 : 0;
    if (still > fps * 0.15) {
      return { poses, hops: judge.hops, rolls: judge.rolls, back: judge.back, rising: judge.rising, rest: frame / fps };
    }
  }
  return { poses: null, hops: judge.hops, rolls: judge.rolls, back: judge.back, rising: judge.rising, rest: null };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function uniqueVerts(tris: Tri[]): Vector3[] {
  const verts: Vector3[] = [];
  const add = (v: Vector3) => {
    if (!verts.some((w) => w.distanceToSquared(v) < 1e-8)) verts.push(v.clone());
  };
  for (const t of tris) {
    add(t.a);
    add(t.b);
    add(t.c);
  }
  return verts;
}

/** Vertices of one face, ordered around its normal. */
function faceRing(face: Face, tris: Tri[]): Vector3[] {
  const verts: Vector3[] = [];
  const add = (v: Vector3) => {
    if (!verts.some((w) => w.distanceToSquared(v) < 1e-8)) verts.push(v.clone());
  };
  for (const t of tris) {
    if (t.n.dot(face.normal) < 0.97) continue;
    add(t.a);
    add(t.b);
    add(t.c);
  }
  const c = new Vector3();
  for (const v of verts) c.add(v);
  c.multiplyScalar(1 / Math.max(1, verts.length));
  const tmp = Math.abs(face.normal.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  const tangent = new Vector3().crossVectors(tmp, face.normal).normalize();
  const bitan = new Vector3().crossVectors(face.normal, tangent).normalize();
  verts.sort((a, b) => {
    const da = new Vector3().subVectors(a, c);
    const db = new Vector3().subVectors(b, c);
    return Math.atan2(da.dot(bitan), da.dot(tangent)) - Math.atan2(db.dot(bitan), db.dot(tangent));
  });
  return verts;
}

function frameOf(center: Vector3, xDir: Vector3, normal: Vector3): Matrix4 {
  const x = new Vector3().crossVectors(new Vector3().crossVectors(normal, xDir).normalize(), normal).normalize();
  const y = new Vector3().crossVectors(normal, x).normalize();
  return new Matrix4().makeBasis(x, y, normal.clone().normalize()).setPosition(center);
}

/** Rotations that lay face `from` exactly onto face `to` and the die onto itself. */
function symmetries(from: Face, to: Face, fromRing: Vector3[], toRing: Vector3[], verts: Vector3[]): Quaternion[] {
  if (fromRing.length < 3 || fromRing.length !== toRing.length) return [];
  const sc = fromRing.reduce((s, v) => s.add(v), new Vector3()).multiplyScalar(1 / fromRing.length);
  const dc = toRing.reduce((s, v) => s.add(v), new Vector3()).multiplyScalar(1 / toRing.length);
  const out: Quaternion[] = [];
  for (let k = 0; k < toRing.length; k += 1) {
    const src = frameOf(sc, new Vector3().subVectors(fromRing[0]!, sc), from.normal);
    const dst = frameOf(dc, new Vector3().subVectors(toRing[k]!, dc), to.normal);
    const q = new Quaternion().setFromRotationMatrix(dst.multiply(src.invert()));
    const err = verts.reduce((sum, v) => {
      const w = v.clone().applyQuaternion(q);
      let nearest = Infinity;
      for (const u of verts) nearest = Math.min(nearest, w.distanceToSquared(u));
      return sum + nearest;
    }, 0);
    if (err < 1e-3) out.push(q);
  }
  return out;
}

/** The requested face on top and its number upright. Null when no symmetry of the die can do it. */
function retarget(poses: Pose[], tris: Tri[], faces: Face[], want: number): Pose[] | null {
  const last = poses[poses.length - 1]!;
  const up = new Vector3(0, 1, 0);
  let top = faces[0];
  let topDot = -Infinity;
  for (const face of faces) {
    const d = face.normal.clone().applyQuaternion(last.q).dot(up);
    if (d > topDot) {
      topDot = d;
      top = face;
    }
  }
  if (!top) return null;
  const target = faces.find((f) => f.number === want);
  if (!target) return null;
  const verts = uniqueVerts(tris);
  const turns = symmetries(target, top, faceRing(target, tris), faceRing(top, tris), verts);
  if (!turns.length) return null;
  const approach = new Vector3(poses[0]!.p.x - last.p.x, 0, poses[0]!.p.z - last.p.z);
  let turn = new Quaternion();
  let appliedYaw = 0;
  let bestTilt = Infinity;
  for (const candidate of turns) {
    const readUp = target.up.clone().applyQuaternion(candidate).applyQuaternion(last.q);
    readUp.y = 0;
    if (readUp.lengthSq() < 1e-8) continue;
    readUp.normalize();
    const yawAngle = wrap(Math.atan2(SCREEN_UP.x, SCREEN_UP.z) - Math.atan2(readUp.x, readUp.z));
    const applied = Math.max(-MAX_HEADING, Math.min(MAX_HEADING, yawAngle));
    const tilt = Math.abs(wrap(yawAngle - applied));
    if (tilt > 0.6) continue;
    const rel = approach.clone().applyQuaternion(new Quaternion().setFromAxisAngle(up, applied));
    const heading = Math.abs(Math.atan2(-rel.x, rel.z));
    if (heading > MAX_HEADING + 0.2) continue;
    if (tilt < bestTilt) {
      bestTilt = tilt;
      turn = candidate;
      appliedYaw = applied;
    }
  }
  if (!Number.isFinite(bestTilt)) return null;
  const yaw = new Quaternion().setFromAxisAngle(up, appliedYaw);
  const rest = new Vector3(last.p.x, 0, last.p.z);
  return poses.map(({ p, q }) => ({
    p: p.clone().sub(rest).applyQuaternion(yaw).add(LAND),
    q: yaw.clone().multiply(q).multiply(turn),
  }));
}

/**
 * Shift one throw so it does not land on the same spot as the next film.
 * The arc still arrives from the bottom: the sideways offset shrinks to the landing.
 */
function place(poses: Pose[], seed: number): Pose[] {
  const rand = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const landX = (rand() - 0.5) * 2.1;
  const landZ = (rand() - 0.5) * 0.7;
  const entryX = landX + (rand() - 0.5) * 2.2;
  const last = poses[poses.length - 1]!.p;
  const first = poses[0]!.p;
  const span = first.z - last.z || 1;
  return poses.map(({ p, q }) => {
    const along = Math.min(1, Math.max(0, (p.z - last.z) / span));
    return {
      p: new Vector3(p.x - last.x + landX * (1 - along) + entryX * along, p.y, p.z - last.z + LAND.z + landZ),
      q: q.clone(),
    };
  });
}

/** The shifted throw still comes in from the bottom and rests where the camera can read it. */
function onScreen(poses: Pose[]): boolean {
  const last = poses[poses.length - 1]!.p;
  const first = poses[0]!.p;
  if (Math.abs(last.x) > 1.15 || last.z < -0.25 || last.z > 0.7) return false;
  if (first.z < last.z + 3 || Math.abs(first.x) > 2.2) return false;
  return poses.every((pose) => Math.abs(pose.p.x) < 2.5);
}

/** A dim warm room with no hard light panels: the clearcoat gets a sheen, never a white facet. */
function glowRoom(): Scene {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const g = canvas.getContext("2d")!;
  const sky = g.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, "#6b4a2e");
  sky.addColorStop(0.35, "#3a2617");
  sky.addColorStop(0.6, "#140c07");
  sky.addColorStop(1, "#050302");
  g.fillStyle = sky;
  g.fillRect(0, 0, 512, 256);
  const warm = g.createRadialGradient(150, 70, 4, 150, 70, 120);
  warm.addColorStop(0, "rgba(255, 196, 120, 0.55)");
  warm.addColorStop(1, "rgba(255, 196, 120, 0)");
  g.fillStyle = warm;
  g.fillRect(0, 0, 512, 256);
  const tex = new CanvasTexture(canvas);
  tex.mapping = EquirectangularReflectionMapping;
  tex.colorSpace = SRGBColorSpace;
  const room = new Scene();
  room.add(new Mesh(new SphereGeometry(20, 48, 24), new MeshBasicMaterial({ map: tex, side: BackSide })));
  return room;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

class Film {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private die!: ReturnType<typeof makeDie>;
  private poses: Pose[] = [];
  private fps = 120;
  private settleFrame = 0;
  private readonly wide = { pos: new Vector3(0, 8.75, 5.35), look: new Vector3(0, 0.5, 0.6) };
  private readonly close = { pos: new Vector3(0, 6.9, 2.07), look: new Vector3(0, 0.8, 0.55) };
  private floor!: Mesh;

  constructor(width: number, height: number) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = VSMShadowMap;
    document.body.appendChild(this.renderer.domElement);
    this.camera = new PerspectiveCamera(30, width / height, 0.1, 80);

    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(glowRoom(), 0.02).texture;
    this.scene.environmentIntensity = 0.55;

    // The live die's rig (tv/src/dice3d.ts), turned with the camera, which looks down here.
    const toCamera = new Vector3().subVectors(this.close.pos, this.close.look).normalize();
    const lift = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), toCamera);
    this.scene.add(new AmbientLight(0xffe2c0, 0.55));
    const key = new DirectionalLight(0xffd7a0, 3.1);
    key.position.set(-3, 4, 6).applyQuaternion(lift);
    this.scene.add(key);
    const rim = new DirectionalLight(0x6f8cff, 0.45);
    rim.position.set(4, -2, -3).applyQuaternion(lift);
    this.scene.add(rim);
    const ember = new PointLight(0xffc060, 6, 14, 2);
    ember.position.set(3.5, 3, 2.5);
    this.scene.add(ember);

    const caster = new DirectionalLight(0xffffff, 0.0001);
    caster.position.set(-5, 8, 3.5);
    caster.castShadow = true;
    caster.shadow.mapSize.set(2048, 2048);
    caster.shadow.camera.left = -8;
    caster.shadow.camera.right = 8;
    caster.shadow.camera.top = 8;
    caster.shadow.camera.bottom = -8;
    caster.shadow.camera.near = 1;
    caster.shadow.camera.far = 30;
    caster.shadow.bias = -0.0006;
    caster.shadow.radius = 14;
    caster.shadow.blurSamples = 24;
    this.scene.add(caster);

    this.floor = new Mesh(new PlaneGeometry(40, 40), new ShadowMaterial({ opacity: 0.62 }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
  }

  setup(opts: FilmOptions): { frames: number; settle: number; seed: number; track: string[] } {
    this.fps = opts.fps;
    if (opts.solidFloor) this.floor.material = new MeshStandardMaterial({ color: 0x777777, roughness: 0.9 });
    this.die = makeDie(opts.sides);
    if (!this.die.faces.some((f) => f.number === opts.face)) throw new Error(`a d${opts.sides} has no face ${opts.face}`);
    this.die.body.castShadow = true;
    const radius = radiusOf(this.die.body);
    this.die.die.scale.setScalar(1 / radius);
    this.scene.add(this.die.die);
    const tris = trianglesOf(this.die.body, 1 / radius);
    const normals = this.die.faces.map((f) => f.normal);
    const minRolls = opts.sides <= 4 ? 1 : MIN_ROLLS;
    let seed = opts.seed;
    let shot: Pose[] | null = null;
    const why = { physics: 0, symmetry: 0, heading: 0, frame: 0 } as Record<string, number>;
    let seen = 0;
    let sumHops = 0;
    let sumRolls = 0;
    let sumRest = 0;
    const triesMax = opts.sides <= 4 ? 4000 : 1200;
    for (let tries = 0; !shot && tries < triesMax; tries += 1, seed += 1) {
      const raw = simulate(tris, normals, seed, opts.fps, minRolls, opts.sides);
      if (raw.rest !== null) {
        seen += 1;
        sumHops += raw.hops;
        sumRolls += raw.rolls;
        sumRest += raw.rest;
      }
      const minRest = opts.sides <= 4 ? 0.7 : opts.sides >= 20 ? SETTLE_MIN_S : 0.9;
      const usable =
        raw.poses !== null &&
        raw.rest !== null &&
        raw.rest <= SETTLE_BY_S &&
        raw.rest >= minRest &&
        raw.hops >= MIN_HOPS &&
        raw.rolls >= minRolls &&
        !raw.rising &&
        raw.back < MAX_BACK;
      if (!usable || !raw.poses) {
        const tumbled = raw.hops >= MIN_HOPS && raw.rolls >= minRolls && !raw.rising && raw.back < MAX_BACK;
        const key =
          raw.rest === null ? "timeout" :
          raw.rest > SETTLE_BY_S ? "long" :
          raw.rest < minRest ? (tumbled ? "shortGood" : "short") :
          raw.hops < MIN_HOPS ? "hops" :
          raw.rising ? "rising" :
          raw.rolls < minRolls ? "rolls" :
          "back";
        why[key] = (why[key] ?? 0) + 1;
        continue;
      }
      const turned = retarget(raw.poses, tris, this.die.faces, opts.face);
      if (!turned) {
        why.symmetry += 1;
        continue;
      }
      const from = turned[0]!.p;
      const to = turned[turned.length - 1]!.p;
      if (Math.abs(Math.atan2(to.x - from.x, from.z - to.z)) > MAX_HEADING + 0.35) {
        why.heading += 1;
        continue;
      }
      const placed = place(turned, seed);
      if (!onScreen(placed)) {
        why.frame += 1;
        continue;
      }
      shot = placed;
    }
    if (!shot) {
      const avg = seen ? ` hops ${(sumHops / seen).toFixed(2)} rolls ${(sumRolls / seen).toFixed(2)} rest ${(sumRest / seen).toFixed(2)}s` : "";
      const outward = tris.filter((t) => t.a.dot(t.n) > 0).length;
      throw new Error(`no throw worth filming for a d${opts.sides} face ${opts.face} from seed ${opts.seed} (${JSON.stringify(why)})${avg} outward ${outward}/${tris.length} height ${restHeight(tris).toFixed(2)}`);
    }
    seed -= 1;
    this.poses = shot.slice(this.entry(shot));
    this.settleFrame = this.poses.length;
    const last = this.poses[this.poses.length - 1]!;
    for (let i = 0; i < HOLD_S * opts.fps; i += 1) this.poses.push({ p: last.p.clone(), q: last.q.clone() });
    const lastPose = this.poses[this.settleFrame - 1]!;
    let minY = Infinity;
    for (const v of uniqueVerts(tris)) {
      minY = Math.min(minY, v.clone().applyQuaternion(lastPose.q).y + lastPose.p.y);
    }
    const shown = this.die.faces.find((f) => f.number === opts.face)!;
    const faceY = shown.normal.clone().applyQuaternion(lastPose.q).y;
    const rows = this.track();
    rows.unshift(`rest minY ${minY.toFixed(2)}  faceNormalY ${faceY.toFixed(2)}  land x ${lastPose.p.x.toFixed(2)} z ${lastPose.p.z.toFixed(2)}`);
    return { frames: this.poses.length, settle: this.settleFrame, seed, track: rows };
  }

  /** The first pose a few frames before the die reaches the bottom edge, so the film opens on the throw. */
  private entry(poses: Pose[]): number {
    this.camera.position.copy(this.wide.pos);
    this.camera.lookAt(this.wide.look);
    this.camera.updateMatrixWorld();
    const lead = Math.round(this.fps * 0.05);
    for (let i = 0; i < poses.length; i += 1) {
      const p = poses[i]!.p;
      if (p.z >= this.camera.position.z) continue;
      // A unit die there spans about 0.6 of the half screen, so its top edge shows from -1.6.
      if (p.clone().project(this.camera).y > -1.7) return Math.max(0, i - lead);
    }
    return 0;
  }

  /** Every 50 ms up to rest: time, position, speed and spin, to read the motion without rendering it. */
  private track(): string[] {
    const step = Math.max(1, Math.round(this.fps / 20));
    const rows: string[] = [];
    for (let i = step; i < this.settleFrame; i += step) {
      const a = this.poses[i - step]!;
      const b = this.poses[i]!;
      const dt = step / this.fps;
      const speed = b.p.distanceTo(a.p) / dt;
      const spin = (2 * Math.acos(Math.min(1, Math.abs(a.q.dot(b.q))))) / dt;
      rows.push(`${(i / this.fps).toFixed(2)}s  x ${b.p.x.toFixed(2)}  y ${b.p.y.toFixed(2)}  z ${b.p.z.toFixed(2)}  v ${speed.toFixed(1)}  w ${spin.toFixed(1)}`);
    }
    return rows;
  }

  frame(i: number): string {
    const pose = this.poses[Math.min(i, this.poses.length - 1)]!;
    this.die.die.position.copy(pose.p);
    this.die.die.quaternion.copy(pose.q);
    const pushStart = this.settleFrame - this.fps * 0.35;
    const t = easeInOut(Math.min(1, Math.max(0, (i - pushStart) / (this.fps * 0.9))));
    this.camera.position.lerpVectors(this.wide.pos, this.close.pos, t);
    const look = new Vector3().lerpVectors(this.wide.look, this.close.look, t);
    this.camera.lookAt(look);
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }
}

let film: Film | null = null;

(window as unknown as { film: unknown }).film = {
  async setup(opts: FilmOptions) {
    await document.fonts.load("700 80px Cinzel");
    film = new Film(opts.width, opts.height);
    return film.setup(opts);
  },
  frame(i: number) {
    if (!film) throw new Error("setup first");
    return film.frame(i);
  },
};
