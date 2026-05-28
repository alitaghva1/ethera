# BoonModal — iter-259 / Wave 8 — VS-style level-up choice overlay.
#
# Spawned by main.gd::_show_level_up_choice() when the per-room XP bar
# hits 100%. Pauses the game, dims the world, shows 3 themed boon
# cards. Player MUST pick one — no ESC dismissal. Card click (or
# 1/2/3 hotkey) applies the boon's mods to GameState.shrine_bonuses,
# fades the UI, and unpauses.
#
# Architecture:
#   • Root is a CanvasLayer (set via boon_modal.tscn) at layer 175,
#     with process_mode = PROCESS_MODE_WHEN_PAUSED so the modal keeps
#     ticking while get_tree().paused freezes everything below.
#   • All children built CODE-SIDE in _ready — keeps the .tscn diff
#     trivial and lets the script own theming + layout in one place.
#   • Pause-flip lives entirely in this overlay: _ready sets
#     paused=true, _exit_tree resets paused=false as a safety net.
#     Same ownership pattern pause_screen.gd uses (see lines 64-66).
#
# Visual stack (z-order top to bottom):
#   1. Dimmer ColorRect — full-screen 0.62 alpha black
#   2. Particle veil (subtle gold embers, same texture as pause)
#   3. LEVEL UP banner — big cream-gold Cinzel-style, scale-bounces in
#   4. Three CardPanel children — themed border, glyph, name, desc
#   5. Hint label — "1 / 2 / 3 or click"
#
# Camera punch:
#   On _ready we tween the active Camera2D's zoom from current →
#   1.06 → current over 0.30s for a brief "the world contracts as
#   the moment crystallizes" beat. Reuses the camera-punch pattern
#   from main.gd::_punch_camera_for_boss_death.
extends CanvasLayer

# Explicit preload of the catalog. We could rely on the
# `class_name BoonCatalog` global registration in boon_catalog.gd, but
# Godot's class-name registry can lag behind on the very first headless
# parse (no .godot/global_script_class_cache.cfg yet) — preloading the
# script directly resolves the constants + static methods at parse time
# regardless of registry state. Same defensive pattern several other
# scripts in the project use.
const BoonCatalog: Script = preload("res://scripts/boon_catalog.gd")

# Card geometry — iter-260 / Wave 9 — bumped 280×360 → 300×400 to give
# the new tier label + theme glyph space to breathe. 3 × 300 + 2 × 32 =
# 964 px total content width, centered in 1280 px viewport (left edge
# at (1280-964)/2 = 158 px).
const CARD_WIDTH: float = 300.0
const CARD_HEIGHT: float = 400.0
const CARD_GAP: float = 32.0
# iter-260 — hover pop bumped from 1.05 → 1.08 so the difference reads
# more clearly on the larger card.
const CARD_HOVER_SCALE: float = 1.08
const CARD_HOVER_TWEEN_TIME: float = 0.14

# Card border alpha when not hovered / on hover. Stronger contrast on
# hover so the active pick reads instantly.
const CARD_BORDER_ALPHA_IDLE: float = 0.50
const CARD_BORDER_ALPHA_HOVER: float = 1.00

# iter-260 / Wave 9 — build-match halo. When the rolled boon's theme
# matches a theme the player owns ≥ 2 relics in, the card gets a
# warm-gold outer halo signaling "fits your build." Same threshold
# the catalog roll uses for theme bias.
const BUILD_MATCH_THRESHOLD: int = 2
const BUILD_MATCH_HALO_COLOR: Color = Color(1.0, 0.85, 0.55, 0.40)

# iter-260 / Wave 9 — theme glyph as a stylized Polygon2D rather than
# a single ASCII character. Reads clearer at 32 px and gives each
# theme a distinct silhouette. THEME_GLYPH_SHAPES maps theme id →
# array of Vector2 points (closed polygon, scaled at draw time).
const THEME_GLYPH_SIZE: float = 14.0  # half-extent; final glyph is 28×28 px
const THEME_GLYPH_SHAPES: Dictionary = {
	# STORM: square (electric crystalline node)
	"storm": [
		Vector2(-1.0, -1.0), Vector2(1.0, -1.0),
		Vector2(1.0, 1.0),   Vector2(-1.0, 1.0),
	],
	# FLAME: flame teardrop (tip up)
	"flame": [
		Vector2(0.0, -1.2),  Vector2(0.7, -0.2),
		Vector2(0.5, 0.6),   Vector2(0.0, 1.0),
		Vector2(-0.5, 0.6),  Vector2(-0.7, -0.2),
	],
	# BLOOD: drop (rounded bottom, pointed top)
	"blood": [
		Vector2(0.0, -1.1),  Vector2(0.55, 0.0),
		Vector2(0.7, 0.7),   Vector2(0.0, 1.0),
		Vector2(-0.7, 0.7),  Vector2(-0.55, 0.0),
	],
	# VOW: shield (top-rounded, base-tapered)
	"vow": [
		Vector2(-0.85, -0.9), Vector2(0.85, -0.9),
		Vector2(0.85, 0.15),  Vector2(0.0, 1.0),
		Vector2(-0.85, 0.15),
	],
	# SHADOW: crescent (waning moon)
	"shadow": [
		Vector2(0.85, -0.6),  Vector2(0.30, -1.0),
		Vector2(-0.50, -0.85), Vector2(-0.80, 0.0),
		Vector2(-0.50, 0.85),  Vector2(0.30, 1.0),
		Vector2(0.85, 0.6),    Vector2(0.10, 0.45),
		Vector2(-0.25, 0.0),   Vector2(0.10, -0.45),
	],
}

# Camera punch — slightly less than the boss-death zoom (1.06 vs 1.08)
# because level-up fires more often (every room when the bar fills) and
# a heavier punch would fatigue. Same back-to-base tween shape.
const CAMERA_ZOOM_PEAK_MUL: float = 1.06
const CAMERA_ZOOM_IN_TIME: float = 0.18
const CAMERA_ZOOM_OUT_TIME: float = 0.30

# Selection flow timing.
const SELECTION_GLOW_TIME: float = 0.20    # selected card pulses outward
const FADE_OUT_TIME: float = 0.30          # whole modal fades after pick
const BANNER_BOUNCE_TIME: float = 0.30     # LEVEL UP scale-in
const CARDS_FLY_IN_TIME: float = 0.32      # cards slide up + fade in

# Pre-resolved boon ids for this level-up. roll_three() runs once in
# _ready so re-rolls aren't possible — players can't fish for a better
# card slate by re-opening the modal.
var _boon_ids: Array[String] = []

# Per-card Control roots, indexed 0..2. Used by hotkey handler to
# resolve a key press to the right panel without re-querying by name.
var _card_panels: Array[Control] = []

# Has the player already locked in a pick? Guards against double-fire
# from a mouse_click + keyboard hotkey landing in the same frame.
var _selected: bool = false


func _ready() -> void:
	# Pause IMMEDIATELY — combat must freeze before we even build the
	# UI so the player sees the world stop the instant the modal
	# appears. process_mode on CanvasLayer = PROCESS_MODE_WHEN_PAUSED
	# (set by boon_modal.tscn) keeps the overlay alive past this flip.
	get_tree().paused = true

	# iter-260 / Wave 9 — switch to the new tier-weighted +
	# theme-biased roll. roll_boon_offers reads
	# GameState.level_ups_this_run (for the tier weight ramp) and
	# GameState.theme_count() (for the theme bias multiplier) so the
	# call is parameterless. Falls back to roll_three for any caller
	# that still passes a strongest_theme arg.
	var _strongest_unused: String = _resolve_strongest_theme()
	_boon_ids = BoonCatalog.roll_boon_offers(3)

	# Audio swell — broad brass-feel sweep. Plays at hero position
	# (or modal-center fallback) so positional audio reads as
	# enveloping rather than headphone-direct. The boon_unlocked
	# chime that fires on selection plays separately at click time.
	if Audio != null and Audio.has_method("_play"):
		Audio._play("level_up_swell", Vector2.ZERO, -2.0)

	_build_ui()
	_punch_camera_zoom_in()


# Defensive — if for any reason this overlay frees without routing
# through _on_card_selected (a scene_change pull-out, a quit, etc.),
# make sure the tree unpauses so the next scene runs. Mirrors
# pause_screen.gd::_exit_tree.
func _exit_tree() -> void:
	if get_tree() != null:
		get_tree().paused = false


# ── UI construction ────────────────────────────────────────────────────

func _build_ui() -> void:
	# Full-screen dimmer. Deeper alpha than the pause overlay's 0.78
	# (boons feel more "cinematic moment," pause feels more "ambient
	# state"). mouse_filter=STOP swallows clicks so the world below
	# stays untouched even on an accidental click outside a card.
	var dimmer: ColorRect = ColorRect.new()
	dimmer.color = Color(0.03, 0.02, 0.04, 0.62)
	dimmer.anchor_right = 1.0
	dimmer.anchor_bottom = 1.0
	dimmer.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(dimmer)
	# Tween the dimmer in so the flip isn't a hard cut.
	dimmer.color.a = 0.0
	var dt: Tween = create_tween()
	dt.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	dt.tween_property(dimmer, "color:a", 0.62, 0.22)

	# LEVEL UP banner. Big cream-gold typography, scale-bounces in
	# via Tween.TRANS_BACK so it has visual weight at landing. Anchor
	# at 0.5/0.22 — clears the dimmer top, gives ~120 px headroom
	# above the card row.
	var banner: Label = Label.new()
	banner.text = "LEVEL UP"
	banner.add_theme_font_size_override("font_size", 96)
	banner.add_theme_color_override("font_color", Color(1.0, 0.92, 0.62, 1.0))
	banner.add_theme_color_override("font_outline_color", Color(0.0, 0.0, 0.0, 0.92))
	banner.add_theme_constant_override("outline_size", 6)
	banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	banner.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	banner.anchor_left = 0.5
	banner.anchor_right = 0.5
	banner.anchor_top = 0.18
	banner.anchor_bottom = 0.18
	banner.offset_left = -360
	banner.offset_right = 360
	banner.offset_top = -60
	banner.offset_bottom = 60
	banner.pivot_offset = Vector2(360, 60)
	banner.scale = Vector2(0.6, 0.6)
	banner.modulate.a = 0.0
	banner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(banner)
	var bt: Tween = create_tween()
	bt.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	bt.set_parallel(true)
	bt.tween_property(banner, "scale", Vector2.ONE, BANNER_BOUNCE_TIME)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	bt.tween_property(banner, "modulate:a", 1.0, BANNER_BOUNCE_TIME * 0.6)

	# Three boon cards in a horizontal row. Total content width =
	# 3×280 + 2×32 = 904 px, centered in 1280 px viewport (left edge
	# at x = (1280-904)/2 = 188). y = 0.45 anchor lands the row in
	# the upper-middle so the banner reads above + the hint reads
	# below without overlap.
	var total_w: float = 3.0 * CARD_WIDTH + 2.0 * CARD_GAP
	var start_x: float = (1280.0 - total_w) * 0.5
	var y_center: float = 720.0 * 0.5
	for i in 3:
		if i >= _boon_ids.size():
			break
		var card: Control = _build_card(_boon_ids[i], i)
		card.position = Vector2(
			start_x + float(i) * (CARD_WIDTH + CARD_GAP),
			y_center - CARD_HEIGHT * 0.5 + 40.0,   # bias slightly down
		)
		# Fly-in: start 40 px below + transparent → slide up + fade
		# in over 0.32s with a staggered delay per card (left card
		# first). The stagger reads as "cards deal in" — same VS beat.
		var orig_y: float = card.position.y
		card.position.y = orig_y + 40.0
		card.modulate.a = 0.0
		var ct: Tween = create_tween()
		ct.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
		ct.set_parallel(true)
		var delay: float = 0.10 + float(i) * 0.06
		ct.tween_interval(delay)
		ct.chain().tween_property(card, "position:y", orig_y, CARDS_FLY_IN_TIME)\
			.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		ct.tween_property(card, "modulate:a", 1.0, CARDS_FLY_IN_TIME * 0.7)
		add_child(card)
		_card_panels.append(card)

	# Hint label below the cards. "1 / 2 / 3 or click" — dim cream so
	# it reads as instructional ambience, not a competing element.
	var hint: Label = Label.new()
	hint.text = "press 1 / 2 / 3 or click to choose"
	hint.add_theme_font_size_override("font_size", 16)
	hint.add_theme_color_override("font_color", Color(0.78, 0.72, 0.55, 0.85))
	hint.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	hint.add_theme_constant_override("outline_size", 2)
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.anchor_left = 0.5
	hint.anchor_right = 0.5
	hint.anchor_top = 0.82
	hint.anchor_bottom = 0.82
	hint.offset_left = -240
	hint.offset_right = 240
	hint.offset_top = -16
	hint.offset_bottom = 16
	hint.modulate.a = 0.0
	hint.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(hint)
	var ht: Tween = create_tween()
	ht.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	ht.tween_interval(0.35)
	ht.chain().tween_property(hint, "modulate:a", 1.0, 0.30)


# Build a single card Control. Returns a Panel-with-children stack:
# theme accent strip → glyph label → name label → desc label. The
# Panel root carries mouse hover / click handlers via the
# mouse_entered / mouse_exited / gui_input signals.
func _build_card(boon_id: String, slot_index: int) -> Control:
	var boon: Dictionary = BoonCatalog.get_boon(boon_id)
	var theme_id: String = str(boon.get("theme", "vow"))
	var tier_id: String = str(boon.get("tier", "common"))
	var accent: Color = BoonCatalog.THEME_COLORS.get(theme_id, Color(0.85, 0.78, 0.55))
	# iter-260 / Wave 9 — tier color drives the BORDER. Theme color
	# drives the accent strip + glyph + name color. This split lets a
	# RARE STORM card read as RARE (cool blue border) AND STORM (cyan
	# accents) without conflating the two dimensions.
	var tier_color: Color = BoonCatalog.TIER_COLORS.get(tier_id, Color(0.55, 0.50, 0.45))
	var tier_label_text: String = str(BoonCatalog.TIER_LABELS.get(tier_id, "COMMON"))
	var boon_name: String = str(boon.get("name", "BOON"))
	var boon_desc: String = str(boon.get("desc", ""))
	# iter-260 — determine if this boon's theme matches a theme the
	# player has ≥ 2 relics in (build-match). If so, the card gets a
	# warm-gold outer halo signaling "fits your build."
	var build_match: bool = false
	if GameState != null and GameState.has_method("theme_count"):
		var n: int = int(GameState.theme_count(theme_id))
		if n >= BUILD_MATCH_THRESHOLD:
			build_match = true

	# Root Panel. Border color = tier color (iter-260). Theme color
	# survives as the accent strip + glyph + shadow tint.
	var panel: Panel = Panel.new()
	panel.custom_minimum_size = Vector2(CARD_WIDTH, CARD_HEIGHT)
	panel.size = Vector2(CARD_WIDTH, CARD_HEIGHT)
	panel.pivot_offset = panel.size * 0.5
	var sb_idle: StyleBoxFlat = _build_card_style(tier_color, accent, CARD_BORDER_ALPHA_IDLE, build_match)
	panel.add_theme_stylebox_override("panel", sb_idle)
	panel.mouse_filter = Control.MOUSE_FILTER_STOP
	# Wire input + hover. bind(slot_index) carries which card was hit
	# without each callback needing to know its index.
	panel.gui_input.connect(_on_card_gui_input.bind(slot_index))
	panel.mouse_entered.connect(_on_card_hover_enter.bind(slot_index))
	panel.mouse_exited.connect(_on_card_hover_exit.bind(slot_index))

	# Theme accent strip at the top of the card. 6 px tall band in
	# the themed color — same chrome the iter-245 HUD chip uses so a
	# STORM card visually links to a STORM chip already on the HUD.
	var accent_strip: ColorRect = ColorRect.new()
	accent_strip.color = accent
	accent_strip.anchor_right = 1.0
	accent_strip.offset_top = 0
	accent_strip.offset_bottom = 6
	accent_strip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(accent_strip)

	# Slot number badge (1/2/3) in the top-left corner.
	var slot_label: Label = Label.new()
	slot_label.text = str(slot_index + 1)
	slot_label.add_theme_font_size_override("font_size", 18)
	slot_label.add_theme_color_override("font_color", Color(0.65, 0.60, 0.48, 0.85))
	slot_label.position = Vector2(14, 12)
	slot_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(slot_label)

	# iter-260 / Wave 9 — theme glyph as a stylized Polygon2D in the
	# top-right corner. Replaces the iter-259 single-character glyph
	# (which sat in the center). The new geometric mark reads cleaner
	# at 28×28 px and gives each theme a distinct silhouette.
	var glyph_poly: Polygon2D = Polygon2D.new()
	var glyph_pts: PackedVector2Array = PackedVector2Array()
	var shape_pts: Array = THEME_GLYPH_SHAPES.get(theme_id, [])
	for pt in shape_pts:
		glyph_pts.append((pt as Vector2) * THEME_GLYPH_SIZE)
	glyph_poly.polygon = glyph_pts
	glyph_poly.color = accent
	glyph_poly.position = Vector2(CARD_WIDTH - 22.0, 22.0)
	# Iter 262 — same fix as iter-261. mouse_filter is a Control field;
	# Polygon2D extends Node2D and has no such property. Polygon2D
	# doesn't intercept mouse events anyway, so removing the line is
	# semantically a no-op + makes the crash go away.
	panel.add_child(glyph_poly)

	# iter-260 / Wave 9 — tier label ABOVE the boon name, smaller +
	# tier-tinted so the player learns "blue = rare, gold = legendary"
	# without reading the catalog. Anchored 0.40 (above the name's
	# 0.62 anchor) so the typographic stack reads tier → name → desc.
	var tier_label: Label = Label.new()
	tier_label.text = tier_label_text
	tier_label.add_theme_font_size_override("font_size", 13)
	tier_label.add_theme_color_override("font_color", tier_color)
	tier_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	tier_label.add_theme_constant_override("outline_size", 2)
	tier_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tier_label.anchor_left = 0.0
	tier_label.anchor_right = 1.0
	tier_label.anchor_top = 0.52
	tier_label.anchor_bottom = 0.52
	tier_label.offset_left = 8
	tier_label.offset_right = -8
	tier_label.offset_top = -10
	tier_label.offset_bottom = 10
	tier_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(tier_label)

	# Large central theme symbol (the old iter-259 centerpiece). Kept
	# but anchored higher in the larger card so the tier label +
	# name + desc all fit. Glyph still uses the simple ASCII char
	# from THEME_GLYPHS for the central read — the new Polygon2D
	# top-right glyph is the secondary "small badge" mark.
	var central_glyph: String = str(BoonCatalog.THEME_GLYPHS.get(theme_id, "*"))
	var glyph_label: Label = Label.new()
	glyph_label.text = central_glyph
	glyph_label.add_theme_font_size_override("font_size", 96)
	glyph_label.add_theme_color_override("font_color", accent)
	glyph_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	glyph_label.add_theme_constant_override("outline_size", 4)
	glyph_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	glyph_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	glyph_label.anchor_left = 0.5
	glyph_label.anchor_right = 0.5
	glyph_label.anchor_top = 0.0
	glyph_label.anchor_bottom = 0.0
	glyph_label.offset_left = -80
	glyph_label.offset_right = 80
	glyph_label.offset_top = 48
	glyph_label.offset_bottom = 184
	glyph_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(glyph_label)

	# Boon name. Cream-gold, 22 px, centered. Sits between glyph and
	# desc. Slightly desaturated vs the banner so the banner remains
	# the dominant typographic element.
	var name_label: Label = Label.new()
	name_label.text = boon_name
	name_label.add_theme_font_size_override("font_size", 22)
	name_label.add_theme_color_override("font_color", Color(0.96, 0.90, 0.70, 1.0))
	name_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	name_label.add_theme_constant_override("outline_size", 3)
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_label.anchor_left = 0.0
	name_label.anchor_right = 1.0
	name_label.anchor_top = 0.62
	name_label.anchor_bottom = 0.62
	name_label.offset_left = 8
	name_label.offset_right = -8
	name_label.offset_top = -18
	name_label.offset_bottom = 18
	name_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(name_label)

	# Description. Smaller, dimmer — the mechanical reading.
	var desc_label: Label = Label.new()
	desc_label.text = boon_desc
	desc_label.add_theme_font_size_override("font_size", 16)
	desc_label.add_theme_color_override("font_color", Color(0.80, 0.76, 0.62, 0.95))
	desc_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.80))
	desc_label.add_theme_constant_override("outline_size", 2)
	desc_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	desc_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	desc_label.anchor_left = 0.0
	desc_label.anchor_right = 1.0
	desc_label.anchor_top = 0.78
	desc_label.anchor_bottom = 0.78
	desc_label.offset_left = 18
	desc_label.offset_right = -18
	desc_label.offset_top = -22
	desc_label.offset_bottom = 30
	desc_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(desc_label)

	# iter-260 / Wave 9 — build-match indicator. When the card's theme
	# matches the player's owned-relic spread (≥ 2 of theme), spawn a
	# small "BUILD MATCH" label at the bottom of the card. The halo
	# itself lives in the stylebox via the shadow color; the label
	# tells the player WHY the card is haloed.
	if build_match:
		var build_label: Label = Label.new()
		build_label.text = "BUILD MATCH"
		build_label.add_theme_font_size_override("font_size", 11)
		build_label.add_theme_color_override("font_color", Color(1.0, 0.85, 0.55, 0.95))
		build_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
		build_label.add_theme_constant_override("outline_size", 2)
		build_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		build_label.anchor_left = 0.0
		build_label.anchor_right = 1.0
		build_label.anchor_top = 0.92
		build_label.anchor_bottom = 0.92
		build_label.offset_left = 8
		build_label.offset_right = -8
		build_label.offset_top = -10
		build_label.offset_bottom = 10
		build_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		panel.add_child(build_label)

	return panel


# Build the themed Panel stylebox.
#
# iter-260 / Wave 9 — split the styling axes:
#   • border color = TIER color (grey/blue/gold)
#   • shadow color = ACCENT (theme) color, used as the tier color
#     glow under the card. Build-match cards layer a SECOND warm-gold
#     halo via a deeper shadow_size + warm shadow_color override.
# border_alpha is the alpha applied to the border — IDLE = 0.50,
# HOVER = 1.00, so a hovered card pops in saturation.
func _build_card_style(tier_color: Color, accent: Color, border_alpha: float, build_match: bool = false) -> StyleBoxFlat:
	var sb: StyleBoxFlat = StyleBoxFlat.new()
	sb.bg_color = Color(0.06, 0.05, 0.08, 0.92)
	sb.border_width_left = 2
	sb.border_width_top = 2
	sb.border_width_right = 2
	sb.border_width_bottom = 2
	var border: Color = tier_color
	border.a = border_alpha
	sb.border_color = border
	sb.corner_radius_top_left = 4
	sb.corner_radius_top_right = 4
	sb.corner_radius_bottom_right = 4
	sb.corner_radius_bottom_left = 4
	sb.content_margin_left = 12.0
	sb.content_margin_top = 12.0
	sb.content_margin_right = 12.0
	sb.content_margin_bottom = 12.0
	# Theme-color halo under the card. Acts as the subtle "PointLight2D"
	# the spec calls for — using stylebox shadow because it composes
	# cleanly with the Panel border without requiring a separate node
	# (PointLight2D works on Node2D, not Control).
	# Idle: light theme glow at 0.20 alpha.
	# Hover: stronger theme glow at 0.35.
	# Build-match: stack a second warmer halo on top.
	var glow_alpha: float = 0.20 if border_alpha < 1.0 else 0.35
	var glow: Color = accent
	glow.a = glow_alpha
	sb.shadow_color = glow
	sb.shadow_size = 10 if border_alpha < 1.0 else 14
	sb.shadow_offset = Vector2(0, 0)
	# Build-match halo: warm-gold outer ring — done by widening the
	# shadow + tinting it. Overrides the theme glow for the hover beat
	# so the player learns the "this fits my build" cue at a glance.
	if build_match:
		sb.shadow_color = BUILD_MATCH_HALO_COLOR
		sb.shadow_size = sb.shadow_size + 6
	return sb


# ── Hover handlers ─────────────────────────────────────────────────────

func _on_card_hover_enter(idx: int) -> void:
	if _selected:
		return
	var card: Control = _card_panels[idx]
	# Pop scale 1.08× — bumped from iter-259's 1.05 for the larger card.
	var tw: Tween = create_tween()
	tw.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	tw.tween_property(card, "scale", Vector2(CARD_HOVER_SCALE, CARD_HOVER_SCALE),
		CARD_HOVER_TWEEN_TIME).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	# Brighten the border. iter-260: stylebox call requires tier_color
	# + accent + build_match args.
	var boon: Dictionary = BoonCatalog.get_boon(_boon_ids[idx])
	var theme_id: String = str(boon.get("theme", "vow"))
	var tier_id: String = str(boon.get("tier", "common"))
	var accent: Color = BoonCatalog.THEME_COLORS.get(theme_id, Color(0.85, 0.78, 0.55))
	var tier_color: Color = BoonCatalog.TIER_COLORS.get(tier_id, Color(0.55, 0.50, 0.45))
	var build_match: bool = false
	if GameState != null and GameState.has_method("theme_count"):
		build_match = int(GameState.theme_count(theme_id)) >= BUILD_MATCH_THRESHOLD
	var panel: Panel = card as Panel
	if panel != null:
		panel.add_theme_stylebox_override("panel", _build_card_style(tier_color, accent, CARD_BORDER_ALPHA_HOVER, build_match))
	# UI hover audio at low gain (matches pause-menu hover ambience).
	if Audio != null and Audio.has_method("play_ui_cue"):
		Audio.play_ui_cue("ui_hover", -8.0)


func _on_card_hover_exit(idx: int) -> void:
	if _selected:
		return
	var card: Control = _card_panels[idx]
	var tw: Tween = create_tween()
	tw.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	tw.tween_property(card, "scale", Vector2.ONE,
		CARD_HOVER_TWEEN_TIME).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	var boon: Dictionary = BoonCatalog.get_boon(_boon_ids[idx])
	var theme_id: String = str(boon.get("theme", "vow"))
	var tier_id: String = str(boon.get("tier", "common"))
	var accent: Color = BoonCatalog.THEME_COLORS.get(theme_id, Color(0.85, 0.78, 0.55))
	var tier_color: Color = BoonCatalog.TIER_COLORS.get(tier_id, Color(0.55, 0.50, 0.45))
	var build_match: bool = false
	if GameState != null and GameState.has_method("theme_count"):
		build_match = int(GameState.theme_count(theme_id)) >= BUILD_MATCH_THRESHOLD
	var panel: Panel = card as Panel
	if panel != null:
		panel.add_theme_stylebox_override("panel", _build_card_style(tier_color, accent, CARD_BORDER_ALPHA_IDLE, build_match))


# ── Input handlers ─────────────────────────────────────────────────────

# Mouse click on a card → select. Uses gui_input rather than the
# Button widget so we can keep the Panel + sub-labels approach (Button
# fights child label drawing).
func _on_card_gui_input(event: InputEvent, idx: int) -> void:
	if _selected:
		return
	if event is InputEventMouseButton:
		var mb: InputEventMouseButton = event
		if mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT:
			_select_card(idx)


# Hotkey routing — 1/2/3 select the corresponding card. Lives on the
# modal's _unhandled_input so it owns key events while paused (our
# CanvasLayer's process_mode = PROCESS_MODE_WHEN_PAUSED means our
# input handlers fire and the main scene's do not). Crucially, we do
# NOT bind ESCAPE — the modal must be unmissable until a card is picked.
func _unhandled_input(event: InputEvent) -> void:
	if _selected:
		return
	if not (event is InputEventKey):
		return
	var ev: InputEventKey = event
	if not ev.pressed:
		return
	# Echo guard — held key shouldn't re-fire the selection.
	if ev.echo:
		return
	match ev.physical_keycode:
		KEY_1:
			_select_card(0)
			get_viewport().set_input_as_handled()
		KEY_2:
			_select_card(1)
			get_viewport().set_input_as_handled()
		KEY_3:
			_select_card(2)
			get_viewport().set_input_as_handled()


# ── Selection flow ─────────────────────────────────────────────────────

func _select_card(idx: int) -> void:
	if _selected:
		return
	if idx < 0 or idx >= _boon_ids.size():
		return
	_selected = true
	var boon_id: String = _boon_ids[idx]
	var boon: Dictionary = BoonCatalog.get_boon(boon_id)
	if boon.is_empty():
		_close_modal()
		return

	# Apply mods to GameState.shrine_bonuses. modifier_total /
	# modifier_total_f already fold shrine_bonuses into their result
	# so downstream consumers (hero.gd, projectile.gd, reaction_web.gd)
	# pick up the change on the very next frame. vow_temper has an
	# empty mods dict → no-op apply, flavor-only for now (see
	# boon_catalog.gd "FUTURE EXPANSION" comment).
	var mods: Dictionary = boon.get("mods", {})
	for key in mods:
		var val: Variant = mods[key]
		GameState.grant_shrine_bonus(str(key), val)
	# iter-260 / Wave 9 — record the boon pick in the run-local roster.
	# Used by proc handlers (has_boon checks in hero.gd) AND by
	# roll_boon_offers' filter-out-already-owned logic. record_boon_pick
	# bumps level_ups_this_run so the next roll walks further into the
	# TIER_WEIGHT_RAMP (more rare/legendary on subsequent picks).
	GameState.record_boon_pick(boon_id)

	# Pickup chime layered on the selection beat.
	if Audio != null and Audio.has_method("_play"):
		Audio._play("pickup_legendary", Vector2.ZERO, -2.0)

	# Selection drama: the picked card grows + glows briefly, then the
	# whole modal fades out and unpauses.
	var card: Control = _card_panels[idx]
	var theme_id: String = str(boon.get("theme", "vow"))
	var tier_id: String = str(boon.get("tier", "common"))
	var accent: Color = BoonCatalog.THEME_COLORS.get(theme_id, Color(0.85, 0.78, 0.55))
	var tier_color: Color = BoonCatalog.TIER_COLORS.get(tier_id, Color(0.55, 0.50, 0.45))
	var panel: Panel = card as Panel
	if panel != null:
		# Push the border to fully-saturated white-ish then fade out
		# alongside the rest of the modal.
		var glow_sb: StyleBoxFlat = _build_card_style(tier_color, accent, 1.0, false)
		glow_sb.border_color = Color(1.0, 0.96, 0.78, 1.0)
		glow_sb.shadow_color = Color(accent.r, accent.g, accent.b, 0.55)
		glow_sb.shadow_size = 20
		panel.add_theme_stylebox_override("panel", glow_sb)
	var st: Tween = create_tween()
	st.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	st.tween_property(card, "scale", Vector2(1.15, 1.15), SELECTION_GLOW_TIME)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	st.chain().tween_callback(_close_modal)


# Fade out + unpause + free. _exit_tree resets paused as a safety net
# but we also clear it explicitly here so any code that runs in the
# same frame sees the unpaused state.
func _close_modal() -> void:
	# Fade the whole modal — tween every CanvasItem child's modulate
	# in parallel. Same idiom pause_screen.gd uses for its fade-in.
	var ft: Tween = create_tween()
	ft.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	ft.set_parallel(true)
	for child in get_children():
		if child is CanvasItem:
			var ci: CanvasItem = child
			ft.tween_property(ci, "modulate:a", 0.0, FADE_OUT_TIME)
	# Once the fade completes: unpause + free.
	ft.chain().tween_callback(func() -> void:
		if get_tree() != null:
			get_tree().paused = false
		_punch_camera_zoom_out()
		queue_free()
	)


# ── Camera punch ───────────────────────────────────────────────────────

# Zoom the active Camera2D from its current zoom to current × 1.06 over
# 0.18s as the modal lands. The matching zoom-out runs from
# _close_modal so the level-up moment has a defined contract:
# zoom-in → pause → pick → zoom-out → resume.
#
# Same defensive cam-pointer pattern main.gd::_punch_camera_for_boss_death
# uses (hero child > scene-root child > skip). Stashed on the modal so
# _punch_camera_zoom_out can restore the original zoom value even if the
# modal outlives its instigator.
var _stored_zoom: Vector2 = Vector2.ONE
var _stored_cam: Camera2D = null

func _punch_camera_zoom_in() -> void:
	var cam: Camera2D = _resolve_camera()
	if cam == null:
		return
	_stored_cam = cam
	_stored_zoom = cam.zoom
	var target: Vector2 = cam.zoom * CAMERA_ZOOM_PEAK_MUL
	var tw: Tween = create_tween()
	tw.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	tw.tween_property(cam, "zoom", target, CAMERA_ZOOM_IN_TIME)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)


func _punch_camera_zoom_out() -> void:
	if _stored_cam == null or not is_instance_valid(_stored_cam):
		return
	var tw: Tween = create_tween()
	tw.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	tw.tween_property(_stored_cam, "zoom", _stored_zoom, CAMERA_ZOOM_OUT_TIME)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN_OUT)


func _resolve_camera() -> Camera2D:
	# Active viewport camera is the cleanest path. Falls back to the
	# hero's child camera (the actual one used in-game) if the
	# viewport accessor returns null during a scene transition.
	var vp_cam: Camera2D = get_viewport().get_camera_2d()
	if vp_cam != null:
		return vp_cam
	var tree: SceneTree = get_tree()
	if tree == null or tree.current_scene == null:
		return null
	var hero_node: Node = tree.current_scene.get_node_or_null("Hero")
	if hero_node != null:
		return hero_node.get_node_or_null("Camera2D") as Camera2D
	return null


# ── Theme bias resolution ──────────────────────────────────────────────

# Pick the player's strongest current theme by relic count. If two
# themes are tied, lower-index in THEME_PRIORITY wins (FLAME > STORM >
# BLOOD > VOW > SHADOW — alphabetized-ish, but anchors flame as the
# tiebreaker since that's the run's biggest damage axis on a fresh
# build). Empty string if the player owns no themed relics yet (every
# theme_count returns 0) — roll_three handles that by skipping bias.
const THEME_PRIORITY: Array[String] = ["flame", "storm", "blood", "vow", "shadow"]

func _resolve_strongest_theme() -> String:
	var best: String = ""
	var best_count: int = 0
	for theme in THEME_PRIORITY:
		var n: int = GameState.theme_count(theme)
		if n > best_count:
			best = theme
			best_count = n
	return best
