/**
 * A soft contact shadow pooled under the model, after drei's ContactShadows but written locally.
 *
 * Each drawn frame the scene is rendered once from just under the ground looking up, with an
 * override material that writes nothing but "how close to the ground": near parts opaque, parts at
 * `far` invisible. That texture is blurred (separable 9-tap passes, wide to narrow) and laid on a plane at
 * ground height. Only the model's own meshes take part: the rig (lights, the ground plane) and the
 * selection outline are hidden for the depth pass.
 */
import * as THREE from "three";
import type { ContactOptions } from "./render";

const RESOLUTION = 512;

const DEPTH_VERTEX = /* glsl */ `
varying float vHeight;
void main() {
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vHeight = clip.z / clip.w * 0.5 + 0.5;
  gl_Position = clip;
}`;

// Alpha is the shadow: 1 at the ground, 0 at the camera's far plane.
const DEPTH_FRAGMENT = /* glsl */ `
varying float vHeight;
void main() {
  gl_FragColor = vec4(0.0, 0.0, 0.0, clamp(1.0 - vHeight, 0.0, 1.0));
}`;

const BLUR_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// The same nine weights as three's HorizontalBlurShader, along an arbitrary step.
const BLUR_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 step;
varying vec2 vUv;
void main() {
  vec4 sum = vec4(0.0);
  sum += texture2D(tDiffuse, vUv - 4.0 * step) * 0.051;
  sum += texture2D(tDiffuse, vUv - 3.0 * step) * 0.0918;
  sum += texture2D(tDiffuse, vUv - 2.0 * step) * 0.12245;
  sum += texture2D(tDiffuse, vUv - 1.0 * step) * 0.1531;
  sum += texture2D(tDiffuse, vUv) * 0.1633;
  sum += texture2D(tDiffuse, vUv + 1.0 * step) * 0.1531;
  sum += texture2D(tDiffuse, vUv + 2.0 * step) * 0.12245;
  sum += texture2D(tDiffuse, vUv + 3.0 * step) * 0.0918;
  sum += texture2D(tDiffuse, vUv + 4.0 * step) * 0.051;
  gl_FragColor = sum;
}`;

// One nine-tap pass copies a hard edge nine times across the blur width; passes at halving widths
// fill those gaps in, so the shadow fades smoothly instead of in steps.
const BLUR_PASSES = [1, 0.5, 0.25];

const targetOptions = { generateMipmaps: false, depthBuffer: true } as const;

export class ContactShadow {
  /** The shadow plane: add it to the scene at ground height. */
  readonly mesh: THREE.Mesh;

  private readonly target = new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, targetOptions);
  private readonly ping = new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, { ...targetOptions, depthBuffer: false });
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly depthMaterial = new THREE.ShaderMaterial({
    vertexShader: DEPTH_VERTEX,
    fragmentShader: DEPTH_FRAGMENT,
    side: THREE.DoubleSide,
  });
  private readonly blurMaterial = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, step: { value: new THREE.Vector2() } },
    vertexShader: BLUR_VERTEX,
    fragmentShader: BLUR_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  private readonly blurGeometry = new THREE.PlaneGeometry(2, 2);
  private readonly blurScene = new THREE.Scene();
  private readonly blurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly planeGeometry: THREE.PlaneGeometry;
  private readonly planeMaterial: THREE.MeshBasicMaterial;
  private readonly radius: number;
  private blur = 0;

  /**
   * @param radius The model's bounding radius: the plane spans 3 of them, and `far` is in them.
   * @param centre Where the model's footprint is centred, on the ground.
   */
  constructor(radius: number, centre: THREE.Vector3, options: ContactOptions) {
    this.radius = radius;
    const size = radius * 3;
    this.planeGeometry = new THREE.PlaneGeometry(size, size);
    this.planeMaterial = new THREE.MeshBasicMaterial({
      map: this.target.texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(this.planeGeometry, this.planeMaterial);
    this.mesh.name = "__explode_contact";
    this.mesh.position.copy(centre);
    this.mesh.rotation.x = -Math.PI / 2;
    // The depth camera's image has +z at the top; the plane's texture has -z there. Flip it.
    this.mesh.scale.y = -1;
    this.mesh.renderOrder = 1;
    this.mesh.raycast = () => {};

    this.camera.left = -size / 2;
    this.camera.right = size / 2;
    this.camera.top = size / 2;
    this.camera.bottom = -size / 2;
    // Looking straight up (+y) from the ground, with +z as the image's up.
    this.camera.position.copy(centre);
    this.camera.rotation.x = Math.PI / 2;

    this.blurScene.add(new THREE.Mesh(this.blurGeometry, this.blurMaterial));
    this.set(options);
  }

  /** Moves the plane and the camera under it to a new ground height (the ground follows the model's pose). */
  setHeight(y: number): void {
    this.mesh.position.y = y;
    this.camera.position.y = y;
  }

  set(options: ContactOptions): void {
    this.planeMaterial.opacity = options.opacity;
    this.camera.far = Math.max(1e-3, options.far * this.radius);
    this.camera.updateProjectionMatrix();
    this.blur = options.blur;
  }

  /** Redraws the shadow. Leaves the renderer's target, clear colour, shadow maps and the scene as it found them. */
  update(gl: THREE.WebGLRenderer, scene: THREE.Scene, hidden: THREE.Object3D[]): void {
    const shown = hidden.map((o) => o.visible);
    for (const o of hidden) o.visible = false;
    const { overrideMaterial, background } = scene;
    const target = gl.getRenderTarget();
    const shadowAuto = gl.shadowMap.autoUpdate;
    const clear = gl.getClearColor(tmpColour);
    const clearAlpha = gl.getClearAlpha();
    try {
      scene.overrideMaterial = this.depthMaterial;
      scene.background = null;
      // The override material casts nothing: skip the key light's shadow pass for these draws.
      gl.shadowMap.autoUpdate = false;
      gl.setClearColor(0x000000, 0);
      gl.setRenderTarget(this.target);
      gl.render(scene, this.camera);
      for (const width of BLUR_PASSES) {
        const step = (this.blur * width) / 256;
        this.blurPass(gl, this.target, this.ping, step, 0);
        this.blurPass(gl, this.ping, this.target, 0, step);
      }
    } finally {
      scene.overrideMaterial = overrideMaterial;
      scene.background = background;
      gl.shadowMap.autoUpdate = shadowAuto;
      gl.setClearColor(clear, clearAlpha);
      gl.setRenderTarget(target);
      hidden.forEach((o, i) => (o.visible = shown[i]));
    }
  }

  private blurPass(gl: THREE.WebGLRenderer, from: THREE.WebGLRenderTarget, to: THREE.WebGLRenderTarget, x: number, y: number) {
    this.blurMaterial.uniforms.tDiffuse.value = from.texture;
    this.blurMaterial.uniforms.step.value.set(x, y);
    gl.setRenderTarget(to);
    gl.render(this.blurScene, this.blurCamera);
  }

  dispose(): void {
    this.target.dispose();
    this.ping.dispose();
    this.depthMaterial.dispose();
    this.blurMaterial.dispose();
    this.blurGeometry.dispose();
    this.planeGeometry.dispose();
    this.planeMaterial.dispose();
  }
}

const tmpColour = new THREE.Color();
