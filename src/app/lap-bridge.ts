"use client";

/**
 * What the lap panel tells the canvas, and what the canvas tells it back. The panel (a lazy chunk on the
 * page) and the stage are in different places in the tree, so they meet here, outside React, as the pit
 * stop's do (pit-stop-bridge.ts). The panel's chunk carries the mover (lap-scene.ts) and hands it over
 * here when it mounts; the stage never imports it. This file is the only part of the lap the stage chunk
 * itself carries, and it imports types and the small bridge store (bridge-store.ts), so the lap's logic and its three code stay out of
 * the stage's budget until a visitor opens the lap.
 */
import type { AeroMode } from "@/data/aero";
import type { Phase } from "@/models/f1/lap-car";
import { createBridgeStore } from "./bridge-store";
import type { LapScene } from "./lap-scene";

/** Where the camera rides: behind the car, in front of it, or alongside. */
export type LapView = "chase" | "front" | "side";
export const LAP_VIEWS: readonly LapView[] = ["chase", "front", "side"];

/** What the panel asks for. */
export interface LapCommand {
  /** The car is moving; false freezes it where it is. */
  playing: boolean;
  /** Bumped to start the lap again. */
  restarts: number;
  /** Bumped once for each step of STEP_SECONDS asked for. */
  steps: number;
  view: LapView;
  /** Start from a still frame on a straight with the wings open (reduced motion) instead of from the line. */
  still: boolean;
}

/** What the canvas reports, every frame the car moves. The object is reused: read it, do not keep it. */
export interface LapTelemetry {
  speedKmh: number;
  mode: AeroMode;
  lapSeconds: number;
  phase: Phase;
  finished: boolean;
  /** Which way the flaps are going while they move, and for a second after; null at rest. */
  flaps: "opening" | "closing" | null;
}

export interface LapBridge extends LapCommand {
  /** A lap is on: the stage stops flying to a part that is picked, and mounts the layer. */
  active: boolean;
  /** Starts posing the scene's car for the lap; returns the function that stops, and puts everything back. Null until the panel has loaded. */
  attach: ((scene: LapScene) => () => void) | null;
  telemetry: LapTelemetry;
}

const IDLE: LapCommand = { playing: false, restarts: 0, steps: 0, view: "chase", still: false };
const REST: LapBridge = { ...IDLE, active: false, attach: null, telemetry: { speedKmh: 0, mode: "corner", lapSeconds: 0, phase: "running", finished: false, flaps: null } };
const bridge = createBridgeStore<LapBridge>(REST, { ...IDLE, active: false });

export const getLapBridge = bridge.get;
export const setLapBridge = bridge.set;

/** Ends the lap: nothing is on, the commands go back to rest. The mover stays registered. */
export const resetLapBridge = bridge.reset;
export const subscribeLapBridge = bridge.subscribe;

/** The bridge, re-read whenever the panel changes it. The server and the first client render say "no lap". */
export const useLapBridge = bridge.use;
