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
#   bomber             kamikaze charge → prime + scale → detonate AoE
#   healer             keep distance from hero → windup tint → pulse heal
#                      to the most-wounded ally in HEAL_RADIUS
#   summoner           kite from hero → windup spiral → spawn 1-2 bonecap
#                      minions within SUMMON_RADIUS (cap 3 concurrent)
#   wraith             fast melee that periodically PHASES — vanishes,
#                      reappears BEHIND hero, lands a flanking strike.
#                      Invulnerable + non-colliding during the phase window.
#
# All behaviors use the same death + knockback + take_hit machinery —
# the behavior switch only affects per-tick AI.
class_name Enemy
extends CharacterBody2D

const PROJECTILE_SCENE = preload("res://scenes/projectile.tscn")
# Iter 27 — shared ground-shadow texture. Same asset hero uses; sized
# per-instance below by collision_radius so a slime gets a small
# shadow and the iron_revenant gets a big one. Drawn under the sprite
# so the enemy reads as standing ON the floor rather than floating.
const SHADOW_TEXTURE: Texture2D = preload("res://assets/decor/shadow_ellipse.png")
# iter-81: preload AttackFeel rather than using class_name. Defensive
# (matches the screen_flash.gd autoload pattern) so the static
# apply_hit_feedback_tier call in take_hit resolves at parse time
# regardless of class_name registration order.
const AttackFeel = preload("res://scripts/attack_feel.gd")
# iter-88: FxSpriteCls (renamed locally to avoid clash with the
# class_name FxSprite — preload resolves at parse time before
# class_name registration in enemy.gd's load order).
const FxSpriteCls = preload("res://scripts/fx_sprite.gd")

# Iter 15 — spawn-in window. Newly-spawned enemies fade from a bright
# red translucent ghost to full opacity over SPAWN_IN_DURATION seconds.
# During this window: no AI, no take_hit, velocity locked to zero. This
# gives the player a clear visual telegraph that "an enemy is materializing
# HERE" instead of the iter-14 behavior where enemies popped into existence
# at full opacity and immediately started chasing.
# iter-79 retune: after the spawn-portal experiment was removed (iters
# 75-78), the per-enemy fade-in is once again THE spawn telegraph. User
# feedback through that arc was that the iter-15 "bright red ghost" was
# too aggressive — it screamed danger the way a hazard would.
#   • duration 0.5s → 0.35s (faster — less time as a ghost)
#   • start color 1.8/0.3/0.3 → 1.25/0.45/0.55 (muted, slightly pink-cooled,
#     reads "arriving" not "hot danger")
#   • alpha 0.3 → 0.40 (slightly more visible so the player still notices)
const SPAWN_IN_DURATION := 0.35
const SPAWN_IN_START_COLOR := Color(1.25, 0.45, 0.55, 0.40)
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

# iter-103 — elite affix per-instance state. Set by main.gd._spawn_enemy_type
# AFTER instantiate but BEFORE add_child, so the affix is applied at
# _ready time (where the visual tint lands). Values:
#   ""        no affix (default — most enemies)
#   "frost"   slows hero on contact (apply_slow 1.0s × 0.6)
#   "ember"   spawns death AoE damaging hero in radius
#   "venom"   applies DoT on contact (apply_venom 2.0s → 4 ticks)
#   "warded"  -1 incoming damage (clamped min 1 so DoT-only setups
#             aren't fully invalidated)
# Rolled at spawn time in main.gd for floor 2+ non-boss enemies at
# a base 22% chance — see _maybe_apply_elite_affix in main.gd.
var elite_affix: String = ""
const ELITE_AFFIX_TINTS: Dictionary = {
	"frost":  Color(0.55, 0.85, 1.20, 1.0),   # cool cyan-blue
	"ember":  Color(1.30, 0.65, 0.45, 1.0),   # warm red-orange
	"venom":  Color(0.65, 1.20, 0.55, 1.0),   # sickly green
	"warded": Color(1.20, 1.10, 0.75, 1.0),   # silver-gold
}
const ELITE_AFFIX_NAMES: Dictionary = {
	"frost":  "FROST",
	"ember":  "EMBER",
	"venom":  "VENOM",
	"warded": "WARDED",
}
# Frost slow tuning.
const ELITE_FROST_DURATION: float = 1.0
const ELITE_FROST_MULTIPLIER: float = 0.6
# Venom DoT tuning. duration passed to apply_venom; hero ticks at 0.5s
# for HERO_VENOM_TICK_INTERVAL → 2.0s = 4 ticks × 1 dmg = 4 total.
const ELITE_VENOM_DURATION: float = 2.0
# Ember death AoE tuning.
const ELITE_EMBER_RADIUS: float = 56.0
const ELITE_EMBER_DAMAGE: int = 2
# Warded incoming-damage reduction.
const ELITE_WARDED_DR: int = 1

# iter-103: apply on-contact elite affix effect to the hero. Called
# from every enemy-contact-damage site (chase_contact body bump,
# bomber detonation, wraith strike, telegraphed_melee swing). Each
# affix dispatches to the hero's matching apply_* method:
#   frost  → apply_slow(1.0s, 0.6×)
#   venom  → apply_venom(2.0s, 4 ticks × 1 dmg = 4 over 2s)
#   ember  → fires in _die() instead (death explosion, not on-contact)
#   warded → defensive only, clamps incoming damage in take_hit
# No-op for non-affix enemies and for affix=="ember"/"warded".
func _apply_contact_affix() -> void:
	if _hero == null or not is_instance_valid(_hero):
		return
	if elite_affix == "frost" and _hero.has_method("apply_slow"):
		_hero.apply_slow(ELITE_FROST_DURATION, ELITE_FROST_MULTIPLIER)
	elif elite_affix == "venom" and _hero.has_method("apply_venom"):
		_hero.apply_venom(ELITE_VENOM_DURATION)

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

# Iter 70 — baseline modulate read. Returns the EnemyType's authored
# sprite_modulate, defaulting to white if no type is bound. Used by
# every status-effect restoration path (burn fade, slow fade, melee/
# cast/heal/summoner windup-end, _die, knockback) instead of a hard-
# coded white so enemies that REUSE another's sheets but author a
# baseline tint (e.g. spectral_priest greener than priest) retain
# their distinguishing color after the status clears.
func _baseline_modulate() -> Color:
	if enemy_type == null:
		return Color(1, 1, 1, 1)
	# iter-103: if the enemy has an elite affix, the baseline tint
	# multiplies the EnemyType's natural sprite_modulate with the affix
	# tint. Burn / slow / windup status tints still override temporarily
	# (those bypass _baseline_modulate by assigning directly to
	# sprite.modulate), but every restore-to-baseline path here picks up
	# the affix coloring. Multiplicative (not replacement) so an enemy
	# with a non-default sprite_modulate (spectral_priest green, etc.)
	# blends with the affix rather than losing its base identity.
	var base: Color = enemy_type.sprite_modulate
	if elite_affix != "" and ELITE_AFFIX_TINTS.has(elite_affix):
		var affix_tint: Color = ELITE_AFFIX_TINTS[elite_affix]
		base = Color(base.r * affix_tint.r, base.g * affix_tint.g, base.b * affix_tint.b, base.a)
	return base

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
	# Iter 70 — start with the SPAWN_IN_START red ghost (the spawn-in fade
	# in _physics_process lerps from this toward _baseline_modulate over
	# SPAWN_IN_DURATION). Without this initialization the first frame
	# would briefly paint the enemy at sprite_modulate before the fade
	# overrides it — a 1-frame pop is visible at small framerates.
	sprite.modulate = SPAWN_IN_START_COLOR
	# iter-88 — spawn portal companion FX. Hand-painted Frostwindz
	# portal sprite sheet (7 frames @ 14fps, ~0.5s lifetime) — purple
	# summoning vortex opening, sparking, closing. Replaces the
	# iter-86 SpawnBurst (which was procedural floor-crack + wisps
	# CPUParticles2D) since the painted asset reads dramatically better.
	# Spawned into the parent scene so the FX lives in world space
	# and trails off after the enemy materializes.
	#
	# Scale 1.5× makes the 64-px sheet read ~96px in-world — visible
	# but not dominating. z_index 2 sits above floor/blood marks but
	# below the enemy sprite (default z) so the enemy emerges THROUGH
	# the portal rather than behind it.
	var parent_for_burst: Node = get_parent()
	if parent_for_burst != null:
		FxSpriteCls.spawn(parent_for_burst, global_position, "spawn_portal", {
			"scale": Vector2(1.5, 1.5),
			"z_index": 2,
		})
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
		# iter-101 BUG FIX: paint the sprite warm-orange while burning.
		# The slow-tick block below carries a comment ("Don't overwrite
		# the burn tint — orange wins") that gates AROUND a burn tint
		# which was never actually applied anywhere. FLAME DoT relics
		# (Embers of Ruin, Cataclysm) had no enemy-side visual feedback
		# — players saw one orange damage number and nothing else for
		# the remaining ~3 ticks. Now the sprite reads as on fire while
		# the DoT runs.
		if sprite != null:
			sprite.modulate = Color(1.35, 0.75, 0.40, 1.0)
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
			# iter-101: restore baseline (or slow tint if also slowed)
			# now that the burn ended. Slow tick below handles the slow
			# case separately when burn isn't active.
			if sprite != null:
				if _slow_remaining > 0.0:
					sprite.modulate = Color(0.7, 0.9, 1.2, 1.0)
				else:
					sprite.modulate = _baseline_modulate()
	# Iter 46 — slow tick. Drains _slow_remaining; resets multiplier
	# when it expires. Applied via _effective_move_speed() in the
	# behavior ticks; this block just manages the timer. Sprite gets
	# a cyan-blue modulate while slowed so the status is visible.
	if _slow_remaining > 0.0:
		_slow_remaining -= delta
		if _slow_remaining <= 0.0:
			_slow_multiplier = 1.0
			if sprite != null and not _burn_active:
				sprite.modulate = _baseline_modulate()
		elif sprite != null and not _burn_active:
			# Don't overwrite the burn tint (orange wins — burn is more
			# damaging). Only paint blue when slowed-without-burning.
			sprite.modulate = Color(0.7, 0.9, 1.2, 1.0)
	# Iter 15 spawn-in fade. While ticking down, the enemy is locked,
	# invulnerable (see take_hit guard), and modulating from red-ghost
	# to full opacity. This is the visual telegraph window for
	# wave-spawn placement.
	# Iter 70 — lerp end target is _baseline_modulate() (was a hardcoded
	# SPAWN_IN_END_COLOR white). Enemies that authored a sprite_modulate
	# on their EnemyType (e.g. spectral_priest green) settle into THAT
	# tint after spawn-in, not white.
	if _spawn_in_time > 0.0:
		_spawn_in_time = max(0.0, _spawn_in_time - delta)
		var st: float = 1.0 - (_spawn_in_time / SPAWN_IN_DURATION)
		sprite.modulate = SPAWN_IN_START_COLOR.lerp(_baseline_modulate(), st)
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
		"healer":
			_tick_healer(delta)
		"summoner":
			_tick_summoner(delta)
		"wraith":
			_tick_wraith(delta)
		"glyph_warden":
			_tick_glyph_warden(delta)
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
			# iter-70 polish: pass our position so hero knockback is
			# AWAY from us, not hero-facing-inversion fallback.
			_hero.take_damage(t.contact_damage, global_position)
			# iter-103: elite affix on-contact effects. Frost slows the
			# hero; venom applies a DoT. Ember + warded fire elsewhere
			# (_die and take_hit). Guarded by has_method so the call
			# is robust to test contexts where _hero isn't a full hero.
			_apply_contact_affix()

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
					sprite.modulate = _baseline_modulate()
					sprite.scale = Vector2(t.sprite_scale, t.sprite_scale)
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
				# iter-70 polish: knockback away from the bomber blast center.
				_hero.take_damage(enemy_type.contact_damage, global_position)
				# iter-103: bomber detonation also applies the affix on-hit.
				_apply_contact_affix()
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

# ── Behavior: healer ──────────────────────────────────────────────────
# Iter 65 — support caster. Stays at HEALER_PREFER_DIST from the hero
# (kites away if hero gets too close), scans the `enemies` group at
# HEAL_INTERVAL ticks for the most-wounded ally in HEAL_RADIUS, and
# emits a HEAL_AMOUNT heal on a brief windup. Heals are gated by
# is_instance_valid + _dying so dead enemies can't be resurrected, and
# the most-wounded sort uses hp/max_hp ratio so a 1/10 elite is healed
# before a 2/4 squishy.
#
# State machine:
#   IDLE        — keep ~HEALER_PREFER_DIST from hero, scan for targets;
#                 transition to WINDUP when a wounded ally is in range
#                 AND _heal_cooldown_timer <= 0.
#   WINDUP      — 0.6s windup with a green/teal tint pulse on the healer.
#                 Locked in place. Target stored as _heal_target; if the
#                 target dies or leaves radius during windup, abort back
#                 to IDLE (no cooldown — let the healer pick again).
#   HEAL_PULSE  — single-frame state: apply the heal, spawn the pulse-
#                 ring VFX, transition straight to COOLDOWN.
#   COOLDOWN    — drain _heal_cooldown_timer; while > 0, kite as in IDLE
#                 but skip target scanning. Transition to IDLE at 0.
#
# Telegraph: WINDUP paints the healer in a green tint that intensifies
# over the windup, so the player can read "healer is about to cast" at
# a glance. On HEAL_PULSE we spawn a Polygon2D ring that scales out
# from the healer to the target and fades, drawn under the sprite layer
# so it reads as a ground effect rather than an in-air projectile.
enum HealerState { IDLE, WINDUP, HEAL_PULSE, COOLDOWN }
const HEAL_INTERVAL: float = 3.5
const HEAL_WINDUP: float = 0.6
const HEAL_RADIUS: float = 120.0
const HEAL_AMOUNT: int = 2
const HEALER_PREFER_DIST: float = 200.0
const HEALER_MIN_DIST: float = 160.0
# Ring pulse visual config. The ring expands from ~10 px at the healer
# to ring_max_radius at the target, fades alpha to 0 across PULSE_LIFE.
const HEAL_PULSE_LIFE: float = 0.45
const HEAL_PULSE_RING_SEGMENTS: int = 28
const HEAL_PULSE_RING_WIDTH: float = 4.0
const HEAL_TINT_PEAK: Color = Color(0.6, 1.6, 1.1, 1.0)   # green/teal at peak windup
var _healer_state: HealerState = HealerState.IDLE
var _healer_timer: float = 0.0
var _heal_cooldown_timer: float = 0.0
var _heal_target: Enemy = null

func _tick_healer(delta: float) -> void:
	var t: EnemyType = enemy_type
	if _hero == null or not is_instance_valid(_hero):
		velocity = Vector2.ZERO
		sprite.play(&"idle")
		return
	var to_hero: Vector2 = _hero.global_position - global_position
	var dist: float = to_hero.length()
	sprite.flip_h = to_hero.x < 0
	match _healer_state:
		HealerState.IDLE:
			_healer_movement(to_hero, dist)
			# Scan for a heal target. Pick the most-wounded ally in
			# HEAL_RADIUS; if found AND cooldown is clear, transition.
			if _heal_cooldown_timer > 0.0:
				_heal_cooldown_timer = max(0.0, _heal_cooldown_timer - delta)
			else:
				var target: Enemy = _find_heal_target()
				if target != null:
					_heal_target = target
					_healer_state = HealerState.WINDUP
					_healer_timer = HEAL_WINDUP
					sprite.play(&"attack")
		HealerState.WINDUP:
			velocity = Vector2.ZERO
			move_and_slide()
			# Bail if target died / despawned / left HEAL_RADIUS during
			# windup — no cooldown so the healer can pick again next tick.
			if not _heal_target_valid():
				_heal_target = null
				_healer_state = HealerState.IDLE
				sprite.modulate = _baseline_modulate()
				return
			# Green tint ramps from 0 to peak across the windup so the
			# player reads "the healer is winding up a cast."
			# Iter 70 — lerp source is _baseline_modulate() so an enemy
			# with an authored tint (e.g. spectral_priest green) stays
			# distinguishable through the windup ramp.
			var wt: float = 1.0 - (_healer_timer / HEAL_WINDUP)
			sprite.modulate = _baseline_modulate().lerp(HEAL_TINT_PEAK, wt)
			_healer_timer -= delta
			if _healer_timer <= 0.0:
				_healer_state = HealerState.HEAL_PULSE
		HealerState.HEAL_PULSE:
			# One-frame state — apply heal + spawn VFX, then enter cooldown.
			_apply_heal()
			sprite.modulate = _baseline_modulate()
			_healer_state = HealerState.COOLDOWN
			_heal_cooldown_timer = HEAL_INTERVAL
			_heal_target = null
		HealerState.COOLDOWN:
			# Kite as in IDLE but skip target scanning until cooldown done.
			_healer_movement(to_hero, dist)
			_heal_cooldown_timer = max(0.0, _heal_cooldown_timer - delta)
			if _heal_cooldown_timer <= 0.0:
				_healer_state = HealerState.IDLE

# Healer kite movement. Pushes away from the hero if too close, pulls
# closer if too far, idles in the dead zone between MIN_DIST and
# PREFER_DIST. Speed scales with _effective_move_speed() so slow status
# still applies as expected.
func _healer_movement(to_hero: Vector2, dist: float) -> void:
	var t: EnemyType = enemy_type
	if t.can_move() and dist < HEALER_MIN_DIST:
		# Hero is too close — back away.
		velocity = -to_hero.normalized() * _effective_move_speed()
		sprite.play(&"walk")
		move_and_slide()
	elif t.can_move() and dist > HEALER_PREFER_DIST + 40.0:
		# Hero is far — drift toward HEAL range, but stay slow.
		velocity = to_hero.normalized() * _effective_move_speed() * 0.6
		sprite.play(&"walk")
		move_and_slide()
	else:
		velocity = Vector2.ZERO
		sprite.play(&"idle")

# Scan the `enemies` group for the most-wounded ally in HEAL_RADIUS.
# Excludes self, dying enemies, enemies still in spawn-in fade, and
# allies at full HP. Sort key = hp ratio ascending → lowest-ratio wins.
func _find_heal_target() -> Enemy:
	var best: Enemy = null
	var best_ratio: float = INF
	for node in get_tree().get_nodes_in_group("enemies"):
		if node == self:
			continue
		if not (node is Enemy):
			continue
		var e: Enemy = node
		if e._dying:
			continue
		if e._spawn_in_time > 0.0:
			continue
		if e.enemy_type == null:
			continue
		if e.hp >= e.enemy_type.max_hp:
			continue
		if global_position.distance_to(e.global_position) > HEAL_RADIUS:
			continue
		var ratio: float = float(e.hp) / float(maxi(1, e.enemy_type.max_hp))
		if ratio < best_ratio:
			best_ratio = ratio
			best = e
	return best

# Confirm the stashed _heal_target is still a valid heal candidate.
# Same rules as _find_heal_target plus a still-in-radius check.
func _heal_target_valid() -> bool:
	if _heal_target == null:
		return false
	if not is_instance_valid(_heal_target):
		return false
	if _heal_target._dying:
		return false
	if _heal_target.enemy_type == null:
		return false
	if _heal_target.hp >= _heal_target.enemy_type.max_hp:
		return false
	if global_position.distance_to(_heal_target.global_position) > HEAL_RADIUS:
		return false
	return true

# Apply the heal pulse: bump target HP (capped at max_hp), spawn the
# green floater so the player reads "+2", and spawn the expanding ring
# VFX from healer toward target.
func _apply_heal() -> void:
	if not _heal_target_valid():
		return
	var target: Enemy = _heal_target
	var heal_amount: int = mini(HEAL_AMOUNT, target.enemy_type.max_hp - target.hp)
	if heal_amount <= 0:
		return
	target.hp += heal_amount
	# Green floater above the target — distinct color from damage
	# numbers so the player reads "this enemy was healed."
	var dn: DamageNumber = DamageNumber.spawn(
		target.global_position + Vector2(0, -28),
		"+" + str(heal_amount),
		Color(0.55, 1.0, 0.65, 1.0),
	)
	var parent: Node = get_parent()
	if parent != null:
		parent.add_child(dn)
	# Brief healing flash on the target so it reads as receiving the
	# pulse, not just a free HP refill. Matches the take_hit tween shape.
	if target.sprite != null:
		var tw: Tween = target.create_tween()
		tw.tween_property(target.sprite, "modulate", Color(0.6, 1.6, 1.1, 1), 0.06)
		tw.tween_property(target.sprite, "modulate", Color(1, 1, 1, 1), 0.18)
	# Spawn the pulse ring VFX — expands from the healer toward the
	# target across HEAL_PULSE_LIFE, then queue_frees itself.
	_spawn_heal_pulse(target.global_position)

# Code-built ring VFX. A Node2D wrapper holds a Polygon2D ring (built
# from HEAL_PULSE_RING_SEGMENTS sample points around a circle); a tween
# scales it up + fades alpha across HEAL_PULSE_LIFE, then queue_frees.
# No new .tscn required.
func _spawn_heal_pulse(target_pos: Vector2) -> void:
	var parent: Node = get_parent()
	if parent == null:
		return
	var fx: Node2D = Node2D.new()
	fx.global_position = global_position
	fx.z_index = -1   # under the sprite layer so it reads as ground FX
	parent.add_child(fx)
	# Build the ring as a stroked polygon. Polygon2D doesn't have a
	# native ring primitive; we author a thin annulus by sampling the
	# outer + inner circles and concatenating them with a winding
	# reversal in the middle.
	var ring: Polygon2D = Polygon2D.new()
	var outer_r: float = 28.0
	var inner_r: float = max(0.5, outer_r - HEAL_PULSE_RING_WIDTH)
	var verts: PackedVector2Array = PackedVector2Array()
	for i in range(HEAL_PULSE_RING_SEGMENTS):
		var a: float = (TAU / float(HEAL_PULSE_RING_SEGMENTS)) * float(i)
		verts.append(Vector2(cos(a), sin(a)) * outer_r)
	# Inner loop in reverse so the polygon is a true annulus, not a
	# disc with a chord through it.
	for i in range(HEAL_PULSE_RING_SEGMENTS - 1, -1, -1):
		var a: float = (TAU / float(HEAL_PULSE_RING_SEGMENTS)) * float(i)
		verts.append(Vector2(cos(a), sin(a)) * inner_r)
	ring.polygon = verts
	ring.color = Color(0.55, 1.0, 0.7, 0.85)
	fx.add_child(ring)
	# Compute final scale so the ring's outer edge lands roughly at the
	# target's position. Stops one-shot effects from going off-screen
	# when the target is at the very edge of HEAL_RADIUS.
	var travel: float = global_position.distance_to(target_pos)
	var final_scale: float = max(1.2, (travel + 24.0) / outer_r)
	var tw: Tween = fx.create_tween()
	tw.set_parallel(true)
	tw.tween_property(fx, "scale", Vector2(final_scale, final_scale), HEAL_PULSE_LIFE) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(ring, "modulate:a", 0.0, HEAL_PULSE_LIFE) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	# Drift the ring's center toward the target so it visually "travels"
	# rather than spawning around the healer. Half-distance offset reads
	# as "directed pulse" without losing the source anchor.
	var mid: Vector2 = (global_position + target_pos) * 0.5
	tw.tween_property(fx, "global_position", mid, HEAL_PULSE_LIFE) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	# Reap the FX node when the tween finishes so we don't leak nodes
	# every cast (3.5s cooldown × long room = dozens of orphans).
	tw.chain().tween_callback(fx.queue_free)

# Iter 65 — test-only force-trigger entry point for the headless
# verification script. Skips the windup/cooldown gating so a test can
# assert "calling this heals the wounded ally" without simulating
# 4+ seconds of physics_process ticks. Production AI always goes
# through the IDLE → WINDUP → HEAL_PULSE → COOLDOWN flow.
func _force_heal_for_test(target: Enemy) -> void:
	_heal_target = target
	_apply_heal()

# ── Behavior: summoner ────────────────────────────────────────────────
# Iter 66 — caster that periodically spawns minion enemies during
# combat. Kites from the hero at SUMMONER_KEEP_DIST; on the SUMMON_
# INTERVAL cycle, telegraphs with a dark expanding ring + sprite tint,
# then fires 1-2 enemy_summon_requested events for bonecaps around
# itself. Tracks summoned minions on the instance and caps the live
# pool at SUMMONER_MAX_MINIONS so a single summoner can't infinitely
# stuff the arena.
#
# State machine (mirrors healer pattern):
#   IDLE      — kite at KEEP_DIST. When _summon_cooldown_timer <= 0 AND
#               live-minion-count < cap, transition to WINDUP.
#   WINDUP    — SUMMON_WINDUP seconds. Locked in place. Dark-red tint
#               ramps on the sprite + an expanding dark ring is spawned
#               under the sprite layer as telegraph. Transitions to
#               SUMMON when the timer expires.
#   SUMMON    — one-frame state: pick 1-2 spawn positions around the
#               summoner inside SUMMON_RADIUS, emit enemy_summon_
#               requested for each (main.gd subscribes and instantiates
#               bonecaps via its ENEMY_TYPES pathway). Transition to
#               COOLDOWN with _summon_cooldown_timer set to
#               SUMMON_COOLDOWN.
#   COOLDOWN  — kite as in IDLE but no scan; drain timer; back to IDLE.
#
# Live-minion tracking is per-summoner: we stash WeakRefs to spawned
# minions in _summoned_minions and prune dead/invalid entries before
# the cap check. Using WeakRef so a freed Enemy doesn't keep the array
# entry alive; the cap reflects the current live count.
enum SummonerState { IDLE, WINDUP, SUMMON, COOLDOWN }
const SUMMON_INTERVAL: float = 5.0
const SUMMON_WINDUP: float = 0.8
const SUMMON_COOLDOWN: float = 1.0
const SUMMON_RADIUS: float = 80.0
const SUMMON_KEEP_DIST: float = 240.0
const SUMMONER_MIN_DIST: float = 200.0
const SUMMONER_MAX_MINIONS: int = 3
const SUMMONER_MINION_TYPE: String = "bonecap"
const SUMMONER_TINT_PEAK: Color = Color(1.4, 0.45, 0.55, 1.0)   # dark red at peak windup
# Visual telegraph: dark-red expanding ring (same Polygon2D-annulus
# trick as the heal pulse), scaled out from a small radius at the
# summoner across the windup so the player can read "summoner is
# about to spawn something HERE."
const SUMMON_RING_SEGMENTS: int = 28
const SUMMON_RING_WIDTH: float = 4.0
var _summoner_state: SummonerState = SummonerState.IDLE
var _summoner_timer: float = 0.0
var _summon_cooldown_timer: float = 0.0
var _summoned_minions: Array = []   # Array[WeakRef], pruned on cap check

func _tick_summoner(delta: float) -> void:
	var t: EnemyType = enemy_type
	if _hero == null or not is_instance_valid(_hero):
		velocity = Vector2.ZERO
		sprite.play(&"idle")
		return
	var to_hero: Vector2 = _hero.global_position - global_position
	var dist: float = to_hero.length()
	sprite.flip_h = to_hero.x < 0
	match _summoner_state:
		SummonerState.IDLE:
			_summoner_movement(to_hero, dist)
			# Tick cooldown and scan to summon. Only fire if we're
			# under the live-minion cap — pruning happens inside the
			# cap-count helper.
			if _summon_cooldown_timer > 0.0:
				_summon_cooldown_timer = max(0.0, _summon_cooldown_timer - delta)
			elif _live_minion_count() < SUMMONER_MAX_MINIONS:
				_summoner_state = SummonerState.WINDUP
				_summoner_timer = SUMMON_WINDUP
				sprite.play(&"attack")
				_spawn_summon_telegraph()
		SummonerState.WINDUP:
			velocity = Vector2.ZERO
			move_and_slide()
			# Dark-red tint ramps from 0 to peak across the windup.
			# Distinct from the healer's green tint so the player reads
			# "summoner is winding up" vs "healer is winding up".
			# Iter 70 — lerp from baseline so e.g. bone_summoner's authored
			# purple-red tint stays read through the ramp.
			var wt: float = 1.0 - (_summoner_timer / SUMMON_WINDUP)
			sprite.modulate = _baseline_modulate().lerp(SUMMONER_TINT_PEAK, wt)
			_summoner_timer -= delta
			if _summoner_timer <= 0.0:
				_summoner_state = SummonerState.SUMMON
		SummonerState.SUMMON:
			# One-frame state — fire the summons, then enter cooldown.
			_apply_summon()
			sprite.modulate = _baseline_modulate()
			_summoner_state = SummonerState.COOLDOWN
			_summon_cooldown_timer = SUMMON_COOLDOWN
		SummonerState.COOLDOWN:
			_summoner_movement(to_hero, dist)
			_summon_cooldown_timer = max(0.0, _summon_cooldown_timer - delta)
			if _summon_cooldown_timer <= 0.0:
				_summoner_state = SummonerState.IDLE
				_summon_cooldown_timer = SUMMON_INTERVAL - SUMMON_WINDUP - SUMMON_COOLDOWN

# Summoner kite movement. Same shape as _healer_movement but with the
# summoner's KEEP_DIST. Backs away if hero is closer than MIN_DIST,
# pulls in if past KEEP_DIST + 40 px, idles in the dead zone between.
func _summoner_movement(to_hero: Vector2, dist: float) -> void:
	var t: EnemyType = enemy_type
	if t.can_move() and dist < SUMMONER_MIN_DIST:
		velocity = -to_hero.normalized() * _effective_move_speed()
		sprite.play(&"walk")
		move_and_slide()
	elif t.can_move() and dist > SUMMON_KEEP_DIST + 40.0:
		velocity = to_hero.normalized() * _effective_move_speed() * 0.6
		sprite.play(&"walk")
		move_and_slide()
	else:
		velocity = Vector2.ZERO
		sprite.play(&"idle")

# Prune stale WeakRef entries from _summoned_minions and return the
# live count. Done lazily on each cap check so a dying minion's slot
# frees up on the next summoner tick rather than needing a connect-
# back from the minion.
func _live_minion_count() -> int:
	var alive: Array = []
	for w in _summoned_minions:
		if w == null:
			continue
		var ref: WeakRef = w
		var node: Object = ref.get_ref()
		if node == null:
			continue
		if not (node is Enemy):
			continue
		var e: Enemy = node
		if e._dying or not is_instance_valid(e):
			continue
		alive.append(w)
	_summoned_minions = alive
	return alive.size()

# Fire the summon request events. Spawns 1-2 minions at random
# positions inside SUMMON_RADIUS of the summoner, capped by remaining
# room under SUMMONER_MAX_MINIONS. Uses Events.enemy_summon_requested
# so main.gd's existing handler (originally added for boss phase
# summons) instantiates the enemies via ENEMY_TYPES — keeps this
# script free of the preload dict.
#
# We DEFERRED-connect each spawned Enemy's tree_entered so we can grab
# a reference and stash it in _summoned_minions for cap tracking.
# Since main.gd add_child's the new enemy synchronously, we instead
# match by querying the "enemies" group right after emission — the
# new spawn is the closest unowned enemy at the summon point.
func _apply_summon() -> void:
	var room: int = _live_minion_count()
	var slots: int = SUMMONER_MAX_MINIONS - room
	if slots <= 0:
		return
	var count: int = mini(slots, 1 + randi() % 2)   # 1 or 2 per summon
	for i in range(count):
		var ang: float = randf() * TAU
		var r: float = randf_range(SUMMON_RADIUS * 0.35, SUMMON_RADIUS)
		var spawn_pos: Vector2 = global_position + Vector2(cos(ang) * r, sin(ang) * r)
		# Spawn a small dark burst at each minion's spawn point so the
		# arrival reads on screen rather than just appearing.
		_spawn_summon_burst(spawn_pos)
		Events.enemy_summon_requested.emit(spawn_pos, SUMMONER_MINION_TYPE)
		# Track the newly-spawned minion. main.gd's handler runs
		# synchronously on the signal emit, so by this line the
		# minion is already in the "enemies" group at spawn_pos.
		# Find it by closest-to-spawn_pos (cheap: a wave is rarely
		# more than ~12 enemies) and stash its WeakRef.
		var best: Enemy = null
		var best_d: float = INF
		for node in get_tree().get_nodes_in_group("enemies"):
			if not (node is Enemy):
				continue
			var e: Enemy = node
			if e == self:
				continue
			var d: float = e.global_position.distance_to(spawn_pos)
			if d < best_d and d < 2.0:   # spawned exactly at spawn_pos
				best_d = d
				best = e
		if best != null:
			_summoned_minions.append(weakref(best))

# Spawn the windup telegraph ring at the summoner. Same Polygon2D
# annulus trick as _spawn_heal_pulse but in dark red and expanding
# in place (no drift toward a target). The ring grows from a small
# radius to ~outer_r across SUMMON_WINDUP, then queue_frees.
func _spawn_summon_telegraph() -> void:
	var parent: Node = get_parent()
	if parent == null:
		return
	var fx: Node2D = Node2D.new()
	fx.global_position = global_position
	fx.z_index = -1   # under the sprite so it reads as a ground FX
	parent.add_child(fx)
	var ring: Polygon2D = Polygon2D.new()
	var outer_r: float = 24.0
	var inner_r: float = max(0.5, outer_r - SUMMON_RING_WIDTH)
	var verts: PackedVector2Array = PackedVector2Array()
	for i in range(SUMMON_RING_SEGMENTS):
		var a: float = (TAU / float(SUMMON_RING_SEGMENTS)) * float(i)
		verts.append(Vector2(cos(a), sin(a)) * outer_r)
	for i in range(SUMMON_RING_SEGMENTS - 1, -1, -1):
		var a: float = (TAU / float(SUMMON_RING_SEGMENTS)) * float(i)
		verts.append(Vector2(cos(a), sin(a)) * inner_r)
	ring.polygon = verts
	ring.color = Color(0.85, 0.25, 0.30, 0.75)
	fx.add_child(ring)
	# Scale out across the windup; ending scale ~ SUMMON_RADIUS / outer_r
	# so the ring reaches the spawn-out radius at the moment summons fire.
	var final_scale: float = max(1.5, SUMMON_RADIUS / outer_r)
	fx.scale = Vector2(0.4, 0.4)
	var tw: Tween = fx.create_tween()
	tw.set_parallel(true)
	tw.tween_property(fx, "scale", Vector2(final_scale, final_scale), SUMMON_WINDUP) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(ring, "modulate:a", 0.0, SUMMON_WINDUP) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(fx.queue_free)

# Small dark burst at each minion spawn point. A scaling-out + fading
# dark-red circle so the moment of arrival reads on screen.
func _spawn_summon_burst(pos: Vector2) -> void:
	var parent: Node = get_parent()
	if parent == null:
		return
	var fx: Node2D = Node2D.new()
	fx.global_position = pos
	fx.z_index = -1
	parent.add_child(fx)
	var dot: Polygon2D = Polygon2D.new()
	var verts: PackedVector2Array = PackedVector2Array()
	var burst_r: float = 14.0
	var segments: int = 20
	for i in range(segments):
		var a: float = (TAU / float(segments)) * float(i)
		verts.append(Vector2(cos(a), sin(a)) * burst_r)
	dot.polygon = verts
	dot.color = Color(0.7, 0.2, 0.25, 0.85)
	fx.add_child(dot)
	var tw: Tween = fx.create_tween()
	tw.set_parallel(true)
	tw.tween_property(fx, "scale", Vector2(1.6, 1.6), 0.3) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(dot, "modulate:a", 0.0, 0.3) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(fx.queue_free)

# Iter 66 — test-only force-trigger for headless verification. Skips
# the windup/cooldown gating so a test can assert "summoner emits a
# spawn request" without simulating ~6 seconds of physics ticks.
func _force_summon_for_test() -> void:
	_apply_summon()

# ── Behavior: wraith ──────────────────────────────────────────────────
# Iter 68 — flanking melee phantom. Chases hero at high speed; when
# within WRAITH_PHASE_RANGE and the phase cooldown is clear, the wraith
# VANISHES (alpha 1.0 → 0.3, collision off) for WRAITH_PHASE_OUT_TIME,
# then reappears BEHIND the hero (offset opposite hero motion / facing)
# and lands a single flanking strike on the hero if still in reach.
#
# Counterplay: the wraith is invulnerable during PHASE_OUT/PHASE_IN
# (both alpha-faded + collision-disabled — sword swings whiff, projectiles
# pass through), but it's squishy in CHASE / STRIKE_RECOVERY (4 HP). So
# the player can punish a wraith that's already committed to its strike
# wind-down. The 4.5s interval keeps the phase from feeling spammy.
#
# State machine:
#   IDLE              — no hero in sight; sit at zero velocity. Transitions
#                       to CHASE the moment a hero ref exists.
#   CHASE             — pursue hero at WRAITH_CHASE_SPEED. When within
#                       WRAITH_PHASE_RANGE AND _wraith_cooldown_timer <= 0,
#                       transition to PHASE_OUT.
#   PHASE_OUT         — vanish window. Alpha tween 1.0 → 0.3, collision
#                       suppressed, vanish-mote burst spawned. After
#                       WRAITH_PHASE_OUT_TIME, teleport to behind-hero
#                       and transition to PHASE_IN.
#   PHASE_IN          — reappear window. Alpha tween 0.3 → 1.0, shimmer
#                       FX spawned at the new position. On expiry, swing
#                       at hero if within WRAITH_STRIKE_REACH.
#   STRIKE_RECOVERY   — 0.8s vulnerable pause. Normal speed + alpha;
#                       lets the player punish a missed flank.
enum WraithState { IDLE, CHASE, PHASE_OUT, PHASE_IN, STRIKE_RECOVERY }
const WRAITH_CHASE_SPEED: float = 130.0
const WRAITH_PHASE_INTERVAL: float = 4.5
const WRAITH_PHASE_RANGE: float = 220.0
const WRAITH_PHASE_OUT_TIME: float = 0.35
const WRAITH_PHASE_IN_TIME: float = 0.18
const WRAITH_REAPPEAR_OFFSET: float = 40.0
const WRAITH_STRIKE_DAMAGE: int = 2
const WRAITH_STRIKE_REACH: float = 36.0
const WRAITH_STRIKE_RECOVERY_TIME: float = 0.8
const WRAITH_INVULN_DURING_PHASE: bool = true
# Alpha targets for the phase fade. Not fully transparent so the player
# can still TRACK the wraith during PHASE_OUT (anti-frustration — the
# vanish reads as "ghostly", not "off-screen").
const WRAITH_PHASE_ALPHA: float = 0.3
# Vanish-mote burst — small purple/black motes scattered around the
# wraith's PHASE_OUT origin so the disappearance reads on-screen.
const WRAITH_PHASE_FX_SCENE: PackedScene = preload("res://scenes/fx/wraith_phase_in.tscn")
var _wraith_state: WraithState = WraithState.IDLE
var _wraith_timer: float = 0.0
var _wraith_cooldown_timer: float = 0.0
# Saved collision layer/mask during PHASE_OUT/PHASE_IN so we can restore
# the wraith's normal collision profile when it reappears. Stashed via
# the CharacterBody2D collision_layer/collision_mask read; the body
# starts non-colliding at PHASE_OUT and stays so until STRIKE_RECOVERY.
var _wraith_saved_layer: int = 0
var _wraith_saved_mask: int = 0

func _tick_wraith(delta: float) -> void:
	if _hero == null or not is_instance_valid(_hero):
		velocity = Vector2.ZERO
		sprite.play(&"idle")
		return
	var to_hero: Vector2 = _hero.global_position - global_position
	var dist: float = to_hero.length()
	# Don't flip the sprite during the phase windows — it'd flicker as the
	# wraith teleports across the hero. Only update facing on grounded
	# states (CHASE / STRIKE_RECOVERY).
	match _wraith_state:
		WraithState.IDLE:
			velocity = Vector2.ZERO
			sprite.play(&"idle")
			# Once the hero ref is present (set at _ready), there's no real
			# "idle" — drop straight to CHASE so the wraith engages.
			_wraith_state = WraithState.CHASE
		WraithState.CHASE:
			sprite.flip_h = to_hero.x < 0
			if dist > 1.0:
				velocity = to_hero.normalized() * (WRAITH_CHASE_SPEED * _slow_multiplier)
				sprite.play(&"walk")
			else:
				velocity = Vector2.ZERO
				sprite.play(&"idle")
			move_and_slide()
			# Tick phase cooldown and check for trigger conditions.
			if _wraith_cooldown_timer > 0.0:
				_wraith_cooldown_timer = max(0.0, _wraith_cooldown_timer - delta)
			elif dist <= WRAITH_PHASE_RANGE:
				_enter_wraith_phase_out()
		WraithState.PHASE_OUT:
			velocity = Vector2.ZERO
			# Don't move during phase-out — the wraith is dissolving in
			# place; teleport happens at the end of the window.
			_wraith_timer -= delta
			# Sprite stays on the last walk frame; alpha-tween is handled
			# at PHASE_OUT entry. Nothing tick-driven here beyond the timer.
			if _wraith_timer <= 0.0:
				_perform_wraith_teleport()
		WraithState.PHASE_IN:
			velocity = Vector2.ZERO
			_wraith_timer -= delta
			if _wraith_timer <= 0.0:
				_apply_wraith_strike()
				_enter_wraith_strike_recovery()
		WraithState.STRIKE_RECOVERY:
			sprite.flip_h = to_hero.x < 0
			velocity = Vector2.ZERO
			sprite.play(&"idle")
			_wraith_timer -= delta
			if _wraith_timer <= 0.0:
				_wraith_state = WraithState.CHASE
				_wraith_cooldown_timer = WRAITH_PHASE_INTERVAL

# Enter PHASE_OUT: stash collision profile, suppress collisions, start
# the alpha tween, spawn the vanish-mote burst. The teleport itself
# happens at the END of the timer in _perform_wraith_teleport.
func _enter_wraith_phase_out() -> void:
	_wraith_state = WraithState.PHASE_OUT
	_wraith_timer = WRAITH_PHASE_OUT_TIME
	# Stash + clear collision so sword swings whiff and projectiles pass
	# through. The body still exists; it just isn't on any layer.
	if WRAITH_INVULN_DURING_PHASE:
		_wraith_saved_layer = collision_layer
		_wraith_saved_mask = collision_mask
		collision_layer = 0
		collision_mask = 0
	# Alpha tween — full opacity to ghostly. Tween locks to PHASE_OUT_TIME
	# so it lands the moment the teleport fires.
	# Iter 70 — tween TARGET preserves the type's baseline RGB tint (e.g.
	# rogue_wraith's violet) and only drops alpha to WRAITH_PHASE_ALPHA.
	# Was hardcoded Color(1,1,1,a) which would have snapped a violet
	# wraith to neutral white mid-phase.
	if sprite != null:
		var base_phase: Color = _baseline_modulate()
		var phase_color: Color = Color(base_phase.r, base_phase.g, base_phase.b, WRAITH_PHASE_ALPHA)
		var tw: Tween = create_tween()
		tw.tween_property(
			sprite,
			"modulate",
			phase_color,
			WRAITH_PHASE_OUT_TIME,
		).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	# Vanish-mote burst at the disappearance point — small purple/black
	# Polygon2D specks scattered around the wraith.
	_spawn_wraith_vanish_motes(global_position)

# Compute the BEHIND-HERO target and teleport. "Behind" is determined by
# hero motion direction when moving, falling back to the hero→wraith
# vector inverted when idle (i.e. teleport to opposite side of where the
# wraith currently is — preserves flank fantasy even when the hero
# stands still).
func _perform_wraith_teleport() -> void:
	if _hero == null or not is_instance_valid(_hero):
		_enter_wraith_strike_recovery()
		return
	var hero_pos: Vector2 = _hero.global_position
	var hero_forward: Vector2 = Vector2.ZERO
	# Prefer hero velocity (last-frame motion) — if the hero is running,
	# "behind" is opposite their movement. CharacterBody2D.velocity is
	# public so we can read it without poking into private fields. The
	# `in` check defends against a future hero-class refactor that might
	# move velocity off the CharacterBody2D path.
	if "velocity" in _hero:
		var hv: Vector2 = _hero.velocity
		if hv.length_squared() > 1.0:
			hero_forward = hv.normalized()
	# Fallback: if the hero is stationary, use the wraith→hero vector as
	# "forward" (so the wraith reappears on the OPPOSITE side of the hero
	# from where it started — still a flank, just along the LOS axis).
	if hero_forward == Vector2.ZERO:
		var from_wraith: Vector2 = hero_pos - global_position
		if from_wraith.length_squared() > 1.0:
			hero_forward = from_wraith.normalized()
		else:
			# Truly degenerate (wraith on top of hero) — just pick right.
			hero_forward = Vector2.RIGHT
	# Teleport BEHIND hero = hero_pos minus hero_forward × offset.
	global_position = hero_pos - hero_forward * WRAITH_REAPPEAR_OFFSET
	# Face the hero on reappearance so the strike telegraph reads natural.
	sprite.flip_h = (hero_pos.x - global_position.x) < 0
	_enter_wraith_phase_in()

# Enter PHASE_IN: start the reappear alpha tween, spawn the shimmer FX.
# Collision STAYS off through this window — the wraith is still phasing.
func _enter_wraith_phase_in() -> void:
	_wraith_state = WraithState.PHASE_IN
	_wraith_timer = WRAITH_PHASE_IN_TIME
	if sprite != null:
		var tw: Tween = create_tween()
		tw.tween_property(
			sprite,
			"modulate",
			Color(1, 1, 1, 1),
			WRAITH_PHASE_IN_TIME,
		).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	# Spawn the shimmer-in FX at the new position. This is the visual
	# read for the player: "wraith appears HERE — dodge NOW."
	_spawn_wraith_phase_in_fx(global_position)

# Apply the flanking strike. Damage lands only if the hero is within
# WRAITH_STRIKE_REACH at the moment of expiry, so a panicked hero who
# rolled away during PHASE_IN escapes the swing.
func _apply_wraith_strike() -> void:
	if _hero == null or not is_instance_valid(_hero):
		return
	var d: float = _hero.global_position.distance_to(global_position)
	if d <= WRAITH_STRIKE_REACH and _hero.has_method("take_damage"):
		# iter-70 polish: knockback away from where the wraith reappeared
		# (its post-teleport global_position). Sells the "I got flanked"
		# moment visually — hero gets shoved forward, AWAY from the wraith
		# behind them.
		_hero.take_damage(WRAITH_STRIKE_DAMAGE, global_position)
		# iter-103: wraith strike applies the affix on-hit.
		_apply_contact_affix()
		# Brief attack pose so the swing reads even if the player wasn't
		# looking at the wraith mid-teleport.
		if sprite != null and sprite.sprite_frames != null \
				and sprite.sprite_frames.has_animation(&"attack"):
			sprite.play(&"attack")

# Enter STRIKE_RECOVERY: restore collision profile, settle to full alpha,
# arm the next phase via WRAITH_PHASE_INTERVAL when the timer expires.
func _enter_wraith_strike_recovery() -> void:
	_wraith_state = WraithState.STRIKE_RECOVERY
	_wraith_timer = WRAITH_STRIKE_RECOVERY_TIME
	# Restore collision so the player can punish the recovery window.
	if WRAITH_INVULN_DURING_PHASE:
		collision_layer = _wraith_saved_layer if _wraith_saved_layer != 0 else 4
		collision_mask = _wraith_saved_mask if _wraith_saved_mask != 0 else 1
	if sprite != null:
		# Iter 70 — restore to the type's baseline modulate (was hardcoded
		# white), so e.g. rogue_wraith's violet tint persists after phase.
		sprite.modulate = _baseline_modulate()

# Vanish-mote burst — 5 small purple/black Polygon2D specks scattered
# around the disappearance point, drifting outward and fading. Same
# self-tween+queue_free pattern the summoner uses.
func _spawn_wraith_vanish_motes(pos: Vector2) -> void:
	var parent: Node = get_parent()
	if parent == null:
		return
	var mote_count: int = 5
	for i in range(mote_count):
		var ang: float = (TAU / float(mote_count)) * float(i) + randf_range(-0.3, 0.3)
		var mote: Node2D = Node2D.new()
		mote.global_position = pos + Vector2(cos(ang), sin(ang)) * 4.0
		mote.z_index = -1
		parent.add_child(mote)
		var poly: Polygon2D = Polygon2D.new()
		var verts: PackedVector2Array = PackedVector2Array()
		var r: float = 3.0
		var segments: int = 8
		for j in range(segments):
			var a: float = (TAU / float(segments)) * float(j)
			verts.append(Vector2(cos(a), sin(a)) * r)
		poly.polygon = verts
		# Deep purple-black — distinct from the summoner's dark red and
		# the healer's green. Wraith owns the "shadow / phase" color.
		poly.color = Color(0.30, 0.18, 0.45, 0.90)
		mote.add_child(poly)
		var drift: Vector2 = Vector2(cos(ang), sin(ang)) * 22.0
		var tw: Tween = mote.create_tween()
		tw.set_parallel(true)
		tw.tween_property(mote, "global_position", mote.global_position + drift, 0.28) \
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tw.tween_property(poly, "modulate:a", 0.0, 0.28) \
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tw.chain().tween_callback(mote.queue_free)

# Instantiate the wraith_phase_in shimmer scene at the reappear point.
# Falls back to a code-built burst if the scene resource isn't available
# (defensive — keeps the gameplay loop working even if the .tscn is
# missing on a partial sync).
func _spawn_wraith_phase_in_fx(pos: Vector2) -> void:
	var parent: Node = get_parent()
	if parent == null:
		return
	if WRAITH_PHASE_FX_SCENE == null:
		_spawn_wraith_vanish_motes(pos)
		return
	var fx: Node2D = WRAITH_PHASE_FX_SCENE.instantiate()
	fx.global_position = pos
	parent.add_child(fx)

# Iter 68 — test-only force-trigger for headless verification. Skips the
# CHASE → PHASE_OUT cooldown gating so a test can assert "phase strikes
# the hero" without simulating 4.5+ seconds of physics ticks.
func _force_wraith_phase_for_test() -> void:
	_enter_wraith_phase_out()

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
			# Iter 70 — channel the red pulse THROUGH the baseline tint so
			# tinted enemies keep their identity color underneath the
			# windup signal (multiplicative: baseline.r * 1, baseline.g/b
			# fade darker per wt).
			var wt: float = 1.0 - (_melee_timer / t.melee_windup)
			var base: Color = _baseline_modulate()
			sprite.modulate = Color(base.r, base.g * (1.0 - wt * 0.6), base.b * (1.0 - wt * 0.6), base.a)
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
					# iter-70 polish: knockback away from the attacker.
					_hero.take_damage(t.melee_damage, global_position)
					# iter-103: telegraphed-melee swing applies the affix.
					_apply_contact_affix()
		MeleeState.SWING:
			velocity = Vector2.ZERO
			_melee_timer -= delta
			if _melee_timer <= 0.0:
				_melee_state = MeleeState.COOLDOWN
				_melee_timer = t.melee_cooldown - t.melee_swing
				sprite.modulate = _baseline_modulate()
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
			# Iter 70 — channel through the baseline so tinted ranged
			# enemies (none right now, but future-proof) keep identity.
			var wt: float = 1.0 - (_cast_timer / t.cast_windup)
			var base: Color = _baseline_modulate()
			sprite.modulate = Color(base.r * (1.0 - wt * 0.5), base.g, base.b, base.a)
			_cast_timer -= delta
			if _cast_timer <= 0.0:
				_fire_projectile()
				# Return straight to IDLE with the cooldown timer set;
				# IDLE's else-branch drains it before next cast is armed.
				_cast_state = CastState.IDLE
				_cast_timer = t.cast_cooldown
				sprite.modulate = _baseline_modulate()

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
	# iter-103: WARDED elite affix clamps incoming damage by -1, min 1.
	# Floor of 1 so a player with all 1-damage attacks isn't fully shut
	# out (would invalidate the entire common-tier slash). Clamp BEFORE
	# the hp subtract so the damage number floater shows the clamped
	# value the player actually dealt.
	if elite_affix == "warded":
		damage = maxi(1, damage - ELITE_WARDED_DR)
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
	# iter-81 (Workstream A): tiered hit feedback. damage / max_hp ratio
	# picks a tier (nick/solid/heavy/crushing) and fires shake + extra
	# sparks scaled to it. Replaces the previous uniform FX.shake(4,
	# 0.06) which fired the SAME shake on a 1-dmg nick of a boss as on
	# a 200-dmg crushing crit. fx.gd's _on_enemy_hit still spawns the
	# baseline hit_spark; this adds tier-specific extras on top + the
	# tier-scaled shake.
	AttackFeel.apply_hit_feedback_tier(self, damage, {"is_crit": is_crit})
	# Iter 53 — audio sparkle for crit hits. Layered on top of the
	# enemy_hit "thud" so the crit feedback hits both visually (yellow
	# damage number) and audibly (rising sparkle chime).
	if is_crit:
		Events.enemy_crit_hit.emit(global_position)
	# Iter 37 — phase transition check. Only triggers when:
	#   - we're still in phase N
	#   - enemy_type declares phaseN_overrides (non-empty)
	#   - phaseN_hp_threshold > 0 (kill-switch respect)
	#   - current hp is at or below threshold
	#   - hit didn't drop hp to 0 (avoid firing during death frame)
	# Done BEFORE the death check so an enemy can't "skip" a phase by
	# being burst from 100% to 0%. Iter 55 — extended to phase 3.
	# Phase 3 can fire on the SAME hit as phase 2 (e.g. a massive crit
	# drops hp from 100% to 20%) — checked after phase 2 transition so
	# the ratio sees the post-mutation max_hp (though max_hp is rarely
	# changed by phase overrides, the order is defensive).
	if hp > 0 and _phase == 1 and enemy_type != null:
		var thr2: float = enemy_type.phase2_hp_threshold
		if thr2 > 0.0 and not enemy_type.phase2_overrides.is_empty():
			var ratio: float = float(hp) / float(maxi(1, enemy_type.max_hp))
			if ratio <= thr2:
				_trigger_phase_2()
	if hp > 0 and _phase == 2 and enemy_type != null:
		var thr3: float = enemy_type.phase3_hp_threshold
		if thr3 > 0.0 and not enemy_type.phase3_overrides.is_empty():
			var ratio: float = float(hp) / float(maxi(1, enemy_type.max_hp))
			if ratio <= thr3:
				_trigger_phase_3()
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
	# Iter 55 — phase-2 summon. If the EnemyType configured adds for
	# this phase, fire N enemy_summon_requested events; main.gd
	# subscribes and instantiates them via its existing _spawn_enemy_type
	# pathway. Decouples the spawn from this script (which doesn't
	# know about ENEMY_TYPES preload).
	_request_phase_summons(enemy_type.phase2_summon_type, enemy_type.phase2_summon_count)
	phase_changed.emit(2)

# Iter 55 — boss phase 3. Same architecture as phase 2: duplicates the
# enemy_type, applies phase3_overrides on the local copy, fires red
# tint flash, emits boss_phase_3 + phase_changed(3), fires summons if
# configured. Idempotent via _phase >= 3 guard in take_hit.
func _trigger_phase_3() -> void:
	_phase = 3
	var local: EnemyType = enemy_type.duplicate() as EnemyType
	var overrides: Dictionary = local.phase3_overrides
	for key in overrides:
		if key in local:
			local.set(key, overrides[key])
	enemy_type = local
	# Visual: brighter / hotter red than phase 2 — desperation state.
	if sprite != null:
		var t: Tween = create_tween()
		t.tween_property(sprite, "modulate", Color(3.2, 0.5, 0.3, 1), 0.10)
		t.tween_property(sprite, "modulate", Color(1, 1, 1, 1), 0.50)
	if enemy_type.is_boss:
		Events.boss_phase_3.emit(global_position)
	_request_phase_summons(enemy_type.phase3_summon_type, enemy_type.phase3_summon_count)
	phase_changed.emit(3)

# Iter 55 — emit N summon requests for the specified type. main.gd
# listens to Events.enemy_summon_requested and instantiates. Spawn
# positions are picked here as offsets from the boss so they appear
# in a ring around her — telegraphs "she called for help" visually.
func _request_phase_summons(type_id: String, count: int) -> void:
	if type_id == "" or count <= 0:
		return
	for i in range(count):
		var ang: float = (TAU / float(count)) * float(i) + randf_range(-0.4, 0.4)
		var dist: float = randf_range(80.0, 112.0)
		var spawn_pos: Vector2 = global_position + Vector2(cos(ang) * dist, sin(ang) * dist)
		Events.enemy_summon_requested.emit(spawn_pos, type_id)

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
		# Iter 70 — restore baseline so a tinted enemy (e.g. spectral_priest
		# green, rogue_wraith violet) keeps its identity color through the
		# death anim. Was hardcoded white, which made a green priest snap
		# to a regular-priest white corpse — visually jarring.
		sprite.modulate = _baseline_modulate()
		if sprite.sprite_frames != null and sprite.sprite_frames.has_animation(&"death"):
			sprite.play(&"death")
	set_collision_layer_value(3, false)
	set_collision_mask_value(2, false)
	# iter-103: EMBER elite affix — death explosion. Spawns a small AoE
	# at the impact location, dealing damage to the hero if within
	# ELITE_EMBER_RADIUS. Reuses the hero's distance-check pattern;
	# does NOT damage other enemies (focused on hero threat). Routed
	# through the hero's take_damage so iframes / DR mods still apply.
	if elite_affix == "ember" and _hero != null and is_instance_valid(_hero):
		var d_hero: float = _hero.global_position.distance_to(global_position)
		if d_hero <= ELITE_EMBER_RADIUS and _hero.has_method("take_damage"):
			_hero.take_damage(ELITE_EMBER_DAMAGE, global_position)
	died_at.emit(global_position)
	Events.enemy_died.emit(global_position)

# ── Behavior: glyph_warden ────────────────────────────────────────────
# Iter 72 — conjurer / trap-layer. Kites the hero at WARDEN_KEEP_DIST
# (same shape as healer/summoner movement) and on a GLYPH_INTERVAL cycle
# plants a STATIONARY glyph hazard at the warden's OWN feet. The glyph
# arms 0.6s after placement (visible pulsing rune mark), then sits as
# floor damage for up to GLYPH_LIFETIME seconds — if the hero steps in
# the glyph's radius while armed, it detonates for GLYPH_DAMAGE + a
# brief slow, then despawns. Crucially, glyphs OUTLIVE their warden:
# kill the warden, the planted glyphs keep ticking. Forces the player to
# remember "the warden was standing HERE three seconds ago" and avoid
# that ground while focusing other threats.
#
# Why this is novel vs the existing 19-strong roster:
#   - chase_contact / charge / bomber all run AT you; they don't poison
#     the floor.
#   - healer / summoner / wraith are all centered on themselves or other
#     enemies — they don't change the SPATIAL game.
#   - existing hazards (spike_pit, fire_jet, lightning_rod) are STATIC
#     room features placed at design time. The glyph warden adds the
#     first ENEMY-AUTHORED dynamic hazard — every fight against a
#     warden produces a different floor pattern.
#
# State machine (mirrors healer/summoner shape):
#   IDLE       — kite at WARDEN_KEEP_DIST; tick _glyph_cooldown_timer.
#                When timer <=0 transition to WINDUP.
#   WINDUP     — GLYPH_WINDUP seconds. Locked in place. Gold-eye tint
#                ramps on the sprite + a small spinning rune mark
#                grows on the ground at the warden's feet. The mark
#                is the placement telegraph: it tells the player
#                "a glyph is going to live HERE."
#   PLACE      — one-frame: instantiate the glyph_trap scene at the
#                warden's current global_position. Hand off ownership
#                to the room parent so the glyph outlives the warden.
#   COOLDOWN   — kite as in IDLE but skip the scan; drain timer; back
#                to IDLE when 0.
#
# Telegraph stack:
#   1. Gold-yellow sprite tint ramping during WINDUP — same convention
#      as healer green / summoner dark-red / wraith violet.
#   2. Spinning rune mark drawn on the ground UNDER the warden during
#      WINDUP. Reads as "a glyph is being inscribed HERE." Spawned at
#      WINDUP entry; tween scales + fades it to its final size as the
#      windup elapses.
#   3. The placed glyph itself ARMS over 0.6s — its inner ring pulses
#      from amber to bright red as it transitions from disarmed (safe)
#      to armed (hot). The player has a ~0.6s window after the warden
#      lifts the glyph to escape its radius.
enum WardenState { IDLE, WINDUP, PLACE, COOLDOWN }
const GLYPH_INTERVAL: float = 3.5
const GLYPH_WINDUP: float = 0.7
const GLYPH_COOLDOWN: float = 0.6
const WARDEN_KEEP_DIST: float = 220.0
const WARDEN_MIN_DIST: float = 180.0
const WARDEN_TINT_PEAK: Color = Color(1.55, 1.30, 0.55, 1.0)   # gold/amber rune light
const GLYPH_TRAP_SCENE: PackedScene = preload("res://scenes/fx/glyph_trap.tscn")
# Inscription mark — small spinning rune drawn UNDER the warden during
# WINDUP so the player can read "the warden is laying a glyph HERE." A
# stylized 6-pointed star (two interlocked triangles) inscribed in a
# faint circle. Code-built like the healer's pulse ring; one Polygon2D
# per triangle plus an outline Polygon2D for the circle.
const INSCRIPTION_MARK_COLOR: Color = Color(1.0, 0.78, 0.30, 0.85)
const INSCRIPTION_MARK_RADIUS: float = 22.0
var _warden_state: WardenState = WardenState.IDLE
var _warden_timer: float = 0.0
var _glyph_cooldown_timer: float = 0.0
# WeakRef to the inscription-mark FX so we can spin it during WINDUP
# without leaking a strong reference (the FX self-frees on PLACE or
# state-abort via its own tween chain).
var _warden_inscription_ref: WeakRef = null

func _tick_glyph_warden(delta: float) -> void:
	if _hero == null or not is_instance_valid(_hero):
		velocity = Vector2.ZERO
		sprite.play(&"idle")
		return
	var to_hero: Vector2 = _hero.global_position - global_position
	var dist: float = to_hero.length()
	sprite.flip_h = to_hero.x < 0
	match _warden_state:
		WardenState.IDLE:
			_warden_movement(to_hero, dist)
			if _glyph_cooldown_timer > 0.0:
				_glyph_cooldown_timer = max(0.0, _glyph_cooldown_timer - delta)
			else:
				_warden_state = WardenState.WINDUP
				_warden_timer = GLYPH_WINDUP
				sprite.play(&"attack")
				_spawn_inscription_mark()
		WardenState.WINDUP:
			velocity = Vector2.ZERO
			move_and_slide()
			# Gold-eye tint ramps from baseline to WARDEN_TINT_PEAK so the
			# player reads "warden is winding up a glyph." Same iter-70
			# baseline-aware lerp pattern as healer/summoner so tinted
			# warden variants stay distinguishable through the ramp.
			var wt: float = 1.0 - (_warden_timer / GLYPH_WINDUP)
			sprite.modulate = _baseline_modulate().lerp(WARDEN_TINT_PEAK, wt)
			# Spin the inscription mark if still alive (it self-frees on
			# PLACE or abort). The rotation speed scales with windup
			# progress so the rune visibly accelerates toward placement.
			_spin_inscription_mark(delta, wt)
			_warden_timer -= delta
			if _warden_timer <= 0.0:
				_warden_state = WardenState.PLACE
		WardenState.PLACE:
			# One-frame state — plant the glyph + transition to cooldown.
			_apply_glyph_place()
			sprite.modulate = _baseline_modulate()
			_warden_state = WardenState.COOLDOWN
			_glyph_cooldown_timer = GLYPH_COOLDOWN
		WardenState.COOLDOWN:
			_warden_movement(to_hero, dist)
			_glyph_cooldown_timer = max(0.0, _glyph_cooldown_timer - delta)
			if _glyph_cooldown_timer <= 0.0:
				_warden_state = WardenState.IDLE
				# Re-arm the long interval — subtract windup + cooldown
				# already spent so the visible "next glyph in N seconds"
				# beat reads as a steady cycle, not GLYPH_INTERVAL after
				# the COOLDOWN exits.
				_glyph_cooldown_timer = max(0.0, GLYPH_INTERVAL - GLYPH_WINDUP - GLYPH_COOLDOWN)

# Warden kite movement. Same shape as _healer_movement / _summoner_movement
# but with WARDEN_KEEP_DIST. Backs away if hero is closer than MIN_DIST,
# pulls in if past KEEP_DIST + 40 px, idles in the dead zone between.
func _warden_movement(to_hero: Vector2, dist: float) -> void:
	var t: EnemyType = enemy_type
	if t.can_move() and dist < WARDEN_MIN_DIST:
		velocity = -to_hero.normalized() * _effective_move_speed()
		sprite.play(&"walk")
		move_and_slide()
	elif t.can_move() and dist > WARDEN_KEEP_DIST + 40.0:
		velocity = to_hero.normalized() * _effective_move_speed() * 0.6
		sprite.play(&"walk")
		move_and_slide()
	else:
		velocity = Vector2.ZERO
		sprite.play(&"idle")

# Plant the glyph hazard at the warden's CURRENT feet position. The
# trap.tscn is added to the WARDEN's parent (the room), NOT as a child
# of the warden — so the glyph outlives the warden. This is the design
# centerpiece: killing the warden does NOT clear its previously-laid
# traps, forcing the player to navigate around its legacy.
func _apply_glyph_place() -> void:
	var parent: Node = get_parent()
	if parent == null:
		return
	if GLYPH_TRAP_SCENE == null:
		return
	var trap: Node2D = GLYPH_TRAP_SCENE.instantiate()
	trap.global_position = global_position
	parent.add_child(trap)
	# Free the inscription mark — the glyph itself is now visible at
	# the same spot, so the mark would just be visual noise on top of
	# the new trap.
	if _warden_inscription_ref != null:
		var node: Object = _warden_inscription_ref.get_ref()
		if node != null and node is Node2D and is_instance_valid(node):
			(node as Node2D).queue_free()
		_warden_inscription_ref = null

# Build the inscription-mark FX at the warden's feet. A code-built
# 6-pointed star (two overlapping triangles) inside a faint circle,
# initially scaled small and faded; tween scales it up across WINDUP
# and ramps alpha to peak so it READS as "rune being drawn." On
# PLACE / abort the mark is queue_freed in _apply_glyph_place; on
# state-abort (warden interrupted by knockback / death) the mark
# self-frees via a safety SceneTreeTimer.
func _spawn_inscription_mark() -> void:
	var parent: Node = get_parent()
	if parent == null:
		return
	var fx: Node2D = Node2D.new()
	fx.global_position = global_position
	fx.z_index = -1
	parent.add_child(fx)
	# Outer faint circle so the star reads as inscribed.
	var ring: Polygon2D = Polygon2D.new()
	var ring_segments: int = 24
	var outer_r: float = INSCRIPTION_MARK_RADIUS
	var inner_r: float = max(0.5, outer_r - 1.4)
	var verts: PackedVector2Array = PackedVector2Array()
	for i in range(ring_segments):
		var a: float = (TAU / float(ring_segments)) * float(i)
		verts.append(Vector2(cos(a), sin(a)) * outer_r)
	for i in range(ring_segments - 1, -1, -1):
		var a: float = (TAU / float(ring_segments)) * float(i)
		verts.append(Vector2(cos(a), sin(a)) * inner_r)
	ring.polygon = verts
	ring.color = Color(INSCRIPTION_MARK_COLOR.r, INSCRIPTION_MARK_COLOR.g, INSCRIPTION_MARK_COLOR.b, 0.55)
	fx.add_child(ring)
	# Two interlocking triangles → 6-pointed star. Triangle A points up,
	# triangle B points down; together they form the rune.
	var star_r: float = INSCRIPTION_MARK_RADIUS * 0.78
	var tri_a: Polygon2D = Polygon2D.new()
	tri_a.polygon = PackedVector2Array([
		Vector2(cos(-PI/2.0), sin(-PI/2.0)) * star_r,
		Vector2(cos(-PI/2.0 + TAU/3.0), sin(-PI/2.0 + TAU/3.0)) * star_r,
		Vector2(cos(-PI/2.0 + 2.0 * TAU/3.0), sin(-PI/2.0 + 2.0 * TAU/3.0)) * star_r,
	])
	tri_a.color = INSCRIPTION_MARK_COLOR
	fx.add_child(tri_a)
	var tri_b: Polygon2D = Polygon2D.new()
	tri_b.polygon = PackedVector2Array([
		Vector2(cos(PI/2.0), sin(PI/2.0)) * star_r,
		Vector2(cos(PI/2.0 + TAU/3.0), sin(PI/2.0 + TAU/3.0)) * star_r,
		Vector2(cos(PI/2.0 + 2.0 * TAU/3.0), sin(PI/2.0 + 2.0 * TAU/3.0)) * star_r,
	])
	tri_b.color = INSCRIPTION_MARK_COLOR
	fx.add_child(tri_b)
	# Start small + faded, tween up to full scale + alpha across windup.
	fx.scale = Vector2(0.35, 0.35)
	fx.modulate.a = 0.45
	var tw: Tween = fx.create_tween()
	tw.set_parallel(true)
	tw.tween_property(fx, "scale", Vector2(1.0, 1.0), GLYPH_WINDUP) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(fx, "modulate:a", 1.0, GLYPH_WINDUP) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	_warden_inscription_ref = weakref(fx)
	# Safety reap — if the warden dies mid-windup the PLACE branch never
	# runs, so the mark needs to self-free. Free after WINDUP + a small
	# guard window; the PLACE branch frees it earlier on the normal path.
	var safety: SceneTreeTimer = get_tree().create_timer(GLYPH_WINDUP + 0.4)
	safety.timeout.connect(func():
		if _warden_inscription_ref == null:
			return
		var node: Object = _warden_inscription_ref.get_ref()
		if node != null and node is Node2D and is_instance_valid(node):
			(node as Node2D).queue_free()
		_warden_inscription_ref = null
	)

# Spin the inscription-mark during WINDUP. Rotation speed scales with
# windup-progress so the rune visibly ACCELERATES into placement —
# reads as "the warden is finishing the spell."
func _spin_inscription_mark(delta: float, wt: float) -> void:
	if _warden_inscription_ref == null:
		return
	var node: Object = _warden_inscription_ref.get_ref()
	if node == null or not (node is Node2D) or not is_instance_valid(node):
		return
	var n: Node2D = node
	# Base spin = 1.5 rad/s; ramps to 5.0 rad/s at peak windup.
	var spin: float = lerp(1.5, 5.0, wt)
	n.rotation += spin * delta

# Iter 72 — test-only force-trigger for headless verification. Skips
# the windup/cooldown gating so a test can assert "calling this plants
# a glyph trap" without simulating ~4 seconds of physics_process ticks.
# Production AI always goes through IDLE → WINDUP → PLACE → COOLDOWN.
func _force_glyph_place_for_test() -> void:
	_apply_glyph_place()
