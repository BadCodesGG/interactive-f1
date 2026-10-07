"use client";

import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useIsMobile, useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { gateMessage, gateState } from "./gate-state";
import { useOptionalExplodeStore } from "./provider";

/**
 * three dropped WebGL 1 in r163, so only a WebGL 2 context counts: a WebGL-1-only browser keeps the
 * poster rather than download three and fail.
 */
export function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    // Release the probe's context now rather than waiting on GC; browsers cap live contexts.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/** Catches a render error in the scene and hands control back to the poster. */
export class SceneBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export interface GateRenderProps {
  /** On screen and in a visible tab: the stage may draw. */
  active: boolean;
  /** Phone-sized at the moment the stage mounted. */
  mobile: boolean;
  reduced: boolean;
  /** The first frame with the model has drawn: the poster can go. */
  onReady: () => void;
  /** The scene cannot run (load failure, lost context that never came back): show the poster. */
  onFail: () => void;
}

export interface StageGateProps {
  /** Shown until the first frame draws, and instead of the scene when it cannot or should not run. */
  poster: ReactNode;
  /** Extra content shown with the poster whenever the scene is not live (a caption, a hint). */
  fallback?: ReactNode;
  /** Replaces the sentence above Load 3D under reduced motion (the default says the device asks for reduced motion). */
  optInReason?: string;
  className?: string;
  /** Renders the stage. Pass a `next/dynamic` component so three stays out of the initial JS. */
  children: (props: GateRenderProps) => ReactNode;
}

/**
 * Decides whether the 3D stage runs at all, and pauses it when nobody can see it. One gate: after
 * the browser is idle, WebGL 2 is probed, and only then is the stage (and its chunk) requested.
 * Under reduced motion nothing loads until the visitor presses Load 3D.
 */
export function StageGate({ poster, fallback, optInReason, className, children }: StageGateProps) {
  const store = useOptionalExplodeStore();
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const mobile = useIsMobile();
  const ref = useRef<HTMLDivElement>(null);
  const [probed, setProbed] = useState<boolean | null>(null);
  const [optIn, setOptIn] = useState(false);
  const [inView, setInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const [drawn, setDrawn] = useState(false);
  const [failed, setFailed] = useState(false);
  const onReady = useCallback(() => setDrawn(true), []);
  const onFail = useCallback(() => setFailed(true), []);

  useEffect(() => {
    if (reduced && !optIn) return;
    // Probe only once the browser is idle, so it never runs during hydration.
    const go = () => setProbed(hasWebGL2());
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(go, { timeout: 1000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(go, 300);
    return () => window.clearTimeout(id);
  }, [reduced, optIn]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // One callback can carry a leave and a return; only the latest entry says where it is now.
    const io = new IntersectionObserver((entries) => setInView(entries[entries.length - 1].isIntersecting));
    io.observe(el);
    const onVis = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const state = gateState({ probed, reduced, optIn, failed, drawn });
  const live = state === "loading" || state === "live";
  const message = gateMessage(state, optInReason);

  // Publish the state so the controls that stay off until the stage draws can say why.
  useEffect(() => {
    store?.set({ stageGate: state });
  }, [store, state]);
  useEffect(() => () => store?.set({ stageGate: "waiting" }), [store]);

  return (
    <div
      ref={ref}
      data-stage-gate={state}
      className={cn(
        // Bounded on phones so the page still scrolls past a canvas that captures touch.
        "relative h-[58vh] max-h-[560px] min-h-[320px] w-full overflow-hidden rounded-xl border border-border bg-surface md:h-[640px] md:max-h-none",
        className,
      )}
    >
      {!(live && drawn) && <div className="absolute inset-0">{poster}</div>}
      {live && (
        <div aria-hidden="true" className="absolute inset-0">
          <SceneBoundary onFail={onFail}>{children({ active: inView && tabVisible, mobile, reduced, onReady, onFail })}</SceneBoundary>
        </div>
      )}
      {!live && fallback && <div className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-3 p-4">{fallback}</div>}
      {/* Centred on an opaque card above any overlay the app puts over the poster (z-10), so neither the button nor the note can be covered. */}
      {message && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
          <div className="pointer-events-auto flex max-w-sm flex-col items-center gap-3 rounded-xl border border-border bg-surface p-5 text-center shadow-2xl">
            {state === "opt-in" ? (
              <>
                <p data-stage-note className="text-sm text-ink-secondary">
                  {message}
                </p>
                <button
                  type="button"
                  data-stage-load
                  onClick={() => setOptIn(true)}
                  className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-[color:var(--field-border,var(--color-border))] bg-surface-hover px-6 text-sm font-medium text-ink transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Load 3D
                </button>
              </>
            ) : (
              <p role="status" data-stage-note className="text-sm text-ink-secondary">
                {message}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
