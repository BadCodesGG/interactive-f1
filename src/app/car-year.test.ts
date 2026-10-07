import { beforeEach, describe, expect, it, vi } from "vitest";

// The hook's effect runs at once, and its cleanup is kept, so the listener it adds can be driven by hand.
let cleanup: (() => void) | void;
vi.mock("react", () => ({
  useSyncExternalStore: () => 2026,
  useEffect: (fn: () => (() => void) | void) => {
    cleanup = fn();
  },
}));

/** A page address that replaceState and the popstate listeners act on. */
function page(path: string, search = "") {
  const listeners = new Map<string, () => void>();
  const loc = { pathname: path, search, hash: "" };
  const replaced: string[] = [];
  vi.stubGlobal("window", {
    location: loc,
    history: {
      state: null,
      replaceState: (_s: unknown, _t: string, url: string) => {
        replaced.push(url);
        const q = url.indexOf("?");
        loc.search = q < 0 ? "" : url.slice(q);
      },
    },
    addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
  });
  return { loc, replaced, listeners };
}

/** A fresh copy of the module, as a page load gives (its year is read from the address once). */
const load = () => import("./car-year");

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  cleanup = undefined;
});

describe("the year and the address after a soft navigation", () => {
  it("puts the visit's year back in the address of a Link to the page: /?car=2022, /tunnel, then / is /?car=2022 again", async () => {
    const w = page("/", "?car=2022");
    const { currentCarYear, syncCarYear } = await load();
    expect(currentCarYear()).toBe(2022);
    // To /tunnel and back by Link: the module stays loaded, the address has no year.
    w.loc.pathname = "/tunnel";
    w.loc.search = "";
    w.loc.pathname = "/";
    syncCarYear();
    expect(w.replaced).toEqual(["/?car=2022"]);
    expect(currentCarYear()).toBe(2022);
  });

  it("keeps the other parameters when it writes the year back", async () => {
    const w = page("/", "?car=2022");
    const { currentCarYear, syncCarYear } = await load();
    currentCarYear();
    w.loc.search = "?part=wing&livery=powder-blue";
    syncCarYear();
    expect(w.replaced).toEqual(["/?part=wing&livery=powder-blue&car=2022"]);
  });

  it("takes the year the address names when it is not the one held (a Back to another entry)", async () => {
    const w = page("/", "?car=2022");
    const { currentCarYear, syncCarYear } = await load();
    expect(currentCarYear()).toBe(2022);
    w.loc.search = "?car=2026";
    syncCarYear();
    expect(currentCarYear()).toBe(2026);
    expect(w.replaced).toEqual([]);
  });

  it("says so to subscribers when the address changes the year", async () => {
    const w = page("/", "");
    const { currentCarYear, syncCarYear } = await load();
    expect(currentCarYear()).toBe(2026);
    w.loc.search = "?car=2022";
    syncCarYear();
    expect(currentCarYear()).toBe(2022);
  });

  it("leaves the default year with a silent address alone", async () => {
    const w = page("/", "");
    const { syncCarYear } = await load();
    syncCarYear();
    expect(w.replaced).toEqual([]);
  });

  it("settles on mount, and on Back and Forward only while still on the page it mounted on", async () => {
    const w = page("/", "?car=2022");
    const { currentCarYear, useSyncCarYear } = await load();
    currentCarYear();
    w.loc.search = "";
    useSyncCarYear();
    expect(w.replaced).toEqual(["/?car=2022"]);
    // Back to /tunnel: the page is still mounted for a moment, and /tunnel's address must not gain a ?car=.
    w.loc.pathname = "/tunnel";
    w.loc.search = "";
    w.listeners.get("popstate")!();
    expect(w.replaced).toEqual(["/?car=2022"]);
    // Back to this page with no year in the entry's address: the year is written back.
    w.loc.pathname = "/";
    w.listeners.get("popstate")!();
    expect(w.replaced).toEqual(["/?car=2022", "/?car=2022"]);
    cleanup?.();
    expect(w.listeners.has("popstate")).toBe(false);
  });
});
