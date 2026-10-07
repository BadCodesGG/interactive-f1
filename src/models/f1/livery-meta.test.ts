import { describe, expect, it } from "vitest";
import { LIVERIES, LIVERY_IDS } from "./liveries";
import { asLiveryId, LEGACY_LIVERY_IDS, LIVERY_META, parseLiveryParam } from "./livery-meta";

describe("LIVERY_META", () => {
  it("has an entry for every livery, with the livery's own name", () => {
    for (const id of LIVERY_IDS) {
      expect(LIVERY_META[id].id).toBe(id);
      expect(LIVERY_META[id].name).toBe(LIVERIES[id].name);
    }
  });

  it("draws each picker chip from colours of that livery's own palette, two or three of them", () => {
    for (const id of LIVERY_IDS) {
      const palette = Object.values(LIVERIES[id].palette).map((c) => c.toLowerCase());
      const chip = LIVERY_META[id].chip;
      expect(chip.length, id).toBeGreaterThanOrEqual(2);
      expect(chip.length, id).toBeLessThanOrEqual(3);
      for (const colour of chip) expect(palette, `${id} ${colour}`).toContain(colour.toLowerCase());
    }
  });
});

describe("legacy livery ids", () => {
  it("maps each id the liveries had before they were renamed to its new id, colours unchanged", () => {
    expect(LEGACY_LIVERY_IDS).toEqual({
      gulf: "powder-blue",
      martini: "white-stripes",
      jps: "black-gold",
      papaya: "orange-blue",
      rosso: "racing-red",
    });
    for (const [old, id] of Object.entries(LEGACY_LIVERY_IDS)) {
      expect(asLiveryId(old), old).toBe(id);
      expect(parseLiveryParam(`?livery=${old}`), old).toBe(id);
    }
  });

  it("passes current ids through and leaves an unknown value to the caller's default", () => {
    for (const id of LIVERY_IDS) expect(asLiveryId(id)).toBe(id);
    for (const junk of ["nope", "", "GULF", "gulf ", "__proto__", "constructor", "toString", 7, null, undefined]) {
      expect(asLiveryId(junk), String(junk)).toBeUndefined();
    }
    expect(parseLiveryParam("?livery=nope")).toBeUndefined();
  });

  it("never reuses a legacy id as a current one", () => {
    for (const old of Object.keys(LEGACY_LIVERY_IDS)) expect(LIVERY_IDS as readonly string[]).not.toContain(old);
  });
});
