"use client";

import dynamic from "next/dynamic";
import type { CarYear } from "@/data/car-specs";
import { StageGate, useExplodeState, useExplodeStore, type Sidecar } from "@/engine/explode";
import { LIVERY_META } from "@/models/f1/livery-meta";
import { useLivery } from "@/models/f1/livery-store";
import { cn } from "@/lib/utils";

// three, R3F and camera-controls live only in these lazy chunks. `ssr: false` is allowed only in a
// Client Component, which is why this wrapper exists. They are requested after idle, only with
// WebGL 2, and under reduced motion only when the visitor presses Load 3D. The sibling
// `import("three")` gives three its own chunk (shared and cached across every feature route) that
// downloads in parallel with the stage's own code, instead of being bundled into it.
const Stage = dynamic(() => Promise.all([import("./stage"), import("three")]).then(([stage]) => stage), { ssr: false });

function Poster({ year }: { year: CarYear }) {
  const livery = LIVERY_META[useLivery()].name;
  return (
    <div
      role="img"
      aria-label={year === 2022 ? "A 2022 Formula 1 car in a neutral finish, ready to be taken apart" : `A 2026 Formula 1 car in the ${livery} livery, ready to be taken apart`}
      className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_45%,color-mix(in_srgb,var(--accent)_16%,transparent),transparent_60%)]"
    >
      <span className="font-display text-sm uppercase tracking-[0.2em] text-ink-tertiary">Exploded view</span>
    </div>
  );
}

export function StageClient({ sidecar, year, className, opening }: { sidecar: Sidecar; year: CarYear; className?: string; opening?: boolean }) {
  const store = useExplodeStore();
  const { ready, k, opening: flying } = useExplodeState(store);
  // data-stage-k is the explode amount at the last settle: npm run test:stage waits on it. The
  // opening fly-in holds data-stage-ready for its ~2 s, so a check or a screenshot sees the fitted pose.
  return (
    <div data-stage-ready={ready && !flying ? "true" : "false"} data-stage-k={k}>
      {/* The other year is another car, with its own model and parts: a new stage, not a reload inside the old one. */}
      <StageGate poster={<Poster year={year} />} className={cn("border-0 bg-transparent bg-[image:var(--stage-pool)]", className)}>{(gate) => <Stage key={year} sidecar={sidecar} year={year} opening={opening} {...gate} />}</StageGate>
    </div>
  );
}
