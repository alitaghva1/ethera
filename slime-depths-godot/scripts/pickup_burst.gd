# PickupBurst — gold concentric shockwave + radial gold spark spray for
# relic / shrine pickups (iter-143). Mirrors death_pulse.gd's shape (two
# concentric Line2D rings scaling outward + alpha fade) but tuned for a
# CELEBRATION beat rather than a death event:
#
#   • DURATION 0.4s (vs death_pulse's 0.6s, dash_impact's 0.3s). Sits
#     between them — pickups deserve more than a poke but should clear
#     fast so the player can move on. Combat-pickup rooms also exist
#     (boss-clear pedestal pop) — a 0.6s burst would still be ringing
#     when the next wave should start.
#
#   • Final ring scale 2.75× off a base radius of 16 → ~44 px outer
#     edge. Smaller than death_pulse (~80) so it doesn't read as "you
#     killed something" — pickups are celebratory, not violent.
#
#   • Gold palette (cream-gold core, deep amber halo). Distinct from
#     the salmon/red death-burst family and from the white/red crit
#     splash family. Matches the +1 damage-number gold (#f4d9a0) and
#     the hit_spark gold — same "you gained something" semantic.
#
# Spawned by fx.gd._on_pickup_claimed when the pickup is a RELIC or
# SHRINE pickup (not "gold" chest pickups — those keep the smaller
# hit_spark behavior so the gold drop frequency doesn't visually
# inflate). Parented to the current scene (room) so it persists at the
# pedestal position even if the hero moves on.
extends Node2D

const DURATION: float = 0.4
const RING_SCALE_END: float = 2.75

@onready var _halo: Line2D = $Halo
@onready var _core: Line2D = $Core

var _elapsed: float = 0.0
var _halo_base_alpha: float = 1.0
var _core_base_alpha: float = 1.0

func _ready() -> void:
	# z_index 2 matches the rest of the iter-60+ ring FX layer
	# (dash_impact, parry_pulse, shock_pulse, death_pulse). Pickup is
	# celebratory but still a ring effect — not always-on-top.
	z_index = 2
	if _halo != null:
		_halo_base_alpha = _halo.default_color.a
	if _core != null:
		_core_base_alpha = _core.default_color.a

func _process(delta: float) -> void:
	_elapsed += delta
	var t: float = clampf(_elapsed / DURATION, 0.0, 1.0)
	if t >= 1.0:
		queue_free()
		return
	# Ease-out scale grow. Slightly sharper exponent (2.0) than
	# death_pulse (1.8) — celebrations should snap, not breathe.
	var s_t: float = 1.0 - pow(1.0 - t, 2.0)
	var s: float = 1.0 + (RING_SCALE_END - 1.0) * s_t
	scale = Vector2(s, s)
	# Asymmetric fade — halo dies faster so the inner core reads as
	# the advancing edge of the wave. Same trick as the death/dash
	# rings; consistent visual grammar.
	var halo_fade: float = 1.0 - pow(t, 2.0)
	var core_fade: float = 1.0 - pow(t, 1.4)
	if _halo != null:
		var halo_col: Color = _halo.default_color
		halo_col.a = _halo_base_alpha * halo_fade
		_halo.default_color = halo_col
	if _core != null:
		var core_col: Color = _core.default_color
		core_col.a = _core_base_alpha * core_fade
		_core.default_color = core_col
