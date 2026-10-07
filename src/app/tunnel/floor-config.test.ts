import { describe, expect, it } from "vitest";
import { FLOOR, reflectionSize } from "./floor-config";

describe("reflectionSize", () => {
  it("is a fraction of the drawing buffer", () => {
    expect(reflectionSize(1440, 900, false)).toEqual([1080, 675]);
  });

  it("is smaller on a phone", () => {
    const [dw, dh] = reflectionSize(1000, 800, false);
    const [mw, mh] = reflectionSize(1000, 800, true);
    expect(mw).toBeLessThan(dw);
    expect(mh).toBeLessThan(dh);
    expect(FLOOR.taps.mobile).toBeLessThan(FLOOR.taps.desktop);
  });

  it("stays inside its clamp on a huge or a tiny canvas", () => {
    expect(reflectionSize(6000, 4000, false)).toEqual([FLOOR.texture.max, FLOOR.texture.max]);
    expect(reflectionSize(100, 80, true)).toEqual([FLOOR.texture.min, FLOOR.texture.min]);
  });
});

describe("FLOOR", () => {
  it("spans the car and fades the reflection out before the pool", () => {
    const [x0, x1, z0, z1] = FLOOR.footprint;
    expect(x1 - x0).toBeGreaterThan(5);
    expect(z1).toBeGreaterThan(z0);
    expect(FLOOR.poolFade).toBeGreaterThan(FLOOR.fade);
    expect(FLOOR.size / 2).toBeGreaterThan(FLOOR.poolFade + Math.max(Math.abs(x0), Math.abs(x1)));
    expect(FLOOR.lod[1]).toBeGreaterThan(FLOOR.lod[0]);
    expect(FLOOR.blur[0]).toBeGreaterThan(0);
    expect(FLOOR.blur[1]).toBeGreaterThan(FLOOR.blur[0]);
    expect(FLOOR.blur[1]).toBeLessThanOrEqual(FLOOR.fade + 0.4);
    expect(FLOOR.radius[1]).toBeGreaterThan(FLOOR.radius[0]);
  });
});
