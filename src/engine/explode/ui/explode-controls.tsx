"use client";

import { useId, type ReactNode } from "react";
import { Focus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { controlsHint } from "../gate-state";
import { useExplodeStore } from "../provider";
import { useExplodeState } from "../store";

/**
 * The control of record for the explode: a native, labelled range (keyboard and screen reader for
 * free), an Explode/Assemble toggle, Reset view and Isolate. Disabled until the 3D view is ready, with
 * a line saying why when the view waits for Load 3D or cannot run.
 * `children` ride at the end of the same row (the stage tools), so extra controls add no row of their own.
 */
export function ExplodeControls({ className, children }: { className?: string; children?: ReactNode }) {
  const store = useExplodeStore();
  const { target, selected, isolated, ready, stageGate } = useExplodeState(store);
  const id = useId();
  const hintId = useId();
  const exploded = target >= 0.5;
  // Says why the row is off when the visitor has to act (Load 3D) or the view cannot run.
  const hint = controlsHint(stageGate, ready);
  const describedBy = hint ? hintId : undefined;

  return (
    <div data-explode-controls className={cn("flex flex-wrap items-center gap-3", className)}>
      <div className="flex min-w-48 flex-1 items-center gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink-secondary">
          Explode
        </label>
        <input
          id={id}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={target}
          disabled={!ready}
          aria-describedby={describedBy}
          data-explode-range
          onChange={(e) => store.setTarget(Number(e.currentTarget.value))}
          className="h-6 flex-1 cursor-pointer max-md:h-9 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      <Button size="sm" disabled={!ready} aria-describedby={describedBy} data-explode-toggle onClick={() => store.setTarget(exploded ? 0 : 1)}>
        {exploded ? "Assemble" : "Explode"}
      </Button>
      <Button size="sm" variant="outline" disabled={!ready} aria-describedby={describedBy} data-explode-reset onClick={() => store.resetView()}>
        <RotateCcw />
        Reset view
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!ready || !selected}
        aria-pressed={isolated}
        aria-describedby={describedBy}
        data-explode-isolate
        onClick={() => store.toggleIsolate()}
        className={cn(isolated && "border-accent/60 text-accent")}
      >
        <Focus />
        Isolate
      </Button>
      {children}
      {hint && (
        <p id={hintId} data-controls-hint className="basis-full text-xs text-ink-secondary">
          {hint}
        </p>
      )}
    </div>
  );
}
