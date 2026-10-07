import { describe, expect, it, vi } from "vitest";
import { createExplodeStore } from "./store";

describe("createExplodeStore", () => {
  it("starts assembled, idle and not ready", () => {
    expect(createExplodeStore().getState()).toEqual({ k: 0, target: 0, hovered: null, selected: null, isolated: false, ready: false, error: null, looks: null, applied: null, hidden: new Set(), xray: 0, opening: false, stageGate: "waiting" });
  });

  it("notifies subscribers on set and stops after unsubscribe", () => {
    const s = createExplodeStore();
    const fn = vi.fn();
    const off = s.subscribe(fn);
    s.set({ selected: "gear_a" });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(s.getState().selected).toBe("gear_a");
    off();
    s.set({ selected: null });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("keeps the same state object between sets, as useSyncExternalStore requires", () => {
    const s = createExplodeStore();
    expect(s.getState()).toBe(s.getState());
  });

  it("damps k toward the target per frame without notifying React until it arrives", () => {
    const s = createExplodeStore();
    s.set({ target: 1 });
    const fn = vi.fn();
    s.subscribe(fn);
    expect(s.step(1 / 60, false)).toBe(true);
    const first = s.frameK();
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.5);
    expect(fn).not.toHaveBeenCalled();
    let frames = 1;
    while (s.step(1 / 60, false) && frames < 1000) frames++;
    expect(frames).toBeLessThan(200);
    expect(s.frameK()).toBe(1);
    expect(s.getState().k).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(s.step(1 / 60, false)).toBe(false);
  });

  it("jumps straight to the target under reduced motion", () => {
    const s = createExplodeStore();
    s.set({ target: 1 });
    expect(s.step(1 / 60, true)).toBe(true);
    expect(s.frameK()).toBe(1);
    expect(s.getState().k).toBe(1);
    expect(s.step(1 / 60, true)).toBe(false);
  });

  it("selects, toggles isolate, and drops isolate when nothing is selected", () => {
    const s = createExplodeStore();
    s.select("head");
    s.toggleIsolate();
    expect(s.getState()).toMatchObject({ selected: "head", isolated: true });
    s.select(null);
    expect(s.getState()).toMatchObject({ selected: null, isolated: false });
    s.toggleIsolate();
    expect(s.getState().isolated).toBe(false);
  });

  it("does not notify when a patch changes nothing", () => {
    const s = createExplodeStore();
    const fn = vi.fn();
    s.subscribe(fn);
    s.hover(null);
    expect(fn).not.toHaveBeenCalled();
  });

  it("clamps the target to 0..1", () => {
    const s = createExplodeStore();
    s.setTarget(3);
    expect(s.getState().target).toBe(1);
    s.setTarget(-1);
    expect(s.getState().target).toBe(0);
  });

  it("delivers resetView requests to the camera without touching state", () => {
    const s = createExplodeStore();
    const cam = vi.fn();
    const state = vi.fn();
    const off = s.onResetView(cam);
    s.subscribe(state);
    s.resetView();
    expect(cam).toHaveBeenCalledTimes(1);
    expect(state).not.toHaveBeenCalled();
    off();
    s.resetView();
    expect(cam).toHaveBeenCalledTimes(1);
  });

  it("publishes part looks for the canvas, and ignores the same looks set twice", () => {
    const s = createExplodeStore();
    const fn = vi.fn();
    s.subscribe(fn);
    const looks = { root: 0.4, parts: { skull: { scale: 1.9, tint: "#6fd08c", amount: 0.2 } } };
    s.setLooks(looks);
    s.setLooks(looks);
    expect(s.getState().looks).toBe(looks);
    expect(fn).toHaveBeenCalledTimes(1);
    s.setLooks(null);
    expect(s.getState().looks).toBeNull();
  });

  it("hides and shows groups by replacing the set, so subscribers hear about each change", () => {
    const s = createExplodeStore();
    const fn = vi.fn();
    s.subscribe(fn);
    const before = s.getState().hidden;
    s.toggleGroup("skin");
    expect([...s.getState().hidden]).toEqual(["skin"]);
    expect(s.getState().hidden).not.toBe(before);
    expect(before.size).toBe(0);
    s.toggleGroup("muscle");
    s.toggleGroup("skin");
    expect([...s.getState().hidden]).toEqual(["muscle"]);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("showGroup is a silent no-op for a group that is not hidden", () => {
    const s = createExplodeStore();
    const fn = vi.fn();
    s.subscribe(fn);
    s.showGroup("skin");
    expect(fn).not.toHaveBeenCalled();
    s.toggleGroup("skin");
    s.showGroup("skin");
    expect(s.getState().hidden.size).toBe(0);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("clamps the x-ray amount to 0..1 and treats NaN as off", () => {
    const s = createExplodeStore();
    s.setXray(0.4);
    expect(s.getState().xray).toBe(0.4);
    s.setXray(7);
    expect(s.getState().xray).toBe(1);
    s.setXray(Number.NaN);
    expect(s.getState().xray).toBe(0);
  });

  it("asks the canvas for a capture, and answers null when there is none or it went away", async () => {
    const s = createExplodeStore();
    expect(await s.capture()).toBeNull();
    const blob = new Blob(["png"]);
    const off = s.onCapture(() => Promise.resolve(blob));
    expect(await s.capture()).toBe(blob);
    off();
    expect(await s.capture()).toBeNull();
  });

  it("asks the canvas to export the model, per format, and answers null when there is none or it went away", async () => {
    const s = createExplodeStore();
    expect(await s.exportModel("glb")).toBeNull();
    const asked: string[] = [];
    const off = s.onExportModel((kind) => {
      asked.push(kind);
      return Promise.resolve(new Blob([kind]));
    });
    expect((await s.exportModel("usdz"))?.size).toBe(4);
    expect((await s.exportModel("glb"))?.size).toBe(3);
    expect(asked).toEqual(["usdz", "glb"]);
    off();
    expect(await s.exportModel("glb")).toBeNull();
  });
});
