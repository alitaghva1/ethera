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

# Iter 43 — per-instance _life + _rise so spawn_crit can override them
# (crit numbers rise farther + linger longer). Defaults match the
# pre-iter-43 constants.
var _life: float = LIFETIME
var _rise: float = RISE
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

# Iter 43 — crit damage variant. Bigger font, warm-yellow tint, "!"
# suffix on the number, longer life, bigger rise. Stands out clearly
# against the regular hit numbers so the player learns to read crits
# at a glance.
static func spawn_crit(at: Vector2, damage: int) -> DamageNumber:
	var n: DamageNumber = preload("res://scenes/damage_number.tscn").instantiate()
	n.global_position = at
	n.text = str(damage) + "!"
	n.add_theme_color_override("font_color", Color(1.0, 0.85, 0.40, 1.0))
	n.add_theme_color_override("font_outline_color", Color(0.20, 0.06, 0.0, 0.95))
	n.add_theme_constant_override("outline_size", 5)
	n.add_theme_font_size_override("font_size", 26)
	# Bigger rise + longer life so the crit number lingers and reads
	# as the highlight of the moment.
	n._life = 1.0
	n._rise = 64.0
	return n

var _init_life: float = LIFETIME

func _ready() -> void:
	_start_y = global_position.y
	# Iter 43 — snapshot the spawned _life as the normalization base so
	# spawn_crit's longer life animates correctly through _process.
	_init_life = max(0.001, _life)
	# Tiny horizontal jitter so two simultaneous numbers don't perfectly
	# overlap. Bounded so it doesn't break the "above the enemy" read.
	global_position.x += randf_range(-8.0, 8.0)
	z_index = 100

func _process(delta: float) -> void:
	_life -= delta
	if _life <= 0.0:
		queue_free()
		return
	# Iter 43 — normalize fraction off the SPAWN life (captured in
	# _init_life on _ready) so spawn_crit's longer-life numbers animate
	# smoothly without needing parallel rise/fade timing constants.
	var t := 1.0 - (_life / _init_life)
	# Ease-out rise — fast early, settles at the top.
	global_position.y = _start_y - _rise * (1.0 - pow(1.0 - t, 2.0))
	# Fade — hold opacity for FADE_DELAY then linear to 0.
	var hold_frac: float = FADE_DELAY / _init_life
	if t > hold_frac:
		var fade_t := (t - hold_frac) / (1.0 - hold_frac)
		modulate.a = 1.0 - fade_t
