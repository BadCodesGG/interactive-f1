import { describe, expect, it } from "vitest";
import { GHOST } from "./livery-ghost";
import { POWDER_BLUE } from "./livery-powder-blue";
import { BLACK_GOLD } from "./livery-black-gold";
import { WHITE_STRIPES } from "./livery-white-stripes";
import { ORANGE_BLUE } from "./livery-orange-blue";
import { decalHit, paintAt, toHex } from "./livery-paint";
import { RACING_RED } from "./livery-racing-red";
import { SILVER } from "./livery-silver";
import { FINISHES, type DecalPlacement, type Livery, type LiveryPart, type Vec3 } from "./livery-spec";

/** The sRGB hex a livery paints at a rest-pose position on a part. */
const hex = (l: Livery, part: LiveryPart, p: Vec3) => toHex(paintAt(l, part, p)!.colour);
const finish = (l: Livery, part: LiveryPart, p: Vec3) => paintAt(l, part, p)!.finishName;
const decal = (l: Livery, id: string): DecalPlacement => l.decals.find((d) => d.id === id)!;

// Positions used below, read off car-frame.ts. On the chassis at x = -1.5 (t 0.275): belly 0.287, shoulder y 0.651, half-width
// 0.205, so on the wall (z = 0.205) the wrap coordinate is y - 0.651. At x = -0.274 (t 0.5) the flank is the wall at z 0.68, the
// sidepod top is y 0.585 in from z 0.69. The cover's blade is the spine at z 0 to 0.16, y 0.7 to 1.0, behind x 0.15.
const chassis = (y: number): Vec3 => [-1.5, y, 0.205];
const flank = (y: number): Vec3 => [-0.274, y, 0.68];

const ALL = [POWDER_BLUE, WHITE_STRIPES, BLACK_GOLD, ORANGE_BLUE, SILVER, RACING_RED, GHOST];

describe("every livery", () => {
  it("carries both marks: the monogram on the nose and each face of the fin, the wordmark on each flank and the rear wing", () => {
    for (const l of ALL) {
      expect(l.decals.map((d) => d.id).sort(), l.id).toEqual(["fin-mark-left", "fin-mark-right", "flank-wordmark-left", "flank-wordmark-right", "nose-mark", "wing-wordmark"]);
    }
  });

  it("paints every part, with the colours of its marks resolvable", () => {
    for (const l of ALL) {
      for (const part of ["body", "frontEndplate", "frontWing", "rearWing", "rearEndplate"] as const) expect(l.parts[part], `${l.id} ${part}`).toBeDefined();
      for (const d of l.decals) if (typeof d.colour === "string") expect(l.palette[d.colour] ?? d.colour, `${l.id} ${d.id}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("puts each mark where it hits the surface: the nose top and one face of the blade each", () => {
    for (const l of ALL) {
      const nose = decal(l, "nose-mark");
      expect(decalHit(nose, nose.centre), l.id).toEqual({ u: 0.5, v: 0.5 });
      const left = decal(l, "fin-mark-left");
      const right = decal(l, "fin-mark-right");
      expect(decalHit(left, left.centre), l.id).toEqual({ u: 0.5, v: 0.5 });
      expect(decalHit(left, right.centre), l.id).toBeNull();
      expect(decalHit(right, left.centre), l.id).toBeNull();
    }
  });
});

describe("1. Powder blue and orange", () => {
  it("is powder blue and gloss, with the halo blue", () => {
    expect(hex(POWDER_BLUE, "body", chassis(0.5))).toBe("#8fc6e8");
    expect(finish(POWDER_BLUE, "body", chassis(0.5))).toBe("gloss");
    expect(hex(POWDER_BLUE, "body", [-0.5, 0.85, 0.2])).toBe("#8fc6e8");
  });

  it("runs a 0.32 m orange band down the top centreline from the nose to the end of the fin, navy pinlines either side", () => {
    expect(hex(POWDER_BLUE, "body", [-1.9, 0.66, 0])).toBe("#f47b20");
    expect(hex(POWDER_BLUE, "body", [1.0, 0.92, 0])).toBe("#f47b20");
    expect(hex(POWDER_BLUE, "body", [1.0, 0.6, 0.15])).toBe("#f47b20");
    // Just outside half 0.16: the pinline (0.02 m), then blue.
    expect(hex(POWDER_BLUE, "body", [-1.9, 0.6, 0.17])).toBe("#1c2a44");
    expect(hex(POWDER_BLUE, "body", [-1.9, 0.6, 0.2])).toBe("#8fc6e8");
  });

  it("continues down each sidepod flank as an orange flash on the lower part, t 0.35 to 0.6", () => {
    expect(hex(POWDER_BLUE, "body", flank(0.3))).toBe("#f47b20");
    expect(hex(POWDER_BLUE, "body", [-0.274, 0.3, -0.68])).toBe("#f47b20");
    expect(hex(POWDER_BLUE, "body", flank(0.5))).toBe("#8fc6e8");
    // Behind t 0.6 the flank is blue again.
    expect(hex(POWDER_BLUE, "body", [0.5, 0.3, 0.66])).toBe("#8fc6e8");
  });

  it("puts orange on the endplates and blue on the planes", () => {
    expect(hex(POWDER_BLUE, "frontEndplate", [-2.4, 0.3, 0.8])).toBe("#f47b20");
    expect(hex(POWDER_BLUE, "rearEndplate", [2.4, 0.7, 0.55])).toBe("#f47b20");
    expect(hex(POWDER_BLUE, "frontWing", [-2.5, 0.2, 0.4])).toBe("#8fc6e8");
    expect(hex(POWDER_BLUE, "rearWing", [2.1, 0.9, 0.2])).toBe("#8fc6e8");
  });

  it("draws the marks in navy: the wordmark on blue, the monogram over the orange band", () => {
    for (const d of POWDER_BLUE.decals) expect(d.colour, d.id).toBe("navy");
  });
});

describe("2. White with blue and red stripes", () => {
  it("is white and gloss with white planes and halo, dark blue endplates", () => {
    expect(hex(WHITE_STRIPES, "body", [-2.0, 0.6, 0])).toBe("#f5f5f2");
    expect(finish(WHITE_STRIPES, "body", [-2.0, 0.6, 0])).toBe("gloss");
    expect(hex(WHITE_STRIPES, "body", [-0.5, 0.85, 0.2])).toBe("#f5f5f2");
    expect(hex(WHITE_STRIPES, "frontWing", [-2.5, 0.2, 0.4])).toBe("#f5f5f2");
    expect(hex(WHITE_STRIPES, "rearWing", [2.1, 0.9, 0.2])).toBe("#f5f5f2");
    expect(hex(WHITE_STRIPES, "frontEndplate", [-2.4, 0.3, 0.8])).toBe("#0d2a5c");
    expect(hex(WHITE_STRIPES, "rearEndplate", [2.4, 0.7, 0.55])).toBe("#0d2a5c");
  });

  it("runs dark blue, light blue and red stripes down the chassis side, in that order from the top, with white gaps", () => {
    expect(hex(WHITE_STRIPES, "body", chassis(0.541))).toBe("#0d2a5c");
    expect(hex(WHITE_STRIPES, "body", chassis(0.501))).toBe("#f5f5f2");
    expect(hex(WHITE_STRIPES, "body", chassis(0.471))).toBe("#3f9fd8");
    expect(hex(WHITE_STRIPES, "body", chassis(0.44))).toBe("#f5f5f2");
    expect(hex(WHITE_STRIPES, "body", chassis(0.408))).toBe("#d9272e");
    // Above and below the pack the chassis is white.
    expect(hex(WHITE_STRIPES, "body", chassis(0.6))).toBe("#f5f5f2");
    expect(hex(WHITE_STRIPES, "body", chassis(0.3))).toBe("#f5f5f2");
  });

  it("sweeps the stripes up over the sidepod's top and along the cover's side, leaving the flank white for the wordmark", () => {
    expect(hex(WHITE_STRIPES, "body", [0.5, 0.5, 0.4])).toBe("#3f9fd8");
    expect(hex(WHITE_STRIPES, "body", [0.5, 0.5, 0.3])).toBe("#0d2a5c");
    expect(hex(WHITE_STRIPES, "body", flank(0.36))).toBe("#f5f5f2");
    expect(hex(WHITE_STRIPES, "body", [0.2, 0.36, 0.68])).toBe("#f5f5f2");
    expect(hex(WHITE_STRIPES, "body", [1.0, 0.95, 0])).toBe("#f5f5f2");
  });

  it("draws both monograms and the wordmark dark blue", () => {
    for (const d of WHITE_STRIPES.decals) expect(d.colour, d.id).toBe("dark");
  });
});

describe("3. Black and gold", () => {
  it("is gloss black, halo and planes included", () => {
    expect(hex(BLACK_GOLD, "body", [-1.0, 0.9, 0.05])).toBe("#0b0b0c");
    expect(finish(BLACK_GOLD, "body", [-1.0, 0.9, 0.05])).toBe("gloss");
    expect(hex(BLACK_GOLD, "frontWing", [-2.5, 0.2, 0.4])).toBe("#0b0b0c");
    expect(hex(BLACK_GOLD, "rearWing", [2.1, 0.9, 0.2])).toBe("#0b0b0c");
  });

  it("runs a 0.012 m gold pinstripe along the chassis shoulder and the sidepod's top edge", () => {
    expect(hex(BLACK_GOLD, "body", chassis(0.639))).toBe("#c9a44c");
    expect(hex(BLACK_GOLD, "body", chassis(0.6))).toBe("#0b0b0c");
    expect(hex(BLACK_GOLD, "body", [-0.3, 0.585, 0.69])).toBe("#c9a44c");
    expect(hex(BLACK_GOLD, "body", [0, 0.56, 0.7])).toBe("#c9a44c");
  });

  it("wraps the sidepod's inlet edge with a vertical line", () => {
    expect(hex(BLACK_GOLD, "body", [-0.724, 0.5, 0.5])).toBe("#c9a44c");
    expect(hex(BLACK_GOLD, "body", [-0.7, 0.5, 0.5])).toBe("#0b0b0c");
  });

  it("outlines the engine cover's spine twice, one line 0.02 m inside the other", () => {
    expect(hex(BLACK_GOLD, "body", [1.0, 0.86, 0.11])).toBe("#c9a44c");
    expect(hex(BLACK_GOLD, "body", [1.0, 0.86, 0.113])).toBe("#0b0b0c");
    expect(hex(BLACK_GOLD, "body", [1.0, 0.9, 0.0])).toBe("#0b0b0c");
    // The inner line, at |z| 0.068 to 0.08.
    expect(hex(BLACK_GOLD, "body", [1.0, 0.9, 0.072])).toBe("#c9a44c");
  });

  it("puts a second line 0.02 m inside the first on the nose", () => {
    // The nose shoulder line is at w -0.012 and the second at +0.02 (t 0.111 is x -2.4: yS 0.465, zS 0.16).
    expect(hex(BLACK_GOLD, "body", [-2.4, 0.453, 0.16])).toBe("#c9a44c");
    expect(hex(BLACK_GOLD, "body", [-2.4, 0.465, 0.14])).toBe("#c9a44c");
    expect(hex(BLACK_GOLD, "body", [-2.4, 0.465, 0.1])).toBe("#0b0b0c");
  });

  it("puts a gold pinstripe just inside every endplate edge, and none elsewhere on the plate", () => {
    expect(hex(BLACK_GOLD, "rearEndplate", [2.44, 0.6, 0.56])).toBe("#c9a44c");
    expect(hex(BLACK_GOLD, "rearEndplate", [2.2, 0.6, 0.55])).toBe("#0b0b0c");
    expect(hex(BLACK_GOLD, "frontEndplate", [-2.108, 0.3, 0.8])).toBe("#c9a44c");
    expect(hex(BLACK_GOLD, "frontEndplate", [-2.4, 0.25, 0.8])).toBe("#0b0b0c");
  });

  it("draws both marks in gold", () => {
    for (const d of BLACK_GOLD.decals) expect(d.colour, d.id).toBe("gold");
  });
});

describe("4. Orange and blue", () => {
  it("is orange-blue and matte on the top and the upper flank", () => {
    expect(hex(ORANGE_BLUE, "body", [-0.274, 0.585, 0.3])).toBe("#ff8000");
    expect(hex(ORANGE_BLUE, "body", flank(0.45))).toBe("#ff8000");
    expect(finish(ORANGE_BLUE, "body", flank(0.45))).toBe("matte");
    expect(hex(ORANGE_BLUE, "body", [-0.5, 0.85, 0.2])).toBe("#ff8000");
  });

  it("is blue on the sidepod's undercut and the nose's underside", () => {
    expect(hex(ORANGE_BLUE, "body", flank(0.2))).toBe("#2f6db5");
    expect(hex(ORANGE_BLUE, "body", flank(0.3))).toBe("#2f6db5");
    expect(hex(ORANGE_BLUE, "body", [-3.0, 0.15, 0.05])).toBe("#2f6db5");
  });

  it("holds the split at a fraction of the flank wall", () => {
    // Wall fraction 0.34 from t 0.35: a point at 0.32 of the wall is blue at t 0.5, one at 0.36 is orange-blue.
    const at = (f: number): Vec3 => [-0.274, 0.19 + f * (0.585 - 0.19), 0.68];
    expect(hex(ORANGE_BLUE, "body", at(0.32))).toBe("#2f6db5");
    expect(hex(ORANGE_BLUE, "body", at(0.36))).toBe("#ff8000");
  });

  it("makes the fin's trailing third blue", () => {
    expect(hex(ORANGE_BLUE, "body", [1.5, 0.7, 0.1])).toBe("#2f6db5");
    expect(hex(ORANGE_BLUE, "body", [1.2, 0.6, 0.1])).toBe("#ff8000");
  });

  it("paints orange-blue flaps and rear planes, black main plane, black rear endplates with a blue top edge", () => {
    expect(hex(ORANGE_BLUE, "frontEndplate", [-2.4, 0.3, 0.8])).toBe("#ff8000");
    expect(hex(ORANGE_BLUE, "frontWing", [-2.5, 0.2, 0.4])).toBe("#141414");
    expect(hex(ORANGE_BLUE, "rearWing", [2.1, 0.9, 0.2])).toBe("#ff8000");
    expect(hex(ORANGE_BLUE, "rearEndplate", [2.4, 0.6, 0.55])).toBe("#141414");
    expect(hex(ORANGE_BLUE, "rearEndplate", [2.4, 0.92, 0.55])).toBe("#2f6db5");
  });

  it("draws both marks in black", () => {
    for (const d of ORANGE_BLUE.decals) expect(d.colour, d.id).toBe("black");
  });
});

describe("5. Silver to black with teal", () => {
  it("is silver and metallic from the nose to t 0.3", () => {
    expect(hex(SILVER, "body", [-2.4, 0.5, 0.15])).toBe("#c5c9ce");
    expect(paintAt(SILVER, "body", [-2.4, 0.5, 0.15])!.finish).toEqual(FINISHES.metallic);
    expect(hex(SILVER, "body", [-1.7, 0.62, 0.19])).toBe("#c5c9ce");
  });

  it("fades through graphite to black by t 0.6 and is black and matte behind", () => {
    // t 0.459, past graphite (t 0.45) on the way to black.
    expect(hex(SILVER, "body", [-0.5, 0.6, 0.5])).toBe("#292c30");
    expect(finish(SILVER, "body", [-0.5, 0.6, 0.5])).toBe("satin");
    expect(hex(SILVER, "body", [0.5, 0.7, 0.3])).toBe("#0e0f11");
    expect(finish(SILVER, "body", [0.5, 0.7, 0.3])).toBe("matte");
    expect(hex(SILVER, "body", [1.3, 0.6, 0.1])).toBe("#0e0f11");
  });

  it("steps the finish metallic, satin, matte as the paint fades", () => {
    expect(finish(SILVER, "body", [-1.5, 0.68, 0.1])).toBe("metallic");
    expect(finish(SILVER, "body", [-0.9, 0.68, 0.1])).toBe("satin");
    expect(finish(SILVER, "body", [-0.1, 0.55, 0.4])).toBe("matte");
  });

  it("traces the sidepod's top edge with a 0.03 m teal line, and paints the halo black", () => {
    expect(hex(SILVER, "body", [-0.3, 0.585, 0.69])).toBe("#00a19b");
    expect(hex(SILVER, "body", [-0.3, 0.55, 0.69])).not.toBe("#00a19b");
    expect(hex(SILVER, "body", [-0.5, 0.85, 0.2])).toBe("#0e0f11");
  });

  it("marks the front endplates' top edge and the rear wing's trailing edge in teal", () => {
    expect(hex(SILVER, "frontEndplate", [-2.4, 0.38, 0.8])).toBe("#00a19b");
    expect(hex(SILVER, "frontEndplate", [-2.4, 0.2, 0.8])).toBe("#c5c9ce");
    expect(hex(SILVER, "rearWing", [2.32, 0.9, 0.2])).toBe("#00a19b");
    expect(hex(SILVER, "rearWing", [2.1, 0.9, 0.2])).toBe("#0e0f11");
  });

  it("draws the monogram black on the silver nose and silver on the black fin, the wordmark teal", () => {
    expect(decal(SILVER, "nose-mark").colour).toBe("black");
    expect(decal(SILVER, "fin-mark-left").colour).toBe("silver");
    expect(decal(SILVER, "fin-mark-right").colour).toBe("silver");
    expect(decal(SILVER, "flank-wordmark-left").colour).toBe("teal");
    // Each sits on what it was chosen for.
    expect(hex(SILVER, "body", decal(SILVER, "nose-mark").centre)).toBe("#c5c9ce");
    expect(hex(SILVER, "body", decal(SILVER, "fin-mark-left").centre)).toBe("#0e0f11");
  });
});

describe("6. Racing red", () => {
  it("is racing-red and matte", () => {
    expect(hex(RACING_RED, "body", [-2.0, 0.5, 0.1])).toBe("#c8102e");
    expect(finish(RACING_RED, "body", [-2.0, 0.5, 0.1])).toBe("matte");
    expect(hex(RACING_RED, "frontEndplate", [-2.4, 0.3, 0.8])).toBe("#c8102e");
    expect(hex(RACING_RED, "rearEndplate", [2.4, 0.7, 0.55])).toBe("#c8102e");
  });

  it("has a white nose tip to t 0.06", () => {
    expect(hex(RACING_RED, "body", [-2.9, 0.3, 0])).toBe("#f2f2f2");
    expect(hex(RACING_RED, "body", [-2.75, 0.35, 0.1])).toBe("#f2f2f2");
    expect(hex(RACING_RED, "body", [-2.6, 0.35, 0.1])).toBe("#c8102e");
  });

  it("wraps a 0.14 m white band over the top of the car just ahead of the fin, down to the shoulder line and no further", () => {
    expect(hex(RACING_RED, "body", [0.38, 0.7, 0])).toBe("#f2f2f2");
    expect(hex(RACING_RED, "body", [0.52, 0.7, 0])).toBe("#f2f2f2");
    expect(hex(RACING_RED, "body", [0.37, 0.7, 0])).toBe("#c8102e");
    expect(hex(RACING_RED, "body", [0.53, 0.7, 0])).toBe("#c8102e");
    // It runs out over the sidepod tops to the shoulder (y 0.496 at x 0.45), and the flank wall below is racing-red.
    expect(hex(RACING_RED, "body", [0.45, 0.55, 0.6])).toBe("#f2f2f2");
    expect(hex(RACING_RED, "body", [0.45, 0.5, 0.65])).toBe("#f2f2f2");
    expect(hex(RACING_RED, "body", [0.45, 0.4, 0.66])).toBe("#c8102e");
  });

  it("is black on the sidepod's undercut below 30 percent of the body's height (y 0.372), and the halo black", () => {
    expect(hex(RACING_RED, "body", flank(0.36))).toBe("#101010");
    expect(hex(RACING_RED, "body", flank(0.4))).toBe("#c8102e");
    expect(hex(RACING_RED, "body", [-0.5, 0.85, 0.2])).toBe("#101010");
    // The nose is below that height too, but the undercut starts at the sidepod (t 0.3).
    expect(hex(RACING_RED, "body", [-2.0, 0.34, 0.1])).toBe("#c8102e");
  });

  it("has a black main plane on the front wing and a racing-red upper flap over a black main plane on the rear", () => {
    expect(hex(RACING_RED, "frontWing", [-2.5, 0.2, 0.4])).toBe("#101010");
    expect(hex(RACING_RED, "rearWing", [2.1, 0.93, 0.2])).toBe("#c8102e");
    expect(hex(RACING_RED, "rearWing", [2.1, 0.82, 0.2])).toBe("#101010");
  });

  it("draws both marks in white", () => {
    for (const d of RACING_RED.decals) expect(d.colour, d.id).toBe("white");
  });
});

describe("7. Ghost", () => {
  it("is matte black, with matte black wings and halo and graphite endplates", () => {
    expect(hex(GHOST, "body", flank(0.4))).toBe("#121314");
    expect(finish(GHOST, "body", flank(0.4))).toBe("matte");
    expect(hex(GHOST, "frontWing", [-2.5, 0.2, 0.4])).toBe("#121314");
    expect(hex(GHOST, "rearWing", [2.1, 0.9, 0.2])).toBe("#121314");
    expect(hex(GHOST, "frontEndplate", [-2.4, 0.3, 0.8])).toBe("#26282b");
    expect(hex(GHOST, "rearEndplate", [2.4, 0.7, 0.55])).toBe("#26282b");
  });

  it("is satin black on the sidepod tops and the engine cover, so the split shows only as sheen", () => {
    const top = paintAt(GHOST, "body", [-0.274, 0.585, 0.3])!;
    expect(toHex(top.colour)).toBe("#0c0d0e");
    expect(top.finishName).toBe("satin");
    expect(finish(GHOST, "body", [1.0, 0.9, 0])).toBe("satin");
    expect(finish(GHOST, "body", flank(0.4))).toBe("matte");
    // The halo is matte again.
    expect(finish(GHOST, "body", [-0.5, 0.85, 0.2])).toBe("matte");
  });

  it("has a 0.01 m graphite pinline along the chassis shoulder", () => {
    expect(hex(GHOST, "body", [-1.5, 0.645, 0.2])).toBe("#26282b");
    expect(hex(GHOST, "body", [-1.5, 0.64, 0.205])).toBe("#121314");
    expect(hex(GHOST, "body", [-1.5, 0.68, 0.1])).toBe("#121314");
  });

  it("draws every mark ghost grey in the gloss finish over the matte body: the logos are about finish, not colour", () => {
    for (const d of GHOST.decals) {
      expect(d.colour, d.id).toBe("ghost");
      expect(d.finish, d.id).toBe("gloss");
    }
    expect(GHOST.palette.ghost).toBe("#3a3d42");
  });
});
