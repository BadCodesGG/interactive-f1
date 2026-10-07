import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { accentShades, contrast } from "@/models/f1/livery-accent";
import { LIVERY_IDS } from "@/models/f1/liveries";
import { LIVERY_META } from "@/models/f1/livery-meta";
import { DEFAULT_LIVERY_ID } from "@/models/f1/livery-name";

const css = readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");

/** The declarations of the rule whose selector is exactly `selector`. */
function block(selector: string): Record<string, string> {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`globals.css has no rule for ${selector}`);
  const body = css.slice(at + selector.length + 2, css.indexOf("}", at));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

/** A token of a block as a hex, following one `var(--x)` hop into the same block. */
function hex(tokens: Record<string, string>, name: string): string {
  const v = tokens[name];
  const ref = /^var\((--[\w-]+)\)$/.exec(v ?? "");
  const out = ref ? tokens[ref[1]] : v;
  if (!/^#[0-9a-f]{6}$/i.test(out ?? "")) throw new Error(`${name} is not a hex: ${v}`);
  return out;
}

const THEMES = {
  dark: { base: block(":root"), livery: (id: string) => block(`:root[data-livery="${id}"]:not([data-theme="light"])`) },
  light: { base: block('[data-theme="light"]'), livery: (id: string) => block(`:root[data-theme="light"][data-livery="${id}"]`) },
} as const;

describe("the site accent per livery", () => {
  for (const theme of ["dark", "light"] as const) {
    const { base, livery } = THEMES[theme];
    const bg = hex(base, "--bg");
    const surface = hex(base, "--surface");

    for (const id of LIVERY_IDS) {
      const tokens = livery(id);
      const meta = LIVERY_META[id].accents[theme];

      describe(`${id}, ${theme}`, () => {
        it("carries the accent and on-accent colours of the livery's meta, and the shades derived from the accent", () => {
          expect(tokens["--accent"]).toBe(meta.accent);
          expect(tokens["--on-accent"]).toBe(meta.on);
          const { hover, strong } = accentShades(meta.accent, theme);
          expect(tokens["--accent-hover"]).toBe(hover);
          expect(tokens["--accent-strong"]).toBe(strong);
        });

        it("reads at 3:1 or better against the page and the surface, filled or as text, hovered or not", () => {
          for (const colour of [tokens["--accent"], tokens["--accent-hover"]]) {
            expect(contrast(colour, bg), `${colour} on --bg ${bg}`).toBeGreaterThanOrEqual(3);
            expect(contrast(colour, surface), `${colour} on --surface ${surface}`).toBeGreaterThanOrEqual(3);
          }
        });

        it("carries text at 4.5:1 or better: the on-accent colour on a fill, and the accent itself on the page and the surface", () => {
          expect(contrast(tokens["--on-accent"], tokens["--accent"]), "on accent").toBeGreaterThanOrEqual(4.5);
          expect(contrast(tokens["--on-accent"], tokens["--accent-hover"]), "on hover").toBeGreaterThanOrEqual(4.5);
          expect(contrast(tokens["--accent"], bg), "accent text on --bg").toBeGreaterThanOrEqual(4.5);
          expect(contrast(tokens["--accent"], surface), "accent text on --surface").toBeGreaterThanOrEqual(4.5);
        });
      });
    }
  }

  it("makes Ghost the default, so a visitor without the script (or before it runs) gets the same accent", () => {
    for (const theme of ["dark", "light"] as const) {
      const { base, livery } = THEMES[theme];
      const ghost = livery(DEFAULT_LIVERY_ID);
      for (const name of ["--accent", "--accent-hover", "--accent-strong", "--on-accent"]) expect(hex(base, name), `${theme} ${name}`).toBe(ghost[name]);
    }
  });

  it("is what a filled button and badge draw: their text is the on-accent token, not the page background", () => {
    for (const file of ["button.tsx", "badge.tsx"]) {
      const source = readFileSync(path.join(process.cwd(), "src", "components", "ui", file), "utf8");
      expect(source, file).toContain("text-[var(--on-accent)]");
      expect(source, file).not.toContain("bg-[var(--accent)] text-[var(--bg)]");
    }
  });
});

describe("the field border (the part search input and the theme toggle)", () => {
  for (const theme of ["dark", "light"] as const) {
    it(`reads at 3:1 or better against the surface they are filled with and the page they sit on, ${theme}`, () => {
      const { base } = THEMES[theme];
      const border = hex(base, "--field-border");
      expect(contrast(border, hex(base, "--surface")), "on --surface").toBeGreaterThanOrEqual(3);
      expect(contrast(border, hex(base, "--bg")), "on --bg").toBeGreaterThanOrEqual(3);
    });
  }
});

describe("the controls that draw their edge in the field border", () => {
  const read = (...parts: string[]) => readFileSync(path.join(process.cwd(), "src", ...parts), "utf8");

  it("is a Tailwind colour, so a control can say border-field-border", () => {
    expect(css).toContain("--color-field-border: var(--field-border);");
  });

  it("is what the year toggle, the livery tiles, the tunnel's segmented boxes and the outline button draw, not the hairline a card uses", () => {
    expect(read("app", "car-experience.tsx")).toContain("rounded-lg border border-field-border");
    expect(read("app", "livery-picker.tsx")).toContain("rounded-md border border-field-border");
    expect(read("app", "tunnel", "tunnel-client.tsx")).toContain("rounded-lg border border-field-border");
    expect(read("components", "ui", "button.tsx")).toContain('"border border-[var(--field-border)] bg-transparent');
  });
});
