import { describe, expect, it } from "vitest";
import { XRAY_FLOOR, xrayBlend, xrayOpacity, xrayParts } from "./xray";

describe("xrayOpacity", () => {
  it("is solid at 0 and a faint ghost at 1", () => {
    expect(xrayOpacity(0)).toBe(1);
    expect(xrayOpacity(1)).toBeCloseTo(XRAY_FLOOR, 10);
  });

  it("falls steadily in between", () => {
    expect(xrayOpacity(0.5)).toBeCloseTo(0.53, 10);
    expect(xrayOpacity(0.25)).toBeGreaterThan(xrayOpacity(0.75));
  });

  it("clamps out-of-range and non-finite amounts", () => {
    expect(xrayOpacity(-3)).toBe(1);
    expect(xrayOpacity(9)).toBeCloseTo(XRAY_FLOOR, 10);
    expect(xrayOpacity(Number.NaN)).toBe(1);
  });
});

describe("xrayParts", () => {
  const sidecar = {
    xray: ["skin"],
    parts: {
      hide: { label: "Skin", group: "skin", copy: "a" },
      heart: { label: "Heart", group: "organs", copy: "b" },
      loose: { label: "Loose", copy: "c" },
    },
  };

  it("picks the parts of the listed groups", () => {
    expect([...xrayParts(sidecar)]).toEqual(["hide"]);
  });

  it("picks nothing when the sidecar has no x-ray list", () => {
    expect(xrayParts({ parts: sidecar.parts }).size).toBe(0);
  });
});

describe("xrayBlend", () => {
  const solid = { opacity: 1, transparent: false, depthWrite: true };
  const glass = { opacity: 0.3, transparent: true, depthWrite: false };

  it("returns the authored blend untouched at fade 1", () => {
    expect(xrayBlend(solid, 1)).toBe(solid);
    expect(xrayBlend(glass, 1)).toBe(glass);
  });

  it("makes a solid material transparent and stops it writing depth once it fades", () => {
    expect(xrayBlend(solid, 0.4)).toEqual({ opacity: 0.4, transparent: true, depthWrite: false });
  });

  it("multiplies into a material that was already see-through", () => {
    expect(xrayBlend(glass, 0.5)).toEqual({ opacity: 0.15, transparent: true, depthWrite: false });
  });
});
