# ETHERA — Godot 4 port

In-game title **ETHERA** · tagline *beneath the ruin*. The folder name
is `slime-depths-godot` for parity with the original JS codebase at
`../slime-depths/`, but the game shipping to players is ETHERA. The
JS version remains the source of truth during the port; this Godot
project is the migration target.

Top-down action roguelite. Single hero class (cloaked mage), four
biomes planned, branching DAG runs with relics + fusions + memories.
Right now this is mid-port — combat loop + multi-room dungeon are
in; relic registry has 8 of 46. The hamlet hub was removed in iter 12
to focus the project on the core dungeon loop; it'll come back later
once the dungeon feels good.

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
| **Right mouse** | **Blast spell — magenta projectile (Iter 3, cooldown 0.55s)** |
| Space | Dodge roll (iframes + speed burst, cooldown 0.85s) |
| **Q** | **Shield — held stamina stance, blue tint + invuln while up** |
| **Shift** | **Dash Strike — burst toward cursor, AoE slash at the end (cd 1.2s)** |
| E | Claim relic at pedestal |
| ESC | Return to main menu (on death or after the floor cleared) |
| R | Retry the dungeon (after death) |

## What works in this slice (Iter 1–7)

**Iter 7 added** — audio system. `scripts/audio.gd` autoload
procedurally synthesizes 8 SFX (sword swing, blast, dodge, hero
damaged, hero died, enemy hit, enemy died, pickup) at game start as
22.05 kHz mono `AudioStreamWAV` resources — no audio asset files,
no codec quirks. Each sound is a sine/square/noise oscillator with
a pitch sweep + exponential-decay envelope. A 6-slot
`AudioStreamPlayer2D` pool plays them round-robin, parented to the
autoload so they survive scene transitions. Audio subscribes to the
existing Events bus — gameplay code didn't change at all; same
pattern FX uses. Settings volume slider now writes to the master
bus via `Audio.set_master_volume(0..1)`. Real foley + music are
follow-ups; placeholder tones give immediate "hits feel like hits".

**Iter 6 added** — multi-room dungeon system. The single-room dungeon
is replaced by a data-driven floor of 3 rooms (`scenes/rooms/*.tres`
`RoomConfig` resources) with door progression + HP carryover between
rooms via `GameState.persisted_hp`. Adding a 4th room is "drop a
.tres + append to `RunState.FLOOR_ROOMS`", no code changes.



**Combat-depth pass** — two new verbs and five new relics expand the
moment-to-moment kit. **Q-shield** is a held stance that drains a
100-point stamina meter at 60/s (full bar = ~1.7s of invuln) and
recovers at 25/s when released; running it dry trips a 0.5s break
cooldown so you can't button-mash it. **Shift-dash-strike** is a 0.18s
burst toward the cursor with iframes the whole way and an AoE sword
hit on landing (50 px radius, same damage as a normal swing — Iron Fang
carries over). New relics: **Swift Strike** (-20% sword cd), **Dodge
Master** (-30% dodge cd), **Iron Skin** (-1 dmg per hit), **Nimble**
(+30% move speed), **Heart of Stone** (+2 max HP). Float-typed mods
fold through a new `GameState.modifier_total_f` so fractional values
like -0.2 don't get int-truncated.

**Meta-UI layer** — three new screens frame the run.
`scenes/main_menu.tscn` is the title with **BEGIN / SETTINGS / QUIT**
on a centered stack, hover-scale tweens, and keyboard-first focus on
BEGIN so you can drive the menu without the mouse.
`scenes/settings_screen.tscn` hosts a placeholder **MASTER VOLUME**
slider (display-only; not wired to AudioServer yet) plus the canonical
controls list — WASD / LMB / RMB / Space / Q / Shift / E / R / ESC.
`scenes/death_screen.tscn` is a CanvasLayer-at-layer-200 overlay that
the dungeon shows on `hero_died` — reads `GameState.last_run_kills`,
`GameState.dungeon_runs`, and `GameState.owned_relics` to summarize
the run, then emits `retry_pressed` / `hamlet_pressed` signals so the
host scene owns the actual transition. Color palette mirrors
`dialogue_ui.tscn`: gold #c9a86a borders, cream #f4d9a0 text, near-black
#0a0810 ground, dark red #c04040 on the death title.

**Iter 5 added** — game-feel polish layer. Two new autoloads:
`scripts/events.gd` is a global signal bus (`hero_damaged`,
`enemy_hit`, `enemy_died`, `hero_dodged`, etc.); `scripts/fx.gd`
listens to those signals and applies screen shake (Tween on the
active Camera2D's `offset`, always ending at zero so it never
permanently drifts) + spawns CPUParticles2D bursts at the event
position. Four particle scenes under `scenes/fx/`: gold hit-spark
on enemy damage, red death-burst with gravity on enemy/hero death,
gray dodge-dust fan on the hero's roll, and a red blood-spatter on
hero damage. All particle scenes self-free after their lifetime —
no orphan nodes. The pattern is deliberately decoupled: gameplay
code (hero.gd, enemy.gd, main.gd) just emits an Events signal, and
both FX and any future system (audio, achievements) subscribe.

**Iter 4 added** — Enemy base class refactor + 2 new enemy types.
`scripts/enemy.gd` extracts the HP/take_hit/white-flash/death-machine
plumbing that Slime + Skeleton previously duplicated; subclasses now
just override `_enemy_tick(delta)`. Two new mob types build on it:
**Crypt Spider** (small, fast, 1 HP — completes the F1 trash roster)
and **Wizard** (ranged caster, kites the hero, fires a cyan arcane
orb that does 1 damage on hit). Projectile scene now supports both
hero blast AND enemy casts via a `target_group` @export. New wave
mix puts a wizard in wave 3 — close the gap OR pillar-dodge while
fighting the melee front.

**Iter 3 added** — the run loop. The dungeon is now a 3-wave runner
that drops a relic pedestal on clear; claiming a relic persists it
via the `GameState` autoload and the hamlet's top-right RELICS panel
shows your collection. New combat verb: **right mouse = blast spell**
(magenta projectile, hits enemies with 1 damage + Arcane Pulse bonus,
casts a real PointLight2D as it streaks past). Relic registry has
three starter relics — Iron Fang (+1 sword dmg), Arcane Pulse (+1
blast dmg), Stoneheart (+1 max HP). Each clear randomly offers one
you don't already own.

**Iter 2 added** — hamlet hub, NPCs with dialogue, scene transitions.
You now START in the hamlet, walk south to "DESCEND" through the
portal into the dungeon. Dying in the dungeon (or pressing ESC)
returns to the hamlet, where the run kill count is shown next to
your name. Three NPCs to talk to: **The Wanderer** (lore), **Berin
the Smith** (will offer a forge upgrade later), **The Oracle** (lore
+ hints). Press **E** within range to start a conversation, **E**
or LMB to advance.

**Iter 1 base**

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
