import { describe, expect, it } from "vitest";
import { CAR_FRAME } from "./car-frame";
import { DECALS } from "./decals";
import { band, curveOf, flankZ, HALO, mark, standardDecals, tAt, wallHeight, wallW, wordmark, xAt } from "./livery-kit";
import { curveAt, decalHit, regionDistance, SECTION_BOTTOM, SECTION_SHOULDER_Y } from "./livery-paint";
import type { DecalPlacement, Vec3 } from "./livery-spec";

const decals = standardDecals({ word: "white" });
const get = (id: string): DecalPlacement => decals.find((d) => d.id === id)!;

describe("t and x", () => {
  it("are inverses, with t 0 at the nose tip and 1 at the rear wing's trailing edge", () => {
    expect(tAt(CAR_FRAME.nose)).toBe(0);
    expect(tAt(CAR_FRAME.tail)).toBeCloseTo(1, 12);
    for (const t of [0, 0.25, 0.5, 0.73, 1]) expect(tAt(xAt(t))).toBeCloseTo(t, 12);
  });
});

describe("the flank wall", () => {
  it("is as tall as the section says: shoulder minus belly", () => {
    const t = 0.5;
    expect(wallHeight(t)).toBeCloseTo(curveAt(SECTION_SHOULDER_Y, xAt(t)) - curveAt(SECTION_BOTTOM, xAt(t)), 12);
    expect(wallHeight(t)).toBeGreaterThan(0.3);
  });

  it("measures a fraction of it from the belly up, as the wrap coordinate: 1 is the shoulder (0), 0 the belly", () => {
    expect(wallW(0.5, 1)).toBeCloseTo(0, 12);
    expect(wallW(0.5, 0)).toBeCloseTo(-wallHeight(0.5), 12);
    expect(wallW(0.5, 0.25)).toBeCloseTo(-0.75 * wallHeight(0.5), 12);
  });
});

describe("curves", () => {
  it("samples a function at the given ts", () => {
    expect(curveOf([0, 0.5, 1], (t) => t * 2)).toEqual([[0, 0], [0.5, 1], [1, 2]]);
  });

  it("offsets a centre line into a lo and a hi curve", () => {
    const { lo, hi } = band([[0, 0.1], [1, 0.3]], -0.02, 0.03);
    expect(lo[0][1]).toBeCloseTo(0.08, 12);
    expect(lo[1][1]).toBeCloseTo(0.28, 12);
    expect(hi[0][1]).toBeCloseTo(0.13, 12);
    expect(hi[1][1]).toBeCloseTo(0.33, 12);
  });
});

describe("the halo box", () => {
  it("is the halo's bounds, on both sides", () => {
    expect(regionDistance(HALO, [-0.5, 0.85, 0.2])).toBeGreaterThan(0);
    expect(regionDistance(HALO, [-0.5, 0.85, -0.2])).toBeGreaterThan(0);
    // Below the halo's lowest point, or ahead of it, is outside.
    expect(regionDistance(HALO, [-0.5, 0.6, 0.2])).toBeLessThan(0);
    expect(regionDistance(HALO, [-1.2, 0.85, 0.2])).toBeLessThan(0);
  });
});

describe("mark and wordmark sizes", () => {
  it("keep the textures' proportions", () => {
    expect(mark(0.2)[0] / mark(0.2)[1]).toBeCloseTo(DECALS.mark.aspect, 4);
    expect(wordmark(0.9)[0] / wordmark(0.9)[1]).toBeCloseTo(DECALS.wordmark.aspect, 4);
  });
});

describe("standardDecals", () => {
  it("places six: the monogram on the nose and each face of the fin, the wordmark on each flank and the rear wing", () => {
    expect(decals.map((d) => d.id).sort()).toEqual(["fin-mark-left", "fin-mark-right", "flank-wordmark-left", "flank-wordmark-right", "nose-mark", "wing-wordmark"]);
  });

  it("makes the nose monogram 0.27 m tall, on the chassis nose ahead of the cockpit and behind the front wing, and narrow enough for the nose", () => {
    const n = get("nose-mark");
    expect(n.size[1]).toBeCloseTo(0.27, 6);
    expect(n.centre[0]).toBeGreaterThan(CAR_FRAME.parts["front-wing"].FrontEndplateLivery.max[0]);
    expect(n.centre[0]).toBeLessThan(CAR_FRAME.halo.min[0]);
    // Its width is inside the chassis's at its centre.
    const width = curveAt(CAR_FRAME.sections.map((s) => [s[0], s[3]] as const), n.centre[0]) * 2;
    expect(n.size[0]).toBeLessThan(width);
  });

  it("makes the fin monograms 0.22 m, on the blade's two faces at its own tilt, both facing outward", () => {
    for (const s of [1, -1]) {
      const d = get(s > 0 ? "fin-mark-left" : "fin-mark-right");
      expect(d.size[1]).toBeCloseTo(0.22, 6);
      expect(d.centre[2] * s).toBeCloseTo(CAR_FRAME.anchors.finBlade.z, 6);
      expect(Math.sign(d.normal[2])).toBe(s);
      // The face leans in toward the top, so its outward normal points a little up.
      expect(d.normal[1]).toBeGreaterThan(0);
    }
  });

  it("puts the wordmark on its own flank, at the wall's outer face there, reading as a viewer at that side sees it", () => {
    const [l, r] = [get("flank-wordmark-left"), get("flank-wordmark-right")];
    expect(l.centre[2]).toBeCloseTo(flankZ(l.centre[0]), 12);
    expect(r.centre[2]).toBeCloseTo(-flankZ(r.centre[0]), 12);
    const ahead = (d: DecalPlacement, dx: number): Vec3 => [d.centre[0] + dx, d.centre[1], d.centre[2]];
    expect(decalHit(l, ahead(l, 0.2))!.u).toBeGreaterThan(0.5);
    expect(decalHit(r, ahead(r, 0.2))!.u).toBeLessThan(0.5);
    expect(decalHit(l, r.centre)).toBeNull();
  });

  it("takes the wordmark's place on the flank from the livery", () => {
    const high = standardDecals({ word: "white", flankX: 0.1, flankY: 0.5 });
    expect(high.find((d) => d.id === "flank-wordmark-left")!.centre.slice(0, 2)).toEqual([0.1, 0.5]);
    expect(get("flank-wordmark-left").centre[1]).toBeCloseTo(0.335, 12);
  });

  it("fills the marks as asked: none leaves the gradient, one colour for both, or a different one on the nose and the fin", () => {
    expect(get("nose-mark").colour).toBeUndefined();
    const gold = standardDecals({ mark: "gold", word: "gold" });
    expect(gold.filter((d) => d.texture === "mark").map((d) => d.colour)).toEqual(["gold", "gold", "gold"]);
    const split = standardDecals({ nose: "black", fin: "silver", word: "teal" });
    expect(split.find((d) => d.id === "nose-mark")!.colour).toBe("black");
    expect(split.find((d) => d.id === "fin-mark-right")!.colour).toBe("silver");
    expect(split.find((d) => d.id === "wing-wordmark")!.colour).toBe("teal");
  });

  it("gives a finish to every mark when asked, and to none otherwise", () => {
    expect(decals.some((d) => d.finish !== undefined)).toBe(false);
    for (const d of standardDecals({ mark: "ghost", word: "ghost", finish: "gloss" })) expect(d.finish).toBe("gloss");
  });
});
