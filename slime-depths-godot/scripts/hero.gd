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
const PROJECTILE_SCENE   = preload("res://scenes/projectile.tscn")
const DASH_TRAIL_SCENE   = preload("res://scenes/fx/dash_trail.tscn")
const BLAST_MUZZLE_SCENE = preload("res://scenes/fx/blast_muzzle.tscn")

# Shield (Iter 5) — Q-held stamina stance.
const SHIELD_STAMINA_MAX := 100.0
const SHIELD_DRAIN       := 60.0      # per second while held
const SHIELD_RECOVER     := 25.0      # per second while released
const SHIELD_BREAK_CD    := 0.5
const SHIELD_TINT        := Color(0.7, 0.85, 1, 1)

# Dash Strike (Iter 5) — Shift burst toward the cursor.
const DASH_STRIKE_SPEED    := 600.0
const DASH_STRIKE_DURATION := 0.18
const DASH_STRIKE_COOLDOWN := 1.2
const DASH_STRIKE_RADIUS   := 50.0

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

var _shield_stamina := SHIELD_STAMINA_MAX
var _shield_active := false
var _shield_break_cd := 0.0

var _dash_strike_cd := 0.0
var _dash_strike_time := 0.0
var _dash_strike_dir := Vector2.RIGHT

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

# Iter 11 — feel state.
var _camera: Camera2D = null
var _camera_offset := Vector2.ZERO
var _idle_time := 0.0
var _step_accumulator := 0.0
var _last_anim: StringName = &""

signal hp_changed(new_hp: int)
signal hero_died
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
	_shield_break_cd  = max(0.0, _shield_break_cd  - delta)
	_dash_strike_cd   = max(0.0, _dash_strike_cd   - delta)
	_hurt_time        = max(0.0, _hurt_time        - delta)
	_lunge_time       = max(0.0, _lunge_time       - delta)
	if _attack_live <= 0.0:
		_is_attacking = false
	# Iter 19 — windowed melee damage. _start_attack arms the pending
	# strike + cached aim/range; when the windup timer expires here,
	# we run the actual hit scan. Keeps damage timing aligned with the
	# slash-arc growth animation (visible swing → solid hit).
	if _pending_melee_strike:
		_melee_strike_timer = max(0.0, _melee_strike_timer - delta)
		if _melee_strike_timer <= 0.0:
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

	_update_shield(delta)

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
		velocity = _dash_strike_dir * DASH_STRIKE_SPEED
	else:
		var speed: float = SPEED * (1.0 + GameState.modifier_total_f("move_speed_mul", 0.0))
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

	# Modulate: shield tint takes the RGB channel (blue stance), then
	# iframes flicker the alpha on top. Skip alpha flicker during shield
	# so the blue stance reads as a steady tint instead of pulsing.
	sprite.modulate = SHIELD_TINT if _shield_active else Color(1, 1, 1, 1)
	if not _shield_active and _iframes > 0.0 and int(_iframes * 20) % 2 == 0:
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

	# Input precedence: dodge > shield (handled above) > dash_strike >
	# blast > attack. Dodge always wins so the player can bail out.
	if Input.is_action_just_pressed("dodge") and _dodge_cd <= 0.0 and _dodge_time <= 0.0:
		_start_dodge(input)
	elif Input.is_action_just_pressed("dash_strike") and _can_start_dash_strike():
		_start_dash_strike()
	elif Input.is_action_pressed("blast") and _blast_cd <= 0.0 and _dodge_time <= 0.0 and not _shield_active and _dash_strike_time <= 0.0:
		_start_blast()
	elif Input.is_action_pressed("attack") and _attack_cd <= 0.0 and not _is_attacking and _dodge_time <= 0.0 and not _shield_active and _dash_strike_time <= 0.0:
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
	_iframes = max(_iframes, DODGE_IFRAMES)
	_shield_active = false
	dodge_started.emit()
	Events.hero_dodged.emit(global_position)

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

# Damage scan deferred from _start_attack by MELEE_WINDUP. Hit pizza-
# slice in front of the hero: any enemy within _pending_melee_range
# and within ATTACK_ARC half-angle of _pending_melee_aim takes damage,
# knockback, and counts toward swing_connected.
func _resolve_melee_strike() -> void:
	var damage: int = 1 + GameState.modifier_total("sword_damage_bonus", 0)
	var hit_count: int = 0
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(enemy):
			continue
		var to_enemy: Vector2 = enemy.global_position - global_position
		if to_enemy.length() > _pending_melee_range:
			continue
		if abs(to_enemy.angle_to(_pending_melee_aim)) > ATTACK_ARC:
			continue
		if enemy.has_method("take_hit"):
			enemy.take_hit(damage)
			hit_count += 1
		if enemy.has_method("apply_knockback"):
			var push_dir: Vector2 = to_enemy.normalized() if to_enemy.length() > 0.01 else _pending_melee_aim
			enemy.apply_knockback(push_dir, MELEE_KNOCKBACK_FORCE, MELEE_KNOCKBACK_TIME)
	if hit_count > 0:
		swing_connected.emit(hit_count)

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
	var p: Projectile = PROJECTILE_SCENE.instantiate()
	var spawn_pos: Vector2 = global_position + Vector2(0, -22) + aim * 18.0
	p.global_position = spawn_pos
	p.velocity = aim * Projectile.SPEED
	# Iter 19 — muzzle flash at the spawn point. Bright magenta burst
	# that fades over 0.18s. Sells "projectile was LAUNCHED" instead
	# of "projectile appeared." Parented to current_scene so it lives
	# in world space (not on the hero, which would drag the flash
	# along as the hero moves).
	var muzzle: Node2D = BLAST_MUZZLE_SCENE.instantiate() as Node2D
	if muzzle != null:
		muzzle.global_position = spawn_pos
		get_tree().current_scene.add_child(muzzle)
	var dmg: int = 1 + GameState.modifier_total("blast_damage_bonus", 0)
	# Iter 17 — arcane_resonance: every 4th blast deals double damage.
	# Counter is post-incremented so the 4th cast (counter == 4 after
	# increment) is the lucky one. Resets implicitly on run start since
	# the hero is re-instantiated for each new scene load.
	_blast_counter += 1
	if GameState.has_relic("arcane_resonance") and _blast_counter % 4 == 0:
		dmg *= 2
		# Visual cue — tint the projectile cyan-white so the player
		# learns "the bright one hits harder."
		p.orb_tint = Color(0.7, 1.0, 1.0, 1.0)
	p.damage = dmg
	get_parent().add_child(p)
	# Emit at chest height so the muzzle streak originates from the
	# mage's hands, not under her feet.
	Events.hero_blasted.emit(global_position + Vector2(0, VFX_HEIGHT_OFFSET), aim)

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
	if hp <= 0 or _iframes > 0.0:
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
	if hp <= 0 and GameState.has_relic("second_wind") and not _second_wind_used:
		_second_wind_used = true
		hp = 1
		# Brief invuln so the trigger doesn't immediately die to the
		# next tick of contact damage from the same enemy.
		_iframes = HIT_IFRAMES * 2.0
		# Floating amber number marks the save so the player learns
		# the relic worked rather than wondering why they survived.
		var n: DamageNumber = DamageNumber.spawn(
			global_position + Vector2(0, -64),
			"SECOND WIND",
			Color(1, 0.8, 0.45),
		)
		get_parent().add_child(n)
	_iframes = max(_iframes, HIT_IFRAMES)
	hp_changed.emit(hp)
	hit_received.emit()
	Events.hero_damaged.emit(global_position)
	if hp <= 0:
		_is_dying = true
		_hurt_time = 0.0
		# Force restart so we see frame 0 of the death anim.
		sprite.frame = 0
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
	if not GameState.has_relic("bloodstone"):
		return
	if _kill_counter % 3 != 0:
		return
	# Skip if already capped — no point spawning a +1 floater that lies.
	var cap: int = MAX_HP + GameState.modifier_total("max_hp_bonus", 0)
	if hp >= cap or _is_dying:
		return
	heal(1)
	# Crimson floater — matches the relic's blood theme, distinguishes
	# from the green +1 room-clear heal so the player learns the source.
	var n: DamageNumber = DamageNumber.spawn(
		global_position + Vector2(0, -56),
		"+1",
		Color(1.0, 0.35, 0.4),
	)
	get_parent().add_child(n)
	# Position param is unused here but kept on the signal signature for
	# future "heal at the kill point" variants like vampiric_aura.
	var _unused := world_pos

func _update_shield(delta: float) -> void:
	var holding := Input.is_action_pressed("shield")
	var can_hold := holding and _shield_stamina > 0.0 and _shield_break_cd <= 0.0 and _dodge_time <= 0.0
	if can_hold:
		_shield_active = true
		_shield_stamina = max(0.0, _shield_stamina - SHIELD_DRAIN * delta)
		_iframes = max(_iframes, delta * 2.0)
		if _shield_stamina <= 0.0:
			_shield_active = false
			_shield_break_cd = SHIELD_BREAK_CD
	else:
		_shield_active = false
		_shield_stamina = min(SHIELD_STAMINA_MAX, _shield_stamina + SHIELD_RECOVER * delta)

func _can_start_dash_strike() -> bool:
	return _dash_strike_cd <= 0.0 \
		and _dash_strike_time <= 0.0 \
		and _dodge_time <= 0.0 \
		and not _shield_active

func _start_dash_strike() -> void:
	var aim_world := get_global_mouse_position() - global_position
	if aim_world.length() < 1.0:
		aim_world = _dir_to_vector(_facing_dir)
	_dash_strike_dir = aim_world.normalized()
	_dash_strike_time = DASH_STRIKE_DURATION
	_dash_strike_cd = DASH_STRIKE_COOLDOWN
	_iframes = max(_iframes, DASH_STRIKE_DURATION)
	_facing_dir = _vector_to_dir_idx(_dash_strike_dir)
	# Iter 13 — spawn a motion trail behind us. Parent to current_scene
	# so it lives in world space (not at the hero's transform, which
	# would drag the trail along with us). dash_trail.gd handles its own
	# lifetime + emission curve.
	var trail: Node2D = DASH_TRAIL_SCENE.instantiate() as Node2D
	if trail != null:
		trail.global_position = global_position + Vector2(0, VFX_HEIGHT_OFFSET)
		if trail.has_method("setup"):
			trail.call("setup", _dash_strike_dir)
		get_tree().current_scene.add_child(trail)

func _resolve_dash_strike_hit() -> void:
	var damage: int = 1 + GameState.modifier_total("sword_damage_bonus", 0)
	var hit_count: int = 0
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(enemy):
			continue
		var to_enemy: Vector2 = enemy.global_position - global_position
		if to_enemy.length() > DASH_STRIKE_RADIUS:
			continue
		if enemy.has_method("take_hit"):
			enemy.take_hit(damage)
			hit_count += 1
		# Iter 13 — heavy radial knockback on dash AoE. Each enemy gets
		# pushed straight away from the hero, harder + longer than the
		# normal melee knockback because the dash is a committed engage.
		if enemy.has_method("apply_knockback"):
			var push_dir: Vector2 = to_enemy.normalized() if to_enemy.length() > 0.01 else _dash_strike_dir
			enemy.apply_knockback(push_dir, DASH_KNOCKBACK_FORCE, DASH_KNOCKBACK_TIME)
	# Always emit even on whiff — the impact VFX still wants to fire so
	# the player gets visual feedback that the dash committed.
	dash_strike_landed.emit(global_position + Vector2(0, VFX_HEIGHT_OFFSET), hit_count)

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
