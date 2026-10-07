import { readFileSync } from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import f1Json from "@/data/f1.sidecar.json";
import f222Json from "@/data/f222.sidecar.json";
import type { Sidecar } from "@/engine/explode";
import { createPowerUnit } from "./power-unit";

/**
 * The exploded pose as layers: at full explode no two parts' bounding boxes may touch, so the picture
 * reads as a stack of separate pieces (the body above the cockpit above the power unit above the floor,
 * the wheels out to the sides) and never as parts passing through each other. The sidecar's authored
 * vectors are the only thing that decides it (the engine adds nothing for a part with a vector and a
 * group with none), so this measures the model and the procedural power unit at rest and adds them.
 */

const PUBLIC = path.join(process.cwd(), "public");
/** Clear air between any two parts at full explode, metres. */
const GAP = 0.05;

type Box = { min: [number, number, number]; max: [number, number, number] };

async function restBoxes(model: string, withPowerUnit: boolean): Promise<Record<string, Box>> {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const doc = await io.readBinary(new Uint8Array(readFileSync(path.join(PUBLIC, model))));
  const boxes: Record<string, Box> = {};
  for (const node of doc.getRoot().getDefaultScene()!.listChildren()) {
    const b = getBounds(node);
    boxes[node.getName()] = { min: b.min as Box["min"], max: b.max as Box["max"] };
  }
  if (withPowerUnit) {
    const { group } = createPowerUnit();
    group.updateMatrixWorld(true);
    for (const part of group.children) {
      const b = new THREE.Box3().setFromObject(part);
      boxes[part.name] = { min: b.min.toArray(), max: b.max.toArray() };
    }
  }
  return boxes;
}

/** Every pair of parts whose boxes, each moved by its own vector at k = 1, come within GAP of touching. */
export function crowdedPairs(sidecar: Sidecar, rest: Record<string, Box>): string[] {
  const moved = Object.entries(sidecar.parts).map(([id, part]) => {
    const box = rest[id];
    const d = part.explode ?? [0, 0, 0];
    return { id, min: box.min.map((v, i) => v + d[i]), max: box.max.map((v, i) => v + d[i]) };
  });
  const bad: string[] = [];
  for (let i = 0; i < moved.length; i++) {
    for (let j = i + 1; j < moved.length; j++) {
      const a = moved[i];
      const b = moved[j];
      if ([0, 1, 2].every((k) => a.min[k] < b.max[k] + GAP && b.min[k] < a.max[k] + GAP)) bad.push(`${a.id} / ${b.id}`);
    }
  }
  return bad;
}

describe("the 2026 car's exploded layout", () => {
  const sidecar = f1Json as unknown as Sidecar;

  it("gives every part an authored vector, so no part's place depends on the engine's radial default", () => {
    expect(Object.entries(sidecar.parts).filter(([, p]) => !p.explode).map(([id]) => id)).toEqual([]);
    expect(Object.values(sidecar.groups).filter((g) => g.explode)).toEqual([]);
  });

  it("keeps every part clear of every other at full explode", async () => {
    const rest = await restBoxes(sidecar.model, true);
    expect(crowdedPairs(sidecar, rest)).toEqual([]);
  });

  it("detects parts left on top of each other (the check has teeth)", async () => {
    const rest = await restBoxes(sidecar.model, true);
    const assembled: Sidecar = { ...sidecar, parts: Object.fromEntries(Object.entries(sidecar.parts).map(([id, p]) => [id, { ...p, explode: [0, 0, 0] }])) };
    expect(crowdedPairs(assembled, rest).length).toBeGreaterThan(10);
  });
});

describe("the 2022 car's exploded layout", () => {
  const sidecar = f222Json as unknown as Sidecar;

  it("gives every part an authored vector, and has no power unit to lay out", () => {
    expect(Object.entries(sidecar.parts).filter(([, p]) => !p.explode).map(([id]) => id)).toEqual([]);
    expect(Object.values(sidecar.parts).filter((p) => p.procedural)).toEqual([]);
  });

  it("keeps every part clear of every other at full explode", async () => {
    const rest = await restBoxes(sidecar.model, false);
    expect(crowdedPairs(sidecar, rest)).toEqual([]);
  });

  it("names the same parts as the 2026 car's scanned body, so one set of copy and one pit stop fit both", () => {
    const scanned = Object.entries((f1Json as unknown as Sidecar).parts).filter(([, p]) => !p.procedural).map(([id]) => id);
    expect(Object.keys(sidecar.parts).sort()).toEqual(scanned.sort());
  });
});
