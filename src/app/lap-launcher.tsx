"use client";

import dynamic from "next/dynamic";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLauncher } from "./use-launcher";

// The lap is opt-in and most visitors never open it: its panel (and through it the circuit, the car maths and
// the 3D layer) is fetched only when they press the button, never as part of the page or the stage.
const LapPanel = dynamic(() => import("./lap-panel"), {
  ssr: false,
  loading: () => (
    <p role="status" className="rounded-xl border border-border bg-surface p-5 text-sm text-ink-secondary">
      Loading the lap
    </p>
  ),
});

/**
 * The card that offers one lap with the parts working, and swaps itself for the panel once a visitor takes it.
 * `onOpenChange` tells the page whether the panel is open, `disabled` is the page saying another dock is.
 */
export function LapLauncher({ disabled = false, onOpenChange }: { disabled?: boolean; onOpenChange?: (open: boolean) => void }) {
  const { open, setOpen, titleId, button } = useLauncher(onOpenChange);

  return (
    <>
      <section aria-labelledby={titleId} data-lap-launcher className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-5">
        <h2 id={titleId} className="font-display text-xs uppercase tracking-[0.24em] text-ink-secondary">
          One lap
        </h2>
        <p className="max-w-md text-sm text-ink-secondary">
          {open
            ? "The lap is open along the bottom of the screen, with the car above it."
            : "Watch the 2026 car take one lap with its parts working: the wheels spin and steer, the suspension moves, and the active-aero flaps open on the straights and close for the corners."}
        </p>
        <Button ref={button} size="sm" variant="outline" aria-expanded={open} aria-controls="lap-dock" data-lap-open disabled={open || disabled} onClick={() => setOpen(true)}>
          <Flag />
          Take a lap
        </Button>
      </section>
      {open && <LapPanel onClose={() => setOpen(false)} />}
    </>
  );
}
