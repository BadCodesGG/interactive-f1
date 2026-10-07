/**
 * The photo-studio environment (`render.env: "studio"`), built in code with no downloads.
 *
 * A dark-to-mid neutral surround, one large overhead softbox (a long rectangle, long along x: the way
 * a car is built), two tall strip softboxes at the sides-back and a dim floor bounce. The stage draws
 * these emissive panels into a PMREM cube (see `buildStudioScene`), so a clearcoat or metal part
 * reflects each one as a crisp stripe with a clean dark between them.
 *
 * `studioLayout()` is the pure half: where each panel is and how bright. `diffuseIrradiance()` reads
 * the same layout back as the radiance a white matte surface would return, which is what the radiances
 * are tuned against so that `envIntensity` 1 is a sensible exposure (the test pins it).
 */
import * as THREE from "three";
import type { StudioOptions } from "./render";

export type Vec3 = [number, number, number];

export interface StudioPanel {
  name: "key" | "strip-left" | "strip-right" | "floor";
  centre: Vec3;
  /** An orthonormal frame: `right` x `up` = `normal`, which faces the origin (the model). */
  right: Vec3;
  up: Vec3;
  normal: Vec3;
  width: number;
  height: number;
  /** Linear radiance, above 1 for a light that should read as blown out in a reflection. */
  radiance: number;
}

export interface StudioLayout {
  /** The surround's colour at its brightest (straight up), hex. */
  surround: string;
  panels: StudioPanel[];
}

/** Softbox radiance at gain 1, linear. Tuned so a white matte surface returns about 0.9 (see the test). */
export const STUDIO_RADIANCE = { key: 3.2, strips: 6, floor: 0.2 } as const;
/** The surround sphere's radius; the cube camera's far plane must reach it. */
export const STUDIO_RADIUS = 60;
/** How much of a panel's width and height fades out at each edge, so a reflection has a soft edge. */
const FEATHER = 0.08;

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** A panel's brightness at (u, v) in 0..1 across it: 1 inside, easing to 0 at the edge. */
export function panelMask(u: number, v: number): number {
  const edge = (t: number) => smooth(Math.min(t, 1 - t) / FEATHER);
  return edge(u) * edge(v);
}

/** The surround's brightness for a direction's y (-1 down, 1 up): full overhead, half at the horizon, a fifth below. */
export function surroundFactor(y: number): number {
  return y >= 0 ? 0.5 + 0.5 * y : 0.5 + 0.3 * y;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** A panel of the given size at `centre`, facing the origin with its height as near world up as it can be. */
function panel(name: StudioPanel["name"], centre: Vec3, width: number, height: number, radiance: number): StudioPanel {
  const normal = unit(sub([0, 0, 0], centre));
  // Straight above or below the origin there is no "near up": take x as the width instead.
  const right = Math.abs(normal[1]) > 0.999 ? ([1, 0, 0] as Vec3) : unit(cross([0, 1, 0], normal));
  return { name, centre, right, up: cross(normal, right), normal, width, height, radiance };
}

/** The studio for a set of options (resolved: see `resolveStudio`). */
export function studioLayout(options: Required<StudioOptions>): StudioLayout {
  const { key, strips, surround } = options;
  return {
    surround,
    panels: [
      panel("key", [0, 8, 0], 20, 5, STUDIO_RADIANCE.key * key),
      panel("strip-left", [6, 2.5, 9], 2.2, 10, STUDIO_RADIANCE.strips * strips),
      panel("strip-right", [6, 2.5, -9], 2.2, 10, STUDIO_RADIANCE.strips * strips),
      panel("floor", [0, -7, 0], 40, 40, STUDIO_RADIANCE.floor),
    ],
  };
}

const luminance = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/** The panel a ray from the origin along `dir` meets, and where on it (u, v in 0..1), if any. */
function hit(p: StudioPanel, dir: Vec3): { u: number; v: number } | null {
  const facing = dot(dir, p.normal);
  if (facing >= 0) return null;
  const t = dot(p.centre, p.normal) / facing;
  if (t <= 0) return null;
  const at = sub([dir[0] * t, dir[1] * t, dir[2] * t], p.centre);
  const u = dot(at, p.right) / p.width + 0.5;
  const v = dot(at, p.up) / p.height + 0.5;
  return u < 0 || u > 1 || v < 0 || v > 1 ? null : { u, v };
}

/**
 * The radiance a white Lambertian surface with this normal returns under the studio at gain 1, which
 * is its irradiance over pi: about 1 is a white card at full exposure. A numerical integral over the
 * sphere of directions, cosine weighted.
 */
export function diffuseIrradiance(layout: StudioLayout, normal: Vec3 = [0, 1, 0], steps = 160): number {
  const base = luminance(new THREE.Color(layout.surround));
  const n = unit(normal);
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    // Equal-area bands in y, so every sample stands for the same solid angle.
    const y = 1 - (2 * (i + 0.5)) / steps;
    const ring = Math.sqrt(1 - y * y);
    for (let j = 0; j < steps * 2; j++) {
      const phi = (2 * Math.PI * (j + 0.5)) / (steps * 2);
      const dir: Vec3 = [ring * Math.cos(phi), y, ring * Math.sin(phi)];
      const cos = dot(dir, n);
      if (cos <= 0) continue;
      let radiance = base * surroundFactor(y);
      for (const p of layout.panels) {
        const h = hit(p, dir);
        if (h) {
          const m = panelMask(h.u, h.v);
          radiance = radiance * (1 - m) + p.radiance * m;
        }
      }
      sum += radiance * cos;
    }
  }
  // Each sample is 4 pi / (2 steps^2) sr; divided by pi.
  return (sum * 4) / (2 * steps * steps);
}

/** A 128 px texture of `panelMask`, in alpha: white everywhere, so the material's colour is the radiance. */
function maskTexture(): THREE.DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const at = (y * size + x) * 4;
      data[at] = data[at + 1] = data[at + 2] = 255;
      data[at + 3] = Math.round(255 * panelMask((x + 0.5) / size, (y + 0.5) / size));
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

/**
 * The layout as a scene for `PMREMGenerator.fromScene`: a surround sphere shaded by `surroundFactor`
 * and one emissive, soft-edged plane per panel. Dispose it with `disposeStudioScene` once the PMREM
 * has been taken.
 */
export function buildStudioScene(layout: StudioLayout): THREE.Scene {
  const scene = new THREE.Scene();

  const sky = new THREE.SphereGeometry(STUDIO_RADIUS, 48, 24);
  const pos = sky.getAttribute("position");
  const base = new THREE.Color(layout.surround);
  const colours = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const f = surroundFactor(pos.getY(i) / STUDIO_RADIUS);
    colours.set([base.r * f, base.g * f, base.b * f], i * 3);
  }
  sky.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  scene.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, toneMapped: false })));

  const mask = maskTexture();
  for (const p of layout.panels) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(p.width, p.height),
      new THREE.MeshBasicMaterial({ map: mask, color: new THREE.Color(p.radiance, p.radiance, p.radiance), transparent: true, depthWrite: false, toneMapped: false }),
    );
    mesh.name = p.name;
    mesh.position.set(...p.centre);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...p.right), new THREE.Vector3(...p.up), new THREE.Vector3(...p.normal)));
    mesh.renderOrder = 1;
    scene.add(mesh);
  }
  return scene;
}

/** Frees what `buildStudioScene` made. */
export function disposeStudioScene(scene: THREE.Scene): void {
  const maps = new Set<THREE.Texture>();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mat = mesh.material as THREE.MeshBasicMaterial;
    if (mat.map) maps.add(mat.map);
    mat.dispose();
  });
  for (const m of maps) m.dispose();
}
