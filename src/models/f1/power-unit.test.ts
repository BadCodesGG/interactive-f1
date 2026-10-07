import * as THREE from "three";
import { describe, expect, it } from "vitest";
import sidecar from "@/data/f1.sidecar.json";
import { createPowerUnit } from "./power-unit";

const procedural = Object.entries(sidecar.parts as Record<string, { procedural?: boolean }>)
  .filter(([, p]) => p.procedural)
  .map(([id]) => id);

// The car's engine bay and sidepods, in metres (measured from the built model): chassis, sidepods
// and engine cover together span this box. Every power unit part must sit inside it at rest.
const ENVELOPE = new THREE.Box3(new THREE.Vector3(-0.95, 0.03, -0.83), new THREE.Vector3(2.16, 1.1, 0.83));

describe("createPowerUnit", () => {
  it("names exactly the sidecar's procedural parts", () => {
    const { names } = createPowerUnit();
    expect([...names].sort()).toEqual([...procedural].sort());
  });

  it("gives each name one object with visible geometry inside the car's body", () => {
    const { group, names } = createPowerUnit();
    group.updateMatrixWorld(true);
    for (const name of names) {
      const found: THREE.Object3D[] = [];
      group.traverse((o) => o.name === name && found.push(o));
      expect(found, name).toHaveLength(1);
      let meshes = 0;
      found[0].traverse((o) => (o as THREE.Mesh).isMesh && meshes++);
      expect(meshes, name).toBeGreaterThan(0);
      const box = new THREE.Box3().setFromObject(found[0]);
      expect(box.isEmpty(), name).toBe(false);
      expect(ENVELOPE.containsBox(box), `${name} ${JSON.stringify(box)}`).toBe(true);
    }
  });

  it("ends the engine's gold cam covers by x 1.12, where the engine cover has narrowed too far to hold their corners", () => {
    const { group } = createPowerUnit();
    group.updateMatrixWorld(true);
    const ice = group.getObjectByName("pu-ice")!;
    let seen = 0;
    ice.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || (mesh.material as THREE.Material).name !== "pu-accent") return;
      seen++;
      expect(new THREE.Box3().setFromObject(mesh).max.x).toBeLessThanOrEqual(1.12);
    });
    expect(seen).toBeGreaterThan(0);
  });

  it("is bright enough to read in the dark studio: every metal and the trim are at least mid-grey, and only the rubber bladder stays dark", () => {
    const { group } = createPowerUnit();
    const seen = new Map<string, number>();
    group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m) seen.set(m.name, new THREE.Color().copy(m.color).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace).l);
    });
    for (const [name, lightness] of seen) {
      if (name === "pu-rubber") continue;
      expect(lightness, name).toBeGreaterThanOrEqual(0.22);
    }
    for (const name of ["pu-metal", "pu-alloy", "pu-accent"]) expect(seen.get(name), name).toBeGreaterThanOrEqual(0.5);
  });

  it("uses standard materials, so the stage can tint and dim every part", () => {
    const { group } = createPowerUnit();
    group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) expect((m as THREE.MeshStandardMaterial).isMeshStandardMaterial).toBe(true);
    });
  });
});
