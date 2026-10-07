// n8ao ships no types. Only the part of N8AOPass the stage uses is declared.
declare module "n8ao" {
  import type { Camera, Scene, WebGLRenderTarget } from "three";
  import type { Pass } from "three/examples/jsm/postprocessing/Pass.js";

  export class N8AOPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    /** The scene is rendered here first; setting `samples` on it is what makes the AO pass multisampled. */
    beautyRenderTarget: WebGLRenderTarget;
    autoDetectTransparency: boolean;
    configuration: {
      aoRadius: number;
      intensity: number;
      distanceFalloff: number;
      gammaCorrection: boolean;
      transparencyAware: boolean;
      halfRes: boolean;
    };
    configureTransparencyTarget(): void;
    setSize(width: number, height: number): void;
  }
}
