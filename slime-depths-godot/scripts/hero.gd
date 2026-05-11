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

signal hp_changed(new_hp: int)
signal hero_died
signal hit_received       # for camera shake + hit-stop in main.gd
signal dodge_started

func _ready() -> void:
	sprite.play("idle")
	add_to_group("hero")
	# Stoneheart relic — extra HP at spawn. Read once; live changes
	# would require a more sophisticated stat system (out of scope for
	# Iter 3 since hp is only granted via pedestal between scenes).
	var hp_bonus := GameState.modifier_total("max_hp_bonus", 0)
	if hp_bonus > 0:
		hp = MAX_HP + hp_bonus

func _physics_process(delta: float) -> void:
	_attack_cd  = max(0.0, _attack_cd  - delta)
	_attack_live = max(0.0, _attack_live - delta)
	_dodge_cd   = max(0.0, _dodge_cd   - delta)
	_dodge_time = max(0.0, _dodge_time - delta)
	_iframes    = max(0.0, _iframes    - delta)
	_blast_cd   = max(0.0, _blast_cd   - delta)
	if _attack_live <= 0.0:
		_is_attacking = false

	var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")

	# Dodge takes precedence over walk velocity. While dodging,
	# velocity is set once at start and decays over duration via a
	# simple curve (cubic ease-out) so the dash front-loads speed.
	if _dodge_time > 0.0:
		var t := 1.0 - (_dodge_time / DODGE_DURATION)
		var ease := pow(1.0 - t, 2.0)
		velocity = _dodge_dir * (DODGE_SPEED * ease + 60.0)
	else:
		velocity = input * SPEED
	move_and_slide()

	if input.x < -0.1:
		_facing_west = true
	elif input.x > 0.1:
		_facing_west = false
	# Mid-dodge, lock facing to dodge direction so the sprite doesn't
	# flicker when input + dodge disagree.
	if _dodge_time > 0.0 and abs(_dodge_dir.x) > 0.1:
		_facing_west = _dodge_dir.x < 0
	sprite.flip_h = _facing_west

	# I-frame flicker — alpha pulses while iframes active.
	sprite.modulate.a = 0.45 if (_iframes > 0.0 and int(_iframes * 20) % 2 == 0) else 1.0

	# Animation state — dodge > attack > walk > idle.
	if _dodge_time > 0.0:
		sprite.play("walk")     # no dedicated dodge anim yet; walk reads as motion
	elif _is_attacking:
		sprite.play("attack")
	elif input.length() > 0.1:
		sprite.play("walk")
	else:
		sprite.play("idle")

	# Dodge first — feels worse if dodge gets queued behind an attack.
	if Input.is_action_just_pressed("dodge") and _dodge_cd <= 0.0 and _dodge_time <= 0.0:
		_start_dodge(input)
	elif Input.is_action_pressed("blast") and _blast_cd <= 0.0 and _dodge_time <= 0.0:
		_start_blast()
	elif Input.is_action_pressed("attack") and _attack_cd <= 0.0 and not _is_attacking and _dodge_time <= 0.0:
		_start_attack()

func _start_dodge(input: Vector2) -> void:
	var dir := input
	if dir.length() < 0.1:
		dir = Vector2.LEFT if _facing_west else Vector2.RIGHT
	_dodge_dir = dir.normalized()
	_dodge_time = DODGE_DURATION
	_dodge_cd = DODGE_COOLDOWN
	_iframes = max(_iframes, DODGE_IFRAMES)
	dodge_started.emit()

func _start_attack() -> void:
	var aim_world := get_global_mouse_position() - global_position
	if aim_world.length() < 1.0:
		aim_world = Vector2(1, 0) if not _facing_west else Vector2(-1, 0)
	_attack_aim = aim_world.normalized()
	_attack_cd = ATTACK_COOLDOWN
	_attack_live = ATTACK_SWING_TIME
	_is_attacking = true
	_facing_west = _attack_aim.x < 0
	sprite.flip_h = _facing_west
	sprite.frame = 0
	sprite.play("attack")
	# Damage = 1 base + iron_fang relic bonus + future stack-bonuses.
	var damage := 1 + GameState.modifier_total("sword_damage_bonus", 0)
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

func take_damage(amount: int) -> void:
	if hp <= 0 or _iframes > 0.0:
		return
	hp -= amount
	_iframes = HIT_IFRAMES
	hp_changed.emit(hp)
	hit_received.emit()
	if hp <= 0:
		hero_died.emit()
