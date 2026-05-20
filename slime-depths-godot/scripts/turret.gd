# Turret — iter 226 / Expansion Team. A stationary summon that drops at
# the hero's room-entry position, scans for nearby enemies in SCAN_RANGE,
# and auto-fires a low-damage projectile every FIRE_COOLDOWN seconds.
#
# Architecture parallels familiar.gd but the verb is "drop a ward" not
# "orbit you" — the turret does NOT track the hero. Where the hero stands
# on room load is where the turret guards for the entire room. That makes
# POSITIONAL CHOICE matter (drop it near a chokepoint, fall back behind
# it) in a way an orbiting familiar does not.
#
# Despawn semantics: lives until scene reload (i.e., room transition or
# run reset). Main.gd._sync_turrets ensures the group's size matches
# summon_turret_count at room load + after a relic grant.
#
# Visual: a dark obsidian pylon with a pulsing storm-blue rune face.
# Code-built so no .tscn dependency — matches the lore_stone pattern.
extends Node2D

const PROJECTILE_SCENE: PackedScene = preload("res://scenes/projectile.tscn")

# Scan + fire parameters. SCAN_RANGE 200px is the spec target; FIRE_COOLDOWN
# 1.5s gives 0.67 shots/s sustained — chip damage from a wide pool of
# turrets (legendary tier offers +1; future relics could stack).
const SCAN_RANGE: float = 200.0
const FIRE_COOLDOWN: float = 1.5
const TURRET_DAMAGE: int = 1
const TURRET_PROJ_SPEED: float = 380.0

var _t: float = 0.0
var _fire_cd: float = 0.0

# Visual elements (code-built to avoid .tscn drift).
var _base: Polygon2D = null
var _rune: Polygon2D = null
var _glow: PointLight2D = null

func _ready() -> void:
	add_to_group("summon_turrets")
	# Base pylon — small dark obsidian diamond, 14 px tall.
	_base = Polygon2D.new()
	var r: float = 9.0
	_base.polygon = PackedVector2Array([
		Vector2(0, -r * 1.4),
		Vector2(r, 0),
		Vector2(0, r),
		Vector2(-r, 0),
	])
	_base.color = Color(0.18, 0.20, 0.32, 1.0)
	add_child(_base)
	# Outline ring — slightly larger, transparent rim so the pylon reads
	# crisp against busy floor decals.
	var rim: Polygon2D = Polygon2D.new()
	rim.polygon = PackedVector2Array([
		Vector2(0, -r * 1.55),
		Vector2(r * 1.1, 0),
		Vector2(0, r * 1.1),
		Vector2(-r * 1.1, 0),
	])
	rim.color = Color(0.08, 0.10, 0.18, 0.6)
	# Insert rim BEFORE _base so the base draws on top.
	add_child(rim)
	move_child(rim, 0)
	# Rune face — small inset polygon, pulses storm-cyan.
	_rune = Polygon2D.new()
	var pr: float = 3.5
	_rune.polygon = PackedVector2Array([
		Vector2(pr, 0), Vector2(0, pr),
		Vector2(-pr, 0), Vector2(0, -pr),
	])
	_rune.color = Color(0.7, 0.95, 1.0, 1.0)
	add_child(_rune)
	# Soft glow — same palette as familiar.gd for visual family parity
	# (both are STORM-themed summons even though they behave differently).
	_glow = PointLight2D.new()
	_glow.energy = 0.7
	_glow.texture_scale = 0.6
	_glow.color = Color(0.6, 0.9, 1.0, 1.0)
	_glow.range_z_min = -1024
	_glow.range_z_max = 1024
	add_child(_glow)
	# Z order — above floor decals, below hero/enemies so combat focus
	# stays on the moving actors.
	z_index = 5

func _physics_process(delta: float) -> void:
	_t += delta
	_fire_cd = max(0.0, _fire_cd - delta)
	# Visible heartbeat — rune scale + glow energy pulse so the turret
	# reads as "alive and aware" even when no enemy is in range.
	var pulse: float = 1.0 + 0.18 * sin(_t * 2.6)
	if _rune != null:
		_rune.scale = Vector2(pulse, pulse)
	if _glow != null:
		_glow.energy = 0.55 + 0.35 * (0.5 + 0.5 * sin(_t * 2.2))
	# Fire on cooldown if an enemy is in range. Stationary semantics —
	# we don't move, just scan + project from this fixed world position.
	if _fire_cd > 0.0:
		return
	var target: Node2D = _find_nearest_enemy()
	if target == null:
		return
	_fire_at(target)
	_fire_cd = FIRE_COOLDOWN

# Find the nearest enemy within SCAN_RANGE. Returns null if none. Mirrors
# familiar.gd's filter: skip "breakables" (chests) so the turret doesn't
# waste cooldown on treasure.
func _find_nearest_enemy() -> Node2D:
	var best: Node2D = null
	var best_dist: float = SCAN_RANGE
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(enemy):
			continue
		# Iter 224 — Bug Team Node2D guard (defensive parity with familiar).
		if not (enemy is Node2D):
			continue
		if enemy.is_in_group("breakables"):
			continue
		var d: float = enemy.global_position.distance_to(global_position)
		if d < best_dist:
			best_dist = d
			best = enemy
	return best

# Fire a chip-damage projectile at the target. Reuses the hero's
# projectile.tscn for the bolt visual. Like familiar bolts, we don't
# inherit hero crit / burn / slow rolls — turret bolts stay simple and
# their value is the AUTONOMY (free DPS while you focus on combat) not
# the per-hit ramping.
func _fire_at(target: Node2D) -> void:
	var aim: Vector2 = (target.global_position - global_position).normalized()
	var p: Projectile = PROJECTILE_SCENE.instantiate()
	p.global_position = global_position
	p.velocity = aim * TURRET_PROJ_SPEED
	p.damage = TURRET_DAMAGE
	p.target_group = "enemies"
	p.orb_tint = Color(0.7, 0.95, 1.0, 1.0)
	get_tree().current_scene.add_child(p)
