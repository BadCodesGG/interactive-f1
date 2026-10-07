/**
 * What the F1 routes do to the loaded GLB before anything else sees it: add the procedural power
 * unit under the scene root (so the explode plan finds the sidecar's `procedural` parts) and paint
 * the showroom livery. A module function, so it is stable across renders (ExplodeStage `onModel`).
 *
 * The car wears the livery on <html> (`data-livery`, see livery-store.ts: the address, else the remembered
 * choice, else Ghost, decided once before first paint). The showroom pass still dresses what the livery
 * does not paint (tyres, rims, floor), and the AR export is armed to carry the livery.
 */
import type { Object3D } from "three";
import { applyShowroomLivery } from "./livery";
import { applyLiveryDef } from "./livery-apply";
import { armArBake } from "./livery-ar";
import { LIVERIES } from "./liveries";
import { currentLivery } from "./livery-store";
import { createPowerUnit } from "./power-unit";

export function prepareCar(root: Object3D): void {
  // First: it claims the materials it paints, and the showroom pass leaves ones it does not know.
  applyLiveryDef(root, LIVERIES[currentLivery()]);
  applyShowroomLivery(root);
  // The AR export's copy of each painted mesh carries the livery as a texture, and of the showroom's carbon and tyres their colour (livery-ar.ts).
  armArBake(root);
  root.add(createPowerUnit().group);
  root.updateMatrixWorld(true);
}
