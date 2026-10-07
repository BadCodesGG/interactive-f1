"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, Link2, LoaderCircle, View, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { detectAr, readArEnv } from "../ar";
import { controlsHint } from "../gate-state";
import type { ArSession } from "../ar-launch";

/** The AR launcher (and model-viewer's probe with it) loads only where AR is possible, never in the initial scripts. */
const loadArLaunch = () => import("../ar-launch");
import { getSound, useMuted, type Sound } from "../audio";
import { copyText, downloadBlob, screenshotName, shareUrl } from "../capture";
import { useExplodeStore } from "../provider";
import type { Sidecar } from "../sidecar";
import type { ExplodeStore } from "../store";
import { useExplodeState } from "../store";
import { useHydrated } from "./use-hydrated";

const ICON_BUTTON = "h-8 w-8 text-ink-secondary";

/** Hover, select and snap ticks from the store's changes. Silent while muted, which is the default. */
function useSoundTicks(store: ExplodeStore, sound: Sound) {
  useEffect(() => {
    let prev = store.getState();
    return store.subscribe(() => {
      const st = store.getState();
      if (st.hovered && st.hovered !== prev.hovered) sound.play("hover");
      if (st.selected && st.selected !== prev.selected) sound.play("select");
      if (st.k !== prev.k && (st.k === 0 || st.k === 1)) sound.play("snap");
      prev = st;
    });
  }, [store, sound]);
}

/** The mute switch: an icon button that is pressed when sound is on. Off until the visitor turns it on. */
export function SoundToggle({ app, className }: { app: string; className?: string }) {
  const sound = getSound(app);
  const muted = useMuted(sound);
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label="Sound"
      aria-pressed={!muted}
      title={muted ? "Turn sound on" : "Turn sound off"}
      data-sound-toggle
      onClick={() => sound.setMuted(!muted)}
      className={cn(ICON_BUTTON, !muted && "border-accent/60 text-accent", className)}
    >
      {muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
    </Button>
  );
}

export interface StageToolsProps {
  /** Names the app: the screenshot's file name, and the sound and found keys' namespace. */
  app: string;
  sidecar: Pick<Sidecar, "parts">;
  /**
   * Adds "View in your room" on phones and tablets that can open AR (hidden everywhere else, and in the
   * server HTML). Needs `ar` on the stage as well, which says how big the model is in the real world.
   */
  ar?: boolean;
  className?: string;
}

/**
 * Three icon buttons for the row under the stage: copy a link to what is on screen, save a PNG of the
 * canvas, and switch sound on or off. Share needs only JavaScript; Screenshot waits for the 3D view.
 * With `ar`, a fourth opens the assembled model in AR on a phone. It also plays the hover, select and
 * snap ticks (nothing is heard until sound is switched on).
 */
export function StageTools({ app, sidecar, ar = false, className }: StageToolsProps) {
  const store = useExplodeStore();
  const { ready, stageGate } = useExplodeState(store);
  // Says why Screenshot and AR are off when the 3D view is waiting for Load 3D or cannot run.
  const hint = controlsHint(stageGate, ready);
  const hydrated = useHydrated();
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [arBusy, setArBusy] = useState(false);
  /** An AR view prepared but not yet opened: the tap that started it was too long ago for the browser to allow AR. */
  const [waiting, setWaiting] = useState<ArSession | null>(null);
  const arSession = useRef<ArSession | null>(null);
  useSoundTicks(store, getSound(app));
  // The device is only known in the browser, so the button appears after hydration.
  const platform = ar && hydrated ? detectAr(readArEnv()) : null;

  // Fetch the launcher as soon as the device can do AR, so the tap is not spent waiting for it.
  useEffect(() => {
    if (platform) void loadArLaunch();
  }, [platform]);

  // A message shows for a few seconds, then goes.
  useEffect(() => {
    if (!note && !copied) return;
    const t = setTimeout(() => {
      setNote("");
      setCopied(false);
    }, 3000);
    return () => clearTimeout(t);
  }, [note, copied]);

  const share = async () => {
    const { selected, target, isolated } = store.getState();
    const url = shareUrl(window.location, { selected, target, isolated });
    const result = await copyText(url);
    setCopied(result === "copied");
    setNote(result === "copied" ? "Link copied" : "Copy the link from the address bar");
  };

  const screenshot = async () => {
    const blob = await store.capture();
    if (!blob) {
      setNote("Screenshot unavailable");
      return;
    }
    const { selected } = store.getState();
    downloadBlob(blob, screenshotName(app, selected ? (sidecar.parts[selected]?.label ?? null) : null));
    setNote("Screenshot saved");
  };

  useEffect(() => () => arSession.current?.dispose(), []);

  const viewInAr = async () => {
    if (waiting) {
      setWaiting(null);
      const message = await waiting.open();
      setNote(message ?? "");
      return;
    }
    if (!platform) return;
    arSession.current?.dispose();
    setArBusy(true);
    setNote("Preparing AR");
    const { launchAr } = await loadArLaunch();
    const launch = await launchAr(store, app, platform);
    setArBusy(false);
    if (!launch.ok) {
      arSession.current = null;
      setNote(launch.message);
      return;
    }
    arSession.current = launch.session;
    if (launch.opened) setNote("");
    else {
      setWaiting(launch.session);
      setNote("Ready: press AR again to open");
    }
  };

  return (
    <div data-stage-tools role="group" aria-label="Share and capture" className={cn("inline-flex items-center gap-1", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Copy link"
        title="Copy a link to this view"
        disabled={!hydrated}
        data-share
        onClick={share}
        className={ICON_BUTTON}
      >
        {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Save screenshot"
        title={hint ?? "Save a screenshot"}
        aria-description={hint ?? undefined}
        disabled={!ready}
        data-screenshot
        onClick={screenshot}
        className={ICON_BUTTON}
      >
        <Camera aria-hidden />
      </Button>
      {platform && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={waiting ? "Open in AR" : "View in your room"}
          title={hint ?? (waiting ? "Open the model in AR" : "View this model life size in your room")}
          aria-description={hint ?? undefined}
          aria-busy={arBusy}
          disabled={!ready || arBusy}
          data-ar
          data-ar-ready={waiting ? "true" : undefined}
          onClick={viewInAr}
          className={cn(ICON_BUTTON, waiting && "border-accent/60 text-accent")}
        >
          {arBusy ? <LoaderCircle aria-hidden className="animate-spin" /> : <View aria-hidden />}
        </Button>
      )}
      <SoundToggle app={app} />
      <span role="status" className="text-xs text-ink-secondary empty:hidden">
        {note}
      </span>
    </div>
  );
}
