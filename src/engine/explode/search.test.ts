import { describe, expect, it } from "vitest";
import { matchParts } from "./search";

const sidecar = {
  groups: { bones: { label: "Skeleton", stage: 0 }, organs: { label: "Organs", stage: 1 } },
  parts: {
    femur: { label: "Femur (thigh bone)", group: "bones", copy: "a" },
    skull: { label: "Skull", group: "bones", copy: "b" },
    heart: { label: "Heart", group: "organs", copy: "c" },
    lone: { label: "Loose part", copy: "d" },
  },
};

describe("matchParts", () => {
  it("returns every part, in order, for an empty or blank query", () => {
    expect(matchParts(sidecar, "")).toEqual(["femur", "skull", "heart", "lone"]);
    expect(matchParts(sidecar, "   ")).toEqual(["femur", "skull", "heart", "lone"]);
  });

  it("matches a label regardless of case", () => {
    expect(matchParts(sidecar, "HEA")).toEqual(["heart"]);
    expect(matchParts(sidecar, "thigh")).toEqual(["femur"]);
  });

  it("matches the group's label and id", () => {
    expect(matchParts(sidecar, "skeleton")).toEqual(["femur", "skull"]);
    expect(matchParts(sidecar, "bones")).toEqual(["femur", "skull"]);
  });

  it("needs every word, in any order", () => {
    expect(matchParts(sidecar, "skeleton skull")).toEqual(["skull"]);
    expect(matchParts(sidecar, "skull skeleton")).toEqual(["skull"]);
    expect(matchParts(sidecar, "skull organs")).toEqual([]);
  });

  it("treats regex characters literally and finds nothing for junk", () => {
    expect(matchParts(sidecar, ".*")).toEqual([]);
    expect(matchParts(sidecar, "(")).toEqual(["femur"]);
    expect(matchParts(sidecar, "zzz")).toEqual([]);
  });

  it("copes with a part whose group is not in the table", () => {
    expect(matchParts({ groups: {}, parts: { x: { label: "X", group: "constructor", copy: "k" } } }, "x")).toEqual(["x"]);
  });
});
