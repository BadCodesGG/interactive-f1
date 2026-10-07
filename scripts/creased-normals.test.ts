import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Document } from "@gltf-transform/core";
import { PAINT_NORMAL, creaseMesh, creasedMesh } from "./lib/creased-normals.mjs";

const DEG = Math.PI / 180;

function read(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute("position").array as ArrayLike<number>;
  const index = geo.getIndex();
  return { positions: pos, indices: index ? (index.array as ArrayLike<number>) : null };
}

describe("creasedMesh", () => {
  it("keeps a cube's edges sharp: every corner splits into one vertex per face, each normal axis-aligned", () => {
    const { positions, indices } = read(new THREE.BoxGeometry(2, 2, 2).deleteAttribute("normal").deleteAttribute("uv"));
    const out = creasedMesh(positions, indices, 35 * DEG);
    expect(out.positions.length / 3).toBe(24);
    for (let i = 0; i < out.normals.length; i += 3) {
      const axes = [0, 1, 2].map((k) => Math.abs(out.normals[i + k]));
      expect(Math.max(...axes)).toBeCloseTo(1, 5);
    }
  });

  it("smooths a sphere: one vertex per position, every normal radial", () => {
    const { positions, indices } = read(new THREE.SphereGeometry(1, 24, 16).deleteAttribute("normal").deleteAttribute("uv"));
    const out = creasedMesh(positions, indices, 35 * DEG);
    const unique = new Set<string>();
    for (let i = 0; i < positions.length; i += 3) unique.add([0, 1, 2].map((k) => Math.round(positions[i + k] * 1e4) / 1e4 + 0).join());
    expect(out.positions.length / 3).toBe(unique.size);
    for (let i = 0; i < out.positions.length; i += 3) {
      const p = new THREE.Vector3(out.positions[i], out.positions[i + 1], out.positions[i + 2]).normalize();
      const n = new THREE.Vector3(out.normals[i], out.normals[i + 1], out.normals[i + 2]);
      expect(p.dot(n)).toBeGreaterThan(0.99);
    }
  });

  it("splits at a fold sharper than the angle and joins one gentler than it", () => {
    // Triangle A lies flat; triangle B shares its long edge and is folded up about it by `fold` degrees.
    const quad = (fold: number) => {
      const a = fold * DEG;
      const reach = 0.5 * Math.cos(a) * Math.SQRT1_2;
      return creasedMesh([0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0.5 + reach, 0.5 * Math.sin(a), 0.5 + reach], null, 35 * DEG);
    };
    expect(quad(10).positions.length / 3).toBe(4);
    expect(quad(80).positions.length / 3).toBe(6);
  });

  it("flips the result of a mirrored part so it still faces the way its source normals did", () => {
    const { positions, indices } = read(new THREE.SphereGeometry(1, 24, 16).deleteAttribute("normal").deleteAttribute("uv"));
    // A mirrored node reverses the winding: swap two corners of every triangle, keep the outward source normals.
    const reversed = Uint32Array.from(indices!, (_, i) => indices![i - (i % 3) + [0, 2, 1][i % 3]]);
    const outward = Float32Array.from(positions);
    const inwardWinding = creasedMesh(positions, reversed, 35 * DEG);
    const fixed = creasedMesh(positions, reversed, 35 * DEG, outward);
    const facing = (out: { positions: Float32Array; normals: Float32Array }) => {
      let sum = 0;
      for (let i = 0; i < out.positions.length; i += 3) sum += out.positions[i] * out.normals[i] + out.positions[i + 1] * out.normals[i + 1] + out.positions[i + 2] * out.normals[i + 2];
      return sum;
    };
    expect(facing(inwardWinding)).toBeLessThan(0);
    expect(facing(fixed)).toBeGreaterThan(0);
  });

  it("returns a valid index into the rebuilt vertices and unit normals", () => {
    const { positions, indices } = read(new THREE.TorusGeometry(1, 0.3, 12, 24).deleteAttribute("normal").deleteAttribute("uv"));
    const out = creasedMesh(positions, indices, 35 * DEG);
    const count = out.positions.length / 3;
    expect(Math.max(...out.indices)).toBeLessThan(count);
    for (let i = 0; i < out.normals.length; i += 3) expect(Math.hypot(out.normals[i], out.normals[i + 1], out.normals[i + 2])).toBeCloseTo(1, 4);
  });

  it("keeps a continuous normal that does not jump at a crease, where the shading normal does", () => {
    const { positions, indices } = read(new THREE.BoxGeometry(2, 2, 2).deleteAttribute("normal").deleteAttribute("uv"));
    const out = creasedMesh(positions, indices, 35 * DEG);
    // The cube's corner vertices are split three ways for shading; the continuous normal is the same diagonal at all three.
    const at = new Map<string, Set<string>>();
    const shading = new Map<string, Set<string>>();
    for (let i = 0; i < out.positions.length; i += 3) {
      const key = [0, 1, 2].map((k) => out.positions[i + k].toFixed(3)).join();
      const fmt = (a: Float32Array) => [0, 1, 2].map((k) => a[i + k].toFixed(3)).join();
      at.set(key, (at.get(key) ?? new Set()).add(fmt(out.smooth)));
      shading.set(key, (shading.get(key) ?? new Set()).add(fmt(out.normals)));
    }
    expect([...at.values()].every((set) => set.size === 1)).toBe(true);
    expect([...shading.values()].every((set) => set.size === 3)).toBe(true);
  });
});

describe("creaseMesh", () => {
  function meshOf(name: string) {
    const doc = new Document();
    const buffer = doc.createBuffer();
    const accessor = (type: "VEC3" | "VEC2", array: Float32Array) => doc.createAccessor().setType(type).setArray(Float32Array.from(array)).setBuffer(buffer);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const prim = doc
      .createPrimitive()
      .setAttribute("POSITION", accessor("VEC3", box.getAttribute("position").array as Float32Array))
      .setAttribute("NORMAL", accessor("VEC3", box.getAttribute("normal").array as Float32Array))
      .setAttribute("TEXCOORD_0", accessor("VEC2", box.getAttribute("uv").array as Float32Array))
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(Uint16Array.from(box.getIndex()!.array)).setBuffer(buffer));
    return { mesh: doc.createMesh(name).addPrimitive(prim), prim };
  }

  it("rebuilds the normals, drops the attributes it can no longer line up, and adds the paint normal only when asked", () => {
    const plain = meshOf("plain");
    creaseMesh(plain.mesh, 35 * DEG);
    expect(plain.prim.listSemantics().sort()).toEqual(["NORMAL", "POSITION"]);
    expect(plain.prim.getAttribute("POSITION")!.getCount()).toBe(24);

    const pearl = meshOf("pearl");
    creaseMesh(pearl.mesh, 35 * DEG, () => true);
    const paint = pearl.prim.getAttribute(PAINT_NORMAL)!;
    expect(paint.getNormalized()).toBe(true);
    expect(paint.getCount()).toBe(pearl.prim.getAttribute("POSITION")!.getCount());
    expect(paint.getComponentType()).toBe(5122);
  });
});
