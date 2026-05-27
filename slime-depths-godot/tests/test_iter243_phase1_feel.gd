extends SceneTree

# iter-243 / Director Phase 1 — feel + readability smoke test.
#
# Phase 1 is mostly visual / audio polish, so most of this test is
# source-grep + constant-introspection. Six checks:
#
#   A. damage_number.gd — up-float RISE ≤ 24 (down from 40 pre-iter-243)
#   B. damage_number.gd — normal baseline font ≥ 42 pt; crit ≥ 55 pt;
#      crit color is gold (R high, G mid, B low)
#   C. reaction_web.gd — no "neecs" typo anywhere; "needs" lock present
#   D. soul_gem.gd — polygon size ≥ 12 px diagonal (top vertex y ≤ -6)
#      AND violet (R high, G mid, B high)
#   E. audio.gd — SOUND_CONFIGS has enemy_hit_small / _medium / _large
#   F. enemy.gd — _ensure_telegraph_arc helper present
#   G. scenes/hero.tscn — contains PointLight2D node
#
# Each check is a hard FAIL with a printerr describing the broken
# contract. The whole suite ends with PASS / quit(0).

func _initialize() -> void:
	print("[iter243] init")
	await process_frame

	# ── A. damage_number.gd RISE constant ─────────────────────────────
	var dn_script: Script = load("res://scripts/damage_number.gd") as Script
	if dn_script == null:
		printerr("FAIL: damage_number.gd failed to load as Script")
		quit(1)
		return
	var dn_src: String = dn_script.source_code
	# Hand-parse the RISE constant line. Format: "const RISE        := 24.0"
	var rise_val: float = -1.0
	for line in dn_src.split("\n"):
		var s: String = (line as String).strip_edges()
		if s.begins_with("const RISE"):
			# Pull the number after the ":=" operator.
			var idx: int = s.find(":=")
			if idx < 0:
				continue
			var rhs: String = s.substr(idx + 2).strip_edges()
			# Strip trailing inline comment after a "#" if present.
			var hash_idx: int = rhs.find("#")
			if hash_idx >= 0:
				rhs = rhs.substr(0, hash_idx).strip_edges()
			rise_val = rhs.to_float()
			break
	if rise_val < 0.0:
		printerr("FAIL: damage_number.gd RISE constant not found")
		quit(1)
		return
	if rise_val > 24.0:
		printerr("FAIL: damage_number.gd RISE=%f, expected ≤ 24" % rise_val)
		quit(1)
		return
	print("[iter243] A. damage_number RISE = %f (≤ 24) OK" % rise_val)

	# ── B. damage_number.gd font sizes (normal 42, crit 55) ───────────
	# We look for the literal strings used by _apply_variant. Normal
	# baseline is "28 + bonus"; iter-243 bumped to "42 + bonus". Crit
	# was 36; iter-243 bumped to 55.
	if dn_src.find("42 + bonus") < 0:
		printerr("FAIL: damage_number.gd normal baseline did NOT bump to 42 pt (look for '42 + bonus')")
		quit(1)
		return
	if dn_src.find("\"font_size\", 55") < 0:
		printerr("FAIL: damage_number.gd crit font_size did NOT bump to 55 pt")
		quit(1)
		return
	# Crit gold tint: Color(1.0, 0.85, 0.40, 1.0)
	if dn_src.find("Color(1.0, 0.85, 0.40, 1.0)") < 0:
		printerr("FAIL: damage_number.gd crit color is NOT gold Color(1.0, 0.85, 0.40, 1.0)")
		quit(1)
		return
	print("[iter243] B. damage_number normal=42pt, crit=55pt + gold OK")

	# ── C. reaction_web.gd typo lock ──────────────────────────────────
	var rw_script: Script = load("res://scripts/reaction_web.gd") as Script
	if rw_script == null:
		printerr("FAIL: reaction_web.gd failed to load")
		quit(1)
		return
	var rw_src: String = rw_script.source_code
	if rw_src.find("neecs") >= 0:
		printerr("FAIL: reaction_web.gd contains 'neecs' typo")
		quit(1)
		return
	if rw_src.find("needs") < 0:
		printerr("FAIL: reaction_web.gd missing 'needs' lock comment")
		quit(1)
		return
	# Also verify main.gd::_update_reaction_web hides partial chips
	# entirely (no "needs %s" rendering).
	var main_script: Script = load("res://scripts/main.gd") as Script
	if main_script == null:
		printerr("FAIL: main.gd failed to load")
		quit(1)
		return
	var main_src: String = main_script.source_code
	# The literal partial-state rendering string was removed. We assert
	# the post-iter-243 hide path: in the "partial" arm, chip.visible =
	# false AND chip.text = "".
	# Cheapest signal: the "needs %s" format string is GONE.
	if main_src.find("\"· %s · needs %s\"") >= 0:
		printerr("FAIL: main.gd still renders 'needs X' partial chip text (iter-243 should hide partials entirely)")
		quit(1)
		return
	print("[iter243] C. reaction_web typo + partial-hide OK")

	# ── D. soul_gem.gd polygon size + violet ──────────────────────────
	var sg_script: Script = load("res://scripts/soul_gem.gd") as Script
	if sg_script == null:
		printerr("FAIL: soul_gem.gd failed to load")
		quit(1)
		return
	var sg_src: String = sg_script.source_code
	# Pre-iter-243 polygon top point was Vector2(0, -5). iter-243 bumps
	# to Vector2(0, -6) (or larger). We grep for the iter-243 vertices.
	if sg_src.find("Vector2(0, -6)") < 0:
		printerr("FAIL: soul_gem polygon top vertex (0, -6) missing — gem did not scale up to ≥ 12 px diameter")
		quit(1)
		return
	if sg_src.find("Vector2(6, 0)") < 0:
		printerr("FAIL: soul_gem polygon right vertex (6, 0) missing")
		quit(1)
		return
	# Bright violet: Color(0.80, 0.55, 1.0, ...)
	if sg_src.find("Color(0.80, 0.55, 1.0") < 0:
		printerr("FAIL: soul_gem polygon NOT bright violet Color(0.80, 0.55, 1.0, ...)")
		quit(1)
		return
	# Trail spawner present.
	if sg_src.find("_spawn_trail_ghost") < 0:
		printerr("FAIL: soul_gem missing _spawn_trail_ghost helper")
		quit(1)
		return
	print("[iter243] D. soul_gem polygon ≥ 12 px + violet + ghost trail OK")

	# ── E. audio.gd enemy_hit size variants ───────────────────────────
	var au_script: Script = load("res://scripts/audio.gd") as Script
	if au_script == null:
		printerr("FAIL: audio.gd failed to load")
		quit(1)
		return
	var au_src: String = au_script.source_code
	for v in ["enemy_hit_small", "enemy_hit_medium", "enemy_hit_large"]:
		if au_src.find("\"%s\"" % v) < 0:
			printerr("FAIL: audio.gd SOUND_CONFIGS missing %s" % v)
			quit(1)
			return
	print("[iter243] E. audio.gd has 3 enemy_hit size variants OK")

	# ── F. enemy.gd telegraph arc helper ──────────────────────────────
	var en_script: Script = load("res://scripts/enemy.gd") as Script
	if en_script == null:
		printerr("FAIL: enemy.gd failed to load")
		quit(1)
		return
	var en_src: String = en_script.source_code
	if en_src.find("_ensure_telegraph_arc") < 0:
		printerr("FAIL: enemy.gd missing _ensure_telegraph_arc helper")
		quit(1)
		return
	if en_src.find("_update_telegraph_arc") < 0:
		printerr("FAIL: enemy.gd missing _update_telegraph_arc call site")
		quit(1)
		return
	# Verify size-class hit audio is dispatched on take_hit.
	if en_src.find("enemy_hit_small") < 0:
		printerr("FAIL: enemy.gd take_hit not branching on enemy_hit_small variant")
		quit(1)
		return
	if en_src.find("enemy_hit_large") < 0:
		printerr("FAIL: enemy.gd take_hit not branching on enemy_hit_large variant")
		quit(1)
		return
	# Verify impact-site damage number — should subtract collision_radius
	# (not the old hard-coded -28). The iter-243 line uses
	# `global_position - Vector2(0, impact_offset)`.
	if en_src.find("impact_offset") < 0:
		printerr("FAIL: enemy.gd damage number not spawning at impact point (no impact_offset)")
		quit(1)
		return
	print("[iter243] F. enemy.gd telegraph arc + size audio + impact-point spawn OK")

	# ── G. hero.tscn PointLight2D node ────────────────────────────────
	var hero_f := FileAccess.open("res://scenes/hero.tscn", FileAccess.READ)
	if hero_f == null:
		printerr("FAIL: could not open hero.tscn")
		quit(1)
		return
	var hero_tscn: String = hero_f.get_as_text()
	hero_f.close()
	if hero_tscn.find("type=\"PointLight2D\"") < 0:
		printerr("FAIL: hero.tscn missing PointLight2D node")
		quit(1)
		return
	# iter-243 specific: energy = 0.6 (was 0.55), texture_scale = 1.5
	if hero_tscn.find("energy = 0.6") < 0:
		printerr("FAIL: hero.tscn rim light energy not bumped to 0.6")
		quit(1)
		return
	if hero_tscn.find("texture_scale = 1.5") < 0:
		printerr("FAIL: hero.tscn rim light texture_scale not bumped to 1.5")
		quit(1)
		return
	print("[iter243] G. hero.tscn PointLight2D energy=0.6 + scale=1.5 OK")

	print("[iter243] PASS")
	quit(0)
