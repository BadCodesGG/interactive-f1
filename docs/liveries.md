# Liveries: eight options for the Formula F226

The liveries are colours and layout only: no team names, no team logos, no sponsor marks other than
BadCodes. Every car carries the BadCodes marks. Ghost, a tone-on-tone matte black, is the default.
Pick another with the picker or `?livery=<id>`.

## Shared rules

- **Paint is procedural.** The scanned model has no UVs, so zones and stripes are computed in the
  fragment shader from each vertex's rest-pose world position in metres, per part
  (`src/models/f1/livery-apply.ts`, `livery-glsl.ts`). Coordinates below: `x` along the car, `y` up, `z`
  across; "t" is the normalised position along the car, 0 at the nose tip, 1 at the rear wing's
  trailing edge.
- **Logos are projected decals.** `scripts/build-livery-decals.mjs` trims the artwork and writes the
  small PNGs in `public/models/` and `src/models/f1/decals.ts` (see the README, "Rebuilding the
  assets"):
  - the bc monogram, in its own colours (gradient b, white c), or recoloured through its alpha for
    single-colour use;
  - the wordmark, a one-channel mask the shader fills with the colour the livery names.
  - Placement on every car: monogram on the nose top (just behind the front wing, about 0.18 m tall)
    and on both sides of the engine-cover fin (about 0.25 m); wordmark on both sidepod flanks (about
    0.9 m long) and on the rear wing main plane, facing back and up (about 0.8 m).
  - Projection is planar, along the surface's dominant axis (sides along z, tops along y), clipped to a
    box so it does not bleed onto neighbouring parts. Mirrored sides read correctly, not reversed.
- **Unchanged on every car:** tyres (rubber `#141519`, soft-compound sidewall band `#e5484d`), rims
  (`#cdd3dc` brushed, metalness 0.9, roughness 0.35), floor and plank in satin carbon (`#1a1c21`,
  roughness 0.55), carbon wishbones. The halo takes the livery's `halo` colour.
- **Finish presets** (MeshPhysicalMaterial):
  - `gloss`: roughness 0.18, clearcoat 1, clearcoatRoughness 0.06, metalness 0.
  - `matte`: roughness 0.62, clearcoat 0, metalness 0.
  - `satin`: roughness 0.42, clearcoat 0.3, clearcoatRoughness 0.3.
  - `metallic` (silver only): metalness 0.75, roughness 0.3, clearcoat 0.6.
- **Stripes** have hard edges, anti-aliased with `fwidth`. Smeared edges read as fake. The one gradient
  is the silver livery's fade along `t`, and the BadCodes original's logo gradient.
- **Site accent** per livery, checked in both themes at 3:1 or better against `--bg` and `--surface`,
  and 4.5:1 or better for text on a filled accent (the Explode button). `on` is the text colour on the
  accent. `src/app/accent.test.ts` holds the CSS in `globals.css` to `livery-meta.ts`.
- **Ids.** A livery's id is its URL value, its `data-livery` value and its CSS selector. Earlier builds
  used other ids for five of them; `LEGACY_LIVERY_IDS` in `src/models/f1/livery-meta.ts` maps those to
  the current ones, so old links and remembered choices keep working:

  | Earlier id | Id |
  |---|---|
  | `gulf` | `powder-blue` |
  | `martini` | `white-stripes` |
  | `jps` | `black-gold` |
  | `papaya` | `orange-blue` |
  | `rosso` | `racing-red` |

## The eight

### 1. Powder blue and orange (`powder-blue`, gloss)
- Palette: powder blue `#8fc6e8`, orange `#f47b20`, navy pinline `#1c2a44`.
- Body (chassis, sidepods, engine cover, nose): powder blue.
- A 0.32 m orange band runs centred on the top centreline from the nose tip over the cockpit and down
  the engine cover to the fin, with a 0.02 m navy pinline either side. The band continues down each
  sidepod flank as a wide orange flash (t 0.35 to 0.6, lower half).
- Front wing: blue main plane, orange endplates. Rear wing: blue planes, orange endplates. Halo: blue.
- Logos: bc monogram in navy; wordmark navy `#1c2a44` on blue. The monogram's own gradient would
  vanish on the orange band it sits on.
- Accent: dark `#f28a2e` on `#07080a`; light `#9c4a0a` on `#ffffff`.

### 2. White with blue and red stripes (`white-stripes`, gloss)
- Palette: white `#f5f5f2`, dark blue `#0d2a5c`, light blue `#3f9fd8`, red `#d9272e`.
- Body: white. Three parallel stripes (dark blue 0.07 m, light blue 0.05 m, red 0.05 m, 0.012 m white
  gaps) run from the nose along each side of the chassis, sweep up over the sidepod's top edge and along
  the engine cover to the rear wing, following the body line (constant height above the floor, then
  rising with the cover).
- Front and rear wing main planes white, endplates dark blue. Halo: white.
- Logos: bc monogram in the gradient original; wordmark dark blue.
- Accent: dark `#5aa9e6` on `#07080a`; light `#1b4f8a` on `#ffffff`.

### 3. Black and gold (`black-gold`, gloss)
- Palette: gloss black `#0b0b0c`, gold `#c9a44c` (pinstripe).
- Body: black. A 0.012 m gold pinstripe outlines the nose top, runs along each chassis shoulder, wraps
  the sidepod inlet edge, and outlines the engine cover spine. A second pinstripe 0.02 m inside the
  first (double line) on the nose and cover only.
- Wings: black, gold pinstripe along every endplate edge. Halo: black.
- Logos: bc monogram and wordmark in gold `#c9a44c` (single colour, recoloured through alpha).
- Accent: dark `#d4af37` on `#07080a`; light `#7a5c10` on `#ffffff`.

### 4. Orange and blue (`orange-blue`, matte)
- Palette: orange `#ff8000`, blue `#2f6db5`, matte black `#141414`.
- Body: orange on the top surfaces and sidepod flanks. Blue on the lower chassis, sidepod undercut and
  the nose underside, split on a line that rises from the nose tip (t 0) at 40 percent body height to
  the sidepod inlet (t 0.35) at 55 percent, then flat to the rear.
- Engine cover and fin: orange; fin trailing third blue. Front wing: orange endplates, black main
  plane. Rear wing: orange planes, black endplates with a blue edge. Halo: orange.
- Logos: bc monogram in black `#141414` on orange; wordmark black on orange.
- Accent: dark `#ff8000` on `#07080a`; light `#a34d00` on `#ffffff`.

### 5. Silver to black with teal (`silver`, metallic front, matte rear)
- Palette: silver `#c5c9ce`, graphite `#2a2d31`, black `#0e0f11`, teal `#00a19b`.
- Body: a smooth fade along the car, silver (metallic) from the nose to t 0.3, fading through graphite
  to matte black by t 0.6 and black to the rear. The gradient runs along `t` only.
- A 0.03 m teal line traces the sidepod's top edge from the inlet to the cover and a teal band marks the
  front wing endplates and the rear wing's upper flap edge. Halo: black.
- Logos: bc monogram silver `#c5c9ce` on black areas, black on silver; wordmark teal on the black
  sidepod flanks.
- Accent: dark `#00d2be` on `#07080a`; light `#006b61` on `#ffffff`.

### 6. Racing red (`racing-red`, matte)
- Palette: red `#c8102e`, white `#f2f2f2`, black `#101010`.
- Body: red everywhere painted. A white band 0.14 m wide wraps the engine cover just ahead of the fin
  (t 0.62 to 0.66). The nose tip (t 0 to 0.06) is white. Black on the sidepod undercut below 30 percent
  body height.
- Front wing: black main plane, red endplates. Rear wing: red upper flap, black main plane, red
  endplates. Halo: black.
- Logos: bc monogram in white `#f2f2f2`; wordmark white on red.
- Accent: dark `#ff3b3b` on `#07080a`; light `#b3141c` on `#ffffff`.

### 7. Ghost (`ghost`, matte, tone on tone)
- Palette: matte black `#121314`, graphite `#26282b`, ghost grey `#3a3d42` (logos), satin black
  `#0c0d0e` (panels).
- Body: matte black. Panels (engine cover, sidepod tops) in satin black, so the split shows only as a
  sheen change under the key light. A 0.01 m graphite pinline along the chassis shoulder.
- Wings and halo: matte black; endplates graphite.
- Logos: both marks in ghost grey `#3a3d42` with the `gloss` finish over a matte body, so they appear
  and disappear as the car turns under the lights. Here the logos are about finish, not colour.
- Accent: dark `#b8bec8` on `#07080a`; light `#4a505a` on `#ffffff`.

### 8. BadCodes original (`badcodes`, gloss)
- Palette: from the bc logo: yellow `#ffd000`, orange `#ff7a00`, red `#e63312`, with white `#f7f7f5`
  and black `#0b0b0c`.
- Body: black. The logo's gradient (yellow to orange to red, in that order front to back) runs as a
  wide swoosh: it starts across the nose top (t 0.05), widens along each sidepod flank to its full
  height at t 0.45, then narrows up the engine cover to the fin, where it ends in red. White appears
  only as the "c" of the monogram and as a 0.015 m white line bordering the swoosh.
- Front wing endplates and rear wing endplates in the gradient (yellow front, red rear); planes black.
  Halo: black.
- Logos: the bc monogram in its original colours (gradient b, white c) on the nose and fin; wordmark
  white on the black sidepod ahead of the swoosh and on the rear wing.
- Accent: dark `#ffb000` on `#07080a`; light `#b5360f` on `#ffffff`.
