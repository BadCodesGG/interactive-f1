import { describe, expect, it } from "vitest";
import { easeInOutCubic, OPENING, openingPose } from "./opening";

describe("easeInOutCubic", () => {
  it("runs 0 to 1, slowly at both ends and through 0.5 at the middle", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
    expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9);
  });

  it("clamps outside 0..1", () => {
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
  });
});

describe("openingPose", () => {
  it("starts far out and around to the side", () => {
    expect(openingPose(0)).toEqual({ distance: OPENING.far, azimuth: OPENING.swing, done: false });
  });

  it("ends exactly on the fitted pose, and stays there", () => {
    expect(openingPose(OPENING.seconds)).toEqual({ distance: 1, azimuth: 0, done: true });
    expect(openingPose(OPENING.seconds * 5)).toEqual({ distance: 1, azimuth: 0, done: true });
  });

  it("only ever closes in", () => {
    let last = Infinity;
    for (let t = 0; t <= OPENING.seconds; t += 0.05) {
      const { distance } = openingPose(t);
      expect(distance).toBeLessThanOrEqual(last);
      last = distance;
    }
  });

  it("takes between 1.5 and 2.5 seconds", () => {
    expect(OPENING.seconds).toBeGreaterThanOrEqual(1.5);
    expect(OPENING.seconds).toBeLessThanOrEqual(2.5);
  });

  it("treats a negative elapsed time as the start", () => {
    expect(openingPose(-1).distance).toBe(OPENING.far);
  });
});
