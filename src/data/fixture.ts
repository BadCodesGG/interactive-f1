import { parseSidecar } from "@/engine/explode/sidecar";
import json from "./fixture.sidecar.json";

/** The fixture's sidecar, validated at build time: a malformed sidecar fails `next build`. */
export const fixtureSidecar = parseSidecar(json, "fixture.sidecar.json");
export { copyBook as fixtureCopy } from "./fixture.copy";
