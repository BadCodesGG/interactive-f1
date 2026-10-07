# Interactive F1

**Pull a 2026 Formula 1 car apart, then climb inside it.**
An exploded view of a generic 2026-regulations F1 car in two stages, a 2022 vs 2026 rules toggle, eight liveries, a pit-stop challenge and a GPU wind tunnel, all in the browser.

**Live: [f1.badcodes.dev](https://f1.badcodes.dev)**

https://github.com/user-attachments/assets/a6874386-7794-42de-9cfb-ec029a3a70a0

The car is a scanned Sketchfab model pulled apart along named parts. The first stage separates the bodywork; the second opens it and shows a power unit built in code from the 2026 regulations. Pick any part, in 3D or from the list, to read what it does, its numbers and where they come from. The regulation figures are sourced from the FIA technical regulations and explainers, and the lap and downforce scores are a small game model, not data from any real car or team.

## What you can do

| | |
|---|---|
| **Explode it** | Drag the slider or press Explode. Stage one pulls the bodywork apart (wings, floor, bodywork, wheels, suspension); stage two opens it up and shows the power unit inside. |
| **Read a part** | Click it in 3D or in the list. The panel shows its copy, stats and sources. The part is in the address (`?part=`), so a link opens on it. |
| **2022 vs 2026** | A toggle swaps the car and the numbers between the 2022 and 2026 regulations (`?car=2022`). |
| **One lap** | A lap of a circuit with active aero: the wing flaps open on the straights and close in the corners, and the body pitches and rolls. |
| **Liveries** | Eight paint jobs, picked from the picker or `?livery=<id>`. They are painted in the shader from data, because the scanned model has no UVs. The site accent follows the livery. See [`docs/liveries.md`](docs/liveries.md). |
| **Pit stop** | A pit-stop challenge: the car goes up on the jack, the wheel guns come off and go back on. |
| **Wind tunnel** | `/tunnel` puts the assembled car on a floor grid. Swap the front wing and floor, set the rear wing angle, aero mode, ride height, halo and speed, pick a circuit, and the score card and the airflow both change. |
| **View in AR** | On a phone, put the car on your table. |

The airflow in the tunnel is not CFD. It is GPU particles deflected by a signed distance field baked from the car's mesh, so it shows where air would go qualitatively and says nothing about real downforce. The score card comes from a coefficient table (`src/data/aero.ts`) and a simple lap model, relative to a baseline setup.

## How it works

```
src/engine/explode/   The reusable exploded-view engine: stage, explode plan, camera, search, AR export.
src/data/             Per-feature data: <feature>.sidecar.json, <feature>.copy.ts, facts, aero tables, credits.
src/models/f1/        The car: liveries and their shader, power unit, lap model, pit stop, SDF format.
src/app/              The pages: the car at /, the wind tunnel at /tunnel, lap and pit-stop panels.
public/models/        The GLBs, the baked SDF and the logo textures, all content-hashed.
scripts/              Asset builders, sidecar check, the browser check (test:stage).
docs/liveries.md      The design of the eight liveries.
```

**A feature is three files plus a route.**

| File | Holds |
|---|---|
| `public/models/<feature>.<hash>.glb` | Geometry. Meshopt-compressed, one named node per part, content hash in the name. |
| `src/data/<feature>.sidecar.json` | Schema 1: parts keyed by node name, labels, groups and stages, optional explode vectors and camera views, copy keys. |
| `src/data/<feature>.copy.ts` | `export const copyBook: CopyBook`, one `PartCopy` per sidecar `copy` key. |

The page is a Server Component: the headline, text and part list render into the HTML, so the route works with JavaScript off. Only the canvas is lazy.

**Liveries.** Each livery is data (`src/models/f1/livery-*.ts`): a palette, zones, stripes and decals as functions of a vertex's rest-pose position in metres. `livery-glsl.ts` turns that into a fragment shader chunk and `livery-apply.ts` patches it into the car's materials. The same rules run on the wind-tunnel car through a fitted frame map, and in a baked texture atlas for AR. The choice lives on `<html data-livery>`, set before first paint by an inline script, so the site accent never flashes.

**Wind tunnel.** `scripts/build-sdf.mjs` bakes a 96x40x48 signed distance field from the tunnel car. Particles are advected on the GPU, steered by the field's gradient, and drawn as ribbons.

### Things that will bite

- **Any route that sets metadata goes through `pageMetadata()` in `src/lib/site.ts`.** A route that declares its own `openGraph` or `twitter` replaces the layout's wholesale, so without the helper its card has no picture. `SITE_URL` is the literal production domain, never `VERCEL_URL` or localhost: a relative or deployment URL makes Slack and Facebook drop the image.
- **Import the stage only through `next/dynamic` with `ssr: false`, from a Client Component** (`stage-client.tsx`). The barrel `@/engine/explode` deliberately omits `stage`, `plan` and `camera`: importing any of them statically puts three into the route's initial JS. `test:stage` fails if `WebGLRenderer` appears in an initial chunk.
- **The sibling `import("three")` in `stage-client.tsx` is load-bearing.** It gives three its own chunk, fetched in parallel. Without it the bundler merges the engine into three's chunk and the stage budget (120 KB gzipped, three excluded) cannot be measured.
- **Sidecar keys are node names after three's sanitiser.** three turns whitespace into `_` and drops `[ ] . : /`; the engine further requires `[A-Za-z0-9_-]`. A multi-primitive mesh's children take `<mesh>_1`-style names from the same pool as nodes, so a node named `gear_1` can collide with them. `npm run check:sidecar` loads each GLB through three's real GLTFLoader to catch this.
- **Never run `gltf-transform optimize` with defaults.** Its flatten, join, instance and palette steps merge named parts into one node. Use `--flatten false --join false --instance false --palette false --simplify false --compress meshopt`, then `npm run check:sidecar`.
- **`<Canvas flat>`, never `<Canvas shadows>`.** Without `flat`, R3F's ACES tone mapping recolours every material; `shadows` selects `PCFSoftShadowMap`, which three 0.186 replaces with a warning. Shadows are switched on in `onCreated` with `PCFShadowMap`.
- **WebGL 2 only.** The probe in `gate.tsx` accepts only a `webgl2` context. Widening it makes WebGL-1-only browsers download three and fail.
- **One console warning is allowed, exactly:** R3F 9.8 constructs a `THREE.Clock`, which three 0.186 deprecates. `test:stage` fails on any other `THREE.` warning and on any console error.
- **Camera focus uses `fitToSphere`, not `fitToBox`.** camera-controls' `fitToBox` snaps to the nearest axis-aligned angle, which shows flat parts edge-on.
- **An authored `view` is for the exploded pose.** Write its `position` and `target` against where the part sits at k = 1.
- **Models are cached as immutable** (`next.config.ts`), so a changed GLB must be a new filename. The build scripts hash the bytes, write `<name>.<hash>.glb` and update the sidecar; do the same by hand.
- **Per-frame values never go through React.** The store publishes `k` only when a tween settles; the canvas reads the live value with `store.frameK()`.
- **A sidecar part may be `procedural: true`.** It is built in code and added under the loaded scene by `ExplodeStage`'s `onModel` hook before the plan is made, so `check:sidecar` skips its model check. The power unit is one.

## Running it

Node 22 or 24.

```bash
git clone https://github.com/BadCodesGG/interactive-f1.git
cd interactive-f1
npm install
npm run dev            # http://localhost:3000
```

Checks:

```bash
npm run lint           # ESLint (Next core-web-vitals + TypeScript)
npm run typecheck      # tsc --noEmit
npm test               # Vitest: engine maths, sidecar schema, liveries, lap and pit-stop models
npm run check:sidecar  # Every src/data/*.sidecar.json against its GLB and copy book
npm run build          # production build
npm run test:stage
```

`test:stage` needs a build first and Playwright's Chromium (`npx playwright install chromium`). It boots `next start`, drives each route in Chromium (the explode checks on `/`; on `/tunnel` the server-rendered controls, a rear wing change moving the lap delta), and fails on a console error, on three appearing in an initial chunk, or on a payload past its budget. Screenshots go to `STAGE_SHOTS_DIR` (default `.stage-shots/`). Point it at a server that is already running with `STAGE_URL`. Add every new feature route to `ROUTES` in `scripts/check-stage.mjs`.

## Rebuilding the assets

The built GLBs, the baked SDF and the logo textures are committed, so you do not need any of this to run or change the site. It is only for changing the models. The source models are not in the repo (they are large and are other people's work); download them from Sketchfab and pass their paths in, as an argument or an environment variable. Each script prints a usage message and exits if it is not given one.

| Script | Needs | Writes |
|---|---|---|
| `npm run car` | The glTF of ["Formula F226"](https://sketchfab.com/3d-models/formula-f226-a4dd03155ab64a6a9b7c677af189c1a1) by CarlosCG31: download the glTF, unzip it, point at `scene.gltf`. `npm run car -- <path>` or set `F226_SOURCE`. | `public/models/f226.<hash>.glb`; updates `src/data/f1.sidecar.json`. |
| `npm run car:2022` | The glTF of ["Formula F222 Ultimate"](https://sketchfab.com/3d-models/formula-f222-ultimate-de780743451748d6b5567b1e190c7908) by CarlosCG31. `npm run car:2022 -- <path>` or set `F222_SOURCE`. | `public/models/f222.<hash>.glb`; updates `src/data/f222.sidecar.json`. |
| `npm run models` | The wind-tunnel car as a GLB in millimetres with 16 named part nodes. `F1_SOURCE_GLB=<path>` or `node scripts/build-models.mjs <path>`. | `public/models/f1-2026.<hash>.glb`; updates `src/data/f1-tunnel.json`. |
| `npm run sdf` | The output of `npm run models`. | `public/models/f1-sdf.<hash>.bin`; updates `src/data/f1-tunnel.json`. |
| `node scripts/measure-car-frame.mjs` | The output of `npm run car`. | `src/models/f1/car-frame.ts`, the measurements the livery rules are written against (`--check` fails if it is stale). |
| `npm run tunnel-frame` | The outputs of `npm run models` and `npm run car`. | `src/models/f1/tunnel-frame.ts`, the map that paints the tunnel car with the F226's livery rules. |
| `node scripts/build-livery-decals.mjs` | Two transparent PNGs: the bc monogram and the wordmark. `BC_MARK_PNG` and `BC_WORDMARK_PNG`, or pass both as arguments. Uses `sharp` (a dev dependency). | `public/models/bc-*.<hash>.png` and `src/models/f1/decals.ts`. |

The tunnel car comes from ["F1 2026 concept"](https://sketchfab.com/3d-models/ea3bde709b1e4dc9b0ec8557d106ed42) by Qvist_Designs. The Sketchfab download is one mesh; `build-models.mjs` expects it already decimated and split into the 16 parts (wings, floor, chassis, sidepods, engine cover, halo, suspension, wheels, exhaust, mirrors) that [filan214's APEX project](https://github.com/filan214/F1---2026-Car-Details) defines, and that split is not scripted here. The script itself looks up only the four wheel nodes by name (`front-left-wheel`, `front-right-wheel`, `rear-left-wheel`, `rear-right-wheel`).

`npm run fixture` rebuilds the small nine-part test model in `public/models/fixture.<hash>.glb`, which the engine's tests use.

After any rebuild, run `npm run check:sidecar`, then `npm test`.

## Credits and licence

The code is MIT, see [LICENSE](LICENSE). The 3D models are not covered by it: they are other people's work under CC BY 4.0, modified for this site.

- ["Formula F226"](https://sketchfab.com/3d-models/formula-f226-a4dd03155ab64a6a9b7c677af189c1a1) by CarlosCG31, CC BY 4.0. The car in the exploded view. Its parts were grouped for the explode, its textures replaced by a painted livery, and it was compressed for the web.
- ["Formula F222 Ultimate"](https://sketchfab.com/3d-models/formula-f222-ultimate-de780743451748d6b5567b1e190c7908) by CarlosCG31, CC BY 4.0. The 2022 car in the exploded view. Its parts were grouped for the explode, its textures replaced by a neutral finish, and it was compressed for the web.
- ["F1 2026 concept"](https://sketchfab.com/3d-models/ea3bde709b1e4dc9b0ec8557d106ed42) by Qvist_Designs, CC BY 4.0. The car in the wind tunnel: a generic 2026 regulation F1 car. Split into parts, decimated and compressed for the web.
- ["F1 2026 Car Details (APEX)"](https://github.com/filan214/F1---2026-Car-Details) by filan214, CC BY 4.0 (stated in its README; the repository carries no LICENSE file). The 16-part split of the tunnel car follows this repository. The seams are illustrative display cuts, not the shape of real components.

The power unit is not part of the scanned model. It is a simplified diagram built in code from the 2026 power unit regulations, so its shapes are illustrative and not to scale. Regulation figures come from the FIA 2026 Formula 1 Technical Regulations (Section C issue 11 and the Power Unit regulations issue 6) and from FIA and Formula 1 explainer articles. Where a 2026 number differs from 2025, the text says so.

The airflow shown is a simplified visual and is not CFD. Lap-time and downforce scores come from a small coefficient table and a simple lap model, are given relative to a baseline setup, and are a game model, not the numbers of any real car or team. The liveries are colours and layout only; they are not team liveries.

The full attributions are in [`src/data/credits.ts`](src/data/credits.ts), which the site's credits panel renders.

Files that are not covered by the MIT licence, and the terms for the BadCodes name and logo, are listed in [NOTICE](NOTICE).

Built by [BadCodes](https://badcodes.dev).
