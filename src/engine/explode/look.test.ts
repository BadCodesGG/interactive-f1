import { describe, expect, it } from "vitest";
import { DEFAULT_ACCENT, DEFAULT_BACKGROUND, easeOut, lerpLook, mixColour, resolveLook } from "./look";
import { DEFAULT_PALETTE } from "./theme";

const desktop = { coarse: false, reducedData: false };

describe("resolveLook", () => {
  it("is the engine's original look with nothing given", () => {
    const look = resolveLook({}, "light", desktop);
    expect(look.palette).toEqual(DEFAULT_PALETTE);
    expect(look.background).toBe(DEFAULT_BACKGROUND);
    expect(look.accent).toBe(DEFAULT_ACCENT);
    expect(look.render.toneMapping).toBe("none");
  });

  it("gives plain values to both themes", () => {
    const props = { background: "#101010", accent: "#ff0000", palette: { sky: "#abcdef" } };
    expect(resolveLook(props, "light", desktop)).toEqual(resolveLook(props, "dark", desktop));
    expect(resolveLook(props, "dark", desktop).background).toBe("#101010");
  });

  it("picks each themed prop for the theme", () => {
    const props = {
      background: { light: "#f4f1ea", dark: "#0b0e17" },
      accent: { light: "#a06a00", dark: "#e8b84c" },
      palette: { light: { sky: "#ffffff", keyIntensity: 3 }, dark: { sky: "#223" } },
      render: { light: { exposure: 1.1 }, dark: { exposure: 0.8 } },
    };
    const light = resolveLook(props, "light", desktop);
    const dark = resolveLook(props, "dark", desktop);
    expect([light.background, dark.background]).toEqual(["#f4f1ea", "#0b0e17"]);
    expect([light.accent, dark.accent]).toEqual(["#a06a00", "#e8b84c"]);
    expect([light.palette.sky, dark.palette.sky]).toEqual(["#ffffff", "#223"]);
    expect([light.palette.keyIntensity, dark.palette.keyIntensity]).toEqual([3, DEFAULT_PALETTE.keyIntensity]);
    expect([light.render.exposure, dark.render.exposure]).toEqual([1.1, 0.8]);
  });

  it("falls back to the defaults for a theme an app left out", () => {
    const props = { background: { light: "#f4f1ea" } };
    expect(resolveLook(props, "dark", desktop).background).toBe(DEFAULT_BACKGROUND);
  });
});

describe("mixColour", () => {
  it("is each end at 0 and 1 and a colour between them otherwise", () => {
    expect(mixColour("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixColour("#000000", "#ffffff", 1)).toBe("#ffffff");
    const mid = mixColour("#000000", "#ffffff", 0.5);
    expect(mid).not.toBe("#000000");
    expect(mid).not.toBe("#ffffff");
    // Mixed in linear light, so half-way is brighter than sRGB #808080.
    expect(parseInt(mid.slice(1, 3), 16)).toBeGreaterThan(0x80);
  });

  it("does not disturb a mix that follows", () => {
    mixColour("#ff0000", "#00ff00", 0.3);
    expect(mixColour("#000000", "#ffffff", 1)).toBe("#ffffff");
  });
});

describe("lerpLook", () => {
  const light = resolveLook(
    {
      background: "#ffffff",
      accent: "#a06a00",
      palette: { sky: "#ffffff", ground: "#dddddd", hemisphere: 2, keyIntensity: 3, keyFrom: [1, 2, 3], rimIntensity: 0, shadowOpacity: 0.2 },
      render: { toneMapping: "neutral", exposure: 1, envIntensity: 1, envRotation: 0, ao: true },
    },
    "light",
    desktop,
  );
  const dark = resolveLook(
    {
      background: "#000000",
      accent: "#e8b84c",
      palette: { sky: "#000000", ground: "#000000", hemisphere: 1, keyIntensity: 1, keyFrom: [3, 2, 1], rimIntensity: 1, shadowOpacity: 0.6 },
      render: { toneMapping: "agx", exposure: 0.5, envIntensity: 0.25, envRotation: 2, ao: false },
    },
    "dark",
    desktop,
  );

  it("is exactly each end at t of 0 and 1", () => {
    expect(lerpLook(light, dark, 0)).toBe(light);
    expect(lerpLook(light, dark, 1)).toBe(dark);
    expect(lerpLook(light, dark, -1)).toBe(light);
    expect(lerpLook(light, dark, 3)).toBe(dark);
  });

  it("eases numbers and vectors linearly", () => {
    const mid = lerpLook(light, dark, 0.5);
    expect(mid.palette.hemisphere).toBeCloseTo(1.5);
    expect(mid.palette.keyIntensity).toBeCloseTo(2);
    expect(mid.palette.keyFrom).toEqual([2, 2, 2]);
    expect(mid.palette.rimIntensity).toBeCloseTo(0.5);
    expect(mid.palette.shadowOpacity).toBeCloseTo(0.4);
    expect(mid.render.exposure).toBeCloseTo(0.75);
    expect(mid.render.envIntensity).toBeCloseTo(0.625);
    expect(mid.render.envRotation).toBeCloseTo(1);
  });

  it("eases colours, including the background and accent, to something between the two", () => {
    const mid = lerpLook(light, dark, 0.5);
    expect(mid.background).toBe(mixColour("#ffffff", "#000000", 0.5));
    expect(mid.background).not.toBe("#ffffff");
    expect(mid.background).not.toBe("#000000");
    expect(mid.palette.sky).toBe(mixColour("#ffffff", "#000000", 0.5));
    expect(mid.accent).toBe(mixColour("#a06a00", "#e8b84c", 0.5));
  });

  it("switches what cannot be halfway to the target at once", () => {
    const early = lerpLook(light, dark, 0.01);
    expect(early.render.toneMapping).toBe("agx");
    expect(early.render.ao).toBeNull();
    expect(early.render.shadowMapSize).toBe(dark.render.shadowMapSize);
  });

  it("does not modify either look", () => {
    const before = JSON.stringify([light, dark]);
    lerpLook(light, dark, 0.4);
    expect(JSON.stringify([light, dark])).toBe(before);
  });
});

describe("easeOut", () => {
  it("runs 0 to 1, fast then slow", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(easeOut(0.25)).toBeLessThan(easeOut(0.5));
  });
});
