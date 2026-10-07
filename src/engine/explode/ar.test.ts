import { describe, expect, it } from "vitest";
import { AR_MAX_BYTES, arFileName, arScale, checkArSize, detectAr } from "./ar";

const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const ANDROID_FIREFOX = "Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

describe("detectAr", () => {
  it("offers Scene Viewer / WebXR on Android Chrome, whatever Quick Look says", () => {
    expect(detectAr({ userAgent: ANDROID_CHROME })).toBe("android");
    expect(detectAr({ userAgent: ANDROID_CHROME, quickLook: false })).toBe("android");
  });

  it("offers nothing on Android Firefox, which has neither", () => {
    expect(detectAr({ userAgent: ANDROID_FIREFOX })).toBeNull();
  });

  it("offers Quick Look on an iPhone only when the browser can open it", () => {
    expect(detectAr({ userAgent: IPHONE, quickLook: true })).toBe("ios");
    expect(detectAr({ userAgent: IPHONE, quickLook: false })).toBeNull();
    expect(detectAr({ userAgent: IPHONE })).toBeNull();
  });

  it("recognises an iPad that reports a Mac user agent by its touch screen", () => {
    expect(detectAr({ userAgent: IPAD_AS_MAC, platform: "MacIntel", maxTouchPoints: 5, quickLook: true })).toBe("ios");
  });

  it("hides on desktops, a Mac included", () => {
    expect(detectAr({ userAgent: WINDOWS, platform: "Win32", maxTouchPoints: 0, quickLook: true })).toBeNull();
    expect(detectAr({ userAgent: IPAD_AS_MAC, platform: "MacIntel", maxTouchPoints: 0, quickLook: true })).toBeNull();
    expect(detectAr({ userAgent: "" })).toBeNull();
  });
});

describe("arScale", () => {
  it("is metres per unit when the model is authored in a known unit", () => {
    expect(arScale(5.6, { metresPerUnit: 1 })).toBe(1);
    expect(arScale(170, { metresPerUnit: 0.01 })).toBeCloseTo(0.01);
  });

  it("scales the longest side to a real-world size when one is given, and that wins over the unit", () => {
    expect(arScale(2, { longestSide: 1.7 })).toBeCloseTo(0.85);
    expect(arScale(40, { longestSide: 0.4, metresPerUnit: 1 })).toBeCloseTo(0.01);
  });

  it("falls back to 1 when there is nothing to go on", () => {
    expect(arScale(3, {})).toBe(1);
    expect(arScale(0, { longestSide: 1.7 })).toBe(1);
    expect(arScale(Number.NaN, { longestSide: 1.7 })).toBe(1);
    expect(arScale(3, { metresPerUnit: -2 })).toBe(1);
  });
});

describe("arFileName", () => {
  it("is a safe name per format", () => {
    expect(arFileName("anatomy", "glb")).toBe("anatomy-model.glb");
    expect(arFileName("f1", "usdz")).toBe("f1-model.usdz");
    expect(arFileName("../a b", "glb")).toBe("a-b-model.glb");
    expect(arFileName("", "usdz")).toBe("model.usdz");
  });
});

describe("checkArSize", () => {
  it("accepts a file up to the limit and refuses one byte past it, naming both sizes", () => {
    expect(AR_MAX_BYTES.glb).toBe(15 * 1024 * 1024);
    expect(checkArSize(AR_MAX_BYTES.glb, AR_MAX_BYTES.glb)).toEqual({ ok: true });
    expect(checkArSize(AR_MAX_BYTES.glb + 1, AR_MAX_BYTES.glb).ok).toBe(false);
    expect(checkArSize(18.2 * 1024 * 1024, AR_MAX_BYTES.glb)).toEqual({ ok: false, message: "This model is too big for AR (18.2 MB, the limit is 15.0 MB)" });
  });

  it("limits a USDZ to 20 MB, room for the anatomy body (16.9 MB) and no more", () => {
    expect(AR_MAX_BYTES.usdz).toBe(20 * 1024 * 1024);
    expect(checkArSize(16.94 * 1024 * 1024, AR_MAX_BYTES.usdz)).toEqual({ ok: true });
    expect(checkArSize(AR_MAX_BYTES.usdz, AR_MAX_BYTES.usdz)).toEqual({ ok: true });
    expect(checkArSize(35 * 1024 * 1024, AR_MAX_BYTES.usdz)).toEqual({ ok: false, message: "This model is too big for AR (35.0 MB, the limit is 20.0 MB)" });
  });

  it("refuses an empty export", () => {
    expect(checkArSize(0, AR_MAX_BYTES.glb)).toEqual({ ok: false, message: "The AR export came out empty" });
  });
});
