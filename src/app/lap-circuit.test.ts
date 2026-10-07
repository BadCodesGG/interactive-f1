import { readFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildTrack, ROAD_WIDTH } from "@/models/f1/lap-track";
import { contrast } from "@/models/f1/livery-accent";
import { circuitGeometry, CIRCUIT_COLOURS, EXPOSURE, forNeutralTone, GROUND_MARGIN, KERB_WIDTH, RUNOFF_WIDTH, ZONE } from "./lap-circuit";

const track = buildTrack();
const g = circuitGeometry(track);
const zone = g.getAttribute("aZone");
const across = g.getAttribute("aAcross");
const along = g.getAttribute("aAlong");
const position = g.getAttribute("position");

/** The vertices of a zone. */
const of = (z: number) => Array.from({ length: zone.count }, (_, i) => i).filter((i) => zone.getX(i) === z);

describe("circuitGeometry", () => {
  it("has the four zones, each a strip a sample long (the ground a quad)", () => {
    expect(of(ZONE.ground)).toHaveLength(4);
    expect(of(ZONE.road)).toHaveLength((track.count + 1) * 2);
    expect(of(ZONE.kerb)).toHaveLength((track.count + 1) * 4);
    expect(of(ZONE.runoff)).toHaveLength((track.count + 1) * 4);
  });

  it("makes the road a road wide, with the distance along the lap, closed on the start", () => {
    const road = of(ZONE.road);
    const [a, b] = road;
    expect(Math.hypot(position.getX(a) - position.getX(b), position.getZ(a) - position.getZ(b))).toBeCloseTo(ROAD_WIDTH, 6);
    expect(along.getX(road.at(-1)!)).toBeCloseTo(track.length, 2);
    const last = road.length - 2;
    expect(position.getX(road[last])).toBeCloseTo(position.getX(a), 4);
    expect(position.getZ(road[last])).toBeCloseTo(position.getZ(a), 4);
  });

  it("puts the run-off beside the road, a run-off wide, and never more kerb than a kerb's width", () => {
    const half = ROAD_WIDTH / 2;
    for (const i of of(ZONE.runoff)) expect(Math.abs(across.getX(i))).toBeGreaterThanOrEqual(half - 1e-6);
    expect(Math.max(...of(ZONE.runoff).map((i) => Math.abs(across.getX(i))))).toBeCloseTo(half + RUNOFF_WIDTH, 6);
    expect(Math.max(...of(ZONE.kerb).map((i) => Math.abs(across.getX(i))))).toBeCloseTo(half + KERB_WIDTH, 6);
  });

  it("has no width of kerb on a straight and the full width in the tightest bend", () => {
    const half = ROAD_WIDTH / 2;
    const kerb = of(ZONE.kerb);
    // Vertices come as (inner, outer) pairs, the left strip first.
    const width = (pair: number) => Math.abs(across.getX(kerb[pair * 2 + 1])) - Math.abs(across.getX(kerb[pair * 2]));
    expect(width(5)).toBeCloseTo(0, 9);
    expect(Math.max(...Array.from({ length: track.count }, (_, i) => width(i)))).toBeCloseTo(KERB_WIDTH, 6);
    expect(Math.abs(across.getX(kerb[0]))).toBeCloseTo(half, 9);
  });

  it("runs the ground past the circuit on every side, further than the haze lets a driver see", () => {
    const xs = of(ZONE.ground).map((i) => position.getX(i));
    const roadXs = of(ZONE.road).map((i) => position.getX(i));
    expect(Math.min(...xs)).toBeLessThan(Math.min(...roadXs) - GROUND_MARGIN + ROAD_WIDTH);
    expect(Math.max(...xs)).toBeGreaterThan(Math.max(...roadXs) + GROUND_MARGIN - ROAD_WIDTH);
  });
});

/** Khronos Neutral tone mapping, as three's shader has it (for a colour below its compression). */
function neutral(c: number[], exposure: number): number[] {
  const x = c.map((v) => v * exposure);
  const m = Math.min(...x);
  const offset = m < 0.08 ? m - 6.25 * m * m : 0.04;
  return x.map((v) => v - offset);
}

describe("forNeutralTone", () => {
  it("comes back as the colour it was given once the stage's exposure and tone mapping have had it", () => {
    for (const hex of ["#4d5159", "#3b424d", "#0e1013", "#050706", "#bfb9a5", "#88a272"]) {
      for (const exposure of [0.8, 1]) {
        const want = new THREE.Color(hex);
        const got = neutral(forNeutralTone(hex, exposure).toArray(), exposure);
        expect(got[0]).toBeCloseTo(want.r, 6);
        expect(got[1]).toBeCloseTo(want.g, 6);
        expect(got[2]).toBeCloseTo(want.b, 6);
      }
    }
  });

  it("uses the exposures the stage renders each theme with", () => {
    const stage = readFileSync(path.join(process.cwd(), "src", "app", "stage.tsx"), "utf8");
    expect(stage).toMatch(new RegExp(`dark: \\{[^\\n]*exposure: ${EXPOSURE.dark},`));
    expect(stage).toMatch(new RegExp(`light: \\{[^\\n]*exposure: ${EXPOSURE.light},`));
  });
});

describe("the circuit's colours", () => {
  it("has the road clearly darker than the run-off and the ground in the daytime, and lit against dark surroundings at night", () => {
    const { light, dark } = CIRCUIT_COLOURS;
    expect(contrast(light.road, light.runoff)).toBeGreaterThan(2.5);
    expect(contrast(light.road, light.ground)).toBeGreaterThan(1.8);
    expect(contrast(dark.road, dark.runoff)).toBeGreaterThan(1.8);
    expect(contrast(dark.road, dark.ground)).toBeGreaterThan(1.8);
  });

  it("has edge lines and kerbs that stand out from the road in both themes", () => {
    for (const c of Object.values(CIRCUIT_COLOURS)) {
      expect(contrast(c.line, c.road)).toBeGreaterThan(3);
      expect(contrast(c.kerbA, c.kerbB)).toBeGreaterThan(2);
      expect(contrast(c.kerbB, c.road)).toBeGreaterThan(3);
    }
  });
});
