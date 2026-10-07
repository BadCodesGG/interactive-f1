/**
 * The rake itself, in the tunnel: a thin dark vertical bar standing upstream of each comb of nozzles,
 * with a small stub reaching out from it to every nozzle tip, so the smoke visibly comes from
 * something. Subtle hardware, lit like the rest of the scene.
 */
import * as THREE from "three";
import { NOZZLE_STUB, type Nozzle } from "./rake";

const BAR = { width: 0.02, depth: 0.04 };
const STUB_RADIUS = 0.01;
const OVERHANG = 0.09;

export function buildRakeHardware(nozzles: readonly Nozzle[]): THREE.Group {
  const group = new THREE.Group();
  group.name = "__tunnel_rake";
  const material = new THREE.MeshStandardMaterial({ color: "#4b5364", roughness: 0.45, metalness: 0.7 });
  // Nozzles that share an (x, z) hang from one bar.
  const columns = new Map<string, Nozzle[]>();
  for (const n of nozzles) columns.set(`${n.x}:${n.z}`, [...(columns.get(`${n.x}:${n.z}`) ?? []), n]);

  const stubs = new THREE.InstancedMesh(new THREE.CylinderGeometry(STUB_RADIUS, STUB_RADIUS, NOZZLE_STUB, 10), material, nozzles.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  nozzles.forEach((n, i) => stubs.setMatrixAt(i, m.compose(new THREE.Vector3(n.x - NOZZLE_STUB / 2, n.y, n.z), q, new THREE.Vector3(1, 1, 1))));
  group.add(stubs);

  for (const column of columns.values()) {
    const top = Math.max(...column.map((n) => n.y)) + OVERHANG;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(BAR.width, top, BAR.depth), material);
    bar.position.set(column[0].x - NOZZLE_STUB - BAR.width / 2, top / 2, column[0].z);
    group.add(bar);
  }
  group.traverse((o) => (o.raycast = () => {}));
  return group;
}

export function disposeRakeHardware(group: THREE.Group): void {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });
}
