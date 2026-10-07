import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIVERY_ATTR, LIVERY_STORAGE_KEY } from "./livery-choice";
import { currentLivery, normaliseLivery, setLivery, subscribeLivery } from "./livery-store";

/** A stand-in for <html>, location, history and localStorage. */
function stubBrowser(opts: { attr?: string; search?: string; stored?: string; storageThrows?: boolean } = {}) {
  const attrs = new Map<string, string>(opts.attr ? [[LIVERY_ATTR, opts.attr]] : []);
  const saved = new Map<string, string>();
  const writes: string[] = [];
  const location = { pathname: "/", search: opts.search ?? "", hash: "#top" };
  const replaced: string[] = [];
  vi.stubGlobal("document", { documentElement: { setAttribute: (k: string, v: string) => void attrs.set(k, v), getAttribute: (k: string) => attrs.get(k) ?? null } });
  vi.stubGlobal("window", {
    location,
    history: {
      state: { marker: 1 },
      replaceState: (state: unknown, _t: string, url: string) => {
        replaced.push(`${JSON.stringify(state)} ${url}`);
        location.search = url.slice(url.indexOf("?"), url.indexOf("#"));
      },
    },
  });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => {
      if (opts.storageThrows) throw new Error("blocked");
      return saved.get(k) ?? (k === LIVERY_STORAGE_KEY ? (opts.stored ?? null) : null);
    },
    setItem: (k: string, v: string) => {
      if (opts.storageThrows) throw new Error("blocked");
      writes.push(`${k}=${v}`);
      saved.set(k, v);
    },
  });
  return { attrs, saved, writes, replaced, location };
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("currentLivery", () => {
  it("is what data-livery says, and Ghost for nothing, junk, or no document at all", () => {
    expect(currentLivery()).toBe("ghost");
    stubBrowser({ attr: "white-stripes" });
    expect(currentLivery()).toBe("white-stripes");
    stubBrowser({ attr: "nope" });
    expect(currentLivery()).toBe("ghost");
    stubBrowser();
    expect(currentLivery()).toBe("ghost");
  });
});

describe("setLivery", () => {
  it("sets the attribute, remembers the choice, and puts it in the address keeping the other parameters and the history state", () => {
    const b = stubBrowser({ attr: "ghost", search: "?part=body&explode=1" });
    setLivery("powder-blue");
    expect(b.attrs.get(LIVERY_ATTR)).toBe("powder-blue");
    expect(b.saved.get(LIVERY_STORAGE_KEY)).toBe("powder-blue");
    expect(b.replaced).toEqual(['{"marker":1} /?part=body&explode=1&livery=powder-blue#top']);
    expect(currentLivery()).toBe("powder-blue");
  });

  it("tells subscribers, once per change, and stops after unsubscribe", () => {
    stubBrowser({ attr: "ghost" });
    const seen: string[] = [];
    const off = subscribeLivery(() => seen.push(currentLivery()));
    setLivery("racing-red");
    setLivery("racing-red");
    off();
    setLivery("black-gold");
    expect(seen).toEqual(["racing-red"]);
  });

  it("still changes the livery when storage is blocked", () => {
    const b = stubBrowser({ attr: "ghost", storageThrows: true });
    setLivery("orange-blue");
    expect(b.attrs.get(LIVERY_ATTR)).toBe("orange-blue");
    expect(b.replaced).toHaveLength(1);
  });

  it("ignores anything that is not a known id", () => {
    const b = stubBrowser({ attr: "white-stripes" });
    setLivery("nope" as never);
    expect(b.attrs.get(LIVERY_ATTR)).toBe("white-stripes");
    expect(b.saved.size).toBe(0);
    expect(b.replaced).toEqual([]);
  });
});

describe("normaliseLivery", () => {
  it("rewrites a legacy stored id to its current id", () => {
    const b = stubBrowser({ attr: "powder-blue", stored: "gulf" });
    normaliseLivery();
    expect(b.saved.get(LIVERY_STORAGE_KEY)).toBe("powder-blue");
    expect(b.replaced).toEqual([]);
  });

  it("replaces a legacy livery value in the address, keeping the other parameters, the hash and the history state", () => {
    const b = stubBrowser({ attr: "powder-blue", search: "?part=body&livery=gulf&explode=1" });
    normaliseLivery();
    expect(b.replaced).toEqual(['{"marker":1} /?part=body&explode=1&livery=powder-blue#top']);
    expect(b.writes).toEqual([]);
  });

  it("writes nothing for a current id, junk or no value", () => {
    const b = stubBrowser({ attr: "racing-red", search: "?livery=racing-red", stored: "racing-red" });
    normaliseLivery();
    expect(b.writes).toEqual([]);
    expect(b.replaced).toEqual([]);
    const junk = stubBrowser({ search: "?livery=nope", stored: "nope" });
    normaliseLivery();
    expect(junk.writes).toEqual([]);
    expect(junk.replaced).toEqual([]);
  });

  it("still fixes the address when storage is blocked", () => {
    const b = stubBrowser({ search: "?livery=martini", storageThrows: true });
    normaliseLivery();
    expect(b.replaced).toEqual(['{"marker":1} /?livery=white-stripes#top']);
  });
});
