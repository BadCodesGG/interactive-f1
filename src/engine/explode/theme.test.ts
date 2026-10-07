import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PALETTE,
  isThemed,
  parsePreference,
  pickTheme,
  resolvePalette,
  resolveTheme,
  setThemePreference,
  themeScript,
  THEME_ATTR,
  THEME_PREF_ATTR,
} from "./theme";

/** A stand-in for <html>, matchMedia and localStorage, enough to run the inline script and the runtime setter. */
function fakeEnv(opts: { stored?: string | null | "throws"; dark?: boolean }) {
  const attrs = new Map<string, string>();
  const root = {
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    getAttribute: (k: string) => attrs.get(k) ?? null,
    style: { colorScheme: "" },
  };
  let dark = opts.dark ?? false;
  const listeners: (() => void)[] = [];
  const mql = {
    get matches() {
      return dark;
    },
    addEventListener: (_: string, fn: () => void) => void listeners.push(fn),
  };
  const saved = new Map<string, string>();
  const storage = {
    getItem: (k: string) => {
      if (opts.stored === "throws") throw new Error("blocked");
      return saved.get(k) ?? opts.stored ?? null;
    },
    setItem: (k: string, v: string) => {
      if (opts.stored === "throws") throw new Error("blocked");
      saved.set(k, v);
    },
  };
  return {
    root,
    attrs,
    saved,
    document: { documentElement: root },
    window: { matchMedia: () => mql },
    storage,
    /** The OS changes its scheme. */
    setDark(v: boolean) {
      dark = v;
      listeners.forEach((fn) => fn());
    },
  };
}

function runScript(env: ReturnType<typeof fakeEnv>, key = "theme") {
  new Function("document", "window", "localStorage", themeScript(key))(env.document, env.window, env.storage);
}

describe("Themed values", () => {
  it("tells the { light, dark } form from a plain value", () => {
    expect(isThemed({ light: "#fff", dark: "#000" })).toBe(true);
    expect(isThemed({ dark: 1 })).toBe(true);
    expect(isThemed("#fff")).toBe(false);
    expect(isThemed({ sky: "#fff" })).toBe(false);
    expect(isThemed(undefined)).toBe(false);
    expect(isThemed([1, 2, 3] as unknown as number)).toBe(false);
  });

  it("picks per theme, and a plain value serves both", () => {
    expect(pickTheme({ light: "a", dark: "b" }, "dark")).toBe("b");
    expect(pickTheme({ light: "a" }, "dark")).toBeUndefined();
    expect(pickTheme("a", "dark")).toBe("a");
    expect(pickTheme(undefined, "light")).toBeUndefined();
  });
});

describe("resolvePalette", () => {
  it("is the defaults with nothing given", () => {
    expect(resolvePalette(undefined, "dark")).toEqual(DEFAULT_PALETTE);
  });

  it("merges a plain partial over the defaults for either theme", () => {
    const p = resolvePalette({ sky: "#123456", rimIntensity: 0.5 }, "light");
    expect(p.sky).toBe("#123456");
    expect(p.rimIntensity).toBe(0.5);
    expect(p.key).toBe(DEFAULT_PALETTE.key);
    expect(resolvePalette({ sky: "#123456" }, "dark").sky).toBe("#123456");
  });

  it("merges the given theme's partial only, over the defaults", () => {
    const themed = { light: { sky: "#eef", keyIntensity: 3 }, dark: { sky: "#112" } };
    expect(resolvePalette(themed, "light")).toEqual({ ...DEFAULT_PALETTE, sky: "#eef", keyIntensity: 3 });
    expect(resolvePalette(themed, "dark")).toEqual({ ...DEFAULT_PALETTE, sky: "#112" });
  });

  it("falls back to the defaults for a theme left out, and ignores undefined values", () => {
    expect(resolvePalette({ light: { sky: "#eef" } }, "dark")).toEqual(DEFAULT_PALETTE);
    expect(resolvePalette({ sky: undefined }, "light").sky).toBe(DEFAULT_PALETTE.sky);
  });
});

describe("preferences", () => {
  it("resolves system through the OS, and a choice to itself", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("treats anything unknown as system", () => {
    expect(parsePreference("dark")).toBe("dark");
    expect(parsePreference("light")).toBe("light");
    expect(parsePreference("system")).toBe("system");
    expect(parsePreference("blue")).toBe("system");
    expect(parsePreference(null)).toBe("system");
  });
});

describe("themeScript", () => {
  it("applies a stored light or dark choice whatever the OS says", () => {
    const dark = fakeEnv({ stored: "dark", dark: false });
    runScript(dark);
    expect(dark.attrs.get(THEME_ATTR)).toBe("dark");
    expect(dark.attrs.get(THEME_PREF_ATTR)).toBe("dark");
    expect(dark.root.style.colorScheme).toBe("dark");
    const light = fakeEnv({ stored: "light", dark: true });
    runScript(light);
    expect(light.attrs.get(THEME_ATTR)).toBe("light");
    expect(light.root.style.colorScheme).toBe("light");
  });

  it("defaults to system, resolved through matchMedia, with nothing stored, junk stored or storage throwing", () => {
    for (const stored of [null, "purple", "throws"] as const) {
      const env = fakeEnv({ stored, dark: true });
      runScript(env);
      expect(env.attrs.get(THEME_PREF_ATTR)).toBe("system");
      expect(env.attrs.get(THEME_ATTR)).toBe("dark");
      expect(env.root.style.colorScheme).toBe("dark");
    }
    const env = fakeEnv({ stored: null, dark: false });
    runScript(env);
    expect(env.attrs.get(THEME_ATTR)).toBe("light");
  });

  it("follows the OS while on system, and not once a theme is chosen", () => {
    const system = fakeEnv({ stored: "system", dark: false });
    runScript(system);
    system.setDark(true);
    expect(system.attrs.get(THEME_ATTR)).toBe("dark");
    expect(system.root.style.colorScheme).toBe("dark");
    system.setDark(false);
    expect(system.attrs.get(THEME_ATTR)).toBe("light");

    const chosen = fakeEnv({ stored: "light", dark: false });
    runScript(chosen);
    chosen.setDark(true);
    expect(chosen.attrs.get(THEME_ATTR)).toBe("light");
  });

  it("reads the storage key it was given", () => {
    const env = fakeEnv({ stored: "dark" });
    const get = vi.spyOn(env.storage, "getItem");
    runScript(env, "my-app:theme");
    expect(get).toHaveBeenCalledWith("my-app:theme");
  });

  it("keeps a hostile key inside its string", () => {
    const script = themeScript('x"</script><script>alert(1)//');
    expect(script).not.toContain("</script");
    expect(() => new Function("document", "window", "localStorage", script)).not.toThrow();
  });

  it("does not throw with no matchMedia at all", () => {
    const env = fakeEnv({ stored: "dark" });
    expect(() => new Function("document", "window", "localStorage", themeScript())(env.document, {}, env.storage)).not.toThrow();
  });
});

describe("setThemePreference", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(env: ReturnType<typeof fakeEnv>) {
    vi.stubGlobal("document", env.document);
    vi.stubGlobal("window", env.window);
    vi.stubGlobal("localStorage", env.storage);
  }

  it("sets the attributes and colour scheme, and saves the choice", () => {
    const env = fakeEnv({ dark: true });
    stub(env);
    setThemePreference("light", "k");
    expect(env.attrs.get(THEME_ATTR)).toBe("light");
    expect(env.attrs.get(THEME_PREF_ATTR)).toBe("light");
    expect(env.root.style.colorScheme).toBe("light");
    expect(env.saved.get("k")).toBe("light");
    setThemePreference("system", "k");
    expect(env.attrs.get(THEME_ATTR)).toBe("dark");
    expect(env.attrs.get(THEME_PREF_ATTR)).toBe("system");
    expect(env.saved.get("k")).toBe("system");
  });

  it("still changes the theme when storage is blocked", () => {
    const env = fakeEnv({ stored: "throws" });
    stub(env);
    expect(() => setThemePreference("dark")).not.toThrow();
    expect(env.attrs.get(THEME_ATTR)).toBe("dark");
  });

  it("does nothing on the server", () => {
    expect(() => setThemePreference("dark")).not.toThrow();
  });
});
