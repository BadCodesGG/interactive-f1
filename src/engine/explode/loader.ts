/**
 * Model loading. Bytes are fetched at most once per URL (a promise cache, warmed by preloadModel on
 * hover or focus); three's GLTFLoader and the Meshopt decoder are imported on first use, so they ship
 * in the stage's lazy chunk and never in a route's initial JS. This file has only type imports from
 * three, which is what lets the barrel re-export it safely.
 *
 * Each loadModel call parses a fresh scene from the cached bytes. The stage mutates what it gets
 * (positions, cloned materials) and disposes it on unmount, so two mounts (React Strict Mode, a
 * context-loss remount) must never share one scene.
 *
 * A feature that builds a model in code registers a model source for a URL prefix
 * (`registerModelSource("procedural:", ...)`); the engine imports nothing from the app.
 */
import type { Object3D } from "three";

const bytes = new Map<string, Promise<ArrayBuffer>>();

/** Where a model that is not a GLB comes from. Keep `load` a dynamic import of the generator so it stays out of initial JS. */
export interface ModelSource {
  /** Builds a scene for `name` (the URL after the prefix); a new one on every call, as with a GLB. */
  load(name: string): Promise<Object3D>;
  /** Warms whatever `load` needs (usually the generator's chunk). Failures surface later, from `load`. */
  preload?(name: string): Promise<unknown> | void;
}

const sources = new Map<string, ModelSource>();

/**
 * Serves every URL that starts with `prefix` from `source` instead of fetching it. Register from a
 * module that runs before the first loadModel or preloadModel; registering a prefix again replaces it.
 */
export function registerModelSource(prefix: string, source: ModelSource): void {
  sources.set(prefix, source);
}

function sourceFor(url: string): { source: ModelSource; name: string } | null {
  for (const [prefix, source] of sources) if (url.startsWith(prefix)) return { source, name: url.slice(prefix.length) };
  return null;
}

function fetchBytes(url: string): Promise<ArrayBuffer> {
  let p = bytes.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Model ${url} answered ${r.status}`);
      return r.arrayBuffer();
    });
    // A failed fetch is forgotten so the next attempt retries rather than replaying the failure.
    p.catch(() => bytes.delete(url));
    bytes.set(url, p);
  }
  return p;
}

let decoders: Promise<[typeof import("three/addons/loaders/GLTFLoader.js"), typeof import("three/addons/libs/meshopt_decoder.module.js")]> | null = null;
const loadDecoders = () =>
  (decoders ??= Promise.all([import("three/addons/loaders/GLTFLoader.js"), import("three/addons/libs/meshopt_decoder.module.js")]));

/**
 * Fetches (once) and parses the GLB at `url`, resolving to a scene this caller owns. A URL under a
 * registered model source prefix is built by that source instead: no fetch.
 */
export async function loadModel(url: string): Promise<Object3D> {
  const custom = sourceFor(url);
  if (custom) return custom.source.load(custom.name);
  const [buf, [{ GLTFLoader }, { MeshoptDecoder }]] = await Promise.all([fetchBytes(url), loadDecoders()]);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buf, "");
  return gltf.scene;
}

/** Starts the fetch (or the source's warm-up) early; safe to call repeatedly. Failures surface later, from loadModel. */
export function preloadModel(url: string): void {
  const custom = sourceFor(url);
  if (custom) void (async () => custom.source.preload?.(custom.name))().catch(() => {});
  else fetchBytes(url).catch(() => {});
}

type Disposable = { dispose(): void };
const hasDispose = (v: unknown): v is Disposable => typeof (v as Disposable | null)?.dispose === "function";

/** Frees the GPU resources of a scene from loadModel: every geometry, material and texture. */
export function disposeModel(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as Object3D & { geometry?: unknown; material?: unknown };
    if (hasDispose(mesh.geometry)) mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) {
      for (const v of Object.values(m as Record<string, unknown>)) if ((v as { isTexture?: boolean } | null)?.isTexture && hasDispose(v)) v.dispose();
      if (hasDispose(m)) m.dispose();
    }
  });
}
