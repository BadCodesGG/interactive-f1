/**
 * The wind tunnel's car wears the same data liveries as the exploded view (livery-apply.ts), on a
 * different scan: the tunnel's car is one mesh per part, with no livery material names and each wing
 * whole (planes and endplates in one mesh). This maps it onto the livery's parts:
 *
 * - `body`: the chassis, both sidepods, the engine cover and the halo (the F226 paints its halo as part
 *   of the body too; the livery's halo box colours it).
 * - `frontWing` and `frontEndplate`, `rearWing` and `rearEndplate`: each wing mesh is one material that
 *   is the plane's rules inboard of `ENDPLATE_CUT` and the endplate's outboard of it, decided per
 *   fragment in the shader (liveryGlslSplit), so the line is crisp and the scan's geometry is untouched.
 * - Everything else (floor, suspension, wheels, exhaust) keeps the tunnel's own carbon, rubber and
 *   metal from applyLivery (livery.ts), which this runs after; the mirrors become carbon like the F226's.
 *
 * The livery's rules are written in the F226's frame, so the paint reads each rest position through the
 * fitted map of tunnel-frame.ts (a uniform of the paint, `uFrame`). The bend stays in the tunnel car's
 * own metres: it reads the rest matrix, never the frame. Where the two cars' surfaces differ by more
 * than a mark's clip box, the mark is moved onto the tunnel car's surface (`tunnelDecals`).
 */
import * as THREE from "three";
import { DECALS } from "./decals";
import { DEFORM_PART, type TunnelDeform } from "./livery";
import { paintMaterial, registerPainted, type PaintedSlot, type PaintOptions } from "./livery-apply";
import type { DecalPlacement, Livery, LiveryPart } from "./livery-spec";
import { TUNNEL_FRAME } from "./tunnel-frame";

/**
 * Across the car, in metres of the tunnel car's own frame, beyond which a wing fragment belongs to an
 * endplate. Read off the tunnel car's wings: the rear wing's endplates are a spike of triangles at 0.56
 * to 0.58 m with the planes all inside 0.555; the front wing's outboard elements start at 0.56 m, as
 * the F226's front endplate material does.
 */
export const ENDPLATE_CUT = 0.555;

const BODY_NODES = ["chassis", "left-sidepod", "right-sidepod", "engine-cover", "halo"];
const WINGS: { node: string; plane: LiveryPart; plate: LiveryPart }[] = [
  { node: "front-wing", plane: "frontWing", plate: "frontEndplate" },
  { node: "rear-wing", plane: "rearWing", plate: "rearEndplate" },
];

/** The map from a rest point of the tunnel car to the F226's frame, as a matrix: scale, then offset. */
export function tunnelFrameMatrix(): THREE.Matrix4 {
  const [sx, sy, sz] = TUNNEL_FRAME.scale;
  const [tx, ty, tz] = TUNNEL_FRAME.offset;
  return new THREE.Matrix4().compose(new THREE.Vector3(tx, ty, tz), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
}

/**
 * Where the tunnel car's body differs from the F226's by more than a mark's clip box (0.05 to 0.09 m), or has
 * no flat surface where the F226's mark goes, the mark moves to where the tunnel car does. Every placement was
 * searched against the tunnel car's own surface in the F226's frame, and tunnel-frame.test.ts holds every mark
 * in every livery to it: a ray through any point of the mark's whole rectangle must meet the surface within
 * 3 cm of its plane, on a face within 25 degrees of its projection axis.
 * - the nose monogram: the tunnel nose top is rounded, so the 0.27 m mark would run down its sides; it is
 *   0.18 m tall, centred at x -1.80, tipped 0.1 to follow the nose top;
 * - the fin monograms: the F226 carries them on the rear blade of its engine cover (x 1.32), where the tunnel
 *   car has a wide, low cover; they go on its airbox fin instead, 0.17 m tall at x 0.40, 0.115 m from the
 *   centreline and leaning 0.27 per metre of height;
 * - the flank wordmark: the flat part of the tunnel car's sidepod wall is a band that runs down toward the
 *   rear (the undercut is a diagonal crease, and the wall tucks in behind it), about 0.17 m across. A
 *   horizontal 0.9 m word ran off the wall onto the undercut. The mark is 0.45 m long and turned 30 degrees
 *   to lie along the band, so the whole word sits on the flat wall; it is the same in every livery;
 * - the wing wordmark: the tunnel car's rear wing top is lower and its elements step, so the mark is 0.6 m
 *   long and sits at y 0.816.
 */
export function tunnelDecals(all: readonly DecalPlacement[]): readonly DecalPlacement[] {
  return all.map((d) => {
    const side: 1 | -1 = d.centre[2] < 0 ? -1 : 1;
    switch (d.id) {
      case "fin-mark-left":
      case "fin-mark-right":
        return { ...d, centre: [0.4, 0.859, side * 0.115], normal: [0, 0.27, side], size: [0.17 * DECALS.mark.aspect, 0.17] };
      case "flank-wordmark-left":
      case "flank-wordmark-right":
        return { ...d, centre: [-0.06, 0.42, side * 0.652], normal: [0.078, 0, side], up: [0.5, 0.866, 0], size: [0.45, 0.45 / DECALS.wordmark.aspect] };
      case "nose-mark":
        return { ...d, centre: [-1.804, 0.638, 0], normal: [-0.1, 1, 0], up: [1, 0.1, 0], size: [0.18 * DECALS.mark.aspect, 0.18] };
      case "wing-wordmark":
        return { ...d, centre: [d.centre[0], 0.816, d.centre[2]], size: [0.6, 0.6 / DECALS.wordmark.aspect] };
      default:
        return d;
    }
  });
}

/**
 * Paints the tunnel car in a livery: call on the loaded root after applyLivery(root, deform), with the
 * same deform (the wings keep bending). The paint is registered per mesh, so `repaintLivery` (livery-apply.ts)
 * puts another livery on it in place.
 */
export function applyTunnelLivery(root: THREE.Object3D, livery: Livery, deform: TunnelDeform): void {
  root.updateMatrixWorld(true);
  const frame = tunnelFrameMatrix();
  const cut = ENDPLATE_CUT * TUNNEL_FRAME.scale[2];

  const paint = (mesh: THREE.Mesh, part: LiveryPart, options: PaintOptions) => {
    const slot: PaintedSlot = { part, rest: mesh.matrixWorld.clone(), options, livery };
    const old = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mesh.material = paintMaterial(livery, part, slot.rest, options);
    for (const m of old) m.dispose();
    registerPainted(mesh, [slot]);
  };

  for (const name of BODY_NODES) {
    root.getObjectByName(name)?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) paint(o as THREE.Mesh, "body", { frame, decals: tunnelDecals });
    });
  }
  for (const { node, plane, plate } of WINGS) {
    root.getObjectByName(node)?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) paint(o as THREE.Mesh, plane, { frame, decals: tunnelDecals, split: { plate, cut }, deform: { uniforms: deform, part: DEFORM_PART[node] } });
    });
  }
}
