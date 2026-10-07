/**
 * System filter and part picking, on top of the store's `hidden` set. Kept apart from the store
 * because they need the sidecar to know which group a part belongs to.
 *
 * The rule for a hidden part: choosing it (a search hit, a list row, a random fact) shows its group
 * again first, so a selection is always something you can see. Hiding a group that holds the
 * selected part clears the selection instead.
 */
import type { Sidecar } from "./sidecar";
import type { ExplodeStore } from "./store";

type Layout = Pick<Sidecar, "groups" | "parts">;

export interface FilterGroup {
  id: string;
  label: string;
}

/** The groups that have at least one part, in the order their parts first appear. */
export function filterGroups(sidecar: Layout): FilterGroup[] {
  const out = new Map<string, FilterGroup>();
  for (const part of Object.values(sidecar.parts)) {
    const id = part.group;
    if (id && !out.has(id) && Object.hasOwn(sidecar.groups, id)) out.set(id, { id, label: sidecar.groups[id].label });
  }
  return [...out.values()];
}

/** Selects a part, first showing its group if the filter had hidden it. */
export function pickPart(store: ExplodeStore, sidecar: Layout, id: string): void {
  const group = sidecar.parts[id]?.group;
  if (group) store.showGroup(group);
  store.select(id);
}

/** Flips a group's visibility; hiding the group of the selected part deselects it. */
export function toggleGroupInView(store: ExplodeStore, sidecar: Layout, groupId: string): void {
  const { hidden, selected } = store.getState();
  if (!hidden.has(groupId) && selected && sidecar.parts[selected]?.group === groupId) store.select(null);
  store.toggleGroup(groupId);
}
