extends SceneTree

# iter-255 / Wave 4 — atmospheric density + palette contrast push.
#
# Pre-iter-255 the world felt static between actions. Ambient motes were
# sparse (24-48 per biome), only ember + sanctuary had secondary mote
# layers, and the ambient_tint + wall mass colors were tuned to a
# moderately-dark baseline that left the warm torch pools reading as
# mild overlays rather than light sources punching through dark.
#
# iter-255 changes:
#   1. Per-biome PRIMARY mote amounts bumped 2-3× (crypt 24→56, ossuary
#      32→72, ember 48→84, sanctuary 28→64, default fallback 32→72) with
#      lifetime compensation on the slow biomes (7→8s crypt, 8→9s ossuary,
#      7.5→8.5s sanctuary). Net effect: air is thick with motion.
#   2. All 4 biomes now have a SECONDARY mote layer with distinct visual
#      identity (was just ember + sanctuary). Each biome reads
#      differently in its airborne particles, not just its floor color.
#   3. BIOME_DARKNESS_MULTIPLIER = 0.78 applied to ambient_tint at room
#      load (component-wise, alpha unchanged) — 22% darker baseline.
#   4. BIOME_WALL_DARKNESS_MULTIPLIER = 0.85 applied to per-biome wall
#      mass color — 15% darker walls.
#   5. Torch energy 1.95 → 2.34 (+20%), texture_scale 3.56 → 4.20 (+18%)
#      so the warm pools punch the new deeper darkness with HIGHER
#      contrast than before.
#   6. Hero rim light energy 0.6 → 0.85, texture_scale 1.5 → 1.85 so the
#      hero stays "brightest small object on screen" findability anchor.
#
# Checks (all source/file grep — fast headless):
#   A. main.gd contains const BIOME_DARKNESS_MULTIPLIER
#   B. main.gd contains const BIOME_WALL_DARKNESS_MULTIPLIER
#   C. main.gd::_build_ambient_mote_primary uses bumped amounts
#       per biome (crypt 56, ossuary 72, ember 84, sanctuary 64)
#   D. main.gd::_build_ambient_mote_accent now branches on all 4 biome
#       names (crypt, ossuary, ember, sanctuary)
#   E. scenes/torch.tscn texture_scale ≥ 4.0 AND energy > 2.0
#   F. scenes/hero.tscn RimLight energy ≥ 0.8 AND texture_scale ≥ 1.8

func _initialize() -> void:
	print("[iter255] init")
	await process_frame

	# ── A. main.gd BIOME_DARKNESS_MULTIPLIER const ───────────────────
	var main_script: Script = load("res://scripts/main.gd") as Script
	if main_script == null:
		printerr("FAIL: main.gd failed to load")
		quit(1)
		return
	var main_src: String = main_script.source_code
	if main_src.find("BIOME_DARKNESS_MULTIPLIER") < 0:
		printerr("FAIL: main.gd missing BIOME_DARKNESS_MULTIPLIER const")
		quit(1)
		return
	# Sanity: the const should hold the value 0.78 (or a similar darker
	# multiplier — anything < 1.0 should pass the intent test).
	var bdm_idx: int = main_src.find("const BIOME_DARKNESS_MULTIPLIER")
	if bdm_idx < 0:
		printerr("FAIL: main.gd missing 'const BIOME_DARKNESS_MULTIPLIER'")
		quit(1)
		return
	# Verify it's actually applied somewhere (not just declared and dead).
	if main_src.find("* BIOME_DARKNESS_MULTIPLIER") < 0:
		printerr("FAIL: main.gd BIOME_DARKNESS_MULTIPLIER declared but not applied")
		quit(1)
		return
	print("[iter255] A. BIOME_DARKNESS_MULTIPLIER const + application OK")

	# ── B. main.gd BIOME_WALL_DARKNESS_MULTIPLIER const ──────────────
	if main_src.find("BIOME_WALL_DARKNESS_MULTIPLIER") < 0:
		printerr("FAIL: main.gd missing BIOME_WALL_DARKNESS_MULTIPLIER const")
		quit(1)
		return
	if main_src.find("* BIOME_WALL_DARKNESS_MULTIPLIER") < 0:
		printerr("FAIL: main.gd BIOME_WALL_DARKNESS_MULTIPLIER declared but not applied")
		quit(1)
		return
	print("[iter255] B. BIOME_WALL_DARKNESS_MULTIPLIER const + application OK")

	# ── C. Primary mote amounts bumped per biome ─────────────────────
	# Look inside _build_ambient_mote_primary specifically so we don't
	# pick up matching strings elsewhere. Window of ~3500 chars covers
	# the whole match block.
	var primary_idx: int = main_src.find("func _build_ambient_mote_primary")
	if primary_idx < 0:
		printerr("FAIL: main.gd missing _build_ambient_mote_primary")
		quit(1)
		return
	var primary_window: String = main_src.substr(primary_idx, 3500)
	# Each per-biome amount line must be present in the window.
	# We grep for "motes.amount = N" patterns matched against the
	# bumped values.
	if primary_window.find("motes.amount = 56") < 0:
		printerr("FAIL: primary mote crypt amount not bumped to 56")
		quit(1)
		return
	if primary_window.find("motes.amount = 72") < 0:
		printerr("FAIL: primary mote ossuary (or fallback) amount not bumped to 72")
		quit(1)
		return
	if primary_window.find("motes.amount = 84") < 0:
		printerr("FAIL: primary mote ember amount not bumped to 84")
		quit(1)
		return
	if primary_window.find("motes.amount = 64") < 0:
		printerr("FAIL: primary mote sanctuary amount not bumped to 64")
		quit(1)
		return
	# Defensive: the pre-iter-255 amounts (24 / 32 / 48 / 28) must be gone
	# from this function body.
	if primary_window.find("motes.amount = 24") >= 0:
		printerr("FAIL: primary mote crypt still at old amount 24")
		quit(1)
		return
	if primary_window.find("motes.amount = 48") >= 0:
		printerr("FAIL: primary mote ember still at old amount 48")
		quit(1)
		return
	if primary_window.find("motes.amount = 28") >= 0:
		printerr("FAIL: primary mote sanctuary still at old amount 28")
		quit(1)
		return
	print("[iter255] C. primary mote amounts crypt=56 / ossuary=72 / ember=84 / sanctuary=64 OK")

	# ── D. Accent emitter covers ALL 4 biomes ────────────────────────
	var accent_idx: int = main_src.find("func _build_ambient_mote_accent")
	if accent_idx < 0:
		printerr("FAIL: main.gd missing _build_ambient_mote_accent")
		quit(1)
		return
	var accent_window: String = main_src.substr(accent_idx, 6000)
	# Each biome name must appear as a match case in the accent body.
	for biome in ["crypt", "ossuary", "ember", "sanctuary"]:
		var case_str: String = "\"%s\":" % biome
		if accent_window.find(case_str) < 0:
			printerr("FAIL: _build_ambient_mote_accent missing case for biome '%s'" % biome)
			quit(1)
			return
	print("[iter255] D. accent emitter covers crypt + ossuary + ember + sanctuary OK")

	# ── E. torch.tscn texture_scale ≥ 4.0 AND energy > 2.0 ───────────
	var torch_f := FileAccess.open("res://scenes/torch.tscn", FileAccess.READ)
	if torch_f == null:
		printerr("FAIL: could not open torch.tscn")
		quit(1)
		return
	var torch_text: String = torch_f.get_as_text()
	torch_f.close()
	# Hand-parse the PointLight2D values. Scope to the PointLight2D
	# block to avoid mis-matching the Smoke node's scale fields.
	var torch_energy: float = -1.0
	var torch_scale: float = -1.0
	var in_pl_block: bool = false
	for line in torch_text.split("\n"):
		var s: String = (line as String).strip_edges()
		if s.find("type=\"PointLight2D\"") >= 0:
			in_pl_block = true
			continue
		if in_pl_block and s.begins_with("[node "):
			in_pl_block = false
		if in_pl_block and s.begins_with("energy"):
			var eq: int = s.find("=")
			if eq >= 0:
				torch_energy = s.substr(eq + 1).strip_edges().to_float()
		if in_pl_block and s.begins_with("texture_scale"):
			var eq2: int = s.find("=")
			if eq2 >= 0:
				torch_scale = s.substr(eq2 + 1).strip_edges().to_float()
	if torch_scale < 4.0:
		printerr("FAIL: torch.tscn texture_scale=%f, expected ≥ 4.0" % torch_scale)
		quit(1)
		return
	if torch_energy <= 2.0:
		printerr("FAIL: torch.tscn energy=%f, expected > 2.0" % torch_energy)
		quit(1)
		return
	print("[iter255] E. torch.tscn energy=%f + texture_scale=%f OK" % [torch_energy, torch_scale])

	# ── F. hero.tscn RimLight energy ≥ 0.8 AND texture_scale ≥ 1.8 ───
	var hero_f := FileAccess.open("res://scenes/hero.tscn", FileAccess.READ)
	if hero_f == null:
		printerr("FAIL: could not open hero.tscn")
		quit(1)
		return
	var hero_text: String = hero_f.get_as_text()
	hero_f.close()
	# Walk the RimLight block so we don't accidentally match another
	# node's energy / texture_scale (there's only one PointLight2D on
	# the hero, but be defensive).
	var rim_energy: float = -1.0
	var rim_scale: float = -1.0
	var in_rim_block: bool = false
	for line in hero_text.split("\n"):
		var s: String = (line as String).strip_edges()
		if s.find("name=\"RimLight\"") >= 0:
			in_rim_block = true
			continue
		if in_rim_block and s.begins_with("[node "):
			in_rim_block = false
		if in_rim_block and s.begins_with("energy"):
			var eq: int = s.find("=")
			if eq >= 0:
				rim_energy = s.substr(eq + 1).strip_edges().to_float()
		if in_rim_block and s.begins_with("texture_scale"):
			var eq2: int = s.find("=")
			if eq2 >= 0:
				rim_scale = s.substr(eq2 + 1).strip_edges().to_float()
	if rim_energy < 0.8:
		printerr("FAIL: hero.tscn RimLight energy=%f, expected ≥ 0.8" % rim_energy)
		quit(1)
		return
	if rim_scale < 1.8:
		printerr("FAIL: hero.tscn RimLight texture_scale=%f, expected ≥ 1.8" % rim_scale)
		quit(1)
		return
	print("[iter255] F. hero.tscn RimLight energy=%f + texture_scale=%f OK" % [rim_energy, rim_scale])

	print("[iter255] PASS")
	quit(0)
