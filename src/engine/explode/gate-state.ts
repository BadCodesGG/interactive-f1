/**
 * What the stage gate is doing, and the words that go with it. Pure and DOM-free: the gate derives
 * the state, publishes it to the store, and the controls read it to say why they are off.
 */

/**
 * `waiting`: before the idle probe; `opt-in`: reduced motion, nothing loads until Load 3D;
 * `unsupported`: no WebGL 2; `failed`: the scene threw or lost its context; `loading`: the stage is
 * mounted and has not drawn; `live`: drawing.
 */
export type StageGateState = "waiting" | "opt-in" | "unsupported" | "failed" | "loading" | "live";

export const OPT_IN_REASON = "Your device asks for reduced motion, so the 3D view waits until you load it.";
export const UNSUPPORTED_NOTE = "The 3D view needs WebGL 2. The part list still works.";
export const FAILED_NOTE = "The 3D view could not load. The part list still works.";

export interface GateInputs {
  probed: boolean | null;
  reduced: boolean;
  optIn: boolean;
  failed: boolean;
  drawn: boolean;
}

/** The gate's state from its inputs: `live` needs WebGL 2, no failure and, under reduced motion, an opt-in. */
export function gateState({ probed, reduced, optIn, failed, drawn }: GateInputs): StageGateState {
  const live = probed === true && (!reduced || optIn) && !failed;
  if (live) return drawn ? "live" : "loading";
  if (failed) return "failed";
  if (probed === false) return "unsupported";
  return reduced && !optIn ? "opt-in" : "waiting";
}

/** The sentence shown on the card over the poster, or null when the gate has nothing to say. */
export function gateMessage(state: StageGateState, optInReason: string = OPT_IN_REASON): string | null {
  if (state === "opt-in") return optInReason;
  if (state === "unsupported") return UNSUPPORTED_NOTE;
  if (state === "failed") return FAILED_NOTE;
  return null;
}

/** Why the stage controls are off, or null when they are only waiting for the stage to draw. */
export function controlsHint(state: StageGateState, ready: boolean): string | null {
  if (ready) return null;
  if (state === "opt-in") return "Load the 3D view to use these.";
  if (state === "unsupported" || state === "failed") return "The 3D view is unavailable, so these stay off.";
  return null;
}
