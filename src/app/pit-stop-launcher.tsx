"use client";

import dynamic from "next/dynamic";
import { Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLauncher } from "./use-launcher";

// The challenge is opt-in and most visitors never open it: its panel (and through it the logic and the
// 3D layer) is fetched only when they press the button, never as part of the page or the stage.
const PitStopPanel = dynamic(() => import("./pit-stop-panel"), {
  ssr: false,
  loading: () => (
    <p role="status" className="rounded-xl border border-border bg-surface p-5 text-sm text-ink-secondary">
      Loading the pit stop
    </p>
  ),
});

/**
 * The card that offers the pit stop challenge, and swaps itself for the panel once a visitor takes it.
 * `onOpenChange` tells the page whether the panel is open, `disabled` is the page saying another dock is.
 */
export function PitStopLauncher({ disabled = false, onOpenChange }: { disabled?: boolean; onOpenChange?: (open: boolean) => void }) {
  const { open, setOpen, titleId, button } = useLauncher(onOpenChange);

  return (
    <>
      <section aria-labelledby={titleId} data-pit-launcher className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-5">
        <h2 id={titleId} className="font-display text-xs uppercase tracking-[0.24em] text-ink-secondary">
          Pit stop challenge
        </h2>
        <p className="max-w-md text-sm text-ink-secondary">
          {open
            ? "The challenge is open along the bottom of the screen, with the car above it."
            : "How fast can you change four wheels? Jack the car up, take the wheels off and put them back on against the clock. Your best time is kept on this device."}
        </p>
        <Button ref={button} size="sm" variant="outline" aria-expanded={open} aria-controls="pit-stop-dock" data-pit-open disabled={open || disabled} onClick={() => setOpen(true)}>
          <Timer />
          Take the challenge
        </Button>
      </section>
      {open && <PitStopPanel onClose={() => setOpen(false)} />}
    </>
  );
}
