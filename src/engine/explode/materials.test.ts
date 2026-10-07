import { describe, expect, it } from "vitest";
import { BoxGeometry, Color, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial } from "three";
import { brushedMetal, clearcoatPaint, glass, satinPlastic, setMaterial, tissue } from "./materials";

const presets: [string, () => MeshPhysicalMaterial][] = [
  ["clearcoatPaint", () => clearcoatPaint("#cc2200")],
  ["brushedMetal", () => brushedMetal("#a0a4aa")],
  ["satinPlastic", () => satinPlastic("#202428")],
  ["tissue", () => tissue("#c46a6a")],
  ["glass", () => glass()],
];

describe.each(presets)("%s", (_name, make) => {
  it("is a MeshPhysicalMaterial, which the stage tints as a MeshStandardMaterial", () => {
    const m = make();
    expect(m).toBeInstanceOf(MeshPhysicalMaterial);
    expect(m.isMeshStandardMaterial).toBe(true);
  });

  it("leaves the emissive glow to the stage: black, at full intensity", () => {
    const m = make();
    expect(m.emissive.getHex()).toBe(0x000000);
    expect(m.emissiveIntensity).toBe(1);
  });

  it("leaves opacity to the stage's ghost and X-ray looks", () => {
    const m = make();
    expect(m.opacity).toBe(1);
    expect(m.transparent).toBe(false);
  });

  it("survives the stage's per-mesh clone with its finish and lets the stage drive colour and emissive", () => {
    const original = make();
    const clone = original.clone();
    expect(clone).toBeInstanceOf(MeshPhysicalMaterial);
    expect(clone).not.toBe(original);
    for (const key of ["clearcoat", "sheen", "transmission", "roughness", "metalness"] as const) expect(clone[key]).toBe(original[key]);
    // What the stage does each frame: colour to a tint and emissive to the accent glow.
    const base = clone.color.clone();
    clone.color.copy(base).lerp(new Color("#ff00ff"), 0.5);
    clone.emissive.set("#000000").lerp(new Color("#e8b84c"), 0.22);
    expect(clone.color.equals(base)).toBe(false);
    expect(clone.emissive.getHex()).not.toBe(0);
    expect(original.color.equals(base)).toBe(true);
    expect(original.emissive.getHex()).toBe(0);
  });
});

describe("the finishes", () => {
  it("clearcoatPaint has a clear coat, brushedMetal is metal, tissue has a visible sheen, glass transmits", () => {
    expect(clearcoatPaint("#fff").clearcoat).toBe(1);
    expect(brushedMetal("#fff").metalness).toBeGreaterThan(0.9);
    expect(satinPlastic("#fff").metalness).toBe(0);
    const t = tissue("#803030");
    expect(t.sheen).toBe(1);
    // Black sheen shows nothing: it must be lighter than the base colour.
    expect(t.sheenColor.r + t.sheenColor.g + t.sheenColor.b).toBeGreaterThan(t.color.r + t.color.g + t.color.b);
    expect(glass().transmission).toBe(1);
  });

  it("takes the colour it is given", () => {
    expect(clearcoatPaint("#ff0000").color.getHexString()).toBe("ff0000");
    expect(brushedMetal(0x00ff00).color.getHexString()).toBe("00ff00");
  });
});

describe("setMaterial", () => {
  it("replaces a single material", () => {
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const m = clearcoatPaint("#fff");
    setMaterial(mesh, m);
    expect(mesh.material).toBe(m);
  });

  it("fills every slot of a multi-material mesh", () => {
    const mesh = new Mesh(new BoxGeometry(), [new MeshStandardMaterial(), new MeshStandardMaterial()]);
    const m = satinPlastic("#fff");
    setMaterial(mesh, m);
    expect(mesh.material).toEqual([m, m]);
  });
});
