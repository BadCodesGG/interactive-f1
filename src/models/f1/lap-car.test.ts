import { describe, expect, it } from "vitest";
import {
  bodyPose,
  createRun,
  formatLapTime,
  FLAP_SECONDS,
  flapAngles,
  MAX_STEER,
  MAX_TRAVEL,
  poseOf,
  steerAngles,
  stepFlap,
  stepRun,
  suspensionCorners,
  WHEEL_RADIUS,
  wheelSpinAngle,
  wheelSpinRate,
} from "./lap-car";
import { aeroModeAt, buildProfile, showcaseDistance } from "./lap-profile";
import { buildTrack } from "./lap-track";

const DEG = Math.PI / 180;

describe("wheel spin", () => {
  it("turns one radian for one radius of road", () => {
    expect(wheelSpinAngle(WHEEL_RADIUS)).toBeCloseTo(1, 9);
    expect(wheelSpinAngle(WHEEL_RADIUS * 2.5)).toBeCloseTo(2.5, 9);
  });

  it("comes back to zero after one circumference", () => {
    const circumference = 2 * Math.PI * WHEEL_RADIUS;
    expect(wheelSpinAngle(circumference + 0.1 * WHEEL_RADIUS)).toBeCloseTo(0.1, 9);
  });

  it("spins at the speed over the radius: 83 m/s is 225 rad/s on a 0.369 m tyre", () => {
    expect(wheelSpinRate(83)).toBeCloseTo(224.9, 1);
    expect(wheelSpinRate(0)).toBe(0);
  });
});

describe("steering", () => {
  it("is straight on a straight", () => {
    expect(steerAngles(0)).toEqual({ left: 0, right: 0 });
  });

  it("turns left for a left-hand bend and right for a right-hand one, by the same amount mirrored", () => {
    const l = steerAngles(1 / 45);
    const r = steerAngles(-1 / 45);
    expect(l.left).toBeGreaterThan(0);
    expect(l.right).toBeGreaterThan(0);
    expect(r.left).toBeCloseTo(-l.right, 9);
    expect(r.right).toBeCloseTo(-l.left, 9);
  });

  it("follows the curvature: a worked hairpin of 45 m radius", () => {
    // The bicycle angle atan(3.4 / 45 / (1 -/+ 0.772 / 45)), times the visual gain of 3.
    const a = steerAngles(1 / 45);
    expect(a.left).toBeCloseTo(0.2302, 3);
    expect(a.right).toBeCloseTo(0.2224, 3);
  });

  it("turns the inside wheel more than the outside", () => {
    const a = steerAngles(1 / 45);
    expect(a.left).toBeGreaterThan(a.right);
  });

  it("turns more for a tighter bend and never past the stop", () => {
    expect(steerAngles(1 / 40).left).toBeGreaterThan(steerAngles(1 / 120).left);
    expect(steerAngles(1 / 3).left).toBe(MAX_STEER);
    expect(steerAngles(-1 / 3).right).toBe(-MAX_STEER);
  });
});

describe("suspension", () => {
  it("sits level at rest", () => {
    expect(suspensionCorners(0, 0, 0)).toEqual({ fl: 0, fr: 0, rl: 0, rr: 0 });
  });

  it("compresses the front and lightens the rear under braking", () => {
    const c = suspensionCorners(-45, 0, 60);
    expect(c.fl).toBeGreaterThan(0.02);
    expect(c.fl).toBe(c.fr);
    expect(c.rl).toBeLessThan(c.fl);
    expect(bodyPose(c).pitch).toBeGreaterThan(0);
  });

  it("squats the rear under power", () => {
    const c = suspensionCorners(12, 0, 40);
    expect(c.rl).toBeGreaterThan(c.fl);
    expect(bodyPose(c).pitch).toBeLessThan(0);
  });

  it("loads the right wheels in a left-hand bend, and rolls the body off the left", () => {
    const c = suspensionCorners(0, 40, 50);
    expect(c.fr).toBeGreaterThan(c.fl);
    expect(c.rr).toBeGreaterThan(c.rl);
    expect(bodyPose(c).roll).toBeLessThan(0);
    const mirrored = suspensionCorners(0, -40, 50);
    expect(bodyPose(mirrored).roll).toBeCloseTo(-bodyPose(c).roll, 9);
  });

  it("sinks with speed alone, by downforce", () => {
    expect(suspensionCorners(0, 0, 90).fl).toBeGreaterThan(suspensionCorners(0, 0, 30).fl);
    expect(bodyPose(suspensionCorners(0, 0, 90)).heave).toBeGreaterThan(0.01);
  });

  it("stays in a few centimetres of travel however hard it is pushed", () => {
    const c = suspensionCorners(-90, 90, 100);
    for (const v of Object.values(c)) expect(Math.abs(v)).toBeLessThanOrEqual(MAX_TRAVEL);
    expect(Math.abs(bodyPose(c).pitch)).toBeLessThan(0.05);
    expect(Math.abs(bodyPose(c).roll)).toBeLessThan(0.08);
  });
});

describe("the flaps", () => {
  it("opens over FLAP_SECONDS on a straight and closes over the same in a corner", () => {
    let open = 0;
    open = stepFlap(open, "straight", FLAP_SECONDS / 2);
    expect(open).toBeCloseTo(0.5, 9);
    open = stepFlap(open, "straight", FLAP_SECONDS);
    expect(open).toBe(1);
    open = stepFlap(open, "corner", FLAP_SECONDS / 4);
    expect(open).toBeCloseTo(0.75, 9);
    open = stepFlap(open, "corner", 10);
    expect(open).toBe(0);
  });

  it("shut is Corner Mode, open is the tunnel's Straight Mode: rear flap -24 deg, front -14 deg", () => {
    expect(flapAngles(0)).toEqual({ front: 0, rear: 0 });
    expect(flapAngles(1).rear).toBeCloseTo(-24 * DEG, 9);
    expect(flapAngles(1).front).toBeCloseTo(-14 * DEG, 9);
    expect(flapAngles(0.5).rear).toBeCloseTo(-12 * DEG, 9);
  });

  it("eases between the two poses by the same curve at every opening (pinned: these are the numbers before the poses were computed once)", () => {
    const at = (open: number) => flapAngles(open);
    expect(at(0.25).front).toBeCloseTo(-0.038179077387375956, 12);
    expect(at(0.25).rear).toBeCloseTo(-0.06544984694978737, 12);
    expect(at(1).front).toBeCloseTo(-0.24434609527920614, 12);
    expect(at(1).rear).toBeCloseTo(-0.4188790204786391, 12);
  });

  it("gives the same answer however often it is asked, and a fresh object each time", () => {
    const a = flapAngles(0.7);
    const b = flapAngles(0.7);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe("a run round the lap", () => {
  const track = buildTrack();
  const profile = buildProfile(track);
  const finish = (dt: number, from = 0) => {
    const run = createRun(profile, from);
    let guard = 0;
    while (run.lap === null && guard++ < 1e6) stepRun(run, dt);
    return run;
  };

  it("times the lap as the profile does, whatever the step", () => {
    for (const dt of [1 / 240, 1 / 60, 1 / 20]) expect(Math.abs(finish(dt).lap! - profile.lapSeconds)).toBeLessThan(0.1);
  });

  it("pins the lap: 44.4945 s at 60 steps a second, and the car's pose twenty seconds in (the numbers from before the poses were computed once)", () => {
    const run = createRun(profile);
    for (let i = 0; i < 1200; i++) stepRun(run, 1 / 60);
    const pose = poseOf(run);
    expect(pose.x).toBeCloseTo(577.0437793831891, 9);
    expect(pose.y).toBeCloseTo(507.8426343658644, 9);
    expect(pose.heading).toBeCloseTo(2.835235088432193, 9);
    expect(pose.curvature).toBeCloseTo(0.006666666666666667, 12);
    expect(pose.speedKmh).toBeCloseTo(274.3243002438157, 9);
    expect(pose.spin).toBeCloseTo(1.6218544286380094, 9);
    expect(pose.steer.left).toBeCloseTo(0.06833996022497507, 12);
    expect(pose.body.roll).toBeCloseTo(-0.030366260880374762, 12);
    expect(pose.yawRate).toBeCloseTo(0.5080079634144734, 12);
    expect(finish(1 / 60).lap!).toBeCloseTo(44.494545525877626, 9);
  });

  it("adds up the lap clock a step at a time", () => {
    const run = createRun(profile);
    for (let i = 0; i < 120; i++) stepRun(run, 1 / 60);
    expect(run.t).toBeCloseTo(2, 9);
    expect(poseOf(run).lapSeconds).toBeCloseTo(2, 9);
  });

  it("starts a still lap part way round with the clock where the profile had it", () => {
    const from = showcaseDistance(profile);
    const run = createRun(profile, from);
    expect(run.t).toBeGreaterThan(10);
    const pose = poseOf(run);
    expect(pose.mode).toBe("straight");
    expect(pose.flap).toBe(1);
    expect(pose.speedKmh).toBeGreaterThan(250);
    expect(Math.abs(finish(1 / 60, from).lap! - profile.lapSeconds)).toBeLessThan(0.1);
  });

  it("does nothing for a step of no time", () => {
    const run = createRun(profile);
    stepRun(run, 0);
    expect(run.s).toBe(0);
    expect(run.t).toBe(0);
  });

  it("rolls the wheels the distance it drives", () => {
    const run = createRun(profile);
    for (let i = 0; i < 300; i++) stepRun(run, 1 / 60);
    expect(poseOf(run).spin).toBeCloseTo(wheelSpinAngle(run.s), 9);
    expect(run.travelled).toBeCloseTo(run.s, 9);
  });

  it("opens the flaps on the straights and closes them for the braking zone and the hairpin", () => {
    const run = createRun(profile);
    let hairpin = 0;
    for (let i = 0; i < track.count; i++) if (Math.abs(track.curvature[i]) > Math.abs(track.curvature[hairpin])) hairpin = i;
    const openAt: number[] = [];
    let closedAtHairpin = false;
    let closingInBrakes = false;
    while (run.lap === null) {
      stepRun(run, 1 / 60);
      const i = Math.min(track.count - 1, Math.floor(run.s / track.step));
      if (aeroModeAt(profile, run.s) === "straight" && run.flap === 1) openAt.push(run.s);
      if (Math.abs(i - hairpin) < 3 && run.flap === 0) closedAtHairpin = true;
      if (profile.braking[i] && profile.openable[i] && run.flap > 0 && run.flap < 1) closingInBrakes = true;
    }
    expect(openAt.some((s) => s < 600)).toBe(true);
    expect(openAt.some((s) => s > 1334 && s < 2200)).toBe(true);
    expect(closedAtHairpin).toBe(true);
    expect(closingInBrakes).toBe(true);
  });

  it("brakes to a halt after the line, flaps shut, and stops the lap clock at the line", () => {
    const run = finish(1 / 60);
    const lap = run.lap!;
    expect(run.phase).toBe("cooldown");
    let guard = 0;
    while (run.phase !== "stopped" && guard++ < 10000) stepRun(run, 1 / 60);
    expect(run.phase).toBe("stopped");
    expect(run.speed).toBe(0);
    expect(run.lap).toBe(lap);
    expect(poseOf(run).lapSeconds).toBe(lap);
    expect(poseOf(run).finished).toBe(true);
    expect(run.flap).toBe(0);
    // From 174 km/h (48 m/s) at 30 m/s squared it stops about 40 m past the line.
    expect(run.s - track.length).toBeGreaterThan(20);
    expect(run.s - track.length).toBeLessThan(200);
  });

  it("dives the nose when it brakes and rolls the body away from the bend", () => {
    const run = createRun(profile);
    let maxPitch = -Infinity;
    let minRoll = Infinity;
    while (run.lap === null) {
      stepRun(run, 1 / 60);
      const pose = poseOf(run);
      maxPitch = Math.max(maxPitch, pose.body.pitch);
      minRoll = Math.min(minRoll, pose.body.roll);
    }
    expect(maxPitch).toBeGreaterThan(0.005);
    expect(minRoll).toBeLessThan(-0.002);
  });
});

describe("formatLapTime", () => {
  it("reads minutes, seconds and tenths, and never rounds a time up to the next tenth", () => {
    expect(formatLapTime(0)).toBe("0:00.0");
    expect(formatLapTime(44.49)).toBe("0:44.4");
    expect(formatLapTime(65.3)).toBe("1:05.3");
    expect(formatLapTime(600)).toBe("10:00.0");
    expect(formatLapTime(-1)).toBe("0:00.0");
  });
});
