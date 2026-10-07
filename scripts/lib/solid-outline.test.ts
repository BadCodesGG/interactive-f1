import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { DECALS } from "../../src/models/f1/decals";
import { fillOutlinedGlyphs } from "./solid-outline.mjs";

const W = 80;
const H = 30;

/** A mask with an outlined letter (a ring with a second ring round its counter) at columns 5 to 35, and a solid block with a hole at 45 to 70. */
function mask(): Uint8Array {
  const a = new Uint8Array(W * H);
  const ring = (x0: number, y0: number, x1: number, y1: number, t: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (x < x0 + t || x >= x1 - t || y < y0 + t || y >= y1 - t) a[y * W + x] = 255;
  };
  ring(5, 3, 35, 27, 2); // the letter's outline
  ring(14, 10, 26, 20, 2); // the outline round its counter
  for (let y = 3; y < 27; y++) for (let x = 45; x < 70; x++) a[y * W + x] = 255; // a solid letter
  for (let y = 10; y < 20; y++) for (let x = 52; x < 62; x++) a[y * W + x] = 0; // its counter
  return a;
}
const at = (a: Uint8Array, x: number, y: number) => a[y * W + x];

describe("fillOutlinedGlyphs", () => {
  it("fills the body of an outlined letter and leaves its counter and the outside empty", () => {
    const a = mask();
    expect(at(a, 9, 15)).toBe(0);
    expect(fillOutlinedGlyphs(a, W, H, { from: 0, to: 40 })).toBe(1);
    expect(at(a, 9, 15)).toBe(255); // the body between the two rings
    expect(at(a, 20, 15)).toBe(0); // the counter, inside the second ring
    expect(at(a, 0, 0)).toBe(0);
    expect(at(a, 40, 15)).toBe(0);
  });

  it("leaves a solid letter's counter alone when it lies outside the span", () => {
    const a = mask();
    fillOutlinedGlyphs(a, W, H, { from: 0, to: 40 });
    expect(at(a, 56, 15)).toBe(0);
    expect(at(a, 47, 15)).toBe(255);
  });

  it("only fills what lies in the span", () => {
    const a = mask();
    expect(fillOutlinedGlyphs(a, W, H, { from: 40, to: 80 })).toBe(1); // the solid letter's hole is the only region in the span
    expect(at(a, 9, 15)).toBe(0);
  });

  it("makes a stroke's antialiased inner rim solid and keeps its outer rim as it was", () => {
    const a = mask();
    a[15 * W + 7] = 200; // the ring's inner-side pixel, between the stroke and the body
    a[15 * W + 5] = 200; // its outer edge
    fillOutlinedGlyphs(a, W, H, { from: 0, to: 40 });
    expect(at(a, 7, 15)).toBe(255);
    expect(at(a, 5, 15)).toBe(200);
  });
});

describe("the built wordmark texture", () => {
  it("has 'codes' as solid letters and 'bad' as it was, counters open in both", async () => {
    const file = path.join(__dirname, "..", "..", "public", DECALS.wordmark.url);
    const { data, info } = await sharp(readFileSync(file)).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
    const alpha = (x: number, y: number) => data[y * info.width + x];
    expect(info.width).toBe(DECALS.wordmark.width);
    expect(alpha(435, 120)).toBe(255); // the body of the 'c'
    expect(alpha(525, 117)).toBe(255); // the 'o'
    expect(alpha(720, 60)).toBe(255); // the 'd''s stem
    expect(alpha(565, 117)).toBe(0); // the 'o''s counter
    expect(alpha(668, 118)).toBe(0); // the 'd''s counter
    expect(alpha(60, 100)).toBe(0); // the 'b''s counter, in the solid word
    expect(alpha(5, 5)).toBe(0);
  });
});
