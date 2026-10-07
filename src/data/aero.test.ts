// Runs under Vitest (npm test). Each check is computed when the file loads and reported as its own test.
import { expect, it } from "vitest";
import {
  baseline,
  baselineSetup,
  circuits,
  clampRanges,
  evaluate,
  lapTime,
  score,
  type Setup,
} from "./aero";

function check(name: string, ok: boolean, detail: string): void {
  it(name, () => expect(ok, `${name}: ${detail}`).toBe(true));
}

const f = (x: number, d = 2): string => x.toFixed(d);

// Baseline sanity
const base = evaluate(baselineSetup);
check(
  "baseline coefficients",
  base.ClA === baseline.ClA && base.CdA === baseline.CdA && Math.abs(base.frontShare - baseline.frontShare) < 1e-9,
  `ClA ${base.ClA}, CdA ${base.CdA}, front ${base.frontShare}`,
);

// Circuit shape
const real = { power: 5793, technical: 3337, balanced: 5891 } as const;
for (const c of Object.values(circuits)) {
  const n = c.segments.length;
  check(`${c.id} segment count`, n >= 12 && n <= 20, `${n} segments`);
  const err = Math.abs(c.totalLengthM - real[c.id]) / real[c.id];
  check(`${c.id} length near real circuit`, err < 0.03, `${c.totalLengthM} m vs ${real[c.id]} m`);
}

// Baseline lap on the balanced circuit
const balancedBase = lapTime(baselineSetup, circuits.balanced);
check(
  "baseline balanced lap in 75..110 s",
  balancedBase.seconds > 75 && balancedBase.seconds < 110,
  `${f(balancedBase.seconds)} s, top ${f(balancedBase.topSpeedKmh, 1)} km/h, min corner ${f(balancedBase.minCornerKmh, 1)} km/h`,
);
check("score of baseline is zero", score(baselineSetup, circuits.balanced).deltaSeconds === 0, "delta 0.00 s");

// Straight Mode helps on the power circuit, hurts on the technical one
const straight: Setup = { ...baselineSetup, mode: "straight" };
const pC = lapTime(baselineSetup, circuits.power).seconds;
const pS = lapTime(straight, circuits.power).seconds;
check("power circuit: Straight Mode faster than Corner Mode", pS < pC, `straight ${f(pS)} s vs corner ${f(pC)} s`);
const tC = lapTime(baselineSetup, circuits.technical).seconds;
const tS = lapTime(straight, circuits.technical).seconds;
check("technical circuit: Corner Mode faster than Straight Mode", tC < tS, `corner ${f(tC)} s vs straight ${f(tS)} s`);
check(
  "Straight Mode helps the power circuit more than the technical one",
  pS - pC < tS - tC,
  `power ${f(pS - pC)} s, technical ${f(tS - tC)} s`,
);
const sEv = evaluate(straight);
check(
  "Straight Mode factors",
  Math.abs(sEv.ClA - 5.1 * 0.75) < 1e-9 && Math.abs(sEv.CdA - 1.0 * 0.82) < 1e-9,
  `ClA ${f(sEv.ClA, 3)}, CdA ${f(sEv.CdA, 3)}`,
);

// Rear wing angle: more grip in corners, less top speed
const rw = evaluate({ ...baselineSetup, rearWingDeg: 5 });
check(
  "rear wing +5 deg raises corner speed",
  rw.cornerSpeedKmh(100) > base.cornerSpeedKmh(100),
  `${f(rw.cornerSpeedKmh(100), 1)} vs ${f(base.cornerSpeedKmh(100), 1)} km/h at R = 100 m`,
);
check(
  "rear wing +5 deg lowers top speed",
  rw.topSpeedKmh < base.topSpeedKmh,
  `${f(rw.topSpeedKmh, 1)} vs ${f(base.topSpeedKmh, 1)} km/h`,
);
check(
  "rear wing +5 deg adds 0.15 ClA and 0.05 CdA",
  Math.abs(rw.ClA - base.ClA - 0.15) < 1e-9 && Math.abs(rw.CdA - base.CdA - 0.05) < 1e-9,
  `dClA ${f(rw.ClA - base.ClA, 3)}, dCdA ${f(rw.CdA - base.CdA, 3)}`,
);

// Clamps
const maxSetup: Setup = {
  frontWing: "high-downforce",
  rearWingDeg: 999,
  floor: "aggressive",
  mode: "corner",
  rideHeightMm: -99,
  halo: true,
};
const hi = evaluate(maxSetup);
// Pick the most extreme legal-range combination that does not stall: aggressive floor at -1 mm.
const hiLegal = evaluate({ ...maxSetup, rideHeightMm: -1 });
check("ClA upper clamp", hi.ClA <= clampRanges.ClA.max && hiLegal.ClA <= clampRanges.ClA.max, `ClA ${f(hi.ClA)} and ${f(hiLegal.ClA)} <= ${clampRanges.ClA.max}`);
check("CdA upper clamp", hi.CdA <= clampRanges.CdA.max, `CdA ${f(hi.CdA)} <= ${clampRanges.CdA.max}`);
check("rear wing angle clamps to range", evaluate({ ...baselineSetup, rearWingDeg: 999 }).ClA === evaluate({ ...baselineSetup, rearWingDeg: 10 }).ClA, "999 deg behaves as +10 deg");
const minSetup: Setup = {
  frontWing: "low-drag",
  rearWingDeg: -999,
  floor: "flat",
  mode: "straight",
  rideHeightMm: 99,
  halo: false,
};
const lo = evaluate(minSetup);
check("ClA lower clamp", lo.ClA >= clampRanges.ClA.min, `ClA ${f(lo.ClA)} >= ${clampRanges.ClA.min}`);
check("CdA lower clamp", lo.CdA >= clampRanges.CdA.min, `CdA ${f(lo.CdA)} >= ${clampRanges.CdA.min}`);
check("clamp is reported", lo.clamped, "clamped flag set when the table exceeds the guard rails");
// A sweep over the whole option space must stay inside the rails and produce finite laps.
let worst = 0;
for (const frontWing of ["low-drag", "balanced", "high-downforce"] as const)
  for (const rearWingDeg of [-15, -10, 0, 5, 10, 15])
    for (const floor of ["flat", "standard", "aggressive"] as const)
      for (const mode of ["corner", "straight"] as const)
        for (const rideHeightMm of [-9, -3, -1, 0, 6, 12, 30])
          for (const halo of [true, false]) {
            const s: Setup = { frontWing, rearWingDeg, floor, mode, rideHeightMm, halo };
            const e = evaluate(s);
            const ok =
              e.ClA >= clampRanges.ClA.min && e.ClA <= clampRanges.ClA.max &&
              e.CdA >= clampRanges.CdA.min && e.CdA <= clampRanges.CdA.max &&
              e.frontShare >= clampRanges.frontShare.min && e.frontShare <= clampRanges.frontShare.max &&
              Number.isFinite(e.topSpeedKmh);
            if (!ok) throw new Error(`FAIL sweep: out of range for ${JSON.stringify(s)}`);
            const lt = lapTime(s, circuits.balanced).seconds;
            if (!Number.isFinite(lt) || lt < 60 || lt > 140) throw new Error(`FAIL sweep: lap ${lt} for ${JSON.stringify(s)}`);
            worst = Math.max(worst, lt);
          }
check("full option sweep stays in range with sane laps", true, `slowest balanced lap ${f(worst)} s`);

// Ride height and the aggressive floor stall
const agLow = evaluate({ ...baselineSetup, floor: "aggressive", rideHeightMm: -3 });
const agRef = evaluate({ ...baselineSetup, floor: "aggressive", rideHeightMm: 0 });
check("aggressive floor stalls when too low", agLow.floorStalled && agLow.ClA < agRef.ClA, `ClA ${f(agLow.ClA)} at -3 mm vs ${f(agRef.ClA)} at 0 mm`);
const stLow = evaluate({ ...baselineSetup, rideHeightMm: -3 });
check("standard floor does not stall", !stLow.floorStalled && stLow.ClA > base.ClA, `ClA ${f(stLow.ClA)} at -3 mm`);
const stHigh = evaluate({ ...baselineSetup, rideHeightMm: 6 });
check("higher ride height loses downforce and moves balance rearward", stHigh.ClA < base.ClA && stHigh.frontShare < base.frontShare, `ClA ${f(stHigh.ClA)}, front ${f(stHigh.frontShare, 3)} at +6 mm`);

// Physics sanity
check("more downforce, higher corner speed at R = 100 m", evaluate({ ...baselineSetup, frontWing: "high-downforce" }).cornerSpeedKmh(100) > base.cornerSpeedKmh(100), "high-downforce front wing corners faster");
check("low drag front wing raises top speed", evaluate({ ...baselineSetup, frontWing: "low-drag" }).topSpeedKmh > base.topSpeedKmh, "low-drag front wing is quicker in a straight line");
check("downforce and drag scale with v squared", Math.abs(base.downforceN(80) / base.downforceN(40) - 4) < 1e-9 && Math.abs(base.dragN(80) / base.dragN(40) - 4) < 1e-9, "x4 for x2 speed");

