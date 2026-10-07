import { describe, expect, it } from "vitest";
import { clampShadowMap, DEFAULT_AO, DEFAULT_CONTACT, dprCeiling, resolveQuality, resolveRender, type QualityEnv } from "./render";

const desktop: QualityEnv = { coarse: false, reducedData: false };
const touch: QualityEnv = { coarse: true, reducedData: false };
const saver: QualityEnv = { coarse: false, reducedData: true };

describe("resolveQuality", () => {
  it("auto is low on a touch screen or with reduced data, high otherwise", () => {
    expect(resolveQuality("auto", desktop)).toBe("high");
    expect(resolveQuality("auto", touch)).toBe("low");
    expect(resolveQuality("auto", saver)).toBe("low");
  });

  it("high and low ignore the device", () => {
    expect(resolveQuality("high", touch)).toBe("high");
    expect(resolveQuality("low", desktop)).toBe("low");
  });
});

describe("resolveRender", () => {
  it("with no render prop is the original look on any device", () => {
    for (const env of [desktop, touch, saver]) {
      expect(resolveRender(undefined, "light", env)).toEqual({
        quality: "high",
        env: false,
        envKind: "room",
        studio: { key: 1, strips: 1, surround: "#16181d" },
        envIntensity: 1,
        envRotation: 0,
        toneMapping: "none",
        exposure: 1,
        ao: null,
        shadowMapSize: 1024,
        shadowRadius: 3,
        contact: null,
      });
    }
  });

  it("keeps tone mapping, AO, environment and contact off unless opted in", () => {
    const r = resolveRender({}, "dark", desktop);
    expect(r.toneMapping).toBe("none");
    expect(r.env).toBe(false);
    expect(r.ao).toBeNull();
    expect(r.contact).toBeNull();
  });

  it("takes true as the defaults and an object as overrides on them", () => {
    const on = resolveRender({ ao: true, contact: true }, "light", desktop);
    expect(on.ao).toEqual(DEFAULT_AO);
    expect(on.contact).toEqual(DEFAULT_CONTACT);
    const tuned = resolveRender({ ao: { radius: 0.3 }, contact: { blur: 5, far: 1, opacity: 0.8 } }, "light", desktop);
    expect(tuned.ao).toEqual({ ...DEFAULT_AO, radius: 0.3 });
    expect(tuned.contact).toEqual({ opacity: 0.8, blur: 5, far: 1 });
    expect(resolveRender({ ao: false, contact: false }, "light", desktop)).toMatchObject({ ao: null, contact: null });
  });

  it("does not let the defaults be edited through a result", () => {
    resolveRender({ ao: true }, "light", desktop).ao!.radius = 99;
    expect(DEFAULT_AO.radius).toBe(0.12);
  });

  it("drops AO and the contact shadow at low quality, keeping the rest", () => {
    const opts = { ao: true, contact: true, env: true, toneMapping: "agx" as const, quality: "low" as const };
    const r = resolveRender(opts, "light", desktop);
    expect(r).toMatchObject({ quality: "low", ao: null, contact: null, env: true, toneMapping: "agx" });
    // auto reaches the same result through the device.
    expect(resolveRender({ ...opts, quality: "auto" }, "light", touch)).toEqual(r);
    expect(resolveRender({ ...opts, quality: "high" }, "light", touch).ao).toEqual(DEFAULT_AO);
  });

  it("defaults quality to auto once render is given", () => {
    expect(resolveRender({ ao: true }, "light", touch).ao).toBeNull();
    expect(resolveRender({ ao: true }, "light", desktop).ao).not.toBeNull();
  });

  it("resolves a per-theme override for each theme", () => {
    const render = { light: { toneMapping: "neutral" as const, exposure: 1 }, dark: { toneMapping: "agx" as const, exposure: 0.8, env: true } };
    expect(resolveRender(render, "light", desktop)).toMatchObject({ toneMapping: "neutral", exposure: 1, env: false });
    expect(resolveRender(render, "dark", desktop)).toMatchObject({ toneMapping: "agx", exposure: 0.8, env: true });
  });

  it("gives a theme left out the engine's defaults", () => {
    expect(resolveRender({ dark: { exposure: 0.5 } }, "light", desktop).exposure).toBe(1);
  });

  it("passes environment strength and rotation through", () => {
    expect(resolveRender({ env: true, envIntensity: 0.4, envRotation: 1.2 }, "light", desktop)).toMatchObject({ envIntensity: 0.4, envRotation: 1.2 });
  });

  it("ignores values that are not finite numbers or known tone mappings", () => {
    const r = resolveRender({ exposure: NaN, envIntensity: Infinity, toneMapping: "aces" as never, shadowMapSize: NaN }, "light", desktop);
    expect(r).toMatchObject({ exposure: 1, envIntensity: 1, toneMapping: "none", shadowMapSize: 1024 });
  });

  it("clamps the contact opacity to 0..1", () => {
    expect(resolveRender({ contact: { opacity: 4 } }, "light", desktop).contact!.opacity).toBe(1);
    expect(resolveRender({ contact: { opacity: -1 } }, "light", desktop).contact!.opacity).toBe(0);
  });
});

describe("clampShadowMap", () => {
  it("keeps sizes in range and pulls others in", () => {
    expect(clampShadowMap(2048)).toBe(2048);
    expect(clampShadowMap(64)).toBe(256);
    expect(clampShadowMap(100000)).toBe(4096);
    expect(clampShadowMap(1000.4)).toBe(1000);
  });
});

describe("dprCeiling", () => {
  it("is the app's own, and never above 1.5 at low quality", () => {
    expect(dprCeiling(false, "high")).toBe(2);
    expect(dprCeiling(true, "high")).toBe(1.5);
    expect(dprCeiling(false, "low")).toBe(1.5);
    expect(dprCeiling(true, "low")).toBe(1.5);
  });
});
