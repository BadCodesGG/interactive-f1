import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { prepareCar } from "./car";

const stubTextures = () => vi.spyOn(THREE.TextureLoader.prototype, "load").mockImplementation(() => new THREE.Texture());

/** A car of the one painted part the test reads (the body), on the scene root. */
function car() {
  const root = new THREE.Object3D();
  const body = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: "BodyLivery" }));
  root.add(body);
  return { root, body };
}

/** Which livery a painted material was built from: the program key carries its id. */
const liveryOf = (mesh: THREE.Mesh) => (mesh.material as THREE.Material).customProgramCacheKey().replace(/^badcodes-livery-data-/, "").replace(/-body$/, "");

/** The livery the inline script (or the picker) put on <html>: a bare document that answers data-livery. The address is stubbed too, to show it is not read. */
const visit = (livery: string | null, search = "") => {
  vi.stubGlobal("document", { documentElement: { getAttribute: (k: string) => (k === "data-livery" ? livery : null) } });
  vi.stubGlobal("window", { location: { search } });
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("prepareCar", () => {
  it("paints the Ghost livery when <html> names none", () => {
    stubTextures();
    visit(null);
    const c = car();
    prepareCar(c.root);
    expect(liveryOf(c.body)).toBe("ghost");
  });

  it("paints the livery <html> names, which is how the address, the stored choice and the picker all arrive", () => {
    stubTextures();
    visit("powder-blue");
    const c = car();
    prepareCar(c.root);
    expect(liveryOf(c.body)).toBe("powder-blue");
  });

  it("falls back to Ghost for a value that is not an id", () => {
    stubTextures();
    for (const value of ["nope", "", "POWDER-BLUE", "__proto__"]) {
      visit(value);
      const c = car();
      prepareCar(c.root);
      expect(liveryOf(c.body), value).toBe("ghost");
    }
  });

  it("arms the painted meshes for the AR export, and the showroom's carbon too; a plain metal part is left to the ordinary clone", () => {
    stubTextures();
    visit("powder-blue");
    const c = car();
    const other = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: "Metal" }));
    const carbon = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: "Carbon" }));
    c.root.add(other, carbon);
    prepareCar(c.root);
    expect(Object.prototype.hasOwnProperty.call(c.body, "clone")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(carbon, "clone")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(other, "clone")).toBe(false);
  });

  it("does not parse the address again: a stale ?livery= beside a different attribute loses", () => {
    stubTextures();
    visit("racing-red", "?livery=white-stripes");
    const c = car();
    prepareCar(c.root);
    expect(liveryOf(c.body)).toBe("racing-red");
  });
});
