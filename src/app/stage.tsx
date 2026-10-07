"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type { CarYear } from "@/data/car-specs";
import { useExplodeStore, type GateRenderProps, type Sidecar, type StagePalette, type Themed } from "@/engine/explode";
import ExplodeStage, { useStageScene } from "@/engine/explode/stage";
import { prepareCar } from "@/models/f1/car";
import { LIVERIES } from "@/models/f1/liveries";
import { repaintLivery } from "@/models/f1/livery-apply";
import { holdExportForBake, scheduleArBake } from "@/models/f1/livery-ar";
import { LIVERY_META } from "@/models/f1/livery-meta";
import { useLivery } from "@/models/f1/livery-store";
import { surfaces } from "@/models/f1/surfaces";
import { useLapBridge } from "./lap-bridge";
import { usePitBridge } from "./pit-stop-bridge";

/**
 * Car 26 studio lighting, per theme. The photo-studio environment (RENDER below) does the lighting, so
 * these direct lights are kept low: a white key that only casts the shadow and shapes the body, no
 * fill, and cool rims behind the car that draw its outline. Any more and the pearl reads as a flat
 * white sheet, because a direct light adds diffuse without adding a reflection. Dark: the near-black
 * studio. Light: a bright set with a real soft shadow, rims that lift the silhouette off the pale ground.
 */
const PALETTE: Themed<Partial<StagePalette>> = {
  dark: { sky: "#cfd6e0", ground: "#07080a", hemisphere: 0, key: "#ffffff", keyIntensity: 0.3, shadow: "#000000", shadowOpacity: 0.55, rim: "#cfe3ff", rimIntensity: 0.4 },
  light: { sky: "#ffffff", ground: "#c9cfda", hemisphere: 0.1, key: "#fff7ec", keyIntensity: 0.4, keyFrom: [0.25, 2.5, 0.35], shadow: "#1b2436", shadowOpacity: 0.3, rim: "#ffffff", rimIntensity: 0.5 },
};

/** The page's --bg per theme (globals.css): isolated-out parts fade toward it. */
const BACKGROUND = { dark: "#07080a", light: "#e1e5ea" };
/** The page's --accent per theme, which is the livery's (globals.css, livery-meta.ts): the selection outline and the hover glow. */
const accentOf = (id: keyof typeof LIVERY_META) => ({ dark: LIVERY_META[id].accents.dark.accent, light: LIVERY_META[id].accents.light.accent });

/**
 * The studio environment, tone mapping, AO and shadows for both themes. The pearl has to sit well
 * under white to leave room for highlights: strips are the two tall softboxes that draw long stripes
 * down the body, key the broad overhead box (kept low: turned up it blows the nose out). Dark keeps
 * its black surround; light takes a mid-grey one, so the pearl reflects a dimmer room than the pale
 * ground around it and still separates from it, at a lower exposure.
 */
const RENDER = {
  dark: { env: "studio", studio: { key: 0.6, strips: 6, surround: "#16181d" }, envIntensity: 0.45, toneMapping: "neutral", exposure: 1, ao: { radius: 0.1, intensity: 3 }, contact: { opacity: 0.75, blur: 3, far: 0.5 }, shadowMapSize: 2048, shadowRadius: 4 },
  light: { env: "studio", studio: { key: 0.7, strips: 7, surround: "#a8aeb8" }, envIntensity: 0.4, toneMapping: "neutral", exposure: 0.8, ao: { radius: 0.1, intensity: 2.5 }, contact: { opacity: 0.5, blur: 4, far: 0.6 }, shadowMapSize: 2048, shadowRadius: 6 },
} as const;

/** The car is modelled in metres (wheelbase 3.4 m, about 5.5 m long): View in AR shows it life size. */
const AR = { metresPerUnit: 1 };

/**
 * Repaints the car when the visitor picks another livery: in place, on the materials the stage holds,
 * with no reload of the model (livery-apply.ts). Rendered by the stage once the model is in, inside the canvas.
 * The first paint is prepareCar's, so a car that already wears the livery is left alone (its AR bake is still warmed).
 */
function LiveryLayer() {
  const scene = useStageScene();
  const store = useExplodeStore();
  const id = useLivery();
  // An AR press waits for the livery's bake (loaded and run in slices, off the stage chunk) before the engine exports.
  useEffect(() => holdExportForBake(store, scene.root), [store, scene]);
  useEffect(() => {
    repaintLivery(scene.root, LIVERIES[id]);
    scene.invalidate();
    // On a phone that can do AR, bake the livery for the export in the background.
    scheduleArBake(scene.root);
  }, [scene, id]);
  return null;
}

/**
 * Lets the pit stop move the car's parts while a round is on. The mover arrives with the pit stop panel
 * (pit-stop-bridge.ts), which is only fetched when a visitor opens the challenge, so until then this is nothing.
 */
function PitStopMount() {
  const scene = useStageScene();
  const { active, attach } = usePitBridge();
  useEffect(() => (active && attach ? attach(scene) : undefined), [active, attach, scene]);
  return null;
}

/**
 * Lets the lap pose the car while one is on. The mover arrives with the lap panel (lap-bridge.ts), which is only
 * fetched when a visitor opens the lap, so until then this is nothing.
 */
function LapMount() {
  const scene = useStageScene();
  // The car's reflection on the lap is built on the stage's own renderer.
  const gl = useThree((s) => s.gl);
  const { active, attach } = useLapBridge();
  useEffect(() => (active && attach ? attach({ ...scene, gl }) : undefined), [active, attach, scene, gl]);
  return null;
}

/** The lazy chunk's entry: the canvas, bound to the page's store. Loaded only by stage-client.tsx. */
export default function Stage({ sidecar, year, opening, active, mobile, reduced, onReady, onFail }: GateRenderProps & { sidecar: Sidecar; year: CarYear; opening?: boolean }) {
  const store = useExplodeStore();
  const livery = useLivery();
  const pit = usePitBridge();
  const lap = useLapBridge();
  return (
    <ExplodeStage
      sidecar={sidecar}
      store={store}
      active={active}
      mobile={mobile}
      reduced={reduced}
      onReady={onReady}
      onFail={onFail}
      opening={opening}
      // The 2026 car gets its power unit and its livery; the 2022 car is a finished neutral model (scripts/build-car.mjs).
      onModel={year === 2026 ? prepareCar : undefined}
      materials={surfaces}
      ar={AR}
      background={BACKGROUND}
      accent={accentOf(livery)}
      palette={PALETTE}
      render={RENDER}
      // On wider screens the spec readout covers the bottom of the stage; on phones it sits below.
      lift={mobile ? 0 : 0.14}
      frame={mobile ? 0.95 : 0.74}
      // A wheel picked during a pit stop is a tap on it, and the camera rides with the car on a lap: neither flies the camera to a part.
      focusOnSelect={!pit.active && !lap.active}
    >
      {year === 2026 && <LiveryLayer />}
      <PitStopMount />
      <LapMount />
    </ExplodeStage>
  );
}
