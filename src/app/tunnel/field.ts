/**
 * The airflow's velocity field, as GLSL shared by every particle set that rides it (flow.ts's smoke,
 * air.ts's streaks and flakes). Split out so the two do not import each other. See flow.ts for the
 * physics: freestream, curl noise, the body's deflection from the baked SDF, and the authored terms.
 */
import { FLOW_BOX, TURBULENCE, WAKE } from "./rake";

const BOX = FLOW_BOX;

/** How far smoke stays off the body and the floor, metres. */
export const STANDOFF = 0.03;
export const f = (n: number) => n.toFixed(4);

/** rake.ts's numbers, as GLSL constants. */
export const CONSTS = /* glsl */ `
#define WAKE_START ${f(WAKE.start)}
#define WAKE_FULL ${f(WAKE.full)}
#define TURB_LAMINAR ${f(TURBULENCE.laminar)}
#define TURB_WAKE ${f(TURBULENCE.wake)}
#define BOX_X0 ${f(BOX.min[0])}
#define BOX_X1 ${f(BOX.max[0])}
#define BOX_Y1 ${f(BOX.max[1])}
#define BOX_Z ${f(BOX.max[2])}
#define STANDOFF ${f(STANDOFF)}
`;

export const FIELD = /* glsl */ `
${CONSTS}
uniform sampler3D uSdf;
uniform vec3 uMin;
uniform vec3 uMax;
uniform float uRange;
uniform float uSpeed;
uniform float uTime;
uniform float uDownwash;
uniform float uDiffuserUp;

// Beyond the baked grid (the rake stands upstream of it) the edge value plus the distance to the grid.
float sdf(vec3 p) {
  vec3 pc = clamp(p, uMin, uMax);
  vec3 t = (pc - uMin) / (uMax - uMin);
  return (texture(uSdf, t).r - 0.5) * 2.0 * uRange + length(p - pc);
}

// The step is a little over a grid cell, so the gradient is that of the smoothed field, not of one facet.
vec3 sdfGrad(vec3 p) {
  const float h = 0.07;
  return vec3(
    sdf(p + vec3(h, 0.0, 0.0)) - sdf(p - vec3(h, 0.0, 0.0)),
    sdf(p + vec3(0.0, h, 0.0)) - sdf(p - vec3(0.0, h, 0.0)),
    sdf(p + vec3(0.0, 0.0, h)) - sdf(p - vec3(0.0, 0.0, h))
  ) / (2.0 * h);
}

// Analytic curl of psi = (sin(y + t) cos(z), sin(z + t) cos(x), sin(x + t) cos(y)): divergence-free.
vec3 curlTrig(vec3 p, float t) {
  float sx = sin(p.x + t), cx = cos(p.x + t);
  float sy = sin(p.y + t), cy = cos(p.y + t);
  float sz = sin(p.z + t), cz = cos(p.z + t);
  float ox = cos(p.x), oy = cos(p.y), oz = cos(p.z);
  float ix = sin(p.x), iy = sin(p.y), iz = sin(p.z);
  // psi.x = sy * oz, psi.y = sz * ox, psi.z = sx * oy
  return vec3(
    -sx * iy - cz * ox,   // d(psi.z)/dy - d(psi.y)/dz
    -sy * iz - cx * oy,   // d(psi.x)/dz - d(psi.z)/dx
    -sz * ix - cy * oz    // d(psi.y)/dx - d(psi.x)/dy
  );
}
`;

/**
 * The velocity shader: the field above, evaluated at the previous position. `speed` is a GLSL float
 * expression for the freestream at this particle (it may use `uv`, the particle's texel), `pre` is
 * declarations spliced in before main (so `speed` can call them). `laminar` is the turbulence ahead of the car, a GLSL
 * float expression (the streaks and flakes wander more than the smoke). The smoke's are plain `uSpeed` and `TURB_LAMINAR`.
 */
export const velocityShader = (pre = "", speed = "uSpeed", laminar = "TURB_LAMINAR") => /* glsl */ `
${FIELD}
${pre}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 p = texture2D(texturePosition, uv).xyz;
  float U = ${speed};
  vec3 v = vec3(U, 0.0, 0.0);

  // Smoke keeps a little clear of the surface, and every term below is continuous in the distance to it:
  // a step in the field (a push that switches on at the surface, a branch on the sign of the inward
  // speed) throws neighbouring particles to different sides of it and the ribbon zigzags.
  float d = sdf(p) - STANDOFF;
  vec3 n = sdfGrad(p);
  float glen = length(n);
  n = glen > 1e-4 ? n / glen : vec3(0.0, 1.0, 0.0);
  float ramp = smoothstep(0.0, 0.28, d);
  float near = 1.0 - ramp;

  // Near laminar ahead of the car, breaking up into wisps behind it.
  float turb = mix(${laminar}, TURB_WAKE, smoothstep(WAKE_START, WAKE_FULL, p.x));
  v += (curlTrig(p * 2.3, uTime * 0.6) * 0.6 + curlTrig(p * 5.1 + 1.7, uTime * 1.1) * 0.25) * turb * U * ramp;

  float behind = smoothstep(2.0, 2.35, p.x) * (1.0 - smoothstep(2.7, 3.4, p.x))
    * (1.0 - smoothstep(0.45, 0.7, abs(p.z))) * smoothstep(0.3, 0.7, p.y) * (1.0 - smoothstep(1.25, 1.55, p.y));
  v.y -= uDownwash * U * behind;
  float exit = smoothstep(1.6, 2.05, p.x) * (1.0 - smoothstep(2.6, 3.2, p.x))
    * (1.0 - smoothstep(0.22, 0.42, p.y)) * (1.0 - smoothstep(0.5, 0.8, abs(p.z)));
  v.y += uDiffuserUp * U * exit;

  v -= n * min(dot(v, n), 0.0) * near;
  v += (v - n * dot(v, n)) * 0.5 * near;
  v += n * (U * 0.6 * (1.0 - smoothstep(-0.03, 0.0, d)) + max(-d, 0.0) * 10.0);

  // The floor is an obstacle too: the underbody runs a few centimetres above it.
  float fd = p.y - STANDOFF;
  v.y -= min(v.y, 0.0) * (1.0 - smoothstep(0.0, 0.15, fd));
  v.y += U * 0.6 * (1.0 - smoothstep(-0.03, 0.0, fd)) + max(-fd, 0.0) * 10.0;
  gl_FragColor = vec4(v, 1.0);
}
`;
