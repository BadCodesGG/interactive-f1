import type { CopyBook } from "../engine/explode/copy";

// Primary sources, all read for this file.
// FIA_SECTION_C: 2026 F1 Technical Regulations, Section C, issue 11 (26 Feb 2025). Later issues may
// have amended individual articles; every number below that comes from it is marked "2026:" where it
// differs from 2025.
const FIA_SECTION_C =
  "https://api.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss11_-_2025-02-26.pdf";
// FIA_PU: 2026 F1 Power Unit Technical Regulations, issue 6 (29 Mar 2024).
const FIA_PU =
  "https://www.fia.com/sites/default/files/fia_2026_formula_1_technical_regulations_pu_-_issue_6_-_2024-03-29.pdf";
const FIA_EXPLAINER =
  "https://www.fia.com/news/f1s-new-era-everything-you-need-know-about-how-fia-making-formula-1-more-competitive-more";
const F1_AERO =
  "https://www.formula1.com/en/latest/article/explained-2026-aerodynamic-regulations-fia-x-mode-z-mode-.26c1CtOzCmN3GfLMywrgb2";
const F1_PU =
  "https://www.formula1.com/en/latest/article/2026-regulations-explained-all-you-need-to-know-about-f1s-new-power-units.14jfv7a36905uDJDdNyfQd";
const F1_TERMS =
  "https://www.formula1.com/en/latest/article/explained-the-new-key-terms-for-formula-1s-new-for-2026-rules.3T5BU6TC9quGcIpGzoWkY0";
const MERCEDES_PU = "https://www.mercedesamgf1.com/facts-and-stats-power-unit-regulation-changes";
const RACETEQ_ENERGY = "https://www.raceteq.com/articles/2026/05/f1s-2026-energy-system-explained";
const RACETEQ_STRAIGHT =
  "https://www.raceteq.com/articles/2025/10/2026-straightline-mode-replacing-drs-simulations";
const RACEFANS_MODES =
  "https://www.racefans.net/2024/06/06/z-mode-and-x-mode-how-formula-1s-new-active-aero-will-work-in-2026/";
const RACEFANS_WAKE =
  "https://www.racefans.net/2025/11/21/why-the-fia-believes-its-2026-rules-will-significantly-improve-f1s-dirty-air-problem/";
const FIA_HALO = "https://www.fia.com/news/how-make-f1-halo";
const PIRELLI_2026 = "https://www.pirelli.com/global/en-ww/race/racingspot/formula-1/new-2026-f1-rules-187730/";
const PIRELLI_PRESS =
  "https://press.pirelli.com/pirelli-reveals-2026-f1-tyres-a-fresh-logo-design-and-new-compounds/";
const F1_RULES_2023 =
  "https://www.formula1.com/en/latest/article/from-cutting-curfews-to-grid-penalties-10-rule-changes-you-need-to-know.5EN5ENd23oOqFDnw8fD0rp";

export const f1Groups: Record<string, { label: string; blurb: string }> = {
  aero: {
    label: "Aerodynamics",
    blurb:
      "Front wing, rear wing and floor. Together they make the downforce that pins the car to the road, and in 2026 both wings move.",
  },
  bodywork: {
    label: "Bodywork",
    blurb:
      "The body shell (survival cell, sidepods, engine cover and halo, drawn as one piece), the cockpit, the mirrors and the onboard cameras. They hold the car together, shape the airflow between the wings and the floor, and keep everything cool.",
  },
  safety: {
    label: "Safety",
    blurb: "The rain light, so the car can be seen in spray. The halo, which guards the driver's head, is drawn with the bodywork.",
  },
  suspension: {
    label: "Suspension",
    blurb:
      "Wishbones, pushrods and dampers that connect the wheels to the car and keep the aero platform at the right height.",
  },
  wheels: {
    label: "Wheels and tyres",
    blurb: "Four narrower, lighter 2026 tyres on magnesium rims. They are the car's only contact with the track.",
  },
  powerUnit: {
    label: "Power unit",
    blurb:
      "A 1.6 litre V6 turbo engine plus a 350 kW electric motor, with no MGU-H. Peak power is split roughly half and half between the two.",
  },
  drivetrain: {
    label: "Drivetrain",
    blurb: "The eight-speed gearbox that carries engine and electric torque to the rear wheels.",
  },
  fuel: {
    label: "Fuel system",
    blurb: "A single rubber safety bladder inside the survival cell, filled with advanced sustainable fuel.",
  },
  exhaust: {
    label: "Exhaust",
    blurb: "The pipework that carries hot gas through the turbo and out of a single tailpipe.",
  },
};

export const f1Copy: CopyBook = {
  // ---------------------------------------------------------------------------------- aero
  "front-wing": {
    id: "front-wing",
    label: "Front wing",
    group: "aero",
    summary:
      "The first part of the car to meet the air, it sets the front downforce and steers the flow around the wheels and under the floor.",
    function:
      "Its two flap elements are active: they switch between a Corner Mode and a Straight Mode position to cut drag on the straights. The primary flap may move by up to 30 mm and the secondary by up to 60 mm, and the whole change must finish within 600 ms. 2026: the wing is 100 mm narrower than in 2025.",
    whyItMatters:
      "It decides how hard the front tyres bite in slow corners, so it sets turn-in and balance: too little and the car understeers, too much and it costs top speed. It moves at all because the FIA found that a moving rear wing alone shifted the car's balance too much between modes.",
    funFact:
      "The active flap is built to fail safe: if its actuator dies, the wing returns to its Corner Mode position.",
    stats: [
      { label: "2026 width change", value: "100 mm narrower than 2025" },
      { label: "Active flap elements", value: "2" },
      { label: "Max transition time", value: "600 ms" },
      { label: "Straight Mode drag cut (whole car, CFD study)", value: "about 18%" },
    ],
    sources: [FIA_SECTION_C, RACEFANS_MODES],
  },
  "rear-wing": {
    id: "rear-wing",
    label: "Rear wing",
    group: "aero",
    summary: "The rear wing balances the front wing, and its flap opens in Straight Mode to shed drag.",
    function:
      "It has three elements, and for 2026 the lower beam wing is removed and the endplates are simpler. One flap moves between two fixed positions, driven by a single actuator, in no more than 600 ms. The wings snap back to Corner Mode when the driver brakes or lifts off.",
    whyItMatters:
      "A steeper rear wing angle means more corner grip and more drag on the straights, which is the central trade-off in this wind tunnel. Its wake is also what a following car drives through: the FIA is targeting about 90% of downforce retained 20 m behind another car, against roughly 70% today.",
    funFact:
      "Apart from a failure or the 600 ms transition, the rear flap is only ever allowed to sit in one of two positions.",
    stats: [
      { label: "Elements", value: "3" },
      { label: "Straight Mode change (whole car, CFD study)", value: "drag about -18%, downforce about -25%" },
      { label: "This tool: +5 degrees of rear wing", value: "+0.15 ClA, +0.05 CdA (game model)" },
      { label: "Max transition time", value: "600 ms" },
    ],
    sources: [RACETEQ_STRAIGHT, FIA_SECTION_C],
  },
  floor: {
    id: "floor",
    label: "Floor and diffuser",
    group: "aero",
    summary:
      "The floor is the car's biggest single source of downforce, working as an underbody that sucks the car towards the track.",
    function:
      "Air is accelerated under the car and expanded through the diffuser at the rear, which drops the pressure beneath the car. 2026: the floor is 150 mm narrower, only partially flat, and its diffuser is less powerful than in 2022 to 2025. A plank fitted under it must sit on the reference plane, so no air can pass between the plank and the floor.",
    whyItMatters:
      "Because the floor makes the largest share of downforce, ride height and floor design move lap time more than any wing. Weakening it is also how the FIA cuts the car's reliance on ultra-stiff, ultra-low set-ups and its sensitivity to the wake of the car ahead.",
    funFact:
      "The wear skids screwed to the plank are machined from solid titanium, and their wear is checked after the race to stop teams running too low.",
    stats: [
      { label: "2026 floor width", value: "150 mm narrower than 2025" },
      { label: "Floor share of downforce (game model)", value: "45%" },
      { label: "Ride-height sensitivity (game model)", value: "about 3% of floor downforce per mm" },
      { label: "Reference skid thickness (front position)", value: "9 to 10 mm" },
    ],
    sources: [FIA_EXPLAINER, F1_AERO],
  },
  // ------------------------------------------------------------------------------- bodywork
  chassis: {
    id: "chassis",
    label: "Chassis (survival cell)",
    group: "bodywork",
    summary:
      "The carbon-fibre survival cell is the structural core that holds the driver, the fuel and every other part together.",
    function:
      "It carries the driver, the fuel bladder, the suspension and the power unit, and it must pass FIA static and impact tests. 2026: the car is shorter and narrower, with a wheelbase of at most 3,400 mm (200 mm less) and no part more than 950 mm from the centreline, so 1,900 mm wide (100 mm less). Minimum mass is 724 kg plus the nominal tyre mass, about 770 kg in all.",
    whyItMatters:
      "A smaller, lighter car is more agile and easier to race closely, and every kilo saved is ballast a team can move to tune balance. The cell is also why drivers walk away from big crashes, and the roll structure load was raised for 2026 from 16 G to 20 G.",
    funFact:
      "2026 cars gained lateral safety lights beside the cockpit that show marshals whether the hybrid system is safe to touch.",
    stats: [
      { label: "Wheelbase (2026)", value: "3,400 mm max (2025: 3,600 mm)" },
      { label: "Width (2026)", value: "1,900 mm (2025: 2,000 mm)" },
      { label: "Minimum mass (2026)", value: "724 kg plus tyres, about 770 kg" },
      { label: "Principal roll structure test load", value: "172 kN" },
    ],
    sources: [FIA_SECTION_C, FIA_EXPLAINER],
  },
  "left-sidepod": {
    id: "left-sidepod",
    label: "Left sidepod",
    group: "bodywork",
    summary:
      "The left sidepod carries cooling air to the radiators and shapes the flow along the car's flank towards the diffuser.",
    function:
      "Its inlet feeds the radiator inside while its outer skin guides air past the rear wheel. 2026: the front wheel arches are removed and part of the wheel bodywork is mandated, with control boards on the sidepod managing the wake from the front tyre. Each mirror is tied to the car by an inner stay to the chassis and a rear stay to the sidepod.",
    whyItMatters:
      "The car now has to shed heat from an engine and a 350 kW electric system, so pod shape is a trade between drag and overheating. Get it wrong and you either give up lap time on every straight or run a power unit that derates in the heat.",
    funFact: "The left mirror's rear stay attaches to this pod.",
    stats: [
      { label: "Peak power to cool (2026)", value: "700+ kW total" },
      { label: "Car width (2026)", value: "1,900 mm" },
      { label: "Radiators in this model", value: "1 per sidepod" },
    ],
    sources: [F1_AERO, FIA_SECTION_C],
  },
  "right-sidepod": {
    id: "right-sidepod",
    label: "Right sidepod",
    group: "bodywork",
    summary:
      "The right sidepod mirrors the left: it ducts cooling air to its radiator and manages the flow between the front wheel and the rear wing.",
    function:
      "Air enters the front inlet, passes the radiator and leaves near the engine cover, while the outside surface keeps the flow attached along the car. 2026: the front wheel bodywork is partly mandated and the floor is 150 mm narrower, so the pod has less floor edge to work with. The pods must also stay inside the 1,900 mm width limit.",
    whyItMatters:
      "Pod shape shows up in both drag and in the wake the car leaves for the driver behind. The FIA rewrote the bodywork rules for 2026 specifically to make that wake less damaging.",
    funFact: "For 2026 the front wheel arches were removed entirely, one of the clearest visual differences from 2025.",
    stats: [
      { label: "Floor width (2026)", value: "150 mm narrower than 2025" },
      { label: "Car width (2026)", value: "1,900 mm" },
      { label: "Wake target (20 m behind)", value: "about 90% of downforce kept, from about 70%" },
    ],
    sources: [F1_AERO, RACEFANS_WAKE],
  },
  "engine-cover": {
    id: "engine-cover",
    label: "Engine cover and airbox",
    group: "bodywork",
    summary:
      "The engine cover streamlines the air over the power unit and takes in the engine's air through the airbox above the driver.",
    function:
      "All air entering the engine must come through at most two inlets in a single plane, and both must be visible from the front of the car. Below the cover sits a 1.6 litre V6 turbo engine that must weigh at least 130 kg. The cover then tapers towards the rear wing so the flow stays attached.",
    whyItMatters:
      "A tight, low cover means less drag and a cleaner rear wing, but every millimetre shaved risks starving the intake or overheating the electronics. It has to hide a bigger package than before, because the minimum power unit mass is 185 kg in 2026.",
    funFact: "Engine oil consumption is capped at 0.30 litres per 100 km in normal running.",
    stats: [
      { label: "Engine air inlets allowed", value: "2 max, in one plane" },
      { label: "Engine minimum mass", value: "130 kg" },
      { label: "Power unit minimum mass (2026)", value: "185 kg" },
      { label: "Oil consumption limit", value: "0.30 L per 100 km" },
    ],
    sources: [FIA_PU, FIA_SECTION_C],
  },
  mirrors: {
    id: "mirrors",
    label: "Mirrors",
    group: "bodywork",
    summary:
      "Two mirrors let the driver see behind, and their housings are shaped to cost as little drag as possible.",
    function:
      "Each reflective surface must fit a 200 mm by 50 mm rectangle and be angled 24 to 28 degrees at its inboard end, with no concave areas. The mirror is held by an inner stay to the chassis and a rear stay to the sidepod. Teams shape the housing and stays as small aero devices that feed air towards the sidepods and rear wing.",
    whyItMatters:
      "Mirrors are one of the few parts a team can freely shape inside a fixed volume, so a visibility rule doubles as an aero tuning surface. A design that fails the FIA's view check, where the driver must read letters on boards behind the car, cannot race.",
    funFact: "The reflective surface was widened from 150 mm to 200 mm in 2023 to improve what the driver can see.",
    stats: [
      { label: "Reflective surface", value: "200 mm x 50 mm" },
      { label: "Corner radius", value: "up to 10 mm" },
      { label: "Inboard edge angle", value: "24 to 28 degrees" },
      { label: "Minimum surface curvature radius", value: "400 mm" },
    ],
    sources: [FIA_SECTION_C, F1_RULES_2023],
  },
  // ---------------------------------------------------- the scanned car's body, cockpit, cameras, lights
  bodywork: {
    id: "bodywork",
    label: "Bodywork and halo",
    group: "bodywork",
    summary:
      "The carbon-fibre shell of the car: the survival cell around the driver, the sidepods along the flanks, the engine cover over the power unit and the halo above the cockpit, drawn here as one piece.",
    function:
      "The survival cell carries the driver, the fuel bladder, the suspension and the power unit, and must pass FIA static and impact tests. Sidepod inlets feed air to the radiators, and all air for the engine must enter through at most two inlets in a single plane, both visible from the front. The halo is bolted to the cell at three points. 2026: the front wheel arches are removed and part of the wheel bodywork is mandated; the car is at most 1,900 mm wide, on a wheelbase of at most 3,400 mm.",
    whyItMatters:
      "Most of the car's compromise lives here. Pod and cover shape trade drag against cooling for a power unit that now also makes up to 350 kW of electric power, and the same surfaces shape the wake the car behind has to drive through.",
    funFact:
      "2026 cars gained lateral safety lights beside the cockpit that show marshals whether the hybrid system is safe to touch.",
    stats: [
      { label: "Wheelbase (2026)", value: "3,400 mm max (2025: 3,600 mm)" },
      { label: "Width (2026)", value: "1,900 mm (2025: 2,000 mm)" },
      { label: "Minimum mass (2026)", value: "724 kg plus tyres, about 770 kg" },
      { label: "Engine air inlets allowed", value: "2 max, in one plane" },
    ],
    sources: [FIA_SECTION_C, FIA_EXPLAINER, F1_AERO],
  },
  cockpit: {
    id: "cockpit",
    label: "Cockpit: seat and steering wheel",
    group: "bodywork",
    summary:
      "The seat and the steering wheel are the driver's whole workplace, and both are designed to come away quickly so that a driver can be got out fast.",
    function:
      "The seat must come out of the car with the driver in it, held by no more than two fastenings that are clearly marked and can be undone without tools. The steering wheel has a quick release, worked by pulling a flange behind the wheel, and must sit at least 50 mm behind the front edge of the cockpit opening. Sitting normally, harnessed and in racing kit, the driver must be able to remove the wheel and get out within 7 seconds, and to refit the wheel in 12 seconds in total.",
    whyItMatters:
      "The rules are about rescue. Red, blue and yellow lights in the driver's line of sight carry track signals and conditions, and a light recessed into the top of the survival cell tells rescue crews how severe an accident was before they reach the car.",
    funFact: "Clutch control is limited to at most two paddles, and both must be mounted on the steering wheel.",
    stats: [
      { label: "Get out, wheel removed", value: "within 7 s" },
      { label: "Refit the wheel, total", value: "within 12 s" },
      { label: "Wheel behind the cockpit's front edge", value: "at least 50 mm" },
      { label: "Seat fastenings", value: "2 max, no tools" },
    ],
    sources: [FIA_SECTION_C],
  },
  cameras: {
    id: "cameras",
    label: "Onboard cameras",
    group: "bodywork",
    summary:
      "The rules set out six places where a camera can ride, so the onboard pictures come from the same spots on every car.",
    function:
      "Every car must carry a camera in positions 4 and 5 and a camera or a camera housing in positions 1 and 2. If the commercial rights holder asks, it must also carry a camera in the driver's helmet and one in position 6. Position 1 sits above the survival cell, ahead of the cockpit opening, and looks back at the driver; position 6 is inside the rear impact structure. A housing is a dummy supplied by the team.",
    whyItMatters:
      "A housing must match the camera it replaces in size, shape and mass, so the car has the same outline and the same weight whether or not the camera is fitted. A car that carries neither a helmet camera nor a position 6 camera must fit 0.35 kg of ballast instead.",
    funFact:
      "Position 5 gives a 360 degree view, so any shrouding or cutout around it may rise no higher than a set height, so as not to block the picture.",
    stats: [
      { label: "Camera positions", value: "6" },
      { label: "Always fitted", value: "positions 4 and 5 (camera), 1 and 2 (camera or housing)" },
      { label: "Fitted on request", value: "helmet camera, position 6" },
      { label: "Ballast with no helmet or position 6 camera", value: "0.35 kg" },
    ],
    sources: [FIA_SECTION_C],
  },
  // --------------------------------------------------------------------------------- safety
  halo: {
    id: "halo",
    label: "Halo",
    group: "safety",
    summary:
      "The halo is a titanium hoop over the cockpit that deflects debris and wheels away from the driver's head.",
    function:
      "It is made to FIA standard 8869-2018 from grade 5 titanium by an FIA-designated manufacturer, built from five welded parts and bolted to the survival cell at three points. The cell's mounting points are tested with a load of 140 kN, held for five seconds with no failure, once on the centreline and once from the side.",
    whyItMatters:
      "It is the reason crashes that were once fatal are now survived, and it is compulsory, so no team can leave it off. It costs a little aero (this tool's game model gives it about +1.8% drag and +0.8% downforce), but that is a price every car pays.",
    funFact: "The FIA says the finished halo can deflect a large suitcase travelling at 225 km/h.",
    stats: [
      { label: "Material", value: "Grade 5 titanium" },
      { label: "Mount test load", value: "140 kN centreline and 140 kN lateral, held 5 s" },
      { label: "Construction", value: "5 welded parts, 3 mounting points" },
      { label: "Aero effect (game model)", value: "+1.76% drag, +0.8% downforce" },
    ],
    sources: [FIA_HALO, FIA_SECTION_C],
  },
  "rain-light": {
    id: "rain-light",
    label: "Rain light",
    group: "safety",
    summary:
      "The light at the back of the car that makes it visible to the drivers behind it when spray cuts the view.",
    function:
      "Every car carries three rear lights, each from an FIA-designated manufacturer and clearly visible from behind. The first sits on the car's centreline; one more sits on each side, inside the bodywork. The driver can switch them on from the cockpit, and the dashboard master switch cuts them along with the ignition and the fuel pumps.",
    whyItMatters:
      "A wet track throws up spray that hides a car from the one following. A bright light on the centreline and two more on the sides give that driver something to see, which is why it is a safety part rather than an aero one.",
    funFact: "The two side lights may be curved in the plane of their lens, but with a radius of no less than 200 mm.",
    stats: [
      { label: "Rear lights", value: "3" },
      { label: "Centre light height", value: "295 to 305 mm (car coordinate Z)" },
      { label: "Side lights height", value: "500 to 870 mm (car coordinate Z)" },
      { label: "Master switch cuts", value: "ignition, fuel pumps and rear lights" },
    ],
    sources: [FIA_SECTION_C],
  },
  // ----------------------------------------------------------------------------- suspension
  "front-suspension": {
    id: "front-suspension",
    label: "Front suspension",
    group: "suspension",
    summary:
      "Front suspension holds the front wheels to the car, steers them, and keeps the front wing and floor at the right height.",
    function:
      "Wishbones link each wheel's upright to the survival cell, and a pushrod or pullrod works inboard springs and dampers so the wheel can move without the aero platform pitching. Each wheel has exactly one upright, and the load from every suspension member must pass through it. Steering and brake ducts hang off the same geometry.",
    whyItMatters:
      "Ride height controls how much downforce the floor makes, so a car that stays stable under braking and over kerbs gains lap time directly. With less ground effect in 2026 the cars do not need to run as stiff and low, which changes the balance between aero grip and mechanical grip.",
    funFact:
      "Up to three suspension members may be joined together before their load reaches the upright, but only one upright is allowed per wheel.",
    stats: [
      { label: "Ride-height range in this tool", value: "-3 mm to +12 mm from reference" },
      { label: "Floor downforce per extra mm (game model)", value: "about -3%" },
      { label: "Uprights per wheel", value: "1" },
      { label: "2026 tyre set mass change", value: "1.6 kg lighter than 2025" },
    ],
    sources: [FIA_SECTION_C, F1_AERO],
  },
  "rear-suspension": {
    id: "rear-suspension",
    label: "Rear suspension",
    group: "suspension",
    summary:
      "Rear suspension carries the drive loads and keeps the rear wing and diffuser steady while the car puts its power down.",
    function:
      "It attaches to the gearbox casing, and driveshafts pass the engine's and the MGU-K's torque through it to the rear wheels. 2026: the MGU-K supplies up to 350 kW, so the geometry must stay compliant under sudden torque as well as hold the car level. The wheelbase is capped at 3,400 mm, which puts the rear axle 200 mm closer than in 2025.",
    whyItMatters:
      "A rear end that stays planted on corner exit puts electric torque onto the road instead of into wheelspin. Rear ride height also sets the diffuser angle, so it doubles as a direct aero control.",
    funFact: "The rear impact structure is bolted to the gearbox casing, so the rear suspension and the crash structure share a mount.",
    stats: [
      { label: "Electric power to rear wheels (2026)", value: "up to 350 kW (2025: 120 kW)" },
      { label: "Peak total power (2026)", value: "700+ kW" },
      { label: "Rear tyre width (2026)", value: "375 mm (2025: 405 mm)" },
      { label: "Wheelbase (2026)", value: "3,400 mm max (2025: 3,600 mm)" },
    ],
    sources: [FIA_SECTION_C, F1_PU],
  },
  // ------------------------------------------------------------------------------- wheels
  "front-left-wheel": {
    id: "front-left-wheel",
    label: "Front left wheel",
    group: "wheels",
    summary:
      "The front left wheel steers the car and, with its tyre 25 mm narrower in 2026, throws a smaller wake at the floor and sidepod.",
    function:
      "A magnesium-alloy rim carries an 18-inch tyre and a brake disc no more than 34 mm thick. 2026: the front tyre is 280 mm wide (305 mm in 2025) and 15 mm smaller in diameter. The spinning front wheel is one of the largest sources of turbulent wake on the car, which is why the rules now mandate part of the wheel bodywork.",
    whyItMatters:
      "Narrower, lighter tyres cut mass and drag at each corner. Front tyre temperature and wear still decide how long a driver can push before the car starts to understeer.",
    funFact: "Pirelli dropped its softest compound, the C6, for 2026, so the range now runs from C1 to C5.",
    stats: [
      { label: "Front tyre width (2026)", value: "280 mm (2025: 305 mm)" },
      { label: "Front tyre diameter (2026)", value: "15 mm smaller than 2025" },
      { label: "Rim size", value: "18 inch" },
      { label: "Brake disc maximum thickness", value: "34 mm" },
    ],
    sources: [PIRELLI_PRESS, FIA_SECTION_C],
  },
  "front-right-wheel": {
    id: "front-right-wheel",
    label: "Front right wheel",
    group: "wheels",
    summary:
      "The front right wheel matches the left, and the pair between them decide how much grip the car has when it turns in.",
    function:
      "The rim is AZ70 or AZ80 magnesium alloy with a 462.6 mm tyre mounting diameter and a 496 mm overall width, and the rim must have no air passage between its inboard and outboard cavities. 2026: the front tyre is 25 mm narrower and the front wheel bodywork is partly fixed by the rules. The wheel nut must resist a 20 kN pull away from the car.",
    whyItMatters:
      "The sealed rim stops teams routing air through the wheel. Wheel and tyre are the only parts touching the track, so grip here is what every downforce gain is finally converted into.",
    funFact: "Four 2026 tyres together weigh 1.6 kg less than the 2025 set.",
    stats: [
      { label: "Rim material", value: "AZ70 or AZ80 magnesium alloy" },
      { label: "Rim tyre-mounting diameter", value: "462.6 mm" },
      { label: "Rim overall width", value: "496 mm" },
      { label: "Wheel nut axial load requirement", value: "20 kN" },
    ],
    sources: [FIA_SECTION_C, PIRELLI_2026],
  },
  "rear-left-wheel": {
    id: "rear-left-wheel",
    label: "Rear left wheel",
    group: "wheels",
    summary:
      "The rear left tyre is 30 mm narrower in 2026, and it has to put the engine's and the electric motor's torque onto the road.",
    function:
      "It turns on the same 18-inch magnesium-alloy rim design as the front, with a larger 401.3 mm lip external diameter at the rear. 2026: the rear tyre is 375 mm wide (405 mm in 2025) and 10 mm smaller in diameter. Its wake passes the diffuser and the rear wing, so its shape matters for both.",
    whyItMatters:
      "With up to 350 kW of electric power added to the engine's torque, rear grip on corner exit sets how much of that power can be used. Rear tyre degradation is what pushes drivers to pit.",
    funFact: "The rear tyre lost 30 mm of width, slightly more than the 25 mm taken from the front.",
    stats: [
      { label: "Rear tyre width (2026)", value: "375 mm (2025: 405 mm)" },
      { label: "Rear tyre diameter (2026)", value: "10 mm smaller than 2025" },
      { label: "Rim lip external diameter", value: "401.3 mm" },
      { label: "Electric power available (2026)", value: "350 kW" },
    ],
    sources: [PIRELLI_PRESS, FIA_SECTION_C],
  },
  "rear-right-wheel": {
    id: "rear-right-wheel",
    label: "Rear right wheel",
    group: "wheels",
    summary:
      "The rear right wheel shares the driving job with the left, and together they turn 700+ kW of peak power into acceleration.",
    function:
      "A driveshaft takes torque from the gearbox to this wheel through the hub, and the tyre must transmit it without spinning. 2026: the rear tyre is 30 mm narrower, so there is less rubber to hold that torque than on 2025 cars. Wheel and tyre diameter are both slightly smaller too.",
    whyItMatters:
      "The car that gets its electric deployment down first on corner exit arrives at the next braking zone faster. Lose rear grip and that battery energy is wasted as wheelspin.",
    funFact: "Wheel rims can carry only a shallow 1 mm deep engraving for branding, and it may only sit on the outer flange.",
    stats: [
      { label: "Rear tyre width (2026)", value: "375 mm" },
      { label: "Peak total power (2026)", value: "700+ kW" },
      { label: "Four-tyre set mass change", value: "1.6 kg lighter than 2025" },
      { label: "Rim size", value: "18 inch" },
    ],
    sources: [PIRELLI_2026, FIA_SECTION_C],
  },
  // ------------------------------------------------------------------------------ exhaust
  exhaust: {
    id: "exhaust",
    label: "Exhaust",
    group: "exhaust",
    summary:
      "The exhaust carries the engine's waste gas through the turbo and out of a single tailpipe at the back.",
    function:
      "All turbine exit gas and all wastegate gas must leave through one tailpipe, and the power unit may have at most two wastegates. The exhaust pipe wall must be at least 1.0 mm thick. 2026: with the MGU-H deleted, only exhaust flow spins the turbo.",
    whyItMatters:
      "Exhaust flow is what makes boost, so how cleanly it moves decides how quickly the engine responds when the driver picks up the throttle. Without an MGU-H to fill the gap, throttle response now leans on exhaust and turbo design.",
    funFact: "Exhaust gas may only leave the cylinder head through outlets outboard of the bore centreline, never from inside the V.",
    stats: [
      { label: "Tailpipes", value: "1" },
      { label: "Wastegates allowed", value: "2 max" },
      { label: "Pipe minimum wall thickness", value: "1.0 mm" },
      { label: "MGU-H (2026)", value: "none (2025: 75 kW)" },
    ],
    sources: [FIA_SECTION_C, FIA_PU],
  },
  // ------------------------------------------------------------------------- power unit
  "pu-ice": {
    id: "pu-ice",
    label: "Internal combustion engine",
    group: "powerUnit",
    summary:
      "A 1.6 litre V6 turbo engine that supplies about 400 kW in 2026, with the electric side making up the rest.",
    function:
      "Six cylinders sit in a 90 degree V, each with an 80 mm bore, two inlet and two exhaust valves, and a geometric compression ratio capped at 16.0. Fuel is limited by energy flow, 3,000 MJ/h, rather than by mass. 2026: engine output falls to about 400 kW from 550 to 560 kW.",
    whyItMatters:
      "Because the rules cap fuel energy rather than power, teams win by turning more of each megajoule into speed, which makes combustion efficiency a lap-time lever. The engine now supplies only about half of peak power, so the electric system has to keep pace with it.",
    funFact:
      "Below 10,500 rpm the fuel energy flow is capped by a formula of 0.27 MJ/h per rpm plus 165 MJ/h, so a slow-turning engine cannot be fed more than the curve allows.",
    stats: [
      { label: "Capacity and layout", value: "1.6 L, 90 degree V6" },
      { label: "Output (2026)", value: "about 400 kW (2025: 550 to 560 kW)" },
      { label: "Fuel energy flow limit", value: "3,000 MJ/h" },
      { label: "Engine minimum mass", value: "130 kg" },
    ],
    sources: [FIA_PU, FIA_EXPLAINER],
  },
  "pu-turbo": {
    id: "pu-turbo",
    label: "Turbocharger",
    group: "powerUnit",
    summary:
      "The turbocharger uses exhaust energy to force more air into the engine, and in 2026 it works without an MGU-H.",
    function:
      "Exhaust gas spins a turbine that drives a compressor, and the shaft may not exceed 150,000 rpm. The unit must weigh at least 12 kg, and engine intake pressure must stay below 4.8 bar absolute. 2026: the MGU-H that used to speed the turbo up and harvest energy from it is deleted.",
    whyItMatters:
      "Without a motor to keep the turbo spinning between corners, boost response is a fresh design problem for turbine and wastegate engineers, and it shows up as drivability on corner exit. Over-speeding the turbo ends a race, which is why a hard rpm ceiling exists.",
    funFact: "The 2025 MGU-H was rated at 75 kW, and its deletion moved all electric power to the MGU-K.",
    stats: [
      { label: "Maximum turbo speed", value: "150,000 rpm" },
      { label: "Turbo minimum mass", value: "12 kg" },
      { label: "Intake pressure limit", value: "4.8 bar absolute" },
      { label: "MGU-H (2026)", value: "none (2025: 75 kW)" },
    ],
    sources: [FIA_PU, MERCEDES_PU],
  },
  "pu-mgu-k": {
    id: "pu-mgu-k",
    label: "MGU-K",
    group: "powerUnit",
    summary:
      "The motor-generator on the crankshaft that harvests braking energy and delivers up to 350 kW to the rear wheels.",
    function:
      "It takes energy back under braking, on lift-off and at part throttle, and drives the car when the driver deploys. 2026: power is capped at 350 kW (120 kW in 2025), and harvesting is capped at 8.5 MJ per lap, plus 0.5 MJ with Overtake Mode (2 MJ in 2025). Deployment fades above 290 km/h and stops at 345 km/h, or at 355 km/h in override mode.",
    whyItMatters:
      "Peak power is now split roughly half electric, so energy management is a race in itself: where to harvest, where to spend. The FIA has cut recoverable energy in qualifying at some circuits, as low as 5 MJ at Monza, so a lap is planned around the battery as much as the engine.",
    funFact: "Lifting off the throttle to recharge closes the active aero, because lift-off regeneration switches the wings back to Corner Mode.",
    stats: [
      { label: "Maximum power (2026)", value: "350 kW (2025: 120 kW)" },
      { label: "Harvest per lap (2026)", value: "8.5 MJ, plus 0.5 MJ Overtake (2025: 2 MJ)" },
      { label: "Deployment fade", value: "starts 290 km/h, zero at 345 km/h" },
      { label: "Electric share of peak power", value: "about 50% (2025: about 20%)" },
    ],
    sources: [FIA_PU, RACETEQ_ENERGY],
  },
  "pu-energy-store": {
    id: "pu-energy-store",
    label: "Energy store (battery)",
    group: "powerUnit",
    summary:
      "The battery that stores harvested energy, limited to a 4 MJ swing so it stays small and safe.",
    function:
      "The difference between its highest and lowest state of charge may not exceed 4 MJ while the car is on track, and the main enclosure must weigh at least 35 kg. Energy flows in and out at up to 350 kW. That makes a full 4 MJ burst worth about 11.5 seconds of full MGU-K power.",
    whyItMatters:
      "A 4 MJ window is small, so the battery empties in seconds at full deploy and the driver must choose where to spend it. Its mass and cooling are part of why the 2026 power unit has a 185 kg minimum, up from 151 kg.",
    funFact: "A lap may harvest 8.5 MJ, more than twice the battery's 4 MJ swing, so energy is spent again while it is still coming in.",
    stats: [
      { label: "State-of-charge swing limit", value: "4 MJ" },
      { label: "Enclosure minimum mass", value: "35 kg" },
      { label: "Charge and discharge power", value: "350 kW max" },
      { label: "Full-power burst from 4 MJ", value: "about 11.5 s" },
    ],
    sources: [FIA_PU, RACETEQ_ENERGY],
  },
  "pu-control-electronics": {
    id: "pu-control-electronics",
    label: "Control electronics",
    group: "powerUnit",
    summary:
      "The inverter and control unit that turns the battery's direct current into MGU-K power and decides when to harvest or deploy.",
    function:
      "The control unit for the MGU-K sits on the high-voltage bus between the energy store and the motor-generator. Most recharging runs automatically from engine-control maps, and only lift-off regeneration needs driver input. Sensors on the bus let the FIA check each lap's energy against the limits.",
    whyItMatters:
      "Software here shapes every lap's energy plan, so two cars with the same hardware can be tenths apart. Strict per-lap energy rules mean the electronics have to prove they never exceed the limit.",
    funFact: "Overtake Mode is armed when a car is within one second of the car ahead at the detection point, and it unlocks 0.5 MJ of extra energy.",
    stats: [
      { label: "Maximum DC power", value: "350 kW" },
      { label: "Harvest limit per lap", value: "8.5 MJ (+0.5 MJ Overtake)" },
      { label: "Overtake detection gap", value: "1.0 s" },
      { label: "Overtake extra energy", value: "0.5 MJ" },
    ],
    sources: [FIA_PU, F1_TERMS],
  },
  "pu-radiator-left": {
    id: "pu-radiator-left",
    label: "Left radiator",
    group: "powerUnit",
    summary: "The left radiator rejects heat from the engine and electrical system into the air from the left sidepod inlet.",
    function:
      "Its core and header tanks must be aluminium alloy and cannot be 3D printed. Tube walls must be at least 0.18 mm thick, and fins between the tubes at least 0.05 mm. Cooling may not rely on evaporating any liquid to carry heat away.",
    whyItMatters:
      "Radiator size sets sidepod size, and sidepod size sets drag and wake, so cooling is an aero problem. Too small and the power unit derates on a hot day, too large and it costs time on every straight.",
    funFact: "The tube walls in a regulation radiator can be as thin as 0.18 mm, about twice the thickness of a sheet of copier paper.",
    stats: [
      { label: "Tube minimum wall thickness", value: "0.18 mm" },
      { label: "Fin minimum thickness (between tubes)", value: "0.05 mm" },
      { label: "Core material", value: "aluminium alloy, not additive manufactured" },
      { label: "Peak power to cool (2026)", value: "700+ kW total" },
    ],
    sources: [FIA_SECTION_C, MERCEDES_PU],
  },
  "pu-radiator-right": {
    id: "pu-radiator-right",
    label: "Right radiator",
    group: "powerUnit",
    summary:
      "The right radiator matches the left, and between them they keep the engine, battery and electronics inside their working temperatures.",
    function:
      "Air from the right sidepod inlet passes through aluminium heat-exchanger tubes and fins, and the warm exhaust air leaves towards the engine cover and rear wing area. Tube cross-section must be at least 10 mm2. Fluid lines carrying coolant or oil may not pass through the cockpit.",
    whyItMatters:
      "The 2026 car must cool a 350 kW electric system as well as the engine, so the cooling package cannot shrink with the car. That is a large part of why the sidepods stay bulky next to a narrower floor.",
    funFact: "No line carrying coolant or lubricating oil is allowed to run through the cockpit.",
    stats: [
      { label: "Tube minimum cross-section", value: "10 mm2" },
      { label: "Tube minimum wall thickness", value: "0.18 mm" },
      { label: "Header tank relief valve", value: "3.75 bar max" },
      { label: "Peak power to cool (2026)", value: "700+ kW total" },
    ],
    sources: [FIA_SECTION_C, FIA_PU],
  },
  "pu-intercooler": {
    id: "pu-intercooler",
    label: "Intercooler (charge air cooler)",
    group: "powerUnit",
    summary:
      "The charge air cooler chills the air after the turbo compresses it, so the engine gets denser air.",
    function:
      "Compressing air heats it and hot air is less dense, so the intercooler removes that heat before the air reaches the cylinders. Intake air pressure must stay below 4.8 bar absolute, measured by two FIA-sealed sensors downstream of the cooler. Cooling of the intake air, like the rest of the power unit, may not rely on evaporating a fluid.",
    whyItMatters:
      "Cooler air is denser, so every degree removed gives the engine more oxygen to burn with the same fuel energy allowance. It also sets how far the pressure ceiling can be pushed without knock.",
    funFact: "Exhaust gas recirculation is forbidden, so only fresh air, cooled by this unit, reaches the cylinders.",
    stats: [
      { label: "Intake pressure limit", value: "4.8 bar absolute" },
      { label: "Pressure sensors downstream", value: "2 FIA-sealed" },
      { label: "Fuel energy flow limit", value: "3,000 MJ/h" },
      { label: "Evaporative cooling", value: "not allowed" },
    ],
    sources: [FIA_SECTION_C, FIA_PU],
  },
  // ------------------------------------------------------------------------------ drivetrain
  "pu-gearbox": {
    id: "pu-gearbox",
    label: "Gearbox",
    group: "drivetrain",
    summary:
      "An eight-speed sequential gearbox at the back of the car that delivers engine and MGU-K torque to the rear wheels.",
    function:
      "The rules fix the number of forward ratios at 8, ban continuously variable transmissions, and require every car to be able to reverse. Teams nominate their ratios before the first race, and in 2026 only, they may change the set once during the season. The casing is a structural member, with the rear suspension and rear impact structure attached to it.",
    whyItMatters:
      "Ratios set where the engine and electric motor sit in their power band, and a bad choice for a circuit costs top speed or acceleration. Because the ratio set is nominated in advance and barely changes, the gearbox is a season-long compromise rather than a quick fix.",
    funFact: "The 2026 rules allow one ratio-set change during the season, an exception that applies to 2026 only.",
    stats: [
      { label: "Forward gears", value: "8" },
      { label: "Reverse gear", value: "1 (mandatory)" },
      { label: "Ratio-set changes allowed in 2026", value: "1 per season" },
      { label: "Continuously variable transmission", value: "not allowed" },
    ],
    sources: [FIA_SECTION_C],
  },
  // -------------------------------------------------------------------------------- fuel
  "pu-fuel-cell": {
    id: "pu-fuel-cell",
    label: "Fuel cell (fuel tank)",
    group: "fuel",
    summary:
      "The fuel cell is a single rubber safety bladder inside the survival cell, holding the car's advanced sustainable fuel.",
    function:
      "It must be a single rubber bladder that meets FIA standard FT5-1999, and all fuel must sit ahead of the power unit and inboard of 450 mm from the centreline. A fuel flow meter sits wholly inside the tank, and only 0.25 litres of fuel may be kept outside the survival cell. 2026: all cars run advanced sustainable fuel.",
    whyItMatters:
      "A crash-safe bladder is what stops a broken car from becoming a fire, and the flow meter is how the FIA polices the fuel energy limit. The fuel itself is one of the most visible sustainability changes in the 2026 rules.",
    funFact: "No fuel bladder may be used more than five years after the date it was made.",
    stats: [
      { label: "Tank standard", value: "FIA FT5-1999 rubber bladder" },
      { label: "Fuel must sit inboard of", value: "450 mm from centreline" },
      { label: "Fuel allowed outside survival cell", value: "0.25 L max" },
      { label: "Fuel energy flow limit", value: "3,000 MJ/h" },
    ],
    sources: [FIA_SECTION_C, FIA_EXPLAINER],
  },
};

/** The export name check:sidecar expects. */
export { f1Copy as copyBook };
