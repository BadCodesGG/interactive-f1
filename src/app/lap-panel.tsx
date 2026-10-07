"use client";

/**
 * One lap: the 2026 car round a looping circuit with its parts working: the wheels spin and steer, the
 * suspension moves, and the active-aero flaps open to Straight Mode on the straights and close to Corner Mode
 * for the braking zones. The numbers are src/models/f1/lap-car.ts and lap-profile.ts; this is the dock with
 * its speed, wing mode and lap clock, and the controls. A lazy chunk: lap-launcher.tsx loads it when a
 * visitor opens the lap, and the 3D side (lap-scene.ts, which poses the car) is told what to do through
 * lap-bridge.ts.
 *
 * Every control is a button (Tab and Enter), with keys to match: P pauses, R starts again, S steps, V
 * changes the camera and Escape leaves. Under reduced motion the lap never starts by itself: it shows the
 * car still on a straight with the wings open, and moves half a second at a time on Step (or runs, if
 * the visitor presses Play). A hidden tab pauses it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Pause, Play, RotateCcw, StepForward, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useExplodeState, useExplodeStore } from "@/engine/explode";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { formatLapTime, STEP_SECONDS } from "@/models/f1/lap-car";
import { getLapBridge, LAP_VIEWS, resetLapBridge, setLapBridge, subscribeLapBridge, useLapBridge, type LapView } from "./lap-bridge";
import { attachLap } from "./lap-scene";
import { shortcut, showStage, useDock, viewWait, waitForAssembled } from "./dock";

const LABEL = "text-xs font-semibold uppercase tracking-[0.08em] text-ink-tertiary";
/** A figure on the dock: label over value, or on a short screen the two side by side so the row is one line high. */
const STAT = "short:flex short:items-baseline short:gap-1.5";
const VIEW_NAME: Record<LapView, string> = { chase: "Chase", front: "Front", side: "Side" };

/** The numbers on the dock, taken from the canvas ten times a second. */
interface Readout {
  speed: number;
  mode: "straight" | "corner";
  time: string;
  finished: boolean;
  stopped: boolean;
  flaps: "opening" | "closing" | null;
}
const IDLE: Readout = { speed: 0, mode: "corner", time: formatLapTime(0), finished: false, stopped: false, flaps: null };

export default function LapPanel({ onClose }: { onClose: () => void }) {
  const store = useExplodeStore();
  const { ready, stageGate } = useExplodeState(store);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const bridge = useLapBridge();
  const [arming, setArming] = useState(true);
  const [read, setRead] = useState<Readout>(IDLE);
  const [note, setNote] = useState("");
  const stopArming = useRef<(() => void) | null>(null);
  const toggleButton = useRef<HTMLButtonElement>(null);
  // The dock's height goes to the page (--lap-dock), which sizes the stage to end where the dock begins and pads the footer clear of it; opening it also puts the stage on screen.
  const dock = useDock("--lap-dock");
  const live = bridge.active;

  // The play button is disabled until the car is ready, which an autoFocus cannot see: focus it then, so the keys work at once.
  useEffect(() => {
    if (live) toggleButton.current?.focus();
  }, [live]);

  const close = useCallback(() => {
    stopArming.current?.();
    stopArming.current = null;
    resetLapBridge();
    onClose();
  }, [onClose]);

  // The canvas poses the car with this while the lap is on, and hands the camera back to the showroom view when it lets go.
  useEffect(() => {
    setLapBridge({
      attach: (scene) => attachLap(scene, { read: getLapBridge, subscribe: subscribeLapBridge, telemetry: getLapBridge().telemetry, done: () => store.resetView() }),
    });
    return () => {
      stopArming.current?.();
      resetLapBridge();
    };
  }, [store]);

  // Brings the car together, puts it on screen and, once it is together, starts the lap: from the line, or
  // under reduced motion from a still frame. It sets no React state until the car is ready, so an effect can call it.
  const arm = useCallback(() => {
    store.select(null);
    store.setTarget(0);
    showStage();
    stopArming.current?.();
    stopArming.current = waitForAssembled(store, () => {
      stopArming.current = null;
      setArming(false);
      setLapBridge({ active: true, playing: !reduced, still: reduced, view: "chase", restarts: getLapBridge().restarts + 1 });
    });
  }, [reduced, store]);

  // Once the 3D view is up, the lap starts by itself (under reduced motion, as a still frame).
  useEffect(() => {
    if (!ready) return;
    arm();
    return () => stopArming.current?.();
    // arm() changes with the reduced-motion setting; flipping it mid-lap must not start the lap over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const again = () => {
    setNote("");
    setArming(true);
    arm();
  };

  // Pulling the explode slider calls the lap off, and a part picked in the 3D view is let go (the camera is busy).
  useEffect(() => {
    if (!live) return;
    return store.subscribe(() => {
      const st = store.getState();
      if (st.target !== 0) {
        resetLapBridge();
        setNote("The car was taken apart, so the lap was stopped.");
        return;
      }
      if (st.selected) store.select(null);
    });
  }, [live, store]);

  // A hidden tab pauses the car.
  useEffect(() => {
    if (!live) return;
    const onHide = () => document.hidden && setLapBridge({ playing: false });
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [live]);

  // The readout: the canvas writes its telemetry every frame, the dock reads it ten times a second, and only a change renders.
  useEffect(() => {
    if (!live) return;
    const take = () => {
      const t = getLapBridge().telemetry;
      const next: Readout = { speed: Math.round(t.speedKmh), mode: t.mode, time: formatLapTime(t.lapSeconds), finished: t.finished, stopped: t.phase === "stopped", flaps: t.flaps };
      setRead((prev) => (prev.speed === next.speed && prev.mode === next.mode && prev.time === next.time && prev.finished === next.finished && prev.stopped === next.stopped && prev.flaps === next.flaps ? prev : next));
    };
    take();
    const id = setInterval(take, 100);
    return () => clearInterval(id);
  }, [live, bridge.restarts, bridge.steps]);

  const toggle = () => {
    const b = getLapBridge();
    if (read.stopped) setLapBridge({ restarts: b.restarts + 1, playing: true, still: false });
    else setLapBridge({ playing: !b.playing });
    setNote("");
  };
  const replay = () => {
    const b = getLapBridge();
    setLapBridge({ restarts: b.restarts + 1, playing: !reduced, still: reduced });
    setNote("");
  };
  const step = () => {
    const b = getLapBridge();
    if (!b.playing && !read.stopped) setLapBridge({ steps: b.steps + 1 });
  };
  const nextView = () => {
    const b = getLapBridge();
    setLapBridge({ view: LAP_VIEWS[(LAP_VIEWS.indexOf(b.view) + 1) % LAP_VIEWS.length] });
  };

  const modeName = read.mode === "straight" ? "Straight Mode" : "Corner Mode";
  const wait = viewWait(stageGate);
  const prompt = !ready
    ? wait === "loading"
      ? "Loading the 3D view. The lap starts as soon as it is ready."
      : wait === "opt-in"
        ? "Load the 3D view to see the lap."
        : "The 3D view is not available, so there is no lap to show."
    : arming
      ? "Bringing the car back together."
      : read.finished && read.stopped
        ? `Lap complete in ${read.time}.`
        : read.finished
          ? `Line crossed in ${read.time}. Braking to a stop.`
          : !bridge.playing
            ? `Paused. ${modeName}.`
            : read.flaps
              ? `${modeName}: the flaps are ${read.flaps}.`
              : `${modeName}: the wings are ${read.mode === "straight" ? "open" : "closed"}.`;

  return (
    <section
      ref={dock}
      aria-label="One lap"
      id="lap-dock"
      data-lap-panel
      data-lap-phase={!live ? "idle" : read.stopped ? "stopped" : bridge.playing ? "running" : "paused"}
      onKeyDown={(e) => {
        const key = live ? shortcut(e) : null;
        if (!key) return;
        if (key === "escape") return close();
        if (key === "p") toggle();
        else if (key === "r") replay();
        else if (key === "s") step();
        else if (key === "v") nextView();
        else return;
        e.preventDefault();
      }}
      // A dock along the bottom of the screen, so the car stays in view above it as it goes round.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface md:bg-surface/95 shadow-[0_-8px_24px_rgba(0,0,0,0.25)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 md:px-6 short:gap-2 short:py-2">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="min-w-0 flex-1 basis-56">
            {/* The dock is labelled "One lap" already; on a screen this short the line is worth more as stage. */}
            <h2 className="font-display text-[11px] uppercase tracking-[0.24em] text-ink-secondary short:hidden">One lap</h2>
            <p data-lap-prompt aria-live="polite" className="mt-1 min-h-6 text-base font-medium text-ink short:mt-0">
              {prompt}
            </p>
          </div>
          <dl className="flex items-start gap-5 sm:gap-6 short:items-baseline short:gap-4">
            <div className={STAT}>
              <dt className={LABEL}>Speed</dt>
              <dd data-lap-speed className="font-mono text-xl font-bold tabular-nums text-ink short:text-base">
                {read.speed}
                <span className="ml-1 text-xs font-semibold text-ink-tertiary">km/h</span>
              </dd>
            </div>
            <div className={STAT}>
              <dt className={LABEL}>Wings</dt>
              <dd data-lap-mode={read.mode} className="mt-0.5 flex items-center gap-2 text-sm font-semibold text-ink short:mt-0">
                <span aria-hidden className={cn("size-2.5 rounded-full border border-accent", read.mode === "straight" ? "bg-accent" : "bg-transparent")} />
                {modeName}
              </dd>
              {/* Says what the tinted flaps are doing while they move and for a second after; the space is kept so the dock does not jump. */}
              <p data-lap-flaps={read.flaps ?? "rest"} className="mt-0.5 h-4 text-xs font-semibold text-accent short:hidden">
                {read.flaps === "opening" ? "Flaps opening" : read.flaps === "closing" ? "Flaps closing" : ""}
              </p>
            </div>
            <div className={STAT}>
              <dt className={LABEL}>Lap</dt>
              <dd data-lap-time className={cn("font-mono text-xl font-bold tabular-nums short:text-base", read.finished ? "text-accent" : "text-ink")}>
                {read.time}
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Lap controls">
          <Button ref={toggleButton} size="sm" data-lap-toggle disabled={!live} aria-keyshortcuts="P" onClick={toggle}>
            {bridge.playing && !read.stopped ? <Pause /> : <Play />}
            {read.stopped ? "Go again" : bridge.playing ? "Pause" : "Play"}
          </Button>
          <Button size="sm" variant="outline" data-lap-step disabled={!live || bridge.playing || read.stopped} aria-keyshortcuts="S" onClick={step}>
            <StepForward />
            Step {STEP_SECONDS} s
          </Button>
          <Button size="sm" variant="outline" data-lap-replay disabled={!live} aria-keyshortcuts="R" onClick={replay}>
            <RotateCcw />
            Replay
          </Button>
          <Button size="sm" variant="outline" data-lap-view={bridge.view} disabled={!live} aria-keyshortcuts="V" onClick={nextView}>
            <Camera />
            View: {VIEW_NAME[bridge.view]}
          </Button>
          {!live && !arming && ready && (
            <Button size="sm" data-lap-again onClick={again}>
              <Play />
              Start the lap
            </Button>
          )}
          <Button size="sm" variant="ghost" data-lap-close aria-keyshortcuts="Escape" className="ml-auto" onClick={close}>
            <X />
            <span className="sm:hidden short:inline" aria-hidden>
              Showroom
            </span>
            <span className="max-sm:sr-only short:sr-only">Back to the showroom</span>
          </Button>
        </div>
        {note && (
          <p role="status" className="text-sm text-ink-secondary">
            {note}
          </p>
        )}
        {reduced && live && <p className="text-xs text-ink-tertiary">Reduced motion: the lap waits for you, with the car still on a straight and the wings open. Play drives it; Step moves it on half a second.</p>}
      </div>
    </section>
  );
}
