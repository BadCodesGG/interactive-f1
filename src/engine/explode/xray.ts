/**
 * X-ray: a slider that fades the sidecar's outer groups so what is inside shows through. Pure maths
 * and rules here; the stage applies them to materials.
 *
 * A faded material needs `transparent` (and so sorting) but must stop writing depth, or the layer
 * would still hide what is behind it. At amount 0 every material is put back exactly as authored,
 * so a part that was already transparent (a glass panel) keeps its own opacity and depth rules.
 */
import type { Sidecar } from "./sidecar";

/** How solid an x-rayed part stays at amount 1: a ghost, so its shape still reads. */
export const XRAY_FLOOR = 0.06;
/** Above this amount the faded parts stop taking pointer hits, so a click reaches what is inside. */
export const XRAY_GHOST_ABOVE = 0.5;

/** The opacity factor for a slider amount of 0..1: 1 at rest, `XRAY_FLOOR` at full. */
export function xrayOpacity(amount: number): number {
  const a = Math.min(Math.max(Number.isFinite(amount) ? amount : 0, 0), 1);
  return 1 - a * (1 - XRAY_FLOOR);
}

/** Part ids that belong to an x-ray group, in sidecar order. */
export function xrayParts(sidecar: Pick<Sidecar, "parts" | "xray">): Set<string> {
  const groups = new Set(sidecar.xray ?? []);
  const out = new Set<string>();
  for (const [id, part] of Object.entries(sidecar.parts)) if (part.group && groups.has(part.group)) out.add(id);
  return out;
}

/** The three material fields x-ray touches. */
export interface Blend {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

/** A material's blend at a fade factor (1 = as authored), given how it was authored. */
export function xrayBlend(base: Blend, fade: number): Blend {
  if (fade >= 1) return base;
  return { opacity: base.opacity * fade, transparent: true, depthWrite: false };
}
