import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { describe, expect, it, vi } from "vitest";
import { createFloor } from "./floor";
import { reflectionSize } from "./floor-config";

/** A renderer as far as the floor reads one: whether it can draw to a float target, and the size of its drawing buffer. */
function fakeGl(buffer: { w: number; h: number }, reflective = true) {
  return {
    extensions: { has: (name: string) => reflective && name === "EXT_color_buffer_float" },
    getDrawingBufferSize: (v: THREE.Vector2) => v.set(buffer.w, buffer.h),
  } as unknown as THREE.WebGLRenderer;
}

describe("the floor's reflection", () => {
  it("is sized from the drawing buffer when the floor is made", () => {
    const buffer = { w: 1440, h: 900 };
    const floor = createFloor(fakeGl(buffer), false);
    const target = (floor.object as Reflector).getRenderTarget();
    expect([target.width, target.height]).toEqual(reflectionSize(1440, 900, false));
    floor.dispose();
  });

  it("follows the canvas when it is resized or the pixel ratio changes", () => {
    const buffer = { w: 800, h: 600 };
    const floor = createFloor(fakeGl(buffer), false);
    const target = (floor.object as Reflector).getRenderTarget();
    const [w0, h0] = [target.width, target.height];
    buffer.w = 2880;
    buffer.h = 1800;
    floor.fit();
    expect([target.width, target.height]).toEqual(reflectionSize(2880, 1800, false));
    expect(target.width).toBeGreaterThan(w0);
    expect(target.height).toBeGreaterThan(h0);
    floor.dispose();
  });

  it("leaves the target alone when the size has not changed, so a frame is not spent rebuilding it", () => {
    const buffer = { w: 1000, h: 700 };
    const floor = createFloor(fakeGl(buffer), true);
    const target = (floor.object as Reflector).getRenderTarget();
    const resize = vi.spyOn(target, "setSize");
    floor.fit();
    expect(resize).not.toHaveBeenCalled();
    floor.dispose();
  });

  it("has nothing to fit on a renderer that cannot reflect, and says so", () => {
    const floor = createFloor(fakeGl({ w: 800, h: 600 }, false), false);
    expect(floor.reflective).toBe(false);
    expect(() => floor.fit()).not.toThrow();
    floor.dispose();
  });

  it("frees its render target when it is disposed", () => {
    const floor = createFloor(fakeGl({ w: 800, h: 600 }), false);
    const target = (floor.object as Reflector).getRenderTarget();
    const freed = vi.fn();
    target.addEventListener("dispose", freed);
    floor.dispose();
    expect(freed).toHaveBeenCalledTimes(1);
  });
});
