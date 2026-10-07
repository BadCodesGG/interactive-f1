import { describe, expect, it } from "vitest";
import { filterGroups, pickPart, toggleGroupInView } from "./filter";
import { createExplodeStore } from "./store";

const sidecar = {
  groups: { bones: { label: "Skeleton", stage: 0 }, organs: { label: "Organs", stage: 1 }, empty: { label: "Empty", stage: 2 } },
  parts: {
    heart: { label: "Heart", group: "organs", copy: "a" },
    skull: { label: "Skull", group: "bones", copy: "b" },
    femur: { label: "Femur", group: "bones", copy: "c" },
    lone: { label: "Loose", copy: "d" },
  },
};

describe("filterGroups", () => {
  it("lists groups that have parts, in order of first appearance, and skips ungrouped parts", () => {
    expect(filterGroups(sidecar)).toEqual([
      { id: "organs", label: "Organs" },
      { id: "bones", label: "Skeleton" },
    ]);
  });
});

describe("pickPart", () => {
  it("selects a visible part without touching the filter", () => {
    const s = createExplodeStore();
    const hidden = s.getState().hidden;
    pickPart(s, sidecar, "heart");
    expect(s.getState().selected).toBe("heart");
    expect(s.getState().hidden).toBe(hidden);
  });

  it("shows a hidden part's group before selecting it, and leaves other groups hidden", () => {
    const s = createExplodeStore();
    s.toggleGroup("bones");
    s.toggleGroup("organs");
    pickPart(s, sidecar, "skull");
    expect(s.getState().selected).toBe("skull");
    expect([...s.getState().hidden]).toEqual(["organs"]);
  });

  it("selects an ungrouped part", () => {
    const s = createExplodeStore();
    pickPart(s, sidecar, "lone");
    expect(s.getState().selected).toBe("lone");
  });
});

describe("toggleGroupInView", () => {
  it("hides and shows a group", () => {
    const s = createExplodeStore();
    toggleGroupInView(s, sidecar, "organs");
    expect(s.getState().hidden.has("organs")).toBe(true);
    toggleGroupInView(s, sidecar, "organs");
    expect(s.getState().hidden.has("organs")).toBe(false);
  });

  it("deselects, and drops isolate, when the selected part's group is hidden", () => {
    const s = createExplodeStore();
    pickPart(s, sidecar, "skull");
    s.toggleIsolate();
    toggleGroupInView(s, sidecar, "bones");
    expect(s.getState()).toMatchObject({ selected: null, isolated: false });
  });

  it("keeps the selection when another group is hidden", () => {
    const s = createExplodeStore();
    pickPart(s, sidecar, "skull");
    toggleGroupInView(s, sidecar, "organs");
    expect(s.getState().selected).toBe("skull");
  });
});
