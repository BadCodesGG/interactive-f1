"use client";

import { useId } from "react";
import { LIVERY_IDS, LIVERY_META } from "@/models/f1/livery-meta";
import { setLivery, useLivery } from "@/models/f1/livery-store";
import { cn } from "@/lib/utils";

/** A livery's name on the page, following the pick (Ghost on the server and until the client has read the choice). */
export function LiveryName() {
  return <>{LIVERY_META[useLivery()].name}</>;
}

/**
 * The livery picker: a radio group of the eight, each a colour chip and a name. Native radios in a
 * fieldset, so the arrow keys, Tab, the screen reader's group and the label's click all come for
 * free; the tile is at least 44 px tall (the phone touch target) and the focused or chosen one is
 * ringed in the accent, which is itself the chosen livery's. Choosing repaints the car in place
 * (src/app/livery-layer.tsx), and is remembered (livery-store.ts).
 */
export function LiveryPicker({ className }: { className?: string }) {
  const name = useId();
  const chosen = useLivery();
  return (
    <fieldset role="radiogroup" data-livery-picker className={cn("flex flex-col gap-2", className)}>
      <legend className="mb-2 text-sm font-medium text-ink-secondary">Livery</legend>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {LIVERY_IDS.map((id) => {
          const meta = LIVERY_META[id];
          return (
            <label
              key={id}
              className="relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-field-border bg-surface px-3 text-sm text-ink transition-colors hover:bg-surface-hover has-[:checked]:border-accent has-[:checked]:bg-surface-hover has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-bg"
            >
              <input type="radio" name={name} value={id} checked={chosen === id} onChange={() => setLivery(id)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" data-livery-option={id} />
              <span aria-hidden className="flex h-4 w-8 shrink-0 overflow-hidden rounded-xs border border-ink-secondary/60">
                {meta.chip.map((colour) => (
                  <span key={colour} className="h-full flex-1" style={{ background: colour }} />
                ))}
              </span>
              <span className={cn(chosen === id && "font-semibold")}>{meta.name}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
