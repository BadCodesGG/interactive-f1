# Context

Glossary for Interactive F1, a browser app that pulls a 2026-regulations F1 car apart and tests it in a GPU wind tunnel. Terms are kept here so code, copy and docs use one word per idea. Add a term when a concept gets a name; change the entry, not the callers, when a meaning shifts.

## Language

**Part**: One named node of the car's GLB, keyed by its sanitised node name in the sidecar. Selected in 3D or from the list, and addressed by `?part=`.

**Feature**: A car model plus its data: a GLB, a `<feature>.sidecar.json` and a `<feature>.copy.ts`, served from a route. `f1`, `f222` and `fixture` are features.

**Sidecar**: The JSON beside a GLB (schema 1) that maps node names to labels, groups, stages, explode vectors, camera views and copy keys.

**Copy book**: The `copyBook` export of a `<feature>.copy.ts`; one `PartCopy` per sidecar `copy` key.

**Stage** (engine): The reusable 3D canvas that renders a feature and its explode plan. Loaded only through `next/dynamic` with `ssr: false`.

**Explode stage**: One of two steps of the exploded view. Stage one separates the bodywork; stage two opens it and shows the power unit.

**Regulation year**: The 2022 or 2026 rules set, chosen with `?car=`. It swaps the car and its numbers.

**Livery**: One of eight paint jobs, defined as data and painted in the shader because the scanned model has no UVs. The choice lives on `<html data-livery>`.

**Accent**: The site colour that follows the active livery.

**Active aero**: Wing flaps that open on straights and close in corners, in the lap and the tunnel.

**Lap**: The one-lap run of a circuit that shows active aero and body pitch and roll.

**Pit stop**: The challenge where the car goes on the jack and the wheel guns remove and refit the wheels.

**Wind tunnel**: The `/tunnel` route: the assembled car on a floor grid with swappable front wing and floor, and adjustable rear wing angle, aero mode, ride height, halo and speed.

**Airflow**: GPU particles steered by a baked signed distance field and drawn as ribbons. Qualitative only, not CFD.

**SDF**: The signed distance field baked from the tunnel car (96x40x48) by `scripts/build-sdf.mjs`.

**Score card**: The downforce and lap scores, computed from the coefficient table in `src/data/aero.ts` and a simple lap model, relative to a baseline setup. A game model, not real team data.

**Baseline**: The reference setup the score card is measured against.
