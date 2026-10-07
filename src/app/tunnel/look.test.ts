import { describe, expect, it } from "vitest";
import { tunnelLook } from "./look";

const lum = (c: string) => {
  const n = parseInt(c.slice(1), 16);
  return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};

describe("tunnelLook", () => {
  it("keeps the dark tunnel's ground, light and grid as they shipped, with near-white smoke", () => {
    const l = tunnelLook("dark");
    expect(l.background).toBe("#0e1320");
    expect(l.hemisphere).toEqual({ sky: "#dfe6f5", ground: "#1a1f2b", intensity: 1.6 });
    expect(l.grid).toEqual({ minor: ["#26304a", "#1a2236"], major: "#34405e" });
    expect(l.flow).toEqual({ smoke: "#f3f6fc", opacity: 0.6, width: 0.06 });
  });

  it("sits the light tunnel on the page's off-white ground", () => {
    expect(tunnelLook("light").background).toBe("#e1e5ea");
  });

  it("draws the dark tunnel's smoke near-white and the light tunnel's dark, so it reads against each ground", () => {
    expect(lum(tunnelLook("dark").flow.smoke)).toBeGreaterThan(0.9);
    const light = tunnelLook("light");
    expect(lum(light.flow.smoke)).toBeLessThan(0.25);
    expect(lum(light.background) - lum(light.flow.smoke)).toBeGreaterThan(0.5);
  });

  it("gives every theme a soft ribbon that is still a line: a few centimetres wide, translucent at its peak", () => {
    for (const theme of ["dark", "light"] as const) {
      const { opacity, width } = tunnelLook(theme).flow;
      expect(opacity).toBeGreaterThan(0.4);
      expect(opacity).toBeLessThan(0.8);
      expect(width).toBeGreaterThan(0.04);
      expect(width).toBeLessThan(0.09);
    }
  });

  it("polishes the floor in each theme's own tone: a near-black pool on the dark tunnel, a pale one on the light", () => {
    const dark = tunnelLook("dark").floor;
    const light = tunnelLook("light").floor;
    expect(lum(dark.base)).toBeLessThan(0.05);
    expect(lum(light.base)).toBeGreaterThan(0.9);
    for (const f of [dark, light]) {
      expect(f.reflect).toBeGreaterThan(0.2);
      expect(f.reflect).toBeLessThanOrEqual(1);
      expect(f.pool).toBeGreaterThan(0.5);
      expect(f.pool).toBeLessThanOrEqual(1);
    }
  });

  it("draws the streaks like the smoke and the flakes as mid greys, so both read against each ground", () => {
    const dark = tunnelLook("dark");
    const light = tunnelLook("light");
    expect(lum(dark.air.streak)).toBeGreaterThan(0.9);
    expect(lum(light.air.streak)).toBeLessThan(0.25);
    expect(lum(dark.air.flake)).toBeGreaterThan(lum(dark.background) + 0.3);
    expect(lum(light.background) - lum(light.air.flake)).toBeGreaterThan(0.3);
    for (const l of [dark, light]) {
      expect(l.air.streakOpacity).toBeGreaterThan(0.5);
      expect(l.air.flakeOpacity).toBeGreaterThan(0.5);
    }
  });
});
