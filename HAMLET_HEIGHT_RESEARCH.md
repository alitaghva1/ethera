# Cainos Pixel Art Top Down — Elevation System Research

Asset pack: **Pixel Art Top Down — Basic v1.2.3** by Cainos. Tile size **32×32**. Sheets are 512×512 (16×16 tile grid).

## 1. The elevation illusion (`TX Tileset Wall.png`)

The wall tileset is built around a 3-tile-tall vertical anatomy, drawn from a slightly elevated camera so the front face of the platform is visible:

- **TOP CAP row** — the thin band of brick "lip" you see right at the platform edge. About one tile tall but with most of the pixels in the upper portion. This is what reads as "the corner where the floor meets the drop."
- **BODY rows** — pure brick face. Rectangular, fully tileable, used to extend a wall downward by N tiles for an N-step-tall platform. The sheet supplies several body variants (clean, cracked, mossy) so long walls don't repeat.
- **PLATFORM TOP** (interior) — paired with `TX Tileset Stone Ground.png`. The wall sheet itself does not contain the walkable surface; it contains the *edges*.

In the upper region of the sheet there are two recurring "frame" assemblies: a small frame (~4×3 tiles) and a wider frame (~6×3 tiles). Each frame demonstrates a complete platform corner kit:

- **Outer corners** — top-left, top-right of the frame (two distinct tiles; convex corner where the platform sticks out).
- **Top edge** — straight horizontal cap between the two outer corners.
- **Side edges** — left and right vertical "sliver" tiles (the very thin 2 columns on the sheet between the small/large frames are the *side-only* pieces — used when a wall runs N→S without a top cap because the top continues off-tile).
- **Inner corners** — the L-shaped notch tiles at the bottom of each frame, used where a platform recedes inward (concave corner).
- **Bottom-edge end caps** — short horizontal pieces that close off the bottom of a wall section.

Mid-sheet there is also a **doorway tile** (a body tile with a small wood-and-iron door inset), and isolated **single-row body tiles** for short knee-walls.

So for a fully tileable platform you get: outer-corner-TL / top-edge / outer-corner-TR / left-side / body / right-side / inner-corner-TL / inner-corner-TR / bottom-end-cap. A standard 9-piece autotile set.

## 2. Stairs (`TX Struct.png`)

The struct sheet contains three things:

- **Top row, six 3×4 panels** — two clusters (clean / cracked) of decorative wall facades. Same elevation kit as the wall sheet but pre-assembled into building-front strips. NOT stairs.
- **Right column** — two **archway / gate** sprites (3×3 and 2×2). Used as door-shaped openings cut into a tall wall.
- **Bottom-left, four sprites** — the **stairs**. Two pairs (two clean, two with green grass dressing on the side rail).

Each stair sprite is a single multi-tile graphic, **roughly 4 tiles wide × 3 tiles tall** (≈128×96 px). Geometry:

- The diagonal "treads" are baked into the sprite (you can count the parallel step lines).
- A short side-rail/cheek wall rises along the high end of the staircase, matching the brick of `TX Tileset Wall.png` so it visually butts against a platform's side wall.
- The low end opens to ground level; the high end terminates flush with the platform top.

There are **west-facing** and **east-facing** versions (mirror pair). Per the changelog, they were added in v1.2.0 and re-aligned to the tilemap grid in v1.2.2 — i.e. they're *grid-snappable* but each is one indivisible sprite, not separate top/middle/bottom tiles.

## 3. Tilemap layout for raised platforms (Scene Overview)

Counting wall-face rows in the demo:

- **1-step platforms** (most of the hamlet): exactly **1 row of body brick** below the top-cap row. Total visible side wall ≈ 1 tile.
- **2-step platforms** (a couple of larger terraces along the south wall and around the central building): **2 rows of body brick** under the cap, ≈ 2 tiles of side wall.
- The bottom **outer perimeter wall** of the whole map uses **3 rows** of body — same anatomy, just taller, demonstrating the system scales.

Composition is always the same vertical recipe:

```
[outer corners + top edge]      <- 1 row of TOP-CAP tiles
[body brick body brick ...]     <- N rows for N-step elevation
[inner corner / bottom cap]     <- terminator row where the wall meets ground again
[stairs sprite straddles all of the above on whichever edge has an opening]
```

The platform interior is filled with `TX Tileset Stone Ground.png` (cobble tiles) using a separate 9-slice autotile (visible as the gray cobble fields on raised areas in the scene).

## 4. Shadows (`TX Shadow.png` + `TX Shadow Plant.png`)

`TX Shadow.png` is a **manually-authored library of pre-rendered drop shadows**, one shadow per source object. Looking at the sheet you can match shapes to props in `TX Props.png` — chest-shaped blobs, barrel circles, statue silhouettes, gravestone trapezoids, the round arena/circle pad shadow, plus a row of small-rock blobs along the bottom. Solid dark-brown fill (single color), no soft edge — they rely on alpha for shape, not gradient.

`TX Shadow Plant.png` is the same idea for trees/bushes — three large bush blobs and a row of small foliage clumps.

**How they composite:** each shadow tile is meant to be drawn **one layer below the prop**, offset a few pixels down/right (typically 2–4 px) so the prop appears to sit on top of its shadow. They are NOT tile-aligned — they're sprite-sized blobs.

The Scene Overview's prop shadows come from this shadow texture, not from baked-into-sprite shadows. Confirmation: `Texture/Extra/TX Plant with Shadow.png` and `TX Props with Shadow.png` are the *convenience* pre-composited variants for users who don't want to manage two layers. The base pack assumes you composite manually so shadows can vary with time-of-day or be omitted in interiors.

Platform side walls themselves do **not** cast separate shadows in this pack — the body brick already implies depth via its art, so no ground-shadow is added beneath a raised platform. (You can see this in the scene — the ground right below a platform's south edge is just normal grass, no dark gradient.)

## 5. Implementation approach for our 2D engine

**Data model.** Each tile carries an `elevation: 0 | 1 | 2 | …` (integer step count). A single `tiles[y][x]` 2D array becomes `tiles[y][x] = { groundType, elevation, decoration }`. Stairs are special objects with `from: 0, to: 1` (or the equivalent step pair) plus a direction (`'E' | 'W'`).

**Render order.** Single pass, painter's algorithm by Y, but with a sub-order per row:

1. Base ground (grass / dirt).
2. Shadows layer (drop-shadow blobs, drawn at prop X+offset, prop Y+offset).
3. Wall **body** rows (the brick faces, drawn from low-elevation rows up).
4. Platform **tops** (cobble fill on raised areas).
5. Wall **top-cap** edges (so the cap sits *over* the cobble seam).
6. Stair sprites (drawn after the wall they connect to so the sprite overlaps cleanly).
7. Props and the hero, sorted by feet-Y within their elevation band.

**Collision.** Two states per actor: `currentElevation`. Walking onto a non-stair tile with a different elevation is blocked (the wall body rows are solid). Stair tiles are special: stepping onto a stair from the matching low side starts a transition that increments `currentElevation` when the actor crosses the midline; reverse on the way down. The platform top is walkable only if the actor's elevation matches the tile's. This is exactly Cainos' "Stairs Layer Trigger" feature mentioned in v1.2.0 of the changelog.

**Minimal first-pass for ONE elevated district:**

1. Add `elevation` to the hamlet tile schema (default 0). Mark a rectangle of tiles `elevation: 1`.
2. Auto-generate the wall ring: for every tile where neighbor.elevation < self.elevation, paint a wall body tile in the cell BELOW it, and a top-cap on the boundary itself. Outer/inner corners selected by neighbor pattern (standard 9-slice).
3. Place one east-facing stair sprite at a chosen edge cell, mark its tiles as `stair: { dir:'E', from:0, to:1 }`.
4. In the movement code, before accepting a move, check `targetTile.elevation === hero.elevation || targetTile.stair`. On stair entry, lerp `hero.elevation` over the sprite's run.
5. Render order as above; the cobble platform top can reuse the existing `TX Tileset Stone Ground.png` autotile we already use for paths.

That gets the visual + collision working for a single raised plaza. Multi-step (elevation 2+) is just running the wall-ring generator with N body rows instead of 1, and is purely a visual change — collision logic is unchanged.

## File reference (for implementation)

- `Texture/TX Tileset Wall.png` — wall edges (top cap + body + corners + side slivers + door).
- `Texture/TX Struct.png` — bottom-left quadrant has the four stair sprites (E/W × clean/grassy).
- `Texture/TX Tileset Stone Ground.png` — cobble used as platform top fill.
- `Texture/TX Shadow.png` — prop drop shadows, draw beneath sprites with a small offset.
- `Texture/TX Shadow Plant.png` — tree/bush drop shadows, same usage.
- `Texture/Extra/TX *with Shadow.png` — pre-composited convenience variants if you skip the shadow layer.
