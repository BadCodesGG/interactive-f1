/**
 * Bakes the wind tunnel's signed distance field: the assembled car (the GLB named by
 * src/data/f1-tunnel.json, in metres) on a 96 x 40 x 48 grid over [-3, 3] x [0, 1.6] x [-1.2, 1.2].
 *
 * Distance: three-mesh-bvh's closestPointToPoint over every triangle of every part. Sign: the scanned
 * parts are open shells, so a single ray's parity is unreliable; a cell counts as inside when at
 * least two of three axis rays (+y, -y, +z) cross the surface an odd number of times.
 *
 * Writes public/models/f1-sdf.<8-char hash>.bin (format in src/models/f1/sdf-format.ts), removes
 * older bakes, and points src/data/f1-tunnel.json at the new file. Run after `npm run models`.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import { decodeSdf, encodeSdf, sampleSdf } from "../src/models/f1/sdf-format.ts";
import { ROOT } from "./lib/dev-server.mjs";

const MODELS = path.join(ROOT, "public", "models");
const OUT_JSON = path.join(ROOT, "src", "data", "f1-tunnel.json");
const DIMS = [96, 40, 48];
const MIN = [-3, 0, -1.2];
const MAX = [3, 1.6, 1.2];
const RANGE = 0.4;

async function loadScene(file) {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import("three/addons/loaders/GLTFLoader.js"),
    import("three/addons/libs/meshopt_decoder.module.js"),
  ]);
  const bytes = readFileSync(file);
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(ab, "")).scene;
}

/** Every mesh in world space as one float geometry (quantised attributes read through getX). */
function mergeWorld(scene) {
  scene.updateMatrixWorld(true);
  const pos = [];
  const idx = [];
  const v = new THREE.Vector3();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position;
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      pos.push(v.x, v.y, v.z);
    }
    const index = o.geometry.index;
    if (index) for (let i = 0; i < index.count; i++) idx.push(base + index.getX(i));
    else for (let i = 0; i < p.count; i++) idx.push(base + i);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

async function main() {
  const tunnel = JSON.parse(readFileSync(OUT_JSON, "utf8"));
  const scene = await loadScene(path.join(ROOT, "public", tunnel.model));
  const geo = mergeWorld(scene);
  const t0 = Date.now();
  const bvh = new MeshBVH(geo);
  const [nx, ny, nz] = DIMS;
  const data = new Uint8Array(nx * ny * nz);
  const p = new THREE.Vector3();
  const ray = new THREE.Ray();
  const dirs = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1)];
  let inside = 0;
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        p.set(
          MIN[0] + ((i + 0.5) / nx) * (MAX[0] - MIN[0]),
          MIN[1] + ((j + 0.5) / ny) * (MAX[1] - MIN[1]),
          MIN[2] + ((k + 0.5) / nz) * (MAX[2] - MIN[2]),
        );
        const hit = bvh.closestPointToPoint(p, undefined, 0, RANGE);
        let d = hit ? hit.distance : RANGE;
        if (d < RANGE) {
          let odd = 0;
          for (const dir of dirs) {
            ray.set(p, dir);
            if (bvh.raycast(ray, THREE.DoubleSide).length % 2 === 1) odd++;
          }
          if (odd >= 2) {
            d = -d;
            inside++;
          }
        }
        data[i + j * nx + k * nx * ny] = Math.round(Math.min(Math.max(0.5 + d / (2 * RANGE), 0), 1) * 255);
      }
    }
  }
  const header = { version: 1, dims: DIMS, min: MIN, max: MAX, range: RANGE, model: tunnel.model };
  const bytes = encodeSdf(header, data);
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 8);
  const file = `f1-sdf.${hash}.bin`;
  for (const old of readdirSync(MODELS).filter((f) => /^f1-sdf\.[0-9a-f]{8}\.bin$/.test(f) && f !== file)) rmSync(path.join(MODELS, old));
  writeFileSync(path.join(MODELS, file), bytes);
  writeFileSync(OUT_JSON, `${JSON.stringify({ ...tunnel, sdf: `/models/${file}` }, null, 2)}\n`);

  const sdf = decodeSdf(bytes.buffer);
  const probe = (x, y, z) => sampleSdf(sdf, x, y, z).toFixed(3);
  console.log(`baked ${nx}x${ny}x${nz} from ${tunnel.model} in ${((Date.now() - t0) / 1000).toFixed(1)} s (${geo.index.count / 3} triangles)`);
  console.log(`inside cells: ${inside} of ${data.length}`);
  console.log(`probe d (m): floor plank ${probe(0, 0.031, 0)}, engine cover ${probe(1, 0.85, 0)}, free air ${probe(-2.8, 1.5, 1)}`);
  console.log(`wrote public/models/${file} (${(bytes.byteLength / 1024).toFixed(1)} KB); src/data/f1-tunnel.json -> /models/${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
