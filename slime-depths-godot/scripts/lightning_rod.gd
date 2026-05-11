# LightningRod — iter 31. Stationary rod that periodically strikes
# downward with a vertical bolt, dealing AoE damage in a small radius
# around the rod base. Unlike spike pits (which damage on contact)
# and fire jets (which create a moving safe-window pattern), the
# lightning rod fires GLOBALLY on its timer regardless of hero
# position — the player must learn to read the telegraph and step
# OUT of the danger ring before each strike.
#
# Cycle:
#   IDLE (interval - 0.4s) — rod glints normally on the floor.
#   TELEGRAPH (0.4s)       — ground danger ring fades in + rod tip
#                            arcs with sparks. Player has time to
#                            walk out of the radius.
#   STRIKE (0.15s)         — vertical bolt + ground flash + damage
#                            to hero if still inside DAMAGE_RADIUS.
#                            Damage is one-shot per strike, not a
#                            sustained tick.
#   Loop forever.
#
# Configurable per-instance via `interval` (default 3.0s).
extends Node2D

const TELEGRAPH_TIME: float = 0.4
const STRIKE_TIME: float = 0.15
const DAMAGE_RADIUS: float = 44.0
const DAMAGE_PER_STRIKE: int = 1

# Per-instance, set by main.gd from hazards Dictionary.interval.
var interval: float = 3.0
var phase: float = 0.0  # 0..1 fraction of full cycle offset at spawn

var _t: float = 0.0
var _state: String = "idle"  # "idle" | "telegraph" | "strike"

@onready var _rod: Polygon2D = $Rod
@onready var _rod_glow: Polygon2D = $RodGlow
@onready var _ground_ring: Line2D = $GroundRing
@onready var _bolt: Line2D = $Bolt
@onready var _strike_flash: Polygon2D = $StrikeFlash

func _ready() -> void:
	var cycle_total: float = interval
	_t = clampf(phase, 0.0, 1.0) * cycle_total
	_ground_ring.modulate.a = 0.0
	_bolt.visible = false
	_strike_flash.visible = false

func _physics_process(delta: float) -> void:
	_t += delta
	if _t >= interval:
		_t -= interval
	var idle_window: float = interval - TELEGRAPH_TIME - STRIKE_TIME
	if _t < idle_window:
		if _state != "idle":
			_enter_idle()
	elif _t < idle_window + TELEGRAPH_TIME:
		if _state != "telegraph":
			_enter_telegraph()
		# During telegraph: ramp ring alpha + sparks 0 → 1.
		var telegraph_t: float = (_t - idle_window) / TELEGRAPH_TIME
		_ground_ring.modulate = Color(1.0, 0.92, 0.45, 0.35 + 0.55 * telegraph_t)
		_ground_ring.width = 2.0 + 2.0 * telegraph_t
		# Rod glow brightens as charge builds.
		var glow_a: float = 0.3 + 0.7 * telegraph_t
		_rod_glow.modulate.a = glow_a
	else:
		if _state != "strike":
			_enter_strike()
		# During strike: hold the bolt + flash. Fade flash a bit
		# across the window so it doesn't read as a static decal.
		var strike_t: float = (_t - idle_window - TELEGRAPH_TIME) / STRIKE_TIME
		_strike_flash.modulate.a = 0.95 - 0.4 * strike_t

func _enter_idle() -> void:
	_state = "idle"
	_ground_ring.modulate = Color(1.0, 0.92, 0.45, 0.0)
	_rod_glow.modulate.a = 0.25
	_bolt.visible = false
	_strike_flash.visible = false

func _enter_telegraph() -> void:
	_state = "telegraph"
	_bolt.visible = false
	_strike_flash.visible = false

func _enter_strike() -> void:
	_state = "strike"
	_bolt.visible = true
	_strike_flash.visible = true
	_strike_flash.modulate.a = 0.95
	# Damage: scan for hero within DAMAGE_RADIUS of strike point
	# (= rod position). Direct distance check rather than Area2D
	# overlap because the strike is instantaneous (one-frame) and
	# we want immediate hit registration.
	var hero: Node2D = _find_hero()
	if hero != null and hero.global_position.distance_to(global_position) <= DAMAGE_RADIUS:
		if hero.has_method("take_damage"):
			hero.take_damage(DAMAGE_PER_STRIKE)

func _find_hero() -> Node2D:
	# Hero is in the "hero" group; tree lookup is cheap (single node).
	var heros: Array = get_tree().get_nodes_in_group("hero")
	if heros.is_empty():
		return null
	var h: Node = heros[0]
	if h is Node2D:
		return h
	return null
