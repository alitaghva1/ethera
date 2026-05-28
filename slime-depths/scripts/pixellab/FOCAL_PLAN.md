# Room Focal Pieces — PixelLab-Driven Asset Pack

Goal: replace the seven procedurally-drawn room focal pieces (the
"setpieces" anchored at the center of each room kind — see
`src/roomComposition.js` `drawFocal()` and friends) with hand-quality
PixelLab sprites. Workflow mirrors the hamlet prop pass:

1. You generate seven PNGs in PixelLab → Objects.
2. You drop them into `scripts/pixellab/imports/focals/`.
3. Run `node scripts/pixellab/import-focals.js`.
4. Claude wires the loader + the draw path to use the new sprites.

Each focal piece is a single static image. **Top-down 2.5D / low-angle
perspective** — same as the hamlet props, so they visually rhyme.

---

## Style hints (paste these on every prompt)

Append these phrases to every prompt below so the seven pieces feel
like one cohesive set:

- **`top-down low-angle pixel art view`**
- **`muted fantasy palette, dark stone dungeon`**
- **`transparent background`**
- **`single color black outline`** (matches hamlet pass + mage hero)
- **`subtle warm/cool ambient lighting baked into the sprite`** (pieces
  carry a hint of their own glow at rest; in-game we layer a halo
  on top, but the sprite shouldn't be flat-lit)

The dungeon's biome palette across the four floors is:
- Floor 1 (crypt): cold blue-grey moonlight, mossy greens
- Floor 2 (vault): warm amber, gold, brass
- Floor 3 (abyss): ember red, scorched stone, smoke
- Floor 4 (inferno): bright orange, lava cracks, charred basalt

Pieces should feel **palette-neutral** so they read in any biome — the
in-game post-FX biome wash will color-grade them at runtime.

---

## Sizing

Each focal is rendered centered on a single tile (TILE = 48 px) in
design space. The current procedural sizes range from ~24×16 (crater,
flat) to ~36×22 (tomb). Generate at **96×96 per piece** so we have
~2× headroom for the importer to trim transparent margins and
center-bottom-anchor onto the tile. We rescale to the runtime size
in `import-focals.js`.

Set canvas size in PixelLab to **96 × 96** for every piece.

---

## The seven focal pieces

### 1. Obelisk (`obelisk.png`)
Used in: combat rooms (off-center placement). Tall stone column with a
glowing rune mid-shaft. Reads as "ancient marker, slightly threatening
but inert."

```
top-down low-angle view of a tall narrow black-stone obelisk with a
single glowing cyan rune carved at chest height, weathered base
slightly wider than the column, soft cyan rune-light bleeding onto
the stone around it, no flames, no smoke, pixel art, muted fantasy
palette with cool cyan rune accent, single color black outline,
transparent background
```

### 2. Brazier (`brazier.png`)
Used in: combat (alt) + challenge + boss focal-light. Stone bowl on a
pedestal stem, with an ember/flame visible in the bowl. THE warm
focal. **Generate without an active flame** — the in-game render adds
animated flame on top so the sprite is reusable across "lit" and
"unlit" states. Bowl should have visible coals/embers.

```
top-down low-angle view of an iron-banded stone brazier on a short
pedestal, empty bowl with glowing red embers visible at the rim, no
visible flame, weathered metal banding around the bowl, soft warm
ember glow leaking from the bowl, pixel art, muted fantasy palette
with warm amber accents, single color black outline, transparent
background
```

### 3. Crater (`crater.png`)
Used in: elite focal (the centerpiece of crucible elite arenas).
Recessed pit with glowing cracks radiating outward. The piece is
**flat** — no vertical stack — so it doesn't dominate the playspace
in elite combat.

```
top-down view of a dark recessed crater pit in stone floor, four
glowing molten cracks radiating outward like a star pattern, bright
ember-orange light pulsing from the pit center, scorched blackened
stone around the rim, no debris, no smoke, pixel art, muted fantasy
palette with hot ember red-orange center, single color black outline,
transparent background
```

### 4. Altar (`altar.png`)
Used in: sanctuary / reward rooms. Stepped stone slab with a small
bowl indent on top, soft warm glow from the bowl. Ceremonial, calm.
This is the SANCTUARY altar visual (different from the HP-cost altar
room — that one's still the existing pedestal sprite).

```
top-down low-angle view of a stepped stone altar with a wider lower
plinth and a narrower upper slab, small carved bowl indent in the
center of the top, warm gold light glowing softly from the bowl,
ceremonial worn gold trim along the upper edge, no candles, no
incense smoke, pixel art, muted fantasy palette with warm cream-gold
accents, single color black outline, transparent background
```

### 5. Tomb (`tomb.png`)
Used in: miniboss + boss arena focal. Sarcophagus with carved cross /
ornament on the lid. Wider and flatter than the obelisk so the boss
doesn't feel cramped sharing the room with it. Cool purple mist
coloration baked subtly into the sprite.

```
top-down low-angle view of a stone sarcophagus tomb on a low plinth,
wider than tall, carved cross or sigil on the lid, four small corner
stones at the lid edges, faint cool violet mist bleeding from the
seam between lid and body, ancient weathered stone with dust
accumulation, pixel art, muted fantasy palette with cool violet
accents, single color black outline, transparent background
```

### 6. Glyph Circle (`glyph_circle.png`)
Used in: event room focal. Recessed rune circle in the floor with a
short cracked monolith at center. The most distinct silhouette of the
seven — the ring is FLAT (carved into floor), and the center stone is
short. The vertical fissure should glow violet/cyan.

```
top-down view of a circular ritual rune ring carved into the dungeon
floor, four glowing violet runes at compass points around the ring,
short broken stone monolith standing at the center with a vertical
crack glowing bright violet from within, recessed bowl shape carved
into the surrounding floor, no fire, no smoke, pixel art, muted
fantasy palette with cool violet rune accent, single color black
outline, transparent background
```

### 7. Plinth (`plinth.png`)
Reserved — not currently used by `FOCAL_RULES` since chestrooms /
shops have their own attractions, but available if a future room kind
calls for it. Slim neutral pedestal with a gold rim. Empty top — meant
to host other props at runtime (a relic, a key, a candle).

```
top-down low-angle view of a slim narrow stone pedestal column,
square base step slightly wider than the column body, simple worn
gold trim band around the top edge, empty flat top surface, no
runes, no glow, no objects on top, pixel art, muted fantasy palette
with warm gold trim accent, single color black outline, transparent
background
```

---

## Drop and import

Save the seven PNGs into `scripts/pixellab/imports/focals/` with the
exact filenames listed above (`obelisk.png`, `brazier.png`, etc.).

Then run from the `slime-depths/` directory:

```bash
node scripts/pixellab/import-focals.js
```

The importer:
- Trims transparent margins on each PNG so the piece is centered
- Bottom-aligns the piece in the output cell so feet sit on the tile
- Resizes to the canonical runtime cell size (64 × 64 — leaves margin
  around the 48 × 48 tile so vertical pieces like the obelisk don't
  clip against neighboring tiles)
- Writes to `public/assets/props/focals/<name>.png`
- Prints a summary

After the import lands, Claude will:
- Add the assets to `loader.js`
- Replace each procedural `_draw<Name>` function with an
  `images.focal_<name>` blit (preserving the existing animated halo
  layers — the per-piece halo / flame / pulse stays procedural so
  the ambient animation persists)

---

## Future hooks (later passes, don't worry about now)

- **Lit / unlit variants** for brazier + crater so the `cleared` state
  can show the focal extinguished after the encounter. Out of scope
  for v1; v1 always shows the lit variant.
- **Themed variants** for boss tombs (one per boss). Currently every
  boss arena uses the same tomb; a `tomb_grudnok.png`, `tomb_iron.png`
  etc. would let each boss have a signature setpiece. Out of scope.
- **Damage states** — the crater could show progressive cracking as
  the elite is fought. Out of scope.

The seven sprites above are the v1 "stop being procedural garbage"
deliverable.
