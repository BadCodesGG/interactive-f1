"use client";

/**
 * What the pit stop panel tells the canvas: whether a round is on, the pose the car should be in, and the
 * function that moves the parts. The panel (a lazy chunk on the page) and the stage are in different
 * places in the tree, so they meet here, outside React. The panel's chunk carries the mover
 * (pit-stop-scene.ts) and hands it over here when it mounts; the stage never imports it. This file is the
 * only part of the pit stop the stage chunk itself carries (it imports types and the small bridge store, bridge-store.ts), so the
 * stop's logic stays out of the stage's budget until a visitor opens the challenge.
 */
import type { Pose } from "@/models/f1/pit-stop";
import { createBridgeStore } from "./bridge-store";
import type { PitScene } from "./pit-stop-scene";

export interface PitBridge {
  /** A round is running: the stage stops flying to a wheel that is picked, and mounts the layer. */
  active: boolean;
  pose: Pose;
  /** Move the parts at once instead of easing them (reduced motion). */
  snap: boolean;
  /** Starts moving a scene's parts to the pose; returns the function that stops and puts them back. Null until the panel has loaded. */
  attach: ((scene: PitScene) => () => void) | null;
}

const REST: PitBridge = { active: false, pose: { lifted: false, off: [] }, snap: false, attach: null };
const bridge = createBridgeStore<PitBridge>(REST, { active: false, pose: REST.pose, snap: false });

export const getPitBridge = bridge.get;
export const setPitBridge = bridge.set;

/** Puts everything back: no round, the car grounded with every wheel on. The mover stays registered. */
export const resetPitBridge = bridge.reset;
export const subscribePitBridge = bridge.subscribe;

/** The bridge, re-read whenever the panel changes it. The server and the first client render say "no round". */
export const usePitBridge = bridge.use;
