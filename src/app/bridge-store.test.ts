import { describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({ useSyncExternalStore: (_subscribe: unknown, get: () => unknown, server: () => unknown) => ({ get: get(), server: server() }) }));

import { createBridgeStore } from "./bridge-store";
import { getLapBridge, resetLapBridge, setLapBridge, subscribeLapBridge } from "./lap-bridge";
import { getPitBridge, resetPitBridge, setPitBridge } from "./pit-stop-bridge";

interface Thing {
  on: boolean;
  count: number;
  mover: (() => void) | null;
}

describe("createBridgeStore", () => {
  const make = () => createBridgeStore<Thing>({ on: false, count: 0, mover: null }, { on: false, count: 0 });

  it("starts at rest, merges what it is given and tells subscribers each time", () => {
    const s = make();
    const heard = vi.fn();
    s.subscribe(heard);
    s.set({ on: true });
    s.set({ count: 2 });
    expect(s.get()).toEqual({ on: true, count: 2, mover: null });
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it("stops telling a subscriber that has left", () => {
    const s = make();
    const heard = vi.fn();
    const leave = s.subscribe(heard);
    leave();
    s.set({ on: true });
    expect(heard).not.toHaveBeenCalled();
  });

  it("resets to what it was told to, and leaves the rest, such as the registered mover, alone", () => {
    const s = make();
    const mover = () => {};
    s.set({ on: true, count: 5, mover });
    s.reset();
    expect(s.get()).toEqual({ on: false, count: 0, mover });
  });

  it("reads the server's answer as rest, whatever the client state is", () => {
    const s = make();
    s.set({ on: true });
    expect(s.use()).toEqual({ get: { on: true, count: 0, mover: null }, server: { on: false, count: 0, mover: null } });
  });
});

describe("the two bridges", () => {
  it("lap: a reset ends the lap and keeps the mover the panel registered", () => {
    const attach = () => () => {};
    setLapBridge({ attach, active: true, playing: true, restarts: 3, steps: 2, view: "side", still: true });
    const heard = vi.fn();
    subscribeLapBridge(heard);
    resetLapBridge();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(getLapBridge()).toMatchObject({ attach, active: false, playing: false, restarts: 0, steps: 0, view: "chase", still: false });
  });

  it("pit stop: a reset puts the car down with every wheel on and keeps the mover", () => {
    const attach = () => () => {};
    setPitBridge({ attach, active: true, snap: true, pose: { lifted: true, off: ["front-left-wheel"] } });
    resetPitBridge();
    expect(getPitBridge()).toMatchObject({ attach, active: false, snap: false, pose: { lifted: false, off: [] } });
  });
});
