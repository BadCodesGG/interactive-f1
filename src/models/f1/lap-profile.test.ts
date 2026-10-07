import { describe, expect, it } from "vitest";
import { activeAero, baselineSetup, evaluate, G, tyreModel } from "@/data/aero";
import { accelerationAt, aeroModeAt, buildProfile, classifyStraights, showcaseDistance, speedAt, START_SPEED, timeAt } from "./lap-profile";
import { buildTrack, cellLength, sampleAt } from "./lap-track";

const track = buildTrack();
const profile = buildProfile(track);
const corner = evaluate({ ...baselineSetup, mode: "corner" });
const straightMode = evaluate({ ...baselineSetup, mode: "straight" });

/** Distance of the tightest sample, and of the middle of each straight that wings open on. */
const apex = (() => {
  let at = 0;
  for (let i = 0; i < track.count; i++) if (Math.abs(track.curvature[i]) > Math.abs(track.curvature[at])) at = i;
  return at * track.step;
})();

describe("the speed profile", () => {
  it("starts from the pit-lane limit", () => {
    expect(profile.speed[0]).toBeCloseTo(START_SPEED, 9);
    expect(speedAt(profile, 0)).toBeCloseTo(START_SPEED, 9);
  });

  it("is fast on the straights and slow in the corners", () => {
    const hairpin = speedAt(profile, apex) * 3.6;
    const straight = speedAt(profile, showcaseDistance(profile)) * 3.6;
    expect(straight).toBeGreaterThan(280);
    expect(hairpin).toBeLessThan(140);
    expect(straight).toBeGreaterThan(hairpin * 2);
  });

  it("never carries more speed through a bend than the tyres hold, or more than the car's top speed", () => {
    for (let i = 0; i < track.count; i++) {
      const k = Math.abs(track.curvature[i]);
      if (k > 1 / 700) expect(profile.speed[i]).toBeLessThanOrEqual(corner.cornerSpeedKmh(1 / k) / 3.6 + 1e-6);
      expect(profile.speed[i]).toBeLessThanOrEqual(straightMode.topSpeedKmh / 3.6 + 1e-6);
    }
    // The lateral acceleration it asks of the car stays inside the tyre model's cap.
    for (let i = 0; i < track.count; i++) expect(profile.speed[i] ** 2 * Math.abs(track.curvature[i])).toBeLessThanOrEqual(tyreModel.maxLateralG * G + 1e-6);
  });

  it("brakes no harder than the tyres allow and accelerates no harder than the power allows", () => {
    for (let i = 0; i < track.count; i++) {
      expect(profile.accel[i]).toBeGreaterThanOrEqual(-tyreModel.maxBrakingG * G - 1e-6);
      expect(profile.accel[i]).toBeLessThan(20);
    }
  });

  it("integrates to a lap time: the sum of each cell's length over its mean speed", () => {
    let sum = 0;
    for (let i = 0; i < track.count; i++) sum += cellLength(track, i) / (0.5 * (profile.speed[i] + profile.speed[i + 1]));
    expect(profile.lapSeconds).toBeCloseTo(sum, 9);
    expect(timeAt(profile, track.length)).toBeCloseTo(profile.lapSeconds, 9);
    expect(timeAt(profile, 0)).toBe(0);
    // A lap of a bit under three kilometres at these speeds.
    expect(profile.lapSeconds).toBeGreaterThan(40);
    expect(profile.lapSeconds).toBeLessThan(80);
  });

  it("slows into the hairpin before it gets there", () => {
    const before = speedAt(profile, apex - 200);
    expect(before).toBeGreaterThan(speedAt(profile, apex - 40));
    expect(accelerationAt(profile, apex - 60)).toBeLessThan(-20);
  });
});

describe("the wing mode", () => {
  it("finds the straights long enough to open on", () => {
    const { openable } = classifyStraights(track);
    let longest = 0;
    let run = 0;
    let runs = 0;
    for (let i = 0; i < track.count; i++) {
      if (openable[i]) {
        run += track.step;
        longest = Math.max(longest, run);
      } else {
        if (run > 0) runs++;
        run = 0;
      }
    }
    expect(longest).toBeGreaterThanOrEqual(activeAero.minStraightM);
    expect(runs + (run > 0 ? 1 : 0)).toBeGreaterThanOrEqual(2);
  });

  it("does not open on a straight shorter than the minimum", () => {
    const { openable } = classifyStraights(track, 10000);
    expect(openable.every((v) => v === 0)).toBe(true);
    const all = classifyStraights(track, 0);
    expect(all.openable.some((v) => v === 1)).toBe(true);
  });

  it("is Straight Mode at the middle of a long straight", () => {
    expect(aeroModeAt(profile, showcaseDistance(profile))).toBe("straight");
    expect(aeroModeAt(profile, 100)).toBe("straight");
  });

  it("is Corner Mode at the apex of a corner", () => {
    expect(aeroModeAt(profile, apex)).toBe("corner");
  });

  it("closes to Corner Mode in the braking zone at the end of a straight, while the road is still straight", () => {
    let found = false;
    for (let i = 0; i < track.count; i++) {
      if (profile.openable[i] && profile.braking[i]) {
        found = true;
        expect(aeroModeAt(profile, i * track.step)).toBe("corner");
      }
    }
    expect(found).toBe(true);
  });

  it("is Straight Mode again on the same straight just before the braking zone", () => {
    let zone = -1;
    for (let i = 0; i < track.count; i++) if (profile.openable[i] && profile.braking[i]) { zone = i; break; }
    expect(aeroModeAt(profile, (zone - 12) * track.step)).toBe("straight");
  });
});

describe("showcaseDistance", () => {
  it("is on a straight, with the wings open, at speed", () => {
    const s = showcaseDistance(profile);
    expect(sampleAt(track, s).curvature).toBeCloseTo(0, 9);
    expect(aeroModeAt(profile, s)).toBe("straight");
    expect(speedAt(profile, s) * 3.6).toBeGreaterThan(200);
  });
});
