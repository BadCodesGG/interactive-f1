import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Every .tsx under a directory. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    return statSync(file).isDirectory() ? sources(file) : file.endsWith(".tsx") ? [file] : [];
  });
}

describe("Michroma (font-display)", () => {
  it("is never given a bold class: the face has one weight, so a bold would be faked", () => {
    const bad: string[] = [];
    for (const file of sources(path.join(process.cwd(), "src", "app"))) {
      for (const [i, line] of readFileSync(file, "utf8").split("\n").entries()) {
        if (/\bfont-display\b/.test(line) && /\bfont-(bold|extrabold|semibold|medium|black)\b/.test(line)) bad.push(`${path.relative(process.cwd(), file)}:${i + 1}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("is loaded at its only weight, and the page switches font synthesis off", () => {
    const layout = readFileSync(path.join(process.cwd(), "src", "app", "layout.tsx"), "utf8");
    expect(layout).toMatch(/Michroma\(\{[^}]*weight: "400"/);
    expect(readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8")).toMatch(/font-synthesis-weight:\s*none/);
  });
});
