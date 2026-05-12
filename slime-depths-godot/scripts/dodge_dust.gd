# Dodge dust — gray puff trailing the hero on a dodge roll. The FX
# autoload sets `rotation` at spawn-time to point AWAY from the dodge
# direction; the CPUParticles2D children use that rotation as their
# emission direction so the dust sprays behind the hero, not in a
# uniform halo.
#
# Iter 73 phasing rework: previously a single CPUParticles2D and a
# fire-and-forget timer. Now three components (GroundStreak Line2D
# + DustCloud + BackStreak) layered for weight + a back-streak that
# reads as the dodge PATH. The Line2D needs an explicit fade because
# it isn't a particle — _process tweens its alpha down so the scuff
# mark dissolves naturally instead of vanishing on free.
extends Node2D

const LIFETIME := 0.85   # iter 73: 0.7 → 0.85 so the cloud has room to settle
const STREAK_FADE_TIME := 0.32   # how long the GroundStreak Line2D takes to fade

@onready var _ground_streak: Line2D = get_node_or_null("GroundStreak")

var _elapsed: float = 0.0
var _streak_base_alpha: float = 1.0

func _ready() -> void:
	if _ground_streak != null:
		_streak_base_alpha = _ground_streak.default_color.a

func _process(delta: float) -> void:
	_elapsed += delta
	# Fade the GroundStreak Line2D on its own short timeline — the
	# scuff mark on the floor doesn't linger as long as the dust cloud
	# above it. Goes invisible by STREAK_FADE_TIME so the only thing
	# left is the dust drifting away.
	if _ground_streak != null:
		var t: float = clampf(_elapsed / STREAK_FADE_TIME, 0.0, 1.0)
		# Decay on t^1.6 — slow fade at first (the mark "exists"), faster
		# at the end (dust covers it).
		var fade: float = 1.0 - pow(t, 1.6)
		var col: Color = _ground_streak.default_color
		col.a = _streak_base_alpha * fade
		_ground_streak.default_color = col
	if _elapsed >= LIFETIME:
		queue_free()
