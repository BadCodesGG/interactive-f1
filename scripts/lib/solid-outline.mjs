/**
 * Fills outlined letters in a one-channel mask. The BadCodes wordmark sets "bad" solid and "codes" as an
 * outline (a ring per letter, a second ring round each counter), so filled with one colour "codes" reads
 * as a faint line drawing next to a solid "bad". This finds the transparent regions that sit inside one
 * outline ring, and no deeper, and makes them opaque; a counter (inside the second ring) stays empty.
 *
 * The mask is split into 4-connected regions of opaque (alpha 128 or more) and transparent pixels. The
 * region touching the corner is the outside; every other region's depth is its number of region
 * boundaries from the outside. A transparent region at depth 2 is the body of an outlined letter; at
 * depth 4 it is a counter in one. Solid letters have their counters at depth 2 too, so only regions
 * whose centre lies in [from, to) columns are filled: the caller picks the span of the outlined word.
 * Filled pixels become 255, and so does a stroke pixel that touches one (the stroke's antialiased inner
 * rim, which would otherwise show as a faint seam inside the letter); the outer rim keeps its antialiasing.
 */
export function fillOutlinedGlyphs(alpha, width, height, { from, to }) {
  const n = width * height;
  const label = new Int32Array(n).fill(-1);
  const regions = []; // { opaque, minX, maxX, pixels: number[] }
  const stack = [];
  for (let start = 0; start < n; start++) {
    if (label[start] !== -1) continue;
    const opaque = alpha[start] >= 128;
    const id = regions.length;
    const region = { opaque, minX: width, maxX: 0, pixels: [] };
    regions.push(region);
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop();
      region.pixels.push(p);
      const x = p % width;
      if (x < region.minX) region.minX = x;
      if (x > region.maxX) region.maxX = x;
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p >= width ? p - width : -1, p < n - width ? p + width : -1]) {
        if (q >= 0 && label[q] === -1 && alpha[q] >= 128 === opaque) {
          label[q] = id;
          stack.push(q);
        }
      }
    }
  }

  // Which regions touch which: breadth first from the outside region gives each its depth.
  const next = regions.map(() => new Set());
  for (let p = 0; p < n; p++) {
    const x = p % width;
    for (const q of [x < width - 1 ? p + 1 : -1, p < n - width ? p + width : -1]) {
      if (q < 0 || label[p] === label[q]) continue;
      next[label[p]].add(label[q]);
      next[label[q]].add(label[p]);
    }
  }
  const depth = new Array(regions.length).fill(-1);
  depth[label[0]] = 0;
  for (const queue = [label[0]]; queue.length; ) {
    const r = queue.shift();
    for (const s of next[r]) {
      if (depth[s] !== -1) continue;
      depth[s] = depth[r] + 1;
      queue.push(s);
    }
  }

  const inside = new Uint8Array(n);
  let filled = 0;
  regions.forEach((r, i) => {
    const centre = (r.minX + r.maxX) / 2;
    if (!r.opaque && depth[i] === 2 && centre >= from && centre < to) {
      for (const p of r.pixels) {
        alpha[p] = 255;
        inside[p] = 1;
      }
      filled++;
    }
  });
  for (let p = 0; p < n; p++) {
    if (alpha[p] === 255 || alpha[p] < 128) continue;
    const x = p % width;
    if ((x > 0 && inside[p - 1]) || (x < width - 1 && inside[p + 1]) || (p >= width && inside[p - width]) || (p < n - width && inside[p + width])) alpha[p] = 255;
  }
  return filled;
}
