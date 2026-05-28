# Physics-Tether Prototype (PhysicsToyRoom)

A minimum-viable proof of one mechanic: the player cannot attack
directly. Their weapon is a heavy `RigidBody2D` (CursedGravestone)
tethered to them by a damped spring. To kill enemies, the player
must drag, swing, launch, and slam the stone into them.

The only question this prototype answers is: **is swinging the
gravestone fun?** No upgrades, no enemy variety, no art pass.

## How to launch

`project.godot`'s `run/main_scene` was switched from
`res://scenes/main_menu.tscn` to
`res://scenes/prototype/physics_toy_room.tscn`. Press F5 in the
editor or run the exe normally — you drop straight into the
prototype.

**To revert to the main game**: edit `project.godot` line 19 back
to `run/main_scene="res://scenes/main_menu.tscn"`.

## Controls

| Input              | Action                                     |
|--------------------|--------------------------------------------|
| `W A S D`          | Move                                       |
| Right Mouse `or` Space | Hold to pull the gravestone toward you |
| Release pull       | Gravestone keeps momentum                  |
| `1`                | Switch to Open Arena room                  |
| `2`                | Switch to Pillar Room                      |
| `3`                | Switch to Chokepoint Room                  |
| `R`                | Reset current room (respawn wave, home hero + stone) |
| `F1`               | Toggle debug panel visibility              |

## Room types

Three layouts hot-swap on 1 / 2 / 3 without leaving the scene. All
three share the same shell (1280×720 rectangle with exterior walls,
hero + gravestone, debug HUD). Only the interior obstacles and
enemy spawn points change.

| Room                | Tests                                              |
|---------------------|----------------------------------------------------|
| **Open Arena** (1)  | Raw movement, pull, release, swing, damage threshold |
| **Pillar Room** (2) | Ricochet, wrapping the tether around obstacles, gravestone getting caught, using cover |
| **Chokepoint** (3)  | Defensive use — parking the gravestone in a doorway as a battering ram against funneled enemies |

### Pillar Room layout

4 circular pillars (radius 32 px) at the corners of an inner
rectangle, leaving the center fully open for hero + gravestone:

- `(380, 220)` `(900, 220)`
- `(380, 500)` `(900, 500)`

Enemies still spawn at the room corners + top-center, so they have
to path around pillars to reach the hero.

### Chokepoint Room layout

One interior horizontal wall at y=400, split into two slabs with a
240-px gap at the center (x=520..760):

- Left slab: center `(300, 400)`, size `(440, 40)` — spans x=80..520
- Right slab: center `(980, 400)`, size `(440, 40)` — spans x=760..1200

Hero starts above the wall (y=360); chasers spawn below (y=540..640)
and must funnel through the gap.

## Debug panel

Top-right corner. Updated every frame with:

```
VEL     423 px/s
SLAM    YES
ROOM    PILLAR ROOM
ENEMIES 3
```

- `VEL` — gravestone's current linear velocity magnitude
- `SLAM` — `YES` if VEL ≥ 260 px/s (damage threshold), else `no`
- `ROOM` — current room type label
- `ENEMIES` — alive chaser count (excludes corpses mid-fade)

## What's in this folder

### New scripts (`scripts/prototype/`)

#### `toy_hero.gd` — 30 lines
Stripped-down `CharacterBody2D`. Pure WASD movement plus a single
read-only `pulling: bool` flag the gravestone polls every physics
tick. No swings, no relics, no animations, no HP. The reason this
exists separately from the main `hero.gd` (which is ~2500 lines):
that file carries the full combat surface and would have to be
ripped apart to make this prototype clean. Cheaper to start fresh.

#### `cursed_gravestone.gd` — 80 lines
`RigidBody2D` with a damped-spring tether to the hero. Two
stiffness modes:
- **Idle** (low stiffness, rest length 140 px): trails behind the
  player at a comfortable distance.
- **Pulling** (high stiffness, rest length 0): collapses toward
  the player. Rotating the player while pulling produces a
  centripetal swing arc — that's the "swing" feel.

Damping is manual (`linear_damp = 0`) so the spring constants
don't fight Godot's built-in damping. A hard cap
(`MAX_TETHER_LENGTH = 360 px`) snaps the stone back if it drifts
beyond reach — without this, full-speed player sprint would whip
the stone away forever.

Hit detection via `body_entered`. If the colliding body is in the
`toy_enemies` group AND the gravestone's linear velocity is above
`MIN_DAMAGE_VEL` (260 px/s), it calls `body.take_hit(impact_vel,
knockback_impulse)`. Below the threshold, the stone is just being
repositioned and shouldn't chip-damage.

#### `blob_chaser.gd` — 70 lines
Placeholder enemy. Constant-speed chase toward the player. 2 HP.
On `take_hit`: decrement HP, adopt the knockback velocity (decays
over `KNOCKBACK_TIME = 0.25 s`), tell the room to fire impact
feedback. On 0 HP: fade alpha → 0, then `queue_free`.

#### `physics_toy_room.gd` — ~280 lines
The root-scene controller. Owns the hit-feedback pipeline:
- `Engine.time_scale = 0.06` freeze for 0.08 s (hit-stop)
- `FX.shake(amp, dur)` — reuses the existing FX autoload
- `Events.enemy_hit.emit(world_pos)` — triggers the existing
  `audio.gd` enemy_hit beep AND `fx.gd` HIT_SPARK particle burst
  (both already subscribed to that signal in the main project)

Also owns:
- `RoomType` enum + `_build_room(rt)` dispatch — clears the
  ObstacleLayer and programmatically rebuilds pillars / chokepoint
  slabs when 1 / 2 / 3 is pressed.
- `_input(event)` handler — reads physical_keycode for KEY_1/2/3/R
  directly (no InputMap actions). Switches room or resets entities.
- `_reset_entities_and_respawn()` — wipes chasers, homes the hero
  and gravestone, clears gravestone velocity, respawns the wave.
- `_update_debug_panel()` — refreshes the top-right Label every
  frame with VEL / SLAM / ROOM / ENEMIES readouts.

Spawns 5 chasers per wave; respawns 1.5 s after the room empties
so playtesting doesn't require scene reloads.

### New scenes (`scenes/prototype/`)

All four scenes use `Polygon2D` shapes — no textures, no atlases.
The prototype's "art" is one colored shape per entity.

#### `toy_hero.tscn`
28-px pale-blue circle. Layer 2 (hero), mask 1 (walls only). NOT in
the gravestone's mask — the stone passes through the player so the
tether spring controls positioning instead of physics-push fighting
with it.

#### `cursed_gravestone.tscn`
34×44-px slate-grey gravestone silhouette with a darker cross
embossed on the front. Layer 8 (hero_attack), mask 1+4 = 5 (walls
+ enemies). Mass 5.0 (vs default 1.0) so it feels inertial — pull
feels like work, momentum is satisfying. `gravity_scale = 0`,
`linear_damp = 0`, `contact_monitor = true`.

#### `blob_chaser.tscn`
28-px red circle with one dark "eye" dot. Layer 4 (enemies), mask
1+2+8 = 11 (walls + hero + gravestone). The eye exists purely so
the player reads the blob as a creature, not a hitbox.

#### `physics_toy_room.tscn`
1280×720 single-screen rectangle. Dark plate floor, four
StaticBody2D wall slabs, hero spawned at (640, 360), gravestone at
(780, 360) so it's already within tether range. EnemyLayer and
**ObstacleLayer** are empty `Node2D`s that the script populates at
runtime — the obstacle layer gets rebuilt by `_build_room(rt)` on
every room switch. Camera2D at room center so `FX.shake` finds it.
Three UI labels (enemies counter, control hint, debug panel).

### Modified files

#### `scripts/input_setup.gd`
Added two bindings for the new `tether_pull` action:
- `KEY_SPACE` (key)
- `MOUSE_BUTTON_RIGHT` (mouse)

Right mouse is also bound to `blast` (used by the main game). The
two actions coexist because each scene only reads one of them —
no scene reads both `blast` and `tether_pull`.

#### `project.godot`
`run/main_scene` switched from `res://scenes/main_menu.tscn` to
`res://scenes/prototype/physics_toy_room.tscn`. One-line revert to
get back to the main game (see "How to launch" above).

## Where to tune

The two files worth opening first when something feels off:

### `scripts/prototype/cursed_gravestone.gd`
Top of file, under `─── Tether tuning ───`:
- `TETHER_REST_LENGTH = 140.0` — idle distance the stone trails at
- `PULL_STIFFNESS_IDLE = 22.0` — soft spring when not pulling
- `PULL_STIFFNESS_ACTIVE = 260.0` — yank strength when pulling
- `TETHER_DAMPING = 3.0` — bleeds off oscillation (lower = looser)
- `MAX_TETHER_LENGTH = 360.0` — hard cap before snap-back
- `SNAP_BACK_STIFFNESS = 28.0` — how forcefully it snaps back

Under `─── Damage / impact thresholds ───`:
- `MIN_DAMAGE_VEL = 260.0` — slam threshold (debug panel SLAM flag)
- `ENEMY_KNOCKBACK_MULT = 0.55` — fraction of gravestone vel → enemy

Mass / inertia (in `cursed_gravestone.tscn`):
- `mass = 5.0` — heavier feels more inertial; lower swings faster

### `scripts/prototype/physics_toy_room.gd`
Top of file, under various sections:
- `HIT_STOP_SCALE = 0.06` / `HIT_STOP_TIME = 0.08` — slam freeze
- `SHAKE_PER_VEL = 0.035` / `SHAKE_MAX = 18.0` / `SHAKE_DUR = 0.18`
- `ENEMIES_PER_WAVE = 5` / `RESPAWN_DELAY = 1.5`
- `HERO_HOME = (640, 360)` / `GRAVESTONE_HOME = (780, 360)` — reset anchors
- `PILLAR_RADIUS` + `PILLAR_POSITIONS` — pillar layout
- `CHOKEPOINT_LEFT_CENTER / SIZE`, `CHOKEPOINT_RIGHT_CENTER / SIZE` — chokepoint geometry
- `SPAWN_OPEN_OR_PILLAR` / `SPAWN_CHOKEPOINT` — per-room spawn arrays
- `DEBUG_DAMAGE_VEL_THRESHOLD = 260.0` — duplicate of MIN_DAMAGE_VEL for the debug panel (keep in sync)

### `scripts/prototype/blob_chaser.gd`
- `MOVE_SPEED = 80.0` — enemy chase speed
- `MAX_HP = 2` — hits to kill
- `KNOCKBACK_TIME = 0.25` / `KNOCKBACK_DECAY = 8.0` — recovery feel

## What the prototype reuses from the main project

Three autoloads do real work:
- `Events` — signal bus. We emit `enemy_hit` for audio + particle.
- `FX` — camera shake helper. `FX.shake(amp, dur)`.
- `Audio` — subscribes to `Events.enemy_hit` and plays the
  procedural beep (no sound asset required).

Everything else (HUD, relic strip, heart row, wave label, combo
counter, theme chips, ascendance auras, the 21 polish iters
137-157) is bypassed. The room is its own scene, none of those
nodes exist in it.

## What's intentionally missing

- Hero HP / damage / death — the chasers don't damage the player.
  This is purely a weapon-feel test. If movement starts feeling
  trivial, easy to add: enemies on contact apply damage to a new
  hero HP var, render a heart row, end-state when 0.
- Audio variety — one beep per hit (the existing audio.gd
  enemy_hit cue). Velocity-modulated audio is a polish stretch.
- Particle variety — one HIT_SPARK burst per hit (same one the
  main game uses for sword hits).
- Camera follow — fixed at room center. Room is one screen, no
  need to chase the hero.

## If the mechanic feels fun, candidate next iterations

1. **Tether feel knob pass** — `PULL_STIFFNESS_ACTIVE`,
   `TETHER_DAMPING`, `MAX_TETHER_LENGTH`. Spending 30 minutes here
   could double the satisfaction or kill it.
2. **Wall bounce sound + sparks** — gravestone hitting a wall
   should THUNK, not silently bounce.
3. **Velocity-dependent gravestone visual** — slight trail or
   color shift when above MIN_DAMAGE_VEL so the player can see
   "this swing will hurt."
4. **Tether cord visual** — currently invisible. A faint chain or
   energy line between player and gravestone would reinforce the
   "leashed weapon" identity.
5. **Different enemy weights** — a "heavy" chaser that needs a
   harder slam to flinch would force the player to use real
   centripetal swings, not just tap-pulls.
