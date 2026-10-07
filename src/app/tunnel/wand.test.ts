import { describe, expect, it } from "vitest";
import { FLOW_BOX, MAX_NOZZLES, nozzleLayout, particleCount, PARTICLES_PER_NOZZLE } from "./rake";
import { JUMP, STALE, WAND_BOX, WAND_NOZZLES, WAND_SPACING, clampToWand, follow, needsSettle, nudgeWand, parkedWand, rayPlanePoint, settleSteps, spendSettle, wandMode, wandNozzles } from "./wand";

describe("rayPlanePoint", () => {
  it("meets a plane square on", () => {
    expect(rayPlanePoint([0, 0, 10], [0, 0, -1], [0, 0, 0], [0, 0, 1])).toEqual([0, 0, 0]);
  });

  it("meets a tilted ray at the right place", () => {
    const p = rayPlanePoint([0, 0, 10], [1, 1, -2], [0, 0, 0], [0, 0, 1])!;
    expect(p[0]).toBeCloseTo(5);
    expect(p[1]).toBeCloseTo(5);
    expect(p[2]).toBeCloseTo(0);
  });

  it("does not need unit vectors", () => {
    expect(rayPlanePoint([0, 0, 10], [0, 0, -40], [0, 0, 0], [0, 0, 7])).toEqual([0, 0, 0]);
  });

  it("finds nothing for a ray parallel to the plane, or one that points away from it", () => {
    expect(rayPlanePoint([0, 0, 10], [1, 0, 0], [0, 0, 0], [0, 0, 1])).toBeNull();
    expect(rayPlanePoint([0, 0, 10], [0, 0, 1], [0, 0, 0], [0, 0, 1])).toBeNull();
  });
});

describe("the wand's comb", () => {
  it("hangs the nozzles one above another on the point, evenly spaced", () => {
    const n = wandNozzles([-1, 0.6, 0.2]);
    expect(n).toHaveLength(WAND_NOZZLES);
    for (const nozzle of n) expect([nozzle.x, nozzle.z]).toEqual([-1, 0.2]);
    expect(n[1].y).toBeCloseTo(0.6);
    expect(n[1].y - n[0].y).toBeCloseTo(WAND_SPACING);
    expect(n[2].y - n[1].y).toBeCloseTo(WAND_SPACING);
  });

  it("keeps every nozzle inside the flow box, even for a point far outside it", () => {
    for (const p of [[99, 99, 99], [-99, -99, -99], [0, 0, 5]] as const) {
      for (const n of wandNozzles(p)) {
        expect(n.x).toBeGreaterThanOrEqual(FLOW_BOX.min[0]);
        expect(n.x).toBeLessThanOrEqual(FLOW_BOX.max[0]);
        expect(n.y).toBeGreaterThan(0.01);
        expect(n.y).toBeLessThanOrEqual(FLOW_BOX.max[1]);
        expect(Math.abs(n.z)).toBeLessThan(FLOW_BOX.max[2]);
      }
    }
  });

  it("clamps a point to the wand's box, and leaves one inside it alone", () => {
    expect(clampToWand([0, 0.5, 0.1])).toEqual([0, 0.5, 0.1]);
    expect(clampToWand([50, -3, -9])).toEqual([WAND_BOX.max[0], WAND_BOX.min[1], WAND_BOX.min[2]]);
  });

  it("rests upstream of the car before it is placed", () => {
    for (const n of parkedWand()) expect(n.x).toBeLessThan(-3);
  });

  it("fits in the shader's nozzle array beside the rake, on desktop and on a phone", () => {
    for (const mobile of [false, true]) expect(nozzleLayout(mobile).length + WAND_NOZZLES).toBeLessThanOrEqual(MAX_NOZZLES);
  });

  it("adds a chain as long as the rake's for each wand nozzle", () => {
    expect(particleCount(false)).toBe(nozzleLayout(false).length * PARTICLES_PER_NOZZLE.desktop);
    expect(particleCount(true, WAND_NOZZLES) - particleCount(true)).toBe(WAND_NOZZLES * PARTICLES_PER_NOZZLE.mobile);
  });
});

describe("needsSettle", () => {
  const prev = { point: [0, 0.5, 0] as const, at: 10 };

  it("settles the first placement", () => {
    expect(needsSettle(null, [0, 0.5, 0], 10)).toBe(true);
  });

  it("drags along a small, recent move", () => {
    expect(needsSettle(prev, [0.1, 0.52, 0], 10.02)).toBe(false);
  });

  it("settles a jump, or a wand that has been left for a while", () => {
    expect(needsSettle(prev, [JUMP + 0.05, 0.5, 0], 10.02)).toBe(true);
    expect(needsSettle(prev, [0.05, 0.5, 0], 10 + STALE + 0.1)).toBe(true);
  });
});

describe("the wand's mode", () => {
  it("is live only with the flow running and motion allowed", () => {
    expect(wandMode(false, false)).toBe("live");
    expect(wandMode(true, false)).toBe("static");
    expect(wandMode(false, true)).toBe("static");
    expect(wandMode(true, true)).toBe("static");
  });
});

describe("follow", () => {
  it("does not move with no time, and arrives given long enough", () => {
    expect(follow(0, 10, 20, 0)).toBe(0);
    expect(follow(0, 10, 20, 5)).toBeCloseTo(10);
  });

  it("covers the same ground in one long step as in two halves", () => {
    const whole = follow(0, 1, 8, 0.2);
    const halves = follow(follow(0, 1, 8, 0.1), 1, 8, 0.1);
    expect(halves).toBeCloseTo(whole);
  });
});

describe("nudgeWand", () => {
  it("moves along the camera's axes by the step", () => {
    expect(nudgeWand([0, 0.5, 0], [1, 0, 0], [0, 1, 0], [1, 0], 0.1)[0]).toBeCloseTo(0.1);
    expect(nudgeWand([0, 0.5, 0], [1, 0, 0], [0, 1, 0], [0, -1], 0.1)[1]).toBeCloseTo(0.4);
  });

  it("stays inside the box", () => {
    expect(nudgeWand([0, WAND_BOX.max[1], 0], [1, 0, 0], [0, 1, 0], [0, 1], 5)[1]).toBe(WAND_BOX.max[1]);
  });
});

describe("spreading a wand's settle over frames", () => {
  /** A clock that moves `cost` ms every time it is read after a step. */
  const clock = (cost: number) => {
    let t = 0;
    return { now: () => t, step: () => void (t += cost) };
  };

  it("takes a crossing's worth of steps: 7.3 m at 3.3 m/s is 74", () => {
    expect(settleSteps(7.3, 3.3)).toBe(74);
    expect(settleSteps(7.3, 0)).toBe(Math.ceil(7.3 * 10 * 30 * 1.1));
  });

  it("stops at the frame's budget instead of running every step at once", () => {
    const c = clock(1);
    let ran = 0;
    const left = spendSettle(100, 4, c.now, () => (ran++, c.step()));
    expect(ran).toBe(4);
    expect(left).toBe(96);
  });

  it("always takes one step, however slow the frame already is", () => {
    const c = clock(50);
    let ran = 0;
    expect(spendSettle(10, 4, c.now, () => (ran++, c.step()))).toBe(9);
    expect(ran).toBe(1);
  });

  it("finishes in a few frames and never runs a step too many", () => {
    const c = clock(1);
    let ran = 0;
    let owed = 10;
    let frames = 0;
    while (owed > 0) {
      owed = spendSettle(owed, 4, c.now, () => (ran++, c.step()));
      frames++;
      c.step(); // the rest of the frame
    }
    expect(ran).toBe(10);
    expect(frames).toBeGreaterThan(1);
  });

  it("does nothing when nothing is owed", () => {
    let ran = 0;
    expect(spendSettle(0, 4, () => 0, () => ran++)).toBe(0);
    expect(ran).toBe(0);
  });
});
