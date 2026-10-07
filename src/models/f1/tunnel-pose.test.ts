import { describe, expect, it } from "vitest";
import { baselineSetup, evaluate, rearWingAngles, score, circuits } from "@/data/aero";
import { tunnelPose } from "./tunnel-pose";

const deg = (d: number) => (d * Math.PI) / 180;

describe("tunnelPose", () => {
  it("leaves the baseline car as modelled", () => {
    const p = tunnelPose(baselineSetup);
    expect(p).toMatchObject({ rearAoA: 0, rearFlap: 0, frontFlap: 0, frontChord: 1, diffuser: 0, bodyLift: 0, halo: true });
  });

  it("turns the rear wing by the chosen angle", () => {
    expect(tunnelPose({ ...baselineSetup, rearWingDeg: 10 }).rearAoA).toBeCloseTo(deg(10));
    expect(tunnelPose({ ...baselineSetup, rearWingDeg: -5 }).rearAoA).toBeCloseTo(deg(-5));
  });

  it("opens the rear flap gap and flattens the front flaps in Straight mode", () => {
    const s = tunnelPose({ ...baselineSetup, mode: "straight" });
    expect(s.rearFlap).toBeLessThan(deg(-15));
    expect(s.frontFlap).toBeLessThan(deg(-10));
  });

  it("scales the front flap chord with the wing variant", () => {
    const low = tunnelPose({ ...baselineSetup, frontWing: "low-drag" }).frontChord;
    const high = tunnelPose({ ...baselineSetup, frontWing: "high-downforce" }).frontChord;
    expect(low).toBeLessThan(1);
    expect(high).toBeGreaterThan(1);
  });

  it("orders the diffuser expansion flat < standard < aggressive", () => {
    const d = (floor: "flat" | "standard" | "aggressive") => tunnelPose({ ...baselineSetup, floor }).diffuser;
    expect(d("flat")).toBeLessThan(d("standard"));
    expect(d("standard")).toBeLessThan(d("aggressive"));
  });

  it("raises the body with ride height, exaggerated five times so millimetres show", () => {
    expect(tunnelPose({ ...baselineSetup, rideHeightMm: 10 }).bodyLift).toBeCloseTo(0.05);
    expect(tunnelPose({ ...baselineSetup, rideHeightMm: -3 }).bodyLift).toBeCloseTo(-0.015);
  });

  it("makes more downwash with a steeper rear wing, and less in Straight mode", () => {
    const w = (rearWingDeg: number, mode: "corner" | "straight" = "corner") => tunnelPose({ ...baselineSetup, rearWingDeg, mode }).downwash;
    expect(w(10)).toBeGreaterThan(w(0));
    expect(w(0)).toBeGreaterThan(w(-10));
    expect(w(0, "straight")).toBeLessThan(w(0) * 0.6);
    expect(w(-10)).toBeGreaterThan(0);
  });

  it("hides the halo when it is switched off", () => {
    expect(tunnelPose({ ...baselineSetup, halo: false }).halo).toBe(false);
  });
});

describe("the rear wing slider", () => {
  const angles: number[] = [];
  for (let d = rearWingAngles.minDeg; d <= rearWingAngles.maxDeg + 1e-9; d += rearWingAngles.sliderStepDeg) angles.push(d);

  it("moves in steps no coarser than a degree, over the whole range", () => {
    expect(rearWingAngles.sliderStepDeg).toBeLessThanOrEqual(1);
    expect(angles.length).toBeGreaterThan(20);
    expect(angles[0]).toBe(rearWingAngles.minDeg);
    expect(angles.at(-1)).toBeCloseTo(rearWingAngles.maxDeg);
  });

  it("drives the flow continuously: the wing's turn and the downwash behind it change at every step, evenly", () => {
    const poses = angles.map((rearWingDeg) => tunnelPose({ ...baselineSetup, rearWingDeg }));
    for (let i = 1; i < poses.length; i++) {
      expect(poses[i].rearAoA).toBeGreaterThan(poses[i - 1].rearAoA);
      expect(poses[i].downwash).toBeGreaterThan(poses[i - 1].downwash);
    }
    const gaps = poses.slice(1).map((p, i) => p.downwash - poses[i].downwash);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 9);
  });

  it("drives the score continuously: downforce and drag rise at every step, evenly, with no jump between the old preset angles", () => {
    const evals = angles.map((rearWingDeg) => evaluate({ ...baselineSetup, rearWingDeg }));
    for (let i = 1; i < evals.length; i++) {
      expect(evals[i].ClA).toBeGreaterThan(evals[i - 1].ClA);
      expect(evals[i].CdA).toBeGreaterThan(evals[i - 1].CdA);
    }
    const gaps = evals.slice(1).map((e, i) => e.ClA - evals[i].ClA);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 9);
  });

  it("changes the lap delta at half a degree, where the five-degree presets would not move at all", () => {
    const at = (rearWingDeg: number) => score({ ...baselineSetup, rearWingDeg }, circuits.balanced).deltaSeconds;
    expect(at(0.5)).not.toBe(at(0));
    expect(at(2.5)).not.toBe(at(0));
    expect(at(2.5)).not.toBe(at(5));
  });
});
