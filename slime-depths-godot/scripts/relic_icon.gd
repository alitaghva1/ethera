# RelicIcon — single ~28×28 badge for the HUD relic strip. Drawn
# procedurally (no external icon assets) so the registry can grow
# without an artist-asset pipeline. Tier color encodes rarity at a
# glance (common = grey-white, rare = blue, legendary = purple) and a
# single-letter glyph (first letter of the relic name) disambiguates
# same-tier neighbors.
#
# On mouse hover the icon spawns a tooltip Control anchored to itself
# showing the relic's full name + description. Tooltip auto-hides on
# mouse exit. The tooltip is parented to a top-level CanvasLayer (the
# HUD that owns this icon), so it draws above the strip and any nearby
# Control siblings — anchoring to the icon's global rect keeps it
# pinned to the icon as the strip rebuilds.
#
# Usage: instantiate the relic_icon.tscn scene, call set_relic(id),
# then add it as a child of the HBoxContainer. Calling set_relic on
# an existing icon is supported — the icon repaints in place.
class_name RelicIcon
extends Control

# Iter 26 — badge size bumped 28 → 40 px. The iter-23 size made the
# painted icon art (32-64 px sources) hard to read. 40 px gives the
# inner texture room to breathe + room for a proper rounded border.
const ICON_SIZE: float = 40.0

# Tier color palette + tier-specific glow alpha. Reads against the
# dim dungeon HUD background. Iter 26 saturates the colors slightly
# (vs iter-23) so the border stands out as a real frame rather than a
# pale rim.
#   common    — desaturated steel
#   rare      — saturated blue
#   legendary — saturated magenta-purple (matches the pedestal aura)
const TIER_COLORS: Dictionary = {
	"common":    Color(0.78, 0.80, 0.85, 1),
	"rare":      Color(0.42, 0.66, 1.00, 1),
	"legendary": Color(0.92, 0.48, 1.00, 1),
}
# Inner panel tint per tier — darker than the border so the icon
# texture has a backing surface that gives contrast without competing
# with the painted art.
const TIER_BG: Dictionary = {
	"common":    Color(0.10, 0.10, 0.14, 0.95),
	"rare":      Color(0.08, 0.12, 0.20, 0.95),
	"legendary": Color(0.16, 0.06, 0.20, 0.95),
}

# Tooltip layout — sits above the icon (so it doesn't clip below the
# screen edge on the top-left HUD), with a small gap.
const TOOLTIP_OFFSET: Vector2 = Vector2(0, -8)
const TOOLTIP_WIDTH: float = 280.0
const TOOLTIP_MIN_HEIGHT: float = 56.0

var _relic_id: String = ""
var _tooltip: Control = null

func _ready() -> void:
	custom_minimum_size = Vector2(ICON_SIZE, ICON_SIZE)
	# Without setting size explicitly here, an HBoxContainer can stretch
	# the icon vertically; lock both dimensions to the badge size.
	size = Vector2(ICON_SIZE, ICON_SIZE)
	mouse_filter = Control.MOUSE_FILTER_STOP
	mouse_entered.connect(_on_mouse_entered)
	mouse_exited.connect(_on_mouse_exited)

# Configure the badge for a specific relic id. Builds the visual
# children procedurally — a tier-colored rounded rect with a darker
# background panel underneath and the relic's first letter centered
# on top. Safe to call repeatedly: clears prior visual children first.
func set_relic(id: String) -> void:
	_relic_id = id
	# Drop any prior children — supports re-targeting an icon to a new
	# relic without re-instancing the scene.
	for child in get_children():
		child.queue_free()
	_hide_tooltip()
	var info: Dictionary = GameState.relic_info(id)
	var tier: String = str(info.get("tier", "common"))
	var tier_color: Color = TIER_COLORS.get(tier, TIER_COLORS["common"])
	var bg_color: Color = TIER_BG.get(tier, TIER_BG["common"])
	var nm: String = str(info.get("name", id))
	var glyph: String = ""
	if nm.length() > 0:
		glyph = nm.substr(0, 1).to_upper()
	var icon_path: String = str(info.get("icon_path", ""))

	# Iter 26 — single PanelContainer with a StyleBoxFlat does what the
	# iter-23 stacked ColorRects did (background + rim + inner fill) in
	# ONE node, with proper rounded corners + a clean border that reads
	# as a frame instead of three concentric squares. The tier color
	# becomes the border; bg_color the panel fill.
	var frame: Panel = Panel.new()
	var sb: StyleBoxFlat = StyleBoxFlat.new()
	sb.bg_color = bg_color
	sb.border_color = tier_color
	sb.border_width_left = 2
	sb.border_width_top = 2
	sb.border_width_right = 2
	sb.border_width_bottom = 2
	sb.corner_radius_top_left = 5
	sb.corner_radius_top_right = 5
	sb.corner_radius_bottom_left = 5
	sb.corner_radius_bottom_right = 5
	# Legendary tier gets a soft glow via shadow — costs nothing and
	# makes the rarest badge pop without needing a separate VFX node.
	if tier == "legendary":
		sb.shadow_color = Color(tier_color.r, tier_color.g, tier_color.b, 0.55)
		sb.shadow_size = 4
	frame.add_theme_stylebox_override("panel", sb)
	frame.anchor_right = 1.0
	frame.anchor_bottom = 1.0
	frame.offset_left = 0.0
	frame.offset_top = 0.0
	frame.offset_right = 0.0
	frame.offset_bottom = 0.0
	frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(frame)

	# Iter 26 — real relic art. The icons in slime-depths/public/assets/
	# vary wildly in source size (32×32 up to 209×192). The iter-24
	# TextureRect implementation forgot to set expand_mode, so Godot
	# defaulted to growing the rect to native texture size — the bigger
	# painted icons overflowed the badge, ate the HUD, and looked like
	# detached art floating on the screen. EXPAND_IGNORE_SIZE pins the
	# TextureRect to its OWNER-SPECIFIED size (the 32×32 inset below)
	# regardless of source dimensions. Combined with
	# STRETCH_KEEP_ASPECT_CENTERED, the texture downscales to fit.
	var tex: Texture2D = null
	if icon_path != "":
		var loaded: Resource = ResourceLoader.load(icon_path) if ResourceLoader.exists(icon_path) else null
		if loaded is Texture2D:
			tex = loaded
	if tex != null:
		var icon_rect: TextureRect = TextureRect.new()
		icon_rect.texture = tex
		icon_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		# 32×32 cell inside the 40×40 outer (4 px frame all around for
		# the rounded border to read).
		icon_rect.anchor_right = 1.0
		icon_rect.anchor_bottom = 1.0
		icon_rect.offset_left = 4.0
		icon_rect.offset_top = 4.0
		icon_rect.offset_right = -4.0
		icon_rect.offset_bottom = -4.0
		icon_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(icon_rect)
	else:
		# Fallback glyph — single uppercase letter centered on the badge.
		# Triggered when icon_path is empty or the source PNG didn't load
		# (defensive). Sized for the bigger 40 × 40 badge.
		var letter: Label = Label.new()
		letter.text = glyph
		letter.anchor_right = 1.0
		letter.anchor_bottom = 1.0
		letter.offset_left = 0.0
		letter.offset_top = 0.0
		letter.offset_right = 0.0
		letter.offset_bottom = 0.0
		letter.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		letter.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		letter.add_theme_font_size_override("font_size", 22)
		letter.add_theme_color_override("font_color", Color(1, 0.96, 0.88, 1))
		letter.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
		letter.add_theme_constant_override("outline_size", 3)
		letter.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(letter)

func _on_mouse_entered() -> void:
	_show_tooltip()

func _on_mouse_exited() -> void:
	_hide_tooltip()

# Build and reveal the hover tooltip. Parented to the CanvasLayer
# that owns the strip (walks up until it finds one) so the tooltip
# z-sorts above the HUD strip; positioned by converting the icon's
# global rect to screen-space coordinates and offsetting upward.
func _show_tooltip() -> void:
	if _relic_id == "":
		return
	if _tooltip != null and is_instance_valid(_tooltip):
		return
	var info: Dictionary = GameState.relic_info(_relic_id)
	var nm: String = str(info.get("name", _relic_id))
	var desc: String = str(info.get("description", ""))

	var panel: PanelContainer = PanelContainer.new()
	var sb: StyleBoxFlat = StyleBoxFlat.new()
	sb.bg_color = Color(0.06, 0.05, 0.09, 0.96)
	sb.border_color = Color(0.78, 0.65, 0.41, 0.90)
	sb.border_width_left = 1
	sb.border_width_top = 1
	sb.border_width_right = 1
	sb.border_width_bottom = 1
	sb.corner_radius_top_left = 4
	sb.corner_radius_top_right = 4
	sb.corner_radius_bottom_right = 4
	sb.corner_radius_bottom_left = 4
	sb.content_margin_left = 10.0
	sb.content_margin_top = 8.0
	sb.content_margin_right = 10.0
	sb.content_margin_bottom = 8.0
	panel.add_theme_stylebox_override("panel", sb)
	panel.custom_minimum_size = Vector2(TOOLTIP_WIDTH, TOOLTIP_MIN_HEIGHT)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE

	var box: VBoxContainer = VBoxContainer.new()
	box.add_theme_constant_override("separation", 4)
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(box)

	var name_lbl: Label = Label.new()
	name_lbl.text = nm
	name_lbl.add_theme_font_size_override("font_size", 14)
	name_lbl.add_theme_color_override("font_color", Color(1, 0.92, 0.62, 1))
	name_lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
	name_lbl.add_theme_constant_override("outline_size", 2)
	name_lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(name_lbl)

	var desc_lbl: Label = Label.new()
	desc_lbl.text = desc
	desc_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	desc_lbl.custom_minimum_size = Vector2(TOOLTIP_WIDTH - 20.0, 0)
	desc_lbl.add_theme_font_size_override("font_size", 12)
	desc_lbl.add_theme_color_override("font_color", Color(0.85, 0.80, 0.66, 1))
	desc_lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
	desc_lbl.add_theme_constant_override("outline_size", 2)
	desc_lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(desc_lbl)

	# Find the nearest CanvasLayer ancestor — the HUD owns one and we
	# want the tooltip to share its layer so it draws above the strip.
	# Falls back to the parent if no CanvasLayer is found (still
	# renders fine, just may z-sort below sibling Controls).
	var host: Node = _find_canvas_layer()
	if host == null:
		host = get_parent()
	host.add_child(panel)
	_tooltip = panel
	# Defer position-set by one frame: PanelContainer doesn't have a
	# resolved size until it's been in the tree for a layout pass, so
	# anchoring to its size on the same frame produces a 0-sized rect
	# offset (the tooltip would appear in the wrong place).
	await get_tree().process_frame
	# iter-72 bug-fix: also guard against the icon itself being freed
	# mid-await (the strip rebuilds on every pickup_claimed; if a strip
	# rebuild fires the same frame as a hover, _exit_tree queue_frees
	# the tooltip but the await here would then call get_global_rect()
	# on a freed Control). Bail if we're no longer in the tree.
	if not is_inside_tree():
		_hide_tooltip()
		return
	if _tooltip == null or not is_instance_valid(_tooltip):
		return
	var icon_rect: Rect2 = get_global_rect()
	var tip_size: Vector2 = _tooltip.size
	# Anchor BOTTOM-LEFT of the tooltip to the icon's top-left, then
	# nudge up by TOOLTIP_OFFSET. The icon lives in the top-left of
	# the HUD; if the tooltip would clip off the top of the screen we
	# fall back to placing it BELOW the icon instead.
	var target: Vector2 = Vector2(
		icon_rect.position.x,
		icon_rect.position.y - tip_size.y + TOOLTIP_OFFSET.y,
	)
	if target.y < 4.0:
		target.y = icon_rect.position.y + icon_rect.size.y - TOOLTIP_OFFSET.y
	_tooltip.global_position = target

func _hide_tooltip() -> void:
	if _tooltip != null and is_instance_valid(_tooltip):
		_tooltip.queue_free()
	_tooltip = null

# Walk up the tree looking for a CanvasLayer ancestor so the tooltip
# can be parented to it. Falls back to null if none exists.
func _find_canvas_layer() -> Node:
	var p: Node = get_parent()
	while p != null:
		if p is CanvasLayer:
			return p
		p = p.get_parent()
	return null

# Tear down the tooltip if the icon itself goes away mid-hover (e.g.
# the strip rebuilds on a new pickup). Without this the tooltip would
# orphan on the CanvasLayer with no parent reference back.
func _exit_tree() -> void:
	_hide_tooltip()
