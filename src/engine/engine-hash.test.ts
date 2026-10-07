import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// src/engine/explode/ is the exploded-view engine shared by interactive-pc, interactive-f1 and
// interactive-anatomy (github.com/BadCodesGG), kept identical in all three. The hash is sha256 over
// the sorted relative paths and the contents (CRLF read as LF) of every file under it.
const engineDir = path.join(process.cwd(), "src", "engine", "explode");

function walk(rel = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(engineDir, rel), { withFileTypes: true })) {
    const next = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(next));
    else out.push(next);
  }
  return out.sort();
}

function engineHash(): string {
  const h = createHash("sha256");
  for (const file of walk()) {
    h.update(`${file}\0`);
    h.update(readFileSync(path.join(engineDir, file)).toString("latin1").replace(/\r\n/g, "\n"), "latin1");
    h.update("\0");
  }
  return h.digest("hex");
}

describe("engine copy", () => {
  it("matches the shared engine (src/engine/engine.hash)", () => {
    const recorded = readFileSync(path.join(process.cwd(), "src", "engine", "engine.hash"), "utf8").trim();
    expect(
      engineHash(),
      "src/engine/explode/ differs from the recorded engine, which is kept identical across the exploded-view sites. If the change is deliberate, leave engine.hash alone and say so in your pull request; the maintainer applies it to every site and records the new hash",
    ).toBe(recorded);
  });
});
