# PickupBanner — celebratory in-run overlay shown when the hero
# claims a relic from a pedestal. Bridges the readability gap that
# previously left the only feedback as the small DamageNumber pop
# spawned by pedestal._claim. This banner is the BIG beat: 480 px
# frame anchored top-center, theme-colored border, relic name +
# flavor tag + wrapped description, ~3.35s lifetime (5.5s + mythic
# wash on tier="mythic").
#
# Spawn convention (iter 61's test-mode-safe pattern):
#   PickupBanner.spawn(relic_id, host)
# where `host` is the Node that should own the banner instance. From
# main.gd's _on_pickup_claimed we pass `self` (main is a Node2D, but
# a CanvasLayer child of it works the same as any other child —
# CanvasLayer ignores its parent's transform for rendering and just
# stacks against the viewport via its `layer` index).
#
# Layout pattern (iter 67 fix):
#   1. Pin DescLabel.custom_minimum_size.x = INNER_WIDTH (set in
#      .tscn already at 448 px; reasserted in _ready as defensive).
#   2. await get_tree().process_frame TWICE so Godot has time to
#      apply min-size + perform the wrap pass.
#   3. Measure get_minimum_size().y on DescLabel and grow the Panel
#      offset_bottom downward to fit. Banner is anchored top-center
#      so growth happens DOWN (away from the screen top edge);
#      the spec's 140-px starting height is the floor.
class_name PickupBanner
extends CanvasLayer

const BANNER_SCENE: PackedScene = preload("res://scenes/pickup_banner.tscn")

# Theme palette — matches main.gd's _rebuild_theme_chip_strip + tooltip
# colors so the border on a STORM relic is the same cyan as that relic's
# theme chip. Single source of truth lives in main.gd; copied here
# (small, stable 5-entry dict) to avoid a hard import cycle. Update
# both if the palette ever changes.
const THEME_COLORS: Dictionary = {
	"storm":  Color(0.55, 0.85, 1.0, 1.0),    # cyan
	"flame":  Color(1.0,  0.55, 0.30, 1.0),   # orange
	"blood":  Color(0.95, 0.45, 0.45, 1.0),   # crimson
	"vow":    Color(0.92, 0.92, 0.78, 1.0),   # ivory-gold
	"shadow": Color(0.78, 0.65, 1.0, 1.0),    # violet
}
const DEFAULT_BORDER: Color = Color(0.92, 0.84, 0.62, 1.0)  # cream-gold
const MYTHIC_BORDER:  Color = Color(1.0,  0.78, 0.30, 1.0)  # warm gold for tier=mythic

# Timing constants — see file header. STANDARD vs MYTHIC lifetimes
# match the JS reference's 3.5s / 5.5s split, plus we explicitly tween
# the wash so a mythic claim FEELS like a different beat.
const FADE_IN_DUR:        float = 0.25
const HOLD_DUR_STANDARD:  float = 2.50
const HOLD_DUR_MYTHIC:    float = 4.05
const FADE_OUT_DUR:       float = 0.60
const MYTHIC_WASH_PEAK:   float = 0.30

# Layout — Panel is 480 px wide with 16-px L/R content margins, leaving
# 448 px for wrapped text. Reasserted in _ready so a future .tscn edit
# that drops the override can't reintroduce a one-line wrap bug.
const INNER_WIDTH: float = 448.0
# Baseline height — grow DOWN from offset_top=80 if description needs
# more vertical room. Floor at 140 keeps the banner readable even when
# desc is a single short line.
const BASELINE_HEIGHT: float = 140.0
# Vertical room reserved for HEADER (~20) + NAME (~36) + FLAVOR (~20)
# + 3× 4-px VBox separators + 12+14 content margins. DescLabel sits
# below this — banner total = NON_DESC_HEIGHT + desc wrapped height.
const NON_DESC_HEIGHT: float = 108.0

# Spawn entry point. Mirrors DamageNumber.spawn / fire_pool patterns —
# static, returns the instance, expects the caller to add it as a child.
# `host` is the scene-tree node that will own the banner; passing it
# explicitly avoids the get_tree().current_scene null-during-test gap
# that bit iter 61. Returns null if the relic id is unknown so the
# caller can no-op without crashing (the iter-20 filter in main.gd's
# _on_pickup_claimed already screens for this, but defensive doesn't
# hurt).
static func spawn(relic_id: String, host: Node) -> PickupBanner:
	if relic_id == "" or host == null:
		return null
	if not GameState.RELIC_REGISTRY.has(relic_id):
		return null
	# iter-72 bug-fix: double-spawn guard. main.gd's _on_pickup_claimed
	# only filters chest/gold pickups out — if pickup_claimed ever fires
	# twice for the same relic (the iter-16 guard in main.gd only protects
	# _resolve_room_pickup, not banner spawn), two banners would stack
	# on top of each other at the same top-center anchor. Dismiss any
	# existing PickupBanner sibling so only the latest claim is visible.
	# Cheap: walks the host's direct children once.
	for sibling in host.get_children():
		if sibling is PickupBanner and is_instance_valid(sibling):
			(sibling as PickupBanner).queue_free()
	var inst: PickupBanner = BANNER_SCENE.instantiate()
	inst._relic_id = relic_id
	host.add_child(inst)
	return inst

# Set by spawn() before add_child so _ready can populate the labels
# without the caller needing a follow-up configure() call.
var _relic_id: String = ""

func _ready() -> void:
	# Belt-and-suspenders: registry already verified in spawn(), but if
	# someone instantiates the scene directly without setting _relic_id
	# we want a clean queue_free not a null-deref crash.
	if _relic_id == "" or not GameState.RELIC_REGISTRY.has(_relic_id):
		queue_free()
		return
	var info: Dictionary = GameState.RELIC_REGISTRY[_relic_id]
	var name_label: Label  = $Root/Panel/Content/NameLabel
	var flavor_label: Label = $Root/Panel/Content/FlavorLabel
	var desc_label: Label   = $Root/Panel/Content/DescLabel
	var panel: Panel        = $Root/Panel
	# Populate text. Name comes straight from registry (already UPPER-
	# CASED by convention). Flavor synthesizes a "THEME • TIER" tag so
	# the banner reads thematically even though the registry has no
	# dedicated `flavor` field — the relic's primary theme + its tier
	# IS the flavor. Letterspaced manually with "  " separators since
	# Godot 4 Label has no native letter-spacing override.
	name_label.text = str(info.get("name", _relic_id))
	desc_label.text = str(info.get("description", ""))
	var themes: Array = info.get("themes", [])
	var tier: String = str(info.get("tier", "common"))
	flavor_label.text = _build_flavor_line(themes, tier)
	# Theme border tint. Mythic gets the warm-gold special case; non-
	# mythic with at least one theme tag gets the theme color; un-
	# themed (rare) falls back to cream-gold.
	var border_color: Color = _resolve_border_color(themes, tier)
	var sb_existing: StyleBox = panel.get_theme_stylebox("panel")
	var sb: StyleBoxFlat = (sb_existing.duplicate() as StyleBoxFlat) if sb_existing is StyleBoxFlat else StyleBoxFlat.new()
	sb.border_color = border_color
	panel.add_theme_stylebox_override("panel", sb)
	# Iter 67 pattern — pin DescLabel inner width before measurement.
	# The .tscn already sets custom_minimum_size; reassert defensively.
	desc_label.custom_minimum_size = Vector2(INNER_WIDTH, 0)
	# Start invisible; tweens fade us in. Setting alpha on the root
	# Control modulates every descendant including the Panel + Labels.
	$Root.modulate.a = 0.0
	# Size + animate on the next frame so the autowrap pass has time to
	# settle. Two awaits per iter-67 lesson: frame 1 applies min-size,
	# frame 2 finalizes wrap height.
	_size_and_animate()

# Async sizing + animation entrypoint. Split out so _ready can fire and
# forget without itself being async (a `_ready` that awaits would still
# work in Godot 4 but reading it as a coroutine is unintuitive).
func _size_and_animate() -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	if not is_inside_tree():
		return
	var desc_label: Label = $Root/Panel/Content/DescLabel
	var panel: Panel = $Root/Panel
	# Measure the wrapped description height — autowrap returns the
	# multi-line content height ONLY after a pinned min-width + 2-frame
	# settle (iter 67's lesson). Min 1 line worth so a 5-char relic
	# description doesn't collapse the banner below the baseline.
	var desc_h: float = maxf(desc_label.get_minimum_size().y, 18.0)
	var total_h: float = maxf(BASELINE_HEIGHT, NON_DESC_HEIGHT + desc_h)
	panel.offset_bottom = panel.offset_top + total_h
	# Mythic tier wash — set wash visible BEFORE the fade-in so it
	# appears in the same beat as the banner.
	var info: Dictionary = GameState.RELIC_REGISTRY[_relic_id]
	var is_mythic: bool = str(info.get("tier", "common")) == "mythic"
	var hold_dur: float = HOLD_DUR_MYTHIC if is_mythic else HOLD_DUR_STANDARD
	if is_mythic:
		_play_mythic_wash(hold_dur)
	# Banner fade timeline. Tween on the Root Control's modulate.a so
	# every label + the panel border fade together. Self-frees on the
	# final callback — caller doesn't need to track us.
	var tween: Tween = create_tween()
	tween.tween_property($Root, "modulate:a", 1.0, FADE_IN_DUR)
	tween.tween_interval(hold_dur)
	tween.tween_property($Root, "modulate:a", 0.0, FADE_OUT_DUR)
	tween.tween_callback(queue_free)

# Pulse the mythic full-screen wash over the same total lifetime as the
# banner. 0 → MYTHIC_WASH_PEAK at the banner's fade-in completion → 0
# at the banner's fade-out completion. Visually reads as "the room
# briefly fills with golden light as the relic settles into your hand."
func _play_mythic_wash(hold_dur: float) -> void:
	var wash: ColorRect = $MythicWash
	if wash == null:
		return
	wash.visible = true
	wash.color = Color(wash.color.r, wash.color.g, wash.color.b, 0.0)
	var peak_color: Color = Color(wash.color.r, wash.color.g, wash.color.b, MYTHIC_WASH_PEAK)
	var end_color:  Color = Color(wash.color.r, wash.color.g, wash.color.b, 0.0)
	var t: Tween = create_tween()
	t.tween_property(wash, "color", peak_color, FADE_IN_DUR)
	t.tween_interval(hold_dur)
	t.tween_property(wash, "color", end_color, FADE_OUT_DUR)

# Build the "THEME • TIER" line shown below the name. Uses letter-
# spaced "  " separators in the format string for a slightly stretched
# look that mirrors the HEADER row. Falls back to "RELIC • <tier>"
# when the relic has no theme tag (only a couple of rare cases — most
# of RELIC_REGISTRY carries a themes array).
func _build_flavor_line(themes: Array, tier: String) -> String:
	var primary: String = ""
	if not themes.is_empty():
		primary = str(themes[0]).to_upper()
	else:
		primary = "RELIC"
	var tier_label: String = tier.to_upper()
	return "%s   •   %s" % [primary, tier_label]

# Map (themes, tier) → border color. Mythic always wins (warm gold);
# else first theme's palette entry; else cream-gold fallback.
func _resolve_border_color(themes: Array, tier: String) -> Color:
	if tier == "mythic":
		return MYTHIC_BORDER
	if not themes.is_empty():
		var first: String = str(themes[0])
		if THEME_COLORS.has(first):
			return THEME_COLORS[first]
	return DEFAULT_BORDER
