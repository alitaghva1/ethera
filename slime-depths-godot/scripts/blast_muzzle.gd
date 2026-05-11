# BlastMuzzle — iter 19. Brief magenta flash spawned at the projectile
# spawn point when the hero fires a blast. Sells "this projectile was
# LAUNCHED" instead of "this projectile appeared."
#
# Two stacked Polygon2D circles (halo + core) scale outward + fade,
# plus a one-shot CPUParticles2D burst that throws 6 sparks radially.
# All three timed against DURATION; queue_frees at the end.
#
# Halo decays on t² (lingers visible most of the lifetime then dies),
# core decays on t³ (slow then snaps to 0) — same asymmetric-decay
# trick as the iter-13 slash_arc / iter-13 dash_impact, so the kit
# reads cohesively.
extends Node2D

const DURATION: float = 0.18
const HALO_SCALE_END: float = 1.7
const CORE_SCALE_END: float = 1.3

@onready var _halo: Polygon2D = $Halo
@onready var _core: Polygon2D = $Core

var _elapsed: float = 0.0
var _halo_base_alpha: float = 1.0
var _core_base_alpha: float = 1.0

func _ready() -> void:
	if _halo != null:
		_halo_base_alpha = _halo.color.a
	if _core != null:
		_core_base_alpha = _core.color.a

func _process(delta: float) -> void:
	_elapsed += delta
	var t: float = _elapsed / DURATION
	if t >= 1.0:
		queue_free()
		return
	# Ease-out scale on both shapes — snaps outward fast, then settles.
	var s_t: float = 1.0 - pow(1.0 - t, 2.0)
	var halo_s: float = 1.0 + (HALO_SCALE_END - 1.0) * s_t
	var core_s: float = 1.0 + (CORE_SCALE_END - 1.0) * s_t
	if _halo != null:
		_halo.scale = Vector2(halo_s, halo_s)
		var halo_col: Color = _halo.color
		halo_col.a = _halo_base_alpha * (1.0 - pow(t, 2.0))
		_halo.color = halo_col
	if _core != null:
		_core.scale = Vector2(core_s, core_s)
		var core_col: Color = _core.color
		core_col.a = _core_base_alpha * (1.0 - pow(t, 3.0))
		_core.color = core_col
