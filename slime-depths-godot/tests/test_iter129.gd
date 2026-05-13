extends SceneTree

# Iter 129 — Pull the menu back from the iter-127 "3D movie headline"
# read + retire the bottom-ember "tiny random spray."
#
# Playtester verdict on the iter-128 menu state:
#   • Title: "Feels like a 3D movie headline, not an elegant dark-
#     fantasy game logo. Heavy bevel/extrusion. Shiny gold. Overly
#     thick outline. Floating-pasted-on feeling."
#   • Bottom particles: "Tiny random spray that adds almost nothing.
#     Reads like a leftover effect rather than deliberate atmosphere."
#
# Design diagnosis of the title problem: iter-127 added a TitleShadow
# Label at offset (+3, +4) for "carved-stone depth." But real carved
# inscription is DARKER INSIDE the cut (inner shadow), which Godot
# Label can't render without a shader. The drop-shadow offset instead
# produced a Hollywood-style bevel-and-emboss read. The concept was
# wrong from the start; removing the shadow Label is the only good
# answer.
#
# Diagnosis of the particle problem: EmberParticles drifted UP from a
# generic y=760 baseline with no scene anchor. The two torch ember
# emitters and the MistParticles all sit at scene-specific anchors
# (painted torches, painted stair line) — they read as embers FROM the
# torches and mist FROM the stairs. EmberParticles had no anchor; it
# was just decoration with nowhere to belong.
#
# Iter-129 retires the failed concepts + tones every aggressive title
# knob back:
#
#   TITLE — RESTRAINED
#     • TitleShadow Label removed (kills the 3D bevel)
#     • Title font_size 88 → 76 (less domineering)
#     • Title font_color (0.96, 0.88, 0.66) → (0.84, 0.76, 0.60)
#       (weathered bone, less saturated, less "shiny gold")
#     • Title outline_size 6 → 3 (thinner)
#     • Title outline_color pure black → warm dark-brown
#       (0.10, 0.06, 0.04) — outline reads as stone shadow, not
#       letter cutout
#     • TitleGlow font_size 88 → 76 (matched to Title)
#     • TitleGlow outline_size 18 → 12 (smaller bloom)
#     • TitleGlow outline alpha 0.45 → 0.25 (dimmer warmth)
#     • TitleHalo pulse alpha range (0.78..1.0) → (0.36..0.50) in
#       main_menu.gd::_apply_title_scale (quiet warm pool, not a
#       stage spotlight)
#
#   PARTICLES — RETIRE THE UNANCHORED
#     • EmberParticles CPUParticles2D node removed from main_menu.tscn
#     • ember_particles @onready ref + _reposition_embers handling
#       stripped from main_menu.gd
#     • LeftTorchEmbers, RightTorchEmbers, MistParticles all preserved
#       (each tied to a specific scene anchor; they earn their place)
func _initialize() -> void:
	var ok := true

	var tscn := FileAccess.get_file_as_string("res://scenes/main_menu.tscn")
	var gd := FileAccess.get_file_as_string("res://scripts/main_menu.gd")

	# ═══ Title chassis — restrained ═══
	if "name=\"TitleShadow\"" in tscn:
		push_error("FAIL: TitleShadow Label still in scene")
		ok = false
	if "@onready var title_shadow:" in gd:
		push_error("FAIL: title_shadow @onready ref still in main_menu.gd")
		ok = false
	# Title font_size 76
	if "theme_override_font_sizes/font_size = 76" not in tscn:
		push_error("FAIL: Title (or TitleGlow) font_size should be 76 (was 88)")
		ok = false
	if "theme_override_font_sizes/font_size = 88" in tscn:
		push_error("FAIL: leftover 88 pt font_size — iter-129 pulled this back to 76")
		ok = false
	# Title weathered-bone color
	if "Color(0.84, 0.76, 0.60, 1)" not in tscn:
		push_error("FAIL: Title color should be (0.84, 0.76, 0.60, 1) — weathered bone, not bright gold")
		ok = false
	# Title outline thinned and warmed
	if "Color(0.10, 0.06, 0.04, 1)" not in tscn:
		push_error("FAIL: Title outline should be warm dark-brown (0.10, 0.06, 0.04), not pure black")
		ok = false
	# Pre-iter-129 6 px outline gone
	if "outline_size = 6" in tscn:
		push_error("FAIL: outline_size = 6 still present (iter-129 thinned to 3)")
		ok = false
	if ok:
		print("OK title: smaller (76 pt), weathered bone, warm dark-brown outline, no drop-shadow Label")

	# ═══ TitleGlow dimmed ═══
	# outline_size 18 → 12 and alpha 0.45 → 0.25
	if "Color(0.85, 0.55, 0.25, 0.25)" not in tscn:
		push_error("FAIL: TitleGlow outline color/alpha should be (0.85, 0.55, 0.25, 0.25)")
		ok = false
	if "outline_size = 12" not in tscn:
		push_error("FAIL: TitleGlow outline_size should be 12 (was 18)")
		ok = false
	if ok:
		print("OK TitleGlow halo dimmed: size 12 + alpha 0.25")

	# ═══ TitleHalo pulse range lowered ═══
	if "lerp(0.36, 0.50, clampf" not in gd:
		push_error("FAIL: _apply_title_scale halo range should be (0.36..0.50), was (0.78..1.0)")
		ok = false
	if ok:
		print("OK TitleHalo pulse pulled to (0.36..0.50) — quiet warmth, not stage spotlight")

	# ═══ Bottom EmberParticles retired ═══
	if "name=\"EmberParticles\"" in tscn:
		push_error("FAIL: EmberParticles node still in main_menu.tscn")
		ok = false
	if "@onready var ember_particles" in gd:
		push_error("FAIL: ember_particles @onready ref still in main_menu.gd")
		ok = false
	if "ember_particles.position" in gd:
		push_error("FAIL: _reposition_embers still touches ember_particles (which no longer exists)")
		ok = false
	if "ember_particles.emission_rect_extents" in gd:
		push_error("FAIL: _reposition_embers still touches ember_particles.emission_rect_extents")
		ok = false
	if ok:
		print("OK EmberParticles bottom spray removed (torch + mist emitters retained)")

	# ═══ Scene-anchored emitters survive ═══
	for anchor in ["LeftTorchEmbers", "RightTorchEmbers", "MistParticles"]:
		if "name=\"%s\"" % anchor not in tscn:
			push_error("FAIL: %s removed — only the unanchored EmberParticles should have gone" % anchor)
			ok = false
	if ok:
		print("OK scene-anchored emitters preserved (LeftTorch + RightTorch + Mist)")

	# ═══ Runtime ═══
	var scene: PackedScene = load("res://scenes/main_menu.tscn")
	if scene == null:
		push_error("FAIL: main_menu.tscn no longer loads after iter-129 cleanup")
		ok = false

	if ok:
		print("=== ITER 129 INTEGRATION PASSED ===")
	else:
		print("=== ITER 129 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
