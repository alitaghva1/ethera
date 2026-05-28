# BlastTrail — magenta-to-transparent streak painted along the aim
# direction when the hero fires a blast. Spawned by ScreenFlash on
# `Events.hero_blasted(pos, aim)`.
#
# Visual treatment: a single Sprite2D using an in-line GradientTexture2D
# (authored in the .tscn) — opaque magenta at the hilt-end, transparent
# at the projectile-end. The sprite's pivot is positioned so the streak
# starts at the spawn point and extends along +X; setup() rotates the
# Node2D to point at the aim vector.
#
# Why Sprite2D + GradientTexture2D (vs Line2D, vs CPUParticles2D):
#  - Line2D gradients in 4.6 don't bake nicely into a textured streak
#    with smooth tapering at the tip — they look segmented.
#  - CPUParticles2D would scatter; we want a directed coherent streak.
#  - A textured sprite is one draw call and the gradient bakes once.
extends Node2D

const DURATION: float = 0.35
const LENGTH_GROW: float = 0.25  # final scale.x = 1.0 + LENGTH_GROW

@onready var _sprite: Sprite2D = $Sprite2D

var _elapsed: float = 0.0
var _base_scale: Vector2 = Vector2.ONE
var _base_modulate: Color = Color(1, 1, 1, 1)

func setup(aim: Vector2) -> void:
	# Rotate so the +X-pointing streak follows the aim vector. The
	# .tscn places the sprite with offset.x so its LEFT edge is the
	# pivot (origin of this Node2D) — the streak grows out from there.
	if aim.length_squared() > 0.0001:
		rotation = aim.angle()

func _ready() -> void:
	_base_scale = scale
	if _sprite != null:
		_base_modulate = _sprite.modulate

func _process(delta: float) -> void:
	_elapsed += delta
	var t: float = _elapsed / DURATION
	if t >= 1.0:
		queue_free()
		return
	# Length grows slightly to suggest the bolt's wake stretching;
	# alpha fades the whole streak so it dissolves rather than abruptly
	# cutting. Width (scale.y) stays constant so the streak doesn't
	# inflate into a blob.
	var grow_x: float = 1.0 + LENGTH_GROW * t
	scale = Vector2(_base_scale.x * grow_x, _base_scale.y)
	if _sprite != null:
		var col: Color = _base_modulate
		col.a = _base_modulate.a * (1.0 - t)
		_sprite.modulate = col
