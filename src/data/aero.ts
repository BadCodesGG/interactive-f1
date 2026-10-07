/**
 * Game aero model for the interactive F1 wind tunnel (stage 1).
 *
 * Everything here is a GAME model: a coefficient table plus a quasi-steady point-mass lap sim.
 * It is not CFD and not FIA data. Coefficients are calibrated so the ordering and the sign of
 * each trade-off are right (more rear wing: more grip, less top speed; Straight Mode: better on
 * power circuits, worse on technical ones), not so the absolute numbers match a real car.
 * Score is always shown relative to the baseline setup.
 *
 * Pure functions, no framework, no DOM. Speeds in the API are m/s unless a name ends in Kmh.
 */

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

/** GAME: 2026 corner mode, balanced front wing, reference rear angle, standard floor, halo on. */
export const baseline = {
  ClA: 5.1, // m^2, downforce coefficient times reference area
  CdA: 1.0, // m^2, drag coefficient times reference area
  frontShare: 0.4, // fraction of downforce on the front axle (centre of pressure ~40% front)
  massKg: 770, // car, driver and fuel (2026 minimum is quoted between 724 and 770 kg by different sources)
  rho: 1.225, // kg/m^3, ISA sea level
  mu: 1.65, // tyre friction coefficient at static load
  powerKw: 550, // GAME: power available at the wheels up to fullPowerKmh
  cRR: 0.012, // rolling resistance coefficient
} as const;

export const G = 9.81;

/**
 * GAME: power is flat to fullPowerKmh, then tapers linearly to zero at zeroPowerKmh.
 * The FIA power unit regulations taper only the electrical part: ERS-K deployment is 350 kW up to
 * 290 km/h, fades to 100 kW at 340 km/h and is zero from 345 km/h (355 km/h in override mode),
 * while the engine keeps pulling. This game curve applies one taper to the whole 550 kW instead,
 * and it is a compromise: full power to 300 km/h, fading to nothing by 420 km/h. That puts
 * Corner Mode top speed near 320 km/h and Straight Mode near 330 km/h, close to the 337 km/h the
 * FIA quotes for a car using Overtake Mode. (With the literal 290 to 345 km/h taper applied to
 * all power, top speeds land near 305 km/h and Straight Mode gains almost nothing.)
 */
export const powerCurve = { fullPowerKmh: 300, zeroPowerKmh: 420 } as const;

/**
 * GAME: tyre grip falls as vertical load rises (mu_eff = mu * (Fz / Fz_static)^-loadSensitivity),
 * and lateral and braking acceleration are capped so extra downforce has diminishing returns.
 */
export const tyreModel = { loadSensitivity: 0.12, maxLateralG: 5.5, maxBrakingG: 5.5 } as const;

/** Guard rails: no combination of parts may leave these ranges. */
export const clampRanges = {
  ClA: { min: 3.0, max: 6.5 },
  CdA: { min: 0.7, max: 1.3 },
  frontShare: { min: 0.3, max: 0.5 },
} as const;

/** GAME: share of baseline ClA produced by the floor and diffuser (front wing 20, rear wing 25, floor 45, other 10). */
export const floorShareOfClA = 0.45;

// ---------------------------------------------------------------------------------------------
// Part tables (deltas are additive to baseline; GAME unless the description says SOURCED)
// ---------------------------------------------------------------------------------------------

export type FrontWingId = "low-drag" | "balanced" | "high-downforce";
export type FloorId = "flat" | "standard" | "aggressive";
export type AeroMode = "corner" | "straight";

export interface PartVariant<Id extends string> {
  id: Id;
  label: string;
  description: string;
  /** Change in ClA, m^2. */
  dClA: number;
  /** Change in CdA, m^2. */
  dCdA: number;
  /** Change in front share of downforce, as a fraction (0.03 = 3 points). */
  dFrontShare: number;
}

export const frontWingVariants: readonly PartVariant<FrontWingId>[] = [
  {
    id: "low-drag",
    label: "Low drag",
    description:
      "Shallow flap angles and a lean endplate. Gives up front grip for a slipperier car; the front axle gets lazy in slow corners.",
    dClA: -0.35,
    dCdA: -0.05,
    dFrontShare: -0.03,
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "The reference front wing. Nothing added, nothing taken away.",
    dClA: 0,
    dCdA: 0,
    dFrontShare: 0,
  },
  {
    id: "high-downforce",
    label: "High downforce",
    description:
      "Steeper flap and a bigger endplate. Sharper turn-in and more front load, paid for in drag.",
    dClA: 0.4,
    dCdA: 0.06,
    dFrontShare: 0.03,
  },
];

export const rearWingAngles = {
  label: "Rear wing angle",
  description:
    "Degrees steeper (+) or shallower (-) than the reference flap. Each 5 degrees adds grip and drag, and shifts the balance slightly rearward.",
  /** Available preset steps, degrees relative to the reference angle. */
  steps: [-10, -5, 0, 5, 10] as readonly number[],
  minDeg: -10,
  maxDeg: 10,
  /** The step the coefficients below are written per (they are linear in it, so any angle in range works). */
  stepDeg: 5,
  /** How finely the slider moves: half a degree, which is continuous to the eye and to the score (the maths takes any angle). */
  sliderStepDeg: 0.5,
  referenceDeg: 0,
  /** Per 5 degrees steeper. */
  dClAPer5Deg: 0.15,
  dCdAPer5Deg: 0.05,
  dFrontSharePer5Deg: -0.01,
} as const;

export const floorVariants: readonly PartVariant<FloorId>[] = [
  {
    id: "flat",
    label: "Flat",
    description:
      "A plain, near-flat underbody with a mild diffuser. Safe and forgiving, but it leaves the biggest downforce source on the table.",
    dClA: -0.9,
    dCdA: -0.05,
    dFrontShare: 0.02,
  },
  {
    id: "standard",
    label: "Standard",
    description: "The reference floor: partially flat, lower-powered diffuser, as the 2026 rules intend.",
    dClA: 0,
    dCdA: 0,
    dFrontShare: 0,
  },
  {
    id: "aggressive",
    label: "Aggressive",
    description:
      "A steeper diffuser and a more sculpted floor edge. Big downforce, but the floor stalls if the ride height gets too low.",
    dClA: 0.6,
    dCdA: 0.03,
    dFrontShare: -0.02,
  },
];

export const aeroModes: Record<
  AeroMode,
  { id: AeroMode; label: string; description: string; ClAFactor: number; CdAFactor: number }
> = {
  corner: {
    id: "corner",
    label: "Corner Mode",
    description: "Both active wings closed in the high-downforce position. Reference values.",
    ClAFactor: 1.0,
    CdAFactor: 1.0,
  },
  straight: {
    id: "straight",
    label: "Straight Mode",
    description:
      "Both active wings flat for low drag. SOURCED: about 18% less drag and 25% less downforce than Corner Mode in a Bramble CFD study.",
    ClAFactor: 0.75,
    CdAFactor: 0.82,
  },
};

export const rideHeight = {
  label: "Ride height",
  description:
    "Millimetres above (+) or below (-) the reference. The floor loses about 3% of its downforce for every extra millimetre and gains about the same going lower, up to a cap.",
  minMm: -3,
  maxMm: 12,
  referenceMm: 0,
  /** Floor downforce multiplier per +1 mm (0.97 means 3% less). Illustrative. */
  floorFactorPerMm: 0.97,
  /** The floor never gains more than this multiplier from running low. */
  maxLowGainFactor: 1.09,
  /** Front share change per +1 mm above reference (a fraction, so -0.005 is half a point). */
  dFrontSharePerMm: -0.005,
  /** Aggressive floor only: below this ride height (mm, relative) the floor stalls. */
  stallBelowMm: -1,
  /** Aggressive floor stall: fraction of floor downforce lost per mm below the threshold. */
  stallLossPerMm: 0.12,
  /** Aggressive floor stall: CdA added per mm below the threshold. */
  stallDragPerMm: 0.02,
} as const;

export const haloToggle = {
  label: "Halo",
  description:
    "Mandatory in real racing, so this toggle is educational. A CFD write-up puts the halo at about +1.76% drag and +0.8% downforce (weak source).",
  /** Multipliers applied when the halo is fitted (baseline has it on). */
  ClAFactorOn: 1.008,
  CdAFactorOn: 1.0176,
} as const;

// ---------------------------------------------------------------------------------------------
// Setup and evaluation
// ---------------------------------------------------------------------------------------------

export interface Setup {
  frontWing: FrontWingId;
  /** Degrees relative to the reference rear wing angle, clamped to rearWingAngles.minDeg..maxDeg. */
  rearWingDeg: number;
  floor: FloorId;
  mode: AeroMode;
  /** Millimetres relative to the reference ride height, clamped to rideHeight.minMm..maxMm. */
  rideHeightMm: number;
  halo: boolean;
}

export const baselineSetup: Setup = {
  frontWing: "balanced",
  rearWingDeg: 0,
  floor: "standard",
  mode: "corner",
  rideHeightMm: 0,
  halo: true,
};

export interface Evaluation {
  ClA: number;
  CdA: number;
  frontShare: number;
  /** v in m/s. */
  downforceN(v: number): number;
  /** v in m/s. */
  dragN(v: number): number;
  topSpeedKmh: number;
  /** Steady-state limit through a corner of the given radius, km/h. */
  cornerSpeedKmh(radiusM: number): number;
  /** True when an aggressive floor is running below its stall ride height. */
  floorStalled: boolean;
  /** True when the part table pushed ClA or CdA outside the guard rails and it was clamped. */
  clamped: boolean;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function pick<Id extends string>(list: readonly PartVariant<Id>[], id: Id): PartVariant<Id> {
  const found = list.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown part id: ${id}`);
  return found;
}

/** Power at the wheels, W, at speed v (m/s). */
export function powerW(v: number): number {
  const kmh = v * 3.6;
  const { fullPowerKmh, zeroPowerKmh } = powerCurve;
  if (kmh <= fullPowerKmh) return baseline.powerKw * 1000;
  if (kmh >= zeroPowerKmh) return 0;
  return baseline.powerKw * 1000 * ((zeroPowerKmh - kmh) / (zeroPowerKmh - fullPowerKmh));
}

/** Tyre friction at vertical load fz (N), after load sensitivity. */
export function muEffective(fz: number): number {
  const staticLoad = baseline.massKg * G;
  return baseline.mu * Math.pow(Math.max(fz, 1) / staticLoad, -tyreModel.loadSensitivity);
}

export function evaluate(setup: Setup): Evaluation {
  const fw = pick(frontWingVariants, setup.frontWing);
  const fl = pick(floorVariants, setup.floor);
  const mode = aeroModes[setup.mode];

  const rwDeg = clamp(setup.rearWingDeg, rearWingAngles.minDeg, rearWingAngles.maxDeg);
  const rwSteps = (rwDeg - rearWingAngles.referenceDeg) / rearWingAngles.stepDeg;
  const rhMm = clamp(setup.rideHeightMm, rideHeight.minMm, rideHeight.maxMm);
  const rhRel = rhMm - rideHeight.referenceMm;

  // Floor downforce scales with ride height; an aggressive floor stalls when it runs too low.
  let floorFactor = Math.min(Math.pow(rideHeight.floorFactorPerMm, rhRel), rideHeight.maxLowGainFactor);
  let stallDrag = 0;
  let floorStalled = false;
  if (fl.id === "aggressive") {
    const below = Math.max(0, rideHeight.stallBelowMm - rhRel);
    if (below > 0) {
      floorStalled = true;
      floorFactor *= Math.max(0.5, 1 - rideHeight.stallLossPerMm * below);
      stallDrag = rideHeight.stallDragPerMm * below;
    }
  }

  const floorBaseCl = floorShareOfClA * baseline.ClA;
  const nonFloorCl = baseline.ClA - floorBaseCl + fw.dClA + rwSteps * rearWingAngles.dClAPer5Deg;
  const floorCl = (floorBaseCl + fl.dClA) * floorFactor;
  let cl = nonFloorCl + floorCl;
  let cd =
    baseline.CdA + fw.dCdA + rwSteps * rearWingAngles.dCdAPer5Deg + fl.dCdA + stallDrag;

  // The baseline includes the halo, so taking it off divides its contribution out.
  if (!setup.halo) {
    cl /= haloToggle.ClAFactorOn;
    cd /= haloToggle.CdAFactorOn;
  }
  cl *= mode.ClAFactor;
  cd *= mode.CdAFactor;

  const ClA = clamp(cl, clampRanges.ClA.min, clampRanges.ClA.max);
  const CdA = clamp(cd, clampRanges.CdA.min, clampRanges.CdA.max);
  const clamped = ClA !== cl || CdA !== cd;

  const frontShare = clamp(
    baseline.frontShare +
      fw.dFrontShare +
      rwSteps * rearWingAngles.dFrontSharePer5Deg +
      fl.dFrontShare +
      rhRel * rideHeight.dFrontSharePerMm,
    clampRanges.frontShare.min,
    clampRanges.frontShare.max,
  );

  const downforceN = (v: number): number => 0.5 * baseline.rho * v * v * ClA;
  const dragN = (v: number): number => 0.5 * baseline.rho * v * v * CdA;
  const rollingN = (v: number): number => baseline.cRR * (baseline.massKg * G + downforceN(v));

  // Top speed: P(v)/v = drag + rolling. The left side falls and the right side rises with v, so bisect.
  const resid = (v: number): number => powerW(v) / v - dragN(v) - rollingN(v);
  let lo = 10;
  let hi = powerCurve.zeroPowerKmh / 3.6;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (resid(mid) > 0) lo = mid;
    else hi = mid;
  }
  const topSpeedKmh = lo * 3.6;

  // Corner speed: v^2/R = a_lat(v), with a_lat = mu_eff(Fz) * Fz / m capped at maxLateralG.
  // g(v) = v^2/R - a_lat(v) is negative at v = 0 and positive for large v, so bisect.
  const cornerSpeedKmh = (radiusM: number): number => {
    const aCap = tyreModel.maxLateralG * G;
    const aLat = (v: number): number => {
      const fz = baseline.massKg * G + downforceN(v);
      return Math.min(aCap, (muEffective(fz) * fz) / baseline.massKg);
    };
    let a = 1;
    let b = 250;
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (a + b);
      if ((mid * mid) / radiusM - aLat(mid) < 0) a = mid;
      else b = mid;
    }
    return a * 3.6;
  };

  return {
    ClA,
    CdA,
    frontShare,
    downforceN,
    dragN,
    topSpeedKmh,
    cornerSpeedKmh,
    floorStalled,
    clamped,
  };
}

// ---------------------------------------------------------------------------------------------
// Circuits (GAME archetypes, total lengths near the real circuits they stand in for)
// ---------------------------------------------------------------------------------------------

/** radiusM null means a straight. */
export interface Segment {
  lengthM: number;
  radiusM: number | null;
}

export type CircuitId = "power" | "technical" | "balanced";

export interface Circuit {
  id: CircuitId;
  name: string;
  blurb: string;
  segments: readonly Segment[];
  /** Sum of segment lengths, m. */
  totalLengthM: number;
}

function makeCircuit(
  id: CircuitId,
  name: string,
  blurb: string,
  segments: readonly Segment[],
): Circuit {
  return { id, name, blurb, segments, totalLengthM: segments.reduce((s, x) => s + x.lengthM, 0) };
}

const S = (lengthM: number): Segment => ({ lengthM, radiusM: null });
const C = (lengthM: number, radiusM: number): Segment => ({ lengthM, radiusM });

export const circuits: Record<CircuitId, Circuit> = {
  // Monza-like, about 5.79 km: long straights, slow chicanes, a handful of fast bends.
  power: makeCircuit(
    "power",
    "Power circuit",
    "Long straights and slow chicanes, in the spirit of Monza. Low drag pays.",
    [
      S(1150), // start / finish straight
      C(90, 30), // first chicane, in
      C(80, 28), // first chicane, out
      C(430, 320), // Curva Grande
      S(150),
      C(90, 34), // Roggia chicane, in
      C(80, 30), // Roggia chicane, out
      S(250),
      C(150, 110), // Lesmo 1
      S(200),
      C(170, 85), // Lesmo 2
      S(730), // Serraglio straight
      C(90, 40), // Ascari, in
      C(80, 55), // Ascari, middle
      C(90, 45), // Ascari, out
      S(1090), // back straight
      C(500, 190), // Parabolica (long, tightening)
      S(373),
    ],
  ),
  // Monaco-like, about 3.34 km: slow, tight, no room for top speed. High downforce pays.
  technical: makeCircuit(
    "technical",
    "Technical circuit",
    "Tight and slow, in the spirit of Monaco. Every metre is a corner; downforce pays.",
    [
      S(350), // pit straight
      C(100, 18), // Sainte Devote
      S(460), // Beau Rivage climb
      C(140, 50), // Massenet
      C(110, 45), // Casino
      S(180),
      C(80, 22), // Mirabeau
      C(70, 12), // hairpin
      C(70, 24), // Portier
      S(600), // tunnel
      C(90, 30), // Nouvelle chicane, in
      C(70, 26), // Nouvelle chicane, out
      C(110, 45), // Tabac
      S(160),
      C(140, 50), // Swimming pool, in
      C(120, 40), // Swimming pool, out
      C(90, 20), // Rascasse
      C(70, 16), // Anthony Noghes
      S(327),
    ],
  ),
  // Silverstone-like, about 5.89 km: fast sweepers, two big straights, some slow bits.
  balanced: makeCircuit(
    "balanced",
    "Balanced circuit",
    "A mix of fast sweepers and straights, in the spirit of Silverstone. No single trick wins.",
    [
      S(420), // start straight
      C(180, 170), // Abbey
      C(110, 90), // Farm
      C(120, 60), // Village
      C(90, 40), // The Loop
      C(140, 140), // Aintree
      S(760), // Wellington straight
      C(130, 70), // Brooklands
      C(110, 45), // Luffield
      C(280, 200), // Woodcote
      S(320),
      C(310, 190), // Copse
      C(360, 240), // Maggotts
      C(140, 100), // Becketts
      C(130, 110), // Chapel
      S(900), // Hangar straight
      C(300, 130), // Stowe
      C(160, 55), // Vale
      C(150, 50), // Club
      S(781),
    ],
  ),
};

// ---------------------------------------------------------------------------------------------
// Lap time: quasi-steady point mass, three passes
// ---------------------------------------------------------------------------------------------

/**
 * GAME: how Straight Mode is used in the lap sim, following the 2026 rules. The wings open only on
 * straights long enough to be worth it, and close again for braking and corners. Every opening
 * costs a small fixed time while the flaps move and the car's balance settles. The rules allow a
 * transition of up to 600 ms; 0.1 s is the net loss assumed here.
 */
export const activeAero = {
  /** Straights shorter than this stay in Corner Mode. */
  minStraightM: 400,
  /** Seconds lost per Straight Mode activation. */
  switchPenaltyS: 0.1,
} as const;

export interface LapResult {
  seconds: number;
  topSpeedKmh: number;
  minCornerKmh: number;
  /** How many straights the wings opened on (0 in Corner Mode). */
  activations: number;
}

const STEP_M = 10;

/**
 * Rotate so the lap starts on a corner, then merge neighbouring straights. The lap is periodic, so
 * this changes nothing but lets a straight that crosses the start line count as one straight.
 */
function normalise(segments: readonly Segment[]): Segment[] {
  const first = segments.findIndex((s) => s.radiusM !== null);
  const rotated = first <= 0 ? [...segments] : [...segments.slice(first), ...segments.slice(0, first)];
  const out: Segment[] = [];
  for (const s of rotated) {
    const last = out[out.length - 1];
    if (last && last.radiusM === null && s.radiusM === null) {
      out[out.length - 1] = { lengthM: last.lengthM + s.lengthM, radiusM: null };
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

export function lapTime(setup: Setup, circuit: Circuit | readonly Segment[]): LapResult {
  const raw = Array.isArray(circuit) ? (circuit as readonly Segment[]) : (circuit as Circuit).segments;
  const segments = normalise(raw);

  // Corner Mode aero everywhere, plus Straight Mode aero on eligible straights when it is selected.
  const evCorner = evaluate({ ...setup, mode: "corner" });
  const evStraight = setup.mode === "straight" ? evaluate(setup) : evCorner;
  const eligible = (s: Segment): boolean =>
    setup.mode === "straight" && s.radiusM === null && s.lengthM >= activeAero.minStraightM;

  const cornerCache = new Map<number, number>();
  const cornerLimit = (r: number): number => {
    let v = cornerCache.get(r);
    if (v === undefined) {
      v = evCorner.cornerSpeedKmh(r) / 3.6;
      cornerCache.set(r, v);
    }
    return v;
  };

  // Pass 0: discretise the lap; set the speed limit and the aero in force at each point.
  const limit: number[] = [];
  const steps: number[] = []; // step length leaving each point
  const aero: Evaluation[] = [];
  let activations = 0;
  for (const seg of segments) {
    const count = Math.max(1, Math.round(seg.lengthM / STEP_M));
    const ds = seg.lengthM / count;
    const open = eligible(seg);
    if (open) activations++;
    const ev = open ? evStraight : evCorner;
    const vLim =
      seg.radiusM === null
        ? ev.topSpeedKmh / 3.6
        : Math.min(evCorner.topSpeedKmh / 3.6, cornerLimit(seg.radiusM));
    for (let i = 0; i < count; i++) {
      limit.push(vLim);
      steps.push(ds);
      aero.push(ev);
    }
  }
  const n = limit.length;
  const v = limit.slice();

  const mg = baseline.massKg * G;
  const accelAt = (i: number, speed: number): number => {
    const ev = aero[i];
    const fz = mg + ev.downforceN(speed);
    const traction = muEffective(fz) * fz * (1 - ev.frontShare);
    const drive = Math.min(powerW(speed) / Math.max(speed, 1), traction);
    const resist = ev.dragN(speed) + baseline.cRR * fz;
    return (drive - resist) / baseline.massKg;
  };
  // Braking always uses Corner Mode aero: the wings close as the driver lifts and brakes.
  const brakeAt = (speed: number): number => {
    const fz = mg + evCorner.downforceN(speed);
    const a = (muEffective(fz) * fz + evCorner.dragN(speed)) / baseline.massKg;
    return Math.min(tyreModel.maxBrakingG * G, a);
  };

  // Pass 1: forward acceleration limit. Two laps around so the flying lap wraps consistently.
  for (let k = 0; k < 2 * n; k++) {
    const i = k % n;
    const j = (i + 1) % n;
    const vNext = Math.sqrt(Math.max(0, v[i] * v[i] + 2 * accelAt(i, v[i]) * steps[i]));
    if (vNext < v[j]) v[j] = vNext;
  }
  // Pass 2: backward braking limit.
  for (let k = 0; k < 2 * n; k++) {
    const i = (2 * n - 1 - k) % n;
    const j = (i - 1 + n) % n;
    const vPrev = Math.sqrt(v[i] * v[i] + 2 * brakeAt(v[i]) * steps[j]);
    if (vPrev < v[j]) v[j] = vPrev;
  }

  let seconds = activations * activeAero.switchPenaltyS;
  let vMax = 0;
  let vMinCorner = Infinity;
  let idx = 0;
  for (const seg of segments) {
    const count = Math.max(1, Math.round(seg.lengthM / STEP_M));
    for (let i = 0; i < count; i++, idx++) {
      const a = v[idx];
      const b = v[(idx + 1) % n];
      seconds += steps[idx] / (0.5 * (a + b));
      if (a > vMax) vMax = a;
      if (seg.radiusM !== null && a < vMinCorner) vMinCorner = a;
    }
  }
  return {
    seconds,
    topSpeedKmh: vMax * 3.6,
    minCornerKmh: (Number.isFinite(vMinCorner) ? vMinCorner : vMax) * 3.6,
    activations,
  };
}

// ---------------------------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------------------------

export interface Score {
  /** Setup lap minus baseline lap, seconds. Negative is faster. */
  deltaSeconds: number;
  badges: string[];
}

export function score(setup: Setup, circuit: Circuit | readonly Segment[]): Score {
  const base = lapTime(baselineSetup, circuit);
  const now = lapTime(setup, circuit);
  const ev = evaluate(setup);
  const baseEv = evaluate(baselineSetup);
  const deltaSeconds = now.seconds - base.seconds;

  const badges: string[] = [];
  const dTop = now.topSpeedKmh - base.topSpeedKmh;
  const dCorner = now.minCornerKmh - base.minCornerKmh;
  if (deltaSeconds < -0.05) badges.push("Faster than baseline");
  else if (deltaSeconds > 0.05) badges.push("Slower than baseline");
  else badges.push("Within a few hundredths of baseline");
  if (dTop >= 3) badges.push("Slippery: higher top speed");
  if (dTop <= -3) badges.push("Draggy: lower top speed");
  if (dCorner >= 3) badges.push("Grippy: higher minimum corner speed");
  if (dCorner <= -3) badges.push("Loose: lower minimum corner speed");
  if (ev.frontShare >= 0.44) badges.push("Front-biased balance: oversteer risk");
  else if (ev.frontShare <= 0.36) badges.push("Rear-biased balance: understeer risk");
  else if (Math.abs(ev.frontShare - baseEv.frontShare) <= 0.02) badges.push("Balanced aero");
  if (ev.floorStalled) badges.push("Floor stalled: too low for this diffuser");
  if (ev.clamped) badges.push("Model limit reached");
  if (!setup.halo) badges.push("Halo off: not legal in real racing");
  return { deltaSeconds, badges };
}
