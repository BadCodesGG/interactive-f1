/** Fact cards: which parts have a `funFact`, and picking one at random. */
import type { CopyBook } from "./copy";
import type { Sidecar } from "./sidecar";

/** Ids of the parts whose copy carries a fun fact, in sidecar order. */
export function factParts(sidecar: Pick<Sidecar, "parts">, copy: CopyBook): string[] {
  return Object.keys(sidecar.parts).filter((id) => !!copy[sidecar.parts[id].copy]?.funFact);
}

/**
 * A random part with a fact, never `current` unless it is the only one; null when no part has a
 * fact. `rng` is Math.random by default and injectable for tests.
 */
export function randomFactPart(sidecar: Pick<Sidecar, "parts">, copy: CopyBook, current: string | null, rng: () => number = Math.random): string | null {
  const all = factParts(sidecar, copy);
  const pool = all.length > 1 ? all.filter((id) => id !== current) : all;
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}
