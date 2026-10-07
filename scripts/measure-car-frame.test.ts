import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { CAR_FRAME } from "../src/models/f1/car-frame";

describe("the measured car frame", () => {
  it("is what the script measures from the model the sidecar names", () => {
    // --check exits 1 (and execFileSync throws) if the committed src/models/f1/car-frame.ts differs from a fresh measure.
    expect(() => execFileSync(process.execPath, ["scripts/measure-car-frame.mjs", "--check"], { stdio: "pipe" })).not.toThrow();
  });

  it("measures the F226 in metres, nose negative: 5.46 m from nose tip to rear wing, the body 0.93 m tall", () => {
    expect(CAR_FRAME.nose).toBeLessThan(-2.9);
    expect(CAR_FRAME.tail - CAR_FRAME.nose).toBeCloseTo(5.46, 2);
    expect(CAR_FRAME.body.max[1] - CAR_FRAME.body.min[1]).toBeCloseTo(0.928, 3);
  });

  it("has the front wing ahead of the front wheels, the rear wing behind the rear ones", () => {
    const frontWing = CAR_FRAME.parts["front-wing"].FrontWingLivery;
    const frontWheel = CAR_FRAME.parts["front-left-wheel"].Tyre;
    const rearWheel = CAR_FRAME.parts["rear-left-wheel"].Tyre;
    const rearWing = CAR_FRAME.parts["rear-wing"].RearEndplateLivery;
    expect(frontWing.min[0]).toBeLessThan(frontWheel.min[0]);
    expect(rearWing.max[0]).toBeGreaterThan(rearWheel.max[0]);
    // The wheelbase is the regulations' 3.4 m, the scale the model was built to.
    expect(rearWheel.min[0] + rearWheel.max[0] - (frontWheel.min[0] + frontWheel.max[0])).toBeCloseTo(2 * 3.4, 1);
  });

  it("stations run nose to tail in order", () => {
    const xs = CAR_FRAME.sections.map((s) => s[0]);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(xs[0]).toBeLessThan(-2.9);
    expect(xs[xs.length - 1]).toBeGreaterThan(1.4);
  });
});
