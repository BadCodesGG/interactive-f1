import { describe, expect, it } from "vitest";
import { arrivalScroll, hasDeepLink, parseDeepLink, writeDeepLink } from "./deep-link";

const ids = ["head", "gear_a", "cpu-die"];

describe("parseDeepLink", () => {
  it("reads a part, explode and iso", () => {
    expect(parseDeepLink("?part=gear_a&explode=1&iso=1", ids)).toEqual({ part: "gear_a", explode: 1, iso: true });
  });

  it("reads explode=0 as an explicit assembled pose", () => {
    expect(parseDeepLink("?explode=0", ids)).toEqual({ explode: 0 });
  });

  it("ignores unknown part ids, including names on the object prototype", () => {
    expect(parseDeepLink("?part=nope", ids)).toEqual({});
    expect(parseDeepLink("?part=constructor", ids)).toEqual({});
    expect(parseDeepLink("?part=__proto__", ids)).toEqual({});
    expect(parseDeepLink("?part=", ids)).toEqual({});
  });

  it("ignores any flag value other than 1 or 0", () => {
    expect(parseDeepLink("?explode=2&iso=true", ids)).toEqual({});
    expect(parseDeepLink("?explode=&iso=", ids)).toEqual({});
    expect(parseDeepLink("?explode=1.0&iso=01", ids)).toEqual({});
  });

  it("does not throw on junk", () => {
    for (const junk of ["", "?", "??&&==", "?part=%E0%A4%A", "?part=a&part", "?%=%&=", "part=head"]) {
      expect(() => parseDeepLink(junk, ids)).not.toThrow();
    }
    expect(parseDeepLink("part=head", ids)).toEqual({ part: "head" });
  });

  it("takes the first of a repeated parameter", () => {
    expect(parseDeepLink("?part=head&part=gear_a", ids)).toEqual({ part: "head" });
  });

  it("drops iso=1 without a part, since there is nothing to isolate", () => {
    expect(parseDeepLink("?iso=1", ids)).toEqual({});
    expect(parseDeepLink("?part=nope&iso=1", ids)).toEqual({});
  });
});

describe("hasDeepLink", () => {
  it("is true only when something usable is in the address", () => {
    expect(hasDeepLink("?part=head", ids)).toBe(true);
    expect(hasDeepLink("?explode=1", ids)).toBe(true);
    expect(hasDeepLink("?part=nope&explode=9&utm_source=x", ids)).toBe(false);
    expect(hasDeepLink("", ids)).toBe(false);
  });
});

describe("writeDeepLink", () => {
  const rest = { selected: null, target: 0, isolated: false };

  it("writes nothing for the default state", () => {
    expect(writeDeepLink("", rest)).toBe("");
  });

  it("writes part, explode and iso", () => {
    expect(writeDeepLink("", { selected: "gear_a", target: 1, isolated: true })).toBe("?part=gear_a&explode=1&iso=1");
  });

  it("treats a slider past halfway as exploded", () => {
    expect(writeDeepLink("", { ...rest, target: 0.5 })).toBe("?explode=1");
    expect(writeDeepLink("", { ...rest, target: 0.49 })).toBe("");
  });

  it("drops iso when nothing is selected", () => {
    expect(writeDeepLink("", { selected: null, target: 0, isolated: true })).toBe("");
  });

  it("keeps every other parameter byte for byte and in order", () => {
    const search = "?utm_source=a+b&ref=%E2%9C%93&flag&part=old&x=1";
    expect(writeDeepLink(search, { selected: "head", target: 1, isolated: false })).toBe("?utm_source=a+b&ref=%E2%9C%93&flag&x=1&part=head&explode=1");
  });

  it("removes its own parameters, and only them, when the state returns to default", () => {
    expect(writeDeepLink("?part=head&explode=1&iso=1&keep=1", rest)).toBe("?keep=1");
    expect(writeDeepLink("?part=head&explode=1", rest)).toBe("");
  });

  it("drops its own keys however they are percent-encoded, so a reload cannot restore a stale part", () => {
    expect(writeDeepLink("?%70art=heart&keep=1", { selected: "lungs", target: 0, isolated: false })).toBe("?keep=1&part=lungs");
    expect(writeDeepLink("?%69so=1&%65xplode=1", { selected: null, target: 0, isolated: false })).toBe("");
  });

  it("removes repeated copies of its own parameters", () => {
    expect(writeDeepLink("?part=a&part=b&explode=1&explode=0", rest)).toBe("");
  });

  it("does not mistake a longer name for its own", () => {
    expect(writeDeepLink("?parts=1&explode_all=1&iso2=1", rest)).toBe("?parts=1&explode_all=1&iso2=1");
  });

  it("round trips through parseDeepLink", () => {
    const state = { selected: "cpu-die", target: 1, isolated: true };
    expect(parseDeepLink(writeDeepLink("?a=b", state), ids)).toEqual({ part: "cpu-die", explode: 1, iso: true });
  });
});

describe("arrivalScroll", () => {
  it("scrolls the stage to the top for a part link on a narrow screen", () => {
    expect(arrivalScroll({ part: "head" }, true, false)).toEqual({ block: "start", behavior: "smooth" });
  });

  it("jumps instead of gliding under reduced motion", () => {
    expect(arrivalScroll({ part: "head", explode: 1 }, true, true)).toEqual({ block: "start", behavior: "auto" });
  });

  it("does nothing without a part or on a wide screen", () => {
    expect(arrivalScroll({}, true, false)).toBeNull();
    expect(arrivalScroll({ explode: 1 }, true, false)).toBeNull();
    expect(arrivalScroll({ part: "head" }, false, false)).toBeNull();
  });
});
