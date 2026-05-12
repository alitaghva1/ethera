# Familiar — iter 56. A small wisp pet that orbits the hero, scans for
# enemies within range, and auto-fires a low-damage projectile on
# cooldown. Adds bullet-hell autonomy: even while the player dodges/
# kites, the familiars keep dealing chip damage in all directions.
#
# Architecture:
#   • Sibling of the hero (NOT child) so its position is independent —
#     orbits at a slow rate around the hero's world position.
#   • Each familiar has its own _scan_cd; when expired, picks nearest
#     enemy within RANGE and fires a Projectile (reuses the hero's
#     projectile.tscn for the lightning-bolt visual).
#   • Per-familiar orbit phase offset so multiple familiars don't
#     stack on top of each other.
#
# Why this matters: iter 55 added boss-summon adds (enemies get pets).
# Familiars give the HERO autonomous DPS — fully symmetric bullet-hell
# scaling. Combined with chain bolts, STORM ascendance, multi-shot,
# pierce + ricochet, a STORM-built hero now sprays projectiles in all
# directions every fraction of a second.
extends Node2D

const PROJECTILE_SCENE: PackedScene = preload("res://scenes/projectile.tscn")
# Orbit parameters — radius from hero center, angular speed (rad/sec).
const ORBIT_RADIUS: float = 56.0
const ORBIT_ANG_SPEED: float = 1.6
# Scan + fire parameters.
const SCAN_RANGE: float = 240.0
const FIRE_COOLDOWN: float = 1.2
const FAMILIAR_DAMAGE: int = 1
const FAMILIAR_PROJ_SPEED: float = 420.0

# Set by main.gd at spawn so multi-familiar setups orbit out of sync.
var orbit_phase: float = 0.0

var _t: float = 0.0
var _fire_cd: float = 0.0
var _hero: Node2D = null
# Visual body — a small glowing cyan orb. Code-built like other
# iter-style nodes (lore stones, shrines) so adding a new familiar
# look stays a single-file edit.
var _orb: Polygon2D = null
var _glow: PointLight2D = null

func _ready() -> void:
	add_to_group("familiars")
	# Build visuals.
	_orb = Polygon2D.new()
	var r: float = 5.0
	_orb.polygon = PackedVector2Array([
		Vector2(r, 0), Vector2(r * 0.7, r * 0.7),
		Vector2(0, r), Vector2(-r * 0.7, r * 0.7),
		Vector2(-r, 0), Vector2(-r * 0.7, -r * 0.7),
		Vector2(0, -r), Vector2(r * 0.7, -r * 0.7),
	])
	_orb.color = Color(0.65, 0.95, 1.0, 1.0)
	add_child(_orb)
	# Inner bright pip.
	var pip: Polygon2D = Polygon2D.new()
	var pr: float = 2.5
	pip.polygon = PackedVector2Array([
		Vector2(pr, 0), Vector2(0, pr), Vector2(-pr, 0), Vector2(0, -pr),
	])
	pip.color = Color(1.0, 1.0, 1.0, 0.95)
	add_child(pip)
	# Soft glow.
	_glow = PointLight2D.new()
	_glow.energy = 0.9
	_glow.texture_scale = 0.7
	_glow.color = Color(0.7, 0.95, 1.0, 1.0)
	_glow.range_z_min = -1024
	_glow.range_z_max = 1024
	add_child(_glow)
	# Z order — above floor, below hero so hero stays the focal point.
	z_index = 6

func _physics_process(delta: float) -> void:
	_t += delta
	_fire_cd = max(0.0, _fire_cd - delta)
	# Resolve hero (lazy — same pattern as door / lore_stone).
	if _hero == null or not is_instance_valid(_hero):
		var heroes: Array = get_tree().get_nodes_in_group("hero")
		if heroes.is_empty():
			return
		_hero = heroes[0]
	# Orbit position — circle around hero at constant angular speed.
	var ang: float = _t * ORBIT_ANG_SPEED + orbit_phase
	global_position = _hero.global_position + Vector2(cos(ang), sin(ang)) * ORBIT_RADIUS
	# Subtle bob in scale + glow energy so the familiar reads as alive.
	var pulse: float = 1.0 + 0.10 * sin(_t * 3.0 + orbit_phase)
	if _orb != null:
		_orb.scale = Vector2(pulse, pulse)
	if _glow != null:
		_glow.energy = 0.7 + 0.4 * (0.5 + 0.5 * sin(_t * 2.4 + orbit_phase))
	# Fire on cooldown if an enemy is in range.
	if _fire_cd > 0.0:
		return
	var target: Node2D = _find_nearest_enemy()
	if target == null:
		return
	_fire_at(target)
	_fire_cd = FIRE_COOLDOWN

# Find the nearest enemy within SCAN_RANGE. Returns null if none.
func _find_nearest_enemy() -> Node2D:
	var best: Node2D = null
	var best_dist: float = SCAN_RANGE
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(enemy):
			continue
		var d: float = enemy.global_position.distance_to(global_position)
		if d < best_dist:
			best_dist = d
			best = enemy
	return best

# Fire a low-damage projectile toward the target. Reuses the hero's
# projectile.tscn for visual consistency (cyan bolt). Damage is fixed
# at FAMILIAR_DAMAGE so a player who stacks 3 familiars isn't getting
# 3× their melee output for free — each familiar bolt is a chip.
func _fire_at(target: Node2D) -> void:
	var aim: Vector2 = (target.global_position - global_position).normalized()
	var p: Projectile = PROJECTILE_SCENE.instantiate()
	p.global_position = global_position
	p.velocity = aim * FAMILIAR_PROJ_SPEED
	p.damage = FAMILIAR_DAMAGE
	p.target_group = "enemies"
	p.orb_tint = Color(0.6, 1.0, 1.0, 1.0)
	# No pierce / ricochet on familiar bolts — chip damage stays chip.
	# Crit + burn + slow ARE inherited from hero modifiers via the
	# global modifier_total reads in projectile.gd if we set those
	# flags. For now keep familiar projectiles SIMPLE — they don't
	# read hero relic state, just plink.
	get_tree().current_scene.add_child(p)
