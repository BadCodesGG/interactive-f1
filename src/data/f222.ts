import { parseSidecar } from "@/engine/explode/sidecar";
import json from "./f222.sidecar.json";

/** The 2022 car's sidecar, validated at build time: a malformed sidecar fails `next build`. */
export const f222Sidecar = parseSidecar(json, "f222.sidecar.json");
export { copyBook as f222Copy, f222Groups } from "./f222.copy";
