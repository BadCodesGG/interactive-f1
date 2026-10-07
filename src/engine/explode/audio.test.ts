import { describe, expect, it, vi } from "vitest";
import { CUES, createSound, HOVER_GAP_S, readMuted, soundKey, writeMuted, type SoundEnv } from "./audio";

/** A fake AudioContext that records each oscillator's settings. */
function fakeContext(state: "running" | "suspended" = "running") {
  const played: { hz: number; type: string; start: number }[] = [];
  const ctx = {
    currentTime: 0,
    state,
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    createOscillator() {
      const osc = {
        type: "",
        frequency: { value: 0 },
        connect: (n: unknown) => n,
        start: (t: number) => played.push({ hz: osc.frequency.value, type: osc.type, start: t }),
        stop: () => {},
      };
      return osc;
    },
    createGain() {
      return { gain: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {} }, connect: (n: unknown) => n };
    },
  };
  return { ctx, played };
}

function fakeEnv(over: Partial<SoundEnv> = {}) {
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) } as unknown as Storage;
  const { ctx, played } = fakeContext();
  const make = vi.fn(() => ctx as unknown as AudioContext);
  const env: SoundEnv = { storage: () => storage, context: make, hasGesture: () => true, ...over };
  return { env, data, ctx, played, make };
}

describe("readMuted and writeMuted", () => {
  it("is muted unless a 0 was stored", () => {
    const store = (v: string | null) => ({ getItem: () => v });
    expect(readMuted(store(null), "k")).toBe(true);
    expect(readMuted(store("1"), "k")).toBe(true);
    expect(readMuted(store("junk"), "k")).toBe(true);
    expect(readMuted(store("0"), "k")).toBe(false);
    expect(readMuted(null, "k")).toBe(true);
  });

  it("does not throw when storage does", () => {
    expect(
      readMuted(
        {
          getItem: () => {
            throw new Error("blocked");
          },
        },
        "k",
      ),
    ).toBe(true);
    expect(() =>
      writeMuted(
        {
          setItem: () => {
            throw new Error("full");
          },
        },
        "k",
        false,
      ),
    ).not.toThrow();
  });

  it("namespaces the key per app", () => {
    expect(soundKey("pc")).toBe("explode:pc:sound");
  });
});

describe("createSound", () => {
  it("starts muted and makes no AudioContext while muted", () => {
    const { env, make } = fakeEnv();
    const s = createSound("t", env);
    expect(s.isMuted()).toBe(true);
    s.play("select");
    expect(make).not.toHaveBeenCalled();
  });

  it("restores an unmuted choice from storage", () => {
    const { env, data } = fakeEnv();
    data.set(soundKey("t"), "0");
    expect(createSound("t", env).isMuted()).toBe(false);
  });

  it("saves the choice, tells subscribers, and confirms with a tick when switched on", () => {
    const { env, data, played } = fakeEnv();
    const s = createSound("t", env);
    const fn = vi.fn();
    s.subscribe(fn);
    s.setMuted(false);
    expect(data.get(soundKey("t"))).toBe("0");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(played.map((p) => p.hz)).toEqual(CUES.select.map((n) => n.hz));
    s.setMuted(false);
    expect(fn).toHaveBeenCalledTimes(1);
    s.setMuted(true);
    expect(data.get(soundKey("t"))).toBe("1");
  });

  it("plays a cue's notes once unmuted, creating the context on first use only", () => {
    const { env, played, make } = fakeEnv();
    const s = createSound("t", env);
    s.setMuted(false);
    played.length = 0;
    s.play("reject");
    s.play("snap");
    expect(played.map((p) => p.hz)).toEqual([110, 90, 150]);
    expect(make).toHaveBeenCalledTimes(1);
  });

  it("plays a custom list of notes with their own wave and start", () => {
    const { env, played, ctx } = fakeEnv();
    const s = createSound("t", env);
    s.setMuted(false);
    played.length = 0;
    ctx.currentTime = 2;
    s.play([
      { hz: 440, at: 0.5, dur: 0.1, type: "sine" },
      { hz: 660, at: 0.7, dur: 0.1 },
    ]);
    expect(played).toEqual([
      { hz: 440, type: "sine", start: 2.5 },
      { hz: 660, type: "square", start: 2.7 },
    ]);
  });

  it("stays silent, and makes no context, until the visitor has made a gesture", () => {
    let gesture = false;
    const { env, played, make } = fakeEnv({ hasGesture: () => gesture });
    const s = createSound("t", env);
    s.setMuted(false);
    s.play("hover");
    expect(make).not.toHaveBeenCalled();
    expect(played).toHaveLength(0);
    gesture = true;
    s.play("select");
    expect(played.length).toBeGreaterThan(0);
  });

  it("resumes a suspended context", () => {
    const { ctx, played } = fakeContext("suspended");
    const { env } = fakeEnv({ context: () => ctx as unknown as AudioContext });
    const s = createSound("t", env);
    s.setMuted(false);
    expect(ctx.resume).toHaveBeenCalled();
    expect(played.length).toBeGreaterThan(0);
  });

  it("drops hover ticks that come too close together", () => {
    const { env, played, ctx } = fakeEnv();
    const s = createSound("t", env);
    s.setMuted(false);
    played.length = 0;
    s.play("hover");
    ctx.currentTime += HOVER_GAP_S / 2;
    s.play("hover");
    expect(played).toHaveLength(1);
    ctx.currentTime += HOVER_GAP_S;
    s.play("hover");
    expect(played).toHaveLength(2);
  });

  it("does nothing, without throwing, where there is no WebAudio or it throws", () => {
    const none = createSound("t", fakeEnv({ context: () => null }).env);
    none.setMuted(false);
    expect(() => none.play("select")).not.toThrow();
    const bad = fakeEnv({
      context: () => {
        throw new Error("no audio");
      },
    });
    const s = createSound("t", bad.env);
    s.setMuted(false);
    expect(() => s.play("select")).not.toThrow();
  });
});
