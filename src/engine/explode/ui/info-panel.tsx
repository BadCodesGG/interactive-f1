"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { Lightbulb, Shuffle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { CopyBook } from "../copy";
import { factParts, randomFactPart } from "../facts";
import { pickPart } from "../filter";
import { useExplodeStore } from "../provider";
import type { Sidecar } from "../sidecar";
import { sourceLabel } from "../source-label";
import { useExplodeState } from "../store";

export interface InfoPanelProps {
  sidecar: Sidecar;
  copy: CopyBook;
  /** Shown when nothing is selected (from md up; on phones the sheet closes instead). */
  hint?: string;
  className?: string;
  /** Shows the part's `funFact` as a card, and a "Random fact" button that picks a part that has one. */
  facts?: boolean;
  /** Feature content shown under the copy, with or without a selection (a Client Component that reads the store). */
  children?: ReactNode;
}

const LABEL = "text-xs font-semibold uppercase tracking-[0.08em] text-ink-tertiary";

/**
 * The selected part's copy, as ordinary DOM: real headings, selectable text, links a screen reader
 * can follow. A side panel from md up; a bottom sheet on phones, closed when nothing is selected, 40vh
 * tall until "Read more" grows it to 75vh.
 */
export function InfoPanel({ sidecar, copy, hint = "Pick a part in the list or the 3D view to read about it.", className, facts = false, children }: InfoPanelProps) {
  const store = useExplodeStore();
  const { selected } = useExplodeState(store);
  const part = selected ? sidecar.parts[selected] : undefined;
  const entry = part ? copy[part.copy] : undefined;
  const group = part?.group ? sidecar.groups[part.group]?.label : undefined;
  const anyFact = useMemo(() => facts && factParts(sidecar, copy).length > 0, [facts, sidecar, copy]);
  // Phone sheet height: short by default so the part stays visible above it, grown on request for the
  // part it was grown for (another selection starts short again).
  const [grownFor, setGrownFor] = useState<string | null>(null);
  const grown = !!selected && grownFor === selected;
  const bodyId = useId();

  return (
    <section
      data-info-panel
      aria-live="polite"
      aria-label="Part details"
      id={bodyId}
      className={cn(
        "rounded-xl border border-border bg-surface p-5",
        part
          ? cn(
              "fixed inset-x-0 bottom-0 z-40 overflow-y-auto rounded-b-none shadow-2xl md:static md:z-auto md:max-h-none md:rounded-b-xl md:shadow-none",
              grown ? "max-h-[75vh]" : "max-h-[40vh]",
            )
          : "hidden md:block",
        className,
      )}
    >
      {part && entry ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              {group && (
                <Badge variant="outline" className="mb-2 border-accent/40 text-accent">
                  {group}
                </Badge>
              )}
              <h2 data-info-title className="font-display text-xl font-bold text-ink">
                {part.label}
              </h2>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                aria-expanded={grown}
                aria-controls={bodyId}
                data-info-expand
                onClick={() => setGrownFor(grown ? null : selected)}
                className="min-h-11 px-3 md:hidden"
              >
                {grown ? "Show less" : "Read more"}
              </Button>
              <Button variant="ghost" size="icon" aria-label="Close part details" onClick={() => store.select(null)}>
                <X />
              </Button>
            </div>
          </div>
          <p className="mt-2 text-sm text-ink-secondary">{entry.summary}</p>
          <Separator className="my-4" />
          <dl className="space-y-3 text-sm">
            <div>
              <dt className={LABEL}>What it does</dt>
              <dd className="mt-1 text-ink">{entry.function}</dd>
            </div>
            <div>
              <dt className={LABEL}>Why it matters</dt>
              <dd className="mt-1 text-ink">{entry.whyItMatters}</dd>
            </div>
            {entry.funFact && !facts && (
              <div>
                <dt className={LABEL}>Fun fact</dt>
                <dd className="mt-1 text-ink">{entry.funFact}</dd>
              </div>
            )}
          </dl>
          {facts && entry.funFact && (
            <div data-fact-card className="mt-4 flex gap-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2.5">
              <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
              <div>
                <h3 className={LABEL}>Did you know</h3>
                <p className="mt-1 text-sm text-ink">{entry.funFact}</p>
              </div>
            </div>
          )}
          {entry.stats && entry.stats.length > 0 && (
            <dl className="mt-4 grid grid-cols-2 gap-2">
              {entry.stats.map((s) => (
                <div key={s.label} className="rounded-md border border-border bg-bg/40 px-3 py-2">
                  <dt className="text-[11px] uppercase tracking-[0.06em] text-ink-tertiary">{s.label}</dt>
                  <dd className="font-display text-base font-bold text-accent">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {entry.sources && entry.sources.length > 0 && (
            <div className="mt-4">
              <h3 className={LABEL}>Sources</h3>
              <ul className="mt-1 space-y-1 text-xs">
                {entry.sources.map((src) => {
                  const label = sourceLabel(src);
                  return (
                    <li key={src}>
                      {label ? (
                        <a href={src} title={src} className="text-accent underline-offset-4 hover:underline" rel="noreferrer" target="_blank">
                          {label}
                        </a>
                      ) : (
                        <span className="text-ink-secondary">{src}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-tertiary">{hint}</p>
      )}
      {anyFact && (
        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-random-fact
            onClick={() => {
              const id = randomFactPart(sidecar, copy, selected);
              if (id) pickPart(store, sidecar, id);
            }}
          >
            <Shuffle aria-hidden />
            Random fact
          </Button>
        </div>
      )}
      {children}
    </section>
  );
}
