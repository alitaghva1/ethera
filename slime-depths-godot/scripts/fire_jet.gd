# FireJet — iter 31. Cyclic vertical flame column hazard. Spends most
# of its cycle OFF (with a low warmup glow that brightens as the next
# spurt approaches), then erupts ON for a short window during which
# standing on it ticks damage. Unlike spike_pit (static, punishes any
# loitering), fire_jet creates rhythm — there are SAFE windows the
# player learns to step through.
#
# Cycle:
#   PHASE_OFF (1.8s) — emitter is a quiet ember pip on the floor.
#                      In the final ~0.5s the pip grows + warmup
#                      column flickers up as a telegraph.
#   PHASE_ON  (0.6s) — column erupts to full height with bright body
#                      + outer halo. While ON, hero in zone takes
#                      DAMAGE_PER_TICK every TICK_INTERVAL seconds
#                      (first tick immediate on entry-or-erupt).
#   Loop forever.
#
# `phase` (0..1) shifts the cycle start so adjacent jets in the same
# room don't pulse in lockstep — staggered jets force the player to
# read each one independently rather than memorize a single beat.
extends Area2D

const PHASE_OFF_TIME: float = 1.8
const PHASE_ON_TIME: float = 0.6
const TELEGRAPH_TIME: float = 0.5  # final slice of OFF that ramps the warmup column
const DAMAGE_PER_TICK: int = 1
const TICK_INTERVAL: float = 0.25  # while ON: damage cadence

# Column geometry: drawn as a tall vertical rect. Width is the
# narrow base of the flame; height is how far up the column reaches.
const COLUMN_HALF_W: float = 12.0
const COLUMN_HEIGHT: float = 88.0

# Phase offset (0..1, fraction of full cycle) so a row of jets staggers.
var phase: float = 0.0

var _t: float = 0.0
var _is_on: bool = false
var _hero: Node2D = null
var _hero_inside: bool = false
var _tick_timer: float = 0.0

# Cached visual children — flame body + halo + base ember.
@onready var _flame_body: Polygon2D = $FlameBody
@onready var _flame_halo: Polygon2D = $FlameHalo
@onready var _base_ember: Polygon2D = $BaseEmber
@onready var _warmup_col: Polygon2D = $WarmupColumn

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)
	# Apply phase offset — a 0.5 phase means we start halfway through
	# the OFF phase, so adjacent jets eg at phase 0.0 and 0.5 will
	# erupt out-of-sync (the second jet fires ~0.9s after the first
	# rather than simultaneously).
	var cycle_total: float = PHASE_OFF_TIME + PHASE_ON_TIME
	_t = clampf(phase, 0.0, 1.0) * cycle_total
	_update_visuals(0.0)

func _physics_process(delta: float) -> void:
	_t += delta
	var cycle_total: float = PHASE_OFF_TIME + PHASE_ON_TIME
	if _t >= cycle_total:
		_t -= cycle_total
	var was_on: bool = _is_on
	_is_on = _t >= PHASE_OFF_TIME
	if _is_on and not was_on:
		# Erupt — reset tick timer so the first tick is immediate
		# (if hero is already standing in the zone).
		_tick_timer = 0.0
	_update_visuals(delta)

	if _is_on and _hero_inside:
		_tick_timer -= delta
		if _tick_timer <= 0.0:
			if _hero != null and is_instance_valid(_hero) and _hero.has_method("take_damage"):
				_hero.take_damage(DAMAGE_PER_TICK)
			_tick_timer = TICK_INTERVAL

func _on_body_entered(body: Node) -> void:
	if body.is_in_group("hero"):
		_hero = body
		_hero_inside = true
		_tick_timer = 0.0  # eat the first tick on entry-while-on

func _on_body_exited(body: Node) -> void:
	if body.is_in_group("hero"):
		_hero_inside = false

# Visual update: warmup column grows during the last TELEGRAPH_TIME
# of OFF; main flame body + halo only show when ON. Base ember always
# shows so the emitter is always discoverable on the floor.
func _update_visuals(_delta: float) -> void:
	if _is_on:
		_flame_body.visible = true
		_flame_halo.visible = true
		_warmup_col.visible = false
		# Quick flicker — scale jitter on the body so the flame
		# reads as alive, not a static rectangle.
		var on_t: float = (_t - PHASE_OFF_TIME) / PHASE_ON_TIME
		var flicker: float = 0.92 + 0.08 * sin(on_t * 28.0)
		_flame_body.scale = Vector2(1.0, flicker)
		_base_ember.color = Color(1.0, 0.85, 0.45, 1.0)
	else:
		_flame_body.visible = false
		_flame_halo.visible = false
		var time_until_on: float = PHASE_OFF_TIME - _t
		if time_until_on <= TELEGRAPH_TIME:
			# Telegraph: warmup column fades in + grows vertically
			# from the base. Player sees "this is going to fire here"
			# with enough time to step off.
			var telegraph_t: float = 1.0 - (time_until_on / TELEGRAPH_TIME)
			_warmup_col.visible = true
			_warmup_col.scale = Vector2(1.0, telegraph_t)
			_warmup_col.modulate = Color(1.0, 0.7, 0.35, 0.25 + 0.45 * telegraph_t)
			# Base ember also brightens as ignition approaches.
			var ember_glow: float = 0.55 + 0.45 * telegraph_t
			_base_ember.color = Color(0.95, 0.55, 0.18, ember_glow)
		else:
			_warmup_col.visible = false
			_base_ember.color = Color(0.7, 0.35, 0.10, 0.75)
