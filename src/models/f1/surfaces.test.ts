import { describe, expect, it } from "vitest";
import { BoxGeometry, Mesh, MeshPhysicalMaterial, MeshStandardMaterial } from "three";
import { surfaces } from "./surfaces";

/** A mesh wearing a standard material of the given name, as the livery leaves it. */
function meshWith(name: string, params: ConstructorParameters<typeof MeshStandardMaterial>[0] = {}) {
  return new Mesh(new BoxGeometry(), new MeshStandardMaterial({ name, ...params }));
}
const physical = (m: Mesh) => m.material as MeshPhysicalMaterial;

describe("surfaces", () => {
  it("puts a clear coat on the pearl body and keeps the livery shader and double sidedness", () => {
    const hook = () => {};
    const mesh = meshWith("livery-pearl", { side: 2 });
    mesh.material.onBeforeCompile = hook;
    mesh.material.customProgramCacheKey = () => "k";
    surfaces(mesh);
    const m = physical(mesh);
    expect(m.isMeshPhysicalMaterial).toBe(true);
    expect(m.clearcoat).toBeGreaterThanOrEqual(0.9);
    expect(m.clearcoatRoughness).toBeLessThanOrEqual(0.06);
    expect(m.roughness).toBeLessThanOrEqual(0.35);
    // The clear coat alone draws the studio's softboxes: a metallic base would smear them into a white glare.
    expect(m.metalness).toBeLessThanOrEqual(0.1);
    expect(m.onBeforeCompile).toBe(hook);
    expect(m.customProgramCacheKey()).toBe("k");
    expect(m.side).toBe(2);
    expect(m.color.getHex()).toBe(0xffffff);
  });

  it("makes a data livery's paint physical with a clear coat on, so its shader has one to set, and keeps its hook", () => {
    const hook = () => {};
    const mesh = meshWith("livery-paint", { side: 2 });
    mesh.material.onBeforeCompile = hook;
    surfaces(mesh);
    const m = physical(mesh);
    expect(m.isMeshPhysicalMaterial).toBe(true);
    expect(m.clearcoat).toBe(1);
    expect(m.onBeforeCompile).toBe(hook);
    expect(m.side).toBe(2);
    expect(m.color.getHex()).toBe(0xffffff);
  });

  it("gives carbon a dark satin finish with only a little clear coat", () => {
    const mesh = meshWith("livery-satin");
    surfaces(mesh);
    const m = physical(mesh);
    expect(m.clearcoat).toBeGreaterThan(0);
    expect(m.clearcoat).toBeLessThanOrEqual(0.35);
    expect(m.roughness).toBeGreaterThanOrEqual(0.5);
  });

  it("makes tyres matte rubber that does not glint grey", () => {
    const mesh = meshWith("livery-tyre");
    surfaces(mesh);
    const m = physical(mesh);
    expect(m.roughness).toBeGreaterThanOrEqual(0.9);
    expect(m.metalness).toBe(0);
    expect(m.clearcoat).toBe(0);
    expect(m.specularIntensity).toBeLessThan(0.5);
  });

  it("makes wheel covers and suspension metal brushed, in their own colour", () => {
    for (const name of ["showroom-Cover", "showroom-Metal"]) {
      const mesh = meshWith(name, { color: "#cdd3dc" });
      surfaces(mesh);
      const m = physical(mesh);
      expect(m.metalness).toBeGreaterThan(0.9);
      expect(m.roughness).toBeGreaterThan(0.2);
      expect(m.color.getHexString()).toBe("cdd3dc");
    }
  });

  it("paints the navy endplates and the gold power unit trim as clear coat paint in their own colour", () => {
    const navy = meshWith("showroom-RearEndplateLivery", { color: "#1e2b4c" });
    surfaces(navy);
    const gold = meshWith("pu-accent", { color: "#e8b84c" });
    surfaces(gold);
    expect(physical(navy).clearcoat).toBe(1);
    expect(physical(navy).color.getHexString()).toBe("1e2b4c");
    expect(physical(gold).clearcoat).toBe(1);
    expect(physical(gold).color.getHexString()).toBe("e8b84c");
  });

  it("keeps the power unit's metals part diffuse, so the dark studio cannot turn them black", () => {
    for (const name of ["pu-metal", "pu-dark-metal", "pu-alloy"]) {
      const mesh = meshWith(name, { color: "#8d95a3" });
      surfaces(mesh);
      const m = physical(mesh);
      expect(m.metalness, name).toBeLessThanOrEqual(0.7);
      expect(m.color.getHexString(), name).toBe("8d95a3");
    }
  });

  it("turns the visor into glass", () => {
    const mesh = meshWith("showroom-Screen");
    surfaces(mesh);
    expect(physical(mesh).transmission).toBe(1);
  });

  it("leaves a material it does not know, such as the rear light, alone", () => {
    const mesh = meshWith("showroom-Redlight");
    const before = mesh.material;
    surfaces(mesh);
    expect(mesh.material).toBe(before);
  });

  it("replaces every slot of a multi-material mesh", () => {
    const mesh = new Mesh(new BoxGeometry(), [new MeshStandardMaterial({ name: "livery-tyre" }), new MeshStandardMaterial({ name: "showroom-Metal" })]);
    surfaces(mesh);
    const slots = mesh.material as MeshPhysicalMaterial[];
    expect(slots.every((m) => m.isMeshPhysicalMaterial)).toBe(true);
    expect(slots[0].roughness).toBeGreaterThanOrEqual(0.9);
    expect(slots[1].metalness).toBeGreaterThan(0.9);
  });
});
