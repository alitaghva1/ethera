# Hero — CharacterBody2D with WASD movement, mouse-aimed sword + blast,
# Space-key dodge roll, Q shield, Shift dash strike.
#
# Iter 12 (this revision): full 8-direction sprite system.
#   • mage_{idle,walk,attack,hurt,death}.png are 1024-tall sheets with
#     8 direction rows (N, NE, E, SE, S, SW, W, NW — north-first
#     clockwise; matches the PixelLab importer convention).
#   • SpriteFrames is built programmatically in _ready() — 5 states ×
#     8 directions × N frames = ~290 frames assembled from AtlasTexture
#     sub-regions on the 5 sheets. Doing it in code lets us share one
#     ANIM_DATA table rather than declare hundreds of sub_resources in
#     the .tscn.
#   • `_facing_dir` (0..7) replaces the old `_facing_west` bool. Direction
#     is computed from context each tick: attack/dash → aim, dodge →
#     dodge dir, walking → velocity, idle → sticky last facing.
#   • Hurt + death animations finally land. Hurt is a sprite-only overlay
#     during HURT_TIME so the player keeps control. Death freezes input
#     and holds the last death frame while main.gd shows the death screen.
#   • flip_h fakery is gone. Every facing has its own sprite row.
class_name Hero
extends CharacterBody2D

const SPEED              := 200.0
const HERO_DRAW          := 64
const ATTACK_RANGE       := 56
const ATTACK_ARC         := PI * 0.55
const ATTACK_COOLDOWN    := 0.40
const ATTACK_SWING_TIME  := 0.18
const MAX_HP             := 3

# iter-95: DODGE_* constants removed. The dodge ability is gone — the
# defensive toolkit is now just SHIELD (timing-based catch on Q) and
# DASH_STRIKE (i-frame engage on Shift). User design intent: "the only
# real dodge is the dash strike that keeps gameplay aggressive."
const HIT_IFRAMES        := 0.55

# Blast spell (Iter 3) — RMB ranged projectile.
const BLAST_COOLDOWN     := 0.55
# Iter 42 — multi-shot spread step. Angular offset (radians) between
# adjacent projectiles in a multi-shot. ~14° = noticeable spread that
# still lets all projectiles hit a clumped group at melee-blast range.
const BLAST_SPREAD_STEP: float = 0.245
# Iter 42 — crit damage multiplier. 1.5× chosen over 2× so crits feel
# rewarding without single-shotting tough enemies. Crit chance comes
# from `crit_chance_f` modifier (default 0; relic-driven).
const CRIT_DAMAGE_MUL: float = 1.5
const PROJECTILE_SCENE   = preload("res://scenes/projectile.tscn")
const DASH_TRAIL_SCENE   = preload("res://scenes/fx/dash_trail.tscn")
const BLAST_MUZZLE_SCENE = preload("res://scenes/fx/blast_muzzle.tscn")
const DEATH_PULSE_SCENE  = preload("res://scenes/fx/death_pulse.tscn")
# iter-87: PARRY_PULSE_SCENE removed (replaced by a sprite-sheet flash).
# iter-94: that sprite-sheet flash was removed too — see _start_shield.
# FxSpriteHelper preload retained because other systems (e.g. enemy
# spawn portals, slash arc via screen_flash) still use FxSprite.spawn.
const FxSpriteHelper = preload("res://scripts/fx_sprite.gd")
const PARRY_SHIELD_SCENE = preload("res://scenes/fx/parry_shield.tscn")
# iter-98: DASH_SHIELD_SCENE removed. The forward-facing cyan-gold bubble
# read as a "magical orb" and used the same color family as parry_shield
# (defensive) — but dash is offensive. The afterimages already sell
# "hero moving forward fast"; the bubble added nothing physical, only a
# magic-aura vibe that didn't fit the painted dark-fantasy palette.
# soul_burst relic — reuse the dash impact shockwave scene tinted red.
# Cheap visual until a dedicated VFX prefab lands.
const SOUL_BURST_SCENE   = preload("res://scenes/fx/dash_impact.tscn")
# Iter 68 — DODGE × STORM shock pulse. Dedicated cyan-white expanding
# ring spawned at the dodge START position when STORM tier >= 1. Scales
# with STORM tier (resonance: 80px / 1dmg; ascendance: 120px / 2dmg + stun).
const SHOCK_PULSE_SCENE  = preload("res://scenes/fx/shock_pulse.tscn")
# Iter 40 — FLAME ascendance fire pool. Spawned at every kill site
# when the hero owns 4+ FLAME relics. Stacks with soul_burst (which
# triggers on every 5th kill) — both can fire on a 5/10/15th kill.
const FIRE_POOL_SCENE = preload("res://scenes/fire_pool.tscn")
# Iter 72 — stat-stick redesigns. Four common-tier relics get triggered
# effects layered on top of their existing flat modifiers, each with a
# dedicated visual:
#   iron_fang     → every 6th sword hit drops EmberBurst at impact point
#   arcane_pulse  → every 5th blast forks ArcaneBolt to nearby enemy
#   stoneheart    → first kill each room spawns StonePulse + heals +1
#   iron_skin     → every absorbed hit sparks StoneShardBurst; every 4th
#                   absorption triggers a knock-back shard ring (no dmg,
#                   pure spacing — reuses StoneShardBurst at the hero)
# All FX follow the iter 67/68 minimal-scene grammar (geometry built in
# code, palette baked into the .gd, ring + fade lifecycle).
const EMBER_BURST_SCENE  = preload("res://scenes/fx/ember_burst.tscn")
const ARCANE_BOLT_SCENE  = preload("res://scenes/fx/arcane_bolt.tscn")
const STONE_PULSE_SCENE  = preload("res://scenes/fx/stone_pulse.tscn")
const STONE_SHARD_SCENE  = preload("res://scenes/fx/stone_shard_burst.tscn")

# Parry (Iter 25 — replaces the iter-5 held-shield-stance).
# Tap Q for a brief perfect-block WINDOW. Any incoming damage during
# the window is fully negated, spawns a cyan ring VFX, and triggers a
# short slow-mo so the player feels the catch. Outside the window, Q
# does nothing. After the window closes a flat cooldown blocks
# re-parrying so spamming Q can't substitute for actual timing.
#
# Why this design (vs the held stance it replaces):
# - Twin-stick top-down + mouse-aim + WASD + LMB/RMB already taxes the
#   hands; a held pinky-on-Q stance was awkward to maintain.
# - The held stance's stamina cycle (1.67 s drain + 4 s recover) made
#   it strictly worse than dodge for any threat under 2 seconds.
# - Tap-parry is a SKILL gate, not a resource gate. Mastering the
#   timing window is rewarding; the stamina bar was just punishing.
const SHIELD_WINDOW   := 0.20
const SHIELD_COOLDOWN := 0.7
const SHIELD_TINT     := Color(0.65, 0.95, 1.0, 1)   # cyan, distinct from dodge
# Brief slow-mo when the parry catches an incoming hit. Driven by
# Engine.time_scale via a one-shot tween in the hit handler.
const SHIELD_HIT_SLOWMO_SCALE := 0.30
const SHIELD_HIT_SLOWMO_TIME  := 0.10
# Iframes granted after a successful parry catch — long enough to
# prevent the same enemy from re-bumping us, short enough that we
# can't chain-parry through a wave for free.
const SHIELD_HIT_IFRAMES      := 0.30

# Dash Strike (Iter 25 — reworked). Pre-iter-25 the dash was 0.18 s
# of 600 px/s = 108 px of travel, with damage ONLY at the END radius.
# That meant the player had to pre-position the end point ON an enemy
# — easy to misjudge. Now:
#   - Duration extended to 0.28 s (168 px travel, visible commit)
#   - Pass-through damage along the path: any enemy the hero crosses
#     during the dash window takes a hit (one-shot per dash via the
#     _dash_hit_set tracker), in ADDITION to the final AoE.
#   - AoE radius bumped to 60 (was 50) so the boom feels bigger.
#   - Iframes extend 0.10 s PAST the dash end so a player who lands
#     next to a swinging enemy doesn't immediately eat damage.
#   - Light directional steering during the dash (input × 0.15 added
#     to dash_dir each tick) so the player can curve through tight
#     enemy groups.
#   - Cooldown 1.2 → 1.4 s to balance the strictly-stronger ability.
const DASH_STRIKE_SPEED    := 600.0
const DASH_STRIKE_DURATION := 0.28
# iter-95: cooldown trimmed 1.4 → 0.9. Dash strike is the only mobility
# option now (dodge ability removed); to keep the "aggressive" feel the
# user asked for, the engage is available roughly every second instead
# of every 1.4 s.
const DASH_STRIKE_COOLDOWN := 0.9
const DASH_STRIKE_RADIUS   := 60.0
const DASH_STRIKE_POST_IFRAMES := 0.10
const DASH_STRIKE_STEER_GAIN   := 0.15
# Hero collision radius is 14; we want a generous pass-through hit-box
# during dash so glancing impacts register. 40 covers hero body + small
# enemies (slimes ~22, spider ~12) without grabbing distant ones.
const DASH_STRIKE_PIERCE_RADIUS := 40.0
const DASH_STRIKE_PIERCE_DAMAGE := 1
# iter-80 retune (Workstream B of the post-iter-78 plan): port the JS
# dash afterimage feel. JS captures every ~0.018s (we were at 0.04 —
# 4× less dense) and tints golden (#ffd27a) — we were cyan-purple. The
# JS dash reads as "echo of light streaking through space"; cyan
# reads cold + un-rooted from the rest of the combat palette where
# slash/blast already use cyan-cream. Switching to gold gives dash a
# unique color identity AND matches the dash_trail particles which
# already lean warm in the JS reference.
#
# Tuning:
#   AFTERIMAGE_INTERVAL: 0.04 → 0.025  (denser ghost trail)
#   AFTERIMAGE_TINT:    cyan-purple    → warm gold
#   AFTERIMAGE_FADE_TIME: 0.22 → 0.30  (matches the JS AFTERIMAGE_LIFE)
#
# Iter 29 — afterimage cadence. Spawn one ghost every AFTERIMAGE_INTERVAL
# seconds during the dash window. 0.04 s ≈ 7 ghosts over a 0.28 s dash,
# enough to sell "leaving light behind" without flooding the scene.
const AFTERIMAGE_INTERVAL: float = 0.025
# Color tint applied to each afterimage Sprite2D. Cyan-purple matches
# the dash trail's particle palette so the afterimages + trail read
# as the SAME energy phenomenon.
const AFTERIMAGE_TINT: Color = Color(1.0, 0.82, 0.48, 0.65)
const AFTERIMAGE_FADE_TIME: float = 0.30

# Iter 11 — feel tuning.
const CAMERA_LOOKAHEAD       := 90.0
const CAMERA_LOOKAHEAD_LERP  := 3.5
const CAMERA_MOVE_THRESHOLD  := 15.0
const SPRITE_BASE_Y          := -23.0
const IDLE_BOB_AMP           := 1.6
const IDLE_BOB_FREQ          := 1.7
const IDLE_BOB_LERP          := 8.0
const STEP_INTERVAL          := 28.0
# Iter 132 — walk bob + shadow pulse. Fixes "up/down feels slidey" —
# front/back walk frames have minimal silhouette change, so the hero
# appears to glide. Adding a vertical bob synced to footfalls gives
# instant motion read from any angle. Shadow pulse (shrink on foot-up,
# expand on foot-down) reinforces the ground contact.
const WALK_BOB_AMP           := 2.5   # ±2.5 px vertical bob while walking
const WALK_BOB_FREQ          := 7.0   # ~7 cycles/sec at 200 px/s = synced to steps
const SHADOW_BASE_SCALE      := Vector2(0.22, 0.16)  # matches hero.tscn
const SHADOW_PULSE_AMP       := 0.025  # ±2.5% scale pulse per step

# Iter 12 — direction tables + animation metadata. Reads:
# DIR_NAMES[i] = direction suffix for bucket i (north-clockwise).
# ANIM_DATA[state] = { sheet, frames, fps, loop } — used both to build
# SpriteFrames at _ready and to pick the animation name each tick.
const CELL_SIZE  := 64
const NUM_DIRS   := 8
# Typed arrays so DIR_NAMES[i] resolves to String and DIR_VECS[i] to
# Vector2 — untyped Array elements come back as Variant and break := /
# String concat under Godot 4.6 strict warning-as-error mode.
const DIR_NAMES: Array[String] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"]
# Unit vectors for each direction bucket. Diagonals use precomputed
# 0.7071 (≈ √2/2) literals — Godot 4 const initializers must be
# evaluable at script-load time, which excludes method calls like
# Vector2(1,-1).normalized(). Same order as DIR_NAMES.
const DIR_VECS: Array[Vector2] = [
	Vector2(0, -1),
	Vector2(0.7071068, -0.7071068),
	Vector2(1, 0),
	Vector2(0.7071068, 0.7071068),
	Vector2(0, 1),
	Vector2(-0.7071068, 0.7071068),
	Vector2(-1, 0),
	Vector2(-0.7071068, -0.7071068),
]
const ANIM_DATA  := {
	"idle":   { "sheet": preload("res://assets/characters/mage_idle.png"),   "frames": 8, "fps":  8.0, "loop": true  },
	"walk":   { "sheet": preload("res://assets/characters/mage_walk.png"),   "frames": 8, "fps": 10.0, "loop": true  },
	"attack": { "sheet": preload("res://assets/characters/mage_attack.png"), "frames": 9, "fps": 22.0, "loop": false },
	"hurt":   { "sheet": preload("res://assets/characters/mage_hurt.png"),   "frames": 6, "fps": 17.0, "loop": false },
	"death":  { "sheet": preload("res://assets/characters/mage_death.png"),  "frames": 9, "fps": 10.0, "loop": false },
}

# Hurt anim plays for HURT_TIME — sprite-only, doesn't lock input. Shorter
# than HIT_IFRAMES so the visual cue clears before iframes drop.
const HURT_TIME := 0.35

# Iter 13 — melee + dash impact tuning.
# VFX_HEIGHT_OFFSET: the slash arc / blast trail spawn point sits at the
# mage's CHEST (sprite is offset Y=-23 with origin at her feet), so we
# emit Events.hero_attacked at global_position + (0, this). Previously
# they spawned at the hero's feet and looked detached from the casting
# animation.
const VFX_HEIGHT_OFFSET    := -28.0
# Knockback per successful melee hit. Light push, very brief — sells
# weight without trivializing tracking. Dash strike applies the bigger
# DASH_KNOCKBACK below since it's a committed engage.
const MELEE_KNOCKBACK_FORCE := 220.0
const MELEE_KNOCKBACK_TIME  := 0.10
const DASH_KNOCKBACK_FORCE  := 380.0
const DASH_KNOCKBACK_TIME   := 0.16
# Iter 19 — melee feel pass.
# MELEE_WINDUP: time between LMB press and the damage scan landing.
# Tiny (60 ms ≈ 3.6 frames) — barely perceptible as input lag, but
# enough that the slash_arc VFX has time to form before damage hits.
# Pre-iter-19 the slash arc spawned AT the same frame damage was
# dealt, which made the arc feel like a hit-marker rather than the
# swing itself.
const MELEE_WINDUP          := 0.06
# iter-97 — combat movement feel rework.
#
# The pre-iter-97 design had an additive forward lunge (220 px/s × 0.10s
# = ~11 px) layered on top of WASD velocity at every swing. Playtest
# feedback: "melee dashes forward in an almost unrealistic way" and
# "shooting/meleeing while moving feels unnatural." The lunge was the
# culprit on both fronts:
#   1. ~11 px instant push reads as "lurch" when WASD walk is also
#      ramping up via move_toward (out-of-sync acceleration curves).
#   2. With sustained walk + repeated swings, total velocity spiked to
#      ~390 px/s vs. the 200 px/s base walk.
#
# The JS reference (slime-depths/src/hero.js:1812-1817) has NO lunge —
# it plants the feet at 35% walk speed during the swing window. That's
# the "committed swing" feel of Hades / Diablo / PoE. Iter-97 ports
# that pattern verbatim.
#
# Companion: BLAST_FACING_WINDOW commits sprite facing to aim direction
# for 0.32s after each blast cast. Without it, walking west + shooting
# east left the sprite facing west while bolts emerged from the back.
# Mirrors hero.js:1413-1420.
const ATTACK_MOVE_SPEED_MUL := 0.35
const BLAST_FACING_WINDOW   := 0.32

# Iter 70 — feel pass for walk acceleration / hit knockback / aim assist.
#
# Pre-iter-70 walk velocity snapped instantly to `input * speed` each
# physics tick. On stop, it snapped to zero. That made stop/start reads
# as "teleporting" rather than "running" — particularly noticeable when
# the player taps a direction for a quick step. Necesse / VS feel
# benchmarks both ramp velocity over ~0.10 s so the avatar reads as a
# body with inertia.
#
# MOVE_ACCEL is intentionally HIGHER than MOVE_DECEL so press-release
# rounds the front but stops crisply — the press shouldn't feel mushy
# and the stop shouldn't feel like sliding on ice. Numbers tuned to:
#   - reach full SPEED (200) in ~0.083s (200/2400) — barely perceptible
#     as lag, just enough to round the curve.
#   - decel to zero in ~0.063s (200/3200) — feels like real release.
const MOVE_ACCEL: float = 2400.0
const MOVE_DECEL: float = 3200.0
# Speed below which we treat the hero as "not really moving" — drives
# the idle/walk anim swap so a tiny residual velocity from accel decay
# doesn't twitch the walk anim for one frame.
const IDLE_VELOCITY_THRESHOLD: float = 12.0

# Iter 70 — knockback on hero hurt. Brief impulse in the direction AWAY
# from the damage source, decays linearly over KNOCKBACK_TIME. Read in
# the walk-velocity branch of _physics_process and ADDED on top of the
# input velocity (instead of overriding) so the player can still steer
# OUT of the push if they react fast. Smaller than enemy knockback by
# design — the hero should feel slapped, not yeeted.
const HERO_KNOCKBACK_FORCE: float = 160.0
const HERO_KNOCKBACK_TIME: float = 0.14

# Iter 70 — projectile aim assist. When the player's cursor is within
# AIM_ASSIST_CONE radians of an enemy AND that enemy is within
# AIM_ASSIST_RANGE pixels, the blast direction snaps to point exactly
# at that enemy's center. Cone is ~10° (slightly tighter than the
# 12° feel-game default — the existing blast already has a 14° spread
# step for multi-shot, and we don't want assist to swallow the spread).
# Range covers typical engagement (the blast lives 1.4s × 520 px/s
# = 728 px, but the player aims at closer targets).
const AIM_ASSIST_CONE: float = 0.175      # ~10° in radians
const AIM_ASSIST_RANGE: float = 520.0

# iter-95: DODGE_CANCEL_THRESHOLD removed alongside the dodge ability.
# Iter-70 added a "cancel a half-elapsed dodge into a dash strike" feel
# improvement; with no dodge to cancel, the mechanic is gone too.
# Dash strike is now the only mobility option from a standing start.

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D
# Iter 195 — Shadow @onready removed. iter-192 batch 1 removed the
# Shadow Sprite2D node from hero.tscn (per user direction to remove
# character ground shadows entirely). The @onready var was missed,
# leaving `shadow` as null and triggering one spam-error per physics
# frame from the shadow.scale references at lines 885 + 894 (also
# removed by this commit).

var hp: int = MAX_HP
var _attack_cd := 0.0
var _attack_live := 0.0
var _attack_aim := Vector2.RIGHT
var _is_attacking := false

# Iter 201 — active relic cooldown timer. Decrements each frame; while
# > 0 the active relic input is gated. Reset to ACTIVE_RELIC_COOLDOWN
# on each successful activation. _active_relic_owned is cached at
# relic-claim so the input-handler doesn't dict-lookup every frame.
const ACTIVE_RELIC_COOLDOWN: float = 18.0
const ACTIVE_RELIC_RADIUS: float = 100.0
const ACTIVE_RELIC_DAMAGE: int = 3
var _active_relic_cd: float = 0.0

# Iter 12 — 0..7 bucket (N,NE,E,SE,S,SW,W,NW). Default south so the
# player sees the hero's face on spawn (not the back).
var _facing_dir: int = 4

# iter-95: _dodge_cd / _dodge_time / _dodge_dir removed alongside the
# dodge ability. _iframes survives — still set by dash_strike and by
# successful shield catches.
var _iframes := 0.0

# iter-103 — elite affix status effects (player-side mirror of the
# enemy.gd burn/slow machinery). Frost elites apply slow on contact;
# venom elites apply a DoT on contact.
#   _hero_slow_remaining     seconds until slow expires
#   _hero_slow_multiplier    current walk-speed multiplier (1.0 = normal)
#   _hero_venom_remaining    seconds until DoT expires
#   _hero_venom_tick_timer   countdown to next damage tick
# Multiple stacking calls take the WORSE / LONGER value (max-duration,
# min-multiplier) so an enemy can't accidentally clear an active effect.
var _hero_slow_remaining: float = 0.0
var _hero_slow_multiplier: float = 1.0
var _hero_venom_remaining: float = 0.0
var _hero_venom_tick_timer: float = 0.0
const HERO_VENOM_TICK_INTERVAL: float = 0.5   # tick every 0.5s
const HERO_VENOM_DAMAGE_PER_TICK: int = 1

var _blast_cd := 0.0

# Iter 25 — parry state (replaces shield_stamina/_shield_active/_shield_break_cd).
# _shield_time   counts down from SHIELD_WINDOW while the catch window is open.
# _shield_cd     blocks re-trigger until elapsed. Set in _update_parry after
#               the window closes (caught or not), keyed to SHIELD_COOLDOWN.
var _shield_time := 0.0
var _shield_cd   := 0.0
# Iter 29 — handle to the currently-active parry_shield instance so
# _on_shield_block can call shatter() on it. Null when no shield is up.
var _shield_ref: Node2D = null

var _dash_strike_cd := 0.0
var _dash_strike_time := 0.0
var _dash_strike_dir := Vector2.RIGHT
# Iter 64 — cached start position of the current dash-strike. Captured
# in _start_dash_strike, consumed in _resolve_dash_strike_hit by the
# FLAME resonance fire-trail spawner so it can stamp fire pools evenly
# along the dash path. Zero-vector when no dash is active.
var _dash_strike_start_pos: Vector2 = Vector2.ZERO
# Iter 25 — per-dash hit tracker. Reset on _start_dash_strike. Every
# physics tick during the dash, we scan enemies within
# DASH_STRIKE_PIERCE_RADIUS and damage any not already in this dict.
# Final AoE in _resolve_dash_strike_hit also skips already-hit ids so
# the same enemy can't be double-counted.
var _dash_hit_set: Dictionary = {}
# Iter 29 — afterimage spawn cadence. Reset to 0 on _start_dash_strike;
# accumulates each tick during the dash window. When it crosses
# AFTERIMAGE_INTERVAL we spawn a ghost + subtract the interval (so the
# spawn rate is exact regardless of physics tick rate).
var _afterimage_timer: float = 0.0

# Iter 12 — hurt is a transient visual; dying is terminal (locks input).
var _hurt_time := 0.0
var _is_dying := false

# Iter 17 — relic trigger state.
# _kill_counter  total enemies slain this run; bloodstone heals every 3rd
# _blast_counter total blasts cast this run; arcane_resonance crits every 4th
# _second_wind_used true once second_wind has revived; one-shot per run
var _kill_counter: int = 0
var _blast_counter: int = 0
var _second_wind_used: bool = false
# Iter 21 — chain_lightning trigger counter. Bumps on every successful
# enemy hit in melee; every 4th attempts a chain to a nearby enemy.
var _sword_hit_counter: int = 0
# iter-105: _phoenix_feather_used PROMOTED to GameState.phoenix_feather_used.
# Pre-iter-105 this was a hero instance var, which reset every room when
# main.tscn reloaded → relic effectively triggered once per ROOM (mythic-
# tier output on a legendary stat-line). Now read/written through the
# GameState autoload so it survives room transitions and resets only on
# start_dungeon_run. Iter-101 honest-fix had updated the description to
# "Each room" to match buggy behavior; iter-105 restores the original
# "Once per run" intent + reverts the description. See GameState
# `phoenix_feather_used` for the source-of-truth flag.
# (second_wind keeps its per-room reset — that's its design role: the
# per-encounter safety net, distinct from phoenix's premium one-shot.)
# iron_resolve — first wound each ROOM is fully absorbed. Auto-resets
# because every room transition reloads main.tscn and we get a fresh
# hero instance with this flag back to false. No manual reset needed.
var _iron_resolve_absorbed_this_room: bool = false

# iter-229 / Polish Team R2 — last damage source label for the death
# screen "CAUSE OF DEATH" line. Populated by take_damage's optional
# third arg (default "" — backward-compatible with all pre-iter-229
# callers). enemy.gd contact paths now pass _affix_aware_source_name()
# (e.g. "Slime", "Frost Wraith"); ember death AoE passes "Ember Burst";
# hazards / projectiles / DoT ticks leave it blank → death_screen
# falls back to "the dark" so the line still reads coherently.
# Also tracks the biggest single hit this run (max amount actually
# dealt after iron_skin / iron_resolve reductions) so the death
# screen can report "BIGGEST HIT: N damage."
var _last_damage_source_name: String = ""
var _biggest_hit_taken: int = 0

# Iter 72 — IRON FANG redesign counter. Bumps on every successful sword
# hit; on every 6th increment, spawn EmberBurst at the hit position for
# a 40-px AoE / 1 damage. Persists per-run (mirrors _sword_hit_counter)
# rather than per-room so a player whose 5th hit was end-of-room sees
# the 6th proc on the first hit of the next room.
var _iron_fang_hit_counter: int = 0
# Iter 226 / Expansion Team — SACRIFICIAL ECHO counter. Bumps in
# _on_enemy_died_for_relics on every kill; heals +1 HP every 5th tick.
# Distinct cadence from bloodstone (3) and lifestone (8) so the three
# relics stack as a layered BLOOD regen ramp without colliding on the
# same kill counts.
var _sacrificial_echo_counter: int = 0
# Iter 72 — ARCANE PULSE redesign counter. Bumps on every blast cast;
# on every 5th increment, the cast also forks a violet bolt to the
# nearest off-target enemy within 140px for 1 damage. Persists per-run.
var _arcane_pulse_cast_counter: int = 0
# Iter 214 — Phase 3 spell modifier counters. Each ticks ONCE per
# _start_blast call (NOT per projectile in a multi-shot) so the proc
# fires on its own cadence regardless of how many shots the cast
# spawns. Independent of _blast_counter so the modulo cycles don't
# accidentally sync up across relics.
var _split_cinder_cast_counter: int = 0
var _static_runes_cast_counter: int = 0
# Single-cast flag — set true at start of _start_blast if this cast is
# the STATIC RUNES proc cast, read inside _spawn_blast_projectile to
# bump storm_chain_count for each projectile in the cast (so multi-
# shot all benefit on the proc cast, not just the first projectile).
var _static_runes_proc_this_cast: bool = false
# Iter 72 — STONEHEART redesign per-room flag. Auto-resets on scene
# reload (same pattern as _iron_resolve_absorbed_this_room) so each
# new room re-arms the first-kill heal. No manual reset needed.
var _stoneheart_first_kill_armed: bool = true
# Iter 72 — IRON SKIN redesign counter. Bumps on every hit where the
# damage_taken_reduction subtraction actually saved damage; every 4th
# increment also fires a no-damage knockback shard ring around the
# hero. Persists per-run.
var _iron_skin_block_counter: int = 0

# Iter 66 — BLOOD theme sword lifesteal state.
# _pending_blood_tier is locked at SWING-time (in _start_attack) so a
# relic gained between swing-press and hit-resolve doesn't retroactively
# proc lifesteal (mirrors the burn/slow/flame-pool locking pattern at
# spawn-time on projectiles). Read in _resolve_melee_strike to decide
# the chance + +HP per proc.
#   0 = no BLOOD bonus
#   1 = resonance (≥2 BLOOD relics owned) — 20% chance per sword hit, +1 HP
#   2 = ascendance (≥4 BLOOD relics owned) — 40% chance per sword hit, +1 HP
#         AND the next sword hit after any enemy kill is guaranteed +2 HP
# _blood_guaranteed_next_hit fires once on the next melee hit when set
# (consumed at use); set by _on_enemy_died_for_relics when tier ≥ 2.
var _pending_blood_tier: int = 0
var _blood_guaranteed_next_hit: bool = false
# Iter 66 — tracked so back-to-back lifesteal procs can kill the prior
# pulse before starting a new one (otherwise scale-tweens compound and
# leave the hero sprite stuck mid-pulse).
var _blood_pulse_tween: Tween = null

# iter-97 — melee feel state. Replaced iter-19's _lunge_time / _lunge_dir
# pair with a blast-facing window so the sprite commits to the shot
# direction while WASD movement continues. While `_is_attacking` is
# true, walk velocity is multiplied by ATTACK_MOVE_SPEED_MUL — no
# additive lunge impulse anywhere.
# _pending_melee_strike + aim/range cached so the windowed damage
# scan in _physics_process knows what to hit.
var _blast_facing_time: float = 0.0
var _blast_facing_dir: Vector2 = Vector2.RIGHT
var _pending_melee_strike: bool = false
var _melee_strike_timer: float = 0.0
var _pending_melee_aim: Vector2 = Vector2.RIGHT
var _pending_melee_range: float = 0.0

# Iter 70 — hero hurt knockback state. Set in take_damage when a hit
# lands and the source position is known (Enemy.gd passes the contact
# point via the damaging signal path — for sources without a known
# position we fall back to "push along the hero's facing inversion"
# so we still see a small kinesthetic response).
# _knockback_dir is unit-normalized (or zero when no active push).
# _knockback_time counts down from HERO_KNOCKBACK_TIME; while > 0 the
# walk-velocity branch ADDS this vector × (time/total) on top of the
# input velocity so the player can still steer OUT of the push.
var _knockback_dir: Vector2 = Vector2.ZERO
var _knockback_time: float = 0.0

# Iter 54 — combo counter. Tracks consecutive successful hits landed
# by the hero (melee swing, dash strike, chain bolt, projectile,
# kill explosion damage). Resets to 0 whenever the hero takes
# damage. Pure cosmetic for now — drives a HUD label that scales
# up at tier thresholds (10/25/50/100). Future iter could attach
# damage multipliers or relic-driven bonuses.
#
# Why this matters: skill expression. A perfect dodge-and-counter
# run racks up massive combos visibly; a sloppy run resets to 0
# constantly. Without scoring stakes, the player still gets the
# "going off" feel from racking the counter up.
var _combo: int = 0

signal combo_changed(new_value: int)

func _bump_combo() -> void:
	_combo += 1
	combo_changed.emit(_combo)
	# Iter 57 — combo-tier achievements. Fired at exact thresholds so
	# the unlock lands ON the milestone, not after.
	if _combo == 50:
		GameState.unlock_achievement("hot_streak")
	elif _combo == 100:
		GameState.unlock_achievement("perfect_streak")

func _reset_combo() -> void:
	if _combo > 0:
		_combo = 0
		combo_changed.emit(0)

# Iter 149 — public getter so AttackFeel.compose_slash_opts can read the
# current combo state at swing-start and amplify the slash arc visuals
# (width / trail / color) at the same 10/25/50/100 tier thresholds the
# HUD combo label already escalates on. Keeping _combo itself private
# so combo math stays inside hero.gd; the getter is the read-only seam.
func get_combo() -> int:
	return _combo

# Iter 31 — environmental speed multiplier, applied to walk velocity.
# slow_zone hazards write to this (0.5 while hero inside) and reset to
# 1.0 on exit. Stacks multiplicatively so two overlapping slows = 0.25.
# Set by the slow_zone hazard's body_entered / body_exited via setters.
# Does NOT affect dodge or dash speed — those are committed actions
# that bypass the mire (treat as "you can escape if you blow a cooldown").
var _environment_speed_mul: float = 1.0
var _active_slow_zones: int = 0

func enter_slow_zone(mul: float) -> void:
	_active_slow_zones += 1
	_environment_speed_mul *= mul

func exit_slow_zone(mul: float) -> void:
	_active_slow_zones = max(0, _active_slow_zones - 1)
	if _active_slow_zones == 0:
		_environment_speed_mul = 1.0
	else:
		_environment_speed_mul /= mul

# Iter 11 — feel state.
var _camera: Camera2D = null
var _camera_offset := Vector2.ZERO
var _idle_time := 0.0
var _step_accumulator := 0.0
var _walk_time := 0.0  # iter-132: walk bob phase accumulator
var _last_anim: StringName = &""

signal hp_changed(new_hp: int)
signal hero_died
# Iter 22 — fired at the SAME instant as hero_died, but on a distinct
# channel so main.gd can split death-cinematic responsibilities from
# the existing _on_hero_died handler (which still drives the death
# screen + run-end state). The cinematic listener does slow-mo + camera
# zoom + vignette + "YOU DIED" banner; _on_hero_died stays focused on
# UI state. Separate signal = main.gd can connect/disconnect the
# cinematic independently (e.g. skip on debug auto-restart) without
# touching the existing teardown flow.
signal hero_death_started(world_pos: Vector2)
signal hit_received       # for camera shake + hit-stop in main.gd
# iter-95: dodge_started signal removed (it had no subscribers anyway,
# but it was emitted from _start_dodge which is also gone).
# Iter 13 — fired when a melee swing actually connects with ≥1 enemy.
# main.gd listens for a brief hit-stop scaled by hit_count. Distinct
# from Events.enemy_hit (which fires once per enemy and would multi-
# trigger hit-stop on a multi-hit swing).
# Iter 140 — `any_crit` added so the hit-stop handler can pick a deeper
# freeze when the swing rolled at least one crit. Genre cue: Hades crit
# slashes hold the freeze noticeably longer than a normal poke; that
# moment of "wait, did I just—" is what makes crits feel celebratory
# instead of being a hidden +damage.
signal swing_connected(hit_count: int, any_crit: bool)
# Iter 13 — fired at the END of dash strike, AFTER the AoE scan runs.
# main.gd listens to spawn the dash impact VFX + heavy camera shake.
# Reports hit_count so the shake / scene can scale with the kill.
signal dash_strike_landed(world_pos: Vector2, hit_count: int)

func _ready() -> void:
	_build_sprite_frames()
	add_to_group("hero")
	var hp_bonus: int = GameState.modifier_total("max_hp_bonus", 0)
	hp = MAX_HP + hp_bonus
	if GameState.persisted_hp > 0:
		hp = min(GameState.persisted_hp, MAX_HP + hp_bonus)
	tree_exiting.connect(_save_persistent_state)
	# Iter 17 — bloodstone relic listens for enemy deaths. Subscribed
	# unconditionally; the handler checks ownership before healing, so
	# we don't have to wire/unwire when the player claims it mid-run.
	Events.enemy_died.connect(_on_enemy_died_for_relics)
	# Play the default idle south so frame 0 of the right sheet shows
	# immediately — without this the AnimatedSprite2D has no current
	# animation and renders blank for a tick.
	_play_anim(&"idle_s")

# Build SpriteFrames programmatically from ANIM_DATA × DIR_NAMES. Each
# (state, dir) becomes one animation; its frames are AtlasTextures over
# the per-state sheet, sliced by (frame_index × CELL_SIZE, dir × CELL_SIZE).
# Doing this in code keeps the .tscn small and means adding a new state
# is a single ANIM_DATA entry, not 8 manual animation blocks.
func _build_sprite_frames() -> void:
	var sf: SpriteFrames = SpriteFrames.new()
	# Drop the "default" empty animation Godot creates with new SpriteFrames.
	if sf.has_animation("default"):
		sf.remove_animation("default")
	for state in ANIM_DATA:
		var data: Dictionary = ANIM_DATA[state]
		var sheet: Texture2D = data["sheet"]
		var n_frames: int = data["frames"]
		var fps: float = data["fps"]
		var loop: bool = data["loop"]
		for dir_idx in NUM_DIRS:
			var anim_name: StringName = StringName("%s_%s" % [state, DIR_NAMES[dir_idx]])
			sf.add_animation(anim_name)
			sf.set_animation_speed(anim_name, fps)
			sf.set_animation_loop(anim_name, loop)
			for fr in n_frames:
				var atlas: AtlasTexture = AtlasTexture.new()
				atlas.atlas = sheet
				atlas.region = Rect2(fr * CELL_SIZE, dir_idx * CELL_SIZE, CELL_SIZE, CELL_SIZE)
				sf.add_frame(anim_name, atlas)
	sprite.sprite_frames = sf

func _save_persistent_state() -> void:
	if hp > 0:
		GameState.persisted_hp = hp

func _physics_process(delta: float) -> void:
	_attack_cd        = max(0.0, _attack_cd        - delta)
	# Iter 201 — active relic cooldown tick. Decrements regardless of
	# whether the player owns the relic so a re-pickup doesn't get a
	# free instant cast.
	_active_relic_cd  = max(0.0, _active_relic_cd  - delta)
	# Iter 213 — BLOOD TITHE buff timer. Decrements; reaches 0 ends
	# damage multiplier + heal-on-kill window. No fade-out logic needed —
	# the aura visual self-frees via its own tween.
	_blood_tithe_buff_time = max(0.0, _blood_tithe_buff_time - delta)
	_attack_live      = max(0.0, _attack_live      - delta)
	# iter-95: _dodge_cd and _dodge_time timer decrements removed with
	# the dodge ability.
	_iframes          = max(0.0, _iframes          - delta)
	_blast_cd         = max(0.0, _blast_cd         - delta)
	_shield_time      = max(0.0, _shield_time      - delta)
	_shield_cd        = max(0.0, _shield_cd        - delta)
	_dash_strike_cd   = max(0.0, _dash_strike_cd   - delta)
	_hurt_time        = max(0.0, _hurt_time        - delta)
	# iter-97: _lunge_time gone. _blast_facing_time decays here so sprite
	# facing returns to walk-direction inference after the post-shot window.
	_blast_facing_time = max(0.0, _blast_facing_time - delta)
	_knockback_time   = max(0.0, _knockback_time   - delta)
	# iter-103: hero-side slow + venom status decay. Slow restores walk
	# multiplier when expired; venom ticks damage on a fixed interval
	# (HERO_VENOM_TICK_INTERVAL = 0.5s) and respects _iframes so the
	# DoT can't kill through dash-strike's safety window.
	if _hero_slow_remaining > 0.0:
		_hero_slow_remaining -= delta
		if _hero_slow_remaining <= 0.0:
			_hero_slow_multiplier = 1.0
	if _hero_venom_remaining > 0.0:
		_hero_venom_remaining -= delta
		_hero_venom_tick_timer -= delta
		if _hero_venom_tick_timer <= 0.0 and _hero_venom_remaining > 0.0:
			_hero_venom_tick_timer = HERO_VENOM_TICK_INTERVAL
			# DoT applies even through _iframes — that's the point of
			# poison, it bleeds you regardless of dodge windows. But
			# never below 0 hp + skip during death.
			if not _is_dying:
				hp = max(0, hp - HERO_VENOM_DAMAGE_PER_TICK)
				# Sickly green floater so the tick reads distinct from
				# enemy melee damage. Damage number library handles
				# the spawn; no scene needed.
				var parent: Node = get_parent()
				if parent != null:
					var dn: DamageNumber = DamageNumber.spawn(
						global_position + Vector2(0, -64),
						"-" + str(HERO_VENOM_DAMAGE_PER_TICK),
						Color(0.55, 0.85, 0.45),
					)
					parent.add_child(dn)
				if hp <= 0 and not _is_dying:
					# Venom kill: route through the existing death path.
					take_damage(0, global_position)
	if _attack_live <= 0.0:
		_is_attacking = false
	# Iter 19 — windowed melee damage. _start_attack arms the pending
	# strike + cached aim/range; when the windup timer expires here,
	# we run the actual hit scan. Keeps damage timing aligned with the
	# slash-arc growth animation (visible swing → solid hit).
	# Iter 20 bugfix — guard against post-death resolution. If the hero
	# dies during the 60 ms windup, cancel the pending strike so a
	# corpse doesn't deal damage from beyond the grave. The death
	# branch below also early-returns, but clearing the flag here is
	# tidier (avoids a stale "pending" sitting on the corpse).
	if _pending_melee_strike:
		_melee_strike_timer = max(0.0, _melee_strike_timer - delta)
		if _is_dying:
			_pending_melee_strike = false
		elif _melee_strike_timer <= 0.0:
			_pending_melee_strike = false
			_resolve_melee_strike()

	# Death is terminal — freeze input + motion, hold the death frame,
	# and skip every gameplay branch below. The death screen renders on
	# top via main.gd's _on_hero_died handler.
	#
	# Name-only check (no is_playing) — death anim is loop=false, so
	# is_playing() goes false once the corpse reaches its last frame.
	# The default _play_anim cache would re-trigger play() on every tick
	# after that, re-playing death from frame 0 forever. Compare names
	# directly so the corpse stays on its final frame.
	if _is_dying:
		velocity = Vector2.ZERO
		move_and_slide()
		var death_anim := StringName("death_" + DIR_NAMES[_facing_dir])
		if _last_anim != death_anim:
			_last_anim = death_anim
			sprite.play(death_anim)
		return

	var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")

	# Iter 25 — parry decays via the timer block above. No per-tick
	# behavior needed here (vs the held-stance shield, which had to
	# tick stamina drain/recover each frame). _start_shield arms it;
	# take_damage catches incoming hits during the window.

	# Dash pass-through damage: while the dash window is active, scan
	# enemies within DASH_STRIKE_PIERCE_RADIUS of the hero each tick.
	# Any enemy not yet in _dash_hit_set gets damaged + added. The
	# final AoE in _resolve_dash_strike_hit skips already-hit ids so
	# we don't double-count enemies hit mid-dash.
	if _dash_strike_time > 0.0:
		_apply_dash_pierce_tick()
		# Iter 29 — afterimages. Every AFTERIMAGE_INTERVAL seconds spawn
		# a cyan-purple ghost of the current sprite frame at the hero's
		# current position. The ghost fades alpha 0.55 → 0 over
		# AFTERIMAGE_FADE_TIME, then queue_frees. Combined with the
		# existing magenta particle trail, sells "the wizard is moving
		# so fast they leave light behind."
		_afterimage_timer += delta
		if _afterimage_timer >= AFTERIMAGE_INTERVAL:
			_afterimage_timer -= AFTERIMAGE_INTERVAL
			_spawn_dash_afterimage()

	var dash_strike_just_ended := false
	if _dash_strike_time > 0.0:
		_dash_strike_time -= delta
		if _dash_strike_time <= 0.0:
			_dash_strike_time = 0.0
			dash_strike_just_ended = true

	# iter-95: dodge velocity branch removed. Dash strike is now the
	# only "burst movement" mode.
	if _dash_strike_time > 0.0:
		# Iter 25 — light steering during dash. WASD input nudges the
		# dash direction by DASH_STRIKE_STEER_GAIN per axis, then we
		# renormalize. Lets the player curve through tight groups
		# without breaking the "committed engage" feel.
		if input.length() > 0.1:
			_dash_strike_dir = (_dash_strike_dir + input.normalized() * DASH_STRIKE_STEER_GAIN).normalized()
			_facing_dir = _vector_to_dir_idx(_dash_strike_dir)
		velocity = _dash_strike_dir * DASH_STRIKE_SPEED
	else:
		# Iter 31 — slow_zone hazards multiply walk speed via
		# _environment_speed_mul (default 1.0, halves while inside).
		# Multiplied IN, not added, so two overlapping slows stack
		# correctly (see enter_slow_zone/exit_slow_zone setters).
		var speed: float = SPEED * (1.0 + GameState.modifier_total_f("move_speed_mul", 0.0)) * _environment_speed_mul
		# iter-103: frost elite affix applies slow to hero on contact.
		# _hero_slow_multiplier defaults to 1.0; frost call drops it to
		# ~0.6 for ~1.0s. Multiplicative with environment slow (slow_zone
		# hazard) so the two stack correctly.
		speed *= _hero_slow_multiplier
		# iter-97: while attacking (sword OR blast — _is_attacking is set
		# by both _start_attack and _start_blast), plant the feet at 35%
		# walk speed. JS reference at slime-depths/src/hero.js:1812-1817
		# describes this as the Hades/Diablo/PoE "committed swing" feel:
		# you can still reposition but the hero is COMMITTING to the
		# action, not full-speed running mid-swing.
		if _is_attacking:
			speed *= ATTACK_MOVE_SPEED_MUL
		# Iter 70 — accel-ramped walk. Pre-iter-70 this was `velocity = input
		# * speed` (snap). That gave the hero an instant on/off response
		# that read as "teleporting" — particularly noticeable when the
		# player taps a direction for a quick step. move_toward ramps up
		# to the target velocity over MOVE_ACCEL px/s² and decays to zero
		# over MOVE_DECEL (faster than accel so the stop still feels
		# crisp, not slidey). Released input → target is Vector2.ZERO,
		# which decays via the same call. Knockback layers on TOP
		# afterward (additive).
		var target_velocity: Vector2 = input * speed
		var rate: float = MOVE_ACCEL if input.length() > 0.01 else MOVE_DECEL
		velocity = velocity.move_toward(target_velocity, rate * delta)
		# iter-97: additive forward lunge removed (was 220 × 0.1 = ~11 px
		# per swing). It read as "unrealistic dash forward" because the
		# instantaneous impulse stacked on top of the move_toward walk
		# acceleration ramp out-of-sync. The new ATTACK_MOVE_SPEED_MUL
		# above replaces it with a stance / planted-feet feel.
		# Iter 70 — hero hurt knockback. Linear-decay impulse layered ON
		# TOP of walk velocity (same pattern as lunge). Player can steer
		# OUT of the push by holding the opposite direction — this is the
		# "30% control during hurt" feel: the push wins for the first few
		# frames but the input integrates fast enough that a reactive
		# player isn't stuck on a wall.
		if _knockback_time > 0.0:
			var knockback_t: float = _knockback_time / HERO_KNOCKBACK_TIME
			velocity += _knockback_dir * (HERO_KNOCKBACK_FORCE * knockback_t)
	move_and_slide()

	if dash_strike_just_ended:
		_resolve_dash_strike_hit()

	# ── Facing ───────────────────────────────────────────────────────
	# Locked directions during committed actions; movement direction
	# during normal walk; sticky last-facing while idle.
	_facing_dir = _compute_facing(input)

	# Iter 25 — modulate. Parry tint takes priority (steady cyan during
	# the catch window so the player can SEE the active parry frame),
	# then iframes flicker on top when the parry isn't running. The
	# parry tint is steady, not pulsing, so it reads as "active block"
	# rather than "incoming damage."
	# Iter 150 — iframes upgrade: the pre-iter-150 hard binary flicker
	# (alpha snap between 0.45 and 1.0 at 10 Hz) read as "the hero is
	# broken / glitching." Replaced with a smooth 6 Hz SIN-pulse alpha
	# plus slight cyan tint (R=0.78, G=1.0, B=1.18) so the hero reads
	# as "spectral / invulnerable shielding" — the same visual
	# semantic Hades uses for Zagreus's dash i-frames. Pulse uses
	# Time.get_ticks_msec() so phase is global-clock-stable, not
	# _iframes-progress-dependent (consistent breathe regardless of
	# how long iframes have left).
	if _shield_time > 0.0:
		sprite.modulate = SHIELD_TINT
	elif _iframes > 0.0:
		var t_iframe: float = Time.get_ticks_msec() / 1000.0
		var pulse_iframe: float = 0.5 + 0.5 * sin(t_iframe * TAU * 6.0)
		var alpha_iframe: float = lerpf(0.50, 0.95, pulse_iframe)
		sprite.modulate = Color(0.78, 1.0, 1.18, alpha_iframe)
	else:
		sprite.modulate = Color(1, 1, 1, 1)

	# ── Animation state — dying handled above. hurt > attack > walk > idle.
	# Each is suffixed with the current direction bucket.
	# Iter 70 — read actual velocity, not raw input, so the accel ramp's
	# decay tail doesn't twitch back to idle on the frame input releases.
	# Threshold IDLE_VELOCITY_THRESHOLD px/s is well below the input cutoff
	# (input.length() > 0.1 mapped through SPEED = 20 px/s) so a tap-release
	# reads as "walk → continues walk for 50ms while decelerating → idle"
	# rather than "walk → snap to idle while still sliding."
	var is_moving := input.length() > 0.1 or velocity.length() > IDLE_VELOCITY_THRESHOLD
	var state_name: String
	if _hurt_time > 0.0:
		state_name = "hurt"
	elif _is_attacking or _dash_strike_time > 0.0:
		state_name = "attack"
	elif is_moving:
		state_name = "walk"
	else:
		state_name = "idle"
	_play_anim(StringName(state_name + "_" + DIR_NAMES[_facing_dir]))

	# ── Camera lookahead (iter 11) ────────────────────────────────────
	if _camera == null:
		_camera = get_node_or_null("Camera2D") as Camera2D
	if _camera != null:
		var target_offset := Vector2.ZERO
		if velocity.length() > CAMERA_MOVE_THRESHOLD:
			target_offset = velocity.normalized() * CAMERA_LOOKAHEAD
		_camera_offset = _camera_offset.lerp(target_offset, CAMERA_LOOKAHEAD_LERP * delta)
		_camera.offset = _camera_offset

	# ── Idle bob + footsteps (iter 11) ────────────────────────────────
	# ── iter-132: walk bob + shadow pulse (fixes "up/down feels slidey")
	if is_moving and _dash_strike_time <= 0.0 and not _is_attacking:
		_idle_time = 0.0
		_walk_time += delta  # iter-132: accumulate walk phase
		_step_accumulator += velocity.length() * delta
		if _step_accumulator >= STEP_INTERVAL:
			_step_accumulator = 0.0
			Events.hero_stepped.emit(global_position)
			# iter-85 immersion: tiny dust puff at hero's feet on each
			# step. Pairs with audio.gd's hero_stepped sound so the
			# player feels physical floor contact rather than gliding.
			# get_parent() (= main scene) is the spawn host so dust
			# stays in world space (vs parenting under hero, which
			# would drag the dust along — breaks the "left-behind"
			# read of the iter-29 particles convention).
			var parent_for_dust: Node = get_parent()
			if parent_for_dust != null:
				FootstepDust.spawn(parent_for_dust, global_position)
		# iter-132: walk bob — vertical oscillation synced to footfalls.
		# sin() wave at WALK_BOB_FREQ cycles/sec gives instant motion read
		# from front/back views where the walk sprite has minimal silhouette change.
		var walk_bob := sin(_walk_time * TAU * WALK_BOB_FREQ) * WALK_BOB_AMP
		sprite.position.y = lerpf(sprite.position.y, SPRITE_BASE_Y + walk_bob, IDLE_BOB_LERP * delta)
		# Iter 195 — iter-132 shadow pulse removed alongside the hero
		# Shadow Sprite2D node deletion in iter-192. The shadow_pulse
		# math was driving shadow.scale on null → physics-frame spam.
	else:
		_idle_time += delta
		_walk_time = 0.0  # iter-132: reset walk phase when stopped
		_step_accumulator = 0.0
		var bob := sin(_idle_time * TAU * IDLE_BOB_FREQ) * IDLE_BOB_AMP
		sprite.position.y = lerpf(sprite.position.y, SPRITE_BASE_Y + bob, IDLE_BOB_LERP * delta)
		# Iter 195 — iter-132 shadow scale-lerp removed alongside the
		# hero Shadow Sprite2D node deletion in iter-192.

	# iter-95 input precedence: shield > dash_strike > blast > attack.
	# Dodge is gone (and with it the iter-70 dodge-cancel-into-dash
	# feel-improver). The defensive toolkit collapses to two options:
	#   • SHIELD (Q) — stand-still timing-based catch
	#   • DASH_STRIKE (Shift) — aggressive engage with i-frames + AoE
	# Per user design intent: "the only real dodge is the dash strike
	# that keeps gameplay aggressive."
	if Input.is_action_just_pressed("shield") and _shield_cd <= 0.0 and _shield_time <= 0.0:
		_start_shield()
	elif Input.is_action_just_pressed("dash_strike") and _can_start_dash_strike():
		_start_dash_strike()
	elif Input.is_action_pressed("blast") and _blast_cd <= 0.0 and _shield_time <= 0.0 and _dash_strike_time <= 0.0:
		_start_blast()
	elif Input.is_action_pressed("attack") and _attack_cd <= 0.0 and not _is_attacking and _shield_time <= 0.0 and _dash_strike_time <= 0.0:
		_start_attack()
	# Iter 201 — active relic input. Outside the if/elif chain because
	# active relic should be triggerable mid-swing / mid-blast (it's
	# a defensive/burst tool the player uses when surrounded). Only
	# fires if (a) an active relic is owned, (b) cooldown ready,
	# (c) hero alive. Press-once gate via is_action_just_pressed.
	# Iter 213 — dispatcher dispatches on GameState.get_owned_active_id()
	# rather than the iter-201 single hardcoded soul_surge check.
	if Input.is_action_just_pressed("active_relic") \
			and _active_relic_cd <= 0.0 \
			and not _is_dying:
		var active_id: String = GameState.get_owned_active_id()
		match active_id:
			"soul_surge":
				_trigger_soul_surge()
			"veilstep":
				_trigger_veilstep()
			"ashen_seal":
				_trigger_ashen_seal()
			"blood_tithe":
				_trigger_blood_tithe()

# Facing picker. Returns the direction bucket the sprite should render
# THIS tick. Priority: dying = sticky · hurt = sticky · attacking/dashing
# point at the aim/dash vector · walking points at movement · idle keeps
# last facing.
#
# iter-95: the dodge branch is gone — dodge ability removed. Dash
# strike already covers "moving fast in a direction" for facing purposes.
func _compute_facing(input: Vector2) -> int:
	if _is_attacking and _attack_aim.length() > 0.001:
		return _vector_to_dir_idx(_attack_aim)
	if _dash_strike_time > 0.0:
		return _vector_to_dir_idx(_dash_strike_dir)
	# iter-97: blast facing window. For 0.32s after a shot the sprite
	# faces the aim direction even if WASD continues — JS hero.js:1413-1420.
	# Comes AFTER the attack/dash branches so an in-flight attack still
	# takes priority, but BEFORE the walk-direction inference so movement
	# doesn't override the recent shot commitment.
	if _blast_facing_time > 0.0 and _blast_facing_dir.length() > 0.001:
		return _vector_to_dir_idx(_blast_facing_dir)
	if input.length() > 0.1:
		return _vector_to_dir_idx(input)
	return _facing_dir

# Vector → row index. Returns bucket 0..7 for N, NE, E, SE, S, SW, W, NW.
# Godot 2D: +X = east, +Y = south (Y axis points down). A zero-length
# vector returns the current facing (callers should guard, but defensive
# anyway).
func _vector_to_dir_idx(v: Vector2) -> int:
	if v.length() < 0.001:
		return _facing_dir
	# angle returns -PI..PI. Add PI/2 so north (-PI/2) → 0, east → PI/2,
	# south → PI, west → 3PI/2. Divide by PI/4 → 0..7 buckets; round to
	# pick the nearest one. posmod brings negatives back into 0..7.
	var angle: float = v.angle()
	var b: int = int(round((angle + PI / 2.0) / (PI / 4.0)))
	return ((b % NUM_DIRS) + NUM_DIRS) % NUM_DIRS

# iter-95: _start_dodge() removed alongside the dodge ability. The
# SHADOW + STORM theme procs (iter-40 shockwave, iter-62 trail, iter-68
# shock pulse) that used to fire here have been REANCHORED to
# _start_dash_strike — see that function. The SHADOW resonance dodge
# trail (iter-62) is fully removed since dash_strike already spawns its
# own trail via DASH_TRAIL_SCENE.

# Inverse of _vector_to_dir_idx — used for "what direction is the hero
# facing when no input vector is available" (e.g. attack with no WASD).
# Reads from the class-level DIR_VECS table (literal-only because const
# initializers must be load-time-evaluable).
func _dir_to_vector(dir_idx: int) -> Vector2:
	return DIR_VECS[dir_idx]

func _start_attack() -> void:
	var aim_world := get_global_mouse_position() - global_position
	if aim_world.length() < 1.0:
		aim_world = _dir_to_vector(_facing_dir)
	_attack_aim = aim_world.normalized()
	_attack_cd = ATTACK_COOLDOWN * (1.0 + GameState.modifier_total_f("sword_cooldown_mul", 0.0))
	_attack_live = ATTACK_SWING_TIME
	_is_attacking = true
	_facing_dir = _vector_to_dir_idx(_attack_aim)
	sprite.frame = 0
	_play_anim(StringName("attack_" + DIR_NAMES[_facing_dir]))
	# Iter 19 — spawn the slash arc IMMEDIATELY (so the player sees the
	# swing form) but defer the actual damage scan by MELEE_WINDUP. The
	# damage lands when the arc has visibly extended; the swing reads
	# as a real motion arc instead of a hit-marker.
	Events.hero_attacked.emit(global_position + Vector2(0, VFX_HEIGHT_OFFSET), _attack_aim)
	# iter-97: lunge arming removed. The forward impulse is gone — see
	# the ATTACK_MOVE_SPEED_MUL block in _physics_process for the
	# replacement "committed stance" feel.
	# Arm the damage scan. _physics_process runs _resolve_melee_strike
	# when the timer hits 0. The aim + range are cached now so a player
	# spinning the cursor during the windup doesn't change where the
	# strike lands (matches the visible arc direction).
	_pending_melee_aim = _attack_aim
	_pending_melee_range = ATTACK_RANGE * (1.0 + GameState.modifier_total_f("attack_range_mul", 0.0))
	_pending_melee_strike = true
	_melee_strike_timer = MELEE_WINDUP
	# Iter 66 — lock the BLOOD theme tier at swing-time. Reading the tier
	# again at hit-time would let a relic gained between press and resolve
	# retroactively proc lifesteal on the in-flight swing — same locking
	# pattern as burn_chance / slow_chance / flame_impact_pool_life on
	# projectiles. Re-reads each swing, so claiming the relic mid-room
	# still procs on subsequent swings.
	_pending_blood_tier = GameState.theme_tier("blood")

# Damage scan deferred from _start_attack by MELEE_WINDUP. Hit pizza-
# slice in front of the hero: any enemy within _pending_melee_range
# and within ATTACK_ARC half-angle of _pending_melee_aim takes damage,
# knockback, and counts toward swing_connected.
# executioner helper — is this enemy at or below 25% HP? Reads
# enemy.hp (int) and enemy.enemy_type.max_hp (int). Defensive against
# missing fields / divide-by-zero on weird custom enemies — returns
# false rather than crashing the swing.
func _is_executable(enemy: Node) -> bool:
	if not is_instance_valid(enemy):
		return false
	if not ("hp" in enemy):
		return false
	var cur_hp: int = int(enemy.get("hp"))
	var max_val: int = 0
	if "enemy_type" in enemy:
		var et: Variant = enemy.get("enemy_type")
		if et != null and "max_hp" in et:
			max_val = int(et.get("max_hp"))
	if max_val <= 0:
		return false
	var ratio: float = float(cur_hp) / float(max_val)
	return ratio < 0.25

# Iter 42 — crit roll helper. Reads crit_chance_f modifier (default 0.0,
# range 0..1) and rolls. Returns true on crit. Used by both melee and
# projectile damage paths so a single relic key drives all crit
# behavior cleanly. randf() < chance avoids the off-by-one of
# `<=`-with-equal-to-chance edge cases.
func _roll_crit() -> bool:
	var chance: float = GameState.modifier_total_f("crit_chance_f", 0.0)
	if chance <= 0.0:
		return false
	return randf() < chance

# Iter 43 — burn roll. Reads burn_chance_f modifier (default 0.0,
# range 0..1). Applies DoT to the hit enemy via enemy.apply_burn.
# Burn duration is fixed (1.6s = 4 × 0.4s ticks for 4 damage total)
# so the BURN_CHANCE_F stat is purely a trigger probability.
func _roll_burn() -> bool:
	var chance: float = GameState.modifier_total_f("burn_chance_f", 0.0)
	if chance <= 0.0:
		return false
	return randf() < chance

# Iter 46 — slow roll. STORM's parallel to FLAME's burn. Reads
# slow_chance_f modifier (default 0.0, range 0..1). On success, the
# hit enemy gets a 1.4s slow (~45% speed reduction) via apply_slow.
# Composes with chain_lightning + STORM ascendance: a chain bolt that
# lands also rolls slow, so an arc-cannon build can paint a wave in
# blue and burn-yellow simultaneously.
const SLOW_DURATION: float = 1.4
func _roll_slow() -> bool:
	var chance: float = GameState.modifier_total_f("slow_chance_f", 0.0)
	if chance <= 0.0:
		return false
	return randf() < chance

func _resolve_melee_strike() -> void:
	var damage: int = 1 + GameState.modifier_total("sword_damage_bonus", 0)
	# Iter 213 — BLOOD TITHE multiplier. +50 % during the buff window.
	# Applied AFTER relic mods so it scales the full stick.
	damage = int(round(float(damage) * _blood_tithe_damage_mul()))
	# Iter 21 — relic-driven modifiers:
	#   wide_arc      widens the cone (attack_arc_mul)
	#   iron_grip     amps knockback force (knockback_force_mul)
	#   chain_lightning  arcs damage to a nearby second enemy on every 4th hit
	#   executioner   +150% damage to enemies below 25% HP (per-enemy check
	#                 inside the loop, since each enemy has its own ratio)
	var arc_actual: float = ATTACK_ARC * (1.0 + GameState.modifier_total_f("attack_arc_mul", 0.0))
	var knockback_mul: float = 1.0 + GameState.modifier_total_f("knockback_force_mul", 0.0)
	var has_chain: bool = GameState.has_relic("chain_lightning")
	var has_execute: bool = GameState.has_relic("executioner")
	var hit_count: int = 0
	# Iter 140 — track whether ANY enemy in this swing's hit list rolled a
	# crit. Used at emit time so main.gd's hit-stop handler can deepen the
	# freeze on crit swings. A swing that hits 3 enemies and crits ONE of
	# them still counts as a "crit swing" for the freeze — the celebratory
	# beat is owned by the swing, not by each individual enemy.
	var any_crit: bool = false
	# Track which enemies were already hit this swing so the chain
	# can't loop back to the original target.
	var hit_set: Dictionary = {}
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(enemy):
			continue
		# Iter 224 — Bug Team guard. A future non-Node2D node in the
		# "enemies" group would crash `.global_position` access below.
		if not (enemy is Node2D):
			continue
		var to_enemy: Vector2 = enemy.global_position - global_position
		if to_enemy.length() > _pending_melee_range:
			continue
		if abs(to_enemy.angle_to(_pending_melee_aim)) > arc_actual:
			continue
		if enemy.has_method("take_hit"):
			var dmg_for_this: int = damage
			if has_execute and _is_executable(enemy):
				dmg_for_this = int(round(float(damage) * 2.5))
			# Iter 42 — crit roll per enemy hit. Stacks with executioner's
			# 2.5× (a crit on an executable enemy lands at exec_dmg × 1.5,
			# rounded). Per-enemy roll means a cleave hits some enemies
			# for crit and others not — reads as "lucky swing" not "every-
			# or-nothing."
			var is_crit: bool = _roll_crit()
			if is_crit:
				dmg_for_this = int(round(float(dmg_for_this) * (CRIT_DAMAGE_MUL + GameState.modifier_total_f("crit_damage_bonus_f", 0.0))))
				any_crit = true  # iter-140 — sticky across the swing
			enemy.take_hit(dmg_for_this, is_crit)
			# Iter 226 / Expansion Team — LUCKY KNIFE. If THIS strike
			# was a crit AND it killed the target (enemy.hp ≤ 0 after
			# take_hit's hp subtract), roll crit_bonus_ether_chance_f
			# for a bonus +1 Ether Shard at the strike site. Reads at
			# the player as "lucky cuts pay you back." Awards via
			# GameState.award_ether_shards which honors ETHER_MAGNET's
			# 1.25× multiplier transparently. Per-hit roll on per-kill
			# event = naturally capped at 1 proc per cleave per enemy.
			if is_crit and enemy.hp <= 0:
				var lk_chance: float = GameState.modifier_total_f("crit_bonus_ether_chance_f", 0.0)
				if lk_chance > 0.0 and randf() < lk_chance:
					GameState.award_ether_shards(1)
					var lk_floater: DamageNumber = DamageNumber.spawn(
						enemy.global_position + Vector2(0, -40),
						"+1 SHARD",
						Color(0.6, 0.85, 1.0),  # ether-cyan to differentiate from gold drops
					)
					if get_parent() != null:
						get_parent().add_child(lk_floater)
			# Iter 43 — burn roll per enemy hit. burn_chance_f is a
			# float modifier (0..1). Burn duration is fixed (1.6s = 4
			# ticks @ 0.4s) so the proc is "set on fire" rather than
			# scaling with relic count. Stacking relics increases the
			# CHANCE to trigger; the burn itself is a binary state.
			if _roll_burn() and enemy.has_method("apply_burn"):
				enemy.apply_burn(1.6)
			# Iter 46 — slow roll per enemy hit. Same per-hit pattern
			# as burn; the two can stack on a single enemy (burning AND
			# slowed = orange-blue mixed tint, but burn tint wins per
			# the enemy.gd guard).
			if _roll_slow() and enemy.has_method("apply_slow"):
				enemy.apply_slow(SLOW_DURATION)
			# Iter 66 — BLOOD theme sword lifesteal. Per-hit roll using the
			# tier locked at swing-time. Tier 1 (resonance): 20% chance for
			# +1 HP. Tier 2 (ascendance): 40% chance for +1 HP AND a
			# guaranteed +2 HP on the very next sword hit after any kill
			# (the guaranteed flag is set in _on_enemy_died_for_relics).
			# The guaranteed-hit consumes the flag and short-circuits the
			# chance roll — it can stack ON TOP of a separate chance proc
			# on the SAME hit if a non-guaranteed mob is also struck this
			# swing (cleave: first enemy in loop pops guaranteed, second
			# rolls 40%). Lifesteal is independent of bloodstone (kill-
			# counter +1 HP every 3rd) and the iter-44 on-kill lifesteal
			# (lifesteal_chance_f → +1 HP magenta). Reads at the player as
			# "your sword is drinking" vs "the relic was satisfied."
			if _pending_blood_tier > 0:
				_try_blood_lifesteal(enemy)
			hit_count += 1
			hit_set[enemy.get_instance_id()] = true
			# Iter 54 — combo: each melee hit landed counts.
			_bump_combo()
			_sword_hit_counter += 1
			# Chain on every 4th hit. Find the nearest other enemy
			# within CHAIN_RADIUS px of the source and zap it for 1.
			if has_chain and _sword_hit_counter % 4 == 0:
				_try_chain_from(enemy, hit_set)
			# Iter 72 — IRON FANG redesign. +1 sword dmg already folded
			# into `damage` via sword_damage_bonus; here we add the
			# every-6th-hit ember burst. Snapshot AoE: 40-px radius, 1
			# damage at the hit position (enemy.global_position). Skips
			# the originally-hit enemy implicitly because EmberBurst's
			# damage scan re-finds enemies in range — if the original
			# enemy died from `enemy.take_hit(dmg_for_this)` above, it's
			# no longer in the "enemies" group; if it survived, taking a
			# second 1-damage tick is fine (mirrors how soul_burst /
			# kill_explosion both can re-damage the triggering kill site).
			if GameState.has_relic("iron_fang"):
				_iron_fang_hit_counter += 1
				if _iron_fang_hit_counter % 6 == 0:
					_trigger_iron_fang_burst(enemy.global_position)
		if enemy.has_method("apply_knockback"):
			var push_dir: Vector2 = to_enemy.normalized() if to_enemy.length() > 0.01 else _pending_melee_aim
			enemy.apply_knockback(push_dir, MELEE_KNOCKBACK_FORCE * knockback_mul, MELEE_KNOCKBACK_TIME)
	if hit_count > 0:
		swing_connected.emit(hit_count, any_crit)
		# Iter 39 — STORM ascendance (4+ STORM relics owned). Every
		# connecting swing fires an extra bolt at the nearest enemy
		# in CHAIN_RADIUS of the HERO (not of a hit enemy — keeps the
		# proc reliable even when the swing hit a clump close to the
		# hero). With chain_lightning ALSO owned, every 4th swing
		# yields TWO bolts (chain_lightning's plus STORM's), every
		# other swing yields ONE — concrete bullet-hell scaling.
		if GameState.theme_tier("storm") >= 2:
			_try_chain_from(self, hit_set)
		# Iter 61 — FLAME ascendance (4+ FLAME relics): connecting melee
		# swings drop a MINI fire pool (0.6s vs the 2s kill pool) at the
		# hero's aim point. Reads as "your sword is on fire — its trail
		# burns the ground." Stacks with embers_of_ruin burn (which
		# lights enemies directly) for layered FLAME pressure.
		if GameState.theme_tier("flame") >= 2:
			_trigger_swing_fire_trail()

# Iter 61 — drop a brief fire pool at the position the sword swung to.
# Uses the existing FIRE_POOL_SCENE but with a shorter _life (0.6s)
# so the swing trail decays faster than the kill pool. The pool's
# overlap-damage logic still applies — enemies walking through the
# trail in the next 0.6s take ticks.
func _trigger_swing_fire_trail() -> void:
	var pool: Node2D = FIRE_POOL_SCENE.instantiate() as Node2D
	if pool == null:
		return
	# Position the trail at the swing's aim direction, slightly forward
	# of the hero — so the burn appears WHERE THE SWORD ARC LANDED, not
	# at the hero's feet.
	var trail_pos: Vector2 = global_position + _pending_melee_aim * (_pending_melee_range * 0.55)
	pool.global_position = trail_pos
	pool.set("_life", 0.6)
	# Iter 61 — add to the hero's parent (main.tscn) rather than
	# get_tree().current_scene, which can be null in scenes-loaded-
	# via-instantiate contexts (the iter-40 fire pool's behavior was
	# the same, but parented via current_scene which works in real
	# gameplay but not in test instantiation).
	var host: Node = get_parent()
	if host != null:
		host.add_child(pool)

# Iter 66 — BLOOD theme lifesteal proc. Called from _resolve_melee_strike
# for every enemy a swing damages, while _pending_blood_tier > 0.
#
# Trigger model:
#   guaranteed flag set → always procs, heals +2, consumes the flag,
#                          short-circuits the chance roll
#   tier 1 → 20% per-hit chance, heals +1
#   tier 2 → 40% per-hit chance, heals +1 (independent of the guaranteed
#            flag — both can fire on the same swing across separate
#            enemies in a cleave)
#
# Visuals on proc:
#   - red blood-spatter at the enemy position (reuses FX.BLOOD_DROP_SCENE
#     via Events… no — the existing scene only fires on hero damage. We
#     spawn directly so the visual reads "blood pulled from THIS enemy"
#     rather than the hero's hurt cue)
#   - sprite scale-pulse on the hero — matches the iter-29 afterimage
#     scale-tween idiom (Tween created on the sprite; goes 1→1.18→1)
#   - crimson floater above the hero distinguishing it from bloodstone's
#     "+1" (no STEAL suffix) and the iter-44 magenta "+1 STEAL" floater
#     (those are kill-driven; BLOOD is hit-driven, so the player can
#     tell which proc fired)
#
# Skipped when capped or dying — silent no-op rather than a lying floater.
func _try_blood_lifesteal(enemy: Node) -> void:
	if _is_dying:
		return
	var cap_bs: int = MAX_HP + GameState.modifier_total("max_hp_bonus", 0)
	if hp >= cap_bs:
		# Still consume the guaranteed flag so it doesn't stick around
		# forever waiting for a missing-HP moment that may not come.
		# Skipping the consume would let a guaranteed proc "save up"
		# for hours which feels like a bug, not a feature.
		if _blood_guaranteed_next_hit:
			_blood_guaranteed_next_hit = false
		return
	var heal_amount: int = 0
	var is_guaranteed: bool = false
	if _blood_guaranteed_next_hit:
		_blood_guaranteed_next_hit = false
		heal_amount = 2
		is_guaranteed = true
	else:
		var chance: float = 0.20 if _pending_blood_tier == 1 else 0.40
		if randf() < chance:
			heal_amount = 1
	if heal_amount <= 0:
		return
	heal(heal_amount)
	_spawn_blood_lifesteal_fx(enemy, is_guaranteed)

# Iter 66 — visual portion of the lifesteal proc. Split from
# _try_blood_lifesteal so the heal logic stays readable; this is "just
# VFX." Spawns three things:
#   1) red blood spatter at the enemy position (BLOOD_DROP_SCENE reused —
#      reads as "drained")
#   2) crimson floater above the hero with the heal amount
#   3) brief sprite scale-pulse on the hero (1 → 1.18 → 1 over 0.18s)
#
# Tier-2 guaranteed procs render a brighter, longer floater and a
# slightly stronger pulse so the player feels the bigger heal.
func _spawn_blood_lifesteal_fx(enemy: Node, is_guaranteed: bool) -> void:
	var host: Node = get_parent()
	if host == null:
		return
	# 1) Blood spatter at the enemy. Reuses BLOOD_DROP_SCENE (5-particle
	# red spatter, 0.7s lifetime). Spawn at the enemy's body, not feet —
	# lift slightly so the puff originates from the wound, not the floor.
	if is_instance_valid(enemy):
		var spatter: Node2D = preload("res://scenes/fx/blood_drop.tscn").instantiate() as Node2D
		if spatter != null:
			spatter.global_position = enemy.global_position + Vector2(0, -16)
			host.add_child(spatter)
	# 2) Crimson floater. Tier-2 guaranteed proc gets a darker, larger
	# label so the +2 stands out from the chance +1 above.
	var floater_text: String = "+%d" % (2 if is_guaranteed else 1)
	var floater_color: Color = Color(0.95, 0.15, 0.25) if is_guaranteed else Color(0.85, 0.25, 0.30)
	var floater: DamageNumber = DamageNumber.spawn(
		global_position + Vector2(0, -88),
		floater_text,
		floater_color,
	)
	host.add_child(floater)
	# 3) Sprite scale-pulse — matches the iter-29 afterimage scale-tween
	# idiom. Pulse magnitude scales with the heal: +1 → 1.12, +2 → 1.20.
	# Tween is parented to the sprite so a scene reload mid-tween drops
	# it cleanly with the hero. Killed any prior pulse tween via the same
	# pattern ScreenFlash uses — without this, rapid back-to-back procs
	# would compound scale and leave the hero permanently swollen.
	if sprite != null:
		if _blood_pulse_tween != null and _blood_pulse_tween.is_valid():
			_blood_pulse_tween.kill()
		var peak: float = 1.20 if is_guaranteed else 1.12
		var base_scale: Vector2 = Vector2.ONE
		# Reset to a known scale before pulsing — defensive against a
		# killed mid-tween leaving sprite.scale somewhere between base
		# and peak. Cheap, harmless if already at 1.
		sprite.scale = base_scale
		_blood_pulse_tween = sprite.create_tween()
		_blood_pulse_tween.tween_property(sprite, "scale", base_scale * peak, 0.07)
		_blood_pulse_tween.tween_property(sprite, "scale", base_scale, 0.11)

# Iter 21 — chain_lightning effect. Find the nearest enemy within
# CHAIN_RADIUS of `source` that wasn't already hit this swing, deal a
# small fixed damage. No knockback (the chain is a visual sting, not
# the swing's force). Damage number tinted cyan so the player sees
# the chain land.
const CHAIN_RADIUS: float = 80.0
const CHAIN_DAMAGE: int = 1
func _try_chain_from(source: Node, hit_set: Dictionary) -> void:
	if not is_instance_valid(source):
		return
	var src_pos: Vector2 = source.global_position
	var best: Node = null
	var best_dist: float = CHAIN_RADIUS
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(enemy) or enemy == source:
			continue
		if hit_set.has(enemy.get_instance_id()):
			continue
		var d: float = enemy.global_position.distance_to(src_pos)
		if d < best_dist:
			best_dist = d
			best = enemy
	if best != null and best.has_method("take_hit"):
		# Iter 44 — chain bolt crit roll. STORM ascendance fires chain
		# bolts from the hero on every connecting swing; chain_lightning
		# relic fires them on every 4th hit. With keen_focus +
		# focused_strike both owned (40% crit) a chain-heavy build
		# should see crits on the chain hits too. Previously they were
		# capped at base CHAIN_DAMAGE = 1 forever.
		var dmg_chain: int = CHAIN_DAMAGE
		var is_crit_chain: bool = _roll_crit()
		if is_crit_chain:
			dmg_chain = int(round(float(dmg_chain) * (CRIT_DAMAGE_MUL + GameState.modifier_total_f("crit_damage_bonus_f", 0.0))))
		best.take_hit(dmg_chain, is_crit_chain)
		hit_set[best.get_instance_id()] = true
		_bump_combo()   # iter 54 — chain bolts count toward combo

# Iter 72 — IRON FANG redesign. Spawn an EmberBurst at `pos` with a
# 40-px radius / 1 damage snapshot AoE. Reuses the existing minimal-
# scene grammar from iter 67/68 (setup() called BEFORE add_child so
# _ready sees the configured values). Host = get_parent() so the
# burst survives if the hero dies in the same frame as the proc fires
# (matches the iter-61 / iter-62 spawn-host pattern).
const IRON_FANG_BURST_RADIUS: float = 40.0
const IRON_FANG_BURST_DAMAGE: int = 1
func _trigger_iron_fang_burst(pos: Vector2) -> void:
	var burst: Node2D = EMBER_BURST_SCENE.instantiate() as Node2D
	if burst == null:
		return
	burst.global_position = pos
	if burst.has_method("setup"):
		burst.call("setup", IRON_FANG_BURST_RADIUS, IRON_FANG_BURST_DAMAGE)
	var host: Node = get_parent()
	if host != null:
		host.add_child(burst)

# Iter 72 — ARCANE PULSE redesign. Find the nearest off-target enemy
# within 140px of `impact_pos`, deal 1 damage, spawn ArcaneBolt FX
# from impact → target. The "off-target" exclusion is handled by the
# caller passing an exclusion set seeded with the just-spawned
# projectile's intended trajectory — but since we fire this at CAST
# time (not impact time), there's no specific target to exclude.
# Instead we pick the nearest enemy regardless; the relic reads as
# "casting reaches an extra enemy" which is the intended feel.
const ARCANE_PULSE_BOLT_RANGE: float = 140.0
const ARCANE_PULSE_BOLT_DAMAGE: int = 1
func _trigger_arcane_pulse_bolt(impact_pos: Vector2) -> void:
	# Scan for nearest enemy within range.
	var best: Node = null
	var best_dist: float = ARCANE_PULSE_BOLT_RANGE
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(enemy):
			continue
		var d: float = enemy.global_position.distance_to(impact_pos)
		if d < best_dist:
			best_dist = d
			best = enemy
	if best == null:
		return   # no target in range; no proc this cast (cheap miss)
	# Damage. Pass is_crit=false — arcane pulse is a flat proc, not a
	# crit. If the player happens to have crit_chance_f, the regular
	# blast roll already handled THAT projectile's crit; the fork is a
	# separate bolt.
	if best.has_method("take_hit"):
		best.take_hit(ARCANE_PULSE_BOLT_DAMAGE)
	# Spawn the ArcaneBolt visual from impact → target. setup() before
	# add_child so _ready sees the endpoints.
	var bolt: Node2D = ARCANE_BOLT_SCENE.instantiate() as Node2D
	if bolt == null:
		return
	if bolt.has_method("setup"):
		bolt.call("setup", impact_pos, best.global_position)
	var host: Node = get_parent()
	if host != null:
		host.add_child(bolt)

# Iter 72 — STONEHEART redesign. Heal +1 and spawn the StonePulse FX at
# the hero. Called from _on_enemy_died_for_relics on the very first kill
# of each room (gated by _stoneheart_first_kill_armed, which auto-resets
# on scene reload alongside _iron_resolve_absorbed_this_room).
const STONEHEART_PULSE_RADIUS: float = 60.0
func _trigger_stoneheart_pulse() -> void:
	# Don't heal-and-spawn if we're already at cap or dying.
	if _is_dying:
		return
	var cap: int = MAX_HP + GameState.modifier_total("max_hp_bonus", 0)
	if hp < cap:
		heal(1)
		# Emerald floater so the heal source is distinct from bloodstone
		# (red), lifesteal (magenta), and room-clear heal (light green).
		# Stoneheart uses a slightly deeper emerald to mark "the FIRST
		# kill" beat.
		var floater: DamageNumber = DamageNumber.spawn(
			global_position + Vector2(0, -64),
			"+1",
			Color(0.35, 0.95, 0.55),
		)
		var p: Node = get_parent()
		if p != null:
			p.add_child(floater)
	# Spawn the StonePulse regardless of whether the heal applied —
	# the proc beat fires on EVERY first-kill, even if HP was full.
	# The player sees the relic working even on a clean run.
	var pulse: Node2D = STONE_PULSE_SCENE.instantiate() as Node2D
	if pulse == null:
		return
	pulse.global_position = global_position
	if pulse.has_method("setup"):
		pulse.call("setup", STONEHEART_PULSE_RADIUS)
	var host: Node = get_parent()
	if host != null:
		host.add_child(pulse)

# Iter 72 — IRON SKIN redesign. Spawn a StoneShardBurst at the hero
# to visualize the deflection. If this is the 4th block in a row,
# also apply a no-damage knockback ring to nearby enemies — pure
# spacing tool. Returns nothing; called from take_damage AFTER the
# reduction has actually saved damage.
const IRON_SKIN_KNOCKBACK_RADIUS: float = 60.0
const IRON_SKIN_KNOCKBACK_FORCE: float = 280.0
const IRON_SKIN_KNOCKBACK_TIME: float = 0.20
func _trigger_iron_skin_deflect() -> void:
	# Always spawn the deflect FX so the player sees the proc.
	var burst: Node2D = STONE_SHARD_SCENE.instantiate() as Node2D
	if burst != null:
		burst.global_position = global_position
		var host: Node = get_parent()
		if host != null:
			host.add_child(burst)
	# Every 4th block also pushes back nearby enemies. No damage —
	# this is a defensive spacing tool, not an offensive trigger.
	if _iron_skin_block_counter % 4 == 0:
		for enemy in get_tree().get_nodes_in_group("enemies"):
			if not is_instance_valid(enemy):
				continue
			var d: float = enemy.global_position.distance_to(global_position)
			if d > IRON_SKIN_KNOCKBACK_RADIUS:
				continue
			if enemy.has_method("apply_knockback"):
				var push_dir: Vector2 = (enemy.global_position - global_position)
				if push_dir.length() > 0.01:
					push_dir = push_dir.normalized()
				else:
					push_dir = Vector2.RIGHT
				enemy.apply_knockback(push_dir, IRON_SKIN_KNOCKBACK_FORCE, IRON_SKIN_KNOCKBACK_TIME)
		# Spawn a SECOND larger shard burst at the hero to read as the
		# louder "shield burst" beat. Same FX class, just stacked — the
		# two bursts overlay into a visibly bigger ring.
		var bigger: Node2D = STONE_SHARD_SCENE.instantiate() as Node2D
		if bigger != null:
			bigger.global_position = global_position
			bigger.scale = Vector2(1.4, 1.4)
			var host2: Node = get_parent()
			if host2 != null:
				host2.add_child(bigger)

# Iter 70 — aim assist. Returns aim snapped to point at the best
# in-cone enemy if one qualifies, otherwise the original aim. "Best"
# means smallest angle deviation, tie-broken by closeness. We scan
# get_nodes_in_group("enemies") — same pattern as _try_chain_from /
# dash pierce — so it picks up every regular spawn without coupling.
#
# Scoped to the BLAST (ranged) path only. Melee swing already uses a
# wide ATTACK_ARC and doesn't need cursor-to-enemy assist — the player
# is close enough that mouse precision isn't the limiting factor.
func _apply_aim_assist(aim: Vector2) -> Vector2:
	if aim.length_squared() < 0.0001:
		return aim
	var best_enemy: Node = null
	var best_angle: float = AIM_ASSIST_CONE
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(enemy):
			continue
		# iter-101: skip chests / breakables. They join "enemies" for
		# wave-clear bookkeeping but the blast aim should snap to actual
		# combat targets, not treasure boxes.
		if enemy.is_in_group("breakables"):
			continue
		var to_enemy: Vector2 = enemy.global_position - global_position
		var dist: float = to_enemy.length()
		if dist < 1.0 or dist > AIM_ASSIST_RANGE:
			continue
		var enemy_dir: Vector2 = to_enemy / dist
		# angle_to returns signed angle from aim to enemy_dir; abs() so
		# we measure how far OFF the cursor is regardless of side.
		var off_angle: float = abs(aim.angle_to(enemy_dir))
		if off_angle < best_angle:
			best_angle = off_angle
			best_enemy = enemy
	if best_enemy == null:
		return aim
	# Snap aim to point AT the enemy's center. Preserves the cursor's
	# distance intent (the projectile keeps its preset speed × LIFETIME
	# range) while correcting the angle.
	var snap_dir: Vector2 = (best_enemy.global_position - global_position).normalized()
	return snap_dir

func _start_blast() -> void:
	var aim_world := get_global_mouse_position() - global_position
	if aim_world.length() < 1.0:
		aim_world = _dir_to_vector(_facing_dir)
	var aim := aim_world.normalized()
	# Iter 70 — light aim assist. If the cursor is within AIM_ASSIST_CONE
	# of an enemy AND that enemy is within AIM_ASSIST_RANGE, snap aim
	# to point exactly at that enemy. Compensates for mouse precision in
	# mid-combat — the player "feels" their shots are responsive without
	# the snap being so aggressive that intentional misses (e.g. shooting
	# past an enemy to break a pot) become impossible. Skips entirely if
	# no enemy qualifies, so a player who aims into empty space still
	# shoots the empty space.
	aim = _apply_aim_assist(aim)
	# Iter 17 — swift_focus reduces blast cooldown.
	_blast_cd = BLAST_COOLDOWN * (1.0 + GameState.modifier_total_f("blast_cooldown_mul", 0.0))
	_facing_dir = _vector_to_dir_idx(aim)
	# iter-97: blast facing window. JS reference (hero.js:1413-1420):
	# walking west + shooting east left the sprite facing west while
	# bolts flew east — the body wasn't COMMITTING to the shot. Stamping
	# a 0.32s window keeps the sprite facing the aim direction while
	# WASD movement continues unrestricted. Window is slightly longer
	# than the blast cooldown so sustained fire never reveals a
	# facing-gap between shots.
	_blast_facing_dir = aim
	_blast_facing_time = BLAST_FACING_WINDOW
	# Reuse the attack animation as a cast gesture for now.
	sprite.frame = 0
	_play_anim(StringName("attack_" + DIR_NAMES[_facing_dir]))
	_attack_live = ATTACK_SWING_TIME
	_is_attacking = true
	# Iter 17 — arcane_resonance: every 4th blast deals double damage.
	# Counter is post-incremented so the 4th cast (counter == 4 after
	# increment) is the lucky one. Resets implicitly on run start since
	# the hero is re-instantiated for each new scene load.
	_blast_counter += 1
	var resonance_active: bool = GameState.has_relic("arcane_resonance") and _blast_counter % 4 == 0
	# Iter 214 — STATIC RUNES per-cast proc check. Computed BEFORE the
	# projectile spawn loop so EVERY projectile in this cast sees the
	# same proc flag — multi-shot all chain on the proc cast, otherwise
	# none chain. _static_runes_proc_this_cast is cleared at the start
	# of every cast regardless of ownership so a stale flag from a
	# previous cast can't leak.
	_static_runes_proc_this_cast = false
	if GameState.has_relic("static_runes"):
		_static_runes_cast_counter += 1
		if _static_runes_cast_counter % 4 == 0:
			_static_runes_proc_this_cast = true
	# Iter 42 — multi-shot. projectile_count mod (Twin Cast etc.) adds
	# extra projectiles in a small spread around the aim direction.
	# 1 (default) = single shot; 2 = two projectiles 14° apart; 3 = three
	# at -14/0/+14°. The center projectile always uses the unmodified aim
	# so straight-line accuracy is preserved.
	var bonus_count: int = GameState.modifier_total("projectile_count", 0)
	var total_count: int = 1 + bonus_count
	var spawn_pos: Vector2 = global_position + Vector2(0, -22) + aim * 18.0
	# Iter 44 — multi-shot muzzle: spawn ONE flash per projectile so a
	# spread of 3 shots reads as 3 distinct launch points rather than
	# 3 orbs emerging from 1 puff. Each muzzle is oriented to its
	# projectile's aim so the streak runs in the right direction.
	for i in range(total_count):
		var offset_idx: float = float(i) - float(total_count - 1) * 0.5
		var spread_angle: float = offset_idx * BLAST_SPREAD_STEP
		var spread_aim: Vector2 = aim.rotated(spread_angle)
		var muzzle: Node2D = BLAST_MUZZLE_SCENE.instantiate() as Node2D
		if muzzle != null:
			muzzle.global_position = spawn_pos
			muzzle.rotation = spread_aim.angle()
			get_tree().current_scene.add_child(muzzle)
		_spawn_blast_projectile(spawn_pos, spread_aim, resonance_active)
	# Iter 72 — ARCANE PULSE redesign. Once per cast (not per projectile
	# in a multi-shot), bump the cast counter; on every 5th cast, fork a
	# violet bolt to the nearest enemy within 140px of the spawn_pos.
	# Tracked counter is independent of _blast_counter (which is the
	# arcane_resonance every-4th counter) so the two relics' procs land
	# on DIFFERENT casts most of the time. Fires AFTER the projectile
	# spawn loop so the bolt's source pos is the cast origin, not
	# whatever the loop left as final spread_aim. Independent of
	# resonance_active — both can fire on the same cast.
	if GameState.has_relic("arcane_pulse"):
		_arcane_pulse_cast_counter += 1
		if _arcane_pulse_cast_counter % 5 == 0:
			_trigger_arcane_pulse_bolt(spawn_pos)
	# Iter 214 — SPLIT CINDER. Every 3rd blast cast, fan TWO smaller
	# ember projectiles at ±30 ° from the aim. These are SEPARATE shots
	# from the main spawn loop (not part of the spread_aim multi-shot
	# fan) so they always fire EVEN if the player doesn't own
	# projectile_count modifiers. Smaller scale + warm orange tint +
	# 1 base damage so they don't compete with main cast output —
	# they're crowd-fragment hits, not focused damage.
	if GameState.has_relic("split_cinder"):
		_split_cinder_cast_counter += 1
		if _split_cinder_cast_counter % 3 == 0:
			_spawn_split_cinder_embers(spawn_pos, aim)
	# Iter 203 — Echo Quill. Noita-tier spell-modifier relic. Every
	# blast schedules a follow-up projectile 0.16 s later, fired from
	# the hero's CURRENT position (chases the hero's movement) toward
	# the latest cursor direction. Reads as the spell echoing — the
	# player can fire-and-move and the echo lands where they ended
	# up. Compounds with multi-shot (projectile_count bonus): N main
	# shots → echo shoots N shots again at the new position.
	if GameState.has_relic("echo_quill"):
		var echo_resonance: bool = resonance_active
		var echo_tween: Tween = create_tween()
		echo_tween.tween_interval(0.16)
		echo_tween.tween_callback(_fire_echo_blast.bind(echo_resonance))
	# Emit at chest height so the muzzle streak originates from the
	# mage's hands, not under her feet.
	Events.hero_blasted.emit(global_position + Vector2(0, VFX_HEIGHT_OFFSET), aim)

# Iter 214 — SPLIT CINDER ember spawn. Fires 2 smaller orange ember
# projectiles at ±30 ° from the cast aim. These are distinct from the
# main projectile (separate _spawn_blast_projectile-style construction)
# so they don't get pierce/ricochet/resonance/crit — they're crowd-
# fragment shots with fixed 1 damage and a warm tint. Skipped if hero
# died between cast and proc (would happen if a status-combo death
# fires during cast, extremely rare).
func _spawn_split_cinder_embers(origin: Vector2, aim: Vector2) -> void:
	if _is_dying:
		return
	# Two embers — one at +30 °, one at -30 °. 0.524 rad ≈ 30 °.
	var split_angle: float = 0.524
	for sign in [1.0, -1.0]:
		var ember_aim: Vector2 = aim.rotated(split_angle * sign)
		var p: Projectile = PROJECTILE_SCENE.instantiate()
		p.global_position = origin
		# Embers fly a bit slower so they FAN behind the main shot
		# rather than racing past it.
		p.velocity = ember_aim * Projectile.SPEED * 0.85
		p.damage = 1
		p.orb_tint = Color(1.0, 0.55, 0.20, 1.0)  # warm ember orange
		p.executioner_active = false
		# No pierce / ricochet — keep these sharp fragments simple.
		p.pierce_count = 0
		p.ricochet_count = 0
		# Carry GRAVITY NEEDLE through — embers are still YOUR projectiles
		# so the near-miss slow should apply to them too.
		if GameState.has_relic("gravity_needle"):
			p.gravity_needle_active = true
		# Embers are visually smaller — scale down by setting damage = 1
		# implies _dmg_scale ≈ 1.0, then override via additional scale.
		# Easier: just multiply final scale in _ready via a flag, but we
		# don't have that hook. Workaround: set scale here AFTER ready
		# fires by deferring to next frame, OR just trust the smaller
		# damage's natural _dmg_scale. For now, smaller scale via
		# parent_for assignment after spawn — projectile.gd's _ready
		# sets scale based on _dmg_scale only, so a damage=1 ember
		# already reads slightly smaller than a damage=2 main cast.
		var scene_root: Node = get_tree().current_scene
		if scene_root != null:
			scene_root.add_child(p)

# Iter 203 — Echo Quill follow-up cast. Fires N projectiles (same
# count as the original cast) from the hero's CURRENT position with
# fresh cursor aim. Skipped if hero died between the original cast
# and this firing (cleanly handles the "blast then die in 0.16 s"
# edge case via _is_dying check).
func _fire_echo_blast(echo_resonance: bool) -> void:
	if _is_dying:
		return
	# Re-resolve aim at echo time so it tracks the moving cursor.
	var aim_world: Vector2 = get_global_mouse_position() - global_position
	if aim_world.length() < 1.0:
		aim_world = _dir_to_vector(_facing_dir)
	var aim: Vector2 = aim_world.normalized()
	aim = _apply_aim_assist(aim)
	var bonus_count: int = GameState.modifier_total("projectile_count", 0)
	var total_count: int = 1 + bonus_count
	var spawn_pos: Vector2 = global_position + Vector2(0, -22) + aim * 18.0
	for i in range(total_count):
		var offset_idx: float = float(i) - float(total_count - 1) * 0.5
		var spread_angle: float = offset_idx * BLAST_SPREAD_STEP
		var spread_aim: Vector2 = aim.rotated(spread_angle)
		# Echo skips the muzzle flash to read as a softer follow-up
		# vs. the main cast's louder launch.
		_spawn_blast_projectile(spawn_pos, spread_aim, echo_resonance)

# Iter 42 — extracted single-projectile spawn. Carries all the modifier
# reads that iter-41 left inline in _start_blast. Multi-shot calls this
# N times with different spread aims.
func _spawn_blast_projectile(spawn_pos: Vector2, aim_dir: Vector2, resonance_active: bool) -> void:
	var p: Projectile = PROJECTILE_SCENE.instantiate()
	p.global_position = spawn_pos
	var proj_speed: float = Projectile.SPEED * (1.0 + GameState.modifier_total_f("projectile_speed_mul", 0.0))
	p.velocity = aim_dir * proj_speed
	var dmg: int = 1 + GameState.modifier_total("blast_damage_bonus", 0)
	# Iter 213 — BLOOD TITHE multiplier (Phase 2). Applied here so the
	# bake into the projectile.damage carries through impact + chain
	# arcs + any per-projectile downstream consumers.
	dmg = int(round(float(dmg) * _blood_tithe_damage_mul()))
	if resonance_active:
		dmg *= 2
		p.orb_tint = Color(0.7, 1.0, 1.0, 1.0)
	# Iter 42 — crit roll. Per-projectile so a multi-shot can have some
	# projectiles crit and others not (reads as "lucky spray" rather than
	# "all-or-nothing"). Roll happens at spawn, baked into damage so
	# downstream procs (executioner) compound off the crit'd damage too.
	var is_crit: bool = _roll_crit()
	if is_crit:
		dmg = int(round(float(dmg) * (CRIT_DAMAGE_MUL + GameState.modifier_total_f("crit_damage_bonus_f", 0.0))))
		# Yellow-warm tint distinct from arcane_resonance's cyan crit.
		# A double-crit (resonance + crit) still reads as cyan dominant
		# (set above) since this overwrites after — the player sees
		# WARM = crit, CYAN = resonance, WARM-CYAN = both.
		p.orb_tint = Color(1.0, 0.85, 0.45, 1.0)
	p.damage = dmg
	p.is_crit = is_crit   # iter 43 — pass crit flag for take_hit visual
	p.executioner_active = GameState.has_relic("executioner")
	p.pierce_count = GameState.modifier_total("pierce_count", 0)
	p.ricochet_count = GameState.modifier_total("ricochet_count", 0)
	# Iter 43 — burn roll. Independent of crit so a non-crit hit can
	# still burn. Locked at spawn (pierce + ricochet hits all apply
	# the same burn duration since the proc fired once at cast).
	if _roll_burn():
		p.burn_duration = 1.6
	# Iter 46 — slow roll. Same locked-at-spawn semantics as burn.
	# A multi-shot piercing projectile with slow can paint a row of
	# enemies blue, hampering their pursuit while STORM bolts arc.
	if _roll_slow():
		p.slow_duration = SLOW_DURATION
	# Iter 65 — BLAST × FLAME ability evolution. Lock the on-impact fire
	# pool lifetime at SPAWN from the hero's FLAME theme tier, mirroring
	# the burn/slow locking pattern so a relic gained mid-flight doesn't
	# retroactively buff in-flight orbs. Tier 1 (≥2 FLAME relics) →
	# 0.5s mini-pool; tier 2 (≥4 FLAME relics) → 0.8s larger pool.
	# Projectile.gd's _on_body_entered spawns the pool on enemy hit.
	var flame_tier_now: int = GameState.theme_tier("flame")
	if flame_tier_now >= 2:
		p.flame_impact_pool_life = 0.8
	elif flame_tier_now >= 1:
		p.flame_impact_pool_life = 0.5
	# Iter 67 — BLAST × STORM ability evolution. Lock chain count + radius
	# + damage multiplier at SPAWN from the hero's STORM theme tier,
	# mirroring the flame/burn/slow locking so a relic gained mid-flight
	# can't retroactively buff in-flight orbs. Tier 1 (≥2 STORM relics):
	# 1 chain hop within 120px at full damage. Tier 2 (≥4 STORM relics):
	# 2 chain hops within 160px at 60% damage each — primary blast
	# damage is UNCHANGED, the chains carry the spread. Projectile.gd
	# resolves the chains in _on_body_entered (enemy hit) and spawns
	# ChainArc visuals from impact → each chain target.
	# Iter 214 — GRAVITY NEEDLE. Each projectile gets the near-miss-slow
	# flag if the player owns the relic. Projectile.gd's
	# _physics_process applies the slow to any enemy within
	# GRAVITY_NEEDLE_RADIUS of the projectile's path (per-enemy guard
	# so a single projectile only slows each enemy once).
	if GameState.has_relic("gravity_needle"):
		p.gravity_needle_active = true
	# Iter 214 — STATIC RUNES. If this cast is the proc cast (computed
	# in _start_blast BEFORE the spawn loop), bump storm_chain_count
	# by +1 and ensure radius / damage_mul defaults are populated. The
	# bump is ADDITIVE to the STORM theme tier's chain count below —
	# so a STORM tier 1 player + Static Runes proc cast = 2 chains.
	if _static_runes_proc_this_cast:
		p.storm_chain_count = max(p.storm_chain_count, 0) + 1
		if p.storm_chain_radius <= 0.0:
			p.storm_chain_radius = 120.0
		if p.storm_chain_dmg_mul <= 0.0:
			p.storm_chain_dmg_mul = 0.8
	var storm_tier_now: int = GameState.theme_tier("storm")
	if storm_tier_now >= 2:
		p.storm_chain_count = 2
		p.storm_chain_radius = 160.0
		p.storm_chain_dmg_mul = 0.6
	elif storm_tier_now >= 1:
		p.storm_chain_count = 1
		p.storm_chain_radius = 120.0
		p.storm_chain_dmg_mul = 1.0
	get_parent().add_child(p)

# Iter 16 — room-clear / relic / pickup healing. Caps at the current
# MAX_HP + relic-modifier bonus so a Stoneheart pickup mid-run grows
# the cap before this is called. Silent no-op while dying so a "heal
# on enemy death" relic wouldn't accidentally resurrect us.
func heal(amount: int) -> void:
	if _is_dying or amount <= 0:
		return
	var cap: int = MAX_HP + GameState.modifier_total("max_hp_bonus", 0)
	var prev := hp
	hp = mini(hp + amount, cap)
	if hp != prev:
		hp_changed.emit(hp)
		# Iter 146 — fire the world-space heal event AFTER hp_changed so
		# any subscriber that wants to react to "the new hp" sees the
		# updated value. fx.gd spawns a green sparkle here; future audio
		# could layer a chime. Pass actual gained HP (not the request)
		# in case the cap clamped it down — a request-for-5 that only
		# yielded 1 HP should pop a small sparkle, not a big one.
		var actual_gain: int = hp - prev
		Events.hero_healed.emit(global_position, actual_gain)

# iter-103 — elite affix status application API. Enemy contact paths
# call into these. Both stack via "take the WORSE / LONGER value" so
# repeated bumps from the same affix can't cancel themselves.
#
# apply_slow(duration, multiplier): frost elites call with (1.0, 0.6).
# apply_venom(duration): venom elites call with 2.0 (4 ticks at 0.5s
# interval × 1 dmg each = 4 dmg over 2s, gnarly).
func apply_slow(duration: float, multiplier: float) -> void:
	if duration > _hero_slow_remaining:
		_hero_slow_remaining = duration
	# Worse (smaller) multiplier wins so consecutive frost bumps don't
	# overwrite a deeper slow with a shallower one.
	if multiplier < _hero_slow_multiplier:
		_hero_slow_multiplier = multiplier

func apply_venom(duration: float) -> void:
	if duration > _hero_venom_remaining:
		_hero_venom_remaining = duration
		# Re-arm the tick timer on first application or refresh so the
		# next tick lands at the configured interval, not whenever
		# the previous DoT happened to be in its cycle.
		_hero_venom_tick_timer = HERO_VENOM_TICK_INTERVAL

func take_damage(amount: int, source_pos: Vector2 = Vector2.INF, source_name: String = "") -> void:
	# Iter 70 — optional source_pos for knockback. Defaults to Vector2.INF
	# (sentinel "unknown source") so existing callers in enemy.gd /
	# fire_jet.gd / spike_pit.gd / projectile.gd still work without
	# modification — the knockback path falls back to a small push along
	# the hero's facing inversion when no source position is supplied.
	# Callers that DO want directional knockback (the contact path in
	# enemy.gd is the obvious candidate) can pass enemy.global_position;
	# they don't HAVE to update, the feature degrades gracefully.
	# iter-229 — optional source_name for the death-screen "CAUSE OF
	# DEATH" line. Default "" preserves the 2-arg signature for callers
	# that haven't been updated; recorded into _last_damage_source_name
	# only when non-empty so a hazard hit doesn't erase the last meaningful
	# enemy attribution.
	if hp <= 0:
		return
	# Iter 25 — parry catch. Checked BEFORE the iframes early-return so
	# a successful parry CONSUMES the incoming hit (vs the normal-iframe
	# path which just silently ignores it). _on_shield_block clears the
	# window, sets iframes, spawns the bigger VFX, and triggers slow-mo.
	if _shield_time > 0.0:
		_on_shield_block()
		return
	if _iframes > 0.0:
		return
	# iron_resolve — the FIRST wound in a room is absorbed wholesale (no
	# HP loss, no iframes set, just a floater cue). The flag auto-resets
	# on room entry because every transition reloads main.tscn → fresh
	# hero instance with the flag back to false. Sits ABOVE iron_skin
	# subtract because the relic absorbs the WHOLE blow, not the reduced
	# residual.
	if GameState.has_relic("iron_resolve") and not _iron_resolve_absorbed_this_room:
		_iron_resolve_absorbed_this_room = true
		var p_iron: Node = get_parent()
		if p_iron != null:
			var floater_iron: DamageNumber = DamageNumber.spawn(
				global_position + Vector2(0, -64),
				"ABSORBED",
				Color(1.0, 0.75, 0.35),
			)
			p_iron.add_child(floater_iron)
		return
	# Iron Skin: flat subtract, never below 0.
	var reduction: int = GameState.modifier_total("damage_taken_reduction", 0)
	var actual: int = maxi(0, amount - reduction)
	# Iter 72 — IRON SKIN redesign. If the relic is owned AND the
	# reduction actually saved damage on THIS hit (amount > 0 and the
	# reduction subtracted at least 1), spawn the stone-shard deflect
	# burst. Also bump the per-run block counter so the every-4th
	# knockback ring fires on schedule. Stalwart / aegis_plate also
	# carry damage_taken_reduction but get NO deflect FX — keeping the
	# proc scoped to iron_skin specifically preserves each relic's
	# identity. Fires even if `actual <= 0` (i.e. fully absorbed) — a
	# fully-blocked hit is the most satisfying moment to see the FX.
	if GameState.has_relic("iron_skin") and amount > 0 and reduction > 0:
		_iron_skin_block_counter += 1
		_trigger_iron_skin_deflect()
	if actual <= 0:
		return
	hp -= actual
	# iter-229 / Polish Team R2 — track the cause-of-death + biggest-hit
	# stats for the death-screen run summary. Only record source_name
	# when non-empty so DoT ticks / unattributed hazards don't overwrite
	# the meaningful last enemy hit. _biggest_hit_taken is "actual" not
	# "amount" so iron_skin reduction is reflected (a 4-dmg swing
	# reduced to 1 reports as 1, the player's real loss).
	if source_name != "":
		_last_damage_source_name = source_name
	if actual > _biggest_hit_taken:
		_biggest_hit_taken = actual
	# Iter 17 — second_wind: the killing blow leaves you at 1 HP instead
	# of dying, once per run. Triggers ONLY when HP would otherwise hit
	# 0 or lower, so a partial hit can't burn the proc. _second_wind_used
	# resets at scene reload (fresh hero instance per run).
	# Iter 21 — phoenix_feather PREEMPTS second_wind. If the player owns
	# both and is dying for the first time, phoenix wins (more dramatic
	# beat + full heal). second_wind handles the SECOND lethal blow if
	# phoenix already fired. Different flag per relic so they don't
	# share state — a run with both gets two saves total.
	# iter-105: phoenix gate now reads/writes GameState.phoenix_feather_used
	# (was hero-instance _phoenix_feather_used, which reset every room).
	if hp <= 0 and GameState.has_relic("phoenix_feather") and not GameState.phoenix_feather_used:
		GameState.phoenix_feather_used = true
		var cap: int = MAX_HP + GameState.modifier_total("max_hp_bonus", 0)
		hp = cap
		_iframes = HIT_IFRAMES * 2.5  # longer invuln than second_wind
		# Reuse the second_wind audio chime — players associate that
		# sound with "you should have died." Dedicated phoenix SFX
		# could land later.
		Events.hero_second_wind.emit(global_position)
		var parent_p: Node = get_parent()
		if parent_p != null:
			var n: DamageNumber = DamageNumber.spawn(
				global_position + Vector2(0, -64),
				"PHOENIX FEATHER",
				Color(1, 0.55, 0.35),
			)
			parent_p.add_child(n)
	elif hp <= 0 and GameState.has_relic("second_wind") and not _second_wind_used:
		_second_wind_used = true
		hp = 1
		# iter-96 Phase B: bumped from HIT_IFRAMES*2.0 → 2.5 (1.1s → 1.4s)
		# so the post-revive window is generous enough to actually
		# REPOSITION rather than just absorb one more bump. Differentiates
		# from phoenix_feather (which is full-HP + 2.5× already).
		_iframes = HIT_IFRAMES * 2.5
		# Iter 21 — fire the audio bus chime so the save HAS A SOUND.
		# audio.gd subscribes to Events.hero_second_wind for the long
		# rising 200→140 Hz ring distinct from the death sweep.
		Events.hero_second_wind.emit(global_position)
		# Floating amber number marks the save so the player learns
		# the relic worked rather than wondering why they survived.
		# Iter 20 — guard get_parent() in case take_damage fires during
		# a scene-swap window where the hero is briefly orphaned.
		var parent: Node = get_parent()
		if parent != null:
			var n: DamageNumber = DamageNumber.spawn(
				global_position + Vector2(0, -64),
				"SECOND WIND",
				Color(1, 0.8, 0.45),
			)
			parent.add_child(n)
	_iframes = max(_iframes, HIT_IFRAMES)
	hp_changed.emit(hp)
	hit_received.emit()
	Events.hero_damaged.emit(global_position)
	# Iter 155 — emit the directional cue if the source is known.
	# Iter-70 set source_pos to Vector2.INF as the "unknown source"
	# sentinel — DoT ticks, environmental hazards, etc. don't pass a
	# meaningful source. Skip those: a misdirected indicator would
	# train the player to mistrust the cue. Reuse the existing
	# `source_pos.x != INF` check from the knock_dir branch above.
	if source_pos.x != INF:
		Events.hero_damage_directional.emit(source_pos, global_position)
	# Iter 54 — combo reset on damage. Resets ONLY if damage actually
	# landed (not absorbed by iron_resolve / parry — those return
	# earlier in take_damage). Reaching here means damage was dealt.
	_reset_combo()
	# Iter 70 — arm hero hurt knockback. Direction is AWAY from the
	# source. If source_pos was supplied (Vector2.INF sentinel = not
	# supplied), aim along (hero - source). Otherwise fall back to the
	# hero's facing-inversion (the hero is probably facing the threat
	# since they were attacking it — pushing along the back of the facing
	# gives a sensible "knocked away" read even without a source). The
	# walk-velocity branch in _physics_process consumes this each tick
	# while _knockback_time > 0, so the impulse layers on top of player
	# input rather than overriding it.
	var knock_from_known: bool = source_pos.x != INF
	var knock_dir: Vector2
	if knock_from_known:
		knock_dir = global_position - source_pos
	else:
		knock_dir = -_dir_to_vector(_facing_dir)
	if knock_dir.length_squared() < 0.0001:
		# Coincident source / zero facing — pick a safe fallback. Use
		# -facing again (which DIR_VECS guarantees is non-zero) but if
		# that's zero somehow, southbound is a fine sentinel.
		knock_dir = Vector2.DOWN
	_knockback_dir = knock_dir.normalized()
	_knockback_time = HERO_KNOCKBACK_TIME
	if hp <= 0:
		_is_dying = true
		_hurt_time = 0.0
		# Force restart so we see frame 0 of the death anim.
		sprite.frame = 0
		# Iter 22 — death cinematic punctuation. Spawn the crimson radial
		# shockwave + blood spray AT the hero's feet (no chest offset —
		# the death is grounded, not aerial like a blast muzzle). Parent
		# to current_scene so the pulse persists in world space rather
		# than getting torn down with the hero if scene-swap fires. Same
		# pattern as DASH_TRAIL / BLAST_MUZZLE spawning.
		var pulse_pos: Vector2 = global_position
		var pulse: Node2D = DEATH_PULSE_SCENE.instantiate() as Node2D
		if pulse != null:
			pulse.global_position = pulse_pos
			var scene_root: Node = get_tree().current_scene
			if scene_root != null:
				scene_root.add_child(pulse)
		# hero_death_started fires BEFORE hero_died so main.gd's cinematic
		# listener can install the slow-mo / camera zoom / vignette /
		# "YOU DIED" banner WHILE the existing _on_hero_died handler
		# still gates the death screen reveal. The cinematic chains into
		# the death screen at the end of its ~1.6s ramp.
		hero_death_started.emit(pulse_pos)
		hero_died.emit()
		Events.hero_died.emit(global_position)
	else:
		# Hurt is a visual-only flash, doesn't block input.
		_hurt_time = HURT_TIME
		sprite.frame = 0

# Iter 17 — bloodstone relic trigger. Every enemy_died bumps the kill
# counter; every 3rd kill heals +1. Subscribed in _ready regardless of
# ownership (cheaper than re-wiring on relic claim); the has_relic
# check gates the heal. The counter is per-hero-instance (resets on
# scene reload = new run).
func _on_enemy_died_for_relics(world_pos: Vector2) -> void:
	# iter-133: Don't process relic effects after hero death. Prevents VFX
	# spam (soul_burst, fire_pool, kill_explosion) during death cinematic
	# when enemies are still dying from DoT or chain effects.
	if _is_dying:
		return
	_kill_counter += 1
	# Iter 213 — BLOOD TITHE kill-heal. While the buff window is active,
	# every kill heals +1 HP (capped at max_hp). Lets the player net
	# positive on the trade if they're clearing well during the burst.
	if _blood_tithe_buff_time > 0.0:
		var max_hp_total: int = MAX_HP + GameState.modifier_total("max_hp_bonus", 0)
		if hp < max_hp_total:
			hp = min(hp + BLOOD_TITHE_KILL_HEAL, max_hp_total)
	# Iter 72 — STONEHEART redesign. Per-room flag pattern: the FIRST
	# enemy felled each room triggers a vital pulse + +1 HP heal. Flag
	# auto-resets on scene reload (mirrors _iron_resolve_absorbed_this_
	# room). Independent of bloodstone (every-3rd kill) so the two stack
	# cleanly — bloodstone proc on kill 3, stoneheart on kill 1 of EACH
	# room. Checked FIRST so other on-kill hooks (soul_burst, FLAME
	# ascendance) still run in the same beat.
	if GameState.has_relic("stoneheart") and _stoneheart_first_kill_armed:
		_stoneheart_first_kill_armed = false
		_trigger_stoneheart_pulse()
	# Iter 66 — BLOOD ascendance (≥4 BLOOD relics): after any kill, arm
	# the NEXT sword hit to guaranteed-lifesteal +2 HP. Reads tier LIVE
	# (not swing-locked) because this is a kill-time effect, not a swing
	# effect — gaining the relic mid-room should immediately enable the
	# next kill→next-hit chain. The flag is consumed in _try_blood_
	# lifesteal on the next melee hit. Stays armed across rooms (would
	# fire on first hit in next room if a kill happened in a transition
	# window) — fine, just rare.
	if GameState.theme_tier("blood") >= 2:
		_blood_guaranteed_next_hit = true
	# Iter 40 — FLAME ascendance (4+ FLAME relics owned). Every kill
	# drops a fire pool at the kill site that damages other enemies
	# walking through it. Carpet pools = bullet-hell scaling: a 5-mob
	# clear leaves 5 overlapping pools melting the next wave. Checked
	# BEFORE other on-kill hooks so the pool spawn is independent of
	# soul_burst / bloodstone gates.
	if GameState.theme_tier("flame") >= 2:
		_trigger_fire_pool(world_pos)
	# soul_burst — every 5th kill detonates an 80 px AoE for 1 damage at
	# the kill site. Reuses dash_impact.tscn with a red tint as the VFX
	# placeholder (audio agent owns the proper effect prefab later).
	# Checked BEFORE the bloodstone early-return so the two relics stack
	# cleanly on a 15th / 30th / etc. kill (3 × 5 = 15 — both fire).
	if GameState.has_relic("soul_burst") and _kill_counter % 5 == 0:
		_trigger_soul_burst(world_pos)
	# Iter 45 — chance-based kill explosion. Independent of soul_burst's
	# every-5th counter; rolls explode_on_kill_chance_f for a chance to
	# detonate a kill-site AoE. Stacks via modifier_total_f
	# (Combustion Core 0.20 + Detonator 0.40 = 60% combined). Chain
	# reactions: an explosion that kills a low-HP enemy can itself
	# trigger another roll on THAT enemy's death (via Events.enemy_died
	# → this same handler). Carpet-bombing build = real.
	var explode_chance: float = GameState.modifier_total_f("explode_on_kill_chance_f", 0.0)
	if explode_chance > 0.0 and randf() < explode_chance:
		_trigger_kill_explosion(world_pos)
	# Bloodstone heal — every 3rd kill, +1 HP. Refactored iter 44
	# from early-return into a guarded block so subsequent kill-based
	# heals (lifesteal) can run on the same event without being
	# starved by bloodstone's gate.
	if GameState.has_relic("bloodstone") and _kill_counter % 3 == 0:
		var cap: int = MAX_HP + GameState.modifier_total("max_hp_bonus", 0)
		if hp < cap and not _is_dying:
			heal(1)
			# Crimson floater — matches the relic's blood theme,
			# distinguishes from the green +1 room-clear heal so the
			# player learns the source.
			var n: DamageNumber = DamageNumber.spawn(
				global_position + Vector2(0, -56),
				"+1",
				Color(1.0, 0.35, 0.4),
			)
			get_parent().add_child(n)
	# iter-96 Phase B — lifestone slow regen. Common-tier BLOOD entry
	# parallel to bloodstone but on a longer 8-kill cadence so it's not
	# competing with bloodstone (every-3-kill, legendary). Same cap +
	# floater pattern as bloodstone for consistency.
	if GameState.has_relic("lifestone") and _kill_counter % 8 == 0:
		var ls_cap: int = MAX_HP + GameState.modifier_total("max_hp_bonus", 0)
		if hp < ls_cap and not _is_dying:
			heal(1)
			var ls_floater: DamageNumber = DamageNumber.spawn(
				global_position + Vector2(0, -56),
				"+1",
				Color(1.0, 0.55, 0.50),  # dimmer rose vs bloodstone's bright crimson
			)
			get_parent().add_child(ls_floater)
	# Iter 226 / Expansion Team — SACRIFICIAL ECHO. Heal +1 HP every 5th
	# kill (capped at max). Independent counter from bloodstone/lifestone
	# so its cadence is uncoupled; on a 15th kill, bloodstone (every 3),
	# lifestone (every 8 — no), AND sacrificial_echo (every 5) tick the
	# same beat, stacking three +1 HP heals if all are owned and hp < cap.
	# Dusky-violet floater so the source is visually distinct from the
	# crimson bloodstone (1.0, 0.35, 0.4) and rose lifestone (1.0, 0.55).
	if GameState.has_relic("sacrificial_echo"):
		_sacrificial_echo_counter += 1
		if _sacrificial_echo_counter % 5 == 0:
			var se_cap: int = MAX_HP + GameState.modifier_total("max_hp_bonus", 0)
			if hp < se_cap and not _is_dying:
				heal(1)
				var se_floater: DamageNumber = DamageNumber.spawn(
					global_position + Vector2(0, -64),
					"+1",
					Color(0.85, 0.45, 0.95),  # dusky violet — Sacrificial Echo signature
				)
				get_parent().add_child(se_floater)
	# Iter 44 — lifesteal on kill. Stacks via modifier_total_f
	# (Drinking Edge 0.15 + Crimson Hunger 0.30 = 0.45 combined chance).
	# Independent of bloodstone's every-3rd-kill counter so the two
	# relics complement: bloodstone is deterministic regen, lifesteal
	# is bursty top-off. Skip if dying / capped to avoid lying floaters.
	var lifesteal_chance: float = GameState.modifier_total_f("lifesteal_chance_f", 0.0)
	if lifesteal_chance > 0.0 and randf() < lifesteal_chance:
		var cap_ls: int = MAX_HP + GameState.modifier_total("max_hp_bonus", 0)
		if hp < cap_ls and not _is_dying:
			heal(1)
			# Magenta floater so lifesteal is visually distinct from
			# both bloodstone (red) and the room-clear heal (green).
			var ls_n: DamageNumber = DamageNumber.spawn(
				global_position + Vector2(0, -72),
				"+1 STEAL",
				Color(0.95, 0.55, 0.85),
			)
			get_parent().add_child(ls_n)

# soul_burst — 80 px radial AoE for 1 damage centered on the kill point.
# Scans the enemies group, applies take_hit(1) to anyone in range. The
# triggering enemy is already dead (this fires from _on_enemy_died), so
# no source-skip guard is needed. Spawns a red-tinted dash_impact at the
# kill site for visual feedback.
const SOUL_BURST_RADIUS: float = 80.0
const SOUL_BURST_DAMAGE: int = 1
func _trigger_soul_burst(world_pos: Vector2) -> void:
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(enemy):
			continue
		# Iter 224 — Bug Team Node2D guard (defensive).
		if not (enemy is Node2D):
			continue
		if enemy.global_position.distance_to(world_pos) > SOUL_BURST_RADIUS:
			continue
		if enemy.has_method("take_hit"):
			enemy.take_hit(SOUL_BURST_DAMAGE)
	var fx: Node2D = SOUL_BURST_SCENE.instantiate() as Node2D
	if fx != null:
		fx.global_position = world_pos
		fx.modulate = Color(1.0, 0.6, 0.6, 1.0)
		var scene_root: Node = get_tree().current_scene
		if scene_root != null:
			scene_root.add_child(fx)

# Iter 40 — FLAME ascendance fire pool. Spawned at kill site every
# time an enemy dies WHILE the hero owns 4+ FLAME relics. Each pool
# damages other enemies inside for ~2s then fades. The compositional
# heart of the FLAME bullet-hell direction: chain kills → pool carpet
# → next wave melts on arrival.
func _trigger_fire_pool(world_pos: Vector2) -> void:
	var pool: Node2D = FIRE_POOL_SCENE.instantiate() as Node2D
	if pool == null:
		return
	pool.global_position = world_pos
	var scene_root: Node = get_tree().current_scene
	if scene_root != null:
		scene_root.add_child(pool)

# Iter 45 — chance-based kill explosion. Reuses the soul_burst
# pattern (radial AoE on kill site, reuses SOUL_BURST_SCENE for VFX)
# but with a configurable radius + damage. Drives the bullet-hell
# chain-reaction loop: explode → kill more enemies → more explosions.
# Each chained explosion can re-trigger on its own kill (the rolled
# chance compounds per enemy killed by the explosion).
const KILL_EXPLOSION_RADIUS: float = 72.0
const KILL_EXPLOSION_DAMAGE: int = 2
func _trigger_kill_explosion(world_pos: Vector2) -> void:
	# Iter 53 — audio boom for the chain explosion. Fires alongside the
	# enemy_died signal of the triggering kill so a cascade reads as
	# escalating booms layered with shrinking death-sweep tones.
	Events.kill_exploded.emit(world_pos)
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(enemy):
			continue
		# Iter 224 — Bug Team Node2D guard (defensive).
		if not (enemy is Node2D):
			continue
		if enemy.global_position.distance_to(world_pos) > KILL_EXPLOSION_RADIUS:
			continue
		if enemy.has_method("take_hit"):
			# Pass is_crit=false here — explosions are area damage, not
			# crits. The 2-damage hit reads clearly without crit styling.
			enemy.take_hit(KILL_EXPLOSION_DAMAGE, false)
	var fx: Node2D = SOUL_BURST_SCENE.instantiate() as Node2D
	if fx == null:
		return
	fx.global_position = world_pos
	# Warm orange tint — distinct from soul_burst's red + SHADOW
	# shockwave's indigo. Three different proc visuals now read as
	# three different damage sources.
	fx.modulate = Color(1.0, 0.75, 0.30, 1.0)
	# Slightly larger scale because the explosion radius (72) is
	# smaller than soul_burst (80) — but the visual presence should
	# convey "this is the bigger boom" since the damage is +1.
	fx.scale = Vector2(1.15, 1.15)
	var scene_root: Node = get_tree().current_scene
	if scene_root != null:
		scene_root.add_child(fx)

# Iter 40 — SHADOW ascendance dodge shockwave. Sweeps a 60-px radius
# around the hero, dealing 1 damage to any enemy inside. Pairs with
# the dodge's existing iframes so the hero is untouchable for the
# punch. Also spawns a quick visual ring for feedback — reuses the
# dash_impact scene with an indigo tint to read as "shadow shock"
# distinct from FLAME's red soul_burst.
const SHADOW_SHOCKWAVE_RADIUS: float = 60.0
const SHADOW_SHOCKWAVE_DAMAGE: int = 1
# Iter 62 — SHADOW resonance dodge trail. Spawns a dash_trail instance
# behind the hero, oriented along the dodge direction, and tints the
# whole node indigo via modulate (cascades to the CPUParticles2D child).
# Trail lives 0.7s then queue_free's itself.
# iter-95: _spawn_shadow_dodge_trail removed. SHADOW theme tier-1
# previously spawned an indigo-tinted dash_trail behind the hero on
# every dodge; without dodge there's no separate event to anchor it
# to (dash_strike already spawns its own DASH_TRAIL_SCENE on start).
# Tier-1 SHADOW players lose the indigo trail visual but keep all
# stat bonuses; the tier-2 shockwave (reanchored to dash_strike below)
# still gives the theme its identity beat.

# iter-95: was DODGE × STORM shock pulse — reanchored to dash_strike.
# Spawns a shock_pulse at the hero's CURRENT global_position when
# _start_dash_strike fires (which is BEFORE the dash-time motion
# integration moves the hero along _dash_strike_dir). The pulse is a
# snapshot AoE: it scans get_tree().get_nodes_in_group("enemies") in
# _ready() and applies damage (+ stun at tier 2) to everything inside
# the configured radius.
#
# Tier scaling (matches the brief from iter 68):
#   tier 1 (resonance, 2+ STORM): radius 80, damage 1, stun 0.0
#   tier 2 (ascendance, 4+ STORM): radius 120, damage 2, stun 0.5s
# The stun is delivered via apply_slow(0.5, 0.0) — see shock_pulse.gd
# for why we route through the slow system rather than a separate
# stun field.
#
# Spawn host is get_parent() — same pattern iter 62's shadow dodge
# trail uses, since current_scene silently fails in test instantiate
# contexts (iter 61's lesson).
const SHOCK_PULSE_TIER1_RADIUS: float = 80.0
const SHOCK_PULSE_TIER1_DAMAGE: int = 1
const SHOCK_PULSE_TIER2_RADIUS: float = 120.0
const SHOCK_PULSE_TIER2_DAMAGE: int = 2
const SHOCK_PULSE_TIER2_STUN: float = 0.5

func _spawn_storm_dash_shock_pulse() -> void:
	var pulse: Node2D = SHOCK_PULSE_SCENE.instantiate() as Node2D
	if pulse == null:
		return
	# Dash START — current global_position. _start_dash_strike runs
	# before the motion integration, so this is the spawn point even
	# though the hero will be moving away over DASH_STRIKE_DURATION.
	pulse.global_position = global_position
	var tier: int = GameState.theme_tier("storm")
	var radius: float = SHOCK_PULSE_TIER1_RADIUS
	var damage: int = SHOCK_PULSE_TIER1_DAMAGE
	var stun: float = 0.0
	if tier >= 2:
		radius = SHOCK_PULSE_TIER2_RADIUS
		damage = SHOCK_PULSE_TIER2_DAMAGE
		stun = SHOCK_PULSE_TIER2_STUN
	# setup() must run BEFORE add_child so _ready sees the configured
	# values (shock_pulse.gd reads them in _ready to build the rings
	# AND apply the snapshot AoE damage in the same frame).
	if pulse.has_method("setup"):
		pulse.call("setup", radius, damage, stun)
	var host: Node = get_parent()
	if host != null:
		host.add_child(pulse)

func _trigger_shadow_dash_shockwave() -> void:
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(enemy):
			continue
		# Iter 224 — Bug Team Node2D guard (defensive).
		if not (enemy is Node2D):
			continue
		if enemy.global_position.distance_to(global_position) > SHADOW_SHOCKWAVE_RADIUS:
			continue
		if enemy.has_method("take_hit"):
			enemy.take_hit(SHADOW_SHOCKWAVE_DAMAGE)
	# Visual ring — reuse SOUL_BURST_SCENE (a dash_impact tinted indigo).
	# Different tint from soul_burst's red so the player can tell which
	# proc fired when both are visible.
	var fx: Node2D = SOUL_BURST_SCENE.instantiate() as Node2D
	if fx == null:
		return
	fx.global_position = global_position
	fx.modulate = Color(0.65, 0.55, 1.0, 1.0)
	var scene_root: Node = get_tree().current_scene
	if scene_root != null:
		scene_root.add_child(fx)

# Iter 25 — parry trigger. Tap Q opens the catch window for SHIELD_WINDOW
# seconds. Hits during that window are routed through _on_shield_block
# (which negates damage + spawns the parry VFX + does brief slow-mo).
# Cooldown is set NOW (window + cd) so a player can't re-tap to extend
# coverage past the natural window.
func _start_shield() -> void:
	_shield_time = SHIELD_WINDOW
	_shield_cd = SHIELD_WINDOW + SHIELD_COOLDOWN
	# Resolve aim from cursor — the parry shield orients toward the
	# threat the player is facing, not the hero's current movement
	# direction. Fallback to facing-direction if the cursor is right
	# on top of the hero.
	var aim_world: Vector2 = get_global_mouse_position() - global_position
	if aim_world.length() < 1.0:
		aim_world = _dir_to_vector(_facing_dir)
	var aim: Vector2 = aim_world.normalized()
	# Iter 63 — store parry aim so VOW ascendance's reflect-fan in
	# _on_shield_block knows which direction to fire the projectile burst
	# (parry catch happens AFTER _start_shield, so _shield_aim is set
	# by the time the reflect would fire).
	_shield_aim = aim
	# Iter 29 — kite-silhouette parry shield IN FRONT of the hero,
	# oriented toward the aim direction. Replaces the iter-25 ring
	# pulse as the primary "I am blocking from THIS direction"
	# visual. The pulse below STILL fires as a quick activation
	# flourish; the shield is the persistent guard indicator.
	var shield: Node2D = PARRY_SHIELD_SCENE.instantiate() as Node2D
	var scene_root: Node = get_tree().current_scene
	if shield != null and scene_root != null:
		shield.global_position = global_position + Vector2(0, VFX_HEIGHT_OFFSET)
		if shield.has_method("setup"):
			shield.call("setup", aim)
		scene_root.add_child(shield)
		_shield_ref = shield
	# iter-94: secondary sprite-sheet activation flourish removed — the
	# parry_shield bubble (now a procedural cyan sphere wrapping the
	# hero) is the only parry VFX. User feedback: "the parry/shield are
	# a bit much, lets just keep a shield or parry."
	# Reuse the dodge sound — both are short defensive flourishes. A
	# dedicated parry chime can land in a later audio pass.
	Events.hero_shielded.emit(global_position)

# Called from take_damage when the parry window catches an incoming
# hit. Negates damage, fires a bigger pulse VFX, triggers brief
# slow-mo, and ends the parry window early so the cooldown starts
# counting from the moment of the catch (not the original window end).
func _on_shield_block() -> void:
	# End the window early — the parry just resolved.
	_shield_time = 0.0
	# Long-ish iframes so the same enemy can't immediately re-bump.
	_iframes = max(_iframes, SHIELD_HIT_IFRAMES)
	# Brief slow-mo punctuation. Tween-driven so it eases cleanly.
	Engine.time_scale = SHIELD_HIT_SLOWMO_SCALE
	var tw: Tween = create_tween()
	tw.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	tw.tween_interval(SHIELD_HIT_SLOWMO_TIME)
	tw.tween_property(Engine, "time_scale", 1.0, 0.18)
	# Iter 29 — shatter the active parry shield. shatter() scales it
	# to 1.6× while fading alpha to 0 over 0.18s, then queue_frees.
	# Sells "the shield deflected the hit and dispersed its energy."
	if _shield_ref != null and is_instance_valid(_shield_ref):
		if _shield_ref.has_method("shatter"):
			_shield_ref.shatter()
		_shield_ref = null
	# iter-94: secondary sprite-sheet catch flourish removed. The
	# shatter() call above already supplies the catch beat — the bubble
	# expands to 1.6× and fades over 0.18s, which the player reads as
	# "the shield deflected the hit." Adding a second sprite-sheet on
	# top was the "too much" the user flagged.
	# Re-fire the dodge sfx as the catch confirm. Two stacked plays
	# read distinctly from a single tap.
	Events.hero_shielded.emit(global_position)
	# Amber floater so the player learns the relic-like beat triggered.
	var parent: Node = get_parent()
	if parent != null:
		var n: DamageNumber = DamageNumber.spawn(
			global_position + Vector2(0, -64),
			"SHIELD",
			Color(0.65, 0.95, 1.0),
		)
		parent.add_child(n)
	# Iter 40 — VOW ascendance (4+ VOW relics owned). Every successful
	# parry restores 1 HP (capped at max). Mirrors slime-depths' VOW
	# tier-2 grant: "stand firm + master timing → blood and bone return."
	# Capped so the player can't over-heal; the floater only fires if
	# the heal lands.
	if GameState.theme_tier("vow") >= 2:
		var cap_v: int = MAX_HP + GameState.modifier_total("max_hp_bonus", 0)
		if hp < cap_v and not _is_dying:
			heal(1)
			var parent_v: Node = get_parent()
			if parent_v != null:
				var hn: DamageNumber = DamageNumber.spawn(
					global_position + Vector2(0, -82),
					"+1 VOW",
					Color(0.92, 0.92, 0.78),
				)
				parent_v.add_child(hn)
		# Iter 63 — VOW ascendance parry REFLECT. In addition to the
		# +1 HP heal above, a successful parry catch fans 5 small ivory
		# projectiles outward in a 90° cone facing the parry aim. Each
		# does 1 damage to whoever it hits. Turns parry from purely
		# DEFENSIVE into a real OFFENSIVE punctuation — bait an enemy
		# into a swing, tap Q, watch them get pierced for their trouble.
		# Visually distinct from the iter-39 STORM chain bolt (cyan,
		# arcs to one target) — these are 5 straight ivory bolts in a
		# fan from the parry catch point.
		_spawn_shield_reflect_fan()
	# Iter 215 — BACKDRAFT combo (Phase 4 / BURN + PARRY). If ANY enemy
	# within BACKDRAFT_RADIUS of the hero is currently burning when the
	# parry lands, the parry triggers an outward flame burst. Reads as
	# "the heat from the burning attacker recoils back as you deflect."
	# Doesn't need elaborate per-attack tracking — a parry while a
	# burning enemy is in range is sufficient.
	_try_trigger_backdraft()

# Iter 63 — parry reflect fan. 5 small projectiles in a 90° cone
# centered on the parry's stored aim direction (_shield_aim is set
# in _start_shield). Each projectile is a fresh instance of the
# regular Projectile scene with ivory tint + low damage so the
# burst reads as "spirit retaliation" not "spell cast."
const SHIELD_REFLECT_COUNT: int = 5
const SHIELD_REFLECT_CONE: float = PI * 0.5   # 90° total spread
const SHIELD_REFLECT_DAMAGE: int = 1
const SHIELD_REFLECT_SPEED: float = 380.0
var _shield_aim: Vector2 = Vector2.RIGHT   # set in _start_shield

func _spawn_shield_reflect_fan() -> void:
	var aim: Vector2 = _shield_aim if _shield_aim.length_squared() > 0.001 else Vector2.RIGHT
	# 5 projectiles spread across 90°. Outer ones get +/- 45°.
	var step: float = SHIELD_REFLECT_CONE / float(SHIELD_REFLECT_COUNT - 1)
	var base_angle: float = aim.angle() - SHIELD_REFLECT_CONE * 0.5
	var host: Node = get_parent()
	if host == null:
		return
	for i in range(SHIELD_REFLECT_COUNT):
		var a: float = base_angle + step * float(i)
		var dir: Vector2 = Vector2(cos(a), sin(a))
		var p: Projectile = PROJECTILE_SCENE.instantiate()
		p.global_position = global_position + Vector2(0, VFX_HEIGHT_OFFSET) + dir * 22.0
		p.velocity = dir * SHIELD_REFLECT_SPEED
		p.damage = SHIELD_REFLECT_DAMAGE
		p.target_group = "enemies"
		# Ivory tint matching the VOW theme palette (iter-39 chip color).
		p.orb_tint = Color(0.92, 0.92, 0.78, 1.0)
		host.add_child(p)

# ── Iter 215 / Phase 4 — Hero-side status combos ─────────────────────
# BACKDRAFT (BURN + PARRY) and RIME_TRAIL (SLOW + DASH-THROUGH) live
# here because they fire on HERO actions, not enemy state transitions.
# Enemy-side combos (SHATTER, KINDLE_SPREAD, PETRIFY, SCATTER_FLAMES)
# stay in enemy.gd.

# BACKDRAFT — if a burning enemy is within BACKDRAFT_RADIUS when the
# parry catches, a flame burst radiates outward, applying 1 damage +
# 1 s burn to all enemies in BACKDRAFT_RADIUS. Verb: "the heat of the
# parried attacker recoils." Cooldown comes for free from the parry
# system — you can't parry every 0.4 s.
const BACKDRAFT_RADIUS: float = 96.0
const BACKDRAFT_DAMAGE: int = 1
const BACKDRAFT_BURN_DURATION: float = 1.0

func _try_trigger_backdraft() -> void:
	# Scan for any burning enemy within range. If none, skip silently.
	var rsq: float = BACKDRAFT_RADIUS * BACKDRAFT_RADIUS
	var any_burning: bool = false
	var targets: Array = []
	for e in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(e) or not (e is Node2D):
			continue
		if e.get("_dying"):
			continue
		var d: Vector2 = (e as Node2D).global_position - global_position
		if d.length_squared() > rsq:
			continue
		targets.append(e)
		var burn_rem: float = e.get("_burn_remaining")
		if burn_rem > 0.0:
			any_burning = true
	if not any_burning:
		return
	# Apply damage + burn to EVERY enemy in range (including non-burning
	# ones — the burst doesn't care which ignited it).
	for e in targets:
		if e.has_method("take_hit"):
			e.take_hit(BACKDRAFT_DAMAGE, false)
		if e.has_method("apply_burn"):
			e.apply_burn(BACKDRAFT_BURN_DURATION)
	# Visual: orange ring outward from hero.
	var ring: Polygon2D = Polygon2D.new()
	var pts: PackedVector2Array = PackedVector2Array()
	var verts: int = 20
	for i in range(verts):
		var ang: float = float(i) / verts * TAU
		pts.append(Vector2(cos(ang) * BACKDRAFT_RADIUS, sin(ang) * BACKDRAFT_RADIUS * 0.85))
	ring.polygon = pts
	ring.color = Color(1.0, 0.52, 0.18, 0.62)
	ring.scale = Vector2(0.2, 0.2)
	ring.z_index = 4
	var parent: Node = get_parent()
	if parent != null:
		parent.add_child(ring)
		ring.global_position = global_position
		var tw: Tween = ring.create_tween().set_parallel(true)
		tw.tween_property(ring, "scale", Vector2(1.0, 1.0), 0.30)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tw.tween_property(ring, "modulate:a", 0.0, 0.30)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tw.chain().tween_callback(ring.queue_free)
		# Floater
		var dn: DamageNumber = DamageNumber.spawn(
			global_position + Vector2(0, -72),
			"BACKDRAFT!",
			Color(1.0, 0.65, 0.30),
		)
		parent.add_child(dn)
	if FX != null and FX.has_method("add_trauma"):
		FX.add_trauma(0.35)

# RIME_TRAIL — when the dash-strike hits a slowed enemy, leave a frost
# pulse at that enemy's position that slows other enemies within
# RIME_TRAIL_RADIUS for RIME_TRAIL_SLOW_DURATION. One pulse per dash
# (regardless of how many slowed enemies are hit) so a multi-target
# dash doesn't fan five pulses.
const RIME_TRAIL_RADIUS: float = 84.0
const RIME_TRAIL_SLOW_DURATION: float = 1.2
const RIME_TRAIL_SLOW_MUL: float = 0.55
# Per-dash flag set true on the dash-strike start and consumed by the
# first slowed-enemy hit. Cleared by _start_dash_strike for each new
# dash.
var _rime_trail_armed_this_dash: bool = false

func _try_trigger_rime_trail(at_pos: Vector2) -> void:
	if not _rime_trail_armed_this_dash:
		return
	_rime_trail_armed_this_dash = false
	# Apply slow to enemies in radius (skip self via take-hit-style
	# enemy-only scan — hero isn't in "enemies" group anyway).
	var rsq: float = RIME_TRAIL_RADIUS * RIME_TRAIL_RADIUS
	for e in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(e) or not (e is Node2D):
			continue
		if e.get("_dying"):
			continue
		var d: Vector2 = (e as Node2D).global_position - at_pos
		if d.length_squared() <= rsq and e.has_method("apply_slow"):
			e.apply_slow(RIME_TRAIL_SLOW_DURATION, RIME_TRAIL_SLOW_MUL)
	# Visual: cyan-white expanding ring centered on hit position.
	var ring: Polygon2D = Polygon2D.new()
	var pts: PackedVector2Array = PackedVector2Array()
	var verts: int = 18
	for i in range(verts):
		var ang: float = float(i) / verts * TAU
		pts.append(Vector2(cos(ang) * RIME_TRAIL_RADIUS, sin(ang) * RIME_TRAIL_RADIUS * 0.78))
	ring.polygon = pts
	ring.color = Color(0.70, 0.92, 1.0, 0.65)
	ring.scale = Vector2(0.2, 0.2)
	ring.z_index = 3
	var parent: Node = get_parent()
	if parent != null:
		parent.add_child(ring)
		ring.global_position = at_pos
		var tw: Tween = ring.create_tween().set_parallel(true)
		tw.tween_property(ring, "scale", Vector2(1.0, 1.0), 0.34)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tw.tween_property(ring, "modulate:a", 0.0, 0.34)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tw.chain().tween_callback(ring.queue_free)
		var dn: DamageNumber = DamageNumber.spawn(
			at_pos + Vector2(0, -40),
			"RIME!",
			Color(0.78, 0.92, 1.0),
		)
		parent.add_child(dn)

# Iter 25 — dash pass-through damage tick. Called from _physics_process
# while _dash_strike_time > 0. Scans enemies near the hero this frame
# and damages any not already in the per-dash hit_set. Knockback uses
# the dash direction so enemies sliced through are pushed AHEAD of the
# hero rather than back into them.
func _apply_dash_pierce_tick() -> void:
	var knockback_mul: float = 1.0 + GameState.modifier_total_f("knockback_force_mul", 0.0)
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(enemy):
			continue
		var id: int = enemy.get_instance_id()
		if _dash_hit_set.has(id):
			continue
		var to_enemy: Vector2 = enemy.global_position - global_position
		if to_enemy.length() > DASH_STRIKE_PIERCE_RADIUS:
			continue
		if enemy.has_method("take_hit"):
			# Iter 44 — dash pierce crit roll. Previously skipped — only
			# melee swings rolled crit, so a dash-strike build with 40%
			# crit chance saw zero crit feedback. Apply same per-hit roll
			# pattern; multiply damage on success, pass is_crit through.
			var dmg_dp: int = DASH_STRIKE_PIERCE_DAMAGE
			var is_crit_dp: bool = _roll_crit()
			if is_crit_dp:
				dmg_dp = int(round(float(dmg_dp) * (CRIT_DAMAGE_MUL + GameState.modifier_total_f("crit_damage_bonus_f", 0.0))))
			enemy.take_hit(dmg_dp, is_crit_dp)
			_dash_hit_set[id] = true
			_bump_combo()   # iter 54 — dash pierce hits count toward combo
		if enemy.has_method("apply_knockback"):
			# Push enemies ALONG the dash direction so the player
			# clears a corridor instead of leaving stunned enemies
			# behind them.
			enemy.apply_knockback(_dash_strike_dir, MELEE_KNOCKBACK_FORCE * knockback_mul, MELEE_KNOCKBACK_TIME)

func _can_start_dash_strike() -> bool:
	# iter-95: _dodge_time check removed (dodge ability gone).
	return _dash_strike_cd <= 0.0 \
		and _dash_strike_time <= 0.0 \
		and _shield_time <= 0.0

# iter-95: _can_cancel_dodge_into_dash_strike() removed alongside the
# dodge ability. With no dodge to cancel, the iter-70 dodge-cancel
# feel-improver is gone too.

# Iter 201 — first active relic: SOUL SURGE. Press R, AoE damage burst
# around hero, 18 s cooldown. Establishes the active-relic pattern that
# Isaac's D6 + Blank Card use — once one active relic exists, future
# active items can reuse this same handler shape.
#
# Effect: 3 damage to every enemy within 100 px radius. Spawns a violet-
# white expanding ring at hero position + trauma shake + audio cue.
# No directional aim (it's omnidirectional), no projectile travel
# (instant AoE), no charge time (snap-cast for clutch moments).
func _trigger_soul_surge() -> void:
	_active_relic_cd = ACTIVE_RELIC_COOLDOWN
	# Damage all enemies in radius via group iteration.
	var radius_sq: float = ACTIVE_RELIC_RADIUS * ACTIVE_RELIC_RADIUS
	for e in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(e):
			continue
		if not (e is Node2D):
			continue
		var d: Vector2 = (e as Node2D).global_position - global_position
		if d.length_squared() <= radius_sq:
			if e.has_method("take_hit"):
				e.take_hit(ACTIVE_RELIC_DAMAGE, false)
	# Visual: expanding violet-white ring at hero position. Built inline
	# as a Polygon2D so we don't need a new scene file. Tweens scale
	# 0.15 → 1.0 (matches the 100 px radius constant) over 220 ms +
	# fades alpha to 0. Similar grammar to the iter-181 impact ring on
	# hit, but bigger and cooler-toned to read as "your power surged"
	# rather than "an enemy was hit."
	var ring: Polygon2D = Polygon2D.new()
	var pts: PackedVector2Array = PackedVector2Array()
	var verts: int = 28
	for i in range(verts):
		var ang: float = float(i) / verts * TAU
		pts.append(Vector2(cos(ang), sin(ang)) * ACTIVE_RELIC_RADIUS)
	ring.polygon = pts
	ring.position = global_position
	ring.color = Color(0.78, 0.62, 1.0, 0.75)
	ring.scale = Vector2(0.15, 0.15)
	ring.z_index = 4
	var parent: Node = get_parent()
	if parent != null:
		parent.add_child(ring)
		var tw: Tween = ring.create_tween().set_parallel(true)
		tw.tween_property(ring, "scale", Vector2.ONE, 0.22)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tw.tween_property(ring, "modulate:a", 0.0, 0.22)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tw.chain().tween_callback(ring.queue_free)
	# Trauma shake + audio cue.
	if FX != null and FX.has_method("add_trauma"):
		FX.add_trauma(0.55)
	if Audio != null and Audio.has_method("_play"):
		Audio._play("kill_explode", global_position)

# ── Iter 213 / Phase 2 — Active relic toolkit expansion ───────────────
# Three new actives added beside SOUL SURGE. The hero input handler
# dispatches via GameState.get_owned_active_id() so only ONE active is
# bound to [R] at any time (BoI-slot pattern). Each trigger sets its
# OWN cooldown — _active_relic_cd is the shared timer, but the value
# each active assigns reflects its identity (defensive teleport short,
# risk-reward long).

# VEILSTEP — defensive phase teleport. ~140 px along the aim direction
# (clamped to the play area), with full iframes during the brief blink
# fade. The verb is "get out of trouble," not damage. SHADOW theme.
const VEILSTEP_DISTANCE: float = 140.0
const VEILSTEP_COOLDOWN: float = 14.0
const VEILSTEP_IFRAMES: float = 0.45
# Play-area bounds copied from main.gd's PLAY_AREA_MIN/MAX so the
# teleport endpoint can't end inside the perimeter wall mass. Keep in
# sync if those constants ever shift.
const VEILSTEP_AREA_MIN: Vector2 = Vector2(96, 96)
const VEILSTEP_AREA_MAX: Vector2 = Vector2(1184, 672)

func _trigger_veilstep() -> void:
	_active_relic_cd = VEILSTEP_COOLDOWN
	# Aim is mouse-relative. If the mouse is right on top of the hero,
	# fall back to current facing direction so the relic doesn't no-op.
	var aim: Vector2 = get_global_mouse_position() - global_position
	if aim.length() < 1.0:
		aim = _dir_to_vector(_facing_dir)
	var dir: Vector2 = aim.normalized()
	var start: Vector2 = global_position
	var end_raw: Vector2 = start + dir * VEILSTEP_DISTANCE
	# Clamp endpoint INSIDE the play area minus a small inset so we
	# don't land touching a wall. 24 px inset = ~ hero radius headroom.
	var end_pos: Vector2 = Vector2(
		clampf(end_raw.x, VEILSTEP_AREA_MIN.x + 24.0, VEILSTEP_AREA_MAX.x - 24.0),
		clampf(end_raw.y, VEILSTEP_AREA_MIN.y + 24.0, VEILSTEP_AREA_MAX.y - 24.0)
	)
	# Iframes cover the full teleport + small overhang so an enemy
	# attack that connects WHILE you're mid-phase still misses.
	_iframes = max(_iframes, VEILSTEP_IFRAMES)
	# Spawn shadow rings at BOTH endpoints — the player sees where they
	# came from and where they are now. SHADOW-themed dark violet.
	_spawn_veilstep_ring(start)
	_spawn_veilstep_ring(end_pos)
	# Brief sprite fade-out at start position, then snap to end_pos
	# and fade back in. Tween parented to hero so it follows the
	# teleport instantly. 60 ms each side.
	if sprite != null:
		var tw: Tween = create_tween()
		tw.tween_property(sprite, "modulate:a", 0.15, 0.06)
		tw.tween_callback(func():
			global_position = end_pos
		)
		tw.tween_property(sprite, "modulate:a", 1.0, 0.10)
	else:
		global_position = end_pos
	# Audio cue — reuse dash whoosh for now; future sound design can
	# author a phase-specific cue.
	if Audio != null and Audio.has_method("_play"):
		Audio._play("dash_whoosh", global_position)
	if FX != null and FX.has_method("add_trauma"):
		FX.add_trauma(0.25)

func _spawn_veilstep_ring(at_pos: Vector2) -> void:
	var ring: Polygon2D = Polygon2D.new()
	var pts: PackedVector2Array = PackedVector2Array()
	var verts: int = 22
	var r: float = 28.0
	for i in range(verts):
		var ang: float = float(i) / verts * TAU
		pts.append(Vector2(cos(ang), sin(ang)) * r)
	ring.polygon = pts
	ring.color = Color(0.35, 0.20, 0.55, 0.78)
	ring.position = at_pos
	ring.scale = Vector2(0.4, 0.4)
	ring.z_index = 4
	var parent: Node = get_parent()
	if parent == null:
		return
	parent.add_child(ring)
	var tw: Tween = ring.create_tween().set_parallel(true)
	tw.tween_property(ring, "scale", Vector2(1.1, 1.1), 0.32)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(ring, "modulate:a", 0.0, 0.32)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(ring.queue_free)

# ASHEN SEAL — drop a stationary burning sigil at hero's feet. Every
# 0.5 s for 4 s, applies a short BURN to every enemy within 80 px.
# Composes with the SHATTER and KINDLE_SPREAD combos — drop, kite,
# watch the chain reactions. FLAME theme.
const ASHEN_SEAL_COOLDOWN: float = 20.0
const ASHEN_SEAL_RADIUS: float = 80.0
const ASHEN_SEAL_DURATION: float = 4.0
const ASHEN_SEAL_TICK_INTERVAL: float = 0.5
const ASHEN_SEAL_BURN_DURATION: float = 1.2

func _trigger_ashen_seal() -> void:
	_active_relic_cd = ASHEN_SEAL_COOLDOWN
	var drop_pos: Vector2 = global_position
	# Build the ward as a Node2D parented to scene root so it stays put
	# when the hero moves. Visual: a soft orange ring + a smaller inner
	# glyph polygon, both pulsing during lifetime.
	var ward: Node2D = Node2D.new()
	ward.name = "AshenSealWard"
	ward.position = drop_pos
	ward.z_index = -1
	var parent: Node = get_parent()
	if parent == null:
		return
	parent.add_child(ward)
	# Outer flame ring (Polygon2D at the seal radius).
	var ring: Polygon2D = Polygon2D.new()
	var rpts: PackedVector2Array = PackedVector2Array()
	var rverts: int = 26
	for i in range(rverts):
		var ang: float = float(i) / rverts * TAU
		rpts.append(Vector2(cos(ang), sin(ang)) * ASHEN_SEAL_RADIUS)
	ring.polygon = rpts
	ring.color = Color(1.0, 0.45, 0.18, 0.42)
	ward.add_child(ring)
	# Inner sigil — small 6-pointed star Polygon2D so the ward reads as
	# "drawn glyph," not generic puddle.
	var sigil: Polygon2D = Polygon2D.new()
	var spts: PackedVector2Array = PackedVector2Array()
	for i in range(12):
		var ang2: float = float(i) / 12 * TAU
		var r2: float = 26.0 if i % 2 == 0 else 12.0
		spts.append(Vector2(cos(ang2), sin(ang2)) * r2)
	sigil.polygon = spts
	sigil.color = Color(1.0, 0.65, 0.22, 0.78)
	ward.add_child(sigil)
	# Pulse — alpha breathe on the ring throughout the lifetime via
	# tween loop. Sigil rotates slowly so the player sees CONTINUOUS
	# activity rather than a static decal.
	var pulse_tw: Tween = ring.create_tween().set_loops(int(ASHEN_SEAL_DURATION / 0.8) + 1)
	pulse_tw.tween_property(ring, "modulate:a", 0.7, 0.4)
	pulse_tw.tween_property(ring, "modulate:a", 0.3, 0.4)
	var rot_tw: Tween = sigil.create_tween().set_loops(0)
	rot_tw.tween_property(sigil, "rotation", TAU, 6.0)
	# Burn-tick timer — fires apply_burn to enemies in range every
	# ASHEN_SEAL_TICK_INTERVAL seconds. Connect via Callable.bind so the
	# tick function has access to the ward's position even after the
	# hero has moved away.
	var timer: Timer = Timer.new()
	timer.wait_time = ASHEN_SEAL_TICK_INTERVAL
	timer.autostart = true
	timer.one_shot = false
	ward.add_child(timer)
	timer.timeout.connect(_ashen_seal_tick.bind(drop_pos))
	# Lifetime: tween_callback that frees the ward after the duration.
	# Done via SceneTreeTimer so we don't need to babysit it.
	get_tree().create_timer(ASHEN_SEAL_DURATION).timeout.connect(ward.queue_free)
	# Audio + small trauma shake on drop.
	if Audio != null and Audio.has_method("_play"):
		Audio._play("kill_explode", drop_pos)
	if FX != null and FX.has_method("add_trauma"):
		FX.add_trauma(0.30)

func _ashen_seal_tick(at_pos: Vector2) -> void:
	# Apply a short BURN to every enemy in the radius. apply_burn's
	# refresh semantics (max of existing vs new) prevent stacking
	# damage past one DoT per enemy, which is what we want — the seal
	# REFRESHES burn, not stacks it.
	var r2: float = ASHEN_SEAL_RADIUS * ASHEN_SEAL_RADIUS
	for e in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(e) or not (e is Node2D):
			continue
		if e.get("_dying"):
			continue
		var d: Vector2 = (e as Node2D).global_position - at_pos
		if d.length_squared() <= r2 and e.has_method("apply_burn"):
			e.apply_burn(ASHEN_SEAL_BURN_DURATION)

# BLOOD TITHE — sacrifice HP for a burst window. Press [R] (HP > 1):
# pay 1 HP up-front, gain +50 % damage on sword/blast/dash for 6 s,
# AND every enemy kill during the window heals +1 HP back. Tempo /
# risk verb — push it when you have momentum and threats lined up.
# Burst window can net positive if you clear well, but the up-front
# cost is non-refundable. BLOOD theme. 30 s cooldown.
const BLOOD_TITHE_COOLDOWN: float = 30.0
const BLOOD_TITHE_BUFF_DURATION: float = 6.0
const BLOOD_TITHE_DMG_MUL: float = 1.5
const BLOOD_TITHE_KILL_HEAL: int = 1
# Buff timer (decremented in _physics_process). > 0 means damage_mul
# applies AND on-kill heal fires. _resolve_melee_strike / _start_blast
# / dash_strike all read this to apply the multiplier; the heal hook
# lives in _on_enemy_died_for_relics.
var _blood_tithe_buff_time: float = 0.0

func _trigger_blood_tithe() -> void:
	# Guard: can't activate at 1 HP — would be a suicide press.
	if hp <= 1:
		# Soft refusal — don't burn the cooldown if the player
		# accidentally pressed at low HP. Brief audio cue.
		if Audio != null and Audio.has_method("_play"):
			Audio._play("parry_chime", global_position)
		return
	_active_relic_cd = BLOOD_TITHE_COOLDOWN
	# Pay the cost — direct hp subtract (NOT take_damage; this is a
	# sacrifice, not an enemy strike, so it bypasses iframes / DR / etc).
	hp -= 1
	# Arm the buff window. _physics_process drains this.
	_blood_tithe_buff_time = BLOOD_TITHE_BUFF_DURATION
	# Red aura ring around the hero — pulses during the buff window.
	# Persists for the buff lifetime via a self-freeing Tween loop.
	var aura: Polygon2D = Polygon2D.new()
	var apts: PackedVector2Array = PackedVector2Array()
	var averts: int = 22
	for i in range(averts):
		var ang: float = float(i) / averts * TAU
		apts.append(Vector2(cos(ang), sin(ang)) * 36.0)
	aura.polygon = apts
	aura.color = Color(0.85, 0.18, 0.20, 0.55)
	aura.z_index = 1
	add_child(aura)  # parent to hero so it follows
	# Pulse during the buff. The loop count is approximate (one cycle
	# per 0.6 s); the explicit free at the end of the chain handles
	# expiry whether or not the loops complete.
	var loops: int = int(BLOOD_TITHE_BUFF_DURATION / 0.6)
	var tw: Tween = aura.create_tween().set_loops(loops)
	tw.tween_property(aura, "modulate:a", 0.85, 0.3)
	tw.tween_property(aura, "modulate:a", 0.40, 0.3)
	tw.chain().tween_property(aura, "modulate:a", 0.0, 0.2)
	tw.chain().tween_callback(aura.queue_free)
	# Audio: heavy heartbeat-like cue.
	if Audio != null and Audio.has_method("_play"):
		Audio._play("kill_explode", global_position)
	if FX != null and FX.has_method("add_trauma"):
		FX.add_trauma(0.35)

# Multiplier the damage code paths consult while BLOOD TITHE is active.
# Returns 1.5 during the buff window, 1.0 otherwise.
func _blood_tithe_damage_mul() -> float:
	if _blood_tithe_buff_time > 0.0:
		return BLOOD_TITHE_DMG_MUL
	return 1.0

func _start_dash_strike() -> void:
	var aim_world := get_global_mouse_position() - global_position
	if aim_world.length() < 1.0:
		aim_world = _dir_to_vector(_facing_dir)
	_dash_strike_dir = aim_world.normalized()
	_dash_strike_time = DASH_STRIKE_DURATION
	# Iter 215 — RIME_TRAIL combo arming (Phase 4 / SLOW + DASH-THROUGH).
	# Re-armed each dash so the trail can fire at most once per dash
	# regardless of how many enemies are sliced.
	_rime_trail_armed_this_dash = true
	# Iter 197 — dash whoosh audio. Pre-iter-197 dash_strike was visually
	# distinctive (golden afterimages) but audibly silent. Adding a
	# 400→1200 Hz sine sweep over 200 ms gives the move the iconic
	# "energy in motion" sonic cue Hades' dash has. Played at hero
	# position so it spatially tracks with the move's start.
	if Audio != null and Audio.has_method("_play"):
		Audio._play("dash_whoosh", global_position)
	# iter-96: relics + SHADOW theme can shrink the cooldown via
	# `dash_strike_cooldown_mul`. Modifier folds additively (e.g. -0.30
	# from dash_master + -0.40 from phantom_step = -0.70 → 30% of base).
	# Clamped to a 0.25s floor so the engage stays meaningful.
	var dscd_mul: float = 1.0 + GameState.modifier_total_f("dash_strike_cooldown_mul", 0.0)
	_dash_strike_cd = max(0.25, DASH_STRIKE_COOLDOWN * dscd_mul)
	# Iter 64 — capture the dash's origin so _resolve_dash_strike_hit
	# can stamp FLAME fire-trail pools evenly between start and end.
	_dash_strike_start_pos = global_position
	# Iter 25 — iframes cover the full dash + POST_IFRAMES seconds AFTER
	# so a player landing next to a swinging enemy has a window to
	# reposition. Previously iframes ended exactly at dash end, leaving
	# the hero vulnerable on the worst possible frame.
	# iter-96: relics that previously extended dodge i-frames now extend
	# DASH STRIKE post-iframes via `dash_strike_post_iframes_bonus_f`.
	var ds_post_bonus: float = GameState.modifier_total_f("dash_strike_post_iframes_bonus_f", 0.0)
	_iframes = max(_iframes, DASH_STRIKE_DURATION + DASH_STRIKE_POST_IFRAMES + ds_post_bonus)
	_facing_dir = _vector_to_dir_idx(_dash_strike_dir)
	# Iter 25 — reset the pass-through hit_set for this dash so the
	# tick scanner can start fresh. Dictionary cleared (not reassigned)
	# so any in-flight references remain valid.
	_dash_hit_set.clear()
	# Iter 29 — reset afterimage cadence so the first ghost spawns
	# AFTERIMAGE_INTERVAL after the dash starts (rather than immediately,
	# which would visually overlap with the hero itself for the first
	# frame).
	_afterimage_timer = 0.0
	# Iter 13 — spawn a motion trail behind us.
	var trail: Node2D = DASH_TRAIL_SCENE.instantiate() as Node2D
	if trail != null:
		trail.global_position = global_position + Vector2(0, VFX_HEIGHT_OFFSET)
		if trail.has_method("setup"):
			trail.call("setup", _dash_strike_dir)
		get_tree().current_scene.add_child(trail)
	# iter-98: dash_shield spawn removed (see DASH_SHIELD_SCENE comment
	# at the top of the file). The dash visual stack is now: hero
	# afterimages + DASH_TRAIL particles behind + the dash_impact slam
	# at landing. No leading "magic orb" anymore.
	# iter-95: SHADOW + STORM theme procs reanchored from dodge to
	# dash_strike. Dash strike is now the only mobility / aggressive-
	# engage option, so the "moving fast unleashes a shockwave/pulse"
	# theme identity moves with it.
	#   SHADOW tier 2: 60-px shockwave + 1 dmg at dash start
	#   STORM tier 1+: shock pulse (80-120 px) at dash start
	if GameState.theme_tier("shadow") >= 2:
		_trigger_shadow_dash_shockwave()
	if GameState.theme_tier("storm") >= 1:
		_spawn_storm_dash_shock_pulse()

# Iter 29 — spawn a single dash afterimage at the hero's current world
# pose. Grabs the AnimatedSprite2D's current frame texture as an
# AtlasTexture, slaps it on a fresh Sprite2D parented to current_scene,
# and tweens alpha → 0 with a small extra scale-out for that "echo of
# light" feel. The tween belongs to the new Sprite2D so its lifetime
# is bounded by its own queue_free — no leaks if the hero is freed
# mid-dash (scene reload / death).
func _spawn_dash_afterimage() -> void:
	if sprite == null or sprite.sprite_frames == null:
		return
	var scene_root: Node = get_tree().current_scene
	if scene_root == null:
		return
	var anim: StringName = sprite.animation
	if not sprite.sprite_frames.has_animation(anim):
		return
	var frame_idx: int = sprite.frame
	var tex: Texture2D = sprite.sprite_frames.get_frame_texture(anim, frame_idx)
	if tex == null:
		return
	var ghost: Sprite2D = Sprite2D.new()
	ghost.texture = tex
	ghost.global_position = global_position + sprite.position
	ghost.scale = sprite.scale
	ghost.flip_h = sprite.flip_h
	ghost.modulate = AFTERIMAGE_TINT
	# Behind the hero in draw order so the active sprite always reads
	# as "in front." z_index relative to the parent's own.
	ghost.z_index = -1
	scene_root.add_child(ghost)
	# Tween belongs to the ghost so its life ends with itself; outliving
	# the hero (scene reload) just drops the tween cleanly.
	var tw: Tween = ghost.create_tween().set_parallel(true)
	tw.tween_property(ghost, "modulate:a", 0.0, AFTERIMAGE_FADE_TIME)
	tw.tween_property(ghost, "scale", ghost.scale * 1.1, AFTERIMAGE_FADE_TIME)
	tw.chain().tween_callback(ghost.queue_free)

func _resolve_dash_strike_hit() -> void:
	var damage: int = 1 + GameState.modifier_total("sword_damage_bonus", 0)
	# Iter 213 — BLOOD TITHE multiplier on dash-strike too. Dash-strike
	# is a "spend a chunk of HP for power" move's natural partner.
	damage = int(round(float(damage) * _blood_tithe_damage_mul()))
	var knockback_mul: float = 1.0 + GameState.modifier_total_f("knockback_force_mul", 0.0)
	var has_execute: bool = GameState.has_relic("executioner")
	var hit_count: int = 0
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(enemy):
			continue
		# Iter 224 — Bug Team guard. A future non-Node2D in the "enemies"
		# group would crash `.global_position` and the typed
		# `enemy.get("_slow_remaining")` assignment (null → float crash).
		if not (enemy is Node2D):
			continue
		var to_enemy: Vector2 = enemy.global_position - global_position
		if to_enemy.length() > DASH_STRIKE_RADIUS:
			continue
		# Iter 25 — pass-through damage already hit this enemy during
		# the dash window; skip the final AoE damage to avoid double-
		# counting. We still apply the radial knockback so the final
		# impact still SHOVES enemies hit en-route, not just the new
		# ones in the AoE.
		var already_hit: bool = _dash_hit_set.has(enemy.get_instance_id())
		if enemy.has_method("take_hit") and not already_hit:
			var dmg_for_this: int = damage
			if has_execute and _is_executable(enemy):
				dmg_for_this = int(round(float(damage) * 2.5))
			# Iter 44 — dash-strike final-AoE crit roll. Parity with
			# melee swing crit; previously this path silently skipped
			# the roll.
			var is_crit_ds: bool = _roll_crit()
			if is_crit_ds:
				dmg_for_this = int(round(float(dmg_for_this) * (CRIT_DAMAGE_MUL + GameState.modifier_total_f("crit_damage_bonus_f", 0.0))))
			# Iter 215 — RIME_TRAIL combo (Phase 4 / SLOW + DASH-THROUGH).
			# Check the SLOW status on the enemy BEFORE take_hit (which
			# might kill it and clear status). If this slowed enemy is
			# the first slowed target of this dash, fire the frost pulse
			# at THEIR position. _try_trigger_rime_trail consumes the
			# arming flag so only ONE pulse per dash even if the dash
			# slices multiple slowed enemies.
			# Iter 224 — defensively read _slow_remaining. .get() returns
			# Variant; if the property isn't on this enemy (mocked / test
			# / future non-Enemy node) the assignment to a typed float
			# would crash. Coerce via float() with null fallback to 0.0.
			var slow_var: Variant = enemy.get("_slow_remaining")
			var enemy_slow: float = float(slow_var) if slow_var != null else 0.0
			enemy.take_hit(dmg_for_this, is_crit_ds)
			if enemy_slow > 0.0 and _rime_trail_armed_this_dash:
				_try_trigger_rime_trail(enemy.global_position)
			hit_count += 1
			_bump_combo()   # iter 54 — dash final-AoE hits count
		# Iter 13 — heavy radial knockback on dash AoE. Each enemy gets
		# pushed straight away from the hero, harder + longer than the
		# normal melee knockback because the dash is a committed engage.
		if enemy.has_method("apply_knockback"):
			var push_dir: Vector2 = to_enemy.normalized() if to_enemy.length() > 0.01 else _dash_strike_dir
			enemy.apply_knockback(push_dir, DASH_KNOCKBACK_FORCE * knockback_mul, DASH_KNOCKBACK_TIME)
	# Iter 64 — FLAME resonance/ascendance dash-strike fire trail. The
	# dash is a committed engage that carves a 168px line through enemy
	# space; FLAME owners turn that line into a burning streak the next
	# wave has to walk through. Tier 1 (≥2 FLAME relics): 3 pools, 0.5s
	# each. Tier 2 (≥4 FLAME relics): 5 pools, 0.7s each — wider trail
	# (more pools = more overlap) AND longer-lasting. Independent of
	# whether the dash connected (whiff still leaves a trail — the
	# player committed the resource cost, they get the AoE).
	var flame_tier: int = GameState.theme_tier("flame")
	if flame_tier >= 1:
		var pool_count: int = 5 if flame_tier >= 2 else 3
		var pool_life: float = 0.7 if flame_tier >= 2 else 0.5
		_trigger_dash_fire_trail(_dash_strike_start_pos, global_position, pool_count, pool_life)
	# Always emit even on whiff — the impact VFX still wants to fire so
	# the player gets visual feedback that the dash committed.
	dash_strike_landed.emit(global_position + Vector2(0, VFX_HEIGHT_OFFSET), hit_count)

# Iter 64 — drop `count` fire pools evenly spaced along the dash path
# from `start` to `end`. Pool _life set BEFORE add_child so the pool's
# _physics_process uses the overridden lifetime. Pools are added to the
# hero's parent (main.tscn) to mirror iter 61's swing-trail host pattern
# — get_tree().current_scene can be null during test instantiation.
func _trigger_dash_fire_trail(start: Vector2, end: Vector2, count: int, pool_life: float) -> void:
	if count <= 0:
		return
	var host: Node = get_parent()
	if host == null:
		return
	# Evenly space pools along the path: t = 0, 1/(N-1), 2/(N-1), ... 1.0.
	# For count=1 we just drop one at the midpoint.
	for i in range(count):
		var t: float = 0.5 if count == 1 else float(i) / float(count - 1)
		var pos: Vector2 = start.lerp(end, t)
		var pool: Node2D = FIRE_POOL_SCENE.instantiate() as Node2D
		if pool == null:
			continue
		pool.global_position = pos
		pool.set("_life", pool_life)
		host.add_child(pool)

# Compare-and-set animation play. AnimatedSprite2D.play() restarts the
# animation from frame 0 every call. Helper checks the cached name before
# forwarding so we don't re-trigger frame 0 every physics tick. Callers
# that DO want a frame-0 restart (e.g. starting an attack) set
# sprite.frame = 0 before calling, which trips the is_playing branch on
# the next call and we forward naturally.
func _play_anim(name: StringName) -> void:
	if _last_anim == name and sprite.is_playing():
		return
	_last_anim = name
	sprite.play(name)
