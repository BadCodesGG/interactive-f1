import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DEFAULT_STUDIO, resolveRender, resolveStudio, STUDIO_GAIN_MAX, type QualityEnv } from "./render";
import { buildStudioScene, diffuseIrradiance, disposeStudioScene, panelMask, studioLayout, surroundFactor, STUDIO_RADIUS } from "./studio";

const desktop: QualityEnv = { coarse: false, reducedData: false };
const layout = (o = {}) => studioLayout(resolveStudio(o));

describe("resolveStudio", () => {
  it("is the defaults with nothing given", () => {
    expect(resolveStudio(undefined)).toEqual(DEFAULT_STUDIO);
  });

  it("clamps gains to 0..max and ignores values that are not finite numbers or hex", () => {
    expect(resolveStudio({ key: -3, strips: 1000 })).toMatchObject({ key: 0, strips: STUDIO_GAIN_MAX });
    expect(resolveStudio({ key: NaN, strips: Infinity, surround: "grey" })).toEqual(DEFAULT_STUDIO);
    expect(resolveStudio({ surround: "#abc" }).surround).toBe("#abc");
    expect(resolveStudio({ surround: "#9aa0aa" }).surround).toBe("#9aa0aa");
  });
});

describe("resolveRender env kinds", () => {
  it("keeps true as the room, and accepts room and studio", () => {
    expect(resolveRender({ env: true }, "dark", desktop)).toMatchObject({ env: true, envKind: "room" });
    expect(resolveRender({ env: "room" }, "dark", desktop)).toMatchObject({ env: true, envKind: "room" });
    expect(resolveRender({ env: "studio" }, "dark", desktop)).toMatchObject({ env: true, envKind: "studio" });
    expect(resolveRender({ env: false }, "dark", desktop)).toMatchObject({ env: false });
    expect(resolveRender({ env: "sunset" as never }, "dark", desktop)).toMatchObject({ env: false });
  });

  it("resolves studio settings per theme", () => {
    const render = { env: "studio" as const, dark: { studio: { surround: "#101010" } }, light: { studio: { key: 1.4, surround: "#a0a4ac" } } };
    expect(resolveRender(render, "dark", desktop).studio).toEqual({ ...DEFAULT_STUDIO, surround: "#101010" });
    expect(resolveRender(render, "light", desktop).studio).toEqual({ key: 1.4, strips: 1, surround: "#a0a4ac" });
  });
});

describe("studioLayout", () => {
  it("has an overhead key, two strips at the sides-back and a floor bounce, all facing the model", () => {
    const l = layout();
    expect(l.panels.map((p) => p.name)).toEqual(["key", "strip-left", "strip-right", "floor"]);
    for (const p of l.panels) {
      const toOrigin = [-p.centre[0], -p.centre[1], -p.centre[2]];
      const len = Math.hypot(...toOrigin);
      expect(p.normal[0] * (toOrigin[0] / len) + p.normal[1] * (toOrigin[1] / len) + p.normal[2] * (toOrigin[2] / len)).toBeCloseTo(1, 6);
      // right x up = normal
      const c = [p.right[1] * p.up[2] - p.right[2] * p.up[1], p.right[2] * p.up[0] - p.right[0] * p.up[2], p.right[0] * p.up[1] - p.right[1] * p.up[0]];
      c.forEach((v, i) => expect(v).toBeCloseTo(p.normal[i], 6));
    }
    const [key, left, right] = l.panels;
    expect(key.centre[1]).toBeGreaterThan(5);
    expect(key.width).toBeGreaterThan(key.height * 2);
    expect(left.centre[2]).toBeGreaterThan(0);
    expect(right.centre[2]).toBeLessThan(0);
    expect(left.centre[0]).toBeGreaterThan(0);
    expect(left.height).toBeGreaterThan(left.width * 3);
    // Strips stand upright: their height axis is (nearly) vertical.
    expect(left.up[1]).toBeGreaterThan(0.9);
  });

  it("scales the softboxes by their gains and leaves the bounce alone", () => {
    const [k1, s1, , f1] = layout().panels;
    const [k2, s2, , f2] = layout({ key: 2, strips: 0.5 }).panels;
    expect(k2.radiance).toBeCloseTo(k1.radiance * 2);
    expect(s2.radiance).toBeCloseTo(s1.radiance * 0.5);
    expect(f2.radiance).toBe(f1.radiance);
  });

  it("keeps every panel inside the surround sphere the cube camera can see", () => {
    for (const p of layout().panels) expect(Math.hypot(...p.centre) + Math.hypot(p.width, p.height) / 2).toBeLessThan(STUDIO_RADIUS);
  });
});

describe("exposure", () => {
  it("gives a white matte surface facing up about full exposure at envIntensity 1 (a bit under, so paint does not clip)", () => {
    const e = diffuseIrradiance(layout());
    expect(e).toBeGreaterThan(0.6);
    expect(e).toBeLessThan(1);
  });

  it("is dominated by the overhead softbox, and a side-facing surface is darker than an upward one", () => {
    const up = diffuseIrradiance(layout());
    const noKey = diffuseIrradiance(layout({ key: 0 }));
    expect(noKey).toBeLessThan(up * 0.5);
    expect(diffuseIrradiance(layout(), [1, 0, 0])).toBeLessThan(up);
  });

  it("follows the key and strip gains, and a brighter surround lifts the whole room", () => {
    const base = diffuseIrradiance(layout());
    expect(diffuseIrradiance(layout({ key: 2 }))).toBeGreaterThan(base);
    expect(diffuseIrradiance(layout({ strips: 2 }))).toBeGreaterThan(base);
    expect(diffuseIrradiance(layout({ surround: "#a0a4ac" }))).toBeGreaterThan(base + 0.2);
  });

  it("leaves deep darks between the lights: the surround is dark at its default", () => {
    const base = new THREE.Color(DEFAULT_STUDIO.surround);
    expect(base.g).toBeLessThan(0.02);
    expect(surroundFactor(1)).toBe(1);
    expect(surroundFactor(-1)).toBeLessThan(surroundFactor(0));
  });
});

describe("panelMask", () => {
  it("is 1 inside and fades to 0 at every edge", () => {
    expect(panelMask(0.5, 0.5)).toBe(1);
    expect(panelMask(0, 0.5)).toBe(0);
    expect(panelMask(0.5, 1)).toBe(0);
    expect(panelMask(0.02, 0.5)).toBeGreaterThan(0);
    expect(panelMask(0.02, 0.5)).toBeLessThan(1);
  });
});

describe("buildStudioScene", () => {
  it("makes a surround sphere and one plane per panel, coloured by radiance, and disposes cleanly", () => {
    const l = layout();
    const scene = buildStudioScene(l);
    const meshes = scene.children as THREE.Mesh[];
    expect(meshes).toHaveLength(1 + l.panels.length);
    const key = scene.getObjectByName("key") as THREE.Mesh;
    expect((key.material as THREE.MeshBasicMaterial).color.r).toBeCloseTo(l.panels[0].radiance);
    // The panel sits where the layout says, facing the origin.
    scene.updateMatrixWorld(true);
    const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(key.quaternion);
    expect(facing.y).toBeCloseTo(-1, 6);
    expect(key.position.y).toBe(8);
    let disposed = 0;
    for (const m of meshes) m.geometry.addEventListener("dispose", () => disposed++);
    disposeStudioScene(scene);
    expect(disposed).toBe(meshes.length);
  });
});
