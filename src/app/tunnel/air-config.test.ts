import { describe, expect, it } from "vitest";
import { AIR, GOLDEN, airConfig, airCount, airSide, debrisBase, debrisLife, debrisSeeds, initialPhase, streakBase, streakBurst, streakLife, streakParticles, streakSpacing, streakSpan } from "./air-config";

describe("airConfig", () => {
  it("is 20 to 40 streaks and a sparse 60 to 120 flakes on desktop", () => {
    const c = airConfig(false);
    expect(c.streaks).toBeGreaterThanOrEqual(20);
    expect(c.streaks).toBeLessThanOrEqual(40);
    expect(c.debris).toBeGreaterThanOrEqual(60);
    expect(c.debris).toBeLessThanOrEqual(120);
  });

  it("puts most streaks in the shell that hugs the body, and keeps the shares a whole", () => {
    expect(AIR.streak.near).toBeGreaterThanOrEqual(0.7);
    expect(AIR.streak.near + AIR.streak.below).toBeLessThan(1);
  });

  it("halves both on a phone", () => {
    expect(airConfig(true).streaks).toBe(airConfig(false).streaks / 2);
    expect(airConfig(true).debris).toBe(airConfig(false).debris / 2);
  });

  it("packs streaks first, then flakes, into a square texture that holds them all", () => {
    for (const mobile of [false, true]) {
      const c = airConfig(mobile);
      expect(streakParticles(c)).toBe(c.streaks * AIR.streak.links);
      expect(airCount(c)).toBe(streakParticles(c) + c.debris);
      expect(airSide(c) ** 2).toBeGreaterThanOrEqual(airCount(c));
      expect((airSide(c) - 1) ** 2).toBeLessThan(airCount(c));
    }
  });
});

describe("streak timing", () => {
  it("spreads streaks evenly enough in their cycle that none share a moment", () => {
    const bases = Array.from({ length: 40 }, (_, s) => streakBase(s)).sort((a, b) => a - b);
    const gaps = bases.slice(1).map((b, i) => b - bases[i]);
    expect(Math.min(...gaps)).toBeGreaterThan(0.01);
    expect(Math.max(...gaps)).toBeLessThan(0.08);
  });

  it("keys every link of a burst to one cycle number, using the very formula the position shader does", () => {
    const c = airConfig(false);
    // air.ts: floor(uClockS + BURST + (1 - BURST) * fract(s * GOLDEN)), where BURST = streakBurst().
    const shaderBase = (s: number) => streakBurst() + (1 - streakBurst()) * (((s * GOLDEN) % 1 + 1) % 1);
    for (let s = 0; s < c.streaks; s++) {
      expect(shaderBase(s)).toBeCloseTo(streakBase(s), 12);
      const keys = new Set<number>();
      for (let j = 0; j < AIR.streak.links; j++) {
        // A link wraps when the clock reaches 1 - its phase; the shader's key at that moment.
        const clock = 1 - initialPhase(c, s + j * c.streaks) + 1e-9;
        keys.add(Math.floor(clock + shaderBase(s)));
      }
      expect(keys.size).toBe(1);
    }
  });

  it("keeps a whole burst on one side of a wrap, so all its links share a cycle number", () => {
    const c = airConfig(false);
    for (let s = 0; s < c.streaks; s++) {
      for (let j = 0; j < AIR.streak.links; j++) {
        const phase = initialPhase(c, s + j * c.streaks);
        expect(phase).toBeGreaterThanOrEqual(0);
        // floor(clock + base) is the cycle number the shader keys the spawn on: it is one for every link of the burst.
        const wrapsAt = 1 - phase;
        expect(Math.floor(wrapsAt + streakBase(s) + 1e-9)).toBe(1);
      }
    }
  });

  it("makes a burst `length` metres long at freestream, whatever the speed", () => {
    for (const u of [1.8, 3, 4.2]) {
      const seconds = streakSpacing() * (AIR.streak.links - 1) * streakLife(u);
      const metres = seconds * AIR.streak.speedMul * u;
      expect(metres).toBeCloseTo(AIR.streak.length, 6);
    }
  });

  it("lets a streak cross the whole box in the visible part of its cycle", () => {
    const u = 3;
    expect(streakLife(u) * AIR.streak.duty * AIR.streak.speedMul * u).toBeCloseTo(streakSpan, 6);
  });

  it("is fast: at least twice the smoke's pace, and a flake keeps the smoke's", () => {
    expect(AIR.streak.speedMul).toBeGreaterThanOrEqual(2);
    expect(AIR.streak.speedMul).toBeLessThanOrEqual(4);
    expect(AIR.debris.speedMul).toBe(1);
    expect(debrisLife(3)).toBeGreaterThan(streakLife(3) * AIR.streak.duty);
  });

  it("keeps every neighbour in a burst just behind the last in phase, and the burst inside one cycle", () => {
    const c = airConfig(false);
    expect(streakSpacing() * AIR.streak.links).toBeLessThan(0.2);
    const dphase = (a: number, b: number) => b - a;
    for (const s of [0, 5, 39]) {
      // Particle i = s + j * streaks is link j of streak s.
      for (const j of [0, 10, 23]) {
        const a = initialPhase(c, s + j * c.streaks);
        const b = initialPhase(c, s + (j + 1) * c.streaks);
        expect(dphase(a, b)).toBeCloseTo(-streakSpacing(), 9);
      }
    }
  });

  it("gives streaks phases in [0, 1) and flakes their own offsets", () => {
    const c = airConfig(false);
    for (let i = 0; i < airCount(c); i++) {
      const p = initialPhase(c, i);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
    expect(initialPhase(c, streakParticles(c) + 3)).toBe(debrisBase(3));
    expect(new Set(Array.from({ length: 240 }, (_, d) => debrisBase(d).toFixed(4))).size).toBe(240);
  });
});

describe("debris volume", () => {
  it("stays within about 0.6 m of the car (half-width 0.95 m, 1.06 m tall) and under the ceiling", () => {
    expect(AIR.debris.spawnZ).toBeLessThanOrEqual(0.95 + 0.6);
    expect(AIR.debris.spawnY).toBeLessThanOrEqual(AIR.debris.ceiling);
    expect(AIR.debris.ceiling).toBeLessThanOrEqual(1.5);
    expect(AIR.debris.maxStretch).toBeGreaterThan(1);
  });

  it("wanders more than a streak, which follows the field smoothly", () => {
    expect(AIR.debris.wander).toBeGreaterThan(AIR.streak.wander);
  });
});

describe("debrisSeeds", () => {
  const seeds = debrisSeeds(300);

  it("makes flakes of two and a half to five centimetres, spinning at both signs, on unit axes", () => {
    expect(Math.min(...seeds.size)).toBeGreaterThanOrEqual(AIR.debris.size[0]);
    expect(Math.max(...seeds.size)).toBeLessThanOrEqual(AIR.debris.size[1]);
    expect(AIR.debris.size[0]).toBeGreaterThanOrEqual(0.025);
    expect(AIR.debris.size[1]).toBeLessThanOrEqual(0.05);
    expect(seeds.spin.some((w) => w < 0)).toBe(true);
    expect(seeds.spin.some((w) => w > 0)).toBe(true);
    for (const w of seeds.spin) expect(Math.abs(w)).toBeGreaterThanOrEqual(AIR.debris.spin[0]);
    for (let i = 0; i < 300; i++) expect(Math.hypot(seeds.axis[i * 3], seeds.axis[i * 3 + 1], seeds.axis[i * 3 + 2])).toBeCloseTo(1, 5);
  });

  it("is the same every time", () => {
    expect(Array.from(debrisSeeds(20).size)).toEqual(Array.from(debrisSeeds(20).size));
    expect(Array.from(debrisSeeds(20, 8).size)).not.toEqual(Array.from(debrisSeeds(20).size));
  });
});
