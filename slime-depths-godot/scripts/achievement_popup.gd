# AchievementPopup — corner toast shown when an achievement unlocks.
# Replaces the earlier inline implementation in main.gd that built every
# label by hand and stacked multi-toasts via _achievement_popup_count.
#
# Layout (per spec):
#   Toast: 320 px wide, 70-90 px tall, top-right corner inset 20 px from
#   the right edge (offset_left=-340, offset_right=-20) and 20 px below
#   the HUD top. Layer=46 — above HUD, below pause (150) and death (200).
#   Panel: cream-gold 2-px border + dark navy semi-transparent fill.
#   Top hairline (subtle gold) for letterhead feel.
#   Header text: "A C H I E V E M E N T   U N L O C K E D" letterspaced
#   12-px cream-gold.
#   Achievement name: 18-px cream-gold (no bold available in default font,
#   but the larger size + outline reads as the bold-feel).
#   Description: 12-px dim cream, autowrap via the iter-67 pattern (pin
#   custom_minimum_size.x = 290, double await process_frame for layout).
#
# Animation:
#   Slide-in from offscreen-right + fade-in: 0.3 s ease-out.
#   Hold 4.0 s.
#   Slide-out + fade-out: 0.5 s ease-in.
#   Total ~4.8 s. Self-frees on tween-finish.
#
# Multi-toast handling (queue, not stack):
#   A static _queue: Array[Dictionary] holds (name, description, host)
#   tuples pushed when spawn() is called while _is_active is true.
#   On self-free the toast pops the next entry from _queue and spawns it.
#   Simpler than vertical stacking — fits the spec's "pick the simpler
#   one" guidance, and avoids the off-by-one slot-tracking bugs that
#   the old _achievement_popup_count scheme was prone to.
#
# Spawn convention (iter-61 test-mode-safe):
#   AchievementPopup.spawn(host, name, description)
#   where host is the Node that should own the toast — main.gd passes
#   `self`. Returns the instance (or null if a queue push happened
#   instead). Static, so callers don't need to preload the scene.
class_name AchievementPopup
extends CanvasLayer

const POPUP_SCENE: PackedScene = preload("res://scenes/achievement_popup.tscn")

# Width of the description label after content margins (320 panel - 14
# left - 14 right - small horizontal slack = 290). Reasserted in _ready
# defensively so a future .tscn tweak that drops the override can't
# re-introduce a one-line wrap bug like iter-67's pedestal had.
const INNER_WIDTH: float = 290.0
# Toast width — kept here so the slide-in offset can use the same value.
const TOAST_WIDTH: float = 320.0
# Baseline + non-desc heights so the panel grows down for long
# descriptions but never collapses below readable.
const BASELINE_HEIGHT: float = 78.0
# Header (~16) + Name (~22) + 2 separators × 3 px + 10 top + 12 bottom
# content margins + 4 hairline space = ~70. DescLabel sits below this.
const NON_DESC_HEIGHT: float = 64.0

# Animation timing per spec.
const FADE_IN_DUR: float = 0.30
const HOLD_DUR: float = 4.00
const FADE_OUT_DUR: float = 0.50

# Static queue + active flag. Pending unlocks while a toast is on screen
# wait their turn; the active toast pops the next on tween-finish. Using
# a Dictionary (rather than 3-tuples) keeps the shape obvious at call
# sites. `host` may go invalid before its turn comes up (e.g. scene
# change between unlocks); checked at pop time before re-spawn.
static var _queue: Array[Dictionary] = []
static var _is_active: bool = false

# Set by spawn() before add_child so _ready can populate the labels
# without the caller needing a follow-up configure() call.
var _ach_name: String = ""
var _ach_desc: String = ""

# Spawn entry point — call from main.gd's _on_achievement_unlocked.
# If a toast is already active, push to the queue and return null;
# the on-screen toast will pop us off when it self-frees. Host is the
# scene-tree node that owns the toast instance (main passes self).
static func spawn(host: Node, ach_name: String, ach_desc: String) -> AchievementPopup:
	if host == null:
		return null
	if _is_active:
		# Queue for after the current toast finishes.
		_queue.append({
			"host": host,
			"name": ach_name,
			"desc": ach_desc,
		})
		return null
	_is_active = true
	var inst: AchievementPopup = POPUP_SCENE.instantiate()
	inst._ach_name = ach_name
	inst._ach_desc = ach_desc
	host.add_child(inst)
	return inst

func _ready() -> void:
	var name_label: Label = $Root/Panel/Content/NameLabel
	var desc_label: Label = $Root/Panel/Content/DescLabel
	var panel: Panel = $Root/Panel
	name_label.text = _ach_name
	desc_label.text = _ach_desc
	# Iter-67 pattern — pin DescLabel inner width before measurement so
	# the autowrap pass has a target width to wrap against.
	desc_label.custom_minimum_size = Vector2(INNER_WIDTH, 0)
	# Start at zero alpha and slide the panel offscreen-right via its
	# `position.x` (an additive translate that doesn't touch the .tscn-
	# baked offset_left/right of -340/-20). The slide-in tween fades the
	# Root in while bringing position.x back to 0 — the panel returns to
	# its anchored rest spot. TOAST_WIDTH + 30 puts it fully off-screen
	# plus a small overshoot margin before the ease-out settles it.
	$Root.modulate.a = 0.0
	panel.position.x = TOAST_WIDTH + 30.0
	# Size + animate on the next frame so autowrap can settle (iter-67).
	_size_and_animate()

# Async sizing + animation entrypoint.
func _size_and_animate() -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	if not is_inside_tree():
		return
	var desc_label: Label = $Root/Panel/Content/DescLabel
	var panel: Panel = $Root/Panel
	# Measure the wrapped description height after the 2-frame settle.
	# Floor at one line so very-short descriptions don't collapse the
	# panel below the baseline.
	var desc_h: float = maxf(desc_label.get_minimum_size().y, 16.0)
	var total_h: float = maxf(BASELINE_HEIGHT, NON_DESC_HEIGHT + desc_h)
	panel.offset_bottom = panel.offset_top + total_h
	# Slide-in + fade-in (parallel), hold, slide-out + fade-out, free.
	var tween_in: Tween = create_tween().set_parallel(true)
	tween_in.tween_property($Root, "modulate:a", 1.0, FADE_IN_DUR).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween_in.tween_property(panel, "position:x", 0.0, FADE_IN_DUR).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	await tween_in.finished
	if not is_inside_tree():
		_finish()
		return
	await get_tree().create_timer(HOLD_DUR).timeout
	if not is_inside_tree():
		_finish()
		return
	var tween_out: Tween = create_tween().set_parallel(true)
	tween_out.tween_property($Root, "modulate:a", 0.0, FADE_OUT_DUR).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween_out.tween_property(panel, "position:x", TOAST_WIDTH + 30.0, FADE_OUT_DUR).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	await tween_out.finished
	_finish()

# Self-free + pop the next queued unlock (if any). Marks the static
# _is_active back to false BEFORE the recursive spawn() call so the
# next entry actually instantiates instead of queueing again.
func _finish() -> void:
	_is_active = false
	if not _queue.is_empty():
		var next: Dictionary = _queue.pop_front()
		var host = next.get("host")
		if host != null and is_instance_valid(host) and host is Node and (host as Node).is_inside_tree():
			# Re-spawn the next toast on the same host. spawn() will set
			# _is_active = true again and add a fresh instance.
			spawn(host as Node, str(next.get("name", "")), str(next.get("desc", "")))
	queue_free()
