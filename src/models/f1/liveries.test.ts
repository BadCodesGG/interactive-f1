import { describe, expect, it } from "vitest";
import { LIVERIES, LIVERY_IDS, parseLiveryParam } from "./liveries";
import { DEFAULT_LIVERY_ID, DEFAULT_LIVERY_NAME } from "./livery-name";
import { LIVERY_PARTS } from "./livery-spec";

describe("parseLiveryParam", () => {
  it("reads a known id, with or without the leading ?", () => {
    expect(parseLiveryParam("?livery=badcodes")).toBe("badcodes");
    expect(parseLiveryParam("livery=powder-blue")).toBe("powder-blue");
  });

  it("knows all eight ids", () => {
    for (const id of LIVERY_IDS) expect(parseLiveryParam(`?livery=${id}`)).toBe(id);
    expect(LIVERY_IDS).toHaveLength(8);
  });

  it("ignores anything that is not exactly a known id", () => {
    for (const junk of ["", "nope", "BADCODES", "badcodes ", " badcodes", "bad codes", "badcodes,powder-blue", "__proto__", "constructor", "toString", "../badcodes", "%00", "1", "<script>"]) {
      expect(parseLiveryParam(`?livery=${encodeURIComponent(junk)}`), JSON.stringify(junk)).toBeUndefined();
    }
  });

  it("ignores a query with no livery, or a malformed one", () => {
    expect(parseLiveryParam("")).toBeUndefined();
    expect(parseLiveryParam("?")).toBeUndefined();
    expect(parseLiveryParam("?part=chassis&explode=1")).toBeUndefined();
    expect(parseLiveryParam("?livery")).toBeUndefined();
    expect(parseLiveryParam("?%E0%A4%A&livery=%")).toBeUndefined();
  });

  it("takes the first value when it is repeated, and only if that one is known", () => {
    expect(parseLiveryParam("?livery=badcodes&livery=powder-blue")).toBe("badcodes");
    expect(parseLiveryParam("?livery=nope&livery=powder-blue")).toBeUndefined();
  });

  it("leaves the other parameters alone", () => {
    expect(parseLiveryParam("?part=body&explode=1&livery=racing-red&iso=1")).toBe("racing-red");
  });
});

describe("the default livery", () => {
  it("is Ghost, one of the eight, and its display name is the livery's own", () => {
    expect(DEFAULT_LIVERY_ID).toBe("ghost");
    expect(LIVERY_IDS).toContain(DEFAULT_LIVERY_ID);
    expect(LIVERIES[DEFAULT_LIVERY_ID].name).toBe(DEFAULT_LIVERY_NAME);
  });
});

describe("LIVERIES", () => {
  it("has a livery for every id, carrying its own id", () => {
    for (const id of LIVERY_IDS) expect(LIVERIES[id].id).toBe(id);
  });

  it("paints every part of the car in every livery", () => {
    for (const id of LIVERY_IDS) for (const part of LIVERY_PARTS) expect(LIVERIES[id].parts[part], `${id} ${part}`).toBeDefined();
  });
});
