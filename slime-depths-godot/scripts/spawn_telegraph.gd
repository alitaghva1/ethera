# SpawnTelegraph — red ground-ring pulse that telegraphs where an enemy
# is about to materialize. Spawned as a child of each Enemy in
# enemy._ready() when _spawn_in_time > 0; self-destroys at the end of
# SPAWN_IN_DURATION so it disappears the instant the enemy is "live."
#
# Why a ground telegraph: pre-iter-147 enemies faded in from red-
# translucent sprites (the modulate lerp from SPAWN_IN_START_COLOR to
# baseline). That tells the player WHEN an enemy is materializing if
# they're looking at it, but it doesn't tell them WHERE to expect new
# enemies BEFORE the fade-in starts being visible. A bright red ground
# ring catches peripheral vision: "danger spawning HERE — reposition
# or be sandwiched."
#
# Visual grammar: matches the iter-138 crit splash ring family (red-
# orange palette) so the player reads "red ring = combat-relevant
# spatial event." Distinct from pickup_burst (gold), heal_sparkle
# (green), death_burst (falling embers).
#
# Lifecycle: the ring's alpha follows a sine pulse that completes
# exactly TELEGRAPH_DURATION seconds long, with built-in fade-out
# at the tail so the telegraph never lingers past the enemy spawn-in.
extends Node2D

const TELEGRAPH_DURATION: float = 0.35  # matches enemy.SPAWN_IN_DURATION
const PULSE_FREQ: float = 6.0  # cycles/sec — fast enough to read "WARNING"
const PULSE_MIN_ALPHA: float = 0.30
const PULSE_MAX_ALPHA: float = 0.70

@onready var _ring: Polygon2D = $Ring

var _elapsed: float = 0.0
var _base_color: Color = Color(1.0, 0.32, 0.32, 1.0)

func _ready() -> void:
	# z_index 1 so the ring sits ABOVE the floor decals (which render
	# at z=0) but BELOW the enemy sprite (which is anchored at the
	# enemy's natural Node2D z). The enemy's sprite is a child of the
	# Enemy node — when we're added as a sibling, our z_index moves
	# us inside the parent's local stack.
	z_index = -1
	if _ring != null:
		_base_color = _ring.color

func _process(delta: float) -> void:
	_elapsed += delta
	if _elapsed >= TELEGRAPH_DURATION:
		queue_free()
		return
	if _ring == null:
		return
	# Pulse the alpha at PULSE_FREQ cycles/sec — sin gives a smooth
	# breathe. Tail-fade by the end of the duration so the ring eases
	# out instead of vanishing on a high pulse frame.
	var pulse: float = 0.5 + 0.5 * sin(_elapsed * TAU * PULSE_FREQ)
	var fade_out: float = 1.0 - (_elapsed / TELEGRAPH_DURATION)
	var alpha: float = lerpf(PULSE_MIN_ALPHA, PULSE_MAX_ALPHA, pulse) * fade_out
	var col: Color = _base_color
	col.a = alpha
	_ring.color = col
