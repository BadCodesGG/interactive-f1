import { describe, expect, it } from "vitest";
import {
  BEST_KEY,
  current,
  describeStep,
  elapsed,
  formatTime,
  idle,
  LIFT,
  offsetOf,
  parseBest,
  PENALTY_MS,
  pause,
  poseAfter,
  readBest,
  recordBest,
  resume,
  start,
  STEPS,
  tap,
  WHEEL_OUT,
  WHEELS,
  type BestStorage,
  type Round,
  type Target,
} from "./pit-stop";

/** Taps every step's own target in order, `gap` ms apart, from a round started at 0. */
function perfect(gap: number): Round {
  let r = start(0);
  STEPS.forEach((s, i) => (r = tap(r, s.target, (i + 1) * gap)));
  return r;
}

const memory = (initial: Record<string, string> = {}): BestStorage & { data: Record<string, string> } => {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};
const broken: BestStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("the steps of a stop", () => {
  it("jacks up, takes the four wheels off in order, puts them on in order, and jacks down", () => {
    expect(STEPS.map((s) => `${s.target}:${s.action}`)).toEqual(["jack:up", ...WHEELS.map((w) => `${w}:off`), ...WHEELS.map((w) => `${w}:on`), "jack:down"]);
  });

  it("describes each step in words", () => {
    expect(describeStep(STEPS[0])).toBe("Jack up");
    expect(describeStep(STEPS[1])).toBe("Gun off: front left wheel");
    expect(describeStep(STEPS[8])).toBe("Gun on: rear right wheel");
    expect(describeStep(STEPS[9])).toBe("Jack down");
  });
});

describe("a round", () => {
  it("does nothing before it starts", () => {
    const r = idle();
    expect(current(r)).toBeNull();
    expect(tap(r, "jack", 100)).toBe(r);
    expect(elapsed(r, 5000)).toBe(0);
  });

  it("counts from the start, and asks for the jack first", () => {
    const r = start(1000);
    expect(r.phase).toBe("running");
    expect(elapsed(r, 1750)).toBe(750);
    expect(current(r)).toEqual({ target: "jack", action: "up" });
  });

  it("advances on the right tap and records a split", () => {
    let r = start(0);
    r = tap(r, "jack", 400);
    expect(r.step).toBe(1);
    expect(r.splits).toEqual([400]);
    expect(current(r)).toEqual({ target: "front-left-wheel", action: "off" });
  });

  it("charges the penalty for a wrong tap, moves nothing, and keeps asking for the same step", () => {
    let r = start(0);
    r = tap(r, "rear-right-wheel", 300);
    expect(r.step).toBe(0);
    expect(r.mistakes).toBe(1);
    expect(elapsed(r, 300)).toBe(300 + PENALTY_MS);
    r = tap(r, "front-left-wheel", 400);
    expect(r.mistakes).toBe(2);
    expect(elapsed(r, 400)).toBe(400 + 2 * PENALTY_MS);
  });

  it("finishes on the last step with the clock stopped, penalties in the final time", () => {
    let r = start(0);
    r = tap(r, "front-left-wheel", 100); // wrong: the jack is first
    STEPS.forEach((s, i) => (r = tap(r, s.target, 200 + i * 100)));
    expect(r.phase).toBe("done");
    expect(r.step).toBe(STEPS.length);
    expect(r.splits).toHaveLength(STEPS.length);
    expect(r.final).toBe(200 + 9 * 100 + PENALTY_MS);
    expect(elapsed(r, 99_999)).toBe(r.final);
    expect(current(r)).toBeNull();
  });

  it("takes no taps once done", () => {
    const r = perfect(300);
    expect(tap(r, "jack", 99_999)).toBe(r);
  });

  it("times a clean stop as the sum of its gaps", () => {
    expect(perfect(300).final).toBe(3000);
  });
});

describe("pausing", () => {
  it("freezes the clock and counts none of the time spent paused", () => {
    let r = start(0);
    r = pause(r, 1000);
    expect(r.phase).toBe("paused");
    expect(elapsed(r, 9000)).toBe(1000);
    r = resume(r, 9000);
    expect(r.phase).toBe("running");
    expect(elapsed(r, 9500)).toBe(1500);
  });

  it("takes no taps while paused, not even a wrong one", () => {
    const r = pause(start(0), 500);
    expect(tap(r, "jack", 600)).toBe(r);
    expect(tap(r, "rear-left-wheel", 600)).toBe(r);
  });

  it("ignores a pause that is not running, a resume that is not paused, and a pause of a round that is done", () => {
    const i = idle();
    expect(pause(i, 10)).toBe(i);
    expect(resume(i, 10)).toBe(i);
    const running = start(0);
    expect(resume(running, 10)).toBe(running);
    const done = perfect(100);
    expect(pause(done, 5000)).toBe(done);
  });

  it("carries penalties across a pause", () => {
    let r = start(0);
    r = tap(r, "rear-left-wheel", 200);
    r = pause(r, 300);
    r = resume(r, 5000);
    expect(elapsed(r, 5100)).toBe(300 + PENALTY_MS + 100);
  });
});

describe("the pose of the car", () => {
  it("starts grounded with every wheel on", () => {
    expect(poseAfter(0)).toEqual({ lifted: false, off: [] });
  });

  it("lifts on the first step, takes wheels off one by one, and puts them back in order", () => {
    expect(poseAfter(1)).toEqual({ lifted: true, off: [] });
    expect(poseAfter(3)).toEqual({ lifted: true, off: ["front-left-wheel", "front-right-wheel"] });
    expect(poseAfter(5).off).toEqual([...WHEELS]);
    expect(poseAfter(6).off).toEqual(["front-right-wheel", "rear-left-wheel", "rear-right-wheel"]);
    expect(poseAfter(9)).toEqual({ lifted: true, off: [] });
    expect(poseAfter(10)).toEqual({ lifted: false, off: [] });
  });

  it("is safe for counts outside the stop", () => {
    expect(poseAfter(-3)).toEqual(poseAfter(0));
    expect(poseAfter(99)).toEqual(poseAfter(STEPS.length));
  });

  it("offsets a wheel that is off to its own side, at ground level, and lifts everything else", () => {
    const pose = poseAfter(3);
    expect(offsetOf("front-left-wheel", pose)).toEqual([0, 0, WHEEL_OUT]);
    expect(offsetOf("front-right-wheel", pose)).toEqual([0, 0, -WHEEL_OUT]);
    expect(offsetOf("rear-left-wheel", pose)).toEqual([0, LIFT, 0]);
    expect(offsetOf("bodywork", pose)).toEqual([0, LIFT, 0]);
    expect(offsetOf("bodywork", poseAfter(10))).toEqual([0, 0, 0]);
  });
});

describe("the best time", () => {
  it("reads only a sane stored number", () => {
    expect(parseBest("4310")).toBe(4310);
    expect(parseBest("4310.5")).toBe(4310.5);
    for (const bad of [null, "", "0", "-5", "abc", "NaN", "Infinity", "1e9", "99999999", "4,3", " 4310", "0x10"]) expect(parseBest(bad), String(bad)).toBeNull();
  });

  it("reads from the namespaced key, and survives storage that throws", () => {
    expect(readBest(memory({ [BEST_KEY]: "2840" }))).toBe(2840);
    expect(readBest(memory({ best: "2840" }))).toBeNull();
    expect(readBest(broken)).toBeNull();
    expect(readBest(null)).toBeNull();
  });

  it("keeps the first time, then only a faster one", () => {
    const s = memory();
    expect(recordBest(5000, null, s)).toEqual({ best: 5000, isBest: true });
    expect(s.data[BEST_KEY]).toBe("5000");
    expect(recordBest(5200, 5000, s)).toEqual({ best: 5000, isBest: false });
    expect(recordBest(5000, 5000, s)).toEqual({ best: 5000, isBest: false });
    expect(recordBest(4321.4, 5000, s)).toEqual({ best: 4321, isBest: true });
    expect(s.data[BEST_KEY]).toBe("4321");
  });

  it("still names the record when storage refuses it", () => {
    expect(recordBest(3000, null, broken)).toEqual({ best: 3000, isBest: true });
    expect(recordBest(3000, null, null)).toEqual({ best: 3000, isBest: true });
  });

  it("formats times to hundredths, and a missing one as a dash", () => {
    expect(formatTime(4310)).toBe("4.31 s");
    expect(formatTime(0)).toBe("0.00 s");
    expect(formatTime(null)).toBe("—");
    expect(formatTime(Number.NaN)).toBe("—");
  });
});

describe("targets", () => {
  it("are the four wheel parts of the sidecar and the jack", () => {
    const all: Target[] = [...WHEELS, "jack"];
    expect(new Set(STEPS.map((s) => s.target))).toEqual(new Set(all));
  });
});
