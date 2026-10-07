"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { controlsHint } from "../gate-state";
import { useExplodeStore } from "../provider";
import type { Sidecar } from "../sidecar";
import { useExplodeState } from "../store";

/**
 * The X-ray slider: fades the sidecar's outer groups (`xray`) so the layers inside show through.
 * Renders nothing for a sidecar without `xray`. A native, labelled range, like the explode slider.
 */
export function XrayControl({ sidecar, className }: { sidecar: Pick<Sidecar, "xray">; className?: string }) {
  const store = useExplodeStore();
  const { xray, ready, stageGate } = useExplodeState(store);
  const id = useId();
  const hintId = useId();
  const hint = controlsHint(stageGate, ready);
  if (!sidecar.xray?.length) return null;
  return (
    <div data-xray-control className={cn("flex flex-wrap items-center gap-x-3", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink-secondary">
        X-ray
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={xray}
        disabled={!ready}
        aria-describedby={hint ? hintId : undefined}
        data-xray-range
        onChange={(e) => store.setXray(Number(e.currentTarget.value))}
        className="h-6 min-w-24 flex-1 cursor-pointer accent-accent max-md:h-9 disabled:cursor-not-allowed disabled:opacity-50"
      />
      {hint && (
        <p id={hintId} data-controls-hint className="basis-full text-xs text-ink-secondary">
          {hint}
        </p>
      )}
    </div>
  );
}
