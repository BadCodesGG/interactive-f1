import type { CopyBook } from "../engine/explode/copy";

// Every number below was read for this file from the FIA 2022 Formula 1 Technical Regulations, issue 13
// (16 Aug 2022), or, where a 2026 figure is set beside it, from the FIA's own 2026 explainer. The article
// numbers are given so that each can be checked. A figure this file could not find in either is left out.
// No runtime imports: scripts/check-sidecar.mjs loads this file straight from Node.
const FIA_2022 = "https://www.fia.com/sites/default/files/fia_2022_formula_1_technical_regulations_-_issue_13_-_2022-08-16.pdf";
const FIA_EXPLAINER =
  "https://www.fia.com/news/f1s-new-era-everything-you-need-know-about-how-fia-making-formula-1-more-competitive-more";

export const f222Groups: Record<string, { label: string; blurb: string }> = {
  aero: {
    label: "Aerodynamics",
    blurb: "Front wing, rear wing and floor. The 2022 car makes most of its downforce with the floor, and only one flap, on the rear wing, moves in a race.",
  },
  bodywork: {
    label: "Bodywork",
    blurb: "The body shell (survival cell, sidepods, engine cover and halo, drawn as one piece), the cockpit, the mirrors and the onboard cameras.",
  },
  safety: {
    label: "Safety",
    blurb: "The rain light, so the car can be seen in spray. The halo, which guards the driver's head, is drawn with the bodywork.",
  },
  suspension: {
    label: "Suspension",
    blurb: "Six members connect each wheel's upright to the car, under fairings that shape the air round them.",
  },
  wheels: {
    label: "Wheels and tyres",
    blurb: "Four 18-inch wheels, each with a cover that seals the rim to the air.",
  },
  exhaust: {
    label: "Exhaust",
    blurb: "The pipework that carries hot gas through the turbo and out of a single tailpipe.",
  },
};

export const copyBook: CopyBook = {
  "front-wing": {
    id: "front-wing",
    label: "Front wing",
    group: "aero",
    summary: "The first part of the car to meet the air. On the 2022 car it sets the front downforce and steers the flow round the front wheels.",
    function:
      "In any cross section the wing may have up to four closed sections, or flaps. The rearmost flap, or the two rearmost, can be adjusted to trim the wing's load, but only with the car stationary and with a tool, and only to add incidence, by no more than 35 mm at any point. In motion it does not move (article 3.9).",
    whyItMatters:
      "A team sets the wing's angle in the garage to balance the car for a circuit, then lives with it for the session. That is the difference from 2026, when the front flap itself moves between Corner Mode and Straight Mode.",
    funFact: "The rearmost point of every flap must be visible when the wing is seen from below.",
    stats: [
      { label: "Closed sections in any cross section", value: "4 max" },
      { label: "Adjustment of the rear flaps", value: "car stationary, with a tool" },
      { label: "Largest change of a flap", value: "35 mm, more incidence only" },
      { label: "Gap between neighbouring flaps", value: "5 to 15 mm at the closest" },
    ],
    sources: [FIA_2022, FIA_EXPLAINER],
  },
  "rear-wing": {
    id: "rear-wing",
    label: "Rear wing and DRS flap",
    group: "aero",
    summary: "A two-element wing with a flap the driver can open on a straight to cut drag.",
    function:
      "In any cross section the wing has exactly two sections, a main plane and a smaller rear flap, 10 to 15 mm apart at the closest. That flap, with its gurney, may rotate about a fixed axis while the car is moving: the Drag Reduction System, or DRS. Opening it may be commanded only by direct driver input, and if the system fails the flap returns to its normal high-incidence position (articles 3.10.1 and 3.10.10).",
    whyItMatters:
      "It is the 2022 car's only moving aero: one flap, used when the driver is allowed to. In 2026 DRS is gone and both the front and the rear wing move, in Corner Mode and Straight Mode.",
    funFact: "With the flap open, the gap between the two sections must still be no more than 85 mm: a gauge of that diameter may not pass through it.",
    stats: [
      { label: "Sections in any cross section", value: "2" },
      { label: "Flap moved by", value: "direct driver input only" },
      { label: "Gap with the flap open", value: "10 to 85 mm" },
      { label: "If the system fails", value: "flap returns to high incidence" },
    ],
    sources: [FIA_2022, FIA_EXPLAINER],
  },
  floor: {
    id: "floor",
    label: "Floor and diffuser",
    group: "aero",
    summary: "The floor is the 2022 car's biggest source of downforce: it works as an underbody that sucks the car towards the track.",
    function:
      "Air is accelerated under the car and expanded through the diffuser at the rear, which drops the pressure beneath the car. Up to four floor fences may stand on each side of the car, and a floor edge wing, a single volume with no apertures, sits along the floor's outer edge (articles 3.5.1 to 3.5.3).",
    whyItMatters:
      "Because the floor, more than the wings, makes the grip, ride height moves the lap time more than any wing setting. The 2026 floor is 150 mm narrower and its diffuser less powerful, which is how the FIA means to cut the car's reliance on it.",
    funFact: "The floor edge wing's cross section may be no larger than 2000 mm2.",
    stats: [
      { label: "Floor fences on each side", value: "4 max" },
      { label: "Floor edge wing cross section", value: "2000 mm2 max" },
      { label: "2026 floor width", value: "150 mm narrower" },
    ],
    sources: [FIA_2022, FIA_EXPLAINER],
  },
  bodywork: {
    id: "bodywork",
    label: "Bodywork and halo",
    group: "bodywork",
    summary: "The 2022 car's shell: the survival cell around the driver, the sidepods, the engine cover and the halo, drawn here as one piece.",
    function:
      "No part of the car may lie more than 1,000 mm from its centre line (tyres, wheel rims and wheel covers apart), so it is at most 2,000 mm wide, and the wheelbase may not exceed 3,600 mm. The halo is not part of the survival cell: it is made to FIA standard 8869-2018 by an FIA-designated manufacturer (articles 3.4 and 12.4.2).",
    whyItMatters:
      "The car, without fuel, may not weigh less than 798 kg. The 2026 car is shorter by 200 mm, narrower by 100 mm and about 30 kg lighter, so this is the larger and heavier of the two.",
    funFact: "The FIA takes steps to keep the halos of its different designated manufacturers at a similar mass.",
    stats: [
      { label: "Width", value: "2,000 mm (2026: 1,900 mm)" },
      { label: "Wheelbase", value: "3,600 mm max (2026: 3,400 mm)" },
      { label: "Minimum mass, without fuel", value: "798 kg (2026: 724 kg plus tyres, about 770 kg)" },
      { label: "Halo standard", value: "FIA 8869-2018" },
    ],
    sources: [FIA_2022, FIA_EXPLAINER],
  },
  cockpit: {
    id: "cockpit",
    label: "Cockpit: seat and steering wheel",
    group: "bodywork",
    summary: "The seat and the steering wheel are the driver's whole workplace, and the wheel is designed to come away quickly so that a driver can get out fast.",
    function:
      "The steering wheel has a quick release, worked by pulling a flange behind the wheel, and must sit at least 50 mm behind the front edge of the cockpit opening. Sitting normally, harnessed and in racing kit, the driver must be able to remove the wheel and get out within 7 seconds, and to refit the wheel in 12 seconds in total (article 12.5).",
    whyItMatters:
      "The rule is about rescue: a driver who can get out fast is a driver a crew can reach. Three areas of padding cushion the head, and they must come out of the car as a single part.",
    funFact: "The cockpit rule has not changed for 2026: the same 7 and 12 seconds apply.",
    stats: [
      { label: "Get out, wheel removed", value: "within 7 s" },
      { label: "Refit the wheel, total", value: "within 12 s" },
      { label: "Wheel behind the cockpit's front edge", value: "at least 50 mm" },
      { label: "Head padding", value: "3 areas, removable as one part" },
    ],
    sources: [FIA_2022],
  },
  mirrors: {
    id: "mirrors",
    label: "Mirrors",
    group: "bodywork",
    summary: "Two mirrors let the driver see behind and to both sides, and their housings are shaped to cost as little drag as possible.",
    function:
      "Each reflective surface must be a rectangle 150 mm wide and 50 mm high (+2 mm, -0), with corners rounded to no more than 10 mm radius, and inside a volume the rules define. The housing is tied to the car by an inner stay to the chassis and, if fitted, a rear stay to the sidepod (articles 3.6.4 and 14.2).",
    whyItMatters:
      "A mirror housing is one of the few parts a team can shape freely inside a fixed volume, so a rule about visibility is also a rule about aero. The reflective surface was widened from 150 mm to 200 mm for 2023.",
    funFact: "A curved mirror is allowed if it can project onto the same rectangle and its radius of curvature is greater than 200 mm everywhere.",
    stats: [
      { label: "Reflective surface", value: "150 mm x 50 mm (+2 mm, -0)" },
      { label: "Corner radius", value: "10 mm max" },
      { label: "Curved mirror", value: "radius over 200 mm" },
      { label: "Mirrors", value: "2, symmetric" },
    ],
    sources: [FIA_2022],
  },
  cameras: {
    id: "cameras",
    label: "Onboard cameras",
    group: "bodywork",
    summary: "The rules set out six places where a camera can ride, so the onboard pictures come from the same spots on every car.",
    function:
      "Every car must carry a camera in positions 4 and 5, and a camera or a camera housing in positions 1, 2 (both sides) and 3. Position 1 sits above the survival cell, ahead of the cockpit opening, and looks back at the driver. A housing is a dummy supplied by the team (article 8.17).",
    whyItMatters:
      "A housing must match the camera it replaces in size, shape and mass, so the car has the same outline and the same weight whether or not the camera is fitted.",
    funFact: "Contrasting markers must be painted on the rear wing so that the onboard cameras can show how the DRS flap is behaving.",
    stats: [
      { label: "Camera positions", value: "6" },
      { label: "Always a camera", value: "positions 4 and 5" },
      { label: "Camera or housing", value: "positions 1, 2 (both sides) and 3" },
      { label: "Rear wing markers", value: "required, for onboard monitoring" },
    ],
    sources: [FIA_2022],
  },
  "front-suspension": {
    id: "front-suspension",
    label: "Front suspension",
    group: "suspension",
    summary: "Front suspension holds the front wheels to the car, steers them, and keeps the front wing and floor at the right height.",
    function:
      "Six suspension members connect each upright to the sprung mass, and redundant members are not allowed. On the front axle one member per wheel is connected to the steering. Fairings must cover every member that is not of circular cross section (articles 10.3 and 3.14).",
    whyItMatters:
      "Ride height controls how much downforce the floor makes, so a car that stays stable under braking and over kerbs gains lap time directly. The fairings turn a structural part into an aerodynamic one.",
    funFact: "Suspension members must have a constant cross section over their whole length.",
    stats: [
      { label: "Members per upright", value: "6" },
      { label: "Redundant members", value: "not permitted" },
      { label: "Member connected to the steering, per front wheel", value: "1" },
    ],
    sources: [FIA_2022],
  },
  "rear-suspension": {
    id: "rear-suspension",
    label: "Rear suspension",
    group: "suspension",
    summary: "Rear suspension carries the drive loads and keeps the rear wing and diffuser steady while the car puts its power down.",
    function:
      "Like the front, it joins each upright to the sprung mass with six members under fairings. Driveshafts pass the power unit's torque through it to the rear wheels. The wheelbase is capped at 3,600 mm, 200 mm more than in 2026 (articles 10.3, 3.14 and 3.4.2).",
    whyItMatters:
      "A rear end that stays planted on corner exit puts torque onto the road instead of into wheelspin, and rear ride height also sets the diffuser angle, so it doubles as an aero control.",
    funFact: "Every tether on a wheel must be fixed separately at both ends, and no suspension member may carry more than two of them.",
    stats: [
      { label: "Members per upright", value: "6" },
      { label: "Wheelbase", value: "3,600 mm max (2026: 3,400 mm)" },
      { label: "Tethers per wheel", value: "3" },
    ],
    sources: [FIA_2022, FIA_EXPLAINER],
  },
  "front-left-wheel": {
    id: "front-left-wheel",
    label: "Front left wheel",
    group: "wheels",
    summary: "The front left wheel steers the car, and its cover keeps the air from flowing through the rim.",
    function:
      "A single wheel cover per wheel is fixed to the rim so that it turns with it and seals against it, and its outer surface is made to a shape the FIA defines. The covers are standard supply components. The front rim's tyre-mounting width is 335.3 mm (+/-0.5 mm) (articles 3.13.7 and 10.7.2).",
    whyItMatters:
      "A spinning wheel is one of the largest sources of turbulence on the car. A sealed, standard cover stops teams using the rim as an aero part.",
    funFact: "Dry-weather tyres may not exceed 725 mm in diameter.",
    stats: [
      { label: "Wheel covers", value: "1 per wheel, standard supply" },
      { label: "Front rim tyre-mounting width", value: "335.3 mm (+/-0.5 mm)" },
      { label: "Rim outer lip diameter", value: "490.6 mm (+/-1 mm)" },
      { label: "Dry tyre diameter", value: "725 mm max" },
    ],
    sources: [FIA_2022],
  },
  "front-right-wheel": {
    id: "front-right-wheel",
    label: "Front right wheel",
    group: "wheels",
    summary: "The front right wheel matches the left, and the pair between them decide how much grip the car has when it turns in.",
    function:
      "Only a short list of parts may be fixed to a wheel besides its tyre: surface treatments, the valve, fasteners, balance weights, drive pegs, standard pressure and temperature sensors, the wheel cover and identical spacers on the inner face (article 10.7.3).",
    whyItMatters:
      "The wheel and tyre are the only parts touching the track, so grip here is what every downforce gain is finally turned into.",
    funFact: "Each wheel carries three tethers, each with an energy absorption of at least 7 kJ, so a wheel that comes off the car stays attached to it.",
    stats: [
      { label: "Tethers per wheel", value: "3, each 7 kJ or more" },
      { label: "Tether standard", value: "FIA 8864-2013" },
      { label: "Rim outer lip diameter", value: "490.6 mm (+/-1 mm)" },
    ],
    sources: [FIA_2022],
  },
  "rear-left-wheel": {
    id: "rear-left-wheel",
    label: "Rear left wheel",
    group: "wheels",
    summary: "The rear left wheel has to put the power unit's torque onto the road, and its rim is wider than the front's.",
    function:
      "The rear rim's tyre-mounting width is 429.3 mm (+/-0.5 mm), against 335.3 mm at the front, on the same 490.6 mm outer lip diameter. Its cover seals the rim like the front's, and its wake passes the diffuser and the rear wing (articles 10.7.2 and 3.13.7).",
    whyItMatters:
      "Rear grip on corner exit sets how much of the power unit's output can be used, and rear tyre wear is what pushes drivers to pit.",
    funFact: "The rim's outer lip diameter is the same, 490.6 mm, at the front and at the rear.",
    stats: [
      { label: "Rear rim tyre-mounting width", value: "429.3 mm (+/-0.5 mm)" },
      { label: "Front rim tyre-mounting width", value: "335.3 mm (+/-0.5 mm)" },
      { label: "Rim outer lip diameter", value: "490.6 mm (+/-1 mm)" },
    ],
    sources: [FIA_2022],
  },
  "rear-right-wheel": {
    id: "rear-right-wheel",
    label: "Rear right wheel",
    group: "wheels",
    summary: "The rear right wheel shares the driving job with the left.",
    function:
      "A driveshaft takes torque from the gearbox to this wheel through the hub. Each wheel is tethered to the car by three tethers that comply with FIA standard 8864-2013, each with a minimum energy absorption of 7 kJ, and no suspension member may carry more than two of them (article 14.4).",
    whyItMatters:
      "The tethers are there for a wheel that comes off in a crash: they keep it on the car instead of letting it fly.",
    funFact: "The tethers' attachments at both ends must each withstand a 70 kN pull within a 45 degree cone of the suspension member.",
    stats: [
      { label: "Tethers per wheel", value: "3" },
      { label: "Energy absorption, each", value: "7 kJ or more" },
      { label: "End attachments", value: "70 kN within a 45 degree cone" },
    ],
    sources: [FIA_2022],
  },
  exhaust: {
    id: "exhaust",
    label: "Exhaust",
    group: "exhaust",
    summary: "The exhaust carries the engine's waste gas through the turbo and out of a single tailpipe at the back.",
    function:
      "Over its last 150 mm the exhaust tailpipe must be a single tailpipe. Over its last 450 mm the pipe that all the turbine's exit gas passes through must have a circular internal cross section of one constant diameter, between 100 mm and 130 mm, and it must stay clear inside (article 3.8.2).",
    whyItMatters:
      "The 2022 power unit has an MGU-H on the turbo, which recovers heat energy from the exhaust; 2026 removes it. How cleanly the exhaust flows decides how quickly the engine responds.",
    funFact: "The 2022 engine is a 1,600 cc V6 turbo, and fuel flow may not exceed 100 kg/h.",
    stats: [
      { label: "Tailpipes", value: "1, over the last 150 mm" },
      { label: "Turbine tailpipe diameter", value: "100 to 130 mm, constant" },
      { label: "Engine capacity", value: "1,600 cc (+0/-10 cc)" },
      { label: "MGU-H", value: "fitted (2026: removed)" },
    ],
    sources: [FIA_2022, FIA_EXPLAINER],
  },
  "rain-light": {
    id: "rain-light",
    label: "Rain light",
    group: "safety",
    summary: "The light at the back of the car that makes it visible to the drivers behind it when spray cuts the view.",
    function:
      "Every car carries three rear lights, each from an FIA-designated manufacturer and clearly visible from behind. The first sits on the car's centreline; one more sits on each side, inside the bodywork. The driver can switch them on from the cockpit (article 14.3).",
    whyItMatters:
      "A wet track throws up spray that hides a car from the one following. A bright light on the centreline and two more on the sides give that driver something to see, which is why it is a safety part rather than an aero one.",
    funFact: "The two side lights may be curved in the plane of their lens, but with a radius of no less than 200 mm.",
    stats: [
      { label: "Rear lights", value: "3" },
      { label: "Centre light height", value: "295 to 305 mm (car coordinate Z)" },
      { label: "Side lights height", value: "500 to 870 mm (car coordinate Z)" },
    ],
    sources: [FIA_2022],
  },
};
