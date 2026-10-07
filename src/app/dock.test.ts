import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shortcut, viewWait, waitForAssembled } from "./dock";

describe("viewWait", () => {
  it("says the view is loading while it has not drawn yet", () => {
    for (const state of ["waiting", "loading", "live"] as const) expect(viewWait(state)).toBe("loading");
  });

  it("tells a visitor who has to press Load 3D apart from one who cannot have the view", () => {
    expect(viewWait("opt-in")).toBe("opt-in");
    expect(viewWait("unsupported")).toBe("unavailable");
    expect(viewWait("failed")).toBe("unavailable");
  });
});

describe("shortcut", () => {
  const press = (over: Partial<Parameters<typeof shortcut>[0]> = {}) => shortcut({ key: "J", ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...over });

  it("reads a plain press as its lower-cased key", () => {
    expect(press()).toBe("j");
    expect(press({ key: "Escape" })).toBe("escape");
  });

  it("ignores the auto-repeat of a key held down", () => {
    expect(press({ repeat: true })).toBeNull();
  });

  it("ignores a chord", () => {
    expect(press({ ctrlKey: true })).toBeNull();
    expect(press({ metaKey: true })).toBeNull();
    expect(press({ altKey: true })).toBeNull();
  });
});

describe("waitForAssembled", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const store = (k: number, target = 0) => ({ k, target, frameK() { return this.k; }, getState() { return { target: this.target }; } });

  it("calls back once, when the car is home and nothing asks it to come apart", () => {
    const s = store(0.6, 0);
    const then = vi.fn();
    waitForAssembled(s, then);
    vi.advanceTimersByTime(200);
    expect(then).not.toHaveBeenCalled();
    s.k = 0;
    s.target = 1;
    vi.advanceTimersByTime(200);
    expect(then).not.toHaveBeenCalled();
    s.target = 0;
    vi.advanceTimersByTime(60);
    expect(then).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);
    expect(then).toHaveBeenCalledTimes(1);
  });

  it("stops waiting when told to", () => {
    const s = store(0.6);
    const then = vi.fn();
    const stop = waitForAssembled(s, then);
    stop();
    s.k = 0;
    vi.advanceTimersByTime(500);
    expect(then).not.toHaveBeenCalled();
  });
});
