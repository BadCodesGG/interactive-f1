import { describe, expect, it } from "vitest";
import { controlsHint, FAILED_NOTE, gateMessage, gateState, OPT_IN_REASON, UNSUPPORTED_NOTE } from "./gate-state";

const base = { probed: null, reduced: false, optIn: false, failed: false, drawn: false };

describe("gateState", () => {
  it("waits for the probe, then loads, then is live", () => {
    expect(gateState(base)).toBe("waiting");
    expect(gateState({ ...base, probed: true })).toBe("loading");
    expect(gateState({ ...base, probed: true, drawn: true })).toBe("live");
  });

  it("holds at opt-in under reduced motion until the visitor loads it", () => {
    expect(gateState({ ...base, reduced: true })).toBe("opt-in");
    expect(gateState({ ...base, reduced: true, probed: true })).toBe("opt-in");
    expect(gateState({ ...base, reduced: true, optIn: true })).toBe("waiting");
    expect(gateState({ ...base, reduced: true, optIn: true, probed: true })).toBe("loading");
  });

  it("reports no WebGL 2 and a failed scene, failure winning", () => {
    expect(gateState({ ...base, probed: false })).toBe("unsupported");
    expect(gateState({ ...base, probed: true, failed: true })).toBe("failed");
    expect(gateState({ ...base, probed: false, failed: true })).toBe("failed");
  });
});

describe("gateMessage", () => {
  it("says something only when the poster is final", () => {
    expect(gateMessage("opt-in")).toBe(OPT_IN_REASON);
    expect(gateMessage("unsupported")).toBe(UNSUPPORTED_NOTE);
    expect(gateMessage("failed")).toBe(FAILED_NOTE);
    for (const s of ["waiting", "loading", "live"] as const) expect(gateMessage(s)).toBeNull();
  });

  it("lets an app replace the opt-in reason only", () => {
    expect(gateMessage("opt-in", "Custom.")).toBe("Custom.");
    expect(gateMessage("failed", "Custom.")).toBe(FAILED_NOTE);
  });
});

describe("controlsHint", () => {
  it("explains controls that are off because the visitor must load, or the view is unavailable", () => {
    expect(controlsHint("opt-in", false)).toMatch(/Load the 3D view/);
    expect(controlsHint("unsupported", false)).toMatch(/unavailable/);
    expect(controlsHint("failed", false)).toMatch(/unavailable/);
  });

  it("stays quiet while the stage is just loading, and once it is ready", () => {
    expect(controlsHint("waiting", false)).toBeNull();
    expect(controlsHint("loading", false)).toBeNull();
    expect(controlsHint("opt-in", true)).toBeNull();
  });
});
