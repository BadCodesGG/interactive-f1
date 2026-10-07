import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { applyLiveryDef, PAINT_MATERIAL, repaintLivery } from "./livery-apply";
import { BADCODES } from "./livery-badcodes";
import { LIVERIES, LIVERY_IDS } from "./liveries";
import { applyShowroomLivery } from "./livery";
import { holdPaint, releasePaint } from "./paint-hold";

/** The include tokens the livery patches, run through a material's hook. */
function compile(material: THREE.Material) {
  const shader = {
    uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader: "#include <common>\n#include <begin_vertex>",
    fragmentShader: "#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <lights_physical_fragment>",
  };
  material.onBeforeCompile(shader as never, null as never);
  return shader;
}

function car() {
  const root = new THREE.Object3D();
  const add = (name: string) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name }));
    root.add(mesh);
    return mesh;
  };
  return { root, body: add("BodyLivery"), wing: add("RearWingLivery"), carbon: add("Carbon"), body2: add("BodyLivery") };
}

afterEach(() => vi.restoreAllMocks());

describe("applyLiveryDef", () => {
  // The textures load over the network in the browser; here they are empty ones.
  const stub = () => vi.spyOn(THREE.TextureLoader.prototype, "load").mockImplementation(() => new THREE.Texture());

  it("paints the parts the livery names and leaves every other material alone", () => {
    stub();
    const c = car();
    const carbon = c.carbon.material;
    applyLiveryDef(c.root, BADCODES);
    expect((c.body.material as THREE.Material).name).toBe(PAINT_MATERIAL);
    expect((c.wing.material as THREE.Material).name).toBe(PAINT_MATERIAL);
    expect(c.carbon.material).toBe(carbon);
  });

  it("gives each mesh its own material, since each carries its own rest matrix", () => {
    stub();
    const c = car();
    applyLiveryDef(c.root, BADCODES);
    expect(c.body.material).not.toBe(c.body2.material);
  });

  it("keeps the tint hooks working: white base colour, no emissive, paint multiplied into diffuseColor", () => {
    stub();
    const c = car();
    applyLiveryDef(c.root, BADCODES);
    const m = c.body.material as THREE.MeshStandardMaterial;
    expect(m.color.getHexString()).toBe("ffffff");
    expect(m.emissive.getHex()).toBe(0);
    const shader = compile(m);
    expect(shader.fragmentShader).toContain("diffuseColor.rgb *= livO.colour;");
    // Multiplied, never assigned: the stage's isolate dimming and hover glow arrive through `color` and `emissive`.
    expect(shader.fragmentShader).not.toMatch(/diffuseColor\.rgb\s*=[^=]/);
  });

  it("sets the finish per fragment: roughness, metalness and the clear coat behind the physical guard", () => {
    stub();
    const c = car();
    applyLiveryDef(c.root, BADCODES);
    const frag = compile(c.body.material as THREE.Material).fragmentShader;
    expect(frag).toContain("roughnessFactor = livO.fin.y;");
    expect(frag).toContain("metalnessFactor = livO.fin.x;");
    expect(frag).toMatch(/#ifdef USE_CLEARCOAT\s+material\.clearcoat = livO\.fin\.z;\s+material\.clearcoatRoughness = livO\.fin\.w;\s+#endif/);
  });

  it("reads the rest-pose position, not the live one, and binds the logo textures the part samples", () => {
    stub();
    const c = car();
    c.root.updateMatrixWorld(true);
    applyLiveryDef(c.root, BADCODES);
    const body = compile(c.body.material as THREE.Material);
    expect(body.uniforms.uRest.value).toBeInstanceOf(THREE.Matrix4);
    expect(Object.keys(body.uniforms).sort()).toEqual(["uLivTexMark", "uLivTexWordmark", "uRest"]);
    expect(body.vertexShader).toContain("vLivPos = (uRest * vec4(position, 1.0)).xyz;");
    const wing = compile(c.wing.material as THREE.Material);
    expect(Object.keys(wing.uniforms).sort()).toEqual(["uLivTexWordmark", "uRest"]);
  });

  it("colours the two logo textures correctly: the monogram as sRGB, the wordmark mask as data", () => {
    stub();
    const c = car();
    applyLiveryDef(c.root, BADCODES);
    const body = compile(c.body.material as THREE.Material);
    expect((body.uniforms.uLivTexMark.value as THREE.Texture).colorSpace).toBe(THREE.SRGBColorSpace);
    expect((body.uniforms.uLivTexWordmark.value as THREE.Texture).colorSpace).toBe(THREE.NoColorSpace);
  });

  it("compiles one program per livery and part", () => {
    stub();
    const c = car();
    applyLiveryDef(c.root, BADCODES);
    const keys = [c.body, c.body2, c.wing].map((m) => (m.material as THREE.Material).customProgramCacheKey());
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).not.toBe(keys[2]);
  });

  it("survives the showroom pass that follows it: the painted materials are not replaced", () => {
    stub();
    const c = car();
    applyLiveryDef(c.root, BADCODES);
    const painted = c.body.material;
    applyShowroomLivery(c.root);
    expect(c.body.material).toBe(painted);
    // The carbon it did not paint is the showroom's satin.
    expect((c.carbon.material as THREE.Material).name).toBe("livery-satin");
  });
});

describe("repaintLivery", () => {
  const stub = () => vi.spyOn(THREE.TextureLoader.prototype, "load").mockImplementation(() => new THREE.Texture());
  const keyOf = (m: THREE.Object3D) => ((m as THREE.Mesh).material as THREE.Material).customProgramCacheKey();

  it("repaints the materials it painted, in place, and asks for a rebuild of each", () => {
    stub();
    const c = car();
    applyLiveryDef(c.root, LIVERIES.ghost);
    const before = [c.body.material, c.wing.material, c.body2.material];
    const versions = before.map((m) => (m as THREE.Material).version);
    const sources = before.map((m) => compile(m as THREE.Material).fragmentShader);
    repaintLivery(c.root, LIVERIES["powder-blue"]);
    expect([c.body.material, c.wing.material, c.body2.material]).toEqual(before);
    [c.body, c.wing, c.body2].forEach((mesh, i) => {
      expect(keyOf(mesh)).toContain("powder-blue");
      expect((mesh.material as THREE.Material).version).toBeGreaterThan(versions[i]);
      expect(compile(mesh.material as THREE.Material).fragmentShader).not.toBe(sources[i]);
    });
  });

  it("does nothing for a livery the car already wears, so a settled car is not recompiled", () => {
    stub();
    const c = car();
    applyLiveryDef(c.root, LIVERIES.ghost);
    const version = (c.body.material as THREE.Material).version;
    repaintLivery(c.root, LIVERIES.ghost);
    expect((c.body.material as THREE.Material).version).toBe(version);
    repaintLivery(c.root, LIVERIES["powder-blue"]);
    repaintLivery(c.root, LIVERIES["powder-blue"]);
    expect((c.body.material as THREE.Material).version).toBe(version + 1);
  });

  it("paints each part by the new livery's rules for it", () => {
    stub();
    const c = car();
    applyLiveryDef(c.root, LIVERIES.ghost);
    repaintLivery(c.root, LIVERIES["white-stripes"]);
    expect(keyOf(c.body)).not.toBe(keyOf(c.wing));
    // The white-stripes livery's wing carries no decal of the monogram, its body does: the textures follow the new rules.
    expect(Object.keys(compile(c.body.material as THREE.Material).uniforms).sort()).toEqual(["uLivTexMark", "uLivTexWordmark", "uRest"]);
    expect(Object.keys(compile(c.wing.material as THREE.Material).uniforms).sort()).toEqual(["uLivTexWordmark", "uRest"]);
  });

  it("keeps the rest pose the car was painted in, even when a part has moved since (the explode)", () => {
    stub();
    const c = car();
    c.root.updateMatrixWorld(true);
    applyLiveryDef(c.root, LIVERIES.ghost);
    c.body.position.set(0, 3, 0);
    c.root.updateMatrixWorld(true);
    repaintLivery(c.root, LIVERIES["racing-red"]);
    expect(compile(c.body.material as THREE.Material).uniforms.uRest.value.elements[13]).toBe(0);
  });

  it("finds a material the stage or the surfaces hook has swapped in since, by the mesh it is on", () => {
    stub();
    const c = car();
    applyLiveryDef(c.root, LIVERIES.ghost);
    const swapped = new THREE.MeshPhysicalMaterial({ name: PAINT_MATERIAL });
    c.body.material = swapped;
    repaintLivery(c.root, LIVERIES["black-gold"]);
    expect(c.body.material).toBe(swapped);
    expect(swapped.customProgramCacheKey()).toContain("black-gold");
    expect(compile(swapped).fragmentShader).toContain("livPaint");
  });

  it("leaves a mesh it did not paint alone", () => {
    stub();
    const c = car();
    applyLiveryDef(c.root, LIVERIES.ghost);
    const carbon = c.carbon.material as THREE.Material;
    const hook = carbon.onBeforeCompile;
    repaintLivery(c.root, LIVERIES["powder-blue"]);
    expect(c.carbon.material).toBe(carbon);
    expect(carbon.onBeforeCompile).toBe(hook);
  });

  it("goes from any livery to any other, since all eight paint every part", () => {
    stub();
    const c = car();
    applyLiveryDef(c.root, LIVERIES.ghost);
    for (const id of LIVERY_IDS) {
      repaintLivery(c.root, LIVERIES[id]);
      expect(keyOf(c.body), id).toContain(id);
      expect(compile(c.body.material as THREE.Material).fragmentShader, id).toContain("livPaint");
    }
  });
});

describe("holdPaint", () => {
  const stub = () => vi.spyOn(THREE.TextureLoader.prototype, "load").mockImplementation(() => new THREE.Texture());
  const keyOf = (m: THREE.Material) => m.customProgramCacheKey();

  it("sends a repaint to the paint behind a stand-in, not to the stand-in", () => {
    stub();
    const c = car();
    applyLiveryDef(c.root, LIVERIES.ghost);
    const paint = c.wing.material as THREE.Material;
    const standIn = new THREE.MeshStandardMaterial();
    const standInKey = keyOf(standIn);
    holdPaint(c.wing, paint);
    c.wing.material = standIn;
    repaintLivery(c.root, LIVERIES["powder-blue"]);
    expect(keyOf(standIn)).toBe(standInKey);
    expect(standIn.onBeforeCompile).toBe(new THREE.MeshStandardMaterial().onBeforeCompile);
    expect(keyOf(paint)).toContain("powder-blue");
    c.wing.material = paint as THREE.MeshStandardMaterial;
    releasePaint(c.wing);
    expect(keyOf(c.wing.material as THREE.Material)).toContain("powder-blue");
  });

  it("goes back to repainting what is on the mesh once it is released", () => {
    stub();
    const c = car();
    applyLiveryDef(c.root, LIVERIES.ghost);
    holdPaint(c.wing, c.wing.material);
    releasePaint(c.wing);
    repaintLivery(c.root, LIVERIES["racing-red"]);
    expect(keyOf(c.wing.material as THREE.Material)).toContain("racing-red");
  });
});
