import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { Flow } from "./flow";
import { bindWand, driveWand, newWandState } from "./wand-control";

function fakeFlow() {
  return { setWand: vi.fn(), settleWand: vi.fn() } as unknown as Flow & { setWand: ReturnType<typeof vi.fn>; settleWand: ReturnType<typeof vi.fn> };
}
const marker = () => ({ position: { set: vi.fn() }, visible: false }) as unknown as THREE.Object3D;

describe("a live wand", () => {
  it("settles a wand put down somewhere new without hiding it: its smoke trails as it moves", () => {
    const flow = fakeFlow();
    const w = newWandState();
    w.goal = [0, 0.5, 0];
    driveWand(w, flow, marker(), 1 / 60);
    expect(flow.settleWand).toHaveBeenCalledTimes(1);
    expect(flow.settleWand.mock.calls[0][0]).toBeFalsy();
  });

  it("does not settle a small drag", () => {
    const flow = fakeFlow();
    const w = newWandState();
    w.goal = [0, 0.5, 0];
    driveWand(w, flow, marker(), 1 / 60);
    flow.settleWand.mockClear();
    w.goal = [0.05, 0.5, 0];
    driveWand(w, flow, marker(), 1 / 60);
    expect(flow.settleWand).not.toHaveBeenCalled();
  });
});

describe("a still wand", () => {
  /** A canvas that is only an event target with the bits bindWand touches. */
  function fakeDom() {
    const dom = new EventTarget() as unknown as HTMLElement & { tabIndex: number; style: Record<string, string> };
    Object.assign(dom, {
      tabIndex: -1,
      style: {},
      setAttribute: () => {},
      removeAttribute: () => {},
      getAttribute: () => null,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }),
      setPointerCapture: () => {},
      hasPointerCapture: () => false,
      releasePointerCapture: () => {},
    });
    return dom;
  }
  const pointer = (type: string, x: number, y: number) => Object.assign(new Event(type), { pointerType: "touch", pointerId: 1, button: 0, clientX: x, clientY: y });

  it("plants a streamline on release and keeps its smoke hidden until the settle has run", () => {
    const camera = new THREE.PerspectiveCamera(34, 4 / 3, 0.05, 100);
    camera.position.set(0, 1, 7);
    camera.lookAt(0, 0.6, 0);
    camera.updateMatrixWorld(true);
    const controls = { enabled: true, getTarget: (v: THREE.Vector3) => v.set(0, 0.6, 0) };
    const flow = fakeFlow();
    const dom = fakeDom();
    const stop = bindWand({ dom, camera, controls: controls as never, flow, marker: marker(), state: newWandState(), still: true, invalidate: () => {} });
    dom.dispatchEvent(pointer("pointerdown", 200, 150));
    dom.dispatchEvent(pointer("pointerup", 200, 150));
    expect(flow.settleWand).toHaveBeenCalledTimes(1);
    expect(flow.settleWand).toHaveBeenCalledWith(true);
    stop();
  });
});
