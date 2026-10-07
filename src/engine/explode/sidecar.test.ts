import { describe, expect, it } from "vitest";
import { PropertyBinding } from "three";
import { isSafeNodeName, sanitizeNodeName, validateSidecar } from "./sidecar";

describe("sanitizeNodeName", () => {
  it("matches the worked examples measured against three's loader", () => {
    expect(sanitizeNodeName("Left Lobe.001")).toBe("Left_Lobe001");
    expect(sanitizeNodeName("Femur [L]")).toBe("Femur_L");
    expect(sanitizeNodeName("a/b:c")).toBe("abc");
    expect(sanitizeNodeName("cpu_die-2")).toBe("cpu_die-2");
  });

  it("agrees with three's own PropertyBinding.sanitizeNodeName", () => {
    for (const n of ["Left Lobe.001", "tab\there", "a/b:c[0]", "émoji ✓", "x\ny", "ok-name_1", ""]) {
      expect(sanitizeNodeName(n)).toBe(PropertyBinding.sanitizeNodeName(n));
    }
  });

  it("flags names outside [A-Za-z0-9_-] as unsafe even when three keeps them", () => {
    expect(isSafeNodeName("gear_a")).toBe(true);
    expect(isSafeNodeName("émoji")).toBe(false);
    expect(isSafeNodeName("")).toBe(false);
  });
});

const good = {
  schema: 1,
  model: "/models/x.12345678.glb",
  assembly: { centre: [0, 0, 0], radius: 2, axis: "y" },
  groups: { structure: { label: "Structure", stage: 0 }, mech: { label: "Mechanism", stage: 1, explode: [0, 1, 0] } },
  parts: {
    base: { label: "Base", group: "structure", copy: "fixture.base" },
    gear: {
      label: "Gear",
      group: "mech",
      explode: [1, 0, 0],
      order: 0.5,
      pickable: true,
      copy: "fixture.gear",
      view: { position: [1, 1, 1], target: [0, 0, 0] },
      assemble: { slot: "slot_gear", snap: 0.03, after: ["base"] },
    },
  },
};

describe("validateSidecar", () => {
  it("accepts a complete sidecar and returns it typed", () => {
    const r = validateSidecar(good);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.sidecar.parts)).toEqual(["base", "gear"]);
  });

  it("accepts null assembly overrides, as the schema example writes them", () => {
    expect(validateSidecar({ ...good, assembly: { centre: null, radius: null, axis: null } }).ok).toBe(true);
  });

  it("names every problem it finds", () => {
    const bad = {
      schema: 2,
      model: 3,
      assembly: { axis: "w", radius: -1 },
      groups: { g: { label: "G" } },
      parts: {
        "bad name.001": { label: "X", copy: "k" },
        orphan: { label: "O", group: "nope", copy: "k", explode: [1, 2] },
        nocopy: { label: "N" },
        after: { label: "A", copy: "k", assemble: { slot: "s", snap: 0.1, after: ["ghost"] } },
      },
    };
    const r = validateSidecar(bad);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const all = r.errors.join("\n");
    for (const needle of [
      "schema must be 1",
      "model must be a string",
      "assembly.axis",
      "assembly.radius",
      "groups.g.stage",
      'parts["bad name.001"]: key is not a safe node name',
      "parts.orphan.group",
      "parts.orphan.explode",
      "parts.nocopy.copy",
      "parts.after.assemble.after",
    ]) {
      expect(all).toContain(needle);
    }
  });

  it("accepts a first camera angle and rejects one that is not two numbers", () => {
    expect(validateSidecar({ ...good, assembly: { camera: { azimuth: 1.1, polar: 1.2 } } }).ok).toBe(true);
    const r = validateSidecar({ ...good, assembly: { camera: { azimuth: "left" } } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/assembly\.camera/);
  });

  it("accepts a framing factor and rejects one that is not a positive number", () => {
    expect(validateSidecar({ ...good, assembly: { frame: 1.3 } }).ok).toBe(true);
    expect(validateSidecar({ ...good, assembly: { frame: null } }).ok).toBe(true);
    for (const frame of [0, -1, "wide"]) {
      const r = validateSidecar({ ...good, assembly: { frame } });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(" ")).toMatch(/assembly\.frame/);
    }
  });

  it("accepts a boolean procedural flag and rejects anything else", () => {
    const withFlag = (procedural: unknown) => ({ ...good, parts: { ...good.parts, pu: { label: "PU", copy: "k", procedural } } });
    expect(validateSidecar(withFlag(true)).ok).toBe(true);
    const r = validateSidecar(withFlag("yes"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("parts.pu.procedural must be a boolean");
  });

  it("accepts a leader policy of always or hover and rejects any other value", () => {
    const withLeader = (leader: unknown) => ({ ...good, parts: { ...good.parts, vert: { label: "V", copy: "k", leader } } });
    expect(validateSidecar(withLeader("always")).ok).toBe(true);
    expect(validateSidecar(withLeader("hover")).ok).toBe(true);
    expect(validateSidecar(good).ok).toBe(true);
    for (const leader of ["never", "Hover", true, 1, null]) {
      const r = validateSidecar(withLeader(leader));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(" ")).toContain('parts.vert.leader must be "always" or "hover"');
    }
  });

  it("accepts an x-ray list of group ids and names each bad entry", () => {
    expect(validateSidecar({ ...good, xray: ["structure"] }).ok).toBe(true);
    for (const [xray, needle] of [
      [[], "non-empty array"],
      ["structure", "non-empty array"],
      [["nope"], 'names "nope"'],
      [["constructor"], 'names "constructor"'],
      [[3], 'names "3"'],
      [["structure", "structure"], 'twice'],
    ] as const) {
      const r = validateSidecar({ ...good, xray });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(" ")).toContain(needle);
    }
  });

  it("rejects a non-object", () => {
    expect(validateSidecar(null).ok).toBe(false);
  });
});
