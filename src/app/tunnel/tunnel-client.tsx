"use client";

import dynamic from "next/dynamic";
import { useCallback, useId, useMemo, useState, type ReactNode } from "react";
import { Pause, Play, RotateCcw, Wand } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  aeroModes,
  baselineSetup,
  circuits,
  evaluate,
  floorVariants,
  frontWingVariants,
  lapTime,
  rearWingAngles,
  rideHeight,
  score,
  type AeroMode,
  type CircuitId,
  type FloorId,
  type FrontWingId,
  type Setup,
} from "@/data/aero";
import { StageGate } from "@/engine/explode";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { wandMode } from "./wand";

// three, R3F and the flow shaders load only in these lazy chunks, after idle and only with WebGL 2.
// The sibling import("three") keeps three in its own shared chunk, as on the exploded view.
const TunnelStage = dynamic(() => Promise.all([import("./tunnel-stage"), import("three")]).then(([stage]) => stage), { ssr: false });

const SPEED = { min: 100, max: 340, step: 10 };
const LABEL = "text-xs font-semibold uppercase tracking-[0.08em] text-ink-tertiary";

function Poster() {
  return (
    <div
      role="img"
      aria-label="The car in a wind tunnel, with a rake of smoke streaming around it"
      className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_60%,color-mix(in_srgb,var(--accent)_14%,transparent),transparent_60%)]"
    >
      <span className="font-display text-sm uppercase tracking-[0.2em] text-ink-tertiary">Wind tunnel</span>
    </div>
  );
}

/** A labelled group of radio buttons drawn as a segmented control. Native inputs: arrow keys work. */
function Segmented<T extends string>({ legend, name, value, options, onChange, hint }: {
  legend: string;
  name: string;
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (v: T) => void;
  hint?: ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-2" data-tunnel-control={name}>
      <legend className={cn(LABEL, "mb-2")}>{legend}</legend>
      <div className="grid gap-1 rounded-lg border border-field-border bg-bg/40 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <label
            key={o.id}
            className="flex min-h-9 cursor-pointer items-center justify-center rounded-md px-2 text-center text-xs font-medium text-ink-secondary transition-colors hover:text-ink has-[:checked]:bg-accent/15 has-[:checked]:text-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
          >
            <input type="radio" name={name} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
      {hint && <p className="text-xs text-ink-tertiary">{hint}</p>}
    </fieldset>
  );
}

function Range({ label, value, min, max, step, format, onChange, name }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  name: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2 max-md:gap-0" data-tunnel-control={name}>
      <div className="flex items-baseline justify-between gap-3 max-md:items-center">
        <label htmlFor={id} className={cn(LABEL, "max-md:inline-flex max-md:min-h-9 max-md:items-center")}>
          {label}
        </label>
        <output htmlFor={id} className="font-display text-sm tabular-nums text-ink">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        data-tunnel-range={name}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="h-2 w-full cursor-pointer accent-[var(--accent)] max-md:h-9"
      />
    </div>
  );
}

function Stat({ label, value, unit, testId }: { label: string; value: string; unit?: string; testId?: string }) {
  return (
    <div className="rounded-md border border-border bg-bg/40 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-[0.06em] text-ink-tertiary">{label}</dt>
      <dd className="font-display text-lg tabular-nums text-ink" data-score={testId}>
        {value}
        {unit && <span className="ml-1 text-xs font-medium text-ink-tertiary">{unit}</span>}
      </dd>
    </div>
  );
}

const signed = (x: number, digits: number) => `${x > 0 ? "+" : x < 0 ? "−" : "±"}${Math.abs(x).toFixed(digits)}`;

export function TunnelClient({ model, sdf, disclaimer }: { model: string; sdf: string; disclaimer: string }) {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [setup, setSetup] = useState<Setup>(baselineSetup);
  const [speedKmh, setSpeedKmh] = useState(250);
  const [circuitId, setCircuitId] = useState<CircuitId>("balanced");
  // null follows the visitor's motion preference: paused under reduced motion, running otherwise.
  const [pausedChoice, setPausedChoice] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const [flowOk, setFlowOk] = useState<boolean | null>(null);
  const paused = flowOk === false || (pausedChoice ?? reduced);
  // The smoke wand: off until it is asked for, because it takes the pointer from the orbit controls.
  const [wand, setWand] = useState(false);
  const wandStill = wandMode(paused, reduced) === "static";
  const patch = useCallback((p: Partial<Setup>) => setSetup((s) => ({ ...s, ...p })), []);

  const circuit = circuits[circuitId];
  const ev = useMemo(() => evaluate(setup), [setup]);
  const sc = useMemo(() => score(setup, circuit), [setup, circuit]);
  const lap = useMemo(() => lapTime(setup, circuit), [setup, circuit]);
  const v = speedKmh / 3.6;
  const frontWing = frontWingVariants.find((f) => f.id === setup.frontWing)!;
  const floor = floorVariants.find((f) => f.id === setup.floor)!;
  const delta = sc.deltaSeconds;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div data-stage-ready={ready ? "true" : "false"}>
          <StageGate poster={<Poster />}>
            {(gate) => (
              <TunnelStage
                model={model}
                sdf={sdf}
                setup={setup}
                speedKmh={speedKmh}
                paused={paused}
                active={gate.active}
                mobile={gate.mobile}
                reduced={gate.reduced}
                onReady={() => {
                  setReady(true);
                  gate.onReady();
                }}
                onFail={gate.onFail}
                onFlow={setFlowOk}
                wand={wand}
              />
            )}
          </StageGate>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="outline" aria-pressed={!paused} disabled={!ready || flowOk === false} data-tunnel-pause onClick={() => setPausedChoice(!paused)}>
            {paused ? <Play /> : <Pause />}
            {paused ? "Play airflow" : "Pause airflow"}
          </Button>
          <Button size="sm" variant="outline" data-tunnel-reset onClick={() => setSetup(baselineSetup)}>
            <RotateCcw />
            Baseline setup
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-pressed={wand}
            disabled={!ready || flowOk === false}
            data-tunnel-wand
            onClick={() => setWand(!wand)}
            className={cn(wand && "border-accent/60 text-accent")}
          >
            <Wand />
            Smoke wand
          </Button>
          {flowOk === false && <p className="text-xs text-ink-tertiary">This GPU cannot run the airflow; the score still works.</p>}
          {wand && (
            <p data-tunnel-wand-hint className="basis-full text-xs text-ink-tertiary">
              {wandStill
                ? "The airflow is still, so the wand draws one streamline: tap or click where you want it, or move it with the arrow keys."
                : "Move the pointer over the airflow, or drag a finger across it, and smoke streams from where it is. The arrow keys move it too. Turn the wand off to orbit the car again."}
            </p>
          )}
        </div>

        <section aria-labelledby="score-title" data-score-card className="rounded-xl border border-border bg-surface p-5" aria-live="polite">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="score-title" className={LABEL}>
                Lap delta vs baseline, {circuit.name.toLowerCase()}
              </h2>
              <p
                data-lap-delta
                className={cn("font-display text-4xl tabular-nums", delta < -0.0005 ? "text-positive" : delta > 0.0005 ? "text-caution" : "text-ink")}
              >
                {signed(delta, 3)} s
              </p>
            </div>
            <p className="text-sm text-ink-secondary">
              Lap <span className="font-bold tabular-nums text-ink">{lap.seconds.toFixed(3)} s</span>
            </p>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label={`Downforce at ${speedKmh} km/h`} value={(ev.downforceN(v) / 1000).toFixed(1)} unit="kN" testId="downforce" />
            <Stat label={`Drag at ${speedKmh} km/h`} value={(ev.dragN(v) / 1000).toFixed(2)} unit="kN" testId="drag" />
            <Stat label="Front balance" value={(ev.frontShare * 100).toFixed(1)} unit="%" testId="balance" />
            <Stat label="Top speed" value={ev.topSpeedKmh.toFixed(0)} unit="km/h" testId="top-speed" />
            <Stat label="Corner speed, 100 m radius" value={ev.cornerSpeedKmh(100).toFixed(0)} unit="km/h" testId="corner-speed" />
            <Stat label="ClA / CdA" value={`${ev.ClA.toFixed(2)} / ${ev.CdA.toFixed(2)}`} unit="m²" />
          </dl>
          <ul aria-label="Badges" className="mt-4 flex flex-wrap gap-2" data-score-badges>
            {sc.badges.map((b) => (
              <li key={b}>
                <Badge variant="outline" className="border-accent/40 text-accent">
                  {b}
                </Badge>
              </li>
            ))}
          </ul>
          <p data-tunnel-disclaimer className="mt-4 border-t border-border pt-3 text-xs text-ink-tertiary">
            {disclaimer}
          </p>
        </section>
      </div>

      <form aria-label="Wind tunnel setup" className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 lg:self-start" onSubmit={(e) => e.preventDefault()}>
        <Segmented<FrontWingId>
          legend="Front wing"
          name="front-wing"
          value={setup.frontWing}
          options={frontWingVariants}
          onChange={(frontWing) => patch({ frontWing })}
          hint={frontWing.description}
        />
        <Range
          label={rearWingAngles.label}
          name="rear-wing"
          value={setup.rearWingDeg}
          min={rearWingAngles.minDeg}
          max={rearWingAngles.maxDeg}
          step={rearWingAngles.sliderStepDeg}
          format={(d) => `${signed(d, Number.isInteger(d) ? 0 : 1)} deg`}
          onChange={(rearWingDeg) => patch({ rearWingDeg })}
        />
        <Segmented<AeroMode>
          legend="Aero mode"
          name="mode"
          value={setup.mode}
          options={[aeroModes.corner, aeroModes.straight].map((m) => ({ id: m.id, label: m.label.replace(" Mode", "") }))}
          onChange={(mode) => patch({ mode })}
          hint={aeroModes[setup.mode].description}
        />
        <Segmented<FloorId> legend="Floor and diffuser" name="floor" value={setup.floor} options={floorVariants} onChange={(f) => patch({ floor: f })} hint={floor.description} />
        <Range
          label={rideHeight.label}
          name="ride-height"
          value={setup.rideHeightMm}
          min={rideHeight.minMm}
          max={rideHeight.maxMm}
          step={1}
          format={(mm) => `${signed(mm, 0)} mm`}
          onChange={(rideHeightMm) => patch({ rideHeightMm })}
        />
        <label className="flex cursor-pointer items-center justify-between gap-3 max-md:min-h-9" data-tunnel-control="halo">
          <span className={LABEL}>Halo fitted</span>
          <input type="checkbox" role="switch" checked={setup.halo} onChange={(e) => patch({ halo: e.currentTarget.checked })} className="h-5 w-5 cursor-pointer accent-[var(--accent)]" />
        </label>
        <Range label="Speed" name="speed" value={speedKmh} min={SPEED.min} max={SPEED.max} step={SPEED.step} format={(s) => `${s} km/h`} onChange={setSpeedKmh} />
        <Segmented<CircuitId>
          legend="Circuit"
          name="circuit"
          value={circuitId}
          options={Object.values(circuits).map((c) => ({ id: c.id, label: c.name.replace(" circuit", "") }))}
          onChange={setCircuitId}
          hint={circuit.blurb}
        />
      </form>
    </div>
  );
}
