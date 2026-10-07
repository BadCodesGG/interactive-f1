/**
 * How the car is lit on the lap. The showroom lights it for a camera that circles it from above; the lap's
 * camera rides low behind it, and a clear coat seen at that grazing angle reflects the dark horizon of the
 * studio, not its softboxes: the paint goes black and no panel shows. So for the lap the car is given a
 * reflection of its own (a tent of softboxes built around it in its own frame: overhead, along both sides, and
 * one ahead and one behind, so every one of the three views meets a bright panel in the paint), and three
 * directional lights that stay behind the camera (a key) and behind the car (two rims) wherever the camera goes.
 * Both are installed on attach and taken away on detach; the showroom's own lights and environment are left alone.
 */
import * as THREE from "three";
import { buildStudioScene, disposeStudioScene, STUDIO_RADIUS, type StudioLayout, type StudioPanel } from "@/engine/explode/studio";

export type LapTheme = "light" | "dark";

/** The tent, per theme: radiances are what the paint reflects (the car's environment is used at intensity 1), linear. */
const TENT = {
  light: { surround: "#4a4f58", key: 1.6, sides: 6, ends: 3.4, floor: 0.2 },
  dark: { surround: "#090a0d", key: 1.5, sides: 8, ends: 3.4, floor: 0.1 },
} as const;

type Vec3 = [number, number, number];

/** A softbox of the tent. The studio's own panels are four with fixed names; the tent has more, so the name is free. */
export interface Softbox extends Omit<StudioPanel, "name"> {
  name: string;
}

/** A softbox of the given size at `centre`, facing the origin (the car), its height as near world up as it can be. */
function softbox(name: string, centre: Vec3, width: number, height: number, radiance: number): Softbox {
  const normal = new THREE.Vector3(...centre).negate().normalize();
  const right = Math.abs(normal.y) > 0.999 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0).cross(normal).normalize();
  const up = normal.clone().cross(right);
  return { name, centre, right: right.toArray(), up: up.toArray(), normal: normal.toArray(), width, height, radiance };
}

/**
 * The tent around the car, in the car's frame (nose toward -x, up +y, its left +z). Along the car the panels
 * are as long as the car; the two ends are what the camera's reflection off a top surface meets when it looks
 * along the car from behind or ahead, a low 15 to 20 degrees above the horizon.
 */
export function lapLayout(theme: LapTheme): { surround: string; panels: Softbox[] } {
  const t = TENT[theme];
  return {
    surround: t.surround,
    panels: [
      softbox("key", [0, 9, 0], 16, 3.5, t.key),
      softbox("side-left", [0, 3.2, 7.5], 16, 1.6, t.sides),
      softbox("side-right", [0, 3.2, -7.5], 16, 1.6, t.sides),
      softbox("end-ahead", [-13, 3.6, 0], 7, 2.6, t.ends),
      softbox("end-behind", [13, 3.6, 0], 7, 2.6, t.ends),
      softbox("floor", [0, -7, 0], 40, 40, t.floor),
    ],
  };
}

/** The tent as a prefiltered environment map; the caller disposes the target. */
export function buildLapEnvironment(gl: THREE.WebGLRenderer, theme: LapTheme): THREE.WebGLRenderTarget {
  const pmrem = new THREE.PMREMGenerator(gl);
  // The studio builds whatever panels it is given; its type names only its own four, which is a label on a mesh.
  const built = buildStudioScene(lapLayout(theme) as StudioLayout);
  // No pre-blur: the clear coat keeps the softboxes' crisp edges (the showroom's own choice).
  const target = pmrem.fromScene(built, 0, 0.1, STUDIO_RADIUS * 2);
  disposeStudioScene(built);
  pmrem.dispose();
  return target;
}

/**
 * Gives every physical material under `root` an environment of its own for the lap (it then ignores the
 * scene's, which the showroom owns and eases on a theme change), and takes it back. A material made later
 * is not in the list: the livery is repainted in place, on the materials the stage already holds.
 */
export function carReflections(root: THREE.Object3D) {
  const saved = new Map<THREE.MeshStandardMaterial, { map: THREE.Texture | null; intensity: number }>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of [mesh.material].flat() as THREE.Material[]) {
      const mat = m as THREE.MeshStandardMaterial;
      if (mat.isMeshStandardMaterial && !saved.has(mat)) saved.set(mat, { map: mat.envMap, intensity: mat.envMapIntensity });
    }
  });
  return {
    set(texture: THREE.Texture) {
      for (const mat of saved.keys()) {
        mat.envMap = texture;
        mat.envMapIntensity = 1;
      }
    },
    restore() {
      for (const [mat, was] of saved) {
        mat.envMap = was.map;
        mat.envMapIntensity = was.intensity;
      }
    },
  };
}

/** The rig's lights per theme: where they stand behind the camera (local x toward the camera), their colour, their strength. */
const RIG = {
  light: { key: { at: [9, 8, 3] as Vec3, colour: "#fff3e3", intensity: 1.6 }, rim: { at: [-9, 4, 7] as Vec3, colour: "#ffffff", intensity: 2.2 } },
  dark: { key: { at: [9, 8, 3] as Vec3, colour: "#e6eeff", intensity: 1.3 }, rim: { at: [-9, 4, 7] as Vec3, colour: "#cfe0ff", intensity: 2.6 } },
} as const;

/**
 * A key light above and behind the camera and a rim light to each side of the car's far end, in a group that
 * turns about the car to stay where the camera is: `face(azimuth)` takes the camera's bearing about the car,
 * as atan2(-z, x) of its position (0 is straight behind the car, which is +x).
 */
export function createRig(theme: LapTheme) {
  const group = new THREE.Group();
  group.name = "__lap_rig";
  const key = new THREE.DirectionalLight();
  const rimLeft = new THREE.DirectionalLight();
  const rimRight = new THREE.DirectionalLight();
  group.add(key, key.target, rimLeft, rimLeft.target, rimRight, rimRight.target);
  const paint = (next: LapTheme) => {
    const r = RIG[next];
    key.color.set(r.key.colour);
    key.intensity = r.key.intensity;
    key.position.set(...r.key.at);
    for (const [light, side] of [[rimLeft, 1], [rimRight, -1]] as const) {
      light.color.set(r.rim.colour);
      light.intensity = r.rim.intensity;
      light.position.set(r.rim.at[0], r.rim.at[1], r.rim.at[2] * side);
    }
  };
  paint(theme);
  return {
    group,
    paint,
    face(azimuth: number) {
      group.rotation.y = azimuth;
    },
    dispose() {
      key.dispose();
      rimLeft.dispose();
      rimRight.dispose();
    },
  };
}
