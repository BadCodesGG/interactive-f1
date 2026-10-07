/**
 * The tunnel's polished floor: a Reflector (a second render of the scene from a camera mirrored in the
 * floor's plane) drawn through a shader of our own that turns the mirror into epoxy. The reflection is
 * sampled at a mip level, and by a few taps stretched vertically, that both grow with distance from
 * the car's footprint; it fades out with the same distance and is stronger at grazing angles (Fresnel).
 * Under it lies a pool of the floor's own colour, so the car sits in a glossy patch that dissolves into
 * the ground. The reflection texture is a fraction of the canvas (floor-config.ts): the blur hides it.
 *
 * Without a float or half-float render target (some phones) there is no reflection, only the pool.
 * The grid is hidden from the reflection (it would double up under the floor) and fades with distance.
 */
import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { FLOOR, reflectionSize } from "./floor-config";
import type { TunnelLook } from "./look";

const VERTEX = /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 vUv;
varying vec3 vWorld;
void main() {
  vUv = textureMatrix * vec4(position, 1.0);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 color;
uniform sampler2D tDiffuse;
uniform vec3 uBase;
uniform float uPool;
uniform float uReflect;
uniform vec4 uFoot;
uniform float uFade;
uniform float uPoolFade;
uniform vec2 uLod;
uniform vec2 uBlur;
uniform vec2 uRadius;
varying vec4 vUv;
varying vec3 vWorld;

void main() {
  // Metres from the car's footprint on the floor.
  vec2 nearest = vec2(clamp(vWorld.x, uFoot.x, uFoot.y), clamp(vWorld.z, uFoot.z, uFoot.w));
  float d = distance(vWorld.xz, nearest);
  float reach = 1.0 - smoothstep(0.0, uFade, d);
  float poolA = uPool * (1.0 - smoothstep(0.0, uPoolFade, d));
  if (reach <= 0.0 && poolA <= 0.0) discard;

  vec3 refl = vec3(0.0);
  float reflA = 0.0;
#if TAPS > 0
  vec3 V = normalize(cameraPosition - vWorld);
  float fresnel = mix(0.3, 1.0, pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0));
  reflA = uReflect * fresnel * pow(reach, 1.5);
  vec2 uv = vUv.xy / vUv.w;
  float t = smoothstep(uBlur.x, uBlur.y, d);
  float lod = mix(uLod.x, uLod.y, t);
  float radius = mix(uRadius.x, uRadius.y, t);
  for (int i = 0; i < TAPS; i++) {
    float a = float(i) * 2.39996;
    float r = sqrt((float(i) + 0.5) / float(TAPS));
    refl += textureLod(tDiffuse, uv + vec2(cos(a) * 0.7, sin(a) * 1.6) * r * radius, lod).rgb;
  }
  refl /= float(TAPS);
#endif

  float alpha = 1.0 - (1.0 - reflA) * (1.0 - poolA);
  vec3 rgb = (uBase * poolA * (1.0 - reflA) + refl * reflA) / max(alpha, 1e-4);
  gl_FragColor = vec4(rgb, alpha);
  #include <colorspace_fragment>
}
`;

export interface Floor {
  object: THREE.Mesh;
  /** Objects drawn in the scene but not in the reflection (the grid). */
  hideInReflection: THREE.Object3D[];
  reflective: boolean;
  /** Sizes the reflection to the renderer's drawing buffer as it is now (it is a share of the canvas: call it when the canvas or its pixel ratio changes). */
  fit(): void;
  setLook(look: TunnelLook["floor"]): void;
  dispose(): void;
}

/** Can this renderer draw into the half-float target the reflection needs? */
const canReflect = (gl: THREE.WebGLRenderer) => gl.extensions.has("EXT_color_buffer_float") || gl.extensions.has("EXT_color_buffer_half_float");

export function createFloor(gl: THREE.WebGLRenderer, mobile: boolean): Floor {
  const geometry = new THREE.PlaneGeometry(FLOOR.size, FLOOR.size);
  const reflective = canReflect(gl);
  const taps = reflective ? FLOOR.taps[mobile ? "mobile" : "desktop"] : 0;
  const hideInReflection: THREE.Object3D[] = [];
  const size = new THREE.Vector2();
  let mesh: THREE.Mesh;
  let dispose: () => void;
  let fit = () => {};
  if (reflective) {
    gl.getDrawingBufferSize(size);
    const [textureWidth, textureHeight] = reflectionSize(size.x, size.y, mobile);
    // The Reflector takes its mirror plane from the mesh's matrix, reading the normal as the mesh's +z.
    const r = new Reflector(geometry, {
      textureWidth,
      textureHeight,
      multisample: 0,
      shader: { name: "TunnelFloor", uniforms: uniforms(), vertexShader: VERTEX, fragmentShader: FRAGMENT },
    });
    const texture = r.getRenderTarget().texture;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    const draw = r.onBeforeRender.bind(r);
    r.onBeforeRender = (...args: Parameters<typeof draw>) => {
      const shown = hideInReflection.map((o) => o.visible);
      for (const o of hideInReflection) o.visible = false;
      draw(...args);
      hideInReflection.forEach((o, i) => (o.visible = shown[i]));
    };
    mesh = r;
    fit = () => {
      gl.getDrawingBufferSize(size);
      const [w, h] = reflectionSize(size.x, size.y, mobile);
      const target = r.getRenderTarget();
      if (target.width !== w || target.height !== h) target.setSize(w, h);
    };
    dispose = () => {
      geometry.dispose();
      r.dispose();
    };
  } else {
    mesh = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({ uniforms: { ...uniforms(), tDiffuse: { value: null }, textureMatrix: { value: new THREE.Matrix4() } }, vertexShader: VERTEX, fragmentShader: FRAGMENT }),
    );
    dispose = () => {
      geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    };
  }
  mesh.rotation.x = -Math.PI / 2;
  const material = mesh.material as THREE.ShaderMaterial;
  material.defines = { TAPS: taps };
  material.transparent = true;
  material.depthWrite = false;
  // Under the grid, the smoke and the car's own transparent parts.
  mesh.renderOrder = -10;
  mesh.name = "__tunnel_floor";
  mesh.raycast = () => {};
  mesh.frustumCulled = false;
  return {
    object: mesh,
    hideInReflection,
    reflective,
    fit: () => fit(),
    setLook({ base, pool, reflect }) {
      const u = material.uniforms;
      u.uBase.value.set(base);
      u.uPool.value = pool;
      u.uReflect.value = reflect;
    },
    dispose,
  };
}

function uniforms(): Record<string, THREE.IUniform> {
  return {
    color: { value: new THREE.Color() },
    tDiffuse: { value: null },
    textureMatrix: { value: new THREE.Matrix4() },
    uBase: { value: new THREE.Color() },
    uPool: { value: 0.8 },
    uReflect: { value: 0.6 },
    uFoot: { value: new THREE.Vector4(...FLOOR.footprint) },
    uFade: { value: FLOOR.fade },
    uPoolFade: { value: FLOOR.poolFade },
    uLod: { value: new THREE.Vector2(...FLOOR.lod) },
    uBlur: { value: new THREE.Vector2(...FLOOR.blur) },
    uRadius: { value: new THREE.Vector2(...FLOOR.radius) },
  };
}

/**
 * Fades a GridHelper's lines out with distance from the middle of the car (a radius, in the floor's
 * plane), so the grid is a pool round the car rather than a sheet to the horizon.
 */
export function fadeGrid(material: THREE.LineBasicMaterial): void {
  const { centreX, from, to } = FLOOR.grid;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGridFade = { value: new THREE.Vector3(centreX, from, to) };
    // A grid line is one segment, so the fade is worked out per pixel from the interpolated position.
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vGridPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGridPos = position.xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uGridFade;\nvarying vec2 vGridPos;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= 1.0 - smoothstep(uGridFade.y, uGridFade.z, distance(vGridPos, vec2(uGridFade.x, 0.0)));");
  };
}
