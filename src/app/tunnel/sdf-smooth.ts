/**
 * Smooths the baked signed distance field for the flow shader (no three). The bake is 8 bits on a grid
 * of cells 4 to 6 cm across, so its gradient is a patchwork of facets and 3 mm steps: fine for the
 * lap-time maths, but a line of smoke sliding along it picks up every one. A short binomial blur
 * (1, 2, 1 along each axis, `passes` times) rounds the facets off; the flow only needs the body's rough
 * distance, and the shader keeps smoke a few centimetres clear of it anyway.
 *
 * Works on a copy and returns unrounded values in the same 0..255 units, so the caller can upload them
 * at a precision finer than a byte.
 */
export function smoothSdf(data: Uint8Array, dims: readonly [number, number, number], passes = 2): Float32Array {
  const [nx, ny, nz] = dims;
  let src = Float32Array.from(data);
  let dst = new Float32Array(src.length);
  const strides = [1, nx, nx * ny];
  const sizes = [nx, ny, nz];
  for (let pass = 0; pass < passes; pass++) {
    for (let axis = 0; axis < 3; axis++) {
      const stride = strides[axis];
      const last = sizes[axis] - 1;
      for (let z = 0; z < nz; z++) {
        for (let y = 0; y < ny; y++) {
          for (let x = 0; x < nx; x++) {
            const i = x + nx * (y + ny * z);
            const c = axis === 0 ? x : axis === 1 ? y : z;
            const lo = c > 0 ? i - stride : i;
            const hi = c < last ? i + stride : i;
            dst[i] = (src[lo] + 2 * src[i] + src[hi]) / 4;
          }
        }
      }
      [src, dst] = [dst, src];
    }
  }
  return src;
}
