import { describe, expect, it } from "vitest";
import { STENCIL, chainLength, nextInChain, prevInChain, ribbonGeometry, stepInChain } from "./ribbon";

const side = 10;
const N = 4;
const n = side * side;
/** The particle index a texture coordinate points at. */
const at = (g: Float32Array, vertex: number) => Math.floor(g[vertex * 2 + 1] * side) * side + Math.floor(g[vertex * 2] * side);

describe("chain ring", () => {
  it("counts the particles of each chain", () => {
    expect([0, 1, 2, 3].map((k) => chainLength(n, N, k))).toEqual([25, 25, 25, 25]);
    expect([0, 1, 2, 3].map((k) => chainLength(10, N, k))).toEqual([3, 3, 2, 2]);
  });

  it("steps by N and wraps the last particle round to the first", () => {
    expect(nextInChain(5, n, N)).toBe(9);
    expect(nextInChain(96, n, N)).toBe(0);
    expect(nextInChain(99, n, N)).toBe(3);
  });

  it("goes back by N and wraps the first round to the last", () => {
    expect(prevInChain(9, n, N)).toBe(5);
    expect(prevInChain(0, n, N)).toBe(96);
    expect(prevInChain(3, n, N)).toBe(99);
  });

  it("takes several places at once, both ways, round the ring", () => {
    expect(stepInChain(5, n, N, 3)).toBe(17);
    expect(stepInChain(5, n, N, -1)).toBe(1);
    expect(stepInChain(5, n, N, -2)).toBe(97);
    expect(stepInChain(96, n, N, 2)).toBe(4);
    expect(stepInChain(5, n, N, 25)).toBe(5);
    expect(stepInChain(5, n, N, 0)).toBe(5);
  });

  it("is a ring even when the chains differ in length", () => {
    const total = 10;
    for (let i = 0; i < total; i++) {
      expect(prevInChain(nextInChain(i, total, N), total, N)).toBe(i);
      expect(nextInChain(i, total, N) % N).toBe(i % N);
    }
    // Walking next visits every particle of the chain once and comes home.
    const seen: number[] = [];
    let i = 1;
    do {
      seen.push(i);
      i = nextInChain(i, total, N);
    } while (i !== 1);
    expect(seen).toEqual([1, 5, 9]);
  });
});

describe("ribbonGeometry", () => {
  const r = ribbonGeometry(side, N);

  it("makes one quad for every particle, the last of each chain linking back to its first", () => {
    expect(r.segments).toBe(n);
    expect(r.index).toHaveLength(r.segments * 6);
    expect(r.corner).toHaveLength(r.segments * 8);
    expect(at(r.refB, 96 * 4)).toBe(0);
  });

  it("joins particle i to the next of the same nozzle", () => {
    for (const seg of [0, 1, 17, 50, r.segments - 1]) {
      for (let v = 0; v < 4; v++) {
        const vert = seg * 4 + v;
        expect(at(r.refA, vert)).toBe(seg);
        expect(at(r.refB, vert)).toBe(nextInChain(seg, n, N));
        expect(at(r.refB, vert) % N).toBe(seg % N);
      }
    }
  });

  it("gives each vertex a stencil centred on its own end, STENCIL places each way", () => {
    const seg = 60;
    const b = nextInChain(seg, n, N);
    // Vertices 0 and 1 are at end A, 2 and 3 at end B.
    for (const v of [0, 1]) {
      expect(at(r.refS0, seg * 4 + v)).toBe(stepInChain(seg, n, N, -STENCIL));
      expect(at(r.refS1, seg * 4 + v)).toBe(stepInChain(seg, n, N, STENCIL));
    }
    for (const v of [2, 3]) {
      expect(at(r.refS0, seg * 4 + v)).toBe(stepInChain(b, n, N, -STENCIL));
      expect(at(r.refS1, seg * 4 + v)).toBe(stepInChain(b, n, N, STENCIL));
    }
  });

  it("keeps every stencil inside its own nozzle's chain, wrapping round the ring", () => {
    for (const seg of [0, 3, 96, 99]) {
      for (let v = 0; v < 4; v++) {
        expect(at(r.refS0, seg * 4 + v) % N).toBe(seg % N);
        expect(at(r.refS1, seg * 4 + v) % N).toBe(seg % N);
      }
    }
    expect(at(r.refS0, 0)).toBe(stepInChain(0, n, N, -STENCIL));
  });

  it("draws each quad as a strip: end 0 then end 1, each with a left and a right edge", () => {
    expect(Array.from(r.corner.slice(0, 8))).toEqual([0, -1, 0, 1, 1, -1, 1, 1]);
    expect(Array.from(r.index.slice(0, 6))).toEqual([0, 1, 2, 1, 3, 2]);
    expect(Array.from(r.index.slice(6, 12))).toEqual([4, 5, 6, 5, 7, 6]);
  });

  it("tags each vertex with its place along the chain and its nozzle", () => {
    const seg = 9;
    expect(Array.from(r.seed.slice(seg * 8, seg * 8 + 2))).toEqual([Math.floor(seg / N), seg % N]);
  });

  it("makes nothing unless every chain has two particles", () => {
    expect(ribbonGeometry(1, 4).segments).toBe(0);
    expect(ribbonGeometry(2, 4).segments).toBe(0);
    expect(ribbonGeometry(3, 4).segments).toBe(9);
  });

  it("chains only the first `count` particles when the texture holds something else after them", () => {
    // 4 chains of 5 in a 5 x 5 texture: the last 5 texels belong to something else.
    const g = ribbonGeometry(5, 4, 20);
    expect(g.segments).toBe(20);
    const uvOf = (vertex: number) => Math.floor(g.refA[vertex * 2 + 1] * 5) * 5 + Math.floor(g.refA[vertex * 2] * 5);
    const refs = new Set<number>();
    for (let v = 0; v < g.segments * 4; v++) {
      for (const a of [g.refA, g.refB, g.refS0, g.refS1]) refs.add(Math.floor(a[v * 2 + 1] * 5) * 5 + Math.floor(a[v * 2] * 5));
    }
    expect(Math.max(...refs)).toBeLessThan(20);
    expect(uvOf(0)).toBe(0);
    // The last of chain 3 (particle 19) links back to its first (3).
    const seg = 19;
    expect(Math.floor(g.refB[seg * 8 + 1] * 5) * 5 + Math.floor(g.refB[seg * 8] * 5)).toBe(3);
  });
});
