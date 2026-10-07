import { describe, expect, it } from "vitest";
import { FLOW_BOX, MAX_NOZZLES, PARTICLES_PER_NOZZLE, RAKES, RAKE_X, TURBULENCE, WAKE, nozzleLayout, particleCount, rakeNozzles, turbulence, wakeRamp } from "./rake";

describe("rakeNozzles", () => {
  it("puts one nozzle at each height, all at the comb's (x, z)", () => {
    const n = rakeNozzles([{ x: -3, z: 0.5, ys: [0.1, 0.4, 0.5] }]);
    expect(n).toEqual([
      { x: -3, y: 0.1, z: 0.5 },
      { x: -3, y: 0.4, z: 0.5 },
      { x: -3, y: 0.5, z: 0.5 },
    ]);
  });

  it("concatenates combs in order", () => {
    const n = rakeNozzles([
      { x: 0, z: 0, ys: [0, 1] },
      { x: 1, z: 1, ys: [0.5] },
    ]);
    expect(n).toHaveLength(3);
    expect(n[2].x).toBe(1);
  });
});

describe("nozzleLayout", () => {
  it("is eight to ten lines on desktop and six on a phone", () => {
    expect(nozzleLayout(false).length).toBeGreaterThanOrEqual(8);
    expect(nozzleLayout(false).length).toBeLessThanOrEqual(10);
    expect(nozzleLayout(true)).toHaveLength(6);
    expect(nozzleLayout(false).length).toBeLessThanOrEqual(MAX_NOZZLES);
  });

  it("is one centreline comb, not the whole width", () => {
    for (const mobile of [false, true]) {
      for (const n of nozzleLayout(mobile)) expect(Math.abs(n.z)).toBeLessThan(0.1);
    }
  });

  it("keeps every nozzle inside the box, upstream of the nose and clear of the floor", () => {
    for (const mobile of [false, true]) {
      for (const n of nozzleLayout(mobile)) {
        expect(n.x).toBe(RAKE_X);
        expect(n.x).toBeGreaterThan(FLOW_BOX.min[0]);
        expect(n.x).toBeLessThan(-2.91);
        expect(n.y).toBeGreaterThan(FLOW_BOX.min[1]);
        expect(n.y).toBeLessThan(FLOW_BOX.max[1]);
      }
    }
  });

  it("is irregularly spaced, and crowded from the nose up to the cockpit rather than over the top", () => {
    const ys = RAKES.desktop[0].ys;
    const gaps = ys.slice(1).map((y, i) => y - ys[i]);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    expect(new Set(gaps.map((g) => g.toFixed(3))).size).toBeGreaterThan(3);
    expect(Math.min(...gaps)).toBeGreaterThan(0.05);
    expect(ys.filter((y) => y >= 0.7 && y <= 1.06).length).toBeGreaterThanOrEqual(4);
    expect(ys.filter((y) => y < 0.35).length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...ys)).toBeGreaterThan(1.06);
  });
});

describe("particleCount", () => {
  it("gives every nozzle its chain, and phones fewer particles per line as well as fewer lines", () => {
    expect(particleCount(false)).toBe(nozzleLayout(false).length * PARTICLES_PER_NOZZLE.desktop);
    expect(particleCount(true)).toBe(nozzleLayout(true).length * PARTICLES_PER_NOZZLE.mobile);
    expect(particleCount(true)).toBeLessThan(particleCount(false) / 2);
    expect(PARTICLES_PER_NOZZLE.desktop).toBeGreaterThanOrEqual(PARTICLES_PER_NOZZLE.mobile);
  });
});

describe("turbulence", () => {
  it("is laminar upstream of the wake and full strength behind it", () => {
    expect(wakeRamp(WAKE.start - 1)).toBe(0);
    expect(wakeRamp(WAKE.full + 1)).toBe(1);
    expect(turbulence(-3.5)).toBe(TURBULENCE.laminar);
    expect(turbulence(WAKE.full)).toBeCloseTo(TURBULENCE.wake, 10);
  });

  it("only ever grows downstream, by more than an order of magnitude", () => {
    let last = -Infinity;
    for (let x = FLOW_BOX.min[0]; x <= FLOW_BOX.max[0]; x += 0.1) {
      const t = turbulence(x);
      expect(t).toBeGreaterThanOrEqual(last);
      last = t;
    }
    expect(TURBULENCE.wake / TURBULENCE.laminar).toBeGreaterThan(10);
  });

  it("starts at the rear wing, not on the nose", () => {
    expect(WAKE.start).toBeGreaterThan(1.5);
  });
});
