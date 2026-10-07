import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import tunnel from "@/data/f1-tunnel.json";
import { decodeSdf, encodeSdf, sampleSdf, type SdfHeader } from "./sdf-format";

const header: SdfHeader = { version: 1, dims: [2, 2, 2], min: [0, 0, 0], max: [2, 2, 2], range: 0.5, model: "/models/x.glb" };

describe("SDF file format", () => {
  it("round-trips a header and its samples", () => {
    const data = new Uint8Array([0, 32, 64, 96, 128, 160, 192, 255]);
    const back = decodeSdf(encodeSdf(header, data).buffer as ArrayBuffer);
    expect(back.header).toEqual(header);
    expect([...back.data]).toEqual([...data]);
  });

  it("samples in metres, 0.5 on the surface, trilinear between cell centres", () => {
    // Cell centres sit at 0.5 and 1.5 on each axis; x fastest, then y, then z.
    const data = new Uint8Array(8).fill(128);
    data[1] = 255; // (x 1.5, y 0.5, z 0.5): +range
    const sdf = { header, data };
    expect(sampleSdf(sdf, 0.5, 0.5, 0.5)).toBeCloseTo(0.0019, 3);
    expect(sampleSdf(sdf, 1.5, 0.5, 0.5)).toBeCloseTo(0.5, 3);
    expect(sampleSdf(sdf, 1.0, 0.5, 0.5)).toBeCloseTo(0.251, 2);
  });

  it("the baked car field is about zero on the floor and clear of the body in free air", () => {
    const buf = readFileSync(path.join(process.cwd(), "public", tunnel.sdf));
    const sdf = decodeSdf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    expect(sdf.header.dims).toEqual([96, 40, 48]);
    expect(sdf.data.length).toBe(96 * 40 * 48);
    // The plank under the floor, 31 mm off the ground, midway along the car.
    expect(Math.abs(sampleSdf(sdf, 0, 0.031, 0))).toBeLessThan(0.07);
    // Free air above and ahead of the nose.
    expect(sampleSdf(sdf, -2.8, 1.5, 1.0)).toBeGreaterThan(0.3);
  });
});
