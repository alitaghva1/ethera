extends SceneTree

# iter-242 / Loop Tightening — pacing constants regression test.
#
# Levers 2 + 3 are constant-only changes; a future revert is detectable
# only by reading the constants back from main.gd's source. This test
# parses the script source and asserts:
#
#   INITIAL_WAVE_DELAY ≤ 0.25   (was 0.6 pre-iter-242)
#   WAVE_CLEAR_PAUSE   ≤ 0.35   (was 0.9 pre-iter-242)
#   ROOM_BANNER_HOLD   ≤ 0.80   (was 1.5 pre-iter-242)
#   ATTACK_COOLDOWN    ≤ 0.20   (LEVER 5 — was 0.40)
#
# The thresholds are slightly looser than the iter-242 ship values so a
# minor future re-tune (0.25 INITIAL_WAVE_DELAY, etc) doesn't fail the
# test. Anything looser than these undoes the loop tightening.
#
# Lever 4 (tier audio) is verified by inspecting audio.gd for the three
# new SOUND_CONFIGS entries.

func _initialize() -> void:
	print("[iter242loop] init")
	await process_frame

	# ── A. main.gd pacing constants ───────────────────────────────────
	var main_script: Script = load("res://scripts/main.gd") as Script
	if main_script == null:
		printerr("FAIL: main.gd failed to load as Script")
		quit(1)
		return
	var src: String = main_script.source_code
	# Hand-parse the const declarations. Each line is one of:
	#   const NAME := VALUE          (no space)
	#   const NAME  := VALUE         (any spaces)
	# We grep for the literal value, robust enough for the simple int/float
	# numerics here. Fail fast if any threshold is broken.
	var pacing_checks: Array = [
		# [field_name, threshold, pretty_label]
		["INITIAL_WAVE_DELAY", 0.25, "intro delay"],
		["WAVE_CLEAR_PAUSE",   0.35, "between-wave pause"],
		["ROOM_BANNER_HOLD",   0.80, "room banner hold"],
	]
	for chk in pacing_checks:
		var name: String = chk[0]
		var threshold: float = chk[1]
		var label: String = chk[2]
		var val: float = _extract_const_float(src, name)
		if val < 0.0:
			printerr("FAIL: main.gd missing const %s" % name)
			quit(1)
			return
		if val > threshold:
			printerr("FAIL: %s = %.3f > threshold %.3f (iter-242 %s loosened)" % [name, val, threshold, label])
			quit(1)
			return
		print("[iter242loop] %s = %.3f ≤ %.3f OK (%s)" % [name, val, threshold, label])

	# ── B. hero.gd attack cooldown ────────────────────────────────────
	var hero_script: Script = load("res://scripts/hero.gd") as Script
	if hero_script == null:
		printerr("FAIL: hero.gd failed to load as Script")
		quit(1)
		return
	var hsrc: String = hero_script.source_code
	var atk: float = _extract_const_float(hsrc, "ATTACK_COOLDOWN")
	if atk < 0.0:
		printerr("FAIL: hero.gd missing const ATTACK_COOLDOWN")
		quit(1)
		return
	if atk > 0.20:
		printerr("FAIL: ATTACK_COOLDOWN = %.3f > 0.20 (iter-242 LEVER 5 reverted)" % atk)
		quit(1)
		return
	print("[iter242loop] ATTACK_COOLDOWN = %.3f ≤ 0.20 OK (swing-cancel ceiling)" % atk)

	# ── C. audio.gd tier-pickup entries (LEVER 4) ────────────────────
	var audio_script: Script = load("res://scripts/audio.gd") as Script
	if audio_script == null:
		printerr("FAIL: audio.gd failed to load as Script")
		quit(1)
		return
	var asrc: String = audio_script.source_code
	var required_audio_keys: Array = [
		"\"pickup_common\"",
		"\"pickup_rare\"",
		"\"pickup_legendary\"",
		"\"gem_pickup\"",
		"\"kill_milestone\"",
	]
	for k in required_audio_keys:
		if asrc.find(k) < 0:
			printerr("FAIL: audio.gd SOUND_CONFIGS missing %s" % k)
			quit(1)
			return
	print("[iter242loop] audio.gd OK — 5 new SOUND_CONFIGS entries present (3 tier + gem + milestone)")

	# ── D. main.gd dispatch helper (LEVER 4) ─────────────────────────
	if src.find("func _play_tier_pickup_audio") < 0:
		printerr("FAIL: main.gd missing _play_tier_pickup_audio dispatcher")
		quit(1)
		return
	# Dispatcher must be wired from _on_pickup_claimed.
	if src.find("_play_tier_pickup_audio(_name, _world_pos)") < 0:
		printerr("FAIL: main.gd::_on_pickup_claimed does not call _play_tier_pickup_audio")
		quit(1)
		return
	print("[iter242loop] tier dispatch OK — _play_tier_pickup_audio wired from _on_pickup_claimed")

	# ── E. Door-position pedestal anchor (LEVER 3) ───────────────────
	# _spawn_door must reference _last_pedestal_position. We don't enforce
	# the exact offset (40 px) — just that the override path exists.
	if src.find("_last_pedestal_position") < 0:
		printerr("FAIL: main.gd missing _last_pedestal_position var")
		quit(1)
		return
	if src.find("_last_pedestal_position + Vector2(40") < 0:
		printerr("FAIL: main.gd::_spawn_door does not anchor to pedestal position")
		quit(1)
		return
	print("[iter242loop] door anchor OK — single-door rooms drop door at pedestal +40 px")

	print("[iter242loop] PASS")
	quit(0)

# Parse `const NAME := VALUE` or `const NAME  := VALUE` from a script's
# source and return the numeric value. Tolerates `:= ` and `=` and arbitrary
# whitespace. Returns -1.0 on miss (we don't ship negative pacing values,
# so this is a safe sentinel). Stops at the first match for the const name.
func _extract_const_float(src: String, const_name: String) -> float:
	var marker: String = "const " + const_name
	var idx: int = src.find(marker)
	if idx < 0:
		return -1.0
	# Slice from after the const name to the next newline.
	var rest: String = src.substr(idx + marker.length(), 80)
	# Strip leading spaces / colons / equals signs.
	var stripped: String = rest
	stripped = stripped.replace(" ", "")
	stripped = stripped.replace(":=", "=")
	# Now we have "=0.20\n..." or "=0.20#comment\n..."
	if not stripped.begins_with("="):
		# Maybe the declaration was `const NAME: float = 0.18` instead of
		# `:=`. Recover by scanning forward for an = inside the slice.
		var eq_idx: int = stripped.find("=")
		if eq_idx < 0:
			return -1.0
		stripped = stripped.substr(eq_idx)
	# Drop the leading '='.
	stripped = stripped.substr(1)
	# Cut at the first character that isn't part of a number.
	var n_end: int = 0
	while n_end < stripped.length():
		var c: String = stripped.substr(n_end, 1)
		if c == "." or c == "-" or (c >= "0" and c <= "9"):
			n_end += 1
		else:
			break
	if n_end == 0:
		return -1.0
	return float(stripped.substr(0, n_end))
