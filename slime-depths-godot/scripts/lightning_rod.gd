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

# Iter 253 / Wave 3 — hazard reactivity. Pairing key for HazardInteractions
# — a lightning_rod over a slow_zone spawns electrified_font (mob soft-
# stun + damage).
var hazard_kind: String = "lightning_rod"

var _t: float = 0.0
var _state: String = "idle"  # "idle" | "telegraph" | "strike"

@onready var _rod: Polygon2D = $Rod
@onready var _rod_glow: Polygon2D = $RodGlow
@onready var _ground_ring: Line2D = $GroundRing
@onready var _bolt: Line2D = $Bolt
@onready var _strike_flash: Polygon2D = $StrikeFlash
# Iter-readability additions: filled ground footprint disc + two tip
# sparks for the back half of telegraph. See scene file for layout.
@onready var _ground_footprint: Polygon2D = $GroundFootprint
@onready var _tip_spark_a: Polygon2D = $TipSparkA
@onready var _tip_spark_b: Polygon2D = $TipSparkB
# Heartbeat for the IDLE ground footprint pulse.
var _idle_t: float = 0.0

func _ready() -> void:
	# Iter 253 — join the "hazards" group for HazardInteractions pairing.
	add_to_group("hazards")
	var cycle_total: float = interval
	_t = clampf(phase, 0.0, 1.0) * cycle_total
	# Keep a faint outline glimmer in idle so the player sees the ring
	# even before a telegraph; the disc footprint also handles this.
	_ground_ring.modulate = Color(1.0, 0.92, 0.45, 0.18)
	_bolt.visible = false
	_strike_flash.visible = false
	_tip_spark_a.visible = false
	_tip_spark_b.visible = false

func _physics_process(delta: float) -> void:
	_t += delta
	_idle_t += delta
	if _t >= interval:
		_t -= interval
	var idle_window: float = interval - TELEGRAPH_TIME - STRIKE_TIME
	if _t < idle_window:
		if _state != "idle":
			_enter_idle()
		# IDLE: ground footprint shimmers very faintly — ozone breathing
		# so the player can see the zone from a distance without it
		# screaming "danger" yet. Period ~2.4s.
		var ipulse: float = 0.5 + 0.5 * sin(_idle_t * 2.6)
		_ground_footprint.color = Color(0.55, 0.75, 1.0, 0.10 + 0.06 * ipulse)
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
		# Ground footprint ramps to a much more visible blue-white "zone is
		# about to be live" wash. Player can see the danger circle even if
		# the rod itself is partially off-camera.
		_ground_footprint.color = Color(0.65, 0.85, 1.0, 0.12 + 0.45 * telegraph_t)
		_ground_footprint.scale = Vector2(1.0 + 0.06 * telegraph_t, 1.0 + 0.06 * telegraph_t)
		# Tip sparks pop in the back HALF of telegraph (~last 0.2s) so the
		# player gets a sharp "right now!" cue distinct from the ramp.
		if telegraph_t > 0.5:
			var spark_t: float = (telegraph_t - 0.5) * 2.0   # 0..1
			_tip_spark_a.visible = true
			_tip_spark_b.visible = true
			# Alternating pulse — A and B are 180° out of phase so they
			# crackle rather than blink together.
			var pa: float = 0.5 + 0.5 * sin(spark_t * 36.0)
			var pb: float = 0.5 + 0.5 * sin(spark_t * 36.0 + PI)
			_tip_spark_a.modulate.a = 0.4 + 0.6 * pa
			_tip_spark_a.scale = Vector2(0.7 + 0.5 * pa, 0.7 + 0.5 * pa)
			_tip_spark_b.modulate.a = 0.4 + 0.6 * pb
			_tip_spark_b.scale = Vector2(0.7 + 0.5 * pb, 0.7 + 0.5 * pb)
		else:
			_tip_spark_a.visible = false
			_tip_spark_b.visible = false
	else:
		if _state != "strike":
			_enter_strike()
		# During strike: hold the bolt + flash. Fade flash a bit
		# across the window so it doesn't read as a static decal.
		var strike_t: float = (_t - idle_window - TELEGRAPH_TIME) / STRIKE_TIME
		_strike_flash.modulate.a = 0.95 - 0.4 * strike_t
		# Ground footprint goes white-hot for the strike duration —
		# unambiguous "this zone is being struck."
		_ground_footprint.color = Color(1.0, 1.0, 1.0, 0.85 - 0.45 * strike_t)
		_ground_footprint.scale = Vector2(1.08, 1.08)

func _enter_idle() -> void:
	_state = "idle"
	# Keep a faint outline + footprint shimmer in idle. Modulate.a > 0
	# so the line is barely visible — beats invisible-then-snap-on.
	_ground_ring.modulate = Color(1.0, 0.92, 0.45, 0.18)
	_ground_ring.width = 2.0
	_rod_glow.modulate.a = 0.25
	_bolt.visible = false
	_strike_flash.visible = false
	_tip_spark_a.visible = false
	_tip_spark_b.visible = false
	_ground_footprint.scale = Vector2(1.0, 1.0)

func _enter_telegraph() -> void:
	_state = "telegraph"
	_bolt.visible = false
	_strike_flash.visible = false

func _enter_strike() -> void:
	_state = "strike"
	_bolt.visible = true
	_strike_flash.visible = true
	_strike_flash.modulate.a = 0.95
	_tip_spark_a.visible = false
	_tip_spark_b.visible = false
	# Damage: scan for hero within DAMAGE_RADIUS of strike point
	# (= rod position). Direct distance check rather than Area2D
	# overlap because the strike is instantaneous (one-frame) and
	# we want immediate hit registration.
	var hero: Node2D = _find_hero()
	if hero != null and hero.global_position.distance_to(global_position) <= DAMAGE_RADIUS:
		if hero.has_method("take_damage"):
			# iter-70 polish: knockback radially outward from the rod's
			# strike point. Hero standing on the splash-zone edge gets
			# shoved off; hero dead-center just gets the fallback push.
			hero.take_damage(DAMAGE_PER_STRIKE, global_position)

func _find_hero() -> Node2D:
	# Hero is in the "hero" group; tree lookup is cheap (single node).
	var heros: Array = get_tree().get_nodes_in_group("hero")
	if heros.is_empty():
		return null
	var h: Node = heros[0]
	if h is Node2D:
		return h
	return null
