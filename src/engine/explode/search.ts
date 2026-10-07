/** Part search: the ids whose label or group match a typed query, in sidecar order. */
import type { Sidecar } from "./sidecar";

type Layout = Pick<Sidecar, "groups" | "parts">;

/**
 * Case-insensitive. Every word of the query must appear in the part's label, its group's label or
 * its group id, so "femur bone" finds "Femur" in the group "Bones" and order does not matter. An
 * empty query matches every part.
 */
export function matchParts(sidecar: Layout, query: string): string[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const ids = Object.keys(sidecar.parts);
  if (words.length === 0) return ids;
  return ids.filter((id) => {
    const part = sidecar.parts[id];
    const group = part.group && Object.hasOwn(sidecar.groups, part.group) ? sidecar.groups[part.group] : undefined;
    const hay = `${part.label} ${group?.label ?? ""} ${part.group ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
