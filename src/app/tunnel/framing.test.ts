import { describe, expect, it } from "vitest";
import { EYE, TARGET, framing } from "./framing";
import { FLOW_BOX, RAKE_X } from "./rake";

const FOV = 34;

describe("framing", () => {
  it("keeps the landscape view: the fixed look-at, pulled back a little", () => {
    for (const aspect of [1, 1.125, 1.78]) {
      const f = framing(aspect, FOV);
      expect(f.target).toEqual(TARGET);
      expect(f.pull).toBeCloseTo(1.2, 10);
    }
  });

  it("steps a portrait canvas further back than a landscape one, and further the narrower it is", () => {
    const wide = framing(0.9, FOV).pull;
    const narrow = framing(0.5, FOV).pull;
    expect(wide).toBeGreaterThan(1.2);
    expect(narrow).toBeGreaterThan(wide);
  });

  it("looks at the middle of the rake-to-wake span on a phone, so both ends fit", () => {
    const f = framing(0.69, FOV);
    expect(f.target[0]).toBeGreaterThan(RAKE_X);
    expect(f.target[0]).toBeLessThan(FLOW_BOX.max[0]);
    expect(f.target[0]).toBeGreaterThan(TARGET[0]);
    expect(f.target[1]).toBe(TARGET[1]);
  });

  it("fits the span across the width, to within the margin", () => {
    const aspect = 0.69;
    const f = framing(aspect, FOV);
    const toEye = EYE.map((e, i) => e - TARGET[i]);
    const distance = f.pull * Math.hypot(toEye[0], toEye[1], toEye[2]);
    const halfWidth = distance * Math.tan((FOV * Math.PI) / 360) * aspect;
    const flat = Math.hypot(toEye[0], toEye[2]);
    const spanOnScreen = ((FLOW_BOX.max[0] - 0.4 - (RAKE_X - 0.25)) / 2) * (Math.abs(toEye[2]) / flat);
    expect(halfWidth).toBeGreaterThan(spanOnScreen);
    expect(halfWidth).toBeLessThan(spanOnScreen * 1.5);
  });
});
