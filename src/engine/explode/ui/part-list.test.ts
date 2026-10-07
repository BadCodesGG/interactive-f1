import { describe, expect, it } from "vitest";
import { partSections } from "./part-list";

describe("partSections", () => {
  it("keeps sidecar order and buckets parts by group in order of first appearance", () => {
    const sections = partSections({
      groups: { a: { label: "Alpha", stage: 1 }, b: { label: "Beta", stage: 0 } },
      parts: {
        p1: { label: "P1", group: "b", copy: "x" },
        p2: { label: "P2", copy: "x" },
        p3: { label: "P3", group: "a", copy: "x" },
        p4: { label: "P4", group: "b", copy: "x" },
      },
    });
    expect(sections).toEqual([
      { id: "b", label: "Beta", parts: ["p1", "p4"] },
      { id: "other", label: "Other parts", parts: ["p2"] },
      { id: "a", label: "Alpha", parts: ["p3"] },
    ]);
  });
});
