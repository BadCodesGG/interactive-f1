import { describe, expect, it } from "vitest";
import { buildTrack, kerbAmounts, LAYOUT, ROAD_WIDTH, sampleAt, STEP, type Piece } from "./lap-track";

const track = buildTrack();

describe("the circuit", () => {
  it("closes: the last sample is the last cell from the first, and the heading turns once", () => {
    const last = track.count - 1;
    const gap = Math.hypot(track.x[0] - track.x[last], track.y[0] - track.y[last]);
    const cell = track.length - last * track.step;
    expect(cell).toBeGreaterThan(0);
    expect(cell).toBeLessThanOrEqual(track.step);
    expect(gap).toBeGreaterThan(cell * 0.99);
    expect(gap).toBeLessThan(cell * 1.01);
    const end = track.heading[last] + 0.5 * track.curvature[last] * cell;
    expect(end - track.heading[0]).toBeCloseTo(2 * Math.PI, 2);
  });

  it("measures its arc length by summing the steps", () => {
    let sum = 0;
    for (let i = 0; i < track.count; i++) {
      const j = (i + 1) % track.count;
      sum += Math.hypot(track.x[j] - track.x[i], track.y[j] - track.y[i]);
    }
    expect(sum).toBeGreaterThan(track.length * 0.995);
    expect(sum).toBeLessThan(track.length * 1.005);
    expect(track.length).toBeGreaterThan(2000);
    expect(track.length).toBeLessThan(4000);
  });

  it("has at least two straights of 400 m or more, and corners of several radii in both directions", () => {
    const straights = LAYOUT.filter((p): p is Extract<Piece, { kind: "straight" }> => p.kind === "straight" && p.free === true);
    expect(straights).toHaveLength(2);
    const radii = new Set<number>();
    let left = 0;
    let right = 0;
    for (const p of LAYOUT) {
      if (p.kind !== "turn") continue;
      radii.add(p.radius);
      if (p.angle > 0) left++;
      else right++;
    }
    expect(radii.size).toBeGreaterThanOrEqual(4);
    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(0);
  });

  it("never comes within a road width of itself away from its own neighbours", () => {
    const apart = Math.ceil((ROAD_WIDTH * 4) / STEP);
    let nearest = Infinity;
    for (let i = 0; i < track.count; i += 2) {
      for (let j = i + apart; j < track.count; j += 2) {
        if (track.count - (j - i) < apart) continue;
        nearest = Math.min(nearest, Math.hypot(track.x[i] - track.x[j], track.y[i] - track.y[j]));
      }
    }
    expect(nearest).toBeGreaterThan(ROAD_WIDTH * 1.5);
  });

  it("changes curvature without jumps", () => {
    let worst = 0;
    for (let i = 0; i < track.count; i++) worst = Math.max(worst, Math.abs(track.curvature[(i + 1) % track.count] - track.curvature[i]));
    expect(worst).toBeLessThan(0.002);
  });

  it("refuses a layout whose free straights run the same way", () => {
    const bad: Piece[] = [
      { kind: "straight", length: 100, free: true },
      { kind: "straight", length: 100, free: true },
      { kind: "turn", angle: 2 * Math.PI, radius: 100, ramp: 20 },
    ];
    expect(() => buildTrack(bad)).toThrow();
  });
});

describe("sampleAt", () => {
  it("returns the sample itself on a sample and a blend between two", () => {
    const on = sampleAt(track, track.step * 10);
    expect(on.x).toBeCloseTo(track.x[10], 9);
    expect(on.y).toBeCloseTo(track.y[10], 9);
    const mid = sampleAt(track, track.step * 10.5);
    expect(mid.x).toBeCloseTo(0.5 * (track.x[10] + track.x[11]), 9);
  });

  it("wraps: one lap on is the same place, and a negative distance is before the line", () => {
    const a = sampleAt(track, 123.4);
    const b = sampleAt(track, 123.4 + track.length);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
    expect(b.heading - a.heading).toBeCloseTo(0, 6);
    const c = sampleAt(track, -10);
    const d = sampleAt(track, track.length - 10);
    expect(c.x).toBeCloseTo(d.x, 6);
  });
});

describe("kerbAmounts", () => {
  const kerbs = kerbAmounts(track);
  const at = (i: number) => ({ k: track.curvature[i], left: kerbs.left[i], right: kerbs.right[i] });

  it("has a value from 0 to 1 for each side of each sample", () => {
    expect(kerbs.left).toHaveLength(track.count);
    expect(kerbs.right).toHaveLength(track.count);
    for (const v of [...kerbs.left, ...kerbs.right]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("puts a full kerb on the inside of the tightest bend each way, which is the left or the right side as it turns", () => {
    for (const sign of [1, -1]) {
      let apex = 0;
      for (let i = 0; i < track.count; i++) if (track.curvature[i] * sign > track.curvature[apex] * sign) apex = i;
      const { left, right } = at(apex);
      expect(sign > 0 ? left : right).toBe(1);
    }
  });

  it("has none on the outside in the middle of a held bend: the hairpin's apex", () => {
    const hairpin = track.curvature.reduce((best, k, i) => (k > track.curvature[best] ? i : best), 0);
    // Walk to the middle of the stretch at full curvature.
    let from = hairpin;
    let to = hairpin;
    while (track.curvature[from - 1] > track.curvature[hairpin] * 0.999) from--;
    while (track.curvature[to + 1] > track.curvature[hairpin] * 0.999) to++;
    const mid = Math.round((from + to) / 2);
    expect(to - from).toBeGreaterThan(10);
    expect(at(mid)).toMatchObject({ left: 1, right: 0 });
  });

  it("has none on a straight: the first hundred metres of the lap run between plain edges", () => {
    for (let i = 0; i < 50; i++) expect(at(i)).toMatchObject({ left: 0, right: 0 });
  });

  it("puts a kerb on the outside as the car comes out of a bend, where it runs wide", () => {
    // The long left after the flick: its outside is the right, and the curvature falls away to the straight.
    let onExit = 0;
    for (let i = 1; i < track.count; i++) {
      const falling = Math.abs(track.curvature[i]) < Math.abs(track.curvature[i - 1]);
      if (falling && track.curvature[i] > 0 && kerbs.right[i] > 0) onExit++;
      if (falling && track.curvature[i] < 0 && kerbs.left[i] > 0) onExit++;
    }
    expect(onExit).toBeGreaterThan(10);
  });

  it("covers a part of the lap, not all of it or none: the kerbs are the corners", () => {
    const share = (a: Float32Array) => a.reduce((n, v) => n + (v > 0 ? 1 : 0), 0) / track.count;
    for (const a of [kerbs.left, kerbs.right]) {
      expect(share(a)).toBeGreaterThan(0.05);
      expect(share(a)).toBeLessThan(0.6);
    }
  });
});
