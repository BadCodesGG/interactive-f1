"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CopyBook } from "../copy";
import { createDiscovery, foundLabel, useDiscovery, type Discovery } from "../discovered";
import { filterGroups, pickPart, toggleGroupInView } from "../filter";
import { preloadModel } from "../loader";
import { useExplodeStore } from "../provider";
import { matchParts } from "../search";
import type { Sidecar } from "../sidecar";
import { useExplodeState } from "../store";
import { useHydrated } from "./use-hydrated";
import { XrayControl } from "./xray-control";

export interface PartListProps {
  sidecar: Sidecar;
  /** When given, each button also carries the part's one-line summary (crawlable, and useful with no JS). */
  copy?: CopyBook;
  className?: string;
  /**
   * A filter box above the list: matches labels and groups, Enter picks the first hit, Escape clears.
   * Its border is the app's `--field-border` (falling back to `--border`); define it at 3:1 or more
   * against the box's background, since WCAG 1.4.11 holds a form field's edge to that.
   */
  search?: boolean;
  /** One chip per group that hides or shows it in the 3D view. Choosing a hidden part shows its group again. */
  filter?: boolean;
  /** Counts the parts the visitor has opened ("12 of 18 found") under this app name, with a Reset. */
  discover?: string;
  /** The X-ray slider, when the sidecar names outer groups to fade (`xray`); nothing otherwise. */
  xray?: boolean;
  /**
   * Keeps a long list from stretching the page: from `md` up the list scrolls inside a box this many
   * pixels tall (the tools above it stay put), and below `md` it folds behind an "All N parts" toggle.
   * The rows stay in the server HTML either way.
   */
  panel?: number;
}

interface Section {
  id: string;
  label: string;
  parts: string[];
}

/** Parts in sidecar order, bucketed by group in order of first appearance. */
export function partSections(sidecar: Pick<Sidecar, "groups" | "parts">): Section[] {
  const sections = new Map<string, Section>();
  for (const [id, part] of Object.entries(sidecar.parts)) {
    const gid = part.group ?? "";
    let s = sections.get(gid);
    if (!s) {
      s = { id: gid || "other", label: gid ? sidecar.groups[gid].label : "Other parts", parts: [] };
      sections.set(gid, s);
    }
    s.parts.push(id);
  }
  return [...sections.values()];
}

/**
 * The keyboard and screen reader path to every part, and what search engines see: a list of real
 * buttons, server-rendered. Pressing one selects the part in the 3D view and opens its copy.
 *
 * Opt-in extras, all above the list: `search`, `filter` (system chips), `discover` (the found
 * counter) and `xray` (the fade slider). With none of them the markup is exactly the plain list.
 */
export function PartList({ sidecar, copy, className, search = false, filter = false, discover, xray = false, panel }: PartListProps) {
  const store = useExplodeStore();
  const { selected, hovered, hidden } = useExplodeState(store);
  const hydrated = useHydrated();
  const [query, setQuery] = useState("");
  const searchId = useId();
  const groups = useMemo(() => filterGroups(sidecar), [sidecar]);
  const hits = useMemo(() => new Set(matchParts(sidecar, query)), [sidecar, query]);
  const asking = query.trim() !== "";
  const discovery = useMemo(() => (discover ? createDiscovery(discover, Object.keys(sidecar.parts)) : null), [discover, sidecar]);
  const found = useDiscovery(discovery);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);

  // Every selection, including one that arrived with a deep link, counts as found.
  useEffect(() => {
    if (!discovery) return;
    const note = () => {
      const { selected: id } = store.getState();
      if (id) discovery.add(id);
    };
    note();
    return store.subscribe(note);
  }, [store, discovery]);

  // In a panel, a part picked in the 3D view scrolls its row into the box (never the page).
  useEffect(() => {
    const el = box.current;
    if (!panel || !el || !selected || el.scrollHeight <= el.clientHeight) return;
    const row = el.querySelector<HTMLElement>(`[data-part="${CSS.escape(selected)}"]`);
    if (!row) return;
    const top = row.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
    if (top < el.scrollTop || top + row.offsetHeight > el.scrollTop + el.clientHeight) el.scrollTo({ top: top - 8, behavior: "smooth" });
  }, [panel, selected]);

  const withXray = xray && !!sidecar.xray?.length;
  const sections = partSections(sidecar)
    .map((section) => ({ ...section, parts: section.parts.filter((id) => hits.has(id)) }))
    .filter((section) => section.parts.length > 0);

  const list = (
    <ul data-part-list aria-label="Parts" className={cn("flex flex-col gap-5", className)}>
      {sections.map((section) => {
        const off = hidden.has(section.id);
        return (
          <li key={section.id} data-hidden={off || undefined}>
            <h3 id={`parts-${section.id}`} className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-tertiary">
              {section.label}
              {off && " (hidden)"}
            </h3>
            <ul aria-labelledby={`parts-${section.id}`} className={cn("flex flex-col gap-1", off && "opacity-60")}>
              {section.parts.map((id) => (
                <PartRow key={id} id={id} sidecar={sidecar} copy={copy} found={found.has(id)} on={selected === id} hover={hovered === id} />
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      {(search || filter || discovery || withXray) && (
        <div data-part-tools className="mb-4 flex flex-col gap-3">
          {discovery && <FoundCounter discovery={discovery} found={found.size} total={Object.keys(sidecar.parts).length} />}
          {search && (
            <div className="relative">
              <label htmlFor={searchId} className="sr-only">
                Search parts
              </label>
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-tertiary" />
              <input
                id={searchId}
                type="text"
                role="searchbox"
                value={query}
                disabled={!hydrated}
                placeholder="Search parts"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
                data-part-search
                onChange={(e) => setQuery(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && query) {
                    e.preventDefault();
                    setQuery("");
                  } else if (e.key === "Enter" && asking) {
                    e.preventDefault();
                    const first = matchParts(sidecar, query)[0];
                    if (first) pickPart(store, sidecar, first);
                  }
                }}
                className="h-9 w-full rounded-md border border-[color:var(--field-border,var(--color-border))] bg-surface pr-3 pl-9 text-sm text-ink placeholder:text-ink-tertiary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p role="status" className="sr-only">
                {asking ? (hits.size ? `${hits.size} ${hits.size === 1 ? "part matches" : "parts match"}` : "No parts match") : ""}
              </p>
            </div>
          )}
          {filter && groups.length > 1 && (
            <div role="group" aria-label="Show systems" data-part-filter className="flex flex-wrap gap-1.5">
              {groups.map((g) => {
                const shown = !hidden.has(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={shown}
                    disabled={!hydrated}
                    data-filter-group={g.id}
                    onClick={() => toggleGroupInView(store, sidecar, g.id)}
                    className={cn(
                      "min-h-8 cursor-pointer rounded-full border px-3 text-xs max-md:min-h-9 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                      shown ? "border-accent bg-accent/10 text-ink" : "border-[color:var(--field-border,var(--color-border))] text-ink-tertiary line-through hover:bg-surface-hover",
                    )}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
          )}
          {withXray && <XrayControl sidecar={sidecar} />}
        </div>
      )}
      {asking && sections.length === 0 && (
        <p data-part-empty className="text-sm text-ink-tertiary">
          No parts match &ldquo;{query.trim()}&rdquo;.
        </p>
      )}
      {panel && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((o) => !o)}
          className="mb-3 flex min-h-10 w-full cursor-pointer items-center justify-between rounded-md border border-[color:var(--field-border,var(--color-border))] px-3 text-sm font-medium text-ink hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none md:hidden"
        >
          {open ? "Hide parts" : `All ${Object.keys(sidecar.parts).length} parts`}
          <ChevronDown aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
      )}
      {panel ? (
        <div
          ref={box}
          id={listId}
          data-part-panel
          style={{ ["--part-panel" as string]: `${panel}px` }}
          className={cn("overscroll-contain md:max-h-(--part-panel) md:overflow-y-auto md:pr-2", !open && !asking && "max-md:hidden")}
        >
          {list}
        </div>
      ) : (
        list
      )}
    </>
  );
}

function FoundCounter({ discovery, found, total }: { discovery: Discovery; found: number; total: number }) {
  return (
    <div data-found-counter className="flex items-center justify-between gap-2 text-xs text-ink-secondary">
      <p role="status" data-found-label>
        {foundLabel(found, total)}
      </p>
      <button
        type="button"
        disabled={found === 0}
        aria-label="Reset found parts"
        onClick={() => discovery.reset()}
        className="cursor-pointer rounded-md px-2 py-1 font-medium underline-offset-4 hover:text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50"
      >
        Reset
      </button>
    </div>
  );
}

function PartRow({ id, sidecar, copy, found, on, hover }: { id: string; sidecar: Sidecar; copy?: CopyBook; found: boolean; on: boolean; hover: boolean }) {
  const store = useExplodeStore();
  const part = sidecar.parts[id];
  return (
    <li>
      <button
        type="button"
        data-part={id}
        data-found={found || undefined}
        aria-pressed={on}
        onClick={() => (on ? store.select(null) : pickPart(store, sidecar, id))}
        onPointerEnter={() => {
          store.hover(id);
          preloadModel(sidecar.model);
        }}
        onPointerLeave={() => store.hover(null)}
        onFocus={() => store.hover(id)}
        onBlur={() => store.hover(null)}
        className={cn(
          "w-full cursor-pointer rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          on
            ? "border-accent/60 bg-accent/10 text-ink"
            : hover
              ? "border-border bg-surface-hover text-ink"
              : "border-transparent text-ink-secondary hover:bg-surface-hover hover:text-ink",
        )}
      >
        <span className="block text-sm font-medium">
          {part.label}
          {found && (
            <>
              <Check aria-hidden className="ml-1.5 inline size-3.5 text-accent" />
              <span className="sr-only"> (found)</span>
            </>
          )}
        </span>
        {copy?.[part.copy] && <span className="mt-0.5 block text-xs text-ink-tertiary">{copy[part.copy].summary}</span>}
      </button>
    </li>
  );
}
