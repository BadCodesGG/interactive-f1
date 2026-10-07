/**
 * The stage's optional realism, DOM-safe (no three): image-based lighting, tone mapping, ambient
 * occlusion, shadow quality and a contact shadow. Every part is opt-in; an app that passes no
 * `render` prop gets the engine's original look. `resolveRender()` turns what an app wrote, for the
 * page's theme and the device, into the numbers the stage applies.
 */
import { defined, pickTheme, type Theme, type Themed } from "./theme";

export type ToneMapping = "none" | "neutral" | "agx";
export type Quality = "auto" | "high" | "low";
/** Which procedural environment lights the model: three's room, or the photo studio built in ./studio. */
export type EnvKind = "room" | "studio";

export interface StudioOptions {
  /** Brightness multiplier of the overhead softbox. Default 1. */
  key?: number;
  /** Brightness multiplier of the two strip softboxes at the sides-back. Default 1. */
  strips?: number;
  /** The surround's colour as hex (`#rgb` or `#rrggbb`): dark to mid neutral. Default "#16181d"; raise it for a light theme. */
  surround?: string;
}

export interface AoOptions {
  /** Reach of the occlusion, as a fraction of the model's bounding radius. Default 0.12. */
  radius: number;
  /** Strength. Default 2.5. */
  intensity: number;
  /** How quickly occlusion fades out with distance, as a fraction of `radius`. Default 1. */
  distanceFalloff: number;
}

export interface ContactOptions {
  /** How dark the shadow is under the model, 0 to 1. Default 0.5. */
  opacity: number;
  /** Softness: blur reach in 1/256ths of the shadow's width. Default 2.5. */
  blur: number;
  /** How far above the ground a part still casts, as a fraction of the model's bounding radius. Default 0.5. */
  far: number;
}

export interface RenderOptions {
  /**
   * Light the model with a procedural environment, never drawn as the background. `true` and "room"
   * are three's RoomEnvironment (bright, so apps run it at 0.2 to 0.6 `envIntensity`); "studio" is a
   * photo studio built in code (./studio: overhead softbox, two strip softboxes, a floor bounce, a
   * dark surround) whose `envIntensity` 1 is a sensible exposure, and that gives clearcoat and metal
   * long, crisp stripe highlights. Default false.
   */
  env?: boolean | EnvKind;
  /** The studio's brightness and surround, for `env: "studio"`. Themes can differ: light wants a brighter surround. */
  studio?: StudioOptions;
  /** Strength of that lighting. Default 1. */
  envIntensity?: number;
  /** Turn it about the vertical axis, radians. Default 0. */
  envRotation?: number;
  /**
   * Default "none". The canvas is transparent, so the page behind it is never shifted by tone mapping;
   * a part's colour is, so an app that turns it on may nudge its palette to match.
   */
  toneMapping?: ToneMapping;
  /** Scales the light before tone mapping. Default 1. */
  exposure?: number;
  /** Screen-space ambient occlusion (N8AO), drawn with 4x MSAA on a desktop. `true` takes the defaults. Default off. */
  ao?: boolean | Partial<AoOptions>;
  /** Shadow map side in pixels, 256 to 4096. Default 1024. */
  shadowMapSize?: number;
  /** Softness of the key light's shadow edge, in shadow-map texels. Default 3. */
  shadowRadius?: number;
  /** A soft shadow pooled under the model, rendered from below like drei's ContactShadows. `true` takes the defaults. Default off. */
  contact?: boolean | Partial<ContactOptions>;
  /**
   * "low" turns AO and the contact shadow off and caps the pixel ratio at 1.5; "auto" picks low on a
   * touch screen `(pointer: coarse)` or with `prefers-reduced-data`. Default "auto" once `render` is
   * given, and "high" while it is not.
   */
  quality?: Quality;
}

/** A `render` prop: one set of options, or a partial override per theme. */
export type RenderProp = Themed<RenderOptions>;

export interface ResolvedRender {
  quality: "high" | "low";
  env: boolean;
  /** Which environment, when `env` is on. */
  envKind: EnvKind;
  /** The studio's settings, resolved (used only when `envKind` is "studio"). */
  studio: Required<StudioOptions>;
  envIntensity: number;
  envRotation: number;
  toneMapping: ToneMapping;
  exposure: number;
  /** Null when AO is off, or the device is low quality. */
  ao: AoOptions | null;
  shadowMapSize: number;
  shadowRadius: number;
  /** Null when the contact shadow is off, or the device is low quality. */
  contact: ContactOptions | null;
}

export const DEFAULT_STUDIO: Required<StudioOptions> = { key: 1, strips: 1, surround: "#16181d" };
/** A brightness multiplier above this is a typo, not a look. */
export const STUDIO_GAIN_MAX = 20;

export const DEFAULT_AO: AoOptions = { radius: 0.12, intensity: 2.5, distanceFalloff: 1 };
export const DEFAULT_CONTACT: ContactOptions = { opacity: 0.5, blur: 2.5, far: 0.5 };

export const SHADOW_MAP_MIN = 256;
export const SHADOW_MAP_MAX = 4096;

/** What the device says about itself, for `quality: "auto"`. */
export interface QualityEnv {
  coarse: boolean;
  reducedData: boolean;
}

/** Reads the two media queries; a browser that does not know one (prefers-reduced-data mostly) answers false. */
export function readQualityEnv(): QualityEnv {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return { coarse: false, reducedData: false };
  return {
    coarse: window.matchMedia("(pointer: coarse)").matches,
    reducedData: window.matchMedia("(prefers-reduced-data: reduce)").matches,
  };
}

export function resolveQuality(quality: Quality, env: QualityEnv): "high" | "low" {
  if (quality === "auto") return env.coarse || env.reducedData ? "low" : "high";
  return quality;
}

const finite = (v: number | undefined, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** A power of two would suit the GPU best, but any size in range works; out of range is clamped. */
export function clampShadowMap(size: number): number {
  return Math.round(Math.min(SHADOW_MAP_MAX, Math.max(SHADOW_MAP_MIN, size)));
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** The studio's settings over the defaults: gains clamped to 0..STUDIO_GAIN_MAX, a surround that is not hex ignored. */
export function resolveStudio(studio: StudioOptions | undefined): Required<StudioOptions> {
  const gain = (v: number | undefined, fallback: number) => Math.min(STUDIO_GAIN_MAX, Math.max(0, finite(v, fallback)));
  return {
    key: gain(studio?.key, DEFAULT_STUDIO.key),
    strips: gain(studio?.strips, DEFAULT_STUDIO.strips),
    surround: typeof studio?.surround === "string" && HEX.test(studio.surround) ? studio.surround : DEFAULT_STUDIO.surround,
  };
}

/** `true` is the defaults, an object overrides them, false and undefined are off. */
function options<T extends object>(value: boolean | Partial<T> | undefined, defaults: T): T | null {
  if (!value) return null;
  return value === true ? { ...defaults } : { ...defaults, ...defined(value) };
}

/**
 * The options for one theme on one device. `render` undefined means the app opted into nothing: the
 * result is the engine's original look, and quality is "high" so nothing about the device changes it.
 */
export function resolveRender(render: RenderProp | undefined, theme: Theme, env: QualityEnv): ResolvedRender {
  const r = pickTheme(render, theme) ?? {};
  const quality = resolveQuality(render === undefined ? "high" : (r.quality ?? "auto"), env);
  const high = quality === "high";
  const contact = options(r.contact, DEFAULT_CONTACT);
  if (contact) contact.opacity = Math.min(1, Math.max(0, contact.opacity));
  return {
    quality,
    env: r.env === true || r.env === "room" || r.env === "studio",
    envKind: r.env === "studio" ? "studio" : "room",
    studio: resolveStudio(r.studio),
    envIntensity: finite(r.envIntensity, 1),
    envRotation: finite(r.envRotation, 0),
    toneMapping: r.toneMapping === "neutral" || r.toneMapping === "agx" ? r.toneMapping : "none",
    exposure: finite(r.exposure, 1),
    ao: high ? options(r.ao, DEFAULT_AO) : null,
    shadowMapSize: clampShadowMap(finite(r.shadowMapSize, 1024)),
    shadowRadius: finite(r.shadowRadius, 3),
    contact: high ? contact : null,
  };
}

/** The pixel-ratio ceiling: the app's own (1.5 on a phone, 2 otherwise), and never above 1.5 at low quality. */
export function dprCeiling(mobile: boolean, quality: "high" | "low"): number {
  return Math.min(mobile ? 1.5 : 2, quality === "low" ? 1.5 : 2);
}
