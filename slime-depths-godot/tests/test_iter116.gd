extends SceneTree

# Iter 116 — Lighting pass (part 2 of the visual presentation pass).
#
# Pre-iter-116:
#   • Torches: PointLight2D energy 1.40, texture_scale 2.1, color
#     (1, 0.62, 0.32). Warm pool looked thin — pre-iter-115 the muddy
#     ambient + tight warm core read as "torch icon, not a light source."
#   • Vignette: 4 wedges at dark alpha 0.45 over 160 px reach. Corners
#     felt no different from mid-edges.
#   • Hero: no rim light — the player got LOST in the dim ambient until
#     they moved into a torch pool.
#
# Iter-116 lands three coordinated tunings + one new node:
#
#   TORCH POOL: energy 1.40 → 1.55, texture_scale 2.1 → 2.4, color
#   nudged warmer (1, 0.58, 0.28). Flicker amplitudes scale up
#   proportionally (0.18/0.10/0.05 → 0.20/0.11/0.06) so the relative
#   flicker depth stays the same at the higher base.
#
#   VIGNETTE DEPTH: wedge dark alpha 0.45 → 0.62. Plus 4 NEW corner
#   triangles with their corner vertex at +0.50 alpha over a 220 px
#   reach, so the corners are visibly deeper than mid-walls.
#
#   HERO RIM LIGHT: New PointLight2D child on hero.tscn. Cream-warm
#   color (1.0, 0.94, 0.82), low energy (0.55), small texture (192×192
#   radial), shadow_enabled=false. Reads as a subtle "the player is
#   here" beacon without overpowering torches or spotlighting nearby
#   enemies.
func _initialize() -> void:
	var ok := true

	# ═══ Torch tuning ═══
	var torch_src := FileAccess.get_file_as_string("res://scenes/torch.tscn")
	if "energy = 1.55" not in torch_src:
		push_error("FAIL: torch.tscn PointLight2D energy should be 1.55 (was 1.4)")
		ok = false
	if "texture_scale = 2.4" not in torch_src:
		push_error("FAIL: torch.tscn texture_scale should be 2.4 (was 2.1)")
		ok = false
	if "Color(1, 0.58, 0.28, 1)" not in torch_src:
		push_error("FAIL: torch.tscn color should shift warmer to (1, 0.58, 0.28)")
		ok = false
	if ok:
		print("OK torch.tscn lighting tuned: energy=1.55 / scale=2.4 / warmer color")

	# Torch flicker scaling
	var torch_gd := FileAccess.get_file_as_string("res://scripts/torch.gd")
	if "BASE_ENERGY   := 1.55" not in torch_gd:
		push_error("FAIL: torch.gd BASE_ENERGY should be 1.55 to match the .tscn")
		ok = false
	if "FLICKER_FAST  := 0.20" not in torch_gd:
		push_error("FAIL: torch.gd FLICKER_FAST should be 0.20 (proportional to 1.55 base)")
		ok = false
	if ok:
		print("OK torch.gd flicker amplitudes scaled proportionally to new base energy")

	# ═══ Vignette depth ═══
	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")
	if "Color(0, 0, 0, 0.62)" not in main_src:
		push_error("FAIL: vignette dark alpha should be 0.62 (was 0.45)")
		ok = false
	if "Color(0, 0, 0, 0.50)" not in main_src:
		push_error("FAIL: vignette corner darkening (alpha 0.50) missing")
		ok = false
	if "func _add_vignette_corner" not in main_src:
		push_error("FAIL: _add_vignette_corner helper missing — corners won't darken")
		ok = false
	# 4 corner spawns should be wired (one per corner_index 0/1/2/3)
	var corner_call_count: int = 0
	for line in main_src.split("\n"):
		if "_add_vignette_corner(layer" in line:
			corner_call_count += 1
	if corner_call_count < 4:
		push_error("FAIL: only %d _add_vignette_corner calls, expected 4 (TL/TR/BR/BL)" % corner_call_count)
		ok = false
	else:
		print("OK vignette deepened (alpha 0.62) + 4 corner darkening triangles wired")

	# ═══ Hero rim light ═══
	var hero_src := FileAccess.get_file_as_string("res://scenes/hero.tscn")
	if "name=\"RimLight\"" not in hero_src:
		push_error("FAIL: hero.tscn missing RimLight PointLight2D child")
		ok = false
	if "hero_rim_gradient" not in hero_src:
		push_error("FAIL: hero.tscn missing hero_rim_gradient sub_resource")
		ok = false
	if "hero_rim_tex" not in hero_src:
		push_error("FAIL: hero.tscn missing hero_rim_tex sub_resource")
		ok = false
	# RimLight specifics: shadow disabled (we don't want hero casting
	# shadows from its own rim light — would compete with torch shadows)
	if "shadow_enabled = false" not in hero_src:
		push_error("FAIL: hero RimLight should NOT cast shadows (would conflict with torches)")
		ok = false
	# Subtle energy — too bright would make the rim a spotlight
	if "energy = 0.55" not in hero_src:
		push_error("FAIL: hero RimLight energy should be 0.55 (subtle findability)")
		ok = false
	if ok:
		print("OK hero rim light wired: cream-warm, energy=0.55, no shadow casting")

	# ═══ Runtime: instantiate hero + verify RimLight child ═══
	var hero_scene: PackedScene = load("res://scenes/hero.tscn")
	if hero_scene == null:
		push_error("FAIL: hero.tscn no longer loads")
		ok = false
	else:
		var h: Node = hero_scene.instantiate()
		var rim: PointLight2D = h.get_node_or_null("RimLight")
		if rim == null:
			push_error("FAIL: instantiated hero has no RimLight child")
			ok = false
		else:
			if rim.shadow_enabled:
				push_error("FAIL: RimLight.shadow_enabled should be false at runtime")
				ok = false
			if rim.energy > 0.70:
				push_error("FAIL: RimLight energy %f too high — spotlights enemies" % rim.energy)
				ok = false
			else:
				print("OK runtime hero has RimLight (energy=%f, shadow=%s)" % [rim.energy, str(rim.shadow_enabled)])
		h.queue_free()

	# ═══ Torch instantiation ═══
	var torch_scene: PackedScene = load("res://scenes/torch.tscn")
	if torch_scene != null:
		var t: Node = torch_scene.instantiate()
		var light: PointLight2D = t.get_node_or_null("PointLight2D")
		if light != null and abs(light.energy - 1.55) > 0.01:
			push_error("FAIL: instantiated torch energy = %f, expected 1.55" % light.energy)
			ok = false
		elif light != null and abs(light.texture_scale - 2.4) > 0.01:
			push_error("FAIL: instantiated torch texture_scale = %f, expected 2.4" % light.texture_scale)
			ok = false
		else:
			print("OK runtime torch has energy=1.55, scale=2.4")
		t.queue_free()

	if ok:
		print("=== ITER 116 INTEGRATION PASSED ===")
	else:
		print("=== ITER 116 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
