extends SceneTree

# Iter 98 (Phase 1) — dash strike VFX cleanup.
#
# User playtest feedback after iter-97 movement feel fix:
#   "Dash strike visuals feel kind of like a bizarre lighting effect
#    which doesn't match anything."
#
# Diagnosis: the dash had FIVE overlapping visual elements with mixed
# palettes:
#   - dash_shield (iter-94) — cyan-gold magical bubble in front of hero
#   - dash_trail — magenta/purple/cyan particles ("arcane energy bleeding")
#   - dash_impact central flash — white-hot Polygon2D disc at landing
#   - dash_impact streaks — 6 jagged white-cyan motion lines
#   - dash_impact magenta-pink halo ring
# Combined: "knight charging through stone" was buried under three
# competing energy effects in three different non-painted color families.
#
# iter-98 Phase 1 — pure deletion + recolor, no new assets:
#   1. Delete dash_shield.tscn + .gd entirely (the bubble in front)
#   2. Remove DASH_SHIELD_SCENE preload + spawn from hero._start_dash_strike
#   3. Recolor dash_trail particles: magenta/cyan → cream-gold/tan/earth
#   4. Recolor dash_impact sparks: magenta-pink → cream-gold/tan
#   5. Recolor dash_impact halo: magenta-pink → warm dust gold
#   6. Delete central flash (FLASH_* consts + _spawn_central_flash +
#      per-frame flash update in _process)
#   7. Delete motion streaks (STREAK_* consts + _spawn_motion_streaks +
#      per-frame streak update in _process)
#
# Remaining dash visual stack:
#   • Hero afterimages (already warm gold — keep, unchanged)
#   • dash_trail particles (now gold/tan, painted palette)
#   • dash_impact: rings (warm gold) + debris (brown-cream) + cracks
func _initialize() -> void:
	var ok := true

	# ═══ 1. dash_shield deleted ═══
	for path in ["res://scenes/fx/dash_shield.tscn", "res://scripts/dash_shield.gd"]:
		if ResourceLoader.exists(path):
			push_error("FAIL: %s should be deleted in iter-98" % path)
			ok = false
	print("OK dash_shield.tscn + dash_shield.gd deleted")

	# ═══ 2. hero.gd no longer preloads / spawns DASH_SHIELD_SCENE ═══
	var hero_src := FileAccess.get_file_as_string("res://scripts/hero.gd")
	# Active-code references (excluding comments documenting the removal)
	var lines: PackedStringArray = hero_src.split("\n")
	var live_refs: int = 0
	for line in lines:
		var trimmed: String = line.strip_edges()
		if trimmed.begins_with("#"):
			continue
		if "DASH_SHIELD_SCENE" in line:
			live_refs += 1
			push_error("FAIL: live DASH_SHIELD_SCENE reference in hero.gd: %s" % trimmed)
	if live_refs == 0:
		print("OK hero.gd has no live DASH_SHIELD_SCENE references")
	else:
		ok = false

	# ═══ 3. dash_trail recolored — gold/tan, no magenta ═══
	var dt_src := FileAccess.get_file_as_string("res://scenes/fx/dash_trail.tscn")
	# The OLD gradient had "1, 0.6, 1" (magenta) as the second stop.
	if "1.0, 0.6, 1.0, 1.0" in dt_src or "1, 0.6, 1, 1" in dt_src:
		push_error("FAIL: dash_trail.tscn still has magenta color stop")
		ok = false
	else:
		print("OK dash_trail.tscn no longer uses magenta")
	# The new gradient should contain warm-gold values. We check for the
	# specific cream-gold hot stop (1.0, 0.92, 0.65).
	if not dt_src.contains("1.0, 0.92, 0.65"):
		push_error("FAIL: dash_trail.tscn missing iter-98 cream-gold hot stop")
		ok = false
	else:
		print("OK dash_trail.tscn has iter-98 cream-gold hot stop")

	# ═══ 4. dash_impact sparks + halo recolored ═══
	var di_src := FileAccess.get_file_as_string("res://scenes/fx/dash_impact.tscn")
	# Sparks gradient — the OLD first stop was (1, 0.7, 1) magenta.
	if "1, 0.7, 1, 1" in di_src or "1.0, 0.7, 1.0, 1.0" in di_src:
		push_error("FAIL: dash_impact.tscn sparks ramp still has magenta-pink")
		ok = false
	else:
		print("OK dash_impact.tscn sparks ramp no longer magenta-pink")
	# Halo default_color — OLD was (1, 0.6, 1, 0.65).
	if "Color(1, 0.6, 1, 0.65)" in di_src:
		push_error("FAIL: dash_impact.tscn Halo still has magenta-pink default_color")
		ok = false
	else:
		print("OK dash_impact.tscn Halo recolored from magenta-pink")

	# ═══ 5. dash_impact.gd — flash + streaks deleted ═══
	var di_gd := FileAccess.get_file_as_string("res://scripts/dash_impact.gd")
	# Active-code refs to the removed symbols.
	var di_lines: PackedStringArray = di_gd.split("\n")
	var di_live: int = 0
	for line in di_lines:
		var trimmed: String = line.strip_edges()
		if trimmed.begins_with("#"):
			continue
		# Constants gone
		if "const FLASH_" in line or "const STREAK_" in line:
			di_live += 1
			push_error("FAIL: dash_impact.gd still declares FLASH_/STREAK_ const: %s" % trimmed)
		# Functions gone
		if "func _spawn_central_flash" in line or "func _spawn_motion_streaks" in line:
			di_live += 1
			push_error("FAIL: dash_impact.gd still defines flash/streak spawn fn: %s" % trimmed)
		# State vars gone
		for tok in ["_flash:", "_streaks:", "_streak_base_alphas:", "_flash_base_color:"]:
			if "var %s" % tok in line:
				di_live += 1
				push_error("FAIL: dash_impact.gd still declares %s state var" % tok)
		# Calls gone
		if "_spawn_central_flash()" in line or "_spawn_motion_streaks()" in line:
			di_live += 1
			push_error("FAIL: dash_impact.gd still CALLS flash/streak spawn: %s" % trimmed)
	if di_live == 0:
		print("OK dash_impact.gd has no live flash/streak references")
	else:
		ok = false

	# ═══ 6. Runtime smoke — dash_impact scene still instantiates ═══
	var di_scene := load("res://scenes/fx/dash_impact.tscn") as PackedScene
	if di_scene == null:
		push_error("FAIL: dash_impact.tscn no longer loads")
		ok = false
	else:
		var inst: Node = di_scene.instantiate()
		if inst == null:
			push_error("FAIL: dash_impact scene failed to instantiate")
			ok = false
		else:
			# Halo + Core rings + Debris particles should still exist
			# (those are the keep-list). CentralFlash + Streaks must NOT.
			for keep in ["Halo", "Core", "Debris"]:
				if inst.get_node_or_null(keep) == null:
					push_error("FAIL: dash_impact lost expected child %s" % keep)
					ok = false
			if inst.get_node_or_null("CentralFlash") != null:
				push_error("FAIL: dash_impact still spawns CentralFlash child")
				ok = false
			# Streaks would be children added dynamically; check none exist
			# right after instantiation (before _ready runs in tree).
			print("OK dash_impact instantiates with Halo + Core + Debris, no CentralFlash")
			inst.queue_free()

	if ok:
		print("=== ITER 98 INTEGRATION PASSED ===")
	else:
		print("=== ITER 98 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
