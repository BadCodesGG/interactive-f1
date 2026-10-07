/**
 * View in AR: the pure parts (which phones can do it, the real-world scale, the file name, the size
 * guard). Nothing here imports three, so the barrel and StageTools may use it in a route's initial JS.
 * The export itself is ./ar-export (three's exporters, stage chunk only) and `<model-viewer>` is
 * imported on the button press (see ui/stage-tools.tsx).
 */
import { slug } from "./capture";

/** How this device would open a model: Scene Viewer / WebXR on Android, Quick Look (USDZ) on iOS. */
export type ArPlatform = "android" | "ios";
export type ArFormat = "glb" | "usdz";

/** What detection reads off the browser, so a test can hand it any device. */
export interface ArEnv {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  /** `document.createElement("a").relList.supports("ar")`: the browser can open a Quick Look link. */
  quickLook?: boolean;
}

/** A phone or tablet that can do AR, else null (desktops, Firefox on Android, iOS without Quick Look). */
export function detectAr({ userAgent, platform = "", maxTouchPoints = 0, quickLook = false }: ArEnv): ArPlatform | null {
  if (/Android/i.test(userAgent)) return /Firefox|Fennec/i.test(userAgent) ? null : "android";
  // iPadOS asks for the desktop site by default and then calls itself a Mac; its touch screen gives it away.
  const apple = /iPhone|iPad|iPod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
  return apple && quickLook ? "ios" : null;
}

/** Reads the running browser. Client only. */
export function readArEnv(): ArEnv {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    quickLook: document.createElement("a").relList?.supports?.("ar") === true,
  };
}

/**
 * How a feature says how big its model is in the real world: either the unit its model is authored in,
 * or the real length of the model's longest side, for a model whose own units are arbitrary.
 */
export interface ArOptions {
  /** Metres per model unit (a car built in metres is 1). */
  metresPerUnit?: number;
  /** The real-world length of the model's longest side, in metres. Wins over `metresPerUnit`. */
  longestSide?: number;
  /** Opt-in: a leaner mesh for the phone file (the on-screen model is not changed). Off when absent. */
  simplify?: ArSimplify;
}

/**
 * How far the AR file's geometry is reduced. A USDZ is uncompressed, so this is what brings a heavy
 * model under the size limit. Each mesh is welded and its triangles collapsed, cheapest first.
 */
export interface ArSimplify {
  /** The share of each mesh's triangles to aim for, 0 to 1. A mesh stops earlier if going further would break `error`. */
  keep: number;
  /** The most a mesh's surface may move, as a fraction of that mesh's own size. Default 0.005. Detail smaller than this can vanish (screws, pins). */
  error?: number;
}

const usable = (n: number | undefined): n is number => n !== undefined && Number.isFinite(n) && n > 0;

/** The factor that takes the model, whose longest side is `size` units, to metres. 1 when nothing decides it. */
export function arScale(size: number, { metresPerUnit, longestSide }: ArOptions): number {
  if (usable(longestSide) && usable(size)) return longestSide / size;
  return usable(metresPerUnit) ? metresPerUnit : 1;
}

/** `<app>-model.glb` or `.usdz`: what Quick Look and Scene Viewer show as the file's name. */
export function arFileName(app: string, format: ArFormat): string {
  const name = slug(app);
  return `${name ? `${name}-` : ""}model.${format}`;
}

/**
 * A phone is not handed more than this. A USDZ is uncompressed, 3x to 4x the size of the same model as
 * a GLB (measured: 3.2x to 4.2x), so its limit is a little over that of the GLB rather than 4x: the
 * heaviest model that ships (the anatomy body, 16.9 MB) fits, and a phone is not made to open more
 * than 20 MB in Quick Look. A model over it opts into `simplify` (see ArOptions).
 */
export const AR_MAX_BYTES: Record<ArFormat, number> = { glb: 15 * 1024 * 1024, usdz: 20 * 1024 * 1024 };

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

export type ArSizeCheck = { ok: true } | { ok: false; message: string };

export function checkArSize(bytes: number, limit: number): ArSizeCheck {
  if (bytes <= 0) return { ok: false, message: "The AR export came out empty" };
  if (bytes > limit) return { ok: false, message: `This model is too big for AR (${mb(bytes)} MB, the limit is ${mb(limit)} MB)` };
  return { ok: true };
}
