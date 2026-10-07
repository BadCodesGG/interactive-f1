import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { applyLivery, createTunnelDeform } from "./livery";
import { paintedSlots, repaintLivery } from "./livery-apply";
import { LIVERIES } from "./liveries";
import { glslFloat } from "./livery-glsl";
import { applyTunnelLivery, ENDPLATE_CUT, tunnelFrameMatrix } from "./tunnel-livery";
import { TUNNEL_FRAME } from "./tunnel-frame";

const stubTextures = () => vi.spyOn(THREE.TextureLoader.prototype, "load").mockImplementation(() => new THREE.Texture());
afterEach(() => vi.restoreAllMocks());

/** The include tokens the paint patches, run through a material's hook. */
function compile(material: THREE.Material) {
  const shader = {
    uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader: "#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>",
    fragmentShader: "#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <lights_physical_fragment>",
  };
  material.onBeforeCompile(shader as never, null as never);
  return shader;
}

/** A wing as the scan has it: one mesh, planes and endplates together. */
function wingGeometry() {
  const tri = (x: number, z: number) => [x, 0.3, z, x + 0.1, 0.3, z, x, 0.35, z];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([...tri(0, 0.2), ...tri(0, 0.7), ...tri(0.2, -0.2)], 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(27).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}

function tunnelCar() {
  const root = new THREE.Group();
  const names = ["chassis", "left-sidepod", "right-sidepod", "engine-cover", "halo", "mirrors", "front-wing", "rear-wing", "floor", "front-left-wheel", "front-suspension", "exhaust"];
  const meshes: Record<string, THREE.Mesh> = {};
  for (const name of names) {
    const mesh = new THREE.Mesh(name.endsWith("wing") ? wingGeometry() : new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ name: "Nose & chassis finish" }));
    mesh.name = name;
    root.add(mesh);
    meshes[name] = mesh;
  }
  const deform = createTunnelDeform();
  applyLivery(root, deform);
  return { root, meshes, deform };
}

describe("tunnelFrameMatrix", () => {
  it("is the fitted map: a rest point of the tunnel car goes to scale * p + offset", () => {
    const [sx, sy, sz] = TUNNEL_FRAME.scale;
    const [tx, ty, tz] = TUNNEL_FRAME.offset;
    const p = new THREE.Vector3(-2.9, 0.4, -0.3).applyMatrix4(tunnelFrameMatrix());
    expect(p.x).toBeCloseTo(sx * -2.9 + tx, 6);
    expect(p.y).toBeCloseTo(sy * 0.4 + ty, 6);
    expect(p.z).toBeCloseTo(sz * -0.3 + tz, 6);
  });
});

describe("applyTunnelLivery", () => {
  it("paints the body nodes and the halo as the livery's body, through the frame map and without the bend", () => {
    stubTextures();
    const c = tunnelCar();
    applyTunnelLivery(c.root, LIVERIES["powder-blue"], c.deform);
    for (const name of ["chassis", "left-sidepod", "right-sidepod", "engine-cover", "halo"]) {
      const m = c.meshes[name].material as THREE.Material;
      expect(m.customProgramCacheKey(), name).toBe("badcodes-livery-data-powder-blue-body-frame");
      const shader = compile(m);
      expect(shader.uniforms.uFrame.value).toBeInstanceOf(THREE.Matrix4);
      expect(shader.uniforms.uPart).toBeUndefined();
    }
  });

  it("paints each wing mesh as the livery's plane and its endplate at once, split across the car in the shader, with the wing's bend and the scan's geometry untouched", () => {
    stubTextures();
    const c = tunnelCar();
    const geometry = c.meshes["front-wing"].geometry;
    const attributes = Object.keys(geometry.attributes);
    applyTunnelLivery(c.root, LIVERIES["powder-blue"], c.deform);
    for (const [name, plane, plate, uPart] of [["front-wing", "frontWing", "frontEndplate", 2], ["rear-wing", "rearWing", "rearEndplate", 1]] as const) {
      const mesh = c.meshes[name];
      const m = mesh.material as THREE.Material;
      expect(Array.isArray(m)).toBe(false);
      expect(m.customProgramCacheKey()).toBe(`badcodes-livery-data-powder-blue-${plane}+${plate}-bend-frame`);
      expect(mesh.geometry.groups).toEqual([]);
      const shader = compile(m);
      expect(shader.fragmentShader).toContain("livPaintA");
      expect(shader.fragmentShader).toContain("livPaintB");
      // The cut is across the car in the livery's frame: the tunnel's own metres times the map's z scale.
      expect(shader.fragmentShader).toContain(`livCover(abs(p.z) - ${glslFloat(ENDPLATE_CUT * TUNNEL_FRAME.scale[2])})`);
      // The bend is the one the tunnel's setup drives: the same uniform objects, the wing's part number.
      expect(shader.uniforms.uRearAoA).toBe(c.deform.uRearAoA);
      expect(shader.uniforms.uPart.value).toBe(uPart);
      expect(shader.vertexShader).toContain("livDeform");
    }
    expect(Object.keys(geometry.attributes)).toEqual(attributes);
    expect(geometry.index).toBeNull();
  });

  it("leaves the floor, wheels, suspension and exhaust in the tunnel's own carbon, rubber and metal, and makes the mirrors carbon too", () => {
    stubTextures();
    const c = tunnelCar();
    const others = ["floor", "front-left-wheel", "front-suspension", "exhaust", "mirrors"];
    const before = Object.fromEntries(others.map((n) => [n, c.meshes[n].material]));
    applyTunnelLivery(c.root, LIVERIES["powder-blue"], c.deform);
    for (const name of others) {
      expect(c.meshes[name].material, name).toBe(before[name]);
      expect(paintedSlots(c.meshes[name]), name).toBeUndefined();
    }
    expect((c.meshes.mirrors.material as THREE.Material).name).toBe("livery-satin");
  });

  it("can be repainted in place with another livery, every slot, the wing with its endplates included", () => {
    stubTextures();
    const c = tunnelCar();
    applyTunnelLivery(c.root, LIVERIES.ghost, c.deform);
    const wing = c.meshes["rear-wing"].material as THREE.Material;
    repaintLivery(c.root, LIVERIES["white-stripes"]);
    expect(c.meshes["rear-wing"].material).toBe(wing);
    expect(wing.customProgramCacheKey()).toBe("badcodes-livery-data-white-stripes-rearWing+rearEndplate-bend-frame");
    expect((c.meshes.chassis.material as THREE.Material).customProgramCacheKey()).toContain("white-stripes");
  });

  it("reads the paint position through the frame but the bend in the car's own metres: the frame is a uniform of the paint, not the rest matrix", () => {
    stubTextures();
    const c = tunnelCar();
    c.root.updateMatrixWorld(true);
    applyTunnelLivery(c.root, LIVERIES.ghost, c.deform);
    const shader = compile(c.meshes["front-wing"].material as THREE.Material);
    expect(shader.uniforms.uRest.value.elements).toEqual(c.meshes["front-wing"].matrixWorld.elements);
    expect(shader.uniforms.uRestInv.value.elements[0]).toBeCloseTo(1, 6);
    expect(shader.vertexShader).toContain("vLivPos = (uFrame * (uRest * vec4(position, 1.0))).xyz;");
    expect(shader.vertexShader).toContain("livDeform((uRest * vec4(position, 1.0)).xyz");
  });
});
