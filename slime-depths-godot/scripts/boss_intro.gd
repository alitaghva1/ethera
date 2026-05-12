# BossIntro — wizard-kit sprint 3 cinematic boss name card. Spawned by
# main.gd from the boss-spawn path in _spawn_enemy_type the FIRST tick
# of the room a boss appears in. Reads as: a brief letterbox + radial
# vignette + LETTERSPACED boss name in cream-gold + role subtitle, holds
# ~1.6s, fades. Total ~2.3s, full-screen, layer = 48.
#
# Why a dedicated cinematic card on top of the existing iter-22 banner:
# - Iter 22's _show_boss_intro_banner is a small red text pop ("BOSS NAME"
#   in 72px red, 1.45s total). Sufficient for "a boss arrived" but reads
#   as wave-banner-tier rather than a cinematic moment. The wizard-kit
#   pass adds a SECOND layer: letterbox bars + manuscript hairlines +
#   letterspaced cream-gold typography + subtitle line — so the boss
#   ARRIVAL gets the same gravitas as iter-71's FLOOR CLEAR variant B
#   gets on the celebration side.
# - The iter-22 banner stays in place underneath (it pairs with the
#   FX.shake punctuation and serves as a redundant accessibility cue
#   for the red-tinted "this is dangerous" beat). This new card runs
#   ABOVE it via layer = 48 (iter-71's floor_clear_burst is 45, the
#   iter-22 banner is 40, the death overlay is 50 — 48 fits neatly in
#   that stack so this card sits over both intros but below "you died").
#
# Why scripted-construction over baked nodes (matches floor_clear_burst):
# - The card is built from atomic pieces (two letterbox Polygon2Ds, two
#   hairline Polygon2Ds, two Labels) all built in code. Same precedent
#   as floor_clear_burst.gd / chain_arc.gd — scene is a stub, _ready
#   does the scaffolding. Tweens self-free via tween_callback.
#
# Spawn convention (iter 61's test-mode-safe pattern, mirrors
# PickupBanner.spawn / FloorClearBurst.spawn):
#   BossIntro.spawn(host: Node, boss_name: String) -> Node
class_name BossIntro
extends Node

# CanvasLayer layer index. 48 = above iter-71's floor_clear_burst (45)
# and the iter-22 banner (40), below the death overlay (50). The boss
# intro is a transient cinematic — death (if it somehow lands on the
# same frame) still wins.
const LAYER_INDEX: int = 48

# ── Timing ───────────────────────────────────────────────────────────
const FADE_IN_DUR: float  = 0.25
const HOLD_DUR: float     = 1.60
const FADE_OUT_DUR: float = 0.45
# Total lifetime = FADE_IN + HOLD + FADE_OUT = 2.30s

# ── Palette — matches iter-22 / iter-71 cream-gold typography family ─
const COLOR_NAME: Color     = Color(0.92, 0.84, 0.62, 1.0)   # cream-gold
const COLOR_SUBTITLE: Color = Color(0.78, 0.72, 0.55, 1.0)   # dim cream
const COLOR_HAIRLINE: Color = Color(0.92, 0.84, 0.62, 0.55)  # faint cream
const COLOR_LETTERBOX: Color = Color(0, 0, 0, 0.58)          # cinematic black
const COLOR_VIGNETTE: Color = Color(0, 0, 0, 0.32)           # subtle focus

# ── Layout ───────────────────────────────────────────────────────────
const NAME_FONT_SIZE: int     = 68
const SUBTITLE_FONT_SIZE: int = 22
# Letterbox bands — top + bottom. Each ~18% of screen height; combined
# they read as cinematic-2.39 letterboxing without obscuring too much
# of the world below.
const LETTERBOX_FRACTION: float = 0.18
# Name positioned at ~40% from screen top (matches the spec).
const NAME_VERTICAL_ANCHOR: float = 0.40
const SUBTITLE_OFFSET_PX: float = 56.0
# Manuscript hairlines above + below the name — short horizontal lines
# echoing the iter-70 main-menu corner-flourish grammar. 280 px long,
# 2 px thick, faint cream.
const HAIRLINE_WIDTH: float  = 280.0
const HAIRLINE_HEIGHT: float = 2.0
const HAIRLINE_GAP_PX: float = 22.0   # gap between name baseline and hairline

# ── Subtitle dictionary ──────────────────────────────────────────────
# Hardcoded one-liner role per known boss display_name. Synthesized
# from each boss's lore-feel rather than read from an EnemyType field
# (EnemyType.gd has no subtitle field — adding one would push past the
# strict-scope edit boundary). Lookup is case-insensitive via .to_lower
# before matching. Unknown bosses get no subtitle (just the name + the
# hairlines look fine on their own).
const SUBTITLES: Dictionary = {
	"broodmother":   "Mother of the Crypt Brood",
	"iron revenant": "Captain of Forgotten Wars",
	# Future bosses: add their display_name (lowercased) here.
}

# Configured by spawn() BEFORE add_child so _ready sees them.
var boss_name: String = ""

# Static entry point — instantiates the .tscn, sets the name, parents
# under `host`, returns the instance. _ready does the actual scaffolding
# so the boss_name is locked in BEFORE add_child.
#
# `host` is typically main.gd; tests pass a SceneTree root. Either way
# the intro lives as a child of whatever passed in, so it queue_frees
# cleanly when the parent does.
static func spawn(host: Node, boss_display_name: String) -> Node:
	if host == null or not is_instance_valid(host):
		return null
	if boss_display_name == null or boss_display_name == "":
		return null
	var scene: PackedScene = load("res://scenes/boss_intro.tscn")
	if scene == null:
		push_warning("BossIntro: boss_intro.tscn failed to load")
		return null
	var inst: Node = scene.instantiate()
	if inst == null:
		return null
	# Set BEFORE add_child so _ready sees the correct name.
	inst.set("boss_name", boss_display_name)
	host.add_child(inst)
	return inst

func _ready() -> void:
	_build()

func _build() -> void:
	var layer: CanvasLayer = CanvasLayer.new()
	layer.layer = LAYER_INDEX
	add_child(layer)

	# Viewport dimensions for cinematic letterbox + centered text.
	# Pulled from the viewport so a future resolution change is auto-
	# tracked (same pattern floor_clear_burst.gd uses).
	var vp_size: Vector2 = get_viewport().get_visible_rect().size
	var screen_center_x: float = vp_size.x * 0.5

	# ── Layer 1: subtle radial vignette ─────────────────────────────
	# Big faint dark circle centered on the name — focuses the eye on
	# the title without going full-darken (combat continues underneath).
	var vignette: Polygon2D = _make_circle(vp_size.x * 0.55, 48)
	vignette.color = COLOR_VIGNETTE
	vignette.position = Vector2(screen_center_x, vp_size.y * NAME_VERTICAL_ANCHOR)
	layer.add_child(vignette)

	# ── Layer 2: top + bottom letterbox bars ────────────────────────
	# Polygon2D rectangles spanning the screen width. Each band is
	# ~18% of screen height; together they read as a cinematic-2.39
	# crop without fully obscuring gameplay underneath.
	var band_h: float = vp_size.y * LETTERBOX_FRACTION
	var top_band: Polygon2D = _make_rect(vp_size.x, band_h)
	top_band.color = COLOR_LETTERBOX
	top_band.position = Vector2(0, 0)
	layer.add_child(top_band)

	var bottom_band: Polygon2D = _make_rect(vp_size.x, band_h)
	bottom_band.color = COLOR_LETTERBOX
	bottom_band.position = Vector2(0, vp_size.y - band_h)
	layer.add_child(bottom_band)

	# ── Layer 3: hairlines above + below the name ───────────────────
	# Short cream rectangles that frame the title like a manuscript
	# flourish. Same grammar as iter-70's main-menu corner flourishes.
	var hairline_top: Polygon2D = _make_rect(HAIRLINE_WIDTH, HAIRLINE_HEIGHT)
	hairline_top.color = COLOR_HAIRLINE
	hairline_top.position = Vector2(
		screen_center_x - HAIRLINE_WIDTH * 0.5,
		vp_size.y * NAME_VERTICAL_ANCHOR - NAME_FONT_SIZE * 0.5 - HAIRLINE_GAP_PX - HAIRLINE_HEIGHT
	)
	layer.add_child(hairline_top)

	var hairline_bottom: Polygon2D = _make_rect(HAIRLINE_WIDTH, HAIRLINE_HEIGHT)
	hairline_bottom.color = COLOR_HAIRLINE
	hairline_bottom.position = Vector2(
		screen_center_x - HAIRLINE_WIDTH * 0.5,
		vp_size.y * NAME_VERTICAL_ANCHOR + NAME_FONT_SIZE * 0.5 + HAIRLINE_GAP_PX + SUBTITLE_OFFSET_PX
	)
	layer.add_child(hairline_bottom)

	# ── Layer 4: the boss NAME ──────────────────────────────────────
	# Letterspaced manually — Godot 4 Label has no native letter-spacing
	# override, so we inject "  " (2 spaces) between every character.
	# This mirrors the iter-71 pickup banner HEADER row + FLAVOR tag
	# style and reads as a deliberate cinematic typography choice.
	var name_lbl: Label = _make_label(
		_letterspace(boss_name.to_upper()), NAME_FONT_SIZE, COLOR_NAME)
	name_lbl.anchor_left = 0.0
	name_lbl.anchor_right = 1.0
	name_lbl.anchor_top = NAME_VERTICAL_ANCHOR
	name_lbl.anchor_bottom = NAME_VERTICAL_ANCHOR
	name_lbl.offset_top = -NAME_FONT_SIZE * 0.6
	name_lbl.offset_bottom = NAME_FONT_SIZE * 0.6
	name_lbl.modulate = Color(1, 1, 1, 0)
	# Pulse pivot at the visual center of the label (1/2 viewport
	# width, half-height of the label box).
	name_lbl.pivot_offset = Vector2(vp_size.x * 0.5, NAME_FONT_SIZE * 0.6)
	layer.add_child(name_lbl)

	# ── Layer 5: optional SUBTITLE ──────────────────────────────────
	var subtitle_text: String = SUBTITLES.get(boss_name.to_lower(), "")
	var subtitle_lbl: Label = null
	if subtitle_text != "":
		subtitle_lbl = _make_label(
			_letterspace(subtitle_text.to_upper()),
			SUBTITLE_FONT_SIZE, COLOR_SUBTITLE)
		subtitle_lbl.anchor_left = 0.0
		subtitle_lbl.anchor_right = 1.0
		subtitle_lbl.anchor_top = NAME_VERTICAL_ANCHOR
		subtitle_lbl.anchor_bottom = NAME_VERTICAL_ANCHOR
		subtitle_lbl.offset_top = NAME_FONT_SIZE * 0.6 + 6.0
		subtitle_lbl.offset_bottom = NAME_FONT_SIZE * 0.6 + 6.0 + SUBTITLE_OFFSET_PX
		subtitle_lbl.modulate = Color(1, 1, 1, 0)
		layer.add_child(subtitle_lbl)

	# ── Animation timeline ───────────────────────────────────────────
	# Group everything as children of `layer`, then tween the whole
	# layer's alpha via a Control wrapper. Easier: tween each piece's
	# modulate.a in parallel — letterbox + hairlines + vignette + name
	# all share the same lifetime, so a single tween over a list works.
	var fade_targets: Array = [
		vignette, top_band, bottom_band,
		hairline_top, hairline_bottom, name_lbl,
	]
	if subtitle_lbl != null:
		fade_targets.append(subtitle_lbl)

	# Start every target at alpha 0 (the polygons need explicit alpha
	# overrides since their `color` already includes alpha; tween
	# `modulate:a` so the underlying color stays the design value and
	# only the layer modulation animates).
	for tgt in fade_targets:
		tgt.modulate = Color(1, 1, 1, 0)

	# Fade-in: 0 → 1 over FADE_IN_DUR for every layer in parallel.
	var fade_in: Tween = create_tween().set_parallel(true)
	for tgt in fade_targets:
		fade_in.tween_property(tgt, "modulate:a", 1.0, FADE_IN_DUR)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)

	# Gentle pulse on the name during the hold: 1.0 → 1.04 → 1.0 over
	# the full HOLD_DUR. Reads as "the name BREATHES" rather than
	# a static text plate. Runs on its own tween so it can use sinusoidal
	# easing without arguing with the alpha pipeline.
	name_lbl.scale = Vector2(1.0, 1.0)
	var pulse: Tween = create_tween()
	pulse.tween_interval(FADE_IN_DUR)
	pulse.tween_property(name_lbl, "scale", Vector2(1.04, 1.04), HOLD_DUR * 0.5)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	pulse.tween_property(name_lbl, "scale", Vector2(1.0, 1.0), HOLD_DUR * 0.5)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)

	# Hold + fade-out timeline. Single sequential tween scheduling the
	# fade-out for every target in parallel after the hold completes.
	var sched: Tween = create_tween()
	sched.tween_interval(FADE_IN_DUR + HOLD_DUR)
	var fade_out_step: Callable = func ():
		var t: Tween = create_tween().set_parallel(true)
		for tgt in fade_targets:
			t.tween_property(tgt, "modulate:a", 0.0, FADE_OUT_DUR)\
				.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	sched.tween_callback(fade_out_step)
	# Self-free after the full lifetime — schedule a frame past fade-out
	# end so the tween above gets to complete cleanly first.
	sched.tween_interval(FADE_OUT_DUR + 0.05)
	sched.tween_callback(queue_free)

# ── Helpers ──────────────────────────────────────────────────────────

# Letter-space a string by injecting two spaces between every character.
# Mirrors the iter-71 pickup banner "R E L I C   A C Q U I R E D" header.
# Empty / one-char strings pass through unchanged.
func _letterspace(s: String) -> String:
	if s.length() < 2:
		return s
	var out: String = ""
	for i in s.length():
		if i > 0:
			out += "  "
		out += s[i]
	return out

# Build a centered cream-gold Label with outline. Same styling grammar
# as the iter-22 banner + iter-71 floor_clear_burst._make_label, so
# this card reads as part of the same UI typography family.
func _make_label(text: String, font_size: int, color: Color) -> Label:
	var lbl: Label = Label.new()
	lbl.text = text
	lbl.add_theme_font_size_override("font_size", font_size)
	lbl.add_theme_color_override("font_color", color)
	lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
	lbl.add_theme_constant_override("outline_size", maxi(4, font_size / 12))
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return lbl

# Build a Polygon2D rectangle of width w, height h, with origin at
# the top-left corner. Caller sets `position` + `color`. Used for the
# letterbox bands and the hairline flourishes.
func _make_rect(w: float, h: float) -> Polygon2D:
	var poly: Polygon2D = Polygon2D.new()
	var verts: PackedVector2Array = PackedVector2Array()
	verts.append(Vector2(0, 0))
	verts.append(Vector2(w, 0))
	verts.append(Vector2(w, h))
	verts.append(Vector2(0, h))
	poly.polygon = verts
	return poly

# Build a closed circle Polygon2D at radius r with `segments` vertices.
# Used for the subtle vignette. Same circle-points helper as
# floor_clear_burst._make_circle and shock_pulse — keeps the FX kit's
# geometry math in one shape grammar.
func _make_circle(r: float, segments: int) -> Polygon2D:
	var poly: Polygon2D = Polygon2D.new()
	var verts: PackedVector2Array = PackedVector2Array()
	for i in range(segments):
		var a: float = (TAU / float(segments)) * float(i)
		verts.append(Vector2(cos(a), sin(a)) * r)
	poly.polygon = verts
	return poly
