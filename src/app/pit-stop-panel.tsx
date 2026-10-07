"use client";

/**
 * The pit stop challenge: a timed round in which the crew jacks the car up, takes the four wheels off
 * and puts them back in order, and jacks it down. The logic, the clock and the best time are
 * src/models/f1/pit-stop.ts; this is its shell. A lazy chunk: pit-stop-launcher.tsx loads it when a
 * visitor opens the challenge, and the 3D side (pit-stop-scene.ts, which moves the parts) is told what to
 * show through pit-stop-bridge.ts.
 *
 * Every step can be pressed as a button (Tab and Enter, or the keys 1 to 4 for the wheels and J for
 * the jack), and the wheels can be clicked or tapped in the 3D view. Under reduced motion the clock
 * does not tick on screen and the parts jump rather than slide; it never starts by itself, and a
 * paused round, or a hidden tab, counts no time.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useExplodeState, useExplodeStore } from "@/engine/explode";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import {
  current,
  describeStep,
  elapsed,
  formatTime,
  idle,
  PENALTY_MS,
  pause,
  poseAfter,
  readBest,
  recordBest,
  resume,
  start,
  STEPS,
  tap,
  WHEELS,
  type Round,
  type Target,
} from "@/models/f1/pit-stop";
import { getPitBridge, resetPitBridge, setPitBridge, subscribePitBridge } from "./pit-stop-bridge";
import { attachPitStop } from "./pit-stop-scene";
import { shortcut, showStage, useDock, viewWait, waitForAssembled } from "./dock";

const PADS: { target: Target; label: string; short: string; key: string }[] = [
  { target: "jack", label: "Jack", short: "Jack", key: "J" },
  { target: "front-left-wheel", label: "Front left", short: "FL", key: "1" },
  { target: "front-right-wheel", label: "Front right", short: "FR", key: "2" },
  { target: "rear-left-wheel", label: "Rear left", short: "RL", key: "3" },
  { target: "rear-right-wheel", label: "Rear right", short: "RR", key: "4" },
];
const KEY_TARGET: Record<string, Target> = Object.fromEntries(PADS.map((p) => [p.key.toLowerCase(), p.target]));
const isWheel = (id: string): id is (typeof WHEELS)[number] => (WHEELS as readonly string[]).includes(id);
const LABEL = "text-xs font-semibold uppercase tracking-[0.08em] text-ink-tertiary";

export default function PitStopPanel({ onClose }: { onClose: () => void }) {
  const store = useExplodeStore();
  const { ready, stageGate } = useExplodeState(store);
  // The dock's height goes to the page (--pit-dock), which sizes the stage to end where the dock begins and pads the footer clear of it; opening it also puts the stage on screen.
  const dock = useDock("--pit-dock");
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [round, setRound] = useState<Round>(idle);
  const [arming, setArming] = useState(false);
  const [now, setNow] = useState(0);
  // The panel only ever mounts on the client (it is lazy), so storage can be read as the state starts.
  const [best, setBest] = useState<number | null>(() => readBest());
  const [isBest, setIsBest] = useState(false);
  const [note, setNote] = useState("");
  const roundRef = useRef(round);
  const bestRef = useRef(best);
  const stopArming = useRef<(() => void) | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = useCallback(
    (prev: Round, next: Round) => {
      roundRef.current = next;
      setRound(next);
      if (next.step !== prev.step || next.phase !== prev.phase) {
        setPitBridge({ pose: poseAfter(next.step) });
        // The next wheel glows the way a hovered part does.
        const want = current(next);
        store.hover(want && want.target !== "jack" ? want.target : null);
      }
      if (next.phase === "done" && prev.phase !== "done" && next.final !== null) {
        const result = recordBest(next.final, bestRef.current);
        bestRef.current = result.best;
        setBest(result.best);
        setIsBest(result.isBest);
        // The last move (the jack coming down) is still easing: let it finish before the scene layer goes.
        settle.current = setTimeout(() => setPitBridge({ active: false }), reduced ? 0 : 700);
      }
    },
    [store, reduced],
  );

  const reset = useCallback(
    (why = "") => {
      if (settle.current) clearTimeout(settle.current);
      stopArming.current?.();
      stopArming.current = null;
      setArming(false);
      const prev = roundRef.current;
      roundRef.current = idle();
      setRound(idle());
      setIsBest(false);
      setNote(why);
      if (prev.phase !== "idle") store.hover(null);
      resetPitBridge();
    },
    [store],
  );

  const go = useCallback(() => {
    if (settle.current) clearTimeout(settle.current);
    const t = performance.now();
    const next = start(t);
    roundRef.current = next;
    setNow(t);
    setRound(next);
    setArming(false);
    setNote("");
    setPitBridge({ active: true, pose: poseAfter(0), snap: reduced });
    store.hover(null);
  }, [reduced, store]);

  const begin = useCallback(() => {
    store.select(null);
    store.setTarget(0);
    setIsBest(false);
    // The car is what is being timed: bring it on screen, above the dock.
    showStage();
    if (store.frameK() === 0) return go();
    // The car is taken apart: wait for it to come back together before the clock starts.
    setArming(true);
    setNote("");
    stopArming.current = waitForAssembled(store, () => {
      stopArming.current = null;
      go();
    });
  }, [go, store]);

  const press = useCallback(
    (target: Target) => {
      const prev = roundRef.current;
      commit(prev, tap(prev, target, performance.now()));
    },
    [commit],
  );

  const togglePause = useCallback(() => {
    const prev = roundRef.current;
    const t = performance.now();
    setNow(t);
    commit(prev, prev.phase === "running" ? pause(prev, t) : resume(prev, t));
  }, [commit]);

  // While a round is on: a wheel picked in the 3D view is a tap on it, anything else picked is let go,
  // and pulling the explode slider calls the stop off.
  const live = round.phase === "running" || round.phase === "paused";
  useEffect(() => {
    if (!live) return;
    let seen = store.getState().selected;
    return store.subscribe(() => {
      const st = store.getState();
      if (st.target !== 0) return reset("The car was taken apart, so the stop was called off.");
      const picked = st.selected;
      if (picked && picked !== seen) {
        seen = null;
        store.select(null);
        if (isWheel(picked)) press(picked);
        return;
      }
      seen = picked;
    });
  }, [live, store, press, reset]);

  // A hidden tab counts no time.
  useEffect(() => {
    if (round.phase !== "running") return;
    const onHide = () => document.hidden && togglePause();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [round.phase, togglePause]);

  // The clock on screen, ten times a second. Reduced motion has no ticking clock: it shows the time at the last step.
  useEffect(() => {
    if (round.phase !== "running" || reduced) return;
    const id = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(id);
  }, [round.phase, reduced]);

  // The stage moves the car's parts with this while a round is on.
  useEffect(
    () => setPitBridge({ attach: (scene) => attachPitStop(scene, { read: getPitBridge, subscribe: subscribePitBridge, explodeAt: () => store.frameK() }) }),
    [store],
  );

  // Closing (or leaving the page) hands the car back.
  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
      stopArming.current?.();
      store.hover(null);
      resetPitBridge();
    },
    [store],
  );

  const step = current(round);
  const pose = poseAfter(round.step);
  const showMs = round.phase === "done" ? round.final : round.phase === "idle" ? 0 : reduced && round.phase === "running" ? (round.splits.at(-1) ?? 0) : elapsed(round, now);
  const prompt =
    round.phase === "done"
      ? `Stop complete in ${formatTime(round.final)}.`
      : round.phase === "paused"
        ? "Paused. The clock is stopped."
        : step
          ? `${describeStep(step)}.`
          : arming
            ? "Bringing the car back together."
            : "Ready when you are.";

  return (
    <section
      ref={dock}
      aria-label="Pit stop challenge"
      id="pit-stop-dock"
      data-pit-stop
      data-pit-phase={round.phase}
      onKeyDown={(e) => {
        const key = shortcut(e);
        if (!key) return;
        if (key === "p" && (round.phase === "running" || round.phase === "paused")) {
          e.preventDefault();
          return togglePause();
        }
        const target = KEY_TARGET[key];
        if (target && roundRef.current.phase === "running") {
          e.preventDefault();
          press(target);
        }
      }}
      // A dock along the bottom of the screen, so the car stays in view above it while the stop is timed.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 shadow-[0_-8px_24px_rgba(0,0,0,0.25)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 md:px-6 short:gap-2 short:py-2">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="min-w-0 flex-1">
            {/* The dock is labelled "Pit stop challenge" already; on a screen this short the line is worth more as stage. */}
            <h2 className="font-display text-[11px] uppercase tracking-[0.24em] text-ink-secondary short:hidden">Pit stop challenge</h2>
            <p data-pit-prompt aria-live="polite" className="mt-1 min-h-6 text-base font-medium text-ink short:mt-0">
              {prompt}
              {isBest && round.phase === "done" && <span className="ml-2 text-accent">New best.</span>}
            </p>
          </div>
          <dl className="flex gap-6">
            <div>
              <dt className={LABEL}>Best</dt>
              <dd data-pit-best className="font-mono text-xl font-bold tabular-nums text-ink">
                {formatTime(best)}
              </dd>
            </div>
            <div>
              <dt className={LABEL}>{round.phase === "done" ? "Time" : "Clock"}</dt>
              <dd data-pit-clock className={cn("font-mono text-xl font-bold tabular-nums", round.phase === "done" ? "text-accent" : "text-ink")}>
                {formatTime(showMs)}
              </dd>
            </div>
          </dl>
          <div className="flex items-center gap-2">
            {round.phase === "idle" && (
              <Button size="sm" data-pit-start autoFocus disabled={arming} onClick={begin}>
                <Play />
                {arming ? "Getting the car ready" : "Start the stop"}
              </Button>
            )}
            {(round.phase === "running" || round.phase === "paused") && (
              <>
                <Button size="sm" variant="outline" data-pit-pause autoFocus aria-pressed={round.phase === "paused"} aria-keyshortcuts="P" onClick={togglePause}>
                  {round.phase === "paused" ? <Play /> : <Pause />}
                  {round.phase === "paused" ? "Resume" : "Pause"}
                </Button>
                <Button size="sm" variant="ghost" data-pit-cancel onClick={() => reset("Stop called off.")}>
                  <RotateCcw />
                  Call it off
                </Button>
              </>
            )}
            {round.phase === "done" && (
              <Button size="sm" data-pit-again autoFocus onClick={() => (reset(), begin())}>
                <RotateCcw />
                Go again
              </Button>
            )}
            <Button size="sm" variant="ghost" data-pit-close onClick={() => (reset(), onClose())}>
              <X />
              Close
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2" role="group" aria-label="Crew controls">
          {PADS.map(({ target, label, short, key }) => {
            const next = round.phase === "running" && step?.target === target;
            const off = target !== "jack" && pose.off.includes(target);
            return (
              <Button
                key={target}
                type="button"
                variant="outline"
                disabled={round.phase !== "running"}
                data-pit-target={target}
                aria-keyshortcuts={key}
                aria-current={next ? "step" : undefined}
                aria-label={target === "jack" ? `Jack, ${pose.lifted ? "car up" : "car down"}${next ? ", next" : ""}` : `${label} wheel, ${off ? "off" : "on"}${next ? ", next" : ""}`}
                onClick={() => press(target)}
                className={cn("h-12 min-w-0 flex-col gap-0 px-1 short:h-10", next && "border-accent bg-accent/10 text-accent ring-1 ring-accent")}
              >
                <span className="text-sm font-medium">
                  <span className="sm:hidden">{short}</span>
                  <span className="hidden sm:inline">{label}</span>
                </span>
                <span className="text-[11px] font-normal text-ink-tertiary">
                  {target === "jack" ? (pose.lifted ? "up" : "down") : off ? "off" : "on"} · {key}
                </span>
              </Button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex flex-1 items-center gap-1" aria-hidden>
            {STEPS.map((s, i) => (
              <span key={`${s.target}-${s.action}`} className={cn("h-1.5 flex-1", i < round.step ? "bg-accent" : i === round.step && (round.phase === "running" || round.phase === "paused") ? "bg-accent/40" : "bg-border")} />
            ))}
          </div>
          <p className="text-xs text-ink-tertiary short:hidden">
            Press the steps in order or click the wheels on the car. A wrong one costs {PENALTY_MS / 1000} s.
          </p>
        </div>
        {round.phase === "done" && round.mistakes > 0 && (
          <p className="text-sm text-ink-secondary">
            Includes {round.mistakes} wrong {round.mistakes === 1 ? "tap" : "taps"}, {(round.mistakes * PENALTY_MS) / 1000} s in penalties.
          </p>
        )}
        {note && (
          <p role="status" className="text-sm text-ink-secondary">
            {note}
          </p>
        )}
        {round.phase === "running" && reduced && <p className="text-xs text-ink-tertiary">Reduced motion: the clock shows the time at your last step, and the car jumps to each pose.</p>}
        {!ready && (
          <p className="text-xs text-ink-tertiary">
            {viewWait(stageGate) === "loading" ? "The 3D view is still loading; the car moves once it is ready. The clock and the buttons already work." : "The 3D view is not loaded, so the car will not move. The clock and the buttons still work."}
          </p>
        )}
      </div>
    </section>
  );
}
