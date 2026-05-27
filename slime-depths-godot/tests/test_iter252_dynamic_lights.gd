extends SceneTree

# iter-252 / Wave 2 dynamic lighting smoke test.
#
# Verifies that every bright in-world object — projectile, soul gem, fire
# pool, pedestal — carries a PointLight2D so the Noita / Hades "dark cave
# lit by spells / gems / fire / pickups" aesthetic is enforced at the
# scene-file level. A regression that drops a PointLight2D from any of
# the four scenes will fail this test.
#
# Coverage:
#   A. scenes/projectile.tscn contains "[node ... type=\"PointLight2D\""
#   B. scenes/soul_gem.tscn contains "[node ... type=\"PointLight2D\""
#   C. scenes/fire_pool.tscn contains "[node ... type=\"PointLight2D\""
#   D. scenes/pedestal.tscn contains "[node ... type=\"PointLight2D\""
#   E. scripts/fire_pool.gd contains a Time.get_ticks_msec()-driven
#      flicker reference (sin-on-energy each frame) so fire pools
#      actually flicker rather than read as static light discs.
#
# Pure source-grep — no instantiation needed. Cheap to add to the 36-
# test sweep.

func _initialize() -> void:
	print("[iter252lights] init")
	await process_frame

	# ── A. projectile.tscn carries a PointLight2D ─────────────────────
	if not _scene_has_point_light("res://scenes/projectile.tscn"):
		printerr("FAIL: projectile.tscn missing PointLight2D — violet orb won't light the cave")
		quit(1)
		return
	print("[iter252lights] projectile.tscn OK — PointLight2D present")

	# ── B. soul_gem.tscn carries a PointLight2D ───────────────────────
	if not _scene_has_point_light("res://scenes/soul_gem.tscn"):
		printerr("FAIL: soul_gem.tscn missing PointLight2D — gems won't streak light toward hero")
		quit(1)
		return
	print("[iter252lights] soul_gem.tscn OK — PointLight2D present")

	# ── C. fire_pool.tscn carries a PointLight2D ──────────────────────
	if not _scene_has_point_light("res://scenes/fire_pool.tscn"):
		printerr("FAIL: fire_pool.tscn missing PointLight2D — fire pools won't illuminate surroundings")
		quit(1)
		return
	print("[iter252lights] fire_pool.tscn OK — PointLight2D present")

	# ── D. pedestal.tscn carries a PointLight2D ───────────────────────
	if not _scene_has_point_light("res://scenes/pedestal.tscn"):
		printerr("FAIL: pedestal.tscn missing PointLight2D — pedestals won't pool gold light on the floor")
		quit(1)
		return
	print("[iter252lights] pedestal.tscn OK — PointLight2D present")

	# ── E. fire_pool.gd flickers via Time.get_ticks_msec ──────────────
	# The flicker is the "active flame" tell. Without it the pool light
	# is a flat disc, which reads as static decal even with full color.
	var fp_script: Script = load("res://scripts/fire_pool.gd") as Script
	if fp_script == null:
		printerr("FAIL: fire_pool.gd failed to load as Script")
		quit(1)
		return
	var fp_src: String = fp_script.source_code
	# The flicker hook can be either Time.get_ticks_msec()-driven or
	# delta-based energy modulation (per the brief). We accept either:
	#   • "Time.get_ticks_msec" + "sin" in proximity → preferred ship path
	#   • a per-frame energy mutation with a sin term inside _physics_process
	# Cheap heuristic: both substrings must appear in the file source.
	var has_ticks: bool = fp_src.find("Time.get_ticks_msec") >= 0
	var has_sin_energy: bool = fp_src.find("sin(") >= 0
	if not (has_ticks and has_sin_energy):
		printerr(
			"FAIL: fire_pool.gd missing flicker — needs Time.get_ticks_msec + sin() "
			+ "(got ticks=%s, sin=%s)" % [str(has_ticks), str(has_sin_energy)]
		)
		quit(1)
		return
	print("[iter252lights] fire_pool.gd OK — Time.get_ticks_msec + sin() flicker present")

	# ── Bonus sanity: pedestal.gd starts a breathing pulse ────────────
	# Not strictly required by the brief's test list, but cheap to assert
	# and catches the regression where someone strips _start_breathing_pulse.
	var ped_script: Script = load("res://scripts/pedestal.gd") as Script
	if ped_script == null:
		printerr("FAIL: pedestal.gd failed to load as Script")
		quit(1)
		return
	var ped_src: String = ped_script.source_code
	if ped_src.find("_start_breathing_pulse") < 0:
		printerr("FAIL: pedestal.gd missing _start_breathing_pulse — pedestals won't pulse on offer")
		quit(1)
		return
	if ped_src.find("_breathing_mul") < 0:
		printerr("FAIL: pedestal.gd missing _breathing_mul field — pulse modulation broken")
		quit(1)
		return
	print("[iter252lights] pedestal.gd OK — _start_breathing_pulse + _breathing_mul present")

	print("[iter252lights] PASS")
	quit(0)

# Cheap text-grep: open the .tscn and look for the literal node-type
# declaration. Godot writes "[node name=\"...\" type=\"PointLight2D\"...]"
# on a single line so a single FileAccess.get_file_as_string + find()
# call is the right cost / coverage tradeoff. Returns false on missing
# file too (caller prints a more specific message).
func _scene_has_point_light(scene_path: String) -> bool:
	if not FileAccess.file_exists(scene_path):
		return false
	var txt: String = FileAccess.get_file_as_string(scene_path)
	if txt.is_empty():
		return false
	return txt.find("type=\"PointLight2D\"") >= 0
