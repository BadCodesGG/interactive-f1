"use client";

/**
 * Screen-space ambient occlusion, drawn by N8AO through three's EffectComposer. This module is the
 * only place that imports `n8ao`, and the stage loads it with `React.lazy`, so an app that never
 * sets `render.ao` never downloads it.
 *
 * The chain is N8AOPass (draws the scene itself into a multisampled target, then darkens creases)
 * and OutputPass (linear to sRGB, and tone mapping from the renderer's settings). Alpha survives
 * both, so the canvas stays transparent and the page shows through it.
 *
 * It takes over rendering with a priority-1 frame callback, which turns off R3F's own render, so it
 * draws exactly when the stage's on-demand loop does: an `invalidate()` still wakes it.
 */
import { useEffect, useMemo } from "react";
import type { Camera, Scene, WebGLRenderer } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { N8AOPass } from "n8ao";
import type { AoOptions } from "./render";

interface Chain {
  composer: EffectComposer;
  ao: N8AOPass;
  output: OutputPass;
}

/**
 * The composer and its passes. Building them touches no GL state (targets and materials reach the GPU
 * on first use), so it is safe in a memo and survives a strict-mode effect replay.
 */
function build(gl: WebGLRenderer, scene: Scene, camera: Camera, msaa: boolean): Chain {
  const composer = new EffectComposer(gl);
  const ao = new N8AOPass(scene, camera);
  // The scene holds transparent, depth-less things (the ground's shadow catcher, the contact
  // shadow): detecting them would switch on a second full-size pass for nothing.
  ao.autoDetectTransparency = false;
  ao.configuration.transparencyAware = false;
  ao.configureTransparencyTarget();
  // OutputPass, next, does the sRGB conversion once, after tone mapping.
  ao.configuration.gammaCorrection = false;
  // This is the target the scene is drawn into: multisampling it keeps the model's edges smooth.
  ao.beautyRenderTarget.samples = msaa ? Math.min(4, gl.capabilities.maxSamples) : 0;
  const output = new OutputPass();
  composer.addPass(ao);
  composer.addPass(output);
  return { composer, ao, output };
}

function configure(pass: N8AOPass, options: AoOptions, unit: number) {
  const c = pass.configuration;
  c.aoRadius = options.radius * unit;
  c.intensity = options.intensity;
  c.distanceFalloff = options.distanceFalloff;
}

/** N8AOPass has no dispose of its own: release whatever GPU object it holds. */
function disposePass(pass: object) {
  for (const [key, value] of Object.entries(pass)) {
    if (key === "scene" || key === "camera") continue;
    const dispose = (value as { dispose?: unknown } | null)?.dispose;
    if (typeof dispose === "function") dispose.call(value);
  }
}

export default function AoEffect({ ao, unit, msaa, onFail }: {
  ao: AoOptions;
  /** The model's bounding radius: `ao.radius` is a fraction of it. */
  unit: number;
  msaa: boolean;
  /** Called if drawing throws: the stage then falls back to its plain render. */
  onFail: () => void;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const invalidate = useThree((s) => s.invalidate);
  const chain = useMemo(() => build(gl, scene, camera, msaa), [gl, scene, camera, msaa]);

  useEffect(
    () => () => {
      chain.composer.dispose();
      chain.output.dispose();
      disposePass(chain.ao);
      // Rendering reverts to R3F's own: draw a frame without the AO.
      invalidate();
    },
    [chain, invalidate],
  );

  useEffect(() => {
    chain.composer.setPixelRatio(dpr);
    chain.composer.setSize(size.width, size.height);
    invalidate();
  }, [chain, size.width, size.height, dpr, invalidate]);

  useEffect(() => {
    configure(chain.ao, { radius: ao.radius, intensity: ao.intensity, distanceFalloff: ao.distanceFalloff }, unit);
    invalidate();
  }, [chain, ao.radius, ao.intensity, ao.distanceFalloff, unit, invalidate]);

  useFrame((_, delta) => {
    try {
      chain.composer.render(delta);
    } catch (e) {
      console.error("Ambient occlusion failed; drawing without it.", e);
      onFail();
    }
  }, 1);
  return null;
}
