// Headline 2026 regulation facts for the info panel. Each entry has one primary source that was read
// for it. FIA regulation documents change by issue; numbers here are from Section C issue 11
// (Feb 2025) and the Power Unit regulations issue 6 (Mar 2024) unless the source says otherwise.
export const facts2026: { title: string; body: string; source: string }[] = [
  {
    title: "Active aero: Corner Mode and Straight Mode",
    body: "Both wings now move. Wings stay closed in the high-downforce Corner Mode through corners and open to a low-drag Straight Mode on defined straights. Each flap sits in one of two fixed positions and must complete a change in 600 ms or less; if the system fails, the wing returns to Corner Mode. The names replace the earlier X-mode and Z-mode.",
    source: "https://api.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss11_-_2025-02-26.pdf",
  },
  {
    title: "Both wings are active, and both are smaller",
    body: "The front wing has a two-element active flap and is 100 mm narrower. The rear wing has three elements, with the lower beam wing removed and simpler endplates. DRS is gone.",
    source: "https://www.fia.com/news/f1s-new-era-everything-you-need-know-about-how-fia-making-formula-1-more-competitive-more",
  },
  {
    title: "Straight Mode is a place, not a gap",
    body: "The mode is used at set points on the circuit, expected on straights of about three seconds or more, and any driver may use it regardless of the gap to the car ahead. The wings close automatically on braking or when the driver lifts off. In wet or caution conditions only part of the active aero may be used.",
    source: "https://www.formula1.com/en/latest/article/explained-the-new-key-terms-for-formula-1s-new-for-2026-rules.3T5BU6TC9quGcIpGzoWkY0",
  },
  {
    title: "Overtake Mode replaces DRS",
    body: "A car within one second of the car ahead at the detection point earns 0.5 MJ of extra electrical energy for the next lap. It comes with two other driver tools: Boost, a manual electric deployment, and Recharge, which harvests energy under braking, on lift and on part throttle.",
    source: "https://www.formula1.com/en/latest/article/explained-the-new-key-terms-for-formula-1s-new-for-2026-rules.3T5BU6TC9quGcIpGzoWkY0",
  },
  {
    title: "MGU-K rises to 350 kW",
    body: "The electric motor is capped at 350 kW, up from 120 kW in 2025, and may harvest up to 8.5 MJ per lap (plus 0.5 MJ with Overtake Mode), up from about 2 MJ. Deployment fades above 290 km/h and stops at 345 km/h, or 355 km/h in override mode.",
    source: "https://www.fia.com/sites/default/files/fia_2026_formula_1_technical_regulations_pu_-_issue_6_-_2024-03-29.pdf",
  },
  {
    title: "A near 50/50 power split, and no MGU-H",
    body: "About half of peak power is now electric, against roughly a fifth in 2025. The MGU-H, which recovered heat energy from the turbo and was rated at 75 kW, is removed.",
    source: "https://www.mercedesamgf1.com/facts-and-stats-power-unit-regulation-changes",
  },
  {
    title: "A smaller engine contribution",
    body: "The 1.6 litre V6 turbo engine drops from 550 to 560 kW to about 400 kW.",
    source: "https://www.fia.com/news/f1s-new-era-everything-you-need-know-about-how-fia-making-formula-1-more-competitive-more",
  },
  {
    title: "A 4 MJ battery window",
    body: "The energy store's state of charge may swing by at most 4 MJ on track, and the main enclosure must weigh at least 35 kg. At 350 kW, a full 4 MJ burst lasts about 11 seconds.",
    source: "https://www.fia.com/sites/default/files/fia_2026_formula_1_technical_regulations_pu_-_issue_6_-_2024-03-29.pdf",
  },
  {
    title: "Smaller, lighter cars",
    body: "Wheelbase is at most 3,400 mm (200 mm shorter) and the car is 1,900 mm wide (100 mm narrower). Minimum mass is 724 kg plus the nominal tyre mass, about 770 kg in all.",
    source: "https://api.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss11_-_2025-02-26.pdf",
  },
  {
    title: "Advanced sustainable fuel",
    body: "Every car runs on advanced sustainable fuel. Fuel use is metered by energy flow rather than by mass, which lets fuels with more energy per kilogram be used.",
    source: "https://www.fia.com/news/f1s-new-era-everything-you-need-know-about-how-fia-making-formula-1-more-competitive-more",
  },
  {
    title: "Narrower, lighter tyres",
    body: "Front tyres are 25 mm narrower (280 mm, from 305 mm) and rears 30 mm narrower (375 mm, from 405 mm), with diameters 15 mm and 10 mm smaller. The rim stays at 18 inches, a set of four tyres is 1.6 kg lighter, and the softest compound, C6, is dropped.",
    source: "https://press.pirelli.com/pirelli-reveals-2026-f1-tyres-a-fresh-logo-design-and-new-compounds/",
  },
  {
    title: "Less ground effect, a narrower floor",
    body: "The floor is 150 mm narrower and only partially flat, with a lower-powered diffuser. The front wheel arches are removed and part of the wheel bodywork is mandated to control wheel wake.",
    source: "https://www.formula1.com/en/latest/article/explained-2026-aerodynamic-regulations-fia-x-mode-z-mode-.26c1CtOzCmN3GfLMywrgb2",
  },
  {
    title: "Aero targets: less downforce, much less drag",
    body: "The FIA and F1 quote downforce down about 30% and drag down about 55% against 2022 to 2025 cars. They do not say whether the 55% is for the whole lap or for Straight Mode only. An earlier Motorsport.com report put it nearer 40%.",
    source: "https://www.fia.com/news/f1s-new-era-everything-you-need-know-about-how-fia-making-formula-1-more-competitive-more",
  },
  {
    title: "Following another car should hurt less",
    body: "About 20 m behind another car, roughly 70% of downforce is retained today. The FIA is targeting about 90% for 2026.",
    source: "https://www.racefans.net/2025/11/21/why-the-fia-believes-its-2026-rules-will-significantly-improve-f1s-dirty-air-problem/",
  },
];
