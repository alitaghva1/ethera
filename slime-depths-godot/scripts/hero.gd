# Hero — CharacterBody2D with WASD movement, mouse-aimed sword attack,
# and a Space-key dodge roll.
#
# Iteration 2 additions vs the original slice:
#   • DODGE: Space key triggers a brief dash in input direction (or
#     facing direction if no input) with iframes. Mirrors slime-depths'
#     dodge from src/hero.js — short window + cooldown + visual flash.
#   • Hit-stop hook: hero emits `hit_received` so the main scene can
#     freeze Engine.time_scale briefly for impact feel.
#   • Iframes during the dodge AND after taking damage (so you can't
#     get juggled by a stack of slimes touching you simultaneously).
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

# Blast spell (Iter 3) — RMB ranged projectile. Base damage 1, +1 per
# arcane_pulse relic owned. Slightly longer cooldown than the sword so
# the player can't just spam projectiles from safety.
const BLAST_COOLDOWN     := 0.55
const PROJECTILE_SCENE   = preload("res://scenes/projectile.tscn")

# Shield (Iter 5) — Q-held stamina stance. Forces iframes each tick while
# active so existing damage handling stays untouched, then breaks when
# the meter empties. Break cooldown prevents shield-mash from chaining.
const SHIELD_STAMINA_MAX := 100.0
const SHIELD_DRAIN       := 60.0      # per second while held
const SHIELD_RECOVER     := 25.0      # per second while released
const SHIELD_BREAK_CD    := 0.5
const SHIELD_TINT        := Color(0.7, 0.85, 1, 1)

# Dash Strike (Iter 5) — Shift burst toward the cursor that lands an AoE
# hit at the end of the dash. Short window + 1.2s cooldown make it a
# committed engage tool, not a free reposition.
const DASH_STRIKE_SPEED    := 600.0
const DASH_STRIKE_DURATION := 0.18
const DASH_STRIKE_COOLDOWN := 1.2
const DASH_STRIKE_RADIUS   := 50.0

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D

var hp: int = MAX_HP
var _attack_cd := 0.0
var _attack_live := 0.0
var _attack_aim := Vector2.RIGHT
var _is_attacking := false
var _facing_west := false

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

signal hp_changed(new_hp: int)
signal hero_died
signal hit_received       # for camera shake + hit-stop in main.gd
signal dodge_started

func _ready() -> void:
	sprite.play("idle")
	add_to_group("hero")
	# Stoneheart / Heart of Stone relic — extra HP at spawn. Read once;
	# live mid-run changes would require a more sophisticated stat
	# system (out of scope for the slice — hp only changes via pedestal
	# claims between scenes).
	# Explicit `: int` — GameState is an autoload without class_name,
	# so the parser can't statically resolve modifier_total's int return
	# type. := would infer Variant and trip strict-mode parse error.
	var hp_bonus: int = GameState.modifier_total("max_hp_bonus", 0)
	hp = MAX_HP + hp_bonus
	# HP carryover between rooms in a multi-room dungeon. Floor's
	# start_floor / end_floor reset persisted_hp to -1 so new runs +
	# hamlet returns always start fresh.
	if GameState.persisted_hp > 0:
		hp = min(GameState.persisted_hp, MAX_HP + hp_bonus)
	# Save HP on scene exit so the next room reads our current state
	# instead of full-healing the player on every transition.
	tree_exiting.connect(_save_persistent_state)

func _save_persistent_state() -> void:
	# Only persist when leaving ALIVE. Dying drops HP to 0 which would
	# otherwise spawn the next room with 0 HP and immediately re-die.
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
	if _attack_live <= 0.0:
		_is_attacking = false

	var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")

	# Shield resolves before velocity so its iframe/tint take effect this
	# frame. Held + has stamina + not in break cooldown + not mid-dodge
	# (dodge owns its own iframes/motion and shouldn't be hijacked).
	_update_shield(delta)

	# Resolve dash_strike END before velocity — when the dash window
	# closes we issue the AoE hit. Doing it here (rather than during
	# the input-check ladder) ensures the damage lands even if the
	# player releases inputs mid-dash.
	var dash_strike_just_ended := false
	if _dash_strike_time > 0.0:
		_dash_strike_time -= delta
		if _dash_strike_time <= 0.0:
			_dash_strike_time = 0.0
			dash_strike_just_ended = true

	# Velocity precedence: dodge > dash_strike > walk. Dodge wins
	# because it's the panic button; dash_strike rides on top of the
	# normal walk loop otherwise.
	if _dodge_time > 0.0:
		var t := 1.0 - (_dodge_time / DODGE_DURATION)
		var ease: float = pow(1.0 - t, 2.0)
		velocity = _dodge_dir * (DODGE_SPEED * ease + 60.0)
	elif _dash_strike_time > 0.0:
		velocity = _dash_strike_dir * DASH_STRIKE_SPEED
	else:
		var speed: float = SPEED * (1.0 + GameState.modifier_total_f("move_speed_mul", 0.0))
		velocity = input * speed
	move_and_slide()

	if dash_strike_just_ended:
		_resolve_dash_strike_hit()

	if input.x < -0.1:
		_facing_west = true
	elif input.x > 0.1:
		_facing_west = false
	# Mid-dodge, lock facing to dodge direction so the sprite doesn't
	# flicker when input + dodge disagree.
	if _dodge_time > 0.0 and abs(_dodge_dir.x) > 0.1:
		_facing_west = _dodge_dir.x < 0
	# Same idea for dash_strike — face the burst direction during it.
	if _dash_strike_time > 0.0 and abs(_dash_strike_dir.x) > 0.1:
		_facing_west = _dash_strike_dir.x < 0
	sprite.flip_h = _facing_west

	# Modulate: shield tint takes the RGB channel (blue stance), then
	# iframes flicker the alpha on top. Restore to white when neither
	# is active so we don't leave the sprite blue-tinted after release.
	# Skip the alpha flicker while shielding so the blue stance reads as
	# a steady tint instead of pulsing — the shield iframes are forced
	# every tick, which would otherwise strobe at 60Hz.
	sprite.modulate = SHIELD_TINT if _shield_active else Color(1, 1, 1, 1)
	if not _shield_active and _iframes > 0.0 and int(_iframes * 20) % 2 == 0:
		sprite.modulate.a = 0.45

	# Animation state — dodge > attack > walk > idle.
	if _dodge_time > 0.0 or _dash_strike_time > 0.0:
		sprite.play("walk")     # no dedicated dodge anim yet; walk reads as motion
	elif _is_attacking:
		sprite.play("attack")
	elif input.length() > 0.1:
		sprite.play("walk")
	else:
		sprite.play("idle")

	# Input precedence: dodge > shield (handled in _update_shield) >
	# dash_strike > blast > attack. Dodge always wins so the player
	# can bail out of any other action.
	if Input.is_action_just_pressed("dodge") and _dodge_cd <= 0.0 and _dodge_time <= 0.0:
		_start_dodge(input)
	elif Input.is_action_just_pressed("dash_strike") and _can_start_dash_strike():
		_start_dash_strike()
	elif Input.is_action_pressed("blast") and _blast_cd <= 0.0 and _dodge_time <= 0.0 and not _shield_active and _dash_strike_time <= 0.0:
		_start_blast()
	elif Input.is_action_pressed("attack") and _attack_cd <= 0.0 and not _is_attacking and _dodge_time <= 0.0 and not _shield_active and _dash_strike_time <= 0.0:
		_start_attack()

func _start_dodge(input: Vector2) -> void:
	var dir := input
	if dir.length() < 0.1:
		dir = Vector2.LEFT if _facing_west else Vector2.RIGHT
	_dodge_dir = dir.normalized()
	_dodge_time = DODGE_DURATION
	_dodge_cd = DODGE_COOLDOWN * (1.0 + GameState.modifier_total_f("dodge_cooldown_mul", 0.0))
	_iframes = max(_iframes, DODGE_IFRAMES)
	# Starting a dodge cancels shield so we don't double-spend stamina
	# on a frame where both states could overlap.
	_shield_active = false
	dodge_started.emit()
	Events.hero_dodged.emit(global_position)

func _start_attack() -> void:
	var aim_world := get_global_mouse_position() - global_position
	if aim_world.length() < 1.0:
		aim_world = Vector2(1, 0) if not _facing_west else Vector2(-1, 0)
	_attack_aim = aim_world.normalized()
	_attack_cd = ATTACK_COOLDOWN * (1.0 + GameState.modifier_total_f("sword_cooldown_mul", 0.0))
	_attack_live = ATTACK_SWING_TIME
	_is_attacking = true
	_facing_west = _attack_aim.x < 0
	sprite.flip_h = _facing_west
	sprite.frame = 0
	sprite.play("attack")
	# Damage = 1 base + iron_fang relic bonus + future stack-bonuses.
	var damage: int = 1 + GameState.modifier_total("sword_damage_bonus", 0)
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(enemy):
			continue
		var to_enemy: Vector2 = enemy.global_position - global_position
		if to_enemy.length() > ATTACK_RANGE:
			continue
		if abs(to_enemy.angle_to(_attack_aim)) > ATTACK_ARC:
			continue
		if enemy.has_method("take_hit"):
			enemy.take_hit(damage)
	Events.hero_attacked.emit(global_position, _attack_aim)

func _start_blast() -> void:
	var aim_world := get_global_mouse_position() - global_position
	if aim_world.length() < 1.0:
		aim_world = Vector2(1, 0) if not _facing_west else Vector2(-1, 0)
	var aim := aim_world.normalized()
	_blast_cd = BLAST_COOLDOWN
	_facing_west = aim.x < 0
	sprite.flip_h = _facing_west
	# Reuse the attack animation as a cast gesture for now. A dedicated
	# cast pose comes when we port more PixelLab anims.
	sprite.frame = 0
	sprite.play("attack")
	_attack_live = ATTACK_SWING_TIME
	_is_attacking = true
	# Spawn projectile slightly forward of the hero center so it doesn't
	# immediately clip the hero's own collision body.
	var p: Projectile = PROJECTILE_SCENE.instantiate()
	p.global_position = global_position + Vector2(0, -22) + aim * 18.0
	p.velocity = aim * Projectile.SPEED
	p.damage = 1 + GameState.modifier_total("blast_damage_bonus", 0)
	get_parent().add_child(p)
	Events.hero_blasted.emit(global_position, aim)

func take_damage(amount: int) -> void:
	if hp <= 0 or _iframes > 0.0:
		return
	# Iron Skin: flat subtract, never below 0 so a relic can fully soak
	# 1-damage trash hits without going negative (which would heal).
	# maxi (not max) — max() is polymorphic in Godot 4 and returns
	# Variant, which breaks := type-inference under strict mode.
	var actual: int = maxi(0, amount - GameState.modifier_total("damage_taken_reduction", 0))
	if actual <= 0:
		return
	hp -= actual
	_iframes = HIT_IFRAMES
	hp_changed.emit(hp)
	hit_received.emit()
	Events.hero_damaged.emit(global_position)
	if hp <= 0:
		hero_died.emit()
		Events.hero_died.emit(global_position)

# Shield is a held stance, not a one-shot — runs every tick so the
# stamina meter actually animates with the player's input. Dodge takes
# priority so shield never sticks during a panic roll.
func _update_shield(delta: float) -> void:
	var holding := Input.is_action_pressed("shield")
	var can_hold := holding and _shield_stamina > 0.0 and _shield_break_cd <= 0.0 and _dodge_time <= 0.0
	if can_hold:
		_shield_active = true
		_shield_stamina = max(0.0, _shield_stamina - SHIELD_DRAIN * delta)
		# Force iframes each tick so the existing take_damage gate
		# rejects hits without us having to add a parallel code path.
		_iframes = max(_iframes, delta * 2.0)
		if _shield_stamina <= 0.0:
			# Shield breaks: lock out re-raise for the break cooldown
			# so a button-mashing player can't infinite-tap to stay
			# invuln through the recovery curve.
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
		aim_world = Vector2(1, 0) if not _facing_west else Vector2(-1, 0)
	_dash_strike_dir = aim_world.normalized()
	_dash_strike_time = DASH_STRIKE_DURATION
	_dash_strike_cd = DASH_STRIKE_COOLDOWN
	# Iframes cover the full dash window so the player can blow through
	# an enemy line without trading. Hit lands on dash END, not start.
	_iframes = max(_iframes, DASH_STRIKE_DURATION)
	_facing_west = _dash_strike_dir.x < 0

func _resolve_dash_strike_hit() -> void:
	# Same damage formula as a sword swing so Iron Fang carries over —
	# dash_strike is conceptually a charged sword attack, not a new
	# weapon. Radius is wider than ATTACK_RANGE since the player
	# committed travel to land it.
	var damage: int = 1 + GameState.modifier_total("sword_damage_bonus", 0)
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(enemy):
			continue
		var to_enemy: Vector2 = enemy.global_position - global_position
		if to_enemy.length() > DASH_STRIKE_RADIUS:
			continue
		if enemy.has_method("take_hit"):
			enemy.take_hit(damage)
