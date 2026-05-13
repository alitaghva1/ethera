extends SceneTree

# Iter 128 — Remove the "beneath the ruin" subtitle entirely.
#
# Playtester verdict on the iter-127 italic subtitle: "Looks bad and
# needs to be reconsidered properly. Faint, low-contrast, awkwardly
# placed. Floats in empty space between the main title and the menu.
# Reads like placeholder flavor text rather than an intentional
# subtitle."
#
# Design review against premium dark-fantasy / roguelite titles:
#   • Elden Ring, Dark Souls III, Bloodborne, Hollow Knight, Hades,
#     Sekiro, Diablo IV, Slay the Spire, Enter the Gungeon —
#     ZERO of them carry a separate subtitle Label on the title screen.
#   • When taglines exist in this genre they're baked into the LOGO
#     art (Sekiro's "Shadows Die Twice"), not floating in screen space.
#
# Verdict: there's no design treatment that beats removal. The user's
# explicit rule applies: "If the subtitle cannot be made genuinely
# good, remove it. Do not keep it just for the sake of having a
# subtitle."
#
# Iter-128 retires:
#   • Subtitle Label (iter-92 added, iter-93 + iter-127 reworked)
#   • SubtitleRule Panel (iter-127 manuscript hairline beneath subtitle)
#   • body_font_italic SystemFont sub_resource (iter-127, only used by
#     the now-deleted subtitle)
#   • SUBTITLE_ALPHA_MIN / SUBTITLE_ALPHA_MAX / SUBTITLE_PULSE_HALF_DURATION
#     constants in main_menu.gd (iter-92 subtitle pulse)
#   • _subtitle_tween var, _start_subtitle_pulse() function +
#     _apply_subtitle_alpha() function — all subtitle-only animation
#   • @onready var subtitle reference
#   • Subtitle's _start_subtitle_pulse() call site in _ready
#   • load_steps 18 → 17 (one fewer sub-resource)
#
# The empty space between title and button stack is now CONFIDENT
# breathing room — not "we forgot to put something there."
func _initialize() -> void:
	var ok := true

	var tscn := FileAccess.get_file_as_string("res://scenes/main_menu.tscn")
	var gd := FileAccess.get_file_as_string("res://scripts/main_menu.gd")

	# ═══ Scene-side removals ═══
	if "name=\"Subtitle\" type=\"Label\"" in tscn:
		push_error("FAIL: Subtitle Label still in main_menu.tscn")
		ok = false
	if "name=\"SubtitleRule\"" in tscn:
		push_error("FAIL: SubtitleRule manuscript hairline still in main_menu.tscn")
		ok = false
	if "[sub_resource type=\"SystemFont\" id=\"body_font_italic\"]" in tscn:
		push_error("FAIL: body_font_italic sub_resource still in main_menu.tscn (orphaned)")
		ok = false
	if "load_steps=17" not in tscn:
		push_error("FAIL: load_steps should drop to 17 (was 18 — italic font sub_resource gone)")
		ok = false
	if ok:
		print("OK scene-side subtitle artifacts retired (label, rule, italic font, load_steps)")

	# ═══ Script-side removals ═══
	if "@onready var subtitle: Label" in gd:
		push_error("FAIL: @onready var subtitle reference still in main_menu.gd")
		ok = false
	if "SUBTITLE_ALPHA_MIN" in gd:
		push_error("FAIL: SUBTITLE_ALPHA_MIN constant still present")
		ok = false
	if "SUBTITLE_ALPHA_MAX" in gd:
		push_error("FAIL: SUBTITLE_ALPHA_MAX constant still present")
		ok = false
	if "SUBTITLE_PULSE_HALF_DURATION" in gd:
		push_error("FAIL: SUBTITLE_PULSE_HALF_DURATION constant still present")
		ok = false
	if "var _subtitle_tween" in gd:
		push_error("FAIL: _subtitle_tween var still declared")
		ok = false
	if "func _start_subtitle_pulse" in gd:
		push_error("FAIL: _start_subtitle_pulse function still defined")
		ok = false
	if "func _apply_subtitle_alpha" in gd:
		push_error("FAIL: _apply_subtitle_alpha function still defined")
		ok = false
	if "_start_subtitle_pulse()" in gd:
		push_error("FAIL: _start_subtitle_pulse() still called from _ready")
		ok = false
	if ok:
		print("OK script-side subtitle code removed (constants, vars, fns, call sites)")

	# ═══ The title stack is intact ═══
	# Title + TitleGlow + TitleShadow stay — they're the brand. We
	# just verify the deletion didn't accidentally take them along.
	for keep in ["name=\"Title\" type=\"Label\"", "name=\"TitleGlow\"", "name=\"TitleShadow\""]:
		if keep not in tscn:
			push_error("FAIL: %s missing — subtitle removal accidentally took the title stack" % keep)
			ok = false
	if ok:
		print("OK title stack intact: TitleShadow + TitleGlow + Title")

	# ═══ Runtime ═══
	var scene: PackedScene = load("res://scenes/main_menu.tscn")
	if scene == null:
		push_error("FAIL: main_menu.tscn no longer loads after subtitle removal")
		ok = false

	if ok:
		print("=== ITER 128 INTEGRATION PASSED ===")
	else:
		print("=== ITER 128 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
