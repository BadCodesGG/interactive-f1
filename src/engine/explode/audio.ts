"use client";

/**
 * Sound, off by default: WebAudio tones, no asset files. One `Sound` per app, memoised by name, so
 * the toggle, the hover and select ticks and (in the PC build game) the game's own cues share one
 * mute switch and one AudioContext.
 *
 * The context is created lazily, on the first play after a real user gesture, which browsers need
 * before they let audio start; a hover tick before any click or key press is simply silent. The
 * mute choice is saved in localStorage (guarded: blocked storage means it lasts for the visit).
 */
import { useSyncExternalStore } from "react";
import { safeStorage } from "./discovered";

/** One tone: `hz` starting `at` seconds from now, lasting `dur`. Gain defaults to 0.08, wave to square. */
export interface Note {
  hz: number;
  at: number;
  dur: number;
  gain?: number;
  type?: OscillatorType;
}

export type Cue = "hover" | "select" | "snap" | "reject";

export const CUES: Record<Cue, readonly Note[]> = {
  hover: [{ hz: 1900, at: 0, dur: 0.025, gain: 0.025, type: "sine" }],
  select: [
    { hz: 880, at: 0, dur: 0.05, gain: 0.06, type: "triangle" },
    { hz: 1320, at: 0.045, dur: 0.06, gain: 0.05, type: "triangle" },
  ],
  snap: [{ hz: 150, at: 0, dur: 0.07, gain: 0.12, type: "sine" }],
  reject: [
    { hz: 110, at: 0, dur: 0.09, gain: 0.1, type: "triangle" },
    { hz: 90, at: 0.1, dur: 0.09, gain: 0.1, type: "triangle" },
  ],
};

/** Hover ticks closer together than this are dropped, so sweeping the pointer over a list is not a buzz. */
export const HOVER_GAP_S = 0.06;

export const soundKey = (app: string) => `explode:${app}:sound`;

/** Muted unless the visitor has switched sound on: only a stored "0" means unmuted. */
export function readMuted(storage: Pick<Storage, "getItem"> | null, key: string): boolean {
  try {
    return storage?.getItem(key) !== "0";
  } catch {
    return true;
  }
}

export function writeMuted(storage: Pick<Storage, "setItem"> | null, key: string, muted: boolean): void {
  try {
    storage?.setItem(key, muted ? "1" : "0");
  } catch {
    // Kept for this visit only.
  }
}

/** What Sound needs from the browser, injectable so it can be tested without one. */
export interface SoundEnv {
  storage(): Storage | null;
  /** A new AudioContext, or null where there is none. */
  context(): AudioContext | null;
  /** Whether the visitor has clicked or pressed a key yet. */
  hasGesture(): boolean;
}

export interface Sound {
  isMuted(): boolean;
  setMuted(muted: boolean): void;
  subscribe(fn: () => void): () => void;
  /** Plays a named cue or a list of notes. Silent while muted, before a gesture, or without WebAudio. */
  play(what: Cue | readonly Note[]): void;
}

let gestured = false;
let listening = false;

const browserEnv: SoundEnv = {
  storage: safeStorage,
  context() {
    if (typeof window === "undefined" || typeof window.AudioContext !== "function") return null;
    try {
      return new window.AudioContext();
    } catch {
      return null;
    }
  },
  hasGesture() {
    if (typeof window === "undefined") return false;
    if (!listening) {
      listening = true;
      const mark = () => {
        gestured = true;
      };
      for (const ev of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(ev, mark, { capture: true, passive: true, once: true });
    }
    return gestured || navigator.userActivation?.hasBeenActive === true;
  },
};

export function createSound(app: string, env: SoundEnv = browserEnv): Sound {
  const key = soundKey(app);
  let muted: boolean | null = null;
  let ctx: AudioContext | null = null;
  let lastHover = -Infinity;
  const listeners = new Set<() => void>();

  const audio = (): AudioContext | null => {
    if (!ctx) ctx = env.context();
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx;
  };

  const tone = (ac: AudioContext, n: Note) => {
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    const gain = n.gain ?? 0.08;
    osc.type = n.type ?? "square";
    osc.frequency.value = n.hz;
    const t0 = ac.currentTime + n.at;
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(gain, t0 + 0.005);
    amp.gain.setValueAtTime(gain, t0 + Math.max(n.dur - 0.01, 0.005));
    amp.gain.linearRampToValueAtTime(0, t0 + n.dur);
    osc.connect(amp).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + n.dur + 0.02);
  };

  const sound: Sound = {
    isMuted: () => (muted ??= readMuted(env.storage(), key)),
    setMuted(next) {
      if (sound.isMuted() === next) return;
      muted = next;
      writeMuted(env.storage(), key, next);
      listeners.forEach((fn) => fn());
      // Switching on is itself a click: confirm it worked.
      if (!next) sound.play("select");
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    play(what) {
      if (sound.isMuted() || !env.hasGesture()) return;
      try {
        const ac = audio();
        if (!ac) return;
        if (what === "hover") {
          if (ac.currentTime - lastHover < HOVER_GAP_S) return;
          lastHover = ac.currentTime;
        }
        for (const n of typeof what === "string" ? CUES[what] : what) tone(ac, n);
      } catch {
        // A sound that will not play must never break the page.
      }
    },
  };
  return sound;
}

const sounds = new Map<string, Sound>();

/** The one Sound for an app, so every part of the page shares its mute switch. */
export function getSound(app: string): Sound {
  let s = sounds.get(app);
  if (!s) sounds.set(app, (s = createSound(app)));
  return s;
}

/** Whether sound is muted, for a component; muted on the server and during hydration. */
export function useMuted(sound: Sound): boolean {
  return useSyncExternalStore(sound.subscribe, sound.isMuted, () => true);
}
