import { describe, expect, it } from "vitest";
import { CAR_FRAME } from "./car-frame";
import { DECALS } from "./decals";
import { BADCODES } from "./livery-badcodes";
import { curveAt, decalHit, paintAt, SECTION_BOTTOM, SECTION_SHOULDER_Y, SECTION_SHOULDER_Z, toHex } from "./livery-paint";
import { FINISHES, type DecalPlacement, type Vec3 } from "./livery-spec";

const BLACK = "#0b0b0c";
const WHITE = "#f7f7f5";
const hexAt = (part: Parameters<typeof paintAt>[1], p: Vec3) => toHex(paintAt(BADCODES, part, p)!.colour);
/** Within a few units per channel: a ramp is a blend, so its exact digits are the evaluator's rounding, not the spec's. */
const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const near = (a: string, b: string, tol = 3) => channels(a).every((v, i) => Math.abs(v - channels(b)[i]) <= tol);
const decal = (id: string): DecalPlacement => BADCODES.decals.find((d) => d.id === id)!;

// The body's section at x = -0.274 (t 0.5), read off car-frame.ts: belly 0.19, shoulder at y 0.585, half-width about 0.69.
// On the flank wall the wrap coordinate is just y minus the shoulder height.
const X = -0.274;
const flank = (y: number): Vec3 => [X, y, 0.68];

describe("the BadCodes livery: body", () => {
  it("is black and gloss at the nose tip", () => {
    const p = paintAt(BADCODES, "body", [-3.004, 0.25, 0])!;
    expect(toHex(p.colour)).toBe(BLACK);
    expect(p.finish).toEqual(FINISHES.gloss);
  });

  it("runs the swoosh along the middle of the sidepod flank, on both sides", () => {
    // y 0.25 is 0.06 above the belly's edge, about 0.14 of the wall up: inside the band (0.1 to 0.5 of the wall).
    expect(near(hexAt("body", flank(0.25)), "#f25c0b", 6)).toBe(true);
    expect(near(hexAt("body", [X, 0.25, -0.68]), "#f25c0b", 6)).toBe(true);
  });

  it("leaves black above the swoosh on the flank and the sidepod top, and below it toward the floor", () => {
    expect(hexAt("body", flank(0.45))).toBe(BLACK);
    expect(hexAt("body", [X, 0.585, 0.4])).toBe(BLACK);
    expect(hexAt("body", [X, 0.3, 0.55])).toBe(BLACK);
  });

  it("keeps the cockpit surround, the top of the chassis and the cover's spine black", () => {
    expect(hexAt("body", [-1.3, 0.68, 0.05])).toBe(BLACK);
    expect(hexAt("body", [-1.9, 0.64, 0.18])).toBe(BLACK);
    expect(hexAt("body", [1.0, 0.93, 0])).toBe(BLACK);
    expect(hexAt("body", [-0.5, 0.85, 0.2])).toBe(BLACK);
  });

  it("edges the swoosh with a 0.015 m white line just outside it", () => {
    // Along the nose the band at t 0.05 runs from w -0.05 to -0.03: yellow inside, the white line just below it, black beyond.
    expect(near(hexAt("body", [-2.73, 0.31, 0.14]), "#ffd000", 8)).toBe(true);
    expect(hexAt("body", [-2.73, 0.3, 0.15])).toBe(WHITE);
    expect(hexAt("body", [-2.73, 0.27, 0.15])).toBe(BLACK);
  });

  it("starts the swoosh under the nose's shoulder at t 0.05 and not before", () => {
    expect(near(hexAt("body", [-2.72, 0.315, 0.14]), "#ffd000", 8)).toBe(true);
    expect(hexAt("body", [-2.85, 0.33, 0.13])).toBe(BLACK);
  });

  it("goes yellow, then orange, then red along the car", () => {
    expect(near(hexAt("body", [-2.4, 0.4, 0.16]), "#ffd000", 8)).toBe(true);
    // The chassis side at t 0.38 is orange.
    expect(hexAt("body", [-0.929, 0.61, 0.262])).toBe("#ff7a00");
    // From t 0.6 the swoosh is fully red, all the way to its end at the fin.
    expect(hexAt("body", [0.27, 0.25, 0.68])).toBe("#e63312");
    expect(hexAt("body", [0.85, 0.4, 0.5])).toBe("#e63312");
  });

  it("climbs the sidepod's tail and the cover's side to end in a point, black spine above it and black tail behind it", () => {
    expect(hexAt("body", [0.85, 0.55, 0.3])).toBe(BLACK);
    expect(hexAt("body", [1.36, 0.5, 0.1])).toBe(BLACK);
    expect(hexAt("body", [1.6, 0.4, 0.1])).toBe(BLACK);
  });

  it("keeps the halo black", () => {
    expect(hexAt("body", [-0.5, 0.85, 0.2])).toBe(BLACK);
    expect(hexAt("body", [-0.5, 0.85, -0.2])).toBe(BLACK);
  });

  it("is more than half black over the body's painted surface", () => {
    // Walk the measured sections (car-frame.ts) from the nose's start to the tail and weigh each metre of the top and the two flank walls.
    let black = 0;
    let all = 0;
    for (let t = 0.03; t < 0.85; t += 0.01) {
      const x = CAR_FRAME.nose + t * (CAR_FRAME.tail - CAR_FRAME.nose);
      const top = curveAt(SECTION_SHOULDER_Y, x);
      const half = curveAt(SECTION_SHOULDER_Z, x);
      const belly = curveAt(SECTION_BOTTOM, x);
      const n = 24;
      for (let i = 0; i < n; i++) {
        const z = -half + ((i + 0.5) / n) * 2 * half;
        const w = (2 * half) / n;
        all += w;
        if (hexAt("body", [x, top, z]) === BLACK) black += w;
      }
      for (const s of [1, -1]) {
        for (let i = 0; i < n; i++) {
          const y = belly + ((i + 0.5) / n) * (top - belly);
          const w = (top - belly) / n;
          all += w;
          if (hexAt("body", [x, y, s * half]) === BLACK) black += w;
        }
      }
    }
    expect(black / all).toBeGreaterThan(0.55);
  });
});

describe("the BadCodes livery: wings", () => {
  it("paints the endplates in the gradient: yellow at the front, red at the rear", () => {
    expect(near(hexAt("frontEndplate", [-2.7, 0.3, 0.8]), "#ffd000", 8)).toBe(true);
    expect(hexAt("rearEndplate", [2.4, 0.7, 0.55])).toBe("#e63312");
  });

  it("keeps the wing planes black and gloss", () => {
    for (const part of ["frontWing", "rearWing"] as const) {
      const p = paintAt(BADCODES, part, [2, 0.3, 0.2])!;
      expect(toHex(p.colour)).toBe(BLACK);
      expect(p.finishName).toBe("gloss");
    }
  });

  it("answers the endplates in gloss too", () => {
    expect(paintAt(BADCODES, "rearEndplate", [2.4, 0.7, 0.55])!.finishName).toBe("gloss");
  });
});

describe("the BadCodes livery: logos", () => {
  it("places the bc monogram on the nose and both sides of the fin, the wordmark on both flanks and the rear wing", () => {
    expect(BADCODES.decals.map((d) => `${d.texture}:${d.part}`).sort()).toEqual([
      "mark:body",
      "mark:body",
      "mark:body",
      "wordmark:body",
      "wordmark:body",
      "wordmark:rearWing",
    ]);
  });

  it("sizes each mark for the hero angle: monogram 0.27 m on the nose and 0.22 m on the fin, wordmark 0.9 m on the flanks and 0.8 m on the wing", () => {
    expect(decal("nose-mark").size[1]).toBeCloseTo(0.27, 6);
    expect(decal("fin-mark-left").size[1]).toBeCloseTo(0.22, 6);
    expect(decal("flank-wordmark-left").size[0]).toBeCloseTo(0.9, 6);
    expect(decal("wing-wordmark").size[0]).toBeCloseTo(0.8, 6);
  });

  it("keeps each texture's own proportions", () => {
    expect(decal("nose-mark").size[0] / decal("nose-mark").size[1]).toBeCloseTo(DECALS.mark.aspect, 3);
    expect(decal("flank-wordmark-right").size[0] / decal("flank-wordmark-right").size[1]).toBeCloseTo(DECALS.wordmark.aspect, 3);
  });

  it("keeps the monogram in its own colours and fills the wordmark white", () => {
    for (const d of BADCODES.decals) {
      if (d.texture === "mark") expect(d.colour).toBeUndefined();
      else expect(d.colour).toBe("white");
    }
  });

  it("puts a flank wordmark on its own side of the car only, above the swoosh", () => {
    const left = decal("flank-wordmark-left");
    const right = decal("flank-wordmark-right");
    expect(decalHit(left, left.centre)).not.toBeNull();
    expect(decalHit(right, right.centre)).not.toBeNull();
    expect(left.centre[2]).toBeGreaterThan(0.5);
    expect(right.centre[2]).toBeLessThan(-0.5);
    expect(decalHit(left, right.centre)).toBeNull();
    expect(decalHit(right, left.centre)).toBeNull();
    // The whole artwork sits on black: its centre and both ends are above the swoosh's upper edge.
    for (const dx of [-0.4, 0, 0.4]) expect(hexAt("body", [left.centre[0] + dx, left.centre[1] - 0.05, left.centre[2]])).toBe(BLACK);
  });

  it("reads correctly on both flanks: left to right as a viewer at that side sees it, never mirrored", () => {
    const [left, right] = [decal("flank-wordmark-left"), decal("flank-wordmark-right")];
    const ahead = (d: DecalPlacement, dx: number): Vec3 => [d.centre[0] + dx, d.centre[1], d.centre[2]];
    // A viewer on the left (+z) flank has the nose (-x) on their left: the text runs toward the tail. On the right flank it runs toward the nose.
    expect(decalHit(left, ahead(left, 0.2))!.u).toBeGreaterThan(0.5);
    expect(decalHit(left, ahead(left, -0.2))!.u).toBeLessThan(0.5);
    expect(decalHit(right, ahead(right, 0.2))!.u).toBeLessThan(0.5);
    expect(decalHit(right, ahead(right, -0.2))!.u).toBeGreaterThan(0.5);
    // Both stand upright: higher on the car is higher in the artwork.
    expect(decalHit(left, [left.centre[0], left.centre[1] + 0.03, left.centre[2]])!.v).toBeGreaterThan(0.5);
    expect(decalHit(right, [right.centre[0], right.centre[1] + 0.03, right.centre[2]])!.v).toBeGreaterThan(0.5);
  });

  it("lays the nose monogram on the black chassis nose ahead of the cockpit, and the fin monograms one on each face of the blade", () => {
    const nose = decal("nose-mark");
    expect(nose.centre[0]).toBeGreaterThan(-2);
    expect(nose.centre[0]).toBeLessThan(-1.6);
    expect(nose.centre[2]).toBe(0);
    expect(decalHit(nose, nose.centre)).toEqual({ u: 0.5, v: 0.5 });
    // Black under the whole artwork, so its own colours read: the centre and the four corners.
    for (const [dx, dz] of [[0, 0], [0.13, 0.15], [-0.13, 0.15], [0.13, -0.15], [-0.13, -0.15]]) {
      expect(hexAt("body", [nose.centre[0] + dx, nose.centre[1] + dx * CAR_FRAME.anchors.noseChassis.slope, dz])).toBe(BLACK);
    }
    const [l, r] = [decal("fin-mark-left"), decal("fin-mark-right")];
    expect(l.centre[0]).toBeGreaterThan(1);
    expect(l.centre[2]).toBeGreaterThan(0);
    expect(r.centre[2]).toBeCloseTo(-l.centre[2], 6);
    expect(decalHit(l, r.centre)).toBeNull();
    expect(decalHit(r, l.centre)).toBeNull();
    // On the black behind the swoosh's point.
    expect(hexAt("body", l.centre)).toBe(BLACK);
  });

  it("stands the nose monogram upright for a viewer ahead of the car: its top toward the cockpit", () => {
    const n = decal("nose-mark");
    expect(decalHit(n, [n.centre[0] + 0.05, n.centre[1] + 0.05 * CAR_FRAME.anchors.noseChassis.slope, n.centre[2]])!.v).toBeGreaterThan(0.5);
  });

  it("puts the rear wing wordmark across the wing, reading from behind", () => {
    const w = decal("wing-wordmark");
    expect(decalHit(w, w.centre)).toEqual({ u: 0.5, v: 0.5 });
    // Its 0.8 m runs across the car (z), its height along it: the top of the artwork points at the nose.
    expect(decalHit(w, [w.centre[0], w.centre[1], w.centre[2] + 0.39])).not.toBeNull();
    expect(decalHit(w, [w.centre[0], w.centre[1], w.centre[2] + 0.41])).toBeNull();
    expect(decalHit(w, [w.centre[0] - 0.03, w.centre[1], w.centre[2]])!.v).toBeGreaterThan(0.5);
  });
});
