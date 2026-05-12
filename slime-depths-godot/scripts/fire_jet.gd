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

# Cached visual children — flame body + halo + base ember + ground
# footprint + pre-fire spark (the last two are the iter-readability pass
# additions: persistent footprint so the hazard tile is readable in idle,
# and a bright spark that pops in the back-half of telegraph for a
# sharper "fire RIGHT NOW" cue).
@onready var _flame_body: Polygon2D = $FlameBody
@onready var _flame_halo: Polygon2D = $FlameHalo
@onready var _base_ember: Polygon2D = $BaseEmber
@onready var _warmup_col: Polygon2D = $WarmupColumn
@onready var _ground_footprint: Polygon2D = $GroundFootprint
@onready var _pre_fire_spark: Polygon2D = $PreFireSpark
# iter-85 — particle emitters for rising embers + smoke. Toggled per
# phase below: both OFF during IDLE/TELEGRAPH, both ON during the
# damaging ON phase. The scene defines them with emitting=false; we
# flip emitting at phase transitions in _update_visuals.
@onready var _rising_embers: CPUParticles2D = $RisingEmbers
@onready var _smoke_wisps: CPUParticles2D = $SmokeWisps
# Base (non-wobbled) polygon points captured in _ready. _update_visuals
# during ON writes a wobbled copy back into FlameBody.polygon /
# FlameHalo.polygon — per-vertex sine wobble perpendicular to the
# vertex's outward direction. Replaces the iter-31 scale.y flicker
# which read as "rectangle stretching" not "fire licking upward."
var _flame_body_base: PackedVector2Array
var _flame_halo_base: PackedVector2Array

# iter-85 wobble tuning. Amplitude clamped low enough that the flame's
# outline still reads as "vertical column" not "blob," but high enough
# that consecutive frames have visibly different silhouettes.
const FLAME_WOBBLE_AMPLITUDE: float = 1.8     # max px offset per vertex
const FLAME_WOBBLE_FREQ_HZ: float = 18.0      # how fast vertices wiggle
# Per-vertex phase offset so adjacent vertices don't sync — gives the
# flame its "licking" feel instead of a uniform breath.
const FLAME_WOBBLE_PHASE_STRIDE: float = 1.37

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)
	# iter-85 — cache the base polygon shape for FlameBody + FlameHalo
	# so the per-frame wobble can offset from a stable reference.
	# Without this, wobble would accumulate across frames into a chaotic
	# blob within a few seconds.
	_flame_body_base = _flame_body.polygon.duplicate()
	_flame_halo_base = _flame_halo.polygon.duplicate()
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
				# iter-70 polish: knockback away from the jet base.
				_hero.take_damage(DAMAGE_PER_TICK, global_position)
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
# of OFF; main flame body + halo only show when ON. Base ember + ground
# footprint always show so the emitter tile is discoverable.
#
# Three visible states the player must read at a glance:
#   IDLE        — dim charred footprint + dim base ember (orange-brown).
#   TELEGRAPH   — footprint reddens, base ember brightens, warmup column
#                 grows vertically. Back half adds a bright yellow spark
#                 pop on the base — "fire NOW" prompt.
#   ON          — full flame body + halo + bright yellow footprint flash.
func _update_visuals(_delta: float) -> void:
	if _is_on:
		_flame_body.visible = true
		_flame_halo.visible = true
		_warmup_col.visible = false
		_pre_fire_spark.visible = false
		# iter-85 — per-vertex wobble + particle emitters. The flame
		# now consists of:
		#   • FlameBody/Halo polygons with per-vertex sine wobble
		#     (each vertex offset perpendicular to its position vector,
		#     unique phase per vertex via FLAME_WOBBLE_PHASE_STRIDE).
		#   • RisingEmbers CPUParticles2D shooting up from the base.
		#   • SmokeWisps CPUParticles2D drifting from the column top.
		# Together they read as "burning fuel" — vertical column +
		# escaping bits + smoke trail — not "scale-flickering rectangle."
		_flame_body.polygon = _wobble_polygon(_flame_body_base)
		_flame_halo.polygon = _wobble_polygon(_flame_halo_base)
		# Subtle scale flicker on the halo kept as a secondary breath
		# (just on the alpha/modulate, not on shape, since shape is
		# now driven by the vertex wobble).
		var on_t: float = (_t - PHASE_OFF_TIME) / PHASE_ON_TIME
		var halo_flicker: float = 0.85 + 0.15 * sin(on_t * 22.0)
		_flame_halo.modulate.a = halo_flicker
		# Particle emitters ON during the burn.
		if _rising_embers != null and not _rising_embers.emitting:
			_rising_embers.emitting = true
		if _smoke_wisps != null and not _smoke_wisps.emitting:
			_smoke_wisps.emitting = true
		_base_ember.color = Color(1.0, 0.85, 0.45, 1.0)
		var fp_pulse: float = 0.85 + 0.15 * sin(on_t * 32.0)
		_ground_footprint.color = Color(1.0, 0.62, 0.18, fp_pulse)
		_ground_footprint.scale = Vector2(1.20, 1.20)
	else:
		_flame_body.visible = false
		_flame_halo.visible = false
		# iter-85 — turn off particle emitters when OFF/TELEGRAPH.
		# CPUParticles2D.emitting = false stops NEW emissions but lets
		# existing particles finish their lifetime — natural fade-out.
		if _rising_embers != null and _rising_embers.emitting:
			_rising_embers.emitting = false
		if _smoke_wisps != null and _smoke_wisps.emitting:
			_smoke_wisps.emitting = false
		var time_until_on: float = PHASE_OFF_TIME - _t
		if time_until_on <= TELEGRAPH_TIME:
			# Telegraph: warmup column fades in + grows vertically
			# from the base. Player sees "this is going to fire here"
			# with enough time to step off.
			var telegraph_t: float = 1.0 - (time_until_on / TELEGRAPH_TIME)
			_warmup_col.visible = true
			_warmup_col.scale = Vector2(1.0, telegraph_t)
			_warmup_col.modulate = Color(1.0, 0.7, 0.35, 0.45 + 0.50 * telegraph_t)
			# Base ember also brightens as ignition approaches.
			var ember_glow: float = 0.55 + 0.45 * telegraph_t
			_base_ember.color = Color(0.95, 0.55, 0.18, ember_glow)
			# Ground footprint ramps from charred brown → hot orange across
			# the telegraph window. Reds out the FLOOR even before the
			# column erupts so a colorblind player still reads the threat.
			var fp_r: float = 0.45 + 0.55 * telegraph_t
			var fp_g: float = 0.20 + 0.35 * telegraph_t
			var fp_b: float = 0.10
			var fp_a: float = 0.55 + 0.35 * telegraph_t
			_ground_footprint.color = Color(fp_r, fp_g, fp_b, fp_a)
			_ground_footprint.scale = Vector2(1.0 + 0.18 * telegraph_t, 1.0 + 0.18 * telegraph_t)
			# Pre-fire spark pops in the BACK HALF of telegraph (last ~0.25s
			# of OFF). Quick scale + alpha pulse — sharper "fire NOW" cue.
			if telegraph_t > 0.5:
				_pre_fire_spark.visible = true
				var spark_t: float = (telegraph_t - 0.5) * 2.0   # 0..1 across back half
				var spark_pulse: float = 0.7 + 0.3 * sin(spark_t * 24.0)
				_pre_fire_spark.modulate = Color(1.0, 1.0, 1.0, spark_pulse)
				_pre_fire_spark.scale = Vector2(0.8 + 0.6 * spark_t, 0.8 + 0.6 * spark_t)
			else:
				_pre_fire_spark.visible = false
		else:
			_warmup_col.visible = false
			_pre_fire_spark.visible = false
			_base_ember.color = Color(0.7, 0.35, 0.10, 0.75)
			# IDLE footprint: dim charred mark, scale 1.0. Persistent
			# but quiet — the tile is unsafe but not actively threatening.
			_ground_footprint.color = Color(0.45, 0.20, 0.10, 0.55)
			_ground_footprint.scale = Vector2(1.0, 1.0)

# iter-85 — per-vertex wobble helper. For each vertex in the base
# polygon, computes an offset perpendicular to the vertex's
# direction-from-origin (so the wobble pushes the silhouette IN/OUT,
# not stretches it along its length). Sine-driven with per-vertex
# phase stride so adjacent vertices wiggle independently — the
# flame's outline reads as "licking" not "breathing as a single shape."
func _wobble_polygon(base: PackedVector2Array) -> PackedVector2Array:
	var out: PackedVector2Array = base.duplicate()
	var time: float = _t
	for i in range(out.size()):
		var p: Vector2 = base[i]
		# Vertex direction from local origin (0, 0). Skip near-origin
		# vertices (the base of the flame); they should stay anchored
		# so the column doesn't float off its source.
		var dist: float = p.length()
		if dist < 4.0:
			continue
		var dir: Vector2 = p / dist
		# Perpendicular direction (rotate 90° CCW: (-y, x))
		var perp: Vector2 = Vector2(-dir.y, dir.x)
		# Wobble amount scales linearly with distance from base so the
		# tip wiggles more than the base (real fire tongues are wider
		# at the tip's tongue).
		var amp: float = FLAME_WOBBLE_AMPLITUDE * (dist / 90.0)
		var phase: float = time * FLAME_WOBBLE_FREQ_HZ + float(i) * FLAME_WOBBLE_PHASE_STRIDE
		out[i] = p + perp * sin(phase) * amp
	return out
