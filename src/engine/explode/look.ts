/**
 * The stage's whole look for one theme (lights, colours, realism), as plain data, and the easing
 * between two of them. three is used only for its colour maths; nothing here touches a scene.
 */
import { Color } from "three";
import { resolveRender, type QualityEnv, type RenderProp, type ResolvedRender } from "./render";
import { pickTheme, resolvePalette, type StagePalette, type Theme, type Themed } from "./theme";

export interface Look {
  palette: StagePalette;
  /** The page background, the colour isolated-out parts fade toward. */
  background: string;
  accent: string;
  render: ResolvedRender;
}

export interface LookProps {
  palette?: Themed<Partial<StagePalette>>;
  background?: Themed<string>;
  accent?: Themed<string>;
  render?: RenderProp;
}

export const DEFAULT_BACKGROUND = "#0b0e17";
export const DEFAULT_ACCENT = "#e8b84c";
/** How long a theme change takes to ease in, seconds. */
export const THEME_EASE_SECONDS = 0.3;

/** What the stage should look like in one theme on one device. */
export function resolveLook(props: LookProps, theme: Theme, env: QualityEnv): Look {
  return {
    palette: resolvePalette(props.palette, theme),
    background: pickTheme(props.background, theme) ?? DEFAULT_BACKGROUND,
    accent: pickTheme(props.accent, theme) ?? DEFAULT_ACCENT,
    render: resolveRender(props.render, theme, env),
  };
}

const a = new Color();
const b = new Color();

/** A colour `t` of the way from one to the other, as hex. Mixed in three's working (linear) space. */
export function mixColour(from: string, to: string, t: number): string {
  return `#${a.set(from).lerp(b.set(to), t).getHexString()}`;
}

const mix = (from: number, to: number, t: number) => from + (to - from) * t;

/** Ease-out: quick at first, settling. */
export const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * `from` moved `t` (0 to 1) of the way to `to`. Colours and numbers ease; what cannot be halfway
 * (tone mapping, AO on or off, the shadow map size, the environment switch) takes `to` at once.
 */
export function lerpLook(from: Look, to: Look, t: number): Look {
  if (t >= 1) return to;
  if (t <= 0) return from;
  const p = from.palette;
  const q = to.palette;
  return {
    palette: {
      sky: mixColour(p.sky, q.sky, t),
      ground: mixColour(p.ground, q.ground, t),
      hemisphere: mix(p.hemisphere, q.hemisphere, t),
      key: mixColour(p.key, q.key, t),
      keyIntensity: mix(p.keyIntensity, q.keyIntensity, t),
      keyFrom: [mix(p.keyFrom[0], q.keyFrom[0], t), mix(p.keyFrom[1], q.keyFrom[1], t), mix(p.keyFrom[2], q.keyFrom[2], t)],
      shadow: mixColour(p.shadow, q.shadow, t),
      shadowOpacity: mix(p.shadowOpacity, q.shadowOpacity, t),
      rim: mixColour(p.rim, q.rim, t),
      rimIntensity: mix(p.rimIntensity, q.rimIntensity, t),
    },
    background: mixColour(from.background, to.background, t),
    accent: mixColour(from.accent, to.accent, t),
    render: {
      ...to.render,
      exposure: mix(from.render.exposure, to.render.exposure, t),
      envIntensity: mix(from.render.envIntensity, to.render.envIntensity, t),
      envRotation: mix(from.render.envRotation, to.render.envRotation, t),
    },
  };
}
