import { describe, expect, it } from "vitest";
import type { CopyBook } from "./copy";
import { factParts, randomFactPart } from "./facts";

const entry = (funFact?: string) => ({ id: "x", label: "X", group: "g", summary: "s", function: "f", whyItMatters: "w", funFact });
const copy: CopyBook = { a: entry("Fact A"), b: entry(), c: entry("Fact C"), d: entry(""), e: entry("Fact E") };
const sidecar = {
  parts: {
    one: { label: "One", copy: "a" },
    two: { label: "Two", copy: "b" },
    three: { label: "Three", copy: "c" },
    four: { label: "Four", copy: "d" },
    five: { label: "Five", copy: "missing" },
    six: { label: "Six", copy: "e" },
  },
};

describe("factParts", () => {
  it("keeps only parts with a non-empty fact, in order", () => {
    expect(factParts(sidecar, copy)).toEqual(["one", "three", "six"]);
  });
});

describe("randomFactPart", () => {
  it("picks by the random number over the parts with facts", () => {
    expect(randomFactPart(sidecar, copy, null, () => 0)).toBe("one");
    expect(randomFactPart(sidecar, copy, null, () => 0.5)).toBe("three");
    expect(randomFactPart(sidecar, copy, null, () => 0.999999)).toBe("six");
    expect(randomFactPart(sidecar, copy, null, () => 1)).toBe("six");
  });

  it("never repeats the current part while another has a fact", () => {
    for (const r of [0, 0.3, 0.6, 0.99]) expect(randomFactPart(sidecar, copy, "three", () => r)).not.toBe("three");
  });

  it("returns the current part when it is the only one with a fact", () => {
    const one = { parts: { one: sidecar.parts.one, two: sidecar.parts.two } };
    expect(randomFactPart(one, copy, "one", () => 0)).toBe("one");
  });

  it("returns null when nothing has a fact", () => {
    expect(randomFactPart({ parts: { two: sidecar.parts.two } }, copy, null)).toBeNull();
  });
});
