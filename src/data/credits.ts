export interface Credit {
  title: string;
  author: string;
  licence: string;
  licenceUrl: string;
  sourceUrl: string;
  note: string;
}

/** Model attribution. CC BY 4.0 requires the author, the licence and a note that the work was changed. */
export const credits: {
  showroom: Credit;
  showroom2022: Credit;
  model: Credit;
  partSplit: Credit;
  powerUnit: string;
  regulations: string;
  disclaimer: string;
  attributionLine: string;
} = {
  showroom: {
    title: "Formula F226",
    author: "CarlosCG31",
    licence: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceUrl: "https://sketchfab.com/3d-models/formula-f226-a4dd03155ab64a6a9b7c677af189c1a1",
    note: "The car in the exploded view. Its parts were grouped for the explode, its textures replaced by a painted livery, and it was compressed for the web.",
  },
  showroom2022: {
    title: "Formula F222 Ultimate",
    author: "CarlosCG31",
    licence: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceUrl: "https://sketchfab.com/3d-models/formula-f222-ultimate-de780743451748d6b5567b1e190c7908",
    note: "The 2022 car in the exploded view. Its parts were grouped for the explode, its textures replaced by a neutral finish, and it was compressed for the web.",
  },
  model: {
    title: "F1 2026 concept",
    author: "Qvist_Designs",
    licence: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceUrl: "https://sketchfab.com/3d-models/ea3bde709b1e4dc9b0ec8557d106ed42",
    note: "The car in the wind tunnel: a generic 2026 regulation F1 car on Sketchfab. Split into parts, decimated and compressed for the web.",
  },
  partSplit: {
    title: "F1 2026 Car Details (APEX)",
    author: "filan214",
    licence: "CC BY 4.0 (stated in the repository README; the repository carries no LICENSE file)",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceUrl: "https://github.com/filan214/F1---2026-Car-Details",
    note: "The 16-part split of the model into wings, floor, chassis, sidepods, engine cover, halo, suspension, wheels, exhaust and mirrors follows this repository. The seams are illustrative display cuts, not the shape of real components.",
  },
  powerUnit:
    "The power unit is not part of the scanned model. It is a simplified diagram built in code from the 2026 power unit regulations, so its shapes are illustrative and not to scale.",
  regulations:
    "Regulation figures come from the FIA 2026 Formula 1 Technical Regulations (Section C issue 11 and the Power Unit regulations issue 6) and from FIA and Formula 1 explainer articles. Where a 2026 number differs from 2025, the text says so.",
  disclaimer:
    "Qualitative flow, table-driven score. The airflow shown is a simplified visual and is not CFD. Lap-time and downforce scores come from a small coefficient table and a simple lap model, are given relative to a baseline setup, and are a game model, not the numbers of any real car or team.",
  attributionLine:
    "3D models: \"Formula F226\" and \"Formula F222 Ultimate\" by CarlosCG31 (CC BY 4.0), and \"F1 2026 concept\" by Qvist_Designs (CC BY 4.0) split into parts with the APEX project by filan214. All modified for this site.",
};
