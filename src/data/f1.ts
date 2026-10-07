import { parseSidecar } from "@/engine/explode/sidecar";
import json from "./f1.sidecar.json";

/** The F1 car's sidecar, validated at build time: a malformed sidecar fails `next build`. */
export const f1Sidecar = parseSidecar(json, "f1.sidecar.json");
export { copyBook as f1Copy, f1Groups } from "./f1.copy";
