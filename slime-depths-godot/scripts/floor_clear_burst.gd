# FloorClearBurst — iter 71 ROOM-CLEAR / FLOOR-CLEAR celebration. Spawned
# from main.gd when a room is cleared. Two flavors via a single static
# spawn() entry point:
#
#   FloorClearBurst.spawn(host, big = false)   # "ROOM CLEAR" subtle
#   FloorClearBurst.spawn(host, big = true)    # "FLOOR/BOSS CLEAR" big
#
# Why one scene + one script for both flavors (rather than two scenes):
# - The visual grammar is shared — gold sparkles + cream-gold banner.
#   Only counts / lifetimes / sizes diverge. Keeping the variants in one
#   file makes future palette retunes (e.g. STORM-themed clear for the
#   storm boss) a single-file edit.
# - Matches chain_arc.gd / shock_pulse.gd's "minimal .tscn, .gd builds the
#   nodes" pattern. The iter-22 boss-intro banner code is the structural
#   reference for the CanvasLayer + Label + Tween scaffolding.
#
# Why CanvasLayer-rooted (rather than Node2D in world space):
# - The label needs to read centered on the SCREEN regardless of the
#   hero's world position (the camera may not be exactly at the room
#   center on clear, especially mid-dodge). CanvasLayer with anchor=0.5
#   gives us screen-space placement for free.
# - The particle cascade in variant B also needs screen-space coverage
#   (FROM TOP across full width). CPUParticles2D inside a CanvasLayer
#   reads in screen pixels directly — no camera math required.
#
# Stacking with iter-18 entry banner: the entry banner animates `room_label`
# (in $UI/RoomLabel) on _ready of a new room. This burst is on its own
# CanvasLayer above the HUD (layer = 45 — above wave-banner's 40, below
# the iter-22 death veil at 50). They never coexist in time (entry =
# room load, this = room clear), but even if they did, separate
# CanvasLayers prevent any conflict.
class_name FloorClearBurst
extends Node

# CanvasLayer layer index. 45 = above wave-banner (40), below death veil
# (50). Chosen so this beat reads as a punctuation moment but the death
# overlay (if the player somehow died on the same frame) still wins.
const LAYER_INDEX: int = 45

# ── Variant A (small "ROOM CLEAR") constants ────────────────────────
const SMALL_PARTICLE_COUNT: int = 30
const SMALL_PARTICLE_LIFETIME: float = 0.6
const SMALL_LABEL_TEXT: String = "ROOM CLEAR"
const SMALL_LABEL_FONT_SIZE: int = 24
const SMALL_FADE_IN: float = 0.15
const SMALL_HOLD: float = 0.8
const SMALL_FADE_OUT: float = 0.4
const SMALL_TOTAL_LIFETIME: float = 1.5

# ── Variant B (big "FLOOR/BOSS CLEAR") constants ────────────────────
# Particle count for the gold cascade. ~100 reads as "celebration"
# without overwhelming the player. Lifetime 2.5s with gentle gravity
# (40 px/s²) gives sparkles a slow drift down the screen.
const BIG_PARTICLE_COUNT: int = 100
const BIG_PARTICLE_LIFETIME: float = 2.5
const BIG_PARTICLE_GRAVITY: float = 40.0
const BIG_LABEL_FONT_SIZE: int = 56
const BIG_FADE_IN: float = 0.25
const BIG_HOLD: float = 1.7
const BIG_FADE_OUT: float = 0.6
const BIG_TOTAL_LIFETIME: float = 3.0
# Wash radius — circle Polygon2D under the banner, faint gold-cream,
# fades over 0.5s as a low-cost "the moment WHOMPHS" beat.
const BIG_WASH_RADIUS: float = 480.0
const BIG_WASH_DURATION: float = 0.5

# Palette — cream-gold for label, bright gold for particles. Matches
# the iter-22 banner palette (RUN COMPLETE, WAVE banner) so the kit
# reads cohesively. The cascade particles fade through warm amber so
# the cascade has temperature variation rather than flat gold.
const COLOR_GOLD_BRIGHT: Color = Color(1.0, 0.92, 0.45, 1.0)
const COLOR_LABEL_CREAM: Color = Color(1.0, 0.92, 0.7, 1.0)
const COLOR_WASH: Color = Color(1.0, 0.85, 0.35, 0.32)

# Configured by spawn(); read at _ready to pick a variant. Public so the
# scene can be inspected in tests; not @export — set at spawn time only.
var big: bool = false

# Static entry point — instantiates the .tscn, sets the variant flag,
# parents under `host`, returns the instance. _ready does the actual
# scaffolding so the variant is locked in BEFORE add_child.
#
# `host` is typically main.gd; tests pass a SceneTree root. Either way
# the burst lives as a child of whatever passed in, so it queue_frees
# cleanly when the parent does.
static func spawn(host: Node, big_clear: bool = false) -> Node:
	if host == null or not is_instance_valid(host):
		return null
	var scene: PackedScene = load("res://scenes/fx/floor_clear_burst.tscn")
	if scene == null:
		push_warning("FloorClearBurst: floor_clear_burst.tscn failed to load")
		return null
	var inst: Node = scene.instantiate()
	if inst == null:
		return null
	# Set BEFORE add_child so _ready sees the correct flag.
	inst.set("big", big_clear)
	host.add_child(inst)
	return inst

func _ready() -> void:
	if big:
		_build_big_variant()
	else:
		_build_small_variant()

# ── Variant A (subtle ROOM CLEAR) ────────────────────────────────────
# Small gold sparkle burst from screen center + one-line label above.
# Total lifetime 1.5s — fast enough that the player can keep moving
# through the door without waiting for the celebration to finish.
func _build_small_variant() -> void:
	var layer: CanvasLayer = CanvasLayer.new()
	layer.layer = LAYER_INDEX
	add_child(layer)

	# iter-72 bug-fix: viewport is 1280×720 (project.godot display/window/
	# size/viewport_height=720), not 768 as the original comment claimed.
	# 384 was 24 px below true screen center (which made the burst feel
	# slightly off when stacked against the iter-22 wave banner anchored
	# at anchor_top=0.42). Pull from the viewport rect so a future
	# resolution change is auto-tracked.
	var screen_center: Vector2 = get_viewport().get_visible_rect().size * 0.5

	# Sparkle burst — radial from screen center.
	var burst: CPUParticles2D = CPUParticles2D.new()
	burst.position = screen_center
	burst.amount = SMALL_PARTICLE_COUNT
	burst.lifetime = SMALL_PARTICLE_LIFETIME
	burst.one_shot = true
	burst.explosiveness = 0.85
	burst.spread = 180.0
	burst.direction = Vector2(0, -1)
	burst.initial_velocity_min = 60.0
	burst.initial_velocity_max = 140.0
	burst.gravity = Vector2(0, 60.0)
	burst.scale_amount_min = 1.6
	burst.scale_amount_max = 2.6
	burst.color = COLOR_GOLD_BRIGHT
	# Fade-out alpha curve so each sparkle softens at end-of-life.
	var grad: Gradient = Gradient.new()
	grad.add_point(0.0, Color(1.0, 0.95, 0.55, 1.0))
	grad.add_point(0.6, Color(1.0, 0.85, 0.35, 0.85))
	grad.add_point(1.0, Color(1.0, 0.75, 0.25, 0.0))
	burst.color_ramp = grad
	burst.emitting = true
	layer.add_child(burst)

	# Label — small, cream-gold, above the burst.
	var lbl: Label = _make_label(SMALL_LABEL_TEXT, SMALL_LABEL_FONT_SIZE)
	# Position the label a bit above center so it doesn't sit ON the
	# sparkle origin (would feel "the text is the explosion" rather
	# than "the explosion ANNOUNCES the text").
	lbl.anchor_top = 0.42
	lbl.anchor_bottom = 0.42
	lbl.offset_top = -22
	lbl.offset_bottom = 22
	lbl.modulate = Color(1, 1, 1, 0)
	layer.add_child(lbl)

	# Fade-in → hold → fade-out, then self-free.
	var tw: Tween = create_tween()
	tw.tween_property(lbl, "modulate:a", 1.0, SMALL_FADE_IN).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_interval(SMALL_HOLD)
	tw.tween_property(lbl, "modulate:a", 0.0, SMALL_FADE_OUT).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.tween_callback(queue_free)

# ── Variant B (BIG FLOOR/BOSS CLEAR) ─────────────────────────────────
# Gold cascade FROM TOP of screen + big pulsing banner + optional wash.
# ~3s total. Game continues underneath; this is pure visual celebration.
func _build_big_variant() -> void:
	var layer: CanvasLayer = CanvasLayer.new()
	layer.layer = LAYER_INDEX
	add_child(layer)

	# iter-72 bug-fix: same as _build_small_variant — viewport is 1280×720
	# not 1280×768, so the hardcoded 384 sat 24 px below true center.
	# Pull from the viewport for resolution independence.
	var vp_size: Vector2 = get_viewport().get_visible_rect().size
	var screen_center: Vector2 = vp_size * 0.5

	# Radial wash — Polygon2D circle, faint gold-cream, fades over 0.5s.
	# Built FIRST so it sits behind the banner + cascade in draw order.
	var wash: Polygon2D = _make_circle(BIG_WASH_RADIUS, 32)
	wash.color = COLOR_WASH
	wash.position = screen_center
	layer.add_child(wash)
	var wash_tw: Tween = create_tween()
	wash_tw.tween_property(wash, "modulate:a", 0.0, BIG_WASH_DURATION).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)

	# Cascade — CPUParticles2D emitting from a wide horizontal box at
	# screen TOP, falling DOWN with gentle gravity. Color ramp from
	# bright gold → warm amber → fade so the cascade has temperature
	# variation rather than flat gold flakes.
	var cascade: CPUParticles2D = CPUParticles2D.new()
	cascade.position = Vector2(screen_center.x, -40.0)  # just above the screen
	cascade.amount = BIG_PARTICLE_COUNT
	cascade.lifetime = BIG_PARTICLE_LIFETIME
	cascade.one_shot = true
	cascade.explosiveness = 0.4
	cascade.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	# iter-72 bug-fix: emission_rect_extents is HALF-width, so 640 covered
	# a 1280-wide band — matches viewport at 1280×720 today but pulled
	# from the viewport for resolution independence.
	cascade.emission_rect_extents = Vector2(vp_size.x * 0.5, 8.0)
	cascade.direction = Vector2(0, 1)
	cascade.spread = 18.0
	cascade.initial_velocity_min = 60.0
	cascade.initial_velocity_max = 140.0
	cascade.gravity = Vector2(0, BIG_PARTICLE_GRAVITY)
	cascade.scale_amount_min = 2.0
	cascade.scale_amount_max = 3.6
	cascade.color = COLOR_GOLD_BRIGHT
	var grad: Gradient = Gradient.new()
	grad.add_point(0.0, Color(1.0, 0.92, 0.45, 1.0))     # bright gold
	grad.add_point(0.55, Color(1.0, 0.72, 0.30, 0.85))   # warm amber
	grad.add_point(1.0, Color(1.0, 0.55, 0.20, 0.0))     # fade out
	cascade.color_ramp = grad
	cascade.emitting = true
	layer.add_child(cascade)

	# Banner text — "FLOOR CLEAR" by default; main.gd could
	# theoretically pass a future override (e.g. "BOSS DEFEATED") but
	# kept stable here so the iter-71 visual is consistent.
	var lbl: Label = _make_label("FLOOR CLEAR", BIG_LABEL_FONT_SIZE)
	lbl.anchor_top = 0.42
	lbl.anchor_bottom = 0.42
	lbl.offset_top = -48
	lbl.offset_bottom = 48
	lbl.modulate = Color(1, 1, 1, 0)
	# Scale start slightly large so the pulse reads as a punch-in.
	lbl.scale = Vector2(1.06, 1.06)
	layer.add_child(lbl)

	# Fade-in + pulse + hold + fade-out. Pulse = 1.0 → 1.05 → 1.0 over
	# 0.8s, run via a separate parallel tween so it loops independently
	# of the alpha hold.
	var alpha_tw: Tween = create_tween()
	alpha_tw.tween_property(lbl, "modulate:a", 1.0, BIG_FADE_IN).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	alpha_tw.tween_interval(BIG_HOLD)
	alpha_tw.tween_property(lbl, "modulate:a", 0.0, BIG_FADE_OUT).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	alpha_tw.tween_callback(queue_free)

	# Pulse scale 1.06 → 1.0 → 1.05 → 1.0 — parallel with alpha so the
	# breathing reads beneath the fade-in. Separate Tween so it can run
	# its own timing curve without arguing with the alpha sequence.
	var pulse_tw: Tween = create_tween()
	pulse_tw.tween_property(lbl, "scale", Vector2(1.0, 1.0), 0.4).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	pulse_tw.tween_property(lbl, "scale", Vector2(1.05, 1.05), 0.4).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	pulse_tw.tween_property(lbl, "scale", Vector2(1.0, 1.0), 0.4).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)

# ── Helpers ──────────────────────────────────────────────────────────

# Build a centered cream-gold Label with outline. Same styling grammar
# as the iter-22 _show_wave_banner / _show_boss_intro_banner labels so
# the celebration banner reads as part of the same UI family.
func _make_label(text: String, font_size: int) -> Label:
	var lbl: Label = Label.new()
	lbl.text = text
	lbl.add_theme_font_size_override("font_size", font_size)
	lbl.add_theme_color_override("font_color", COLOR_LABEL_CREAM)
	lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
	lbl.add_theme_constant_override("outline_size", maxi(4, font_size / 12))
	lbl.anchor_left = 0.5
	lbl.anchor_right = 0.5
	lbl.offset_left = -360
	lbl.offset_right = 360
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lbl.pivot_offset = Vector2(360, font_size)
	return lbl

# Build a closed circle Polygon2D at radius r with `segments` vertices.
# Used for the variant-B radial wash. Same circle-points helper as
# shock_pulse.gd uses for its rings — keeps the FX kit's geometry
# math in one shape grammar.
func _make_circle(r: float, segments: int) -> Polygon2D:
	var poly: Polygon2D = Polygon2D.new()
	var verts: PackedVector2Array = PackedVector2Array()
	for i in range(segments):
		var a: float = (TAU / float(segments)) * float(i)
		verts.append(Vector2(cos(a), sin(a)) * r)
	poly.polygon = verts
	return poly
