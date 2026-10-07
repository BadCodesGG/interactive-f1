import { describe, expect, it } from "vitest";
import { glslCurve, glslFloat, glslShared, liveryGlsl, liveryGlslSplit } from "./livery-glsl";
import { curveAt, SECTION_SHOULDER_Y, SECTION_SHOULDER_Z } from "./livery-paint";
import type { Livery } from "./livery-spec";

/** Runs a `glslCurve` expression as JS: it uses only arithmetic and `clamp`, so the source is its own oracle. */
function run(expr: string, x: number): number {
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  return new Function("x", "clamp", `return ${expr.replace(/\bp\.x\b/g, "x").replace(/\bt\b/g, "x")};`)(x, clamp);
}

const LIV: Livery = {
  id: "t",
  name: "T",
  palette: { ink: "#000000", red: "#ff0000", white: "#ffffff" },
  parts: {
    body: {
      colour: "ink",
      finish: "gloss",
      layers: [
        { colour: "red", finish: "satin", region: { kind: "swoosh", from: 0.3, to: 0.7, lo: [[0.3, -0.1], [0.7, -0.1]], hi: [[0.3, 0.1], [0.7, 0.1]] }, edge: { width: 0.015, colour: "white" } },
        { colour: "ink", region: { kind: "box", min: [-1, 0.7, 0], max: [0, 2, 0.4], mirror: true } },
      ],
    },
    rearWing: { colour: "ink", finish: "gloss" },
  },
  decals: [
    { id: "w", texture: "wordmark", part: "rearWing", centre: [2.1, 0.88, 0], normal: [0, 1, 0], up: [-1, 0, 0], size: [0.8, 0.126], depth: 0.08, colour: "white", facing: 0.3 },
    { id: "m", texture: "mark", part: "body", centre: [-2.35, 0.47, 0], normal: [0, 1, 0], up: [-1, 0, 0], size: [0.24, 0.18], depth: 0.05 },
  ],
};

describe("glslFloat", () => {
  it("always writes a decimal point", () => {
    expect(glslFloat(1)).toBe("1.0");
    expect(glslFloat(0.015)).toBe("0.015");
    expect(glslFloat(-2)).toBe("-2.0");
    expect(glslFloat(1000)).toBe("1000.0");
  });
});

describe("glslCurve", () => {
  const curves = {
    ramp: [[0, 0], [1, 2], [3, 2]] as const,
    shoulderHeight: SECTION_SHOULDER_Y,
    shoulderWidth: SECTION_SHOULDER_Z,
  };

  it("evaluates to the same value as the evaluator's curve, inside and beyond the control points", () => {
    for (const [name, curve] of Object.entries(curves)) {
      for (const x of [-4, -3, -2.42, -1.8, -0.83, -0.6, -0.05, 0.31, 0.9, 1.55, 3]) {
        expect(run(glslCurve("x", curve), x), `${name} at ${x}`).toBeCloseTo(curveAt(curve, x), 5);
      }
    }
  });
});

describe("liveryGlsl", () => {
  const body = liveryGlsl(LIV, "body");

  it("antialiases every edge with fwidth and caps the width so a crease cannot smear it", () => {
    expect(glslShared()).toContain("clamp(fwidth(d), 1e-5, 0.02)");
    expect(body.source).toContain("livCover(d)");
  });

  it("bakes each layer in order: the border under its fill, then the finish, then the box", () => {
    const s = body.source;
    const border = s.indexOf("livCover(d + 0.015)");
    const fill = s.indexOf("vec3(1.0, 0.0, 0.0)", border);
    const finish = s.indexOf("vec4(0.0, 0.42, 0.3, 0.3)", fill);
    const box = s.indexOf("abs(p.z) - 0.0", finish);
    expect(border).toBeGreaterThan(0);
    expect(fill).toBeGreaterThan(border);
    expect(finish).toBeGreaterThan(fill);
    expect(box).toBeGreaterThan(finish);
  });

  it("starts from the part's base colour and finish, in linear light", () => {
    expect(body.source).toContain("o.colour = vec3(0.0, 0.0, 0.0);");
    expect(body.source).toContain("o.fin = vec4(0.0, 0.18, 1.0, 0.06);");
  });

  it("declares only the samplers the part uses", () => {
    expect(body.textures).toEqual(["mark"]);
    expect(body.source).toContain("uniform sampler2D uLivTexMark;");
    expect(body.source).not.toContain("uLivTexWordmark");
    const wing = liveryGlsl(LIV, "rearWing");
    expect(wing.textures).toEqual(["wordmark"]);
    expect(wing.source).toContain("uniform sampler2D uLivTexWordmark;");
  });

  it("reads a wordmark through its red channel and fills it with one colour, and a monogram through its own colours", () => {
    const wing = liveryGlsl(LIV, "rearWing").source;
    expect(wing).toContain("float m = tx.r * inBox;");
    expect(wing).toContain("o.colour = mix(o.colour, vec3(1.0, 1.0, 1.0), m);");
    expect(body.source).toContain("float m = tx.a * inBox;");
    expect(body.source).toContain("o.colour = mix(o.colour, tx.rgb, m);");
  });

  it("keeps a decal off a back face only when it asks for a facing test", () => {
    expect(liveryGlsl(LIV, "rearWing").source).toContain("inBox *= step(0.3, dot(n,");
    expect(body.source).not.toContain("inBox *=");
  });

  it("compiles a centre band to its distance in the same terms as the evaluator: t at each end, then |z| against half", () => {
    const centre: Livery = {
      id: "c",
      name: "C",
      palette: { ink: "#000000", red: "#ff0000" },
      parts: { body: { colour: "ink", finish: "matte", layers: [{ colour: "red", region: { kind: "centre", from: 0.1, to: 0.9, half: 0.16 } }] } },
      decals: [],
    };
    const s = liveryGlsl(centre, "body").source;
    expect(s).toContain("float d = min(min((t - 0.1) * 5.46, (0.9 - t) * 5.46), 0.16 - abs(p.z));");
  });

  it("refuses a part the livery does not paint", () => {
    expect(() => liveryGlsl(LIV, "frontWing")).toThrow(/does not paint/);
  });
});

describe("liveryGlslSplit", () => {
  const LIV2: Livery = { ...LIV, palette: { ...LIV.palette }, parts: { ...LIV.parts, frontEndplate: { colour: "red", finish: "matte" } } };
  const split = liveryGlslSplit(LIV2, "rearWing", "frontEndplate", 0.555);

  it("is one program: the shared functions once, a function per part, and livPaint choosing between them across the car", () => {
    expect(split.source.match(/struct LivOut/g)).toHaveLength(1);
    expect(split.source.match(/float livCover[(]/g)).toHaveLength(1);
    expect(split.source).toContain("LivOut livPaintA(vec3 p, vec3 n)");
    expect(split.source).toContain("LivOut livPaintB(vec3 p, vec3 n)");
    expect(split.source).toMatch(/LivOut livPaint[(]vec3 p, vec3 n[)] [{]/);
    // Both halves run for every fragment (a branch would put the derivatives in non-uniform control flow); the cut is antialiased like every edge.
    expect(split.source).toContain("livCover(abs(p.z) - 0.555)");
  });

  it("reads each half by its own rules: the plane's decals in A, none in B, and the textures of both bound once", () => {
    const a = split.source.slice(split.source.indexOf("livPaintA"), split.source.indexOf("livPaintB"));
    expect(a).toContain("uLivTexWordmark");
    expect(split.textures).toEqual(["wordmark"]);
    expect(split.source.match(/uniform sampler2D uLivTexWordmark;/g)).toHaveLength(1);
  });

  it("takes a decal list of its own for the plane, so a car whose surface differs can move its marks", () => {
    const moved = liveryGlslSplit(LIV2, "rearWing", "frontEndplate", 0.555, [{ ...LIV.decals[0], centre: [1.5, 0.8, 0] }]);
    expect(moved.source).toContain("vec3(1.5, 0.8, 0.0)");
    expect(moved.source).not.toContain("vec3(2.1, 0.88, 0.0)");
  });
});
