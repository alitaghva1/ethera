# Slime Depths — Godot 4 vertical slice

A small, runnable Godot 4 port of the **pre-ERW-pack version** of
slime-depths — procedural-dungeon look (vault biome), PixelLab
hero + slimes. None of the Epic RPG World asset-pack content (no
Ancient Ruins map, no orc-warrior, no stone golem). **Purpose**:
feel-test the engine on the gameplay layer you actually like
before committing to a full port.

## What you do

1. Download Godot 4.3+ (Standard edition, not .NET — we use GDScript only):
   https://godotengine.org/download/windows/
2. Unzip the Godot executable anywhere.
3. Run `Godot_v4.3-stable_win64.exe`. In the Project Manager, click
   **Import**, point at `slime-depths-godot/project.godot`, then
   **Import & Edit**.
4. Press **F5** (or the ▶ button top-right) to run.

First-run import: Godot will scan `assets/` and auto-generate `.import`
sidecar files for each PNG. Takes ~5 seconds. Sub­sequent runs are
instant.

## Controls

| Key | Action |
|---|---|
| WASD | Move |
| Left mouse | Sword swing (cooldown 0.4s) |
| Space | Dodge roll (iframes + speed burst, cooldown 0.85s) |
| R | Restart (after death) |

## What works in this slice (Iter 1)

- **Hero**: cloaked mage, idle / walk / attack animations, dodge with
  iframes, hit-stop on damage taken, damage-flicker, 3 HP.
- **Two enemy types**:
  - **Slime** — 1 HP trash mob, body-bumps for damage, chases on sight
  - **Skeleton** — 2 HP, real attack with windup telegraph (sprite tints
    red during the 0.55s wind-up — back away or take 1 dmg), attack-
    swing-cooldown state machine. ~30% of spawns.
- **Map**: procedural dungeon floor (1280×768) baked from the vault
  biome palette in `src/room.js` (`floorBase #33292f`, `floorLit
  #3a2f35`, `floorDark #2b2228`). Hash-driven 12%/5% noise rule
  matches `drawFloorTile`. 3-tile-wide stone wall border with rim
  shadow + top-edge highlight.
- **Lighting** (THE Godot showcase): `CanvasModulate` dims the world
  to dungeon-dark; six wall torches use `PointLight2D` with a baked
  radial-gradient texture + per-torch flicker (layered sin waves +
  per-frame jitter, same recipe as slime-depths' `main.js` torch
  rendering, ~20 lines of GDScript). Real dynamic 2D lighting in 6
  instances, zero custom shader code.
- **Camera**: smooth follow + map-bounds clamp via Camera2D's built-in
  `limit_*` + `position_smoothing_enabled`. Zero custom camera code —
  same fix that took ~50 lines in `slime-depths/src/main.js`.
- **Combat feel**:
  - Hit-stop: `Engine.time_scale = 0.05` for 0.08s on hero damage
  - Damage numbers: floating `+1` on enemy kill, `-1` on hero damage
  - White flash on enemy hit (Tween-based, matches `fx.js`)
- **HUD**: hearts top-left, controls hint top-left, kill counter top-right.

## What's still stubbed (next iterations)

| | slime-depths (JS) | this slice |
|---|---|---|
| 8-dir sprites | yes, atlas + direction-row math | south-only + h-flip |
| Per-tile collision | bake-time gameplay_collision JSON | 4 perimeter walls |
| Relics / fusions / themes | 46 relics, 17 fusions, 5 themes | none (Iter 4) |
| Pedestals + pickups | tier-scaled visuals, banner | none (Iter 2) |
| Wave runner | 3-wave state machine per zone | random spawn timer (Iter 2) |
| Hamlet hub | 8 NPCs + dialogue + smith + altar | none (Iter 5) |
| Memories / ascension / daily | full | none |
| Multiple rooms / doors | DAG of rooms + transitions | single room (Iter 3) |
| Boss intros | full-frame painted scenes | none (Iter 5) |
| Particles + slash VFX | rich | none (Iter 5) |

Iter 1 total: ~600 lines of GDScript across 5 scripts + 6 scenes + 10 PNGs.

## How to evaluate (5-minute test)

Run it. Walk around. Kill some slimes. Then ask yourself:

1. **Camera feel** — does the follow feel smoother than the JS
   version? (Godot's `position_smoothing` is built-in. JS rolls its
   own lerp.)
2. **Movement** — does WASD feel as snappy / snappier than the JS
   version? (Godot's `CharacterBody2D.move_and_slide` is C++. JS does
   manual collision per frame.)
3. **Asset import** — open `assets/` in the editor. Drag a new PNG
   in. Note that it auto-imports with the nearest-neighbor filter
   (set in `project.godot → rendering/textures/canvas_textures`).
   Compare against the JS pipeline's `import-pack-character.js` +
   manual `drawSize` / `bodyHeightFrac` tuning.
4. **Editing experience** — open `scenes/main.tscn` in the editor.
   Drag the hero around the level in the viewport. Tweak the
   `position_smoothing_speed` on the Camera2D and re-run. Notice the
   live workflow.

## What a full port would actually involve

If this slice feels meaningfully better, the port-order I'd recommend:

1. **Per-tile collision import**: small GDScript that reads
   `ruins_sample.json` at editor-time and spawns CollisionShape2D
   nodes per gameplay_collision rect. One-time tool. ~80 lines.
2. **8-direction sprites**: replace `flip_h` with a direction-row
   pick on the AnimatedSprite2D. ~30 lines change to `hero.gd`.
3. **Enemy roster**: port the remaining 4 ruins enemies (skel,
   crypt_spider, wizard, orc-Grudnok-boss) following the slime
   template. ~150 lines each, mostly the AI state machine.
4. **Wave runner**: port `src/zoneRunner.js` — wave state machine
   with cleared-room detection. ~200 lines.
5. **Relic system**: port `src/relics.js` + `src/fusions.js`. This
   is the biggest single piece of code (~1500 lines JS → estimate
   ~2000 GDScript with type annotations). Translates 1:1 but is the
   majority of the port work.
6. **HUD + zone card + boss intro**: Godot's Control nodes + CanvasLayer
   handle all of this more cleanly than the JS canvas-overlay
   approach. Will look better essentially for free.
7. **Save system**: Godot's `FileAccess` + `var_to_str` is simpler
   than the localStorage / Electron IPC plumbing in
   `src/storage.js`.

**Estimated full-port time**: 3-6 weeks of focused work, depending on
how much polish you want to preserve from the JS version. Most of
the gain is in the asset/scene workflow + camera/physics being
declarative — the gameplay-logic port is roughly 1:1 in line count.

## Project layout

```
slime-depths-godot/
├── project.godot          # Engine config (pixel-art filter, viewport,
│                          #  autoload, physics layers)
├── icon.svg               # Project icon (gold diamond, matches the
│                          #  JS game's tab favicon)
├── README.md              # This file
├── scripts/
│   ├── input_setup.gd     # Autoload — registers WASD + LMB inputs
│   ├── hero.gd            # CharacterBody2D, ~100 lines
│   ├── slime.gd           # CharacterBody2D, ~60 lines
│   └── main.gd            # Spawner + HP HUD, ~50 lines
├── scenes/
│   ├── main.tscn          # Root: map + walls + hero + HUD
│   ├── hero.tscn          # Hero scene with mage SpriteFrames
│   └── slime.tscn         # Slime scene with SpriteFrames
└── assets/
    ├── characters/        # mage_idle / walk / attack (south-row strips)
    ├── enemies/           # slime_idle / walk / death (verbatim from JS)
    └── rooms/             # ancient_ruins.png (baked composite)
```

## Source of truth (don't lose this)

The JS game at `../slime-depths/` remains the canonical version
during this evaluation. Don't make balance / content changes here —
just feel-test the engine fit. If we green-light the port,
everything moves over with intent.
