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
const HERO_DRAW          := 60
const ATTACK_RANGE       := 56
const ATTACK_ARC         := PI * 0.55
const ATTACK_COOLDOWN    := 0.40
const ATTACK_SWING_TIME  := 0.18
const MAX_HP             := 3

# Dodge tuning — matches slime-depths/src/hero.js values.
const DODGE_SPEED        := 480.0
const DODGE_DURATION     := 0.25
const DODGE_IFRAMES      := 0.45
const DODGE_COOLDOWN     := 0.85
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
const PARRY_PULSE_SCENE  = preload("res://scenes/fx/parry_pulse.tscn")
const PARRY_SHIELD_SCENE = preload("res://scenes/fx/parry_shield.tscn")
# soul_burst relic — reuse the dash impact shockwave scene tinted red.
# Cheap visual until a dedicated VFX prefab lands.
const SOUL_BURST_SCENE   = preload("res://scenes/fx/dash_impact.tscn")
# Iter 40 — FLAME ascendance fire pool. Spawned at every kill site
# when the hero owns 4+ FLAME relics. Stacks with soul_burst (which
# triggers on every 5th kill) — both can fire on a 5/10/15th kill.
const FIRE_POOL_SCENE = preload("res://scenes/fire_pool.tscn")

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
const PARRY_WINDOW   := 0.20
const PARRY_COOLDOWN := 0.7
const PARRY_TINT     := Color(0.65, 0.95, 1.0, 1)   # cyan, distinct from dodge
# Brief slow-mo when the parry catches an incoming hit. Driven by
# Engine.time_scale via a one-shot tween in the hit handler.
const PARRY_HIT_SLOWMO_SCALE := 0.30
const PARRY_HIT_SLOWMO_TIME  := 0.10
# Iframes granted after a successful parry catch — long enough to
# prevent the same enemy from re-bumping us, short enough that we
# can't chain-parry through a wave for free.
const PARRY_HIT_IFRAMES      := 0.30

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
const DASH_STRIKE_COOLDOWN := 1.4
const DASH_STRIKE_RADIUS   := 60.0
const DASH_STRIKE_POST_IFRAMES := 0.10
const DASH_STRIKE_STEER_GAIN   := 0.15
# Hero collision radius is 14; we want a generous pass-through hit-box
# during dash so glancing impacts register. 40 covers hero body + small
# enemies (slimes ~22, spider ~12) without grabbing distant ones.
const DASH_STRIKE_PIERCE_RADIUS := 40.0
const DASH_STRIKE_PIERCE_DAMAGE := 1
# Iter 29 — afterimage cadence. Spawn one ghost every AFTERIMAGE_INTERVAL
# seconds during the dash window. 0.04 s ≈ 7 ghosts over a 0.28 s dash,
# enough to sell "leaving light behind" without flooding the scene.
const AFTERIMAGE_INTERVAL: float = 0.04
# Color tint applied to each afterimage Sprite2D. Cyan-purple matches
# the dash trail's particle palette so the afterimages + trail read
# as the SAME energy phenomenon.
const AFTERIMAGE_TINT: Color = Color(0.55, 0.85, 1.0, 0.55)
const AFTERIMAGE_FADE_TIME: float = 0.22

# Iter 11 — feel tuning.
const CAMERA_LOOKAHEAD       := 90.0
const CAMERA_LOOKAHEAD_LERP  := 3.5
const CAMERA_MOVE_THRESHOLD  := 15.0
const SPRITE_BASE_Y          := -23.0
const IDLE_BOB_AMP           := 1.6
const IDLE_BOB_FREQ          := 1.7
const IDLE_BOB_LERP          := 8.0
const STEP_INTERVAL          := 28.0

# Iter 12 — direction tables + animation metadata. Reads:
# DIR_NAMES[i] = direction suffix for bucket i (north-clockwise).
# ANIM_DATA[state] = { sheet, frames, fps, loop } — used both to build
# SpriteFrames at _ready and to pick the animation name each tick.
const CELL_SIZE  := 128
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
# Forward lunge: a brief velocity additive in the aim direction so the
# hero commits to the swing instead of staying planted. Decays linearly
# over LUNGE_TIME. 220 × 0.10 / 2 = ~11 px of forward movement; the
# player FEELS the swing but doesn't teleport.
const LUNGE_SPEED           := 220.0
const LUNGE_TIME            := 0.10

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D

var hp: int = MAX_HP
var _attack_cd := 0.0
var _attack_live := 0.0
var _attack_aim := Vector2.RIGHT
var _is_attacking := false

# Iter 12 — 0..7 bucket (N,NE,E,SE,S,SW,W,NW). Default south so the
# player sees the hero's face on spawn (not the back).
var _facing_dir: int = 4

var _dodge_cd := 0.0
var _dodge_time := 0.0
var _dodge_dir := Vector2.RIGHT
var _iframes := 0.0

var _blast_cd := 0.0

# Iter 25 — parry state (replaces shield_stamina/_shield_active/_shield_break_cd).
# _parry_time   counts down from PARRY_WINDOW while the catch window is open.
# _parry_cd     blocks re-trigger until elapsed. Set in _update_parry after
#               the window closes (caught or not), keyed to PARRY_COOLDOWN.
var _parry_time := 0.0
var _parry_cd   := 0.0
# Iter 29 — handle to the currently-active parry_shield instance so
# _on_parry_hit can call shatter() on it. Null when no shield is up.
var _parry_shield_ref: Node2D = null

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
# Iter 21 — phoenix_feather one-shot. Like _second_wind_used but
# distinct so a player who owns BOTH gets to trigger both in the same
# run (phoenix on the first lethal blow, second_wind on a later one).
var _phoenix_feather_used: bool = false
# iron_resolve — first wound each ROOM is fully absorbed. Auto-resets
# because every room transition reloads main.tscn and we get a fresh
# hero instance with this flag back to false. No manual reset needed.
var _iron_resolve_absorbed_this_room: bool = false

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

# Iter 19 — melee feel state.
# _lunge_time / _lunge_dir: brief forward push during the first
# LUNGE_TIME seconds of a swing. Decays linearly to 0 then releases
# control back to the input vector.
# _pending_melee_strike + aim/range cached so the windowed damage
# scan in _physics_process knows what to hit.
var _lunge_time: float = 0.0
var _lunge_dir: Vector2 = Vector2.ZERO
var _pending_melee_strike: bool = false
var _melee_strike_timer: float = 0.0
var _pending_melee_aim: Vector2 = Vector2.RIGHT
var _pending_melee_range: float = 0.0

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
signal dodge_started
# Iter 13 — fired when a melee swing actually connects with ≥1 enemy.
# main.gd listens for a brief hit-stop scaled by hit_count. Distinct
# from Events.enemy_hit (which fires once per enemy and would multi-
# trigger hit-stop on a multi-hit swing).
signal swing_connected(hit_count: int)
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
	_attack_live      = max(0.0, _attack_live      - delta)
	_dodge_cd         = max(0.0, _dodge_cd         - delta)
	_dodge_time       = max(0.0, _dodge_time       - delta)
	_iframes          = max(0.0, _iframes          - delta)
	_blast_cd         = max(0.0, _blast_cd         - delta)
	_parry_time       = max(0.0, _parry_time       - delta)
	_parry_cd         = max(0.0, _parry_cd         - delta)
	_dash_strike_cd   = max(0.0, _dash_strike_cd   - delta)
	_hurt_time        = max(0.0, _hurt_time        - delta)
	_lunge_time       = max(0.0, _lunge_time       - delta)
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
	# tick stamina drain/recover each frame). _start_parry arms it;
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

	if _dodge_time > 0.0:
		var t := 1.0 - (_dodge_time / DODGE_DURATION)
		var ease: float = pow(1.0 - t, 2.0)
		velocity = _dodge_dir * (DODGE_SPEED * ease + 60.0)
	elif _dash_strike_time > 0.0:
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
		velocity = input * speed
		# Iter 19 — forward lunge on swing. Linear-decay impulse in the
		# aim direction layered ON TOP of walk velocity. The player can
		# still steer mid-lunge via WASD; the lunge just commits the
		# initial swing direction. Pure-press LMB (no movement input)
		# produces a clean ~11 px forward dart.
		if _lunge_time > 0.0:
			var lunge_t: float = _lunge_time / LUNGE_TIME
			velocity += _lunge_dir * (LUNGE_SPEED * lunge_t)
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
	if _parry_time > 0.0:
		sprite.modulate = PARRY_TINT
	else:
		sprite.modulate = Color(1, 1, 1, 1)
		if _iframes > 0.0 and int(_iframes * 20) % 2 == 0:
			sprite.modulate.a = 0.45

	# ── Animation state — dying handled above. hurt > attack > walk > idle.
	# Each is suffixed with the current direction bucket.
	var is_moving := input.length() > 0.1
	var state_name: String
	if _hurt_time > 0.0:
		state_name = "hurt"
	elif _is_attacking or _dash_strike_time > 0.0:
		state_name = "attack"
	elif is_moving or _dodge_time > 0.0:
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
	if is_moving and _dodge_time <= 0.0 and _dash_strike_time <= 0.0 and not _is_attacking:
		_idle_time = 0.0
		_step_accumulator += velocity.length() * delta
		if _step_accumulator >= STEP_INTERVAL:
			_step_accumulator = 0.0
			Events.hero_stepped.emit(global_position)
		sprite.position.y = lerpf(sprite.position.y, SPRITE_BASE_Y, IDLE_BOB_LERP * delta)
	else:
		_idle_time += delta
		_step_accumulator = 0.0
		var bob := sin(_idle_time * TAU * IDLE_BOB_FREQ) * IDLE_BOB_AMP
		sprite.position.y = lerpf(sprite.position.y, SPRITE_BASE_Y + bob, IDLE_BOB_LERP * delta)

	# Iter 25 input precedence: dodge > parry > dash_strike > blast >
	# attack. The "shield" input action still binds to Q (no key remap
	# needed) — it now triggers a TAP parry (just_pressed) instead of
	# the previous held-stance. Dodge still wins so the player can
	# always bail to safety.
	if Input.is_action_just_pressed("dodge") and _dodge_cd <= 0.0 and _dodge_time <= 0.0:
		_start_dodge(input)
	elif Input.is_action_just_pressed("shield") and _parry_cd <= 0.0 and _parry_time <= 0.0 and _dodge_time <= 0.0:
		_start_parry()
	elif Input.is_action_just_pressed("dash_strike") and _can_start_dash_strike():
		_start_dash_strike()
	elif Input.is_action_pressed("blast") and _blast_cd <= 0.0 and _dodge_time <= 0.0 and _parry_time <= 0.0 and _dash_strike_time <= 0.0:
		_start_blast()
	elif Input.is_action_pressed("attack") and _attack_cd <= 0.0 and not _is_attacking and _dodge_time <= 0.0 and _parry_time <= 0.0 and _dash_strike_time <= 0.0:
		_start_attack()

# Facing picker. Returns the direction bucket the sprite should render
# THIS tick. Priority: dying = sticky · hurt = sticky · attacking/dashing
# point at the aim/dash vector · dodging points at the dodge vector ·
# walking points at movement · idle keeps last facing.
func _compute_facing(input: Vector2) -> int:
	if _is_attacking and _attack_aim.length() > 0.001:
		return _vector_to_dir_idx(_attack_aim)
	if _dash_strike_time > 0.0:
		return _vector_to_dir_idx(_dash_strike_dir)
	if _dodge_time > 0.0:
		return _vector_to_dir_idx(_dodge_dir)
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

func _start_dodge(input: Vector2) -> void:
	var dir := input
	if dir.length() < 0.1:
		# No input → dodge in current facing direction.
		dir = _dir_to_vector(_facing_dir)
	_dodge_dir = dir.normalized()
	_dodge_time = DODGE_DURATION
	_dodge_cd = DODGE_COOLDOWN * (1.0 + GameState.modifier_total_f("dodge_cooldown_mul", 0.0))
	# Iter 21 — sturdy_step relic extends the iframe window.
	var iframes_actual: float = DODGE_IFRAMES + GameState.modifier_total_f("dodge_iframes_bonus_f", 0.0)
	_iframes = max(_iframes, iframes_actual)
	# Iter 25 — starting a dodge cancels any in-flight parry so the
	# two defensive options don't double-up on iframes. The dodge owns
	# motion + iframes for its window; the parry would just sit idle
	# under it anyway.
	_parry_time = 0.0
	dodge_started.emit()
	Events.hero_dodged.emit(global_position)
	# Iter 40 — SHADOW ascendance (4+ SHADOW relics owned). Every dodge
	# releases a 60-px shockwave at the hero's position dealing 1 damage
	# to all enemies inside. Pairs with iframes naturally — you're
	# untouchable AND launching a small AoE around yourself. Stacks
	# with the existing iframe-bonus + cd-mul SHADOW resonance benefits.
	if GameState.theme_tier("shadow") >= 2:
		_trigger_shadow_shockwave()
	# Iter 62 — SHADOW resonance dodge trail. Tier >= 1 (2+ SHADOW
	# relics owned) emits a fading indigo particle trail behind the
	# hero on every dodge. Reuses the existing dash_trail.tscn (which
	# the dash-strike ability uses) with a color modulate that
	# overrides the magenta-cyan ramp into the SHADOW palette. Reads
	# as "you stepped between heartbeats" — the missing visual axis
	# for the SHADOW theme's mobility role.
	if GameState.theme_tier("shadow") >= 1:
		_spawn_shadow_dodge_trail()

# Inverse of _vector_to_dir_idx — used for "what direction is the hero
# facing when no input vector is available" (e.g. dodge with no WASD).
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
	# Arm the forward lunge. Direction = aim, decays linearly across
	# LUNGE_TIME inside _physics_process.
	_lunge_dir = _attack_aim
	_lunge_time = LUNGE_TIME
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
	# Track which enemies were already hit this swing so the chain
	# can't loop back to the original target.
	var hit_set: Dictionary = {}
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(enemy):
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
				dmg_for_this = int(round(float(dmg_for_this) * CRIT_DAMAGE_MUL))
			enemy.take_hit(dmg_for_this, is_crit)
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
		if enemy.has_method("apply_knockback"):
			var push_dir: Vector2 = to_enemy.normalized() if to_enemy.length() > 0.01 else _pending_melee_aim
			enemy.apply_knockback(push_dir, MELEE_KNOCKBACK_FORCE * knockback_mul, MELEE_KNOCKBACK_TIME)
	if hit_count > 0:
		swing_connected.emit(hit_count)
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
			dmg_chain = int(round(float(dmg_chain) * CRIT_DAMAGE_MUL))
		best.take_hit(dmg_chain, is_crit_chain)
		hit_set[best.get_instance_id()] = true
		_bump_combo()   # iter 54 — chain bolts count toward combo

func _start_blast() -> void:
	var aim_world := get_global_mouse_position() - global_position
	if aim_world.length() < 1.0:
		aim_world = _dir_to_vector(_facing_dir)
	var aim := aim_world.normalized()
	# Iter 17 — swift_focus reduces blast cooldown.
	_blast_cd = BLAST_COOLDOWN * (1.0 + GameState.modifier_total_f("blast_cooldown_mul", 0.0))
	_facing_dir = _vector_to_dir_idx(aim)
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
	# Emit at chest height so the muzzle streak originates from the
	# mage's hands, not under her feet.
	Events.hero_blasted.emit(global_position + Vector2(0, VFX_HEIGHT_OFFSET), aim)

# Iter 42 — extracted single-projectile spawn. Carries all the modifier
# reads that iter-41 left inline in _start_blast. Multi-shot calls this
# N times with different spread aims.
func _spawn_blast_projectile(spawn_pos: Vector2, aim_dir: Vector2, resonance_active: bool) -> void:
	var p: Projectile = PROJECTILE_SCENE.instantiate()
	p.global_position = spawn_pos
	var proj_speed: float = Projectile.SPEED * (1.0 + GameState.modifier_total_f("projectile_speed_mul", 0.0))
	p.velocity = aim_dir * proj_speed
	var dmg: int = 1 + GameState.modifier_total("blast_damage_bonus", 0)
	if resonance_active:
		dmg *= 2
		p.orb_tint = Color(0.7, 1.0, 1.0, 1.0)
	# Iter 42 — crit roll. Per-projectile so a multi-shot can have some
	# projectiles crit and others not (reads as "lucky spray" rather than
	# "all-or-nothing"). Roll happens at spawn, baked into damage so
	# downstream procs (executioner) compound off the crit'd damage too.
	var is_crit: bool = _roll_crit()
	if is_crit:
		dmg = int(round(float(dmg) * CRIT_DAMAGE_MUL))
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

func take_damage(amount: int) -> void:
	if hp <= 0:
		return
	# Iter 25 — parry catch. Checked BEFORE the iframes early-return so
	# a successful parry CONSUMES the incoming hit (vs the normal-iframe
	# path which just silently ignores it). _on_parry_hit clears the
	# window, sets iframes, spawns the bigger VFX, and triggers slow-mo.
	if _parry_time > 0.0:
		_on_parry_hit()
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
	var actual: int = maxi(0, amount - GameState.modifier_total("damage_taken_reduction", 0))
	if actual <= 0:
		return
	hp -= actual
	# Iter 17 — second_wind: the killing blow leaves you at 1 HP instead
	# of dying, once per run. Triggers ONLY when HP would otherwise hit
	# 0 or lower, so a partial hit can't burn the proc. _second_wind_used
	# resets at scene reload (fresh hero instance per run).
	# Iter 21 — phoenix_feather PREEMPTS second_wind. If the player owns
	# both and is dying for the first time, phoenix wins (more dramatic
	# beat + full heal). second_wind handles the SECOND lethal blow if
	# phoenix already fired. Different flag per relic so they don't
	# share state — a run with both gets two saves total.
	if hp <= 0 and GameState.has_relic("phoenix_feather") and not _phoenix_feather_used:
		_phoenix_feather_used = true
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
		# Brief invuln so the trigger doesn't immediately die to the
		# next tick of contact damage from the same enemy.
		_iframes = HIT_IFRAMES * 2.0
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
	# Iter 54 — combo reset on damage. Resets ONLY if damage actually
	# landed (not absorbed by iron_resolve / parry — those return
	# earlier in take_damage). Reaching here means damage was dealt.
	_reset_combo()
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
	_kill_counter += 1
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
func _spawn_shadow_dodge_trail() -> void:
	var trail: Node2D = DASH_TRAIL_SCENE.instantiate() as Node2D
	if trail == null:
		return
	trail.global_position = global_position + Vector2(0, VFX_HEIGHT_OFFSET)
	if trail.has_method("setup"):
		trail.call("setup", _dodge_dir)
	# Indigo modulate — overrides the magenta-cyan ramp into the
	# SHADOW palette. modulate is multiplicative so the inner ramp's
	# bright colors get tinted, not replaced — which keeps the trail
	# looking like particles, not a solid block.
	trail.modulate = Color(0.65, 0.55, 1.0, 1.0)
	# get_parent() rather than get_tree().current_scene so the spawn
	# works in both production and test instantiate contexts (the
	# current_scene path silently fails in test, as iter-61 caught).
	var host: Node = get_parent()
	if host != null:
		host.add_child(trail)

func _trigger_shadow_shockwave() -> void:
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(enemy):
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

# Iter 25 — parry trigger. Tap Q opens the catch window for PARRY_WINDOW
# seconds. Hits during that window are routed through _on_parry_hit
# (which negates damage + spawns the parry VFX + does brief slow-mo).
# Cooldown is set NOW (window + cd) so a player can't re-tap to extend
# coverage past the natural window.
func _start_parry() -> void:
	_parry_time = PARRY_WINDOW
	_parry_cd = PARRY_WINDOW + PARRY_COOLDOWN
	# Resolve aim from cursor — the parry shield orients toward the
	# threat the player is facing, not the hero's current movement
	# direction. Fallback to facing-direction if the cursor is right
	# on top of the hero.
	var aim_world: Vector2 = get_global_mouse_position() - global_position
	if aim_world.length() < 1.0:
		aim_world = _dir_to_vector(_facing_dir)
	var aim: Vector2 = aim_world.normalized()
	# Iter 63 — store parry aim so VOW ascendance's reflect-fan in
	# _on_parry_hit knows which direction to fire the projectile burst
	# (parry catch happens AFTER _start_parry, so _parry_aim is set
	# by the time the reflect would fire).
	_parry_aim = aim
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
		_parry_shield_ref = shield
	# Activation flourish — small expanding ring at hero chest. Doubles
	# as the "hit caught" effect at 1.6× scale via _on_parry_hit.
	var pulse: Node2D = PARRY_PULSE_SCENE.instantiate() as Node2D
	if pulse != null and scene_root != null:
		pulse.global_position = global_position + Vector2(0, VFX_HEIGHT_OFFSET)
		scene_root.add_child(pulse)
	# Reuse the dodge sound — both are short defensive flourishes. A
	# dedicated parry chime can land in a later audio pass.
	Events.hero_dodged.emit(global_position)

# Called from take_damage when the parry window catches an incoming
# hit. Negates damage, fires a bigger pulse VFX, triggers brief
# slow-mo, and ends the parry window early so the cooldown starts
# counting from the moment of the catch (not the original window end).
func _on_parry_hit() -> void:
	# End the window early — the parry just resolved.
	_parry_time = 0.0
	# Long-ish iframes so the same enemy can't immediately re-bump.
	_iframes = max(_iframes, PARRY_HIT_IFRAMES)
	# Brief slow-mo punctuation. Tween-driven so it eases cleanly.
	Engine.time_scale = PARRY_HIT_SLOWMO_SCALE
	var tw: Tween = create_tween()
	tw.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	tw.tween_interval(PARRY_HIT_SLOWMO_TIME)
	tw.tween_property(Engine, "time_scale", 1.0, 0.18)
	# Iter 29 — shatter the active parry shield. shatter() scales it
	# to 1.6× while fading alpha to 0 over 0.18s, then queue_frees.
	# Sells "the shield deflected the hit and dispersed its energy."
	if _parry_shield_ref != null and is_instance_valid(_parry_shield_ref):
		if _parry_shield_ref.has_method("shatter"):
			_parry_shield_ref.shatter()
		_parry_shield_ref = null
	# Larger ring pulse on the actual catch — distinguishes "I parried"
	# from "I just tapped Q." Scale up the existing pulse by overlaying
	# a second instance at the catch site.
	var burst: Node2D = PARRY_PULSE_SCENE.instantiate() as Node2D
	if burst != null:
		burst.global_position = global_position + Vector2(0, VFX_HEIGHT_OFFSET)
		burst.scale = Vector2(1.6, 1.6)
		var scene_root: Node = get_tree().current_scene
		if scene_root != null:
			scene_root.add_child(burst)
	# Re-fire the dodge sfx as the catch confirm. Two stacked plays
	# read distinctly from a single tap.
	Events.hero_dodged.emit(global_position)
	# Amber floater so the player learns the relic-like beat triggered.
	var parent: Node = get_parent()
	if parent != null:
		var n: DamageNumber = DamageNumber.spawn(
			global_position + Vector2(0, -64),
			"PARRY",
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
		_spawn_parry_reflect_fan()

# Iter 63 — parry reflect fan. 5 small projectiles in a 90° cone
# centered on the parry's stored aim direction (_parry_aim is set
# in _start_parry). Each projectile is a fresh instance of the
# regular Projectile scene with ivory tint + low damage so the
# burst reads as "spirit retaliation" not "spell cast."
const PARRY_REFLECT_COUNT: int = 5
const PARRY_REFLECT_CONE: float = PI * 0.5   # 90° total spread
const PARRY_REFLECT_DAMAGE: int = 1
const PARRY_REFLECT_SPEED: float = 380.0
var _parry_aim: Vector2 = Vector2.RIGHT   # set in _start_parry

func _spawn_parry_reflect_fan() -> void:
	var aim: Vector2 = _parry_aim if _parry_aim.length_squared() > 0.001 else Vector2.RIGHT
	# 5 projectiles spread across 90°. Outer ones get +/- 45°.
	var step: float = PARRY_REFLECT_CONE / float(PARRY_REFLECT_COUNT - 1)
	var base_angle: float = aim.angle() - PARRY_REFLECT_CONE * 0.5
	var host: Node = get_parent()
	if host == null:
		return
	for i in range(PARRY_REFLECT_COUNT):
		var a: float = base_angle + step * float(i)
		var dir: Vector2 = Vector2(cos(a), sin(a))
		var p: Projectile = PROJECTILE_SCENE.instantiate()
		p.global_position = global_position + Vector2(0, VFX_HEIGHT_OFFSET) + dir * 22.0
		p.velocity = dir * PARRY_REFLECT_SPEED
		p.damage = PARRY_REFLECT_DAMAGE
		p.target_group = "enemies"
		# Ivory tint matching the VOW theme palette (iter-39 chip color).
		p.orb_tint = Color(0.92, 0.92, 0.78, 1.0)
		host.add_child(p)

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
				dmg_dp = int(round(float(dmg_dp) * CRIT_DAMAGE_MUL))
			enemy.take_hit(dmg_dp, is_crit_dp)
			_dash_hit_set[id] = true
			_bump_combo()   # iter 54 — dash pierce hits count toward combo
		if enemy.has_method("apply_knockback"):
			# Push enemies ALONG the dash direction so the player
			# clears a corridor instead of leaving stunned enemies
			# behind them.
			enemy.apply_knockback(_dash_strike_dir, MELEE_KNOCKBACK_FORCE * knockback_mul, MELEE_KNOCKBACK_TIME)

func _can_start_dash_strike() -> bool:
	return _dash_strike_cd <= 0.0 \
		and _dash_strike_time <= 0.0 \
		and _dodge_time <= 0.0 \
		and _parry_time <= 0.0

func _start_dash_strike() -> void:
	var aim_world := get_global_mouse_position() - global_position
	if aim_world.length() < 1.0:
		aim_world = _dir_to_vector(_facing_dir)
	_dash_strike_dir = aim_world.normalized()
	_dash_strike_time = DASH_STRIKE_DURATION
	_dash_strike_cd = DASH_STRIKE_COOLDOWN
	# Iter 64 — capture the dash's origin so _resolve_dash_strike_hit
	# can stamp FLAME fire-trail pools evenly between start and end.
	_dash_strike_start_pos = global_position
	# Iter 25 — iframes cover the full dash + POST_IFRAMES seconds AFTER
	# so a player landing next to a swinging enemy has a window to
	# reposition. Previously iframes ended exactly at dash end, leaving
	# the hero vulnerable on the worst possible frame.
	_iframes = max(_iframes, DASH_STRIKE_DURATION + DASH_STRIKE_POST_IFRAMES)
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
	var knockback_mul: float = 1.0 + GameState.modifier_total_f("knockback_force_mul", 0.0)
	var has_execute: bool = GameState.has_relic("executioner")
	var hit_count: int = 0
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(enemy):
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
				dmg_for_this = int(round(float(dmg_for_this) * CRIT_DAMAGE_MUL))
			enemy.take_hit(dmg_for_this, is_crit_ds)
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
