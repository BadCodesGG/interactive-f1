/**
 * Compiles a livery's data to GLSL: the fragment-shader twin of the evaluator in livery-paint.ts.
 * The same rules, the same constants (baked into the source, so a livery is a program, not a set of
 * uniforms), with two differences: region edges are antialiased over one pixel with `fwidth`
 * instead of cut hard, and a decal samples its texture. Pure strings, no three, so the output is
 * testable as text.
 */
import { CAR_FRAME } from "./car-frame";
import { decalFrame, resolveColour, SECTION_BOTTOM, SECTION_SHOULDER_Y, SECTION_SHOULDER_Z, WRAP_BLEND } from "./livery-paint";
import { FINISHES, type Colour, type Curve, type DecalPlacement, type DecalTexture, type FinishName, type Livery, type LiveryPart, type Region } from "./livery-spec";

/** A float literal GLSL accepts (always with a decimal point). */
export function glslFloat(v: number): string {
  const s = String(Math.round(v * 1e6) / 1e6);
  return /[.e]/.test(s) ? s : `${s}.0`;
}

const vec3 = (c: readonly number[]) => `vec3(${c.map(glslFloat).join(", ")})`;

/**
 * A piecewise-linear curve as one expression: the first value plus a clamped ramp per segment, which
 * is the interpolation exactly and needs no branching or arrays. Uses only `clamp`, so the tests can
 * evaluate it in JS.
 */
export function glslCurve(x: string, curve: Curve): string {
  const terms = [glslFloat(curve[0][1])];
  for (let i = 1; i < curve.length; i++) {
    const [x0, y0] = curve[i - 1];
    const [x1, y1] = curve[i];
    terms.push(`${glslFloat(y1 - y0)} * clamp((${x} - ${glslFloat(x0)}) / ${glslFloat(x1 - x0)}, 0.0, 1.0)`);
  }
  return `(${terms.join(" + ")})`;
}

/** A colour rule as a vec3 expression in linear light; a ramp is nested mixes along `t`. */
function glslColour(livery: Livery, colour: Colour): string {
  if (typeof colour === "string") return vec3(resolveColour(livery, colour));
  const ramp = colour.ramp;
  let out = vec3(resolveColour(livery, ramp[0][1]));
  for (let i = 1; i < ramp.length; i++) {
    out = `mix(${out}, ${vec3(resolveColour(livery, ramp[i][1]))}, clamp((t - ${glslFloat(ramp[i - 1][0])}) / ${glslFloat(ramp[i][0] - ramp[i - 1][0])}, 0.0, 1.0))`;
  }
  return out;
}

const glslFinish = (name: FinishName) => {
  const f = FINISHES[name];
  return `vec4(${glslFloat(f.metalness)}, ${glslFloat(f.roughness)}, ${glslFloat(f.clearcoat)}, ${glslFloat(f.clearcoatRoughness)})`;
};

/** A region's signed distance in metres (positive inside), in the terms of livery-paint.ts's regionDistance. */
function glslDistance(region: Region): string | null {
  const len = glslFloat(CAR_FRAME.tail - CAR_FRAME.nose);
  const bodyHeight = glslFloat(CAR_FRAME.body.max[1] - CAR_FRAME.body.min[1]);
  switch (region.kind) {
    case "all":
      return null;
    case "tBand":
      return `min(t - ${glslFloat(region.from)}, ${glslFloat(region.to)} - t) * ${len}`;
    case "heightBelow":
      return `(${glslCurve("t", region.line)} - (p.y - ${glslFloat(CAR_FRAME.body.min[1])}) / ${bodyHeight}) * ${bodyHeight}`;
    case "swoosh":
      return `min(min((t - ${glslFloat(region.from)}) * ${len}, (${glslFloat(region.to)} - t) * ${len}), min(w - ${glslCurve("t", region.lo)}, ${glslCurve("t", region.hi)} - w))`;
    case "centre":
      return `min(min((t - ${glslFloat(region.from)}) * ${len}, (${glslFloat(region.to)} - t) * ${len}), ${glslFloat(region.half)} - abs(p.z))`;
    case "box": {
      const z = region.mirror ? "abs(p.z)" : "p.z";
      const [a, b] = [region.min, region.max];
      return `min(min(min(p.x - ${glslFloat(a[0])}, ${glslFloat(b[0])} - p.x), min(p.y - ${glslFloat(a[1])}, ${glslFloat(b[1])} - p.y)), min(${z} - ${glslFloat(a[2])}, ${glslFloat(b[2])} - ${z}))`;
    }
  }
}

const SAMPLER: Record<DecalTexture, string> = { mark: "uLivTexMark", wordmark: "uLivTexWordmark" };

/** The uniform name a decal texture is bound to. */
export const decalSampler = (texture: DecalTexture): string => SAMPLER[texture];

function glslDecal(livery: Livery, d: DecalPlacement): string {
  const f = decalFrame(d);
  const [w, h] = d.size;
  const lines = [
    "{",
    `  vec3 q = p - ${vec3(d.centre)};`,
    `  float a = dot(q, ${vec3(f.right)});`,
    `  float b = dot(q, ${vec3(f.up)});`,
    `  float inBox = step(0.0, min(min(${glslFloat(w / 2)} - abs(a), ${glslFloat(h / 2)} - abs(b)), ${glslFloat(d.depth)} - abs(dot(q, ${vec3(f.normal)}))));`,
  ];
  if (d.facing !== undefined) lines.push(`  inBox *= step(${glslFloat(d.facing)}, dot(n, ${vec3(f.normal)}));`);
  lines.push(`  vec4 tx = texture2D(${SAMPLER[d.texture]}, vec2(a / ${glslFloat(w)} + 0.5, b / ${glslFloat(h)} + 0.5));`);
  // The monogram is a picture (alpha is its shape); the wordmark is a mask, its shape in the red channel, filled with one colour.
  lines.push(`  float m = ${d.texture === "mark" ? "tx.a" : "tx.r"} * inBox;`);
  lines.push(`  o.colour = mix(o.colour, ${d.colour ? glslColour(livery, d.colour) : "tx.rgb"}, m);`);
  if (d.finish) lines.push(`  o.fin = mix(o.fin, ${glslFinish(d.finish)}, m);`);
  lines.push("}");
  return lines.join("\n");
}

/** The functions every livery shares: edge coverage, position along the car and the wrap coordinate. */
export function glslShared(): string {
  return `
struct LivOut { vec3 colour; vec4 fin; };

// Coverage of a signed distance in metres (positive inside): a hard edge blended over about one pixel.
// The width is capped so a pixel straddling a crease cannot smear a line across it.
float livCover(float d) {
  float w = clamp(fwidth(d), 1e-5, 0.02);
  return clamp(d / w + 0.5, 0.0, 1.0);
}

// The wrap coordinate (livery-paint.ts wrapCoord): metres around the body section from its shoulder.
float livWrap(vec3 p) {
  float yS = ${glslCurve("p.x", SECTION_SHOULDER_Y)};
  float zS = ${glslCurve("p.x", SECTION_SHOULDER_Z)};
  float mid = (${glslCurve("p.x", SECTION_BOTTOM)} + yS) * 0.5;
  float s = clamp((p.y - mid) / ${glslFloat(WRAP_BLEND)}, -1.0, 1.0);
  return s * (zS - abs(p.z)) + (p.y - yS);
}
`;
}

export interface LiveryGlsl {
  /** Declarations for the fragment shader's `#include <common>`: the shared functions, the samplers, `livPaint`. */
  source: string;
  /** The decal textures the part samples, each bound to `decalSampler(texture)`. */
  textures: DecalTexture[];
}

/** One part's paint as a GLSL function named `name`, and the decal textures it samples. */
function partFunction(livery: Livery, part: LiveryPart, name: string, decals: readonly DecalPlacement[]): { fn: string; textures: DecalTexture[] } {
  const spec = livery.parts[part];
  if (!spec) throw new Error(`Livery ${livery.id} does not paint ${part}`);
  const mine = decals.filter((d) => d.part === part);
  const textures = [...new Set(mine.map((d) => d.texture))];
  const body: string[] = [
    `  float t = (p.x - ${glslFloat(CAR_FRAME.nose)}) / ${glslFloat(CAR_FRAME.tail - CAR_FRAME.nose)};`,
    "  float w = livWrap(p);",
    "  LivOut o;",
    `  o.colour = ${glslColour(livery, spec.colour)};`,
    `  o.fin = ${glslFinish(spec.finish)};`,
  ];
  for (const layer of spec.layers ?? []) {
    const d = glslDistance(layer.region);
    body.push("  {");
    if (d === null) {
      body.push(`    o.colour = ${glslColour(livery, layer.colour)};`);
      if (layer.finish) body.push(`    o.fin = ${glslFinish(layer.finish)};`);
    } else {
      body.push(`    float d = ${d};`, "    float c = livCover(d);");
      if (layer.edge) body.push(`    o.colour = mix(o.colour, ${glslColour(livery, layer.edge.colour)}, livCover(d + ${glslFloat(layer.edge.width)}) * (1.0 - c));`);
      body.push(`    o.colour = mix(o.colour, ${glslColour(livery, layer.colour)}, c);`);
      if (layer.finish) body.push(`    o.fin = mix(o.fin, ${glslFinish(layer.finish)}, c);`);
    }
    body.push("  }");
  }
  for (const d of mine) body.push(glslDecal(livery, d));
  body.push("  return o;");
  return { fn: `LivOut ${name}(vec3 p, vec3 n) {\n${body.join("\n")}\n}\n`, textures };
}

const samplerDeclarations = (textures: readonly DecalTexture[]) => textures.map((t) => `uniform sampler2D ${SAMPLER[t]};`).join("\n");

/** `livPaint(p, n)` for one part of a livery: p the rest-pose position, n the surface normal (for a decal's facing test). */
export function liveryGlsl(livery: Livery, part: LiveryPart, decals: readonly DecalPlacement[] = livery.decals): LiveryGlsl {
  const { fn, textures } = partFunction(livery, part, "livPaint", decals);
  return { source: `${glslShared()}\n${samplerDeclarations(textures)}\n${fn}`, textures };
}

/**
 * `livPaint(p, n)` for a mesh that is two parts of a livery at once (a wing scan, planes and endplates in
 * one mesh): the plane's rules where |z| is under `cut` metres, the endplate's beyond it, blended over one
 * pixel like every other edge. Both run for every fragment, since a branch would leave the edge
 * coverage's derivatives in non-uniform control flow. `decals` replaces the livery's own list (a car
 * whose surface is not the F226's moves its marks).
 */
export function liveryGlslSplit(livery: Livery, plane: LiveryPart, plate: LiveryPart, cut: number, decals: readonly DecalPlacement[] = livery.decals): LiveryGlsl {
  const a = partFunction(livery, plane, "livPaintA", decals);
  const b = partFunction(livery, plate, "livPaintB", decals);
  const textures = [...new Set([...a.textures, ...b.textures])];
  const choose = [
    "LivOut livPaint(vec3 p, vec3 n) {",
    "  LivOut a = livPaintA(p, n);",
    "  LivOut b = livPaintB(p, n);",
    `  float s = livCover(abs(p.z) - ${glslFloat(cut)});`,
    "  LivOut o;",
    "  o.colour = mix(a.colour, b.colour, s);",
    "  o.fin = mix(a.fin, b.fin, s);",
    "  return o;",
    "}",
  ].join("\n");
  return { source: `${glslShared()}\n${samplerDeclarations(textures)}\n${a.fn}\n${b.fn}\n${choose}\n`, textures };
}
