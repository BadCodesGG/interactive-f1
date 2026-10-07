import { describe, expect, it, vi } from "vitest";
import { createDiscovery, foundKey, foundLabel, readFound, writeFound } from "./discovered";

const valid = new Set(["a", "b", "c"]);

/** A storage that records writes; `throws` makes every call fail like blocked storage does. */
function fakeStorage(initial: Record<string, string> = {}, throws = false) {
  const data = new Map(Object.entries(initial));
  const guard = () => {
    if (throws) throw new Error("SecurityError");
  };
  return {
    data,
    getItem: (k: string) => (guard(), data.get(k) ?? null),
    setItem: (k: string, v: string) => (guard(), void data.set(k, v)),
    removeItem: (k: string) => (guard(), void data.delete(k)),
  } as unknown as Storage & { data: Map<string, string> };
}

describe("readFound", () => {
  it("reads a saved list and drops ids that are no longer parts", () => {
    const s = fakeStorage({ k: JSON.stringify(["a", "gone", "c"]) });
    expect([...readFound(s, "k", valid)]).toEqual(["a", "c"]);
  });

  it("treats corrupt, foreign or missing data as empty", () => {
    for (const raw of ["{not json", "42", '{"a":1}', "null", '"a"', "", '[1,null,{"a":1}]']) {
      expect(readFound(fakeStorage({ k: raw }), "k", valid).size).toBe(0);
    }
    expect(readFound(fakeStorage(), "k", valid).size).toBe(0);
    expect(readFound(null, "k", valid).size).toBe(0);
  });

  it("does not throw when storage does", () => {
    expect(readFound(fakeStorage({}, true), "k", valid).size).toBe(0);
  });
});

describe("writeFound", () => {
  it("saves a list, and removes the key when the set is empty", () => {
    const s = fakeStorage();
    writeFound(s, "k", new Set(["a", "b"]));
    expect(s.data.get("k")).toBe('["a","b"]');
    writeFound(s, "k", new Set());
    expect(s.data.has("k")).toBe(false);
  });

  it("does not throw when storage does, or when there is none", () => {
    expect(() => writeFound(fakeStorage({}, true), "k", new Set(["a"]))).not.toThrow();
    expect(() => writeFound(null, "k", new Set(["a"]))).not.toThrow();
  });
});

describe("foundKey and foundLabel", () => {
  it("namespaces the key per app", () => {
    expect(foundKey("anatomy")).toBe("explode:anatomy:found");
    expect(foundKey("pc")).not.toBe(foundKey("f1"));
  });

  it("words the counter", () => {
    expect(foundLabel(12, 18)).toBe("12 of 18 found");
  });
});

describe("createDiscovery", () => {
  it("loads what was saved, lazily and once", () => {
    const s = fakeStorage({ [foundKey("t")]: '["a"]' });
    const get = vi.spyOn(s, "getItem");
    const d = createDiscovery("t", valid, () => s);
    expect(get).not.toHaveBeenCalled();
    expect([...d.get()]).toEqual(["a"]);
    expect(d.get()).toBe(d.get());
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("adds a part, saves it and tells subscribers; a repeat or a stranger changes nothing", () => {
    const s = fakeStorage();
    const d = createDiscovery("t", valid, () => s);
    const fn = vi.fn();
    d.subscribe(fn);
    const before = d.get();
    d.add("b");
    expect([...d.get()]).toEqual(["b"]);
    expect(d.get()).not.toBe(before);
    expect(s.data.get(foundKey("t"))).toBe('["b"]');
    d.add("b");
    d.add("not-a-part");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("resets, and stays quiet when there is nothing to reset", () => {
    const s = fakeStorage();
    const d = createDiscovery("t", valid, () => s);
    const fn = vi.fn();
    d.subscribe(fn);
    d.reset();
    expect(fn).not.toHaveBeenCalled();
    d.add("a");
    d.reset();
    expect(d.get().size).toBe(0);
    expect(s.data.has(foundKey("t"))).toBe(false);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("keeps counting for the visit when storage is blocked", () => {
    const d = createDiscovery("t", valid, () => null);
    d.add("a");
    d.add("c");
    expect(d.get().size).toBe(2);
    const thrower = createDiscovery("t", valid, () => fakeStorage({}, true));
    thrower.add("a");
    expect(thrower.get().size).toBe(1);
  });

  it("stops notifying after unsubscribe", () => {
    const d = createDiscovery("t", valid, () => fakeStorage());
    const fn = vi.fn();
    const off = d.subscribe(fn);
    off();
    d.add("a");
    expect(fn).not.toHaveBeenCalled();
  });
});
