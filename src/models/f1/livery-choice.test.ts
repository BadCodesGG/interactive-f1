import { describe, expect, it } from "vitest";
import { LIVERY_IDS } from "./liveries";
import { liveryScript, LIVERY_ATTR, LIVERY_STORAGE_KEY, resolveLivery, withLiveryParam } from "./livery-choice";
import { LEGACY_LIVERY_IDS } from "./livery-meta";
import { DEFAULT_LIVERY_ID } from "./livery-name";

describe("resolveLivery", () => {
  it("takes the address first, then the stored choice, then Ghost", () => {
    expect(resolveLivery("?livery=white-stripes", "powder-blue")).toBe("white-stripes");
    expect(resolveLivery("", "powder-blue")).toBe("powder-blue");
    expect(resolveLivery("", null)).toBe(DEFAULT_LIVERY_ID);
    expect(DEFAULT_LIVERY_ID).toBe("ghost");
  });

  it("maps a remembered or linked pre-rename id to its new id, and an unknown one to Ghost", () => {
    expect(resolveLivery("", "gulf")).toBe("powder-blue");
    expect(resolveLivery("?livery=martini", null)).toBe("white-stripes");
    expect(resolveLivery("?livery=rosso", "gulf")).toBe("racing-red");
    expect(resolveLivery("?livery=nope", "jps")).toBe("black-gold");
    expect(resolveLivery("?livery=nope", "papaya")).toBe("orange-blue");
    expect(resolveLivery("?livery=nope", "retired")).toBe("ghost");
  });

  it("ignores an unknown address value and falls to the stored choice, and an unknown stored value and falls to Ghost", () => {
    expect(resolveLivery("?livery=nope", "powder-blue")).toBe("powder-blue");
    expect(resolveLivery("?livery=nope", "also-nope")).toBe("ghost");
    expect(resolveLivery("?livery=__proto__", "constructor")).toBe("ghost");
    expect(resolveLivery("", "POWDER-BLUE")).toBe("ghost");
  });
});

/** A stand-in for <html>, location and localStorage: enough to run the inline script. */
function runScript(search: string, stored: string | null | "throws") {
  const attrs = new Map<string, string>();
  const document = { documentElement: { setAttribute: (k: string, v: string) => void attrs.set(k, v) } };
  const window = { location: { search } };
  const localStorage = {
    getItem: (k: string) => {
      if (stored === "throws") throw new Error("blocked");
      return k === LIVERY_STORAGE_KEY ? stored : null;
    },
  };
  new Function("document", "window", "localStorage", liveryScript())(document, window, localStorage);
  return attrs.get(LIVERY_ATTR);
}

describe("liveryScript", () => {
  it("sets data-livery to exactly what resolveLivery says, for every id and every kind of junk", () => {
    const searches = ["", "?", "?part=chassis", "?livery=", "?livery=nope", "?livery=nope&livery=powder-blue", "?explode=1&livery=racing-red&iso=1", "?livery=%E0%A4%A", "?livery=POWDER_BLUE"];
    for (const id of [...LIVERY_IDS, ...Object.keys(LEGACY_LIVERY_IDS)]) searches.push(`?livery=${id}`);
    const stores: (string | null)[] = [null, "junk", "", "toString", ...LIVERY_IDS, ...Object.keys(LEGACY_LIVERY_IDS)];
    for (const search of searches) for (const stored of stores) expect(runScript(search, stored), `${search} / ${stored}`).toBe(resolveLivery(search, stored));
  });

  it("still sets the address's livery, or Ghost, when storage throws", () => {
    expect(runScript("?livery=black-gold", "throws")).toBe("black-gold");
    expect(runScript("", "throws")).toBe("ghost");
  });
});

describe("withLiveryParam", () => {
  it("adds the livery to an empty query and replaces a previous one in place of it", () => {
    expect(withLiveryParam("", "powder-blue")).toBe("?livery=powder-blue");
    expect(withLiveryParam("?livery=white-stripes", "powder-blue")).toBe("?livery=powder-blue");
    // An encoded key is the same parameter to get(), so it is replaced, not left to win on reload.
    expect(withLiveryParam("?%6Civery=powder-blue&keep=1", "white-stripes")).toBe("?keep=1&livery=white-stripes");
    expect(withLiveryParam("?livery=a&livery=b", "racing-red")).toBe("?livery=racing-red");
  });

  it("keeps every other parameter byte for byte and in order", () => {
    expect(withLiveryParam("?part=front%20wing&explode=1&iso=1", "powder-blue")).toBe("?part=front%20wing&explode=1&iso=1&livery=powder-blue");
    expect(withLiveryParam("?explode=1&livery=white-stripes&part=a+b", "ghost")).toBe("?explode=1&part=a+b&livery=ghost");
  });
});
