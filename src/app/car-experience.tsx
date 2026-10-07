"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { CAR_YEARS, FIA_2022, FIA_2026, FIA_EXPLAINER, headline, specRows, type CarYear } from "@/data/car-specs";
import { DeepLinkSync, ExplodeControls, InfoPanel, PartList, StageTools, useExplodeStore, type CopyBook, type Sidecar } from "@/engine/explode";
import { cn } from "@/lib/utils";
import { setCarYear, useCarYear, useSyncCarYear } from "./car-year";
import { LapLauncher } from "./lap-launcher";
import { LiveryName, LiveryPicker } from "./livery-picker";
import { PitStopLauncher } from "./pit-stop-launcher";
import { StageClient } from "./stage-client";

export interface CarData {
  sidecar: Sidecar;
  copy: CopyBook;
}

const LABEL = "text-xs font-semibold uppercase tracking-[0.08em] text-ink-tertiary";
/** A cell of the rules table: beside its column on a wide screen, under its rule on a phone with its column's name in front. */
const STACKED =
  "px-3 py-3 align-top text-sm max-sm:flex max-sm:gap-3 max-sm:px-0 max-sm:py-1 max-sm:before:w-14 max-sm:before:shrink-0 max-sm:before:text-xs max-sm:before:font-semibold max-sm:before:text-ink-tertiary max-sm:before:content-[attr(data-label)]";

/** The year's own copy: the server renders 2026 and the client swaps it in straight after hydrating. */
function ByYear({ y2022, y2026 }: { y2022: React.ReactNode; y2026: React.ReactNode }) {
  return <>{useCarYear() === 2022 ? y2022 : y2026}</>;
}

/**
 * Picks the car: a radio group (native radios, so the arrow keys, Tab and the screen reader's group come
 * free). Choosing one lets go of anything selected or hidden on the car being left, since the other car
 * has other parts, and the stage swaps its model.
 */
function YearToggle() {
  const name = useId();
  const year = useCarYear();
  const store = useExplodeStore();
  const pick = (next: CarYear) => {
    if (next === year) return;
    store.select(null);
    store.set({ ready: false, hovered: null, isolated: false, hidden: new Set() });
    setCarYear(next);
  };
  return (
    <fieldset role="radiogroup" data-year-toggle className="flex flex-wrap items-center gap-3">
      <legend className="sr-only">Which rules year</legend>
      <span aria-hidden className={LABEL}>
        Rules year
      </span>
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-field-border bg-bg/40 p-1">
        {CAR_YEARS.map((y) => (
          <label
            key={y}
            className="flex min-h-10 min-w-20 cursor-pointer items-center justify-center rounded-md px-4 text-sm font-medium text-ink-secondary transition-colors hover:text-ink has-[:checked]:bg-accent/15 has-[:checked]:text-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
          >
            <input type="radio" name={name} value={y} checked={year === y} onChange={() => pick(y)} className="sr-only" />
            {y}
          </label>
        ))}
      </div>
      <a href="#rules-2022-2026" className="inline-flex min-h-9 items-center text-xs text-accent underline-offset-4 hover:underline">
        What changed from 2022 to 2026
      </a>
    </fieldset>
  );
}

/** What comes apart and what to do with it. Under the title on a wide screen, under the stage on a phone (see CarExperience). */
function Intro() {
  return (
    <ByYear
      y2022={
        <>
          The body lifts away first, with its mirrors and cameras above it and the cockpit rising out after it, while the wings, the floor and the wheels
          slide clear. The 2022 car is shown in a neutral pearl finish, and its power unit is not modelled: the 2026 car has one. Drag the Explode slider, then
          pick any part to read what it does under the 2022 rules.
        </>
      }
      y2026={
        <>
          The body lifts away first, with its mirrors and cameras above it and the cockpit rising out after it, while the wings, the floor and the wheels
          slide clear. The power unit inside then spreads out in a layer of its own: the V6, the turbo, the MGU-K, the battery, the radiators and the gearbox.
          Drag the Explode slider, then pick any part to read what it does. The car wears the <LiveryName /> livery; pick another below.
        </>
      }
    />
  );
}

/** The figures over the stage, for the car on it. */
function Headline() {
  const year = useCarYear();
  return (
    <dl
      data-spec-readout
      className="pointer-events-none mt-4 grid grid-cols-2 gap-x-6 gap-y-3 md:absolute md:inset-x-0 md:bottom-0 md:mt-0 md:flex md:flex-wrap md:gap-x-10 md:bg-gradient-to-t md:from-bg/90 md:to-transparent md:px-6 md:pt-10 md:pb-5"
    >
      {headline[year].map((spec) => (
        <div key={spec.label}>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-secondary">{spec.label}</dt>
          <dd className={`mt-1 font-mono text-xl font-bold tabular-nums md:text-[28px] md:leading-8 ${spec.hot ? "text-accent" : "text-ink"}`}>{spec.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The stage while a dock is open (the lap's, the pit stop's): it ends where the dock begins, so the dock never
 * covers the car or the figures. The dock publishes its height (--lap-dock, --pit-dock; dock.ts). On a phone the
 * stage fills what the dock leaves; from md up it keeps its height unless the screen is too short for both. The
 * `min-h-0` is load-bearing: the stage gate's own `min-h-[320px]` would otherwise beat the height on a short screen.
 */
const DOCKED_STAGE = {
  lap: "min-h-0 max-md:h-[calc(100dvh-var(--lap-dock,18rem))] max-md:max-h-none md:h-[min(680px,calc(100dvh-var(--lap-dock,18rem)-2rem))] md:scroll-mt-4",
  pit: "min-h-0 max-md:h-[calc(100dvh-var(--pit-dock,18rem))] max-md:max-h-none md:h-[min(680px,calc(100dvh-var(--pit-dock,18rem)-2rem))] md:scroll-mt-4",
};

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");

/**
 * What changed between the two rule sets: moving aero, size, weight and the power unit. A table on a wide
 * screen, a card per rule on a phone. The column of the car on the stage is marked.
 */
function SpecDeltas() {
  const year = useCarYear();
  const head = (y: CarYear) => cn("px-3 py-2 text-left font-display text-xs uppercase tracking-[0.12em]", year === y ? "text-accent" : "text-ink-secondary");
  const cell = (y: CarYear) => cn(STACKED, year === y ? "font-medium text-ink" : "text-ink-secondary");
  return (
    <section id="rules-2022-2026" aria-labelledby="rules-title" data-rules-delta className="border-t border-border pt-10">
      <h2 id="rules-title" className="font-display text-2xl text-ink md:text-3xl">
        2022 and 2026, side by side
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-ink-secondary">
        What the rules changed between the car you can pick above: moving aero, size, weight and the power unit. Published figures only; a number that could not be found in the FIA documents is left out.
      </p>
      <table className="mt-6 w-full border-collapse max-sm:block">
        <caption className="sr-only">The 2022 and 2026 Formula 1 rules compared</caption>
        <thead className="max-sm:hidden">
          <tr className="border-b border-border">
            <th scope="col" className="px-3 py-2 text-left font-display text-xs uppercase tracking-[0.12em] text-ink-secondary">
              Rule
            </th>
            <th scope="col" className={head(2022)}>
              2022
            </th>
            <th scope="col" className={head(2026)}>
              2026
            </th>
            <th scope="col" className="px-3 py-2 text-left font-display text-xs uppercase tracking-[0.12em] text-ink-secondary">
              Change
            </th>
          </tr>
        </thead>
        <tbody className="max-sm:block">
          {specRows.map((r) => (
            <tr key={r.id} data-rule={r.id} className="border-b border-border max-sm:block max-sm:py-3">
              <th scope="row" className="px-3 py-3 text-left align-top text-sm font-semibold text-ink max-sm:block max-sm:px-0 max-sm:py-1">
                {r.label}
              </th>
              <td data-label="2022" className={cell(2022)}>
                {r.v2022}
              </td>
              <td data-label="2026" className={cell(2026)}>
                {r.v2026}
              </td>
              <td data-label="Change" className={cn(STACKED, "text-ink-secondary")}>
                {r.change}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-xs text-ink-tertiary">
        Sources:{" "}
        {[
          [FIA_2022, "2022 Technical Regulations, issue 13"],
          [FIA_2026, "2026 Technical Regulations, section C, issue 11"],
          [FIA_EXPLAINER, "FIA explainer of the 2026 rules"],
        ].map(([url, label], i) => (
          <span key={url}>
            {i > 0 && ", "}
            <a href={url} rel="noreferrer" target="_blank" className="text-accent underline-offset-4 hover:underline">
              {label} ({hostOf(url)})
            </a>
          </span>
        ))}
        .
      </p>
    </section>
  );
}

/**
 * The exploded car and everything that belongs to it: the year toggle, the stage, its controls, the livery,
 * the pit stop, the part list, the info panel, and the two rule sets compared. Client-side because the year
 * is live state; the server still renders it all (for 2026), so the part list, the headline figures and the
 * table are in the HTML with JavaScript off.
 */
export function CarExperience({ cars, powerUnitNote }: { cars: Record<CarYear, CarData>; powerUnitNote: string }) {
  const year = useCarYear();
  // A soft navigation back to this page keeps the year (the module is not loaded again): put it back in the address.
  useSyncCarYear();
  const car = cars[year];
  // The pit stop and the lap each put a dock along the bottom of the screen and pose the car: one at a time.
  const [pitOpen, setPitOpen] = useState(false);
  const [lapOpen, setLapOpen] = useState(false);
  return (
    <>
      <DeepLinkSync sidecar={car.sidecar} />
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="font-display text-xs uppercase tracking-[0.24em] text-ink-secondary">
            <ByYear y2022="Interactive · Formula 1, 2022 rules" y2026="Interactive · Formula 1, 2026 rules" />
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.01em] text-ink md:text-5xl">
            <ByYear y2022="A 2022 F1 car, taken apart" y2026="A 2026 F1 car, taken apart" />
          </h1>
          {/* On a phone the introduction follows the stage instead, so the car is already on screen when the page opens. */}
          <p className="mt-4 text-base text-ink-secondary max-md:hidden">
            <Intro />
          </p>
        </div>
        <Link
          href="/tunnel"
          // The tunnel is a route of its own with a 3D stage: fetching it in the background would add its scripts to this page's load, while the stage here is still arriving.
          prefetch={false}
          className="inline-flex min-h-10 shrink-0 items-center rounded-md border border-accent/50 px-4 text-sm font-medium text-accent transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          Try the wind tunnel
        </Link>
      </header>
      <YearToggle />
      <section aria-label="The car" className="relative">
        <StageClient
          sidecar={car.sidecar}
          year={year}
          opening
          className={cn("h-[62vh] max-h-[640px] md:h-[680px] md:max-h-none", lapOpen && DOCKED_STAGE.lap, pitOpen && DOCKED_STAGE.pit)}
        />
        {/* A dock sits over the bottom of the screen, where these figures are. */}
        {!lapOpen && !pitOpen && <Headline />}
      </section>
      <p className="text-sm text-ink-secondary md:hidden">
        <Intro />
      </p>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <ExplodeControls>
            <StageTools app={year === 2022 ? "f1-2022" : "f1"} sidecar={car.sidecar} ar />
          </ExplodeControls>
          <div className="flex flex-col gap-2">
            <LiveryPicker />
            {year === 2022 && <p className="text-xs text-ink-tertiary">The 2022 car is shown in a neutral pearl finish, not a livery; the livery you pick still sets the page&rsquo;s accent colour.</p>}
          </div>
          <PitStopLauncher disabled={lapOpen} onOpenChange={setPitOpen} />
          {year === 2026 && <LapLauncher disabled={pitOpen} onOpenChange={setLapOpen} />}
          <nav aria-label="Parts of the car">
            <h2 className="mb-3 font-display text-xs uppercase tracking-[0.24em] text-ink-secondary">Parts</h2>
            <PartList sidecar={car.sidecar} copy={car.copy} search filter xray discover={year === 2022 ? "f1-2022" : "f1"} panel={400} />
          </nav>
          {year === 2026 && <p className="text-xs text-ink-tertiary">{powerUnitNote}</p>}
        </div>
        <aside className="flex flex-col gap-6">
          <InfoPanel sidecar={car.sidecar} copy={car.copy} facts />
        </aside>
      </div>
      <SpecDeltas />
    </>
  );
}
