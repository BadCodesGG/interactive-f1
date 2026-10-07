/**
 * The explode maths (technique report 3.1). `buildPlan` measures the model once at rest and decides,
 * per part, a world-space direction, a magnitude and a window of `k` it plays in. `applyExplode`
 * places every part for a given `k` in 0..1 without allocating, so it can run every frame.
 *
 * Per part, in order of precedence:
 *   1. the sidecar's authored `explode` vector (world-aligned, model units);
 *   2. radial from the assembly centre, magnitude R * (floor + (1 - floor) * min(d / R, 1));
 *   3. for a part within eps * R of the centre, a push along its thinnest box axis, R * floor.
 * With `assembly.axis` set (blueprint mode), 2 and 3 move along that one axis instead.
 *
 * Hierarchy: each group has a stage and an optional `explode` vector. Distinct stages split [0, 1]
 * evenly in ascending order. A part's own offset plays over its stage window (smoothstepped, and
 * staggered by `order` when set); its group's offset plays over the group's window; the two add.
 * A part nested inside another part also carries that part's offset.
 *
 * Everything is measured once, in the root's frame at build time. Transforming the root later
 * (the age view scales the whole model) carries the whole layout with it, offsets included.
 */
import * as THREE from "three";
import type { Axis, Sidecar, Vec3 } from "./sidecar";

export interface PlanOptions {
  /** Fraction of R that even the nearest part moves. */
  floor?: number;
  /** Parts closer than eps * R to the centre take the thinnest-axis push. */
  eps?: number;
}

export interface PlanPart {
  id: string;
  obj: THREE.Object3D;
  restWorld: THREE.Vector3;
  /** Own offset at full progress: unit direction times magnitude. */
  own: THREE.Vector3;
  window: [number, number];
  /** Group offset at full progress, and the group's window. */
  group: THREE.Vector3 | null;
  groupWindow: [number, number];
  /** Parts that contain this one, nearest first. */
  ancestors: PlanPart[];
  /** Total world offset written by the last applyExplode. */
  current: THREE.Vector3;
}

export interface ExplodePlan {
  /** Ancestors before descendants, so each write sees its parent already placed. */
  parts: PlanPart[];
  byId: Map<string, PlanPart>;
  centre: THREE.Vector3;
  radius: number;
  root: THREE.Object3D;
  /** World to root space as it was at build time: rest positions and offsets live in that space. */
  rootInverse: THREE.Matrix4;
}

type Layout = Pick<Sidecar, "assembly" | "groups" | "parts">;

const AXES: Record<Axis, number> = { x: 0, y: 1, z: 2 };

export function smoothstep(a: number, b: number, x: number): number {
  if (b <= a) return x >= b ? 1 : 0;
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

export function buildPlan(root: THREE.Object3D, sidecar: Layout, { floor = 0.35, eps = 0.02 }: PlanOptions = {}): ExplodePlan {
  root.updateMatrixWorld(true);
  const ids = Object.keys(sidecar.parts);
  const missing = ids.filter((id) => !root.getObjectByName(id));
  if (missing.length) throw new Error(`Model has no node for sidecar part(s): ${missing.join(", ")}`);
  const objs = ids.map((id) => root.getObjectByName(id)!);

  const box = new THREE.Box3();
  const pb = new THREE.Box3();
  for (const o of objs) box.union(pb.setFromObject(o));
  const centre = sidecar.assembly.centre ? new THREE.Vector3(...sidecar.assembly.centre) : box.getCenter(new THREE.Vector3());
  const radius = sidecar.assembly.radius ?? box.getSize(new THREE.Vector3()).length() / 2;
  const axis = sidecar.assembly.axis ? AXES[sidecar.assembly.axis] : null;

  // Stage windows: distinct stage numbers, ascending, share [0, 1] evenly.
  const stageOf = (id: string) => {
    const p = sidecar.parts[id];
    return p.stage ?? (p.group ? sidecar.groups[p.group]?.stage : undefined) ?? 0;
  };
  const stages = [...new Set([...ids.map(stageOf), ...Object.values(sidecar.groups).map((g) => g.stage)])].sort((a, b) => a - b);
  const windowOf = (stage: number): [number, number] => {
    const i = stages.indexOf(stage);
    return [i / stages.length, (i + 1) / stages.length];
  };

  const parts: PlanPart[] = ids.map((id, i) => {
    const meta = sidecar.parts[id];
    const obj = objs[i];
    const c = pb.setFromObject(obj).getCenter(new THREE.Vector3());
    const r = c.clone().sub(centre);
    const own = new THREE.Vector3();
    if (meta.explode) {
      own.set(...meta.explode);
    } else if (axis !== null) {
      const d = Math.abs(r.getComponent(axis));
      const mag = d > eps * radius ? radius * (floor + (1 - floor) * Math.min(d / radius, 1)) : radius * floor;
      own.setComponent(axis, (r.getComponent(axis) >= 0 ? 1 : -1) * mag);
    } else {
      const d = r.length();
      if (d > eps * radius) {
        own.copy(r).divideScalar(d).multiplyScalar(radius * (floor + (1 - floor) * Math.min(d / radius, 1)));
      } else {
        const s = pb.getSize(new THREE.Vector3());
        const ax = s.x <= s.y && s.x <= s.z ? 0 : s.y <= s.z ? 1 : 2;
        own.setComponent(ax, (r.getComponent(ax) >= 0 ? 1 : -1) * radius * floor);
      }
    }

    let [a, b] = windowOf(stageOf(id));
    if (meta.order !== undefined) {
      // A staggered part plays over half its stage window, starting `order` of the way through the rest.
      const half = (b - a) / 2;
      a += meta.order * half;
      b = a + half;
    }
    const g = meta.group ? sidecar.groups[meta.group] : undefined;
    return {
      id,
      obj,
      restWorld: obj.getWorldPosition(new THREE.Vector3()),
      own,
      window: [a, b],
      group: g?.explode ? new THREE.Vector3(...(g.explode as Vec3)) : null,
      groupWindow: g ? windowOf(g.stage) : [0, 1],
      ancestors: [],
      current: new THREE.Vector3(),
    };
  });

  const byId = new Map(parts.map((p) => [p.id, p]));
  const byObj = new Map(parts.map((p) => [p.obj, p]));
  const depth = new Map<PlanPart, number>();
  for (const p of parts) {
    for (let o = p.obj.parent; o; o = o.parent) {
      const anc = byObj.get(o);
      if (anc) p.ancestors.push(anc);
    }
    depth.set(p, p.ancestors.length);
    // A part inside a part of the same group already rides that group's offset through its ancestor.
    const gid = sidecar.parts[p.id].group;
    if (gid && p.ancestors.some((a) => sidecar.parts[a.id].group === gid)) p.group = null;
  }
  // Stable sort keeps sidecar order among parts at the same depth.
  const ordered = [...parts].sort((x, y) => depth.get(x)! - depth.get(y)!);
  return { parts: ordered, byId, centre, radius, root, rootInverse: root.matrixWorld.clone().invert() };
}

const target = new THREE.Vector3();
const toWorld = new THREE.Matrix4();

/** Places every part for `k` in 0..1. No allocation; safe to call from useFrame. */
export function applyExplode(plan: ExplodePlan, k: number): void {
  plan.root.updateWorldMatrix(true, false);
  toWorld.multiplyMatrices(plan.root.matrixWorld, plan.rootInverse);
  for (const e of plan.parts) {
    e.current.copy(e.own).multiplyScalar(smoothstep(e.window[0], e.window[1], k));
    if (e.group) e.current.addScaledVector(e.group, smoothstep(e.groupWindow[0], e.groupWindow[1], k));
    target.copy(e.restWorld).add(e.current);
    for (const a of e.ancestors) target.add(a.current);
    target.applyMatrix4(toWorld);
    const parent = e.obj.parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      parent.worldToLocal(target);
    }
    e.obj.position.copy(target);
  }
}
