# Hamlet Rebuild Plan — PixelLab-Driven

Goal: replace the procedural (and "janky") hamlet with proper PixelLab-generated props and optionally a tiled ground system. Work like you did for the mage — generate in the PixelLab UI, drop into the repo, Claude integrates.

---

## Quick decision: Path A or Path B?

**Path A — Prop Upgrade (recommended starting point).**
Replace the hand-drawn ovals and rectangles that currently represent buildings with real PixelLab sprites. Keep the procedural ground (solid dirt + path overlays) for now. Fixes ~80% of the jank. ~30 minutes of your generation time + ~30 minutes of my integration.

**Path B — Full Tilemap Rewrite (do this if Path A isn't enough).**
Generate Wang tilesets via PixelLab, paint the whole hamlet in Sprite Fusion (free browser editor), export a JSON tilemap, and I rewrite the rendering to be tile-based. Much bigger lift, ~2-3 hours of your time + significant refactor on my side (~1000 lines in `hamletScene.js` collapse to ~300).

**Start with Path A.** Ship it. Then decide whether to escalate.

---

## Path A — Prop Upgrade Workflow

### Step 1 — Create one PixelLab "Object" per prop

Go to PixelLab → **Objects** tab (not Characters — we don't need animations).

Create **8 props**. Copy-paste the prompts below exactly. Use **"single color black outline"** and **"muted fantasy palette"** on every prompt so the hamlet visually rhymes with your mage.

All use **transparent background** and **top-down (low angle)** view.

#### 1. Forge Hut
```
Prompt:  top-down forge hut, wooden building with stone foundation,
         tall chimney with orange smoke drifting up, glowing warm
         orange interior visible through open doorway, anvil and
         tools outside entrance, pixel art, muted fantasy palette
         with warm amber accents
Size:    192 × 192 (tall building, slightly bigger than character)
```

#### 2. Archive Dome
```
Prompt:  top-down small stone dome building, arched doorway, stained
         glass window with cool cyan glow, ivy creeping up walls,
         scroll cases visible outside entrance, pixel art, muted
         fantasy palette with cool blue-teal accents
Size:    176 × 176
```

#### 3. Descent Tower (the ruined watchtower at the plaza center)
```
Prompt:  top-down tall ruined stone watchtower, broken battlements at
         top, cracks in masonry, dark vines climbing one side,
         shadowy open doorway at base with faint dark mist, pixel
         art, muted fantasy palette with ominous cold grey tones
Size:    160 × 240 (tall and narrow)
```

#### 4. Watcher Shrine (small standing stone)
```
Prompt:  top-down small mystical standing stone with glowing violet
         rune carved on face, circular stone base, offering bowl at
         foot, pixel art, muted fantasy palette with pale violet
         magical glow
Size:    96 × 128
```

#### 5. Broken Gate (for the east ruin)
```
Prompt:  top-down collapsed stone archway, one pillar still standing
         one pillar fallen, rubble scattered around base, broken
         wooden beam across entrance, weathered and abandoned, pixel
         art, muted fantasy palette with dirt and dust tones
Size:    160 × 160
```

#### 6. Fallen Bell (for tower base)
```
Prompt:  top-down large bronze bell lying on its side, cracked rim,
         dark green patina, small weeds growing around base, pixel
         art, muted fantasy palette with aged bronze tones
Size:    96 × 80
```

#### 7. Scaffolding (for rebuild zone)
```
Prompt:  top-down wooden scaffolding framework with rope lashings,
         partial stone wall under construction behind it, small
         stone blocks stacked at base, pixel art, muted fantasy
         palette with raw timber and grey stone tones
Size:    144 × 160
```

#### 8. Campfire (proper stone ring with flames)
```
Prompt:  top-down stone campfire with ring of small boulders, bright
         warm orange flames in center, wisps of smoke rising,
         glowing embers scattered around base, pixel art, muted
         fantasy palette with vivid fire-orange accents
Size:    96 × 96
```

### Step 2 — Export each prop

Each Object in PixelLab has an Export button (or download icon). Save each PNG to your downloads folder.

Name them for clarity:
- `forge.png`
- `dome.png`
- `tower.png`
- `shrine.png`
- `gate.png`
- `bell.png`
- `scaffolding.png`
- `campfire.png`

### Step 3 — Drop the files

Move (or copy) all 8 PNGs to:
```
slime-depths/scripts/pixellab/imports/props/
```

I'll create the folder structure when you tell me you're ready.

### Step 4 — Tell me "props dropped"

I'll write `scripts/pixellab/import-props.js` which:
1. Copies each PNG to `public/assets/props/hamlet/<name>.png`
2. Registers them in `src/loader.js`
3. Replaces the procedural drawing calls in `src/hamletScene.js` with `ctx.drawImage(images.hamlet_forge, x, y, w, h)` etc.
4. Removes the ~800 lines of procedural prop drawing code
5. Verifies in preview that everything renders correctly

### Commands I'll run on my side

```bash
cd slime-depths
node scripts/pixellab/import-props.js          # one-shot import + wire up
npm run lint && npm run build                   # confirm green
# preview_screenshot to verify visually
```

### Expected outcome of Path A

- Hamlet looks dramatically better — real pixel-art buildings instead of colored ovals
- Ground stays procedural (dirt + path overlays) but that's a minor read against real sprites
- ~2 hour turnaround from your drop to in-game result

---

## Path B — Full Tilemap Rewrite (do ONLY after Path A isn't enough)

### Step 1 — Generate tilesets in PixelLab

Use PixelLab's **Maps → Tilesets** feature (32×32 tileset mode). Create **3 Wang tilesets**:

#### Tileset 1: Ground Terrain
```
Prompt:  top-down dirt-to-cobblestone-path Wang tileset, worn stone
         path transitioning to bare earth, pixel art, muted fantasy
         palette
Tile size: 32×32
Wang type: 16-tile (2x2 corners)
```

#### Tileset 2: Grass / Moss Edges
```
Prompt:  top-down dirt-to-moss-grass Wang tileset, patches of green
         moss and small grass tufts on bare earth, pixel art, muted
         fantasy palette with cool green tones
Tile size: 32×32
```

#### Tileset 3: Stone Ruins
```
Prompt:  top-down dirt-to-broken-stone-slabs Wang tileset, cracked
         flagstones and rubble transitioning to earth, weathered,
         pixel art, muted fantasy palette
Tile size: 32×32
```

### Step 2 — Paint the map in Sprite Fusion

1. Go to https://spritefusion.com/editor (free, no signup required)
2. Create new map: **30 tiles wide × 21 tiles tall** (matches 960×672 at 32px tiles)
3. Import each PixelLab tileset PNG
4. Paint the hamlet:
   - Center: cobblestone plaza (radial-ish)
   - Radiating from plaza: dirt paths to each building location
   - Edges (back + sides): moss/grass
   - Corners: broken stone / ruins
5. Export → **JSON format** (Sprite Fusion gives you tilemap JSON + tileset PNG)

### Step 3 — Drop the exports

Drop both files into:
```
slime-depths/scripts/pixellab/imports/hamlet-map/
  ├── tileset.png      (all tile variants stitched into one sheet)
  └── tilemap.json     (grid of tile indices + tileset reference)
```

### Step 4 — I rewrite the rendering

I'll replace `drawHamletBackdrop` with `drawTileMap(tilemap, tileset)` — a simple blit loop over the 30×21 grid. The procedural plaza / paths / pads all disappear (they're now authored tiles). Props from Path A layer on top exactly as they do now.

~900 lines of hamletScene.js become ~150.

### Commands I'll run

```bash
cd slime-depths
node scripts/pixellab/import-tilemap.js --name hamlet
npm run lint && npm run build
```

---

## What I'll have ready for when you're home

Before you drop files:

- [ ] Create `scripts/pixellab/imports/props/` folder (Path A drop target)
- [ ] Create `scripts/pixellab/imports/hamlet-map/` folder (Path B drop target)
- [ ] Pre-write `scripts/pixellab/import-props.js` against the known prop list
- [ ] Pre-write `scripts/pixellab/import-tilemap.js` against Sprite Fusion's JSON schema
- [ ] Audit which procedural draw calls in `hamletScene.js` get replaced by which prop

When you say "props dropped," we go from PNGs on disk to in-game in under 10 minutes.

---

## Questions to answer before starting

1. **Path A or straight to Path B?** Default: A.
2. **Any props missing from the 8-prop list?** E.g. does the rebuild zone need more than scaffolding? Grave markers for the west ruin?
3. **Do you want the existing procedural firepit replaced by a PixelLab campfire?** I included it in the list; easy to drop if you want to keep the animated procedural one.
4. **Do we fix the hero size issue first or in parallel?** (Separate agent is running a sizing audit — results will land before you do anything.)

---

## Prompt conventions — why these work

The prompts above follow the pattern that produced your mage. Core ingredients:

- **"top-down <thing>"** — establishes camera angle
- **Specific visual features** — helps PixelLab lock in silhouette
- **"pixel art"** — explicit style tag
- **"muted fantasy palette"** — matches the existing game
- **Color accent phrase** ("warm amber / cool blue / violet glow") — pushes one saturated color forward for focal clarity
- **No "animated"** — these are static props

If a prop generation comes back weird, retry with the same seed or simplify the prompt (drop adjectives). Don't over-describe — 30-40 words max per prompt.
