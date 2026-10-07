import { describe, expect, it } from "vitest";
import { CAR_YEARS, DEFAULT_YEAR, headline, parseCarYear, specRows, withCarParam } from "./car-specs";
import { copyBook as copy2022 } from "./f222.copy";
import { facts2026 } from "./facts-2026";
import f1Json from "./f1.sidecar.json";
import f222Json from "./f222.sidecar.json";
import { copyBook as copy2026 } from "./f1.copy";

const all2026Text = [...facts2026.map((f) => `${f.title} ${f.body}`), ...Object.values(copy2026).flatMap((c) => [c.summary, c.function, c.whyItMatters, ...(c.stats ?? []).map((s) => `${s.label} ${s.value}`)])].join(" ");
const all2022Text = Object.values(copy2022).flatMap((c) => [c.summary, c.function, c.whyItMatters, c.funFact ?? "", ...(c.stats ?? []).map((s) => `${s.label} ${s.value}`)]).join(" ");

describe("the 2022 against 2026 rows", () => {
  it("cover active aero, dimensions, weight and the power unit split, once each", () => {
    const ids = specRows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const want of ["aero", "width", "wheelbase", "mass", "electric", "mguh", "split"]) expect(ids).toContain(want);
  });

  it("give every row both years, a change and a source the page can link", () => {
    for (const r of specRows) {
      expect(r.label.length, r.id).toBeGreaterThan(0);
      expect(r.v2022.length, r.id).toBeGreaterThan(0);
      expect(r.v2026.length, r.id).toBeGreaterThan(0);
      expect(r.v2022, r.id).not.toBe(r.v2026);
      expect(r.change.length, r.id).toBeGreaterThan(0);
      expect(r.sources.length, r.id).toBeGreaterThan(0);
      for (const url of r.sources) expect(url, r.id).toMatch(/^https:\/\/(www|api)\.fia\.com\//);
    }
  });

  it("has no em dash in any text, which the site never uses", () => {
    const text = JSON.stringify([specRows, headline]);
    expect(text).not.toContain("\u2014");
    expect(all2022Text).not.toContain("\u2014");
  });

  it("says the same 2026 figures as the copy and the facts the page already cites", () => {
    const row = (id: string) => specRows.find((r) => r.id === id)!;
    for (const id of ["width", "wheelbase"]) expect(all2026Text, id).toContain(row(id).v2026);
    expect(all2026Text).toContain("350 kW");
    expect(row("electric").v2026).toBe("350 kW");
    expect(all2026Text).toContain("724 kg");
    expect(row("mass").v2026).toContain("724 kg");
    expect(all2026Text).toContain("185 kg");
    expect(row("pu-mass").v2026).toBe("185 kg");
    expect(all2026Text).toContain("550 to 560 kW");
    expect(row("engine").v2022).toBe("550 to 560 kW");
  });

  it("says the same 2022 figures as the 2022 copy", () => {
    const row = (id: string) => specRows.find((r) => r.id === id)!;
    expect(all2022Text).toContain(row("width").v2022);
    expect(all2022Text).toContain(row("wheelbase").v2022.replace(" mm", ""));
    expect(all2022Text).toContain("798 kg");
  });
});

describe("the headline figures over the stage", () => {
  it("carry the same four labels in both years, and the rows' own numbers", () => {
    expect(headline[2022].map((h) => h.label)).toEqual(headline[2026].map((h) => h.label));
    const value = (year: 2022 | 2026, label: string) => headline[year].find((h) => h.label === label)!.value;
    const row = (id: string) => specRows.find((r) => r.id === id)!;
    expect(value(2022, "Width")).toBe(row("width").v2022);
    expect(value(2026, "Width")).toBe(row("width").v2026);
    expect(value(2022, "Max wheelbase")).toBe(row("wheelbase").v2022);
    expect(value(2026, "Max wheelbase")).toBe(row("wheelbase").v2026);
    expect(value(2022, "Electric power")).toBe(row("electric").v2022);
    expect(value(2026, "Electric power")).toBe(row("electric").v2026);
    expect(headline[2026].filter((h) => h.hot)).toHaveLength(1);
  });
});

describe("the two cars' sidecars", () => {
  it("are different models, each a file of its own", () => {
    expect(f1Json.model).not.toBe(f222Json.model);
    expect(f1Json.model).toMatch(/^\/models\/f226\.[0-9a-f]{8}\.glb$/);
    expect(f222Json.model).toMatch(/^\/models\/f222\.[0-9a-f]{8}\.glb$/);
  });
});

describe("the ?car= parameter", () => {
  it("reads only the two years", () => {
    expect(parseCarYear("2022")).toBe(2022);
    expect(parseCarYear("2026")).toBe(2026);
    for (const bad of [null, undefined, "", "2023", "22", "2022 ", "abc", "__proto__"]) expect(parseCarYear(bad as string | null), String(bad)).toBeNull();
  });

  it("writes 2022 and drops the parameter for the default year, keeping every other one byte for byte and in order", () => {
    expect(DEFAULT_YEAR).toBe(2026);
    expect(withCarParam("", 2022)).toBe("?car=2022");
    expect(withCarParam("", 2026)).toBe("");
    expect(withCarParam("?livery=powder-blue&part=floor", 2022)).toBe("?livery=powder-blue&part=floor&car=2022");
    expect(withCarParam("?car=2022&livery=powder-blue", 2026)).toBe("?livery=powder-blue");
    expect(withCarParam("?car=2022&x=a%20b", 2022)).toBe("?x=a%20b&car=2022");
    // An encoded key is the same parameter to get(), so it is replaced, not left to win on reload.
    expect(withCarParam("?%63ar=2022&keep=1", 2026)).toBe("?keep=1");
    expect(CAR_YEARS).toEqual([2022, 2026]);
  });
});
