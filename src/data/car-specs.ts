/**
 * The 2022 and 2026 cars side by side: the figures the year toggle on `/` shows. Only published figures
 * are here, each read from the FIA documents named in `sources`; a figure this file could not find there
 * is left out, not estimated. The 2026 numbers are the ones src/data/f1.copy.ts and facts-2026.ts cite.
 *
 * Pure data with no imports, so the server page and the tests can read it.
 */

export type CarYear = 2022 | 2026;
export const CAR_YEARS: readonly CarYear[] = [2022, 2026];
export const DEFAULT_YEAR: CarYear = 2026;

export const FIA_2022 = "https://www.fia.com/sites/default/files/fia_2022_formula_1_technical_regulations_-_issue_13_-_2022-08-16.pdf";
export const FIA_2026 = "https://api.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss11_-_2025-02-26.pdf";
export const FIA_EXPLAINER = "https://www.fia.com/news/f1s-new-era-everything-you-need-know-about-how-fia-making-formula-1-more-competitive-more";

export interface SpecRow {
  id: string;
  label: string;
  /** The 2022 rule and the 2026 rule, as they read on the page. */
  v2022: string;
  v2026: string;
  /** What changed, in a few words. */
  change: string;
  sources: readonly string[];
}

/** What changed between the 2022 rules and the 2026 rules: active aero, dimensions, weight and the power unit split. */
export const specRows: readonly SpecRow[] = [
  {
    id: "aero",
    label: "Moving aero",
    v2022: "One rear-wing flap (DRS), opened by the driver",
    v2026: "Front and rear wings both move (Corner Mode and Straight Mode); DRS is gone",
    change: "Active aero on both wings",
    sources: [FIA_2022, FIA_EXPLAINER],
  },
  {
    id: "width",
    label: "Width",
    v2022: "2,000 mm",
    v2026: "1,900 mm",
    change: "100 mm narrower",
    sources: [FIA_2022, FIA_2026],
  },
  {
    id: "wheelbase",
    label: "Maximum wheelbase",
    v2022: "3,600 mm",
    v2026: "3,400 mm",
    change: "200 mm shorter",
    sources: [FIA_2022, FIA_2026],
  },
  {
    id: "mass",
    label: "Minimum mass",
    v2022: "798 kg, the car without fuel",
    v2026: "724 kg plus the tyres, about 770 kg",
    change: "about 30 kg lighter",
    sources: [FIA_2022, FIA_2026, FIA_EXPLAINER],
  },
  {
    id: "engine",
    label: "Engine power (V6 turbo)",
    v2022: "550 to 560 kW",
    v2026: "about 400 kW",
    change: "roughly 150 kW less",
    sources: [FIA_EXPLAINER],
  },
  {
    id: "electric",
    label: "Electric power (MGU-K)",
    v2022: "120 kW",
    v2026: "350 kW",
    change: "almost triples",
    sources: [FIA_2022, FIA_2026, FIA_EXPLAINER],
  },
  {
    id: "mguh",
    label: "MGU-H (turbo heat recovery)",
    v2022: "Fitted",
    v2026: "Removed",
    change: "gone",
    sources: [FIA_EXPLAINER],
  },
  {
    id: "split",
    label: "Electric share of peak power",
    v2022: "roughly a fifth",
    v2026: "about half",
    change: "an even split between engine and electric",
    sources: [FIA_EXPLAINER],
  },
  {
    id: "pu-mass",
    label: "Minimum power unit mass",
    v2022: "150 kg",
    v2026: "185 kg",
    change: "35 kg heavier",
    sources: [FIA_2022, FIA_2026],
  },
];

/** The four figures over the stage, for each year. `hot` is the one drawn in the accent. */
export const headline: Record<CarYear, readonly { label: string; value: string; hot: boolean }[]> = {
  2026: [
    { label: "Max wheelbase", value: "3,400 mm", hot: false },
    { label: "Width", value: "1,900 mm", hot: false },
    { label: "Minimum mass", value: "about 770 kg", hot: false },
    { label: "Electric power", value: "350 kW", hot: true },
  ],
  2022: [
    { label: "Max wheelbase", value: "3,600 mm", hot: false },
    { label: "Width", value: "2,000 mm", hot: false },
    { label: "Minimum mass", value: "798 kg", hot: false },
    { label: "Electric power", value: "120 kW", hot: true },
  ],
};

/** The year in a `?car=` parameter, or null for anything else (the address is user input). */
export function parseCarYear(value: string | null | undefined): CarYear | null {
  return value === "2022" ? 2022 : value === "2026" ? 2026 : null;
}

/**
 * A query string (with its `?`) that names `year`, every other parameter kept byte for byte and in order; the default
 * year leaves no parameter. Keys compare decoded, as `get()` reads them, so `%63ar=` is replaced too (the same rule as
 * the engine's `segmentKey`, written out here so this file keeps no imports).
 */
export function withCarParam(search: string, year: CarYear): string {
  const kept = search
    .replace(/^\?/, "")
    .split("&")
    .filter((seg) => seg !== "" && new URLSearchParams(seg).keys().next().value !== "car");
  if (year !== DEFAULT_YEAR) kept.push(`car=${year}`);
  return kept.length ? `?${kept.join("&")}` : "";
}
