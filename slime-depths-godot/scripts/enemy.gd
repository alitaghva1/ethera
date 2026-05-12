# Enemy — iter 14 rewrite. ONE enemy script + ONE enemy scene for the
# whole roster. Per-type data (sheets, frame counts, stats, behavior)
# lives in EnemyType resource .tres files under scenes/enemies/.
#
# Why this rewrite: pre-iter-14 each enemy had its own .tscn (with ~30
# hand-declared AtlasTexture sub-resources for its anims) plus its own
# .gd subclass extending Enemy. Adding a 5th enemy was a multi-file
# undertaking. With the new shape, "new enemy" = "new .tres file" —
# everything else is shared.
#
# Lifecycle:
#   1. main.gd instantiates scenes/enemy.tscn, sets enemy_type = the
#      relevant .tres, then add_child's it.
#   2. _ready() reads enemy_type, builds SpriteFrames from the sheets
#      programmatically, sets stats, plays idle.
#   3. _physics_process dispatches to one of four behavior ticks based
#      on enemy_type.behavior.
#   4. take_hit / knockback / death (inherited from this single script)
#      work the same regardless of type.
#
# Behaviors:
#   chase_contact      walk straight at hero, body-bump on touch
#   telegraphed_melee  approach → stop + windup tint → swing in cone
#   shoot              kite to prefer_dist → cast projectile cycle
#   stationary_shoot   never move; cast projectile when hero in range
#
# All four use the same death + knockback + take_hit machinery — the
# behavior switch only affects per-tick AI.
class_name Enemy
extends CharacterBody2D

const PROJECTILE_SCENE = preload("res://scenes/projectile.tscn")
# Iter 27 — shared ground-shadow texture. Same asset hero uses; sized
# per-instance below by collision_radius so a slime gets a small
# shadow and the iron_revenant gets a big one. Drawn under the sprite
# so the enemy reads as standing ON the floor rather than floating.
const SHADOW_TEXTURE: Texture2D = preload("res://assets/decor/shadow_ellipse.png")

# Iter 15 — spawn-in window. Newly-spawned enemies fade from a bright
# red translucent ghost to full opacity over SPAWN_IN_DURATION seconds.
# During this window: no AI, no take_hit, velocity locked to zero. This
# gives the player a clear visual telegraph that "an enemy is materializing
# HERE" instead of the iter-14 behavior where enemies popped into existence
# at full opacity and immediately started chasing.
const SPAWN_IN_DURATION := 0.5
const SPAWN_IN_START_COLOR := Color(1.8, 0.3, 0.3, 0.3)   # bright red, low alpha
const SPAWN_IN_END_COLOR   := Color(1.0, 1.0, 1.0, 1.0)   # normal

# Set by the spawner (main.gd) BEFORE add_child. If null at _ready time
# we push_warning and the enemy degenerates to a passive lump — that's
# noisy enough that misconfigured spawns are visible immediately.
@export var enemy_type: EnemyType = null

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D
@onready var collision: CollisionShape2D = $CollisionShape2D

# ── Universal state ───────────────────────────────────────────────────
var hp: int = 1
var _dying := false
var _death_timer := 0.0
var _hero: Node2D = null

# Iter 13 knockback — linear-decay velocity push that suspends AI for
# its window. apply_knockback() arms; _physics_process consumes.
var _knockback_time := 0.0
var _knockback_total := 0.0
var _knockback_velocity := Vector2.ZERO

# Iter 15 — spawn-in countdown. Set on _ready; ticks down each physics
# frame. While > 0, AI is suspended, take_hit returns early, and the
# sprite modulates from SPAWN_IN_START_COLOR to SPAWN_IN_END_COLOR.
var _spawn_in_time := SPAWN_IN_DURATION

# ── Per-behavior state ────────────────────────────────────────────────
# chase_contact
var _contact_cd := 0.0
# telegraphed_melee state machine
enum MeleeState { IDLE, WINDUP, SWING, COOLDOWN }
var _melee_state: MeleeState = MeleeState.IDLE
var _melee_timer := 0.0
var _melee_aim := Vector2.RIGHT
# shoot / stationary_shoot state machine. Iter 16: dropped the
# vestigial COOLDOWN value — the original code transitioned to it
# briefly then bounced straight back to IDLE on the next tick, doing
# nothing. The cooldown timer drains in IDLE's else-branch instead.
enum CastState { IDLE, WINDUP }
var _cast_state: CastState = CastState.IDLE
var _cast_timer := 0.0
var _cast_aim := Vector2.RIGHT

signal died_at(world_pos: Vector2)
# Iter 37 — boss phase machine. Emitted by take_hit the first time hp
# drops below enemy_type.phase2_hp_threshold * max_hp. main.gd connects
# this on boss spawn to fire the "ENRAGED" banner + camera punch.
# Non-boss enemies CAN also use phase 2 if their enemy_type has
# phase2_overrides set, but typically only bosses author it.
signal phase_changed(phase: int)

# Iter 37 — current phase. Starts at 1; transitions to 2 the first time
# HP crosses the phase2 threshold (default 50%). Used to gate the
# transition to once-per-enemy (re-crossing the threshold from healing
# can't retrigger).
var _phase: int = 1

# Iter 43 — burn status. Set by hero.gd when a FLAME-themed proc (e.g.
# Embers of Ruin relic) rolls successfully. Each tick deals 1 damage
# every _burn_tick_interval; total burn life = _burn_remaining. Burn
# DOES NOT count as a "hit" for is_crit visuals — the burn tick is a
# discreet orange floater, not a crit highlight. Burn damage CAN kill
# (calls _die normally) so a chain of burns can finish off low-HP mobs.
const BURN_TICK_INTERVAL: float = 0.4
const BURN_DAMAGE_PER_TICK: int = 1
var _burn_remaining: float = 0.0
var _burn_tick_timer: float = 0.0
# Cached for restoring the sprite tint when burn fades.
var _burn_active: bool = false

func apply_burn(duration: float) -> void:
	# Refresh: a fresh burn application either extends the existing
	# burn OR resets to `duration` (whichever is longer). Avoids
	# back-to-back applications producing shorter total burn than a
	# single big proc.
	if _dying:
		return
	# Iter 53 — emit audio cue only on the FIRST tick of a fresh burn
	# (was_burning false → true). Refresh applications during an
	# already-active burn don't re-trigger the sound to avoid drone.
	var was_burning: bool = _burn_active
	_burn_remaining = max(_burn_remaining, duration)
	_burn_tick_timer = 0.0   # first tick fires within ~one frame
	_burn_active = true
	if not was_burning:
		Events.enemy_burned.emit(global_position)

# Iter 46 — slow status. Multiplies the enemy's effective move_speed by
# _slow_multiplier (defaults 1.0 = no slow). Tick down _slow_remaining
# each physics frame; when it hits 0, reset multiplier to 1.0.
# Stronger slows OVERRIDE weaker ones (min comparison) so a Glacial
# Resonance proc lands a 0.40 multiplier on top of a Frost Pulse's 0.60
# rather than the weaker effect winning. Sprite gets a blue tint while
# slowed so the player reads the status at a glance.
const SLOW_DEFAULT_MULTIPLIER: float = 0.55   # 45% slow
var _slow_remaining: float = 0.0
var _slow_multiplier: float = 1.0

func apply_slow(duration: float, multiplier: float = SLOW_DEFAULT_MULTIPLIER) -> void:
	if _dying:
		return
	# Iter 53 — emit audio cue only on the FIRST application of a slow
	# (previously unslowed → slowed). Refresh applications during an
	# active slow don't re-trigger.
	var was_slowed: bool = _slow_remaining > 0.0
	_slow_remaining = max(_slow_remaining, duration)
	# Stronger slow wins (lower multiplier = more slowed).
	_slow_multiplier = min(_slow_multiplier, multiplier)
	if not was_slowed:
		Events.enemy_slowed.emit(global_position)

# Iter 46 — slow-aware speed read. Used by all behavior ticks instead
# of direct enemy_type.move_speed accesses so slow applies uniformly
# across chase / approach / kite / shoot behaviors.
func _effective_move_speed() -> float:
	if enemy_type == null:
		return 0.0
	return enemy_type.move_speed * _slow_multiplier

func _ready() -> void:
	add_to_group("enemies")
	if enemy_type == null:
		push_warning("Enemy spawned with no enemy_type set — will sit inert.")
		return
	_build_sprite_frames()
	_apply_type_to_sprite_and_collision()
	hp = enemy_type.max_hp
	# Cache hero reference. Group is set by hero.gd's _ready.
	var heroes: Array = get_tree().get_nodes_in_group("hero")
	if heroes.size() > 0:
		_hero = heroes[0]
	sprite.play(&"idle")
	# Iter 20 — shoot-behavior enemies start with a cooldown already
	# running, so they can't fire on the FIRST tick after spawn-in. Pre-
	# fix, a bonecap (stationary turret) would instant-cast the moment
	# the player walked into range with zero windup, since _cast_timer
	# defaulted to 0.0. The full cast_cooldown is too long for a fair
	# warmup; use half (matches the player's average reaction window).
	if enemy_type.behavior == "shoot" or enemy_type.behavior == "stationary_shoot":
		_cast_timer = enemy_type.cast_cooldown * 0.5

# Build SpriteFrames from per-state sheets. Each state becomes one
# animation; frames are AtlasTextures pointing into the sheet at
# (idx * cell_size, 0). Same trick as hero.gd's _build_sprite_frames
# but driven by an EnemyType resource instead of an inline table.
func _build_sprite_frames() -> void:
	var t: EnemyType = enemy_type
	var sf: SpriteFrames = SpriteFrames.new()
	if sf.has_animation("default"):
		sf.remove_animation("default")
	# Use a small inline table so we don't repeat the slice loop four times.
	# Each row: (anim_name, sheet, frame_count, fps, loop).
	var rows: Array = [
		[&"idle",   t.idle_sheet,   t.frames_idle,   t.fps_idle,   true],
		[&"walk",   t.walk_sheet,   t.frames_walk,   t.fps_walk,   true],
		[&"attack", t.attack_sheet, t.frames_attack, t.fps_attack, false],
		[&"death",  t.death_sheet,  t.frames_death,  t.fps_death,  false],
	]
	for row in rows:
		var anim_name: StringName = row[0]
		var sheet: Texture2D = row[1]
		var n_frames: int = row[2]
		var fps: float = row[3]
		var loop: bool = row[4]
		# attack_sheet may be null for chase_contact types. Skip cleanly —
		# they never request the "attack" anim so the missing slot is fine.
		if sheet == null or n_frames <= 0:
			continue
		sf.add_animation(anim_name)
		sf.set_animation_speed(anim_name, fps)
		sf.set_animation_loop(anim_name, loop)
		for fr in n_frames:
			var atlas: AtlasTexture = AtlasTexture.new()
			atlas.atlas = sheet
			atlas.region = Rect2(fr * t.cell_size, 0, t.cell_size, t.cell_size)
			sf.add_frame(anim_name, atlas)
	sprite.sprite_frames = sf

# Apply per-type sprite + collision tweaks. Kept tiny — the enemy.tscn
# carries reasonable defaults (scale, offset, collision shape) and we
# just overwrite them with the type's values.
func _apply_type_to_sprite_and_collision() -> void:
	var t: EnemyType = enemy_type
	sprite.scale = Vector2(t.sprite_scale, t.sprite_scale)
	sprite.position.y = t.sprite_y_offset
	# Collision shape — fresh CircleShape2D every spawn so we don't share
	# a shape resource across all instances of one type (Godot would
	# complain about resource mutation if we changed it later anyway).
	var shape: CircleShape2D = CircleShape2D.new()
	shape.radius = t.collision_radius
	collision.shape = shape
	# Iter 27 — drop shadow. Same beat the hero has had since iter 11;
	# without it enemies float "above" the floor and feel pasted-on.
	# Built in code so we don't have to add the node to enemy.tscn (which
	# would force a fixed scale across all enemy types). The ellipse
	# texture is 256×128 — at scale_x = collision_radius / 160 the shadow
	# reads as a soft pool roughly 2× the hitbox wide. Scale_y is 60%
	# of x so the ellipse stays squashed (top-down perspective trick the
	# hero shadow uses). Drawn BEFORE the AnimatedSprite2D in scene-tree
	# order so it renders underneath at the same z_index.
	var shadow: Sprite2D = Sprite2D.new()
	shadow.texture = SHADOW_TEXTURE
	# Anchor a few px below the collision center so it sits at the feet,
	# not the body. Negative offsets would place it above (Godot Y-down).
	shadow.position = Vector2(0, 4)
	var shadow_scale: float = t.collision_radius / 160.0
	shadow.scale = Vector2(shadow_scale, shadow_scale * 0.6)
	shadow.modulate = Color(0, 0, 0, 0.45)
	shadow.z_index = -1
	# Move-before-sprite in the parent's child order so it draws
	# underneath. add_child appends, then move_child puts it FIRST.
	add_child(shadow)
	move_child(shadow, 0)

# ── Physics tick — universal scaffolding + behavior dispatch ──────────
func _physics_process(delta: float) -> void:
	# Death drain → free. Skip all gameplay logic so corpses don't keep
	# chasing the hero.
	if _dying:
		_death_timer -= delta
		if _death_timer <= 0.0:
			queue_free()
		return
	# Iter 43 — burn tick. Drains _burn_remaining and applies tick
	# damage at intervals. Runs BEFORE spawn-in / knockback gates so
	# burns persist through knockbacks (consistent with player
	# expectations — getting hit doesn't extinguish a fire). Skip
	# during _spawn_in_time so an enemy can't be pre-burned-to-death.
	if _burn_active and _spawn_in_time <= 0.0:
		_burn_remaining -= delta
		_burn_tick_timer -= delta
		if _burn_tick_timer <= 0.0:
			_burn_tick_timer = BURN_TICK_INTERVAL
			hp -= BURN_DAMAGE_PER_TICK
			# Orange floater so burn damage reads distinct from melee/
			# crit/spike damage. Smaller font (default) so a stream of
			# burns doesn't dominate the HUD.
			var dn: DamageNumber = DamageNumber.spawn(
				global_position + Vector2(0, -28),
				str(BURN_DAMAGE_PER_TICK),
				Color(1.0, 0.55, 0.20),
			)
			var parent_b: Node = get_parent()
			if parent_b != null:
				parent_b.add_child(dn)
			Events.enemy_hit.emit(global_position)
			if hp <= 0:
				_die()
				return
		if _burn_remaining <= 0.0:
			_burn_active = false
	# Iter 46 — slow tick. Drains _slow_remaining; resets multiplier
	# when it expires. Applied via _effective_move_speed() in the
	# behavior ticks; this block just manages the timer. Sprite gets
	# a cyan-blue modulate while slowed so the status is visible.
	if _slow_remaining > 0.0:
		_slow_remaining -= delta
		if _slow_remaining <= 0.0:
			_slow_multiplier = 1.0
			if sprite != null and not _burn_active:
				sprite.modulate = Color(1, 1, 1, 1)
		elif sprite != null and not _burn_active:
			# Don't overwrite the burn tint (orange wins — burn is more
			# damaging). Only paint blue when slowed-without-burning.
			sprite.modulate = Color(0.7, 0.9, 1.2, 1.0)
	# Iter 15 spawn-in fade. While ticking down, the enemy is locked,
	# invulnerable (see take_hit guard), and modulating from red-ghost
	# to full opacity. This is the visual telegraph window for
	# wave-spawn placement.
	if _spawn_in_time > 0.0:
		_spawn_in_time = max(0.0, _spawn_in_time - delta)
		var st: float = 1.0 - (_spawn_in_time / SPAWN_IN_DURATION)
		sprite.modulate = SPAWN_IN_START_COLOR.lerp(SPAWN_IN_END_COLOR, st)
		velocity = Vector2.ZERO
		# Iter 20 bugfix — only call play() if we're not already on idle.
		# AnimatedSprite2D.play() RESTARTS the animation from frame 0;
		# calling it every physics tick during the 0.5 s spawn-in window
		# pinned the idle anim to frame 0 forever (it never cycled).
		# Same compare-and-set trick hero.gd uses in _play_anim.
		if sprite.sprite_frames != null and sprite.sprite_frames.has_animation(&"idle"):
			if sprite.animation != &"idle" or not sprite.is_playing():
				sprite.play(&"idle")
		return
	# Knockback overrides AI. Velocity decays linearly to zero by the end
	# of the window, then control hands back to the behavior tick.
	if _knockback_time > 0.0:
		_knockback_time = max(0.0, _knockback_time - delta)
		var k_t: float = _knockback_time / _knockback_total if _knockback_total > 0.0 else 0.0
		velocity = _knockback_velocity * k_t
		move_and_slide()
		return
	if enemy_type == null:
		return
	# Behavior dispatch — one branch per supported tag. Unknown tags fall
	# through to chase_contact (the most forgiving default).
	match enemy_type.behavior:
		"telegraphed_melee":
			_tick_telegraphed_melee(delta)
		"shoot":
			_tick_shoot(delta)
		"stationary_shoot":
			_tick_stationary_shoot(delta)
		"bomber":
			_tick_bomber(delta)
		_:
			_tick_chase_contact(delta)

# ── Behavior: chase_contact ───────────────────────────────────────────
# Walk straight at hero. Body-bump deals damage on a timer while in
# contact range. Used by slime, crypt_spider, orc, ember, werewolf.
func _tick_chase_contact(delta: float) -> void:
	var t: EnemyType = enemy_type
	_contact_cd = max(0.0, _contact_cd - delta)
	if _hero == null or not is_instance_valid(_hero):
		velocity = Vector2.ZERO
		sprite.play(&"idle")
		return
	var to_hero: Vector2 = _hero.global_position - global_position
	var dist: float = to_hero.length()
	if t.can_move() and dist > 1.0:
		velocity = to_hero.normalized() * _effective_move_speed()
		sprite.play(&"walk")
	else:
		velocity = Vector2.ZERO
		sprite.play(&"idle")
	sprite.flip_h = to_hero.x < 0
	move_and_slide()
	if dist < t.contact_range and _contact_cd <= 0.0:
		_contact_cd = t.contact_cooldown
		if _hero.has_method("take_damage"):
			_hero.take_damage(t.contact_damage)

# ── Behavior: bomber ──────────────────────────────────────────────────
# Iter 47 — kamikaze enemy. Charges hero at high speed. When close
# enough, starts a brief windup (red flash + scale pulse), then
# self-detonates for AoE damage to hero. Always dies on detonation
# regardless of HP. Used by ember_bomber and future kamikaze variants.
#
# State machine:
#   APPROACH   — chase hero at move_speed. When dist < BOMBER_PRIME_DIST,
#                transition to PRIMING.
#   PRIMING    — windup tint + scale pulse for BOMBER_PRIME_TIME. Locked
#                in place; if hero leaves the radius, abort + return
#                to APPROACH. If timer expires while hero in radius,
#                detonate.
#   DETONATING — apply AoE damage + spawn VFX + queue _die.
#
# Reuses contact_range (RoomConfig prime distance), contact_damage
# (detonation damage), contact_cooldown (re-arm interval) from
# EnemyType so authoring stays in the existing schema.
enum BomberState { APPROACH, PRIMING, DETONATING }
const BOMBER_PRIME_TIME: float = 0.45
const BOMBER_EXPLODE_RADIUS: float = 48.0
var _bomber_state: BomberState = BomberState.APPROACH
var _bomber_prime_timer: float = 0.0

func _tick_bomber(delta: float) -> void:
	var t: EnemyType = enemy_type
	if _hero == null or not is_instance_valid(_hero):
		velocity = Vector2.ZERO
		sprite.play(&"idle")
		return
	var to_hero: Vector2 = _hero.global_position - global_position
	var dist: float = to_hero.length()
	match _bomber_state:
		BomberState.APPROACH:
			if t.can_move() and dist > 1.0:
				velocity = to_hero.normalized() * _effective_move_speed()
				sprite.play(&"walk")
			else:
				velocity = Vector2.ZERO
				sprite.play(&"idle")
			sprite.flip_h = to_hero.x < 0
			move_and_slide()
			# Transition to PRIMING when in contact range.
			if dist < t.contact_range:
				_bomber_state = BomberState.PRIMING
				_bomber_prime_timer = BOMBER_PRIME_TIME
				if sprite != null:
					# Red pulse — telegraph the impending detonation.
					sprite.modulate = Color(1.6, 0.7, 0.6, 1.0)
		BomberState.PRIMING:
			velocity = Vector2.ZERO
			move_and_slide()
			_bomber_prime_timer -= delta
			# Scale pulse — sin wave so the bomber visibly grows
			# closer to detonation.
			if sprite != null:
				var pulse_t: float = 1.0 - (_bomber_prime_timer / BOMBER_PRIME_TIME)
				var s: float = 1.0 + 0.18 * pulse_t
				sprite.scale = Vector2(s, s)
				sprite.modulate = Color(
					1.0 + 0.6 * pulse_t,
					0.7 - 0.2 * pulse_t,
					0.5,
					1.0,
				)
			# Abort priming if hero escapes — gives the player a
			# real "dodge the bomb" beat. Distance check uses
			# contact_range * 1.6 as the abort threshold (slight
			# hysteresis so frame-perfect edges don't oscillate).
			if dist > t.contact_range * 1.6:
				_bomber_state = BomberState.APPROACH
				if sprite != null:
					sprite.modulate = Color(1, 1, 1, 1)
					sprite.scale = Vector2.ONE
				return
			if _bomber_prime_timer <= 0.0:
				_bomber_state = BomberState.DETONATING
				_bomber_detonate()
		BomberState.DETONATING:
			pass   # _bomber_detonate triggers _die; rest of state is moot

func _bomber_detonate() -> void:
	# Hero damage if within blast radius. Damage = contact_damage
	# (authored on the EnemyType — bombers typically have 2 contact dmg).
	if _hero != null and is_instance_valid(_hero):
		var d: float = _hero.global_position.distance_to(global_position)
		if d < BOMBER_EXPLODE_RADIUS:
			if _hero.has_method("take_damage"):
				_hero.take_damage(enemy_type.contact_damage)
	# Spawn an orange-red VFX. Reuse damage_number for a "BOOM" floater
	# since dash_impact is hero-owned and shouldn't be preloaded here.
	# A custom bomber blast scene could land later.
	var dn: DamageNumber = DamageNumber.spawn(
		global_position,
		"BOOM",
		Color(1.0, 0.45, 0.20),
	)
	var parent_b: Node = get_parent()
	if parent_b != null:
		parent_b.add_child(dn)
	# Bombers always die on detonate — even if hero dodged.
	_die()

# ── Behavior: telegraphed_melee ───────────────────────────────────────
# Approach → stop + windup-tint → swing in cone → cooldown. Damage
# resolves on swing-start so a dodging hero escapes the cone.
# Used by skel, armored_skeleton, lancer, etc.
func _tick_telegraphed_melee(delta: float) -> void:
	var t: EnemyType = enemy_type
	if _hero == null or not is_instance_valid(_hero):
		velocity = Vector2.ZERO
		sprite.play(&"idle")
		return
	var to_hero: Vector2 = _hero.global_position - global_position
	var dist: float = to_hero.length()
	sprite.flip_h = to_hero.x < 0
	match _melee_state:
		MeleeState.IDLE:
			if dist > t.melee_reach * 0.85:
				if t.can_move():
					velocity = to_hero.normalized() * _effective_move_speed()
					sprite.play(&"walk")
					move_and_slide()
				else:
					velocity = Vector2.ZERO
					sprite.play(&"idle")
			else:
				velocity = Vector2.ZERO
				sprite.play(&"idle")
				_melee_state = MeleeState.WINDUP
				_melee_timer = t.melee_windup
				_melee_aim = to_hero.normalized()
		MeleeState.WINDUP:
			velocity = Vector2.ZERO
			sprite.play(&"idle")
			# Red telegraph tint pulses over the windup so the player can
			# read "about to swing" at a glance, distinct from the
			# shoot-windup cyan.
			var wt: float = 1.0 - (_melee_timer / t.melee_windup)
			sprite.modulate = Color(1, 1.0 - wt * 0.6, 1.0 - wt * 0.6, 1)
			_melee_timer -= delta
			if _melee_timer <= 0.0:
				_melee_state = MeleeState.SWING
				_melee_timer = t.melee_swing
				sprite.play(&"attack")
				# Damage check at swing-start — final position lets dodge
				# escape if the hero leaves the cone in time.
				var final_to_hero: Vector2 = _hero.global_position - global_position
				if final_to_hero.length() <= t.melee_reach \
				   and abs(final_to_hero.angle_to(_melee_aim)) < t.melee_cone \
				   and _hero.has_method("take_damage"):
					_hero.take_damage(t.melee_damage)
		MeleeState.SWING:
			velocity = Vector2.ZERO
			_melee_timer -= delta
			if _melee_timer <= 0.0:
				_melee_state = MeleeState.COOLDOWN
				_melee_timer = t.melee_cooldown - t.melee_swing
				sprite.modulate = Color(1, 1, 1, 1)
		MeleeState.COOLDOWN:
			if t.can_move() and dist > t.melee_reach * 0.85:
				velocity = to_hero.normalized() * _effective_move_speed()
				sprite.play(&"walk")
				move_and_slide()
			else:
				velocity = Vector2.ZERO
				sprite.play(&"idle")
			_melee_timer -= delta
			if _melee_timer <= 0.0:
				_melee_state = MeleeState.IDLE

# ── Behavior: shoot ───────────────────────────────────────────────────
# Kite + cast. Backs away if hero is closer than min_dist, approaches if
# farther than prefer_dist, and casts when in cast_range with cooldown
# clear. Used by wiz, archer, priest, dreadmage, skel_archer.
func _tick_shoot(delta: float) -> void:
	var t: EnemyType = enemy_type
	if _hero == null or not is_instance_valid(_hero):
		velocity = Vector2.ZERO
		sprite.play(&"idle")
		return
	var to_hero: Vector2 = _hero.global_position - global_position
	var dist: float = to_hero.length()
	sprite.flip_h = to_hero.x < 0
	match _cast_state:
		CastState.IDLE:
			if t.can_move() and dist < t.min_dist:
				velocity = -to_hero.normalized() * _effective_move_speed()
				sprite.play(&"walk")
				move_and_slide()
			elif t.can_move() and dist > t.prefer_dist:
				velocity = to_hero.normalized() * _effective_move_speed()
				sprite.play(&"walk")
				move_and_slide()
			else:
				velocity = Vector2.ZERO
				sprite.play(&"idle")
			if dist <= t.cast_range and _cast_timer <= 0.0:
				_cast_state = CastState.WINDUP
				_cast_timer = t.cast_windup
				_cast_aim = to_hero.normalized()
				sprite.play(&"attack")
			else:
				_cast_timer = max(0.0, _cast_timer - delta)
		CastState.WINDUP:
			velocity = Vector2.ZERO
			sprite.play(&"attack")
			# Cyan telegraph — distinct from the melee red. Player learns
			# "blue glow = ranged, red glow = melee."
			var wt: float = 1.0 - (_cast_timer / t.cast_windup)
			sprite.modulate = Color(1.0 - wt * 0.5, 1.0, 1.0, 1)
			_cast_timer -= delta
			if _cast_timer <= 0.0:
				_fire_projectile()
				# Return straight to IDLE with the cooldown timer set;
				# IDLE's else-branch drains it before next cast is armed.
				_cast_state = CastState.IDLE
				_cast_timer = t.cast_cooldown
				sprite.modulate = Color(1, 1, 1, 1)

# ── Behavior: stationary_shoot ────────────────────────────────────────
# Identical to shoot but skips all movement attempts. Implemented as
# shoot-with-can_move-false so we don't duplicate the state machine.
# The shoot tick already guards movement with t.can_move() so we just
# forward.
func _tick_stationary_shoot(delta: float) -> void:
	_tick_shoot(delta)

# Re-aim at hero at the moment of cast — running during windup is a
# reasonable dodge, but instant teleport between aim and release would
# be too cheesy. Matches the wizard's old fire_orb convention.
func _fire_projectile() -> void:
	var t: EnemyType = enemy_type
	if _hero != null and is_instance_valid(_hero):
		_cast_aim = (_hero.global_position - global_position).normalized()
	var p: Projectile = PROJECTILE_SCENE.instantiate()
	p.target_group = "hero"
	p.orb_tint = t.projectile_tint
	p.global_position = global_position + Vector2(0, -28) + _cast_aim * 22.0
	p.velocity = _cast_aim * Projectile.SPEED
	p.damage = t.projectile_damage
	get_parent().add_child(p)

# ── Universal: take_hit + knockback + death ───────────────────────────

func take_hit(damage: int, is_crit: bool = false) -> void:
	# Iter 15: ignore hits during the spawn-in fade so the player can't
	# pre-kill an enemy that's still materializing. Mirrors the AI lock —
	# the enemy isn't "present" yet.
	if _dying or _spawn_in_time > 0.0:
		return
	hp -= damage
	# Iter 43 — per-hit damage number. Crit hits use spawn_crit (yellow,
	# bigger, "!" suffix, longer life); normal hits use the standard
	# white number. Spawned at the enemy head so it reads as "X damage
	# to this enemy" rather than floating in the void.
	var num_pos: Vector2 = global_position + Vector2(0, -28)
	var dn: DamageNumber
	if is_crit:
		dn = DamageNumber.spawn_crit(num_pos, damage)
	else:
		dn = DamageNumber.spawn(num_pos, str(damage), Color(1, 0.95, 0.9))
	var parent: Node = get_parent()
	if parent != null:
		parent.add_child(dn)
	if sprite != null:
		var tween: Tween = create_tween()
		# Iter 43 — crit flash is warmer (gold) so the player sees both
		# the damage number AND the sprite reaction confirm the crit.
		var flash_color: Color = Color(3, 2.4, 1.5, 1) if is_crit else Color(2, 2, 2, 1)
		tween.tween_property(sprite, "modulate", flash_color, 0.04)
		tween.tween_property(sprite, "modulate", Color(1, 1, 1, 1), 0.10)
	Events.enemy_hit.emit(global_position)
	# Iter 53 — audio sparkle for crit hits. Layered on top of the
	# enemy_hit "thud" so the crit feedback hits both visually (yellow
	# damage number) and audibly (rising sparkle chime).
	if is_crit:
		Events.enemy_crit_hit.emit(global_position)
	# Iter 37 — phase transition check. Only triggers when:
	#   - we're still in phase 1
	#   - enemy_type declares phase2_overrides (non-empty)
	#   - phase2_hp_threshold > 0 (kill-switch respect)
	#   - current hp is at or below threshold
	#   - hit didn't drop hp to 0 (avoid firing during death frame)
	# Done BEFORE the death check so an enemy can't "skip" phase 2 by
	# being burst from 100% to 0%.
	if hp > 0 and _phase == 1 and enemy_type != null:
		var thr: float = enemy_type.phase2_hp_threshold
		if thr > 0.0 and not enemy_type.phase2_overrides.is_empty():
			var ratio: float = float(hp) / float(maxi(1, enemy_type.max_hp))
			if ratio <= thr:
				_trigger_phase_2()
	if hp <= 0:
		_die()

# Iter 37 — boss phase 2 transition. Duplicates the enemy_type so we
# can mutate it without polluting the shared resource, applies the
# phase2_overrides on the copy, fires a brief red enrage tint on the
# sprite, and emits phase_changed(2) so main.gd can show its banner.
# Idempotent — guarded by _phase == 1 in take_hit so it only fires
# once per enemy lifetime.
func _trigger_phase_2() -> void:
	_phase = 2
	# Copy the EnemyType so our mutations don't leak to other enemies
	# (or persist after this run since resources are cached). After
	# this point, enemy_type points at the local duplicate.
	var local: EnemyType = enemy_type.duplicate() as EnemyType
	var overrides: Dictionary = local.phase2_overrides
	for key in overrides:
		if key in local:
			local.set(key, overrides[key])
	enemy_type = local
	# Visual feedback — brief red enrage flash on the sprite. Distinct
	# from the white hit-flash (modulate(2,2,2)) so the player reads
	# "the boss just got worse" rather than "the boss just got hit."
	if sprite != null:
		var t: Tween = create_tween()
		t.tween_property(sprite, "modulate", Color(2.5, 0.8, 0.6, 1), 0.10)
		t.tween_property(sprite, "modulate", Color(1, 1, 1, 1), 0.40)
	# Iter 53 — audio sting for the phase transition. Same beat as the
	# "ENRAGED" banner + camera shake from main.gd. Gated to is_boss
	# enemies via the enemy_type flag so non-boss enemies with
	# phase2_overrides (future elites) don't trigger the boss-specific
	# sting — they get a smaller in-built audio cue if needed later.
	if enemy_type != null and enemy_type.is_boss:
		Events.boss_enraged.emit(global_position)
	phase_changed.emit(2)

func apply_knockback(dir: Vector2, force: float, duration: float) -> void:
	if _dying or duration <= 0.0:
		return
	if dir.length_squared() < 0.0001:
		return
	_knockback_velocity = dir.normalized() * force
	_knockback_time = duration
	_knockback_total = duration

func _die() -> void:
	_dying = true
	_death_timer = enemy_type.death_duration if enemy_type != null else 0.8
	velocity = Vector2.ZERO
	if sprite != null:
		sprite.modulate = Color(1, 1, 1, 1)
		if sprite.sprite_frames != null and sprite.sprite_frames.has_animation(&"death"):
			sprite.play(&"death")
	set_collision_layer_value(3, false)
	set_collision_mask_value(2, false)
	died_at.emit(global_position)
	Events.enemy_died.emit(global_position)
