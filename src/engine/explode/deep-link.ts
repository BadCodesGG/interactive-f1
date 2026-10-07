/**
 * Deep links: `?part=<id>&explode=1&iso=1`. The address bar is user input, so reading is defensive
 * (unknown part ids and flag values other than 1 or 0 are ignored), and writing edits the query
 * string in place: every parameter that is not ours is kept byte for byte and in order.
 *
 * Pure and DOM-free: the stage reads `hasDeepLink` and the sync component in ui/ does the rest.
 */

export interface DeepLink {
  part?: string;
  /** 1 = exploded, 0 = assembled. */
  explode?: 0 | 1;
  /** Isolate the part; only ever present with a `part`. */
  iso?: true;
}

/** The slice of the store's state a link carries. */
export interface DeepLinkState {
  selected: string | null;
  target: number;
  isolated: boolean;
}

const KEYS = ["part", "explode", "iso"];

/** A query segment's key decoded the way URLSearchParams reads it, so `%70art` counts as `part`. */
export function segmentKey(seg: string): string {
  return new URLSearchParams(seg).keys().next().value ?? "";
}

function flag(v: string | null): 0 | 1 | undefined {
  return v === "1" ? 1 : v === "0" ? 0 : undefined;
}

/** What a query string (with or without its leading `?`) asks for, limited to known part ids. */
export function parseDeepLink(search: string, partIds: Iterable<string>): DeepLink {
  const params = new URLSearchParams(search);
  const known = partIds instanceof Set ? partIds : new Set(partIds);
  const out: DeepLink = {};
  const part = params.get("part");
  if (part && known.has(part)) out.part = part;
  const explode = flag(params.get("explode"));
  if (explode !== undefined) out.explode = explode;
  if (out.part && flag(params.get("iso")) === 1) out.iso = true;
  return out;
}

/** Whether the address asks for anything at all (the opening fly-in stands down for it). */
export function hasDeepLink(search: string, partIds: Iterable<string>): boolean {
  return Object.keys(parseDeepLink(search, partIds)).length > 0;
}

/** The query string (with its `?`, or "" when empty) for a state, on top of an existing one. */
export function writeDeepLink(search: string, state: DeepLinkState): string {
  const kept = search
    .replace(/^\?/, "")
    .split("&")
    .filter((seg) => seg !== "" && !KEYS.includes(segmentKey(seg)));
  if (state.selected) kept.push(`part=${encodeURIComponent(state.selected)}`);
  if (state.target >= 0.5) kept.push("explode=1");
  if (state.selected && state.isolated) kept.push("iso=1");
  return kept.length ? `?${kept.join("&")}` : "";
}

/**
 * How to bring the stage into view when a link that names a part is opened on a phone-sized screen,
 * where the part sheet covers the lower half: stage at the top, smooth unless reduced motion is asked
 * for. Null for any other arrival (no part, or a wide screen, where the panel sits beside the stage).
 */
export function arrivalScroll(link: DeepLink, narrow: boolean, reduced: boolean): ScrollIntoViewOptions | null {
  if (!link.part || !narrow) return null;
  return { block: "start", behavior: reduced ? "auto" : "smooth" };
}
