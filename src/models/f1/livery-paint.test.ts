import { describe, expect, it } from "vitest";
import { CAR_FRAME } from "./car-frame";
import { FINISHES, type DecalPlacement, type Livery } from "./livery-spec";
import { curveAt, decalHit, paintAt, regionDistance, tOf, toHex, wrapCoord, type Rgb } from "./livery-paint";

/** A small livery with one of each rule, on round numbers: black gloss, a red satin swoosh with a white border. */
const TEST: Livery = {
  id: "test",
  name: "Test",
  palette: { ink: "#000000", red: "#ff0000", white: "#ffffff" },
  parts: {
    body: {
      colour: "ink",
      finish: "gloss",
      layers: [
        { colour: "red", finish: "satin", region: { kind: "swoosh", from: 0.3, to: 0.7, lo: [[0.3, -0.1], [0.7, -0.1]], hi: [[0.3, 0.1], [0.7, 0.1]] }, edge: { width: 0.015, colour: "white" } },
        { colour: "white", region: { kind: "box", min: [-3, 0.7, 0], max: [-2, 2, 0.4], mirror: true } },
      ],
    },
    frontEndplate: { colour: { ramp: [[0, "#ffd000"], [1, "#e63312"]] }, finish: "matte" },
  },
  decals: [],
};

const hex = (c: Rgb) => toHex(c);
/** The body's section at x = 0 (car-frame.ts): shoulder at y 0.547, half-width 0.698, belly at 0.125. */
const at0 = (y: number, z: number) => [0, y, z] as const;

describe("the car frame", () => {
  it("puts t at 0 on the nose tip and 1 on the rear wing's trailing edge", () => {
    expect(tOf(-3.004)).toBeCloseTo(0, 6);
    expect(tOf(2.456)).toBeCloseTo(1, 6);
    expect(tOf(-0.274)).toBeCloseTo(0.5, 6);
  });

  it("measures the F226 as 5.46 m long and 1.4 m wide over the body", () => {
    expect(CAR_FRAME.tail - CAR_FRAME.nose).toBeCloseTo(5.46, 2);
    expect(CAR_FRAME.body.max[2] - CAR_FRAME.body.min[2]).toBeCloseTo(1.436, 2);
  });
});

describe("curveAt", () => {
  const c = [[0, 0], [1, 2], [3, 2]] as const;
  it("interpolates between control points and holds flat beyond the ends", () => {
    expect(curveAt(c, 0.5)).toBe(1);
    expect(curveAt(c, 2)).toBe(2);
    expect(curveAt(c, -4)).toBe(0);
    expect(curveAt(c, 9)).toBe(2);
  });
});

describe("wrapCoord", () => {
  it("is zero on the shoulder line, and the same on both flanks", () => {
    expect(wrapCoord(at0(0.547, 0.698))).toBeCloseTo(0, 6);
    expect(wrapCoord(at0(0.547, -0.698))).toBeCloseTo(0, 6);
  });

  it("counts metres down a flank as negative and metres in along the top as positive", () => {
    expect(wrapCoord(at0(0.347, 0.698))).toBeCloseTo(-0.2, 2);
    expect(wrapCoord(at0(0.547, 0.298))).toBeCloseTo(0.4, 6);
    expect(wrapCoord(at0(0.547, -0.298))).toBeCloseTo(0.4, 6);
  });

  it("carries on negative around the belly instead of coming back up the far side of the section", () => {
    expect(wrapCoord(at0(0.125, 0.298))).toBeCloseTo(-0.4 + (0.125 - 0.547), 6);
  });
});

describe("regionDistance", () => {
  it("is signed metres, positive inside", () => {
    expect(regionDistance({ kind: "tBand", from: 0.4, to: 0.6 }, [-0.274, 0.3, 0])).toBeCloseTo(0.1 * 5.46, 2);
    expect(regionDistance({ kind: "tBand", from: 0.4, to: 0.6 }, [-3, 0.3, 0])).toBeLessThan(0);
    const box = { kind: "box", min: [0, 0, 0], max: [1, 1, 1] } as const;
    expect(regionDistance(box, [0.5, 0.5, 0.5])).toBeCloseTo(0.5, 6);
    expect(regionDistance(box, [1.2, 0.5, 0.5])).toBeCloseTo(-0.2, 6);
  });

  it("tests |z| for a mirrored box, so both flanks match", () => {
    const box = { kind: "box", min: [0, 0, 0], max: [1, 1, 0.5], mirror: true } as const;
    expect(regionDistance(box, [0.5, 0.5, -0.3])).toBeCloseTo(0.2, 6);
    expect(regionDistance(box, [0.5, 0.5, 0.3])).toBeCloseTo(0.2, 6);
  });

  it("measures a centre band as metres inside |z| = half, both sides alike, and along t between its ends", () => {
    const region = { kind: "centre", from: 0.2, to: 0.8, half: 0.16 } as const;
    expect(regionDistance(region, [0, 0.9, 0.1])).toBeCloseTo(0.06, 6);
    expect(regionDistance(region, [0, 0.9, -0.1])).toBeCloseTo(0.06, 6);
    expect(regionDistance(region, [0, 0.9, 0.2])).toBeCloseTo(-0.04, 6);
    // Ahead of its start the distance is the along-car one: x -2.4 is t 0.111, 0.089 of the car short of 0.2.
    expect(regionDistance(region, [-2.4, 0.5, 0])).toBeCloseTo((0.111 - 0.2) * 5.46, 1);
  });

  it("measures a height line as a fraction of the body's height, in metres", () => {
    // Body y runs 0.094 to 1.022: half height is 0.558. A line at 0.5 puts the point 0.05 m below it.
    const region = { kind: "heightBelow", line: [[0, 0.5], [1, 0.5]] } as const;
    expect(regionDistance(region, [0, 0.558 - 0.05, 0])).toBeCloseTo(0.05, 3);
    expect(regionDistance(region, [0, 0.558 + 0.05, 0])).toBeCloseTo(-0.05, 3);
  });
});

describe("paintAt: the swoosh", () => {
  // x = -0.274 is t 0.5, the middle of the swoosh's length; the section there is close to the x = -0.3 station.
  const x = -0.274;
  const yS = curveAt(CAR_FRAME.sections.map((s) => [s[0], s[2]] as const), x);
  const zS = curveAt(CAR_FRAME.sections.map((s) => [s[0], s[3]] as const), x);
  const flank = (drop: number) => [x, yS - drop, zS] as const;

  it("paints the swoosh red and satin inside it", () => {
    const p = paintAt(TEST, "body", flank(0.05))!;
    expect(hex(p.colour)).toBe("#ff0000");
    expect(p.finishName).toBe("satin");
    expect(p.finish).toEqual(FINISHES.satin);
  });

  it("leaves the body black and gloss below it", () => {
    const p = paintAt(TEST, "body", flank(0.3))!;
    expect(hex(p.colour)).toBe("#000000");
    expect(p.finish).toEqual(FINISHES.gloss);
  });

  it("draws a white border of the stated width just outside the edge, and nothing beyond it", () => {
    // The lower edge is at w = -0.1: 0.1 m below the shoulder on a flank.
    expect(hex(paintAt(TEST, "body", flank(0.105))!.colour)).toBe("#ffffff");
    expect(hex(paintAt(TEST, "body", flank(0.114))!.colour)).toBe("#ffffff");
    expect(hex(paintAt(TEST, "body", flank(0.12))!.colour)).toBe("#000000");
    expect(hex(paintAt(TEST, "body", flank(0.095))!.colour)).toBe("#ff0000");
    // The border keeps the body's finish: it is a line, not a zone of its own.
    expect(paintAt(TEST, "body", flank(0.105))!.finishName).toBe("gloss");
  });

  it("is the same on the far flank", () => {
    expect(hex(paintAt(TEST, "body", [x, yS - 0.05, -zS])!.colour)).toBe("#ff0000");
  });

  it("stops at its ends along the car", () => {
    // t 0.3 is 1.638 m behind the nose tip; the nose (t 0.05) is well ahead of it.
    expect(hex(paintAt(TEST, "body", [-2.73, 0.4, 0.15])!.colour)).toBe("#000000");
  });
});

describe("paintAt: the other rules", () => {
  it("lets a later layer win: the box paints white over the swoosh's black on the nose tip", () => {
    // The box is x -3 to -2, y from 0.7 up, |z| to 0.4: the halo-style override.
    expect(hex(paintAt(TEST, "body", [-2.5, 0.8, -0.2])!.colour)).toBe("#ffffff");
    expect(hex(paintAt(TEST, "body", [-2.5, 0.6, -0.2])!.colour)).toBe("#000000");
  });

  it("blends a ramp along t in linear light, from the first stop at the nose to the last at the tail", () => {
    expect(hex(paintAt(TEST, "frontEndplate", [-3.004, 0.3, 0])!.colour)).toBe("#ffd000");
    expect(hex(paintAt(TEST, "frontEndplate", [2.456, 0.3, 0])!.colour)).toBe("#e63312");
    // Halfway in linear light is (243, 156, 10) in sRGB, brighter than the (242, 121, 9) an sRGB blend would give.
    expect(hex(paintAt(TEST, "frontEndplate", [-0.274, 0.3, 0])!.colour)).toBe("#f39c0a");
  });

  it("gives each part its own finish and answers null for a part the livery does not paint", () => {
    expect(paintAt(TEST, "frontEndplate", [-2.5, 0.3, 0])!.finishName).toBe("matte");
    expect(paintAt(TEST, "body", [-2.5, 0.3, 0])!.finishName).toBe("gloss");
    expect(paintAt(TEST, "rearWing", [2, 0.9, 0])).toBeNull();
  });

  it("refuses a colour that is neither a palette key nor hex", () => {
    const bad: Livery = { ...TEST, parts: { body: { colour: "nope", finish: "gloss" } } };
    expect(() => paintAt(bad, "body", [0, 0.3, 0])).toThrow(/#rrggbb/);
  });
});

describe("decalHit", () => {
  const flank = (side: 1 | -1): DecalPlacement => ({
    id: "f",
    texture: "wordmark",
    part: "body",
    centre: [0, 0.4, 0.7 * side],
    normal: [0, 0, side],
    up: [0, 1, 0],
    size: [0.9, 0.2],
    depth: 0.03,
  });

  it("maps the centre to (0.5, 0.5) and the top edge to v = 1", () => {
    expect(decalHit(flank(1), [0, 0.4, 0.7])).toEqual({ u: 0.5, v: 0.5 });
    expect(decalHit(flank(1), [0, 0.5, 0.7])!.v).toBeCloseTo(1, 6);
  });

  it("reads left to right for a viewer on either side: nose to tail on the near flank, tail to nose on the far one", () => {
    // Viewed from +z (the car's nose, at -x, on the viewer's left) u grows toward the tail; from -z the nose is on the right, so u grows toward the nose.
    expect(decalHit(flank(1), [0.3, 0.4, 0.7])!.u).toBeGreaterThan(0.5);
    expect(decalHit(flank(-1), [0.3, 0.4, -0.7])!.u).toBeLessThan(0.5);
    expect(decalHit(flank(-1), [-0.3, 0.4, -0.7])!.u).toBeGreaterThan(0.5);
  });

  it("clips to its box: along, up and through the surface", () => {
    expect(decalHit(flank(1), [0.46, 0.4, 0.7])).toBeNull();
    expect(decalHit(flank(1), [0, 0.51, 0.7])).toBeNull();
    expect(decalHit(flank(1), [0, 0.4, 0.66])).toBeNull();
    // A point on the far flank never picks up the near flank's decal.
    expect(decalHit(flank(1), [0, 0.4, -0.7])).toBeNull();
  });

  it("drops a face turned away when a facing threshold and a surface normal are given", () => {
    const d = { ...flank(1), facing: 0.3 };
    expect(decalHit(d, [0, 0.4, 0.7], [0, 0, 1])).not.toBeNull();
    expect(decalHit(d, [0, 0.4, 0.7], [0, 0, -1])).toBeNull();
    expect(decalHit(d, [0, 0.4, 0.7])).not.toBeNull();
  });

  it("takes its up direction from the artwork's top: a top-facing decal with up = -x reads from behind the car", () => {
    const top: DecalPlacement = { ...flank(1), centre: [0, 0.5, 0], normal: [0, 1, 0], up: [-1, 0, 0], size: [0.24, 0.18], depth: 0.05 };
    // The artwork's top points at the nose: moving toward the nose raises v.
    expect(decalHit(top, [-0.05, 0.5, 0])!.v).toBeGreaterThan(0.5);
    // Its right (up x normal) is -z: moving toward -z raises u.
    expect(decalHit(top, [0, 0.5, -0.05])!.u).toBeGreaterThan(0.5);
  });
});
