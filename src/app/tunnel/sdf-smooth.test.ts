import { describe, expect, it } from "vitest";
import { smoothSdf } from "./sdf-smooth";

const dims = [8, 6, 5] as const;
const cells = dims[0] * dims[1] * dims[2];
const at = (x: number, y: number, z: number) => x + dims[0] * (y + dims[1] * z);

describe("smoothSdf", () => {
  it("leaves a constant field alone, edges included", () => {
    const out = smoothSdf(new Uint8Array(cells).fill(200), dims);
    for (const v of out) expect(v).toBeCloseTo(200, 4);
  });

  it("keeps a linear ramp linear away from the edges, and keeps its slope", () => {
    const ramp = new Uint8Array(cells);
    for (let z = 0; z < dims[2]; z++) for (let y = 0; y < dims[1]; y++) for (let x = 0; x < dims[0]; x++) ramp[at(x, y, z)] = 20 * x;
    const out = smoothSdf(ramp, dims, 1);
    for (let x = 1; x < dims[0] - 1; x++) expect(out[at(x, 2, 2)]).toBeCloseTo(20 * x, 4);
  });

  it("spreads a single spike over its neighbours without adding or losing much total", () => {
    const spike = new Uint8Array(cells);
    spike[at(4, 3, 2)] = 240;
    const out = smoothSdf(spike, dims);
    expect(out[at(4, 3, 2)]).toBeLessThan(240 / 2);
    expect(out[at(3, 3, 2)]).toBeGreaterThan(0);
    expect(out[at(4, 4, 2)]).toBeGreaterThan(0);
    const total = out.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(240, 3);
  });

  it("does not touch its input, and returns one value per cell", () => {
    const input = new Uint8Array(cells).map((_, i) => i % 251);
    const copy = input.slice();
    const out = smoothSdf(input, dims);
    expect(input).toEqual(copy);
    expect(out).toHaveLength(cells);
  });

  it("is a no-op with no passes", () => {
    const input = new Uint8Array(cells).map((_, i) => (i * 7) % 256);
    expect(Array.from(smoothSdf(input, dims, 0))).toEqual(Array.from(input));
  });
});
