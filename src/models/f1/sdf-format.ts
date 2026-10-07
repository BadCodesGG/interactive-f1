/**
 * The wind tunnel's signed distance field file: the assembled car's distance to its surface on a
 * regular grid, in metres, written by scripts/build-sdf.mjs and read by the tunnel's flow shader.
 *
 * Layout: a little-endian u32 with the header's byte length, the header as UTF-8 JSON padded with
 * spaces to a multiple of 4, then one byte per cell (x fastest, then y, then z, the order a
 * Data3DTexture expects). A byte b stores d = (b / 255 - 0.5) * 2 * range, so 0.5 is the surface,
 * lower is inside and distances beyond +-range clamp.
 *
 * No imports and only erasable TypeScript, so the Node bake script can import it directly.
 */

export type Vec3 = [number, number, number];

export interface SdfHeader {
  version: 1;
  /** Cells along x, y and z. Samples sit at cell centres. */
  dims: Vec3;
  /** The grid box in world metres. */
  min: Vec3;
  max: Vec3;
  /** Distance, metres, that the byte range spans on each side of the surface. */
  range: number;
  /** The GLB the field was baked from. */
  model: string;
}

export interface Sdf {
  header: SdfHeader;
  data: Uint8Array;
}

export function encodeSdf(header: SdfHeader, data: Uint8Array): Uint8Array {
  let json = JSON.stringify(header);
  while (json.length % 4 !== 0) json += " ";
  const head = new TextEncoder().encode(json);
  const out = new Uint8Array(4 + head.length + data.length);
  new DataView(out.buffer).setUint32(0, head.length, true);
  out.set(head, 4);
  out.set(data, 4 + head.length);
  return out;
}

export function decodeSdf(buf: ArrayBuffer): Sdf {
  const len = new DataView(buf).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, len))) as SdfHeader;
  if (header.version !== 1) throw new Error(`Unknown SDF version ${String(header.version)}`);
  const [nx, ny, nz] = header.dims;
  const data = new Uint8Array(buf, 4 + len, nx * ny * nz);
  return { header, data };
}

/** Signed distance at a world point, metres, trilinear between cell centres and clamped to the grid. */
export function sampleSdf({ header, data }: Sdf, x: number, y: number, z: number): number {
  const [nx, ny, nz] = header.dims;
  const g = (p: number, i: 0 | 1 | 2, n: number) => {
    const t = ((p - header.min[i]) / (header.max[i] - header.min[i])) * n - 0.5;
    return Math.min(Math.max(t, 0), n - 1);
  };
  const fx = g(x, 0, nx);
  const fy = g(y, 1, ny);
  const fz = g(z, 2, nz);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const z0 = Math.floor(fz);
  const x1 = Math.min(x0 + 1, nx - 1);
  const y1 = Math.min(y0 + 1, ny - 1);
  const z1 = Math.min(z0 + 1, nz - 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const tz = fz - z0;
  const at = (i: number, j: number, k: number) => data[i + j * nx + k * nx * ny] / 255;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const v = lerp(
    lerp(lerp(at(x0, y0, z0), at(x1, y0, z0), tx), lerp(at(x0, y1, z0), at(x1, y1, z0), tx), ty),
    lerp(lerp(at(x0, y0, z1), at(x1, y0, z1), tx), lerp(at(x0, y1, z1), at(x1, y1, z1), tx), ty),
    tz,
  );
  return (v - 0.5) * 2 * header.range;
}
