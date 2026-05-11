# Damage number — a floating Label that drifts up + fades out, then
# frees itself. Spawned by enemies on hit/death.
#
# Usage:
#   var n = DamageNumber.spawn(world_pos, "1", Color.WHITE)
#   add_child(n)
#
# Ported from slime-depths/src/fx.js → spawnDamageNumber.
class_name DamageNumber
extends Label

const RISE        := 40.0     # px drifted up over life
const LIFETIME    := 0.7      # sec total
const FADE_DELAY  := 0.2      # sec at full opacity before fade starts

var _life := LIFETIME
var _start_y: float

static func spawn(at: Vector2, text: String, color: Color = Color(1, 0.95, 0.7)) -> DamageNumber:
	var n: DamageNumber = preload("res://scenes/damage_number.tscn").instantiate()
	n.global_position = at
	n.text = text
	n.add_theme_color_override("font_color", color)
	# Outline for legibility on the busy floor.
	n.add_theme_color_override("font_outline_color", Color(0.04, 0.03, 0.06, 0.95))
	n.add_theme_constant_override("outline_size", 4)
	return n

func _ready() -> void:
	_start_y = global_position.y
	# Tiny horizontal jitter so two simultaneous numbers don't perfectly
	# overlap. Bounded so it doesn't break the "above the enemy" read.
	global_position.x += randf_range(-8.0, 8.0)
	z_index = 100

func _process(delta: float) -> void:
	_life -= delta
	if _life <= 0.0:
		queue_free()
		return
	var t := 1.0 - (_life / LIFETIME)
	# Ease-out rise — fast early, settles at the top.
	global_position.y = _start_y - RISE * (1.0 - pow(1.0 - t, 2.0))
	# Fade — hold opacity for FADE_DELAY then linear to 0.
	var hold_frac := FADE_DELAY / LIFETIME
	if t > hold_frac:
		var fade_t := (t - hold_frac) / (1.0 - hold_frac)
		modulate.a = 1.0 - fade_t
