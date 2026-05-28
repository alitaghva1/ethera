extends SceneTree

# Iter 258 / Wave 7 — Music dynamics smoke test.
#
# Reactive music intensity. The same biome OGG should FEEL calm
# between waves and INTENSE during combat — Hades-style — via two
# real-time controls layered on a single-stem track:
#   1. volume_db boost (-14 baseline + intensity × 4 dB)
#   2. low-pass cutoff_hz (800 Hz muffled → 18 kHz full spectrum)
#
# Boss rooms unlock target=1.2 + an intensity floor of 0.4 (between
# boss-room waves, the music stays brighter than regular exploration).
#
# Verifies (Audio autoload contract):
#   A. Audio autoload exposes set_combat_intensity / set_intensity_floor /
#      pulse_combat_intensity_briefly methods.
#   B. set_combat_intensity(1.0) → after ~1s of process the actual
#      _combat_intensity is ≥ 0.85 (lerped most of the way).
#   C. Target is clamped to [0.0, 1.2] — set(-0.5) → 0.0; set(5.0) → 1.2.
#   D. set_intensity_floor(0.4) + set_combat_intensity(0.0) → effective
#      target is at least 0.4 (floor wins).
#   E. audio.gd source code references AudioEffectLowPassFilter.
#   F. main.gd wires set_combat_intensity at _start_wave + _on_wave_cleared
#      (source-grep guard against the hook being silently removed).

func _initialize() -> void:
	print("[iter258music] init")
	await process_frame

	# Audio autoload should be live. The /root/Audio path is the Godot
	# autoload mount; if any earlier load aborted we'd not be running
	# this script at all.
	var audio: Node = root.get_node_or_null("/root/Audio")
	if audio == null:
		printerr("FAIL: /root/Audio autoload not found")
		quit(1)
		return

	# ── A. Audio exposes the three public API methods ────────────────
	if not audio.has_method("set_combat_intensity"):
		printerr("FAIL: Audio.set_combat_intensity method missing")
		quit(1)
		return
	if not audio.has_method("set_intensity_floor"):
		printerr("FAIL: Audio.set_intensity_floor method missing")
		quit(1)
		return
	if not audio.has_method("pulse_combat_intensity_briefly"):
		printerr("FAIL: Audio.pulse_combat_intensity_briefly method missing")
		quit(1)
		return
	print("[iter258music] A OK — Audio exposes set_combat_intensity/set_intensity_floor/pulse_combat_intensity_briefly")

	# ── B. After ~1s of wall time the lerp catches up to target ────
	# Reset state first in case the autoload picked up something from
	# tree_changed callbacks during boot. Headless mode can run at
	# 150+ fps so frame-counting doesn't map cleanly to wall time;
	# we yield process_frame in a loop until ≥ 1000 ms of wall time
	# has elapsed. INTENSITY_LERP_RATE = 1.8 → smoothed value reaches
	# ~85% in ~1s regardless of framerate (because delta * rate is
	# what drives the lerp factor).
	audio.call("set_intensity_floor", 0.0)
	audio.call("set_combat_intensity", 0.0)
	# Let it settle to baseline (~500 ms).
	var settle_start: int = Time.get_ticks_msec()
	while Time.get_ticks_msec() - settle_start < 500:
		await process_frame
	audio.call("set_combat_intensity", 1.0)
	var ramp_start: int = Time.get_ticks_msec()
	while Time.get_ticks_msec() - ramp_start < 1100:
		await process_frame
	var actual: float = float(audio.get("_combat_intensity"))
	if actual < 0.85:
		printerr("FAIL: after 1.1s, _combat_intensity = %.3f, expected ≥ 0.85" % actual)
		quit(1)
		return
	print("[iter258music] B OK — set_combat_intensity(1.0) → _combat_intensity = %.3f after ~1.1s (≥ 0.85)" % actual)

	# ── C. Target is clamped to [0.0, 1.2] ───────────────────────────
	audio.call("set_combat_intensity", -0.5)
	var t_neg: float = float(audio.get("_combat_intensity_target"))
	if t_neg != 0.0:
		printerr("FAIL: set_combat_intensity(-0.5) clamped to %.3f, expected 0.0" % t_neg)
		quit(1)
		return
	audio.call("set_combat_intensity", 5.0)
	var t_big: float = float(audio.get("_combat_intensity_target"))
	if not is_equal_approx(t_big, 1.2):
		printerr("FAIL: set_combat_intensity(5.0) clamped to %.3f, expected 1.2" % t_big)
		quit(1)
		return
	print("[iter258music] C OK — target clamps to [0.0, 1.2] (-0.5→0.0, 5.0→1.2)")

	# ── D. Intensity floor wins when target is below it ─────────────
	# After setting floor=0.4 and target=0.0, the effective target in
	# _process is max(0.0, 0.4) + pulse_bonus(0). Wait ≥ 1.5s of wall
	# time then verify the smoothed _combat_intensity has drifted up
	# to ≥ 0.35 (allows for the lerp not having quite settled).
	audio.call("set_intensity_floor", 0.4)
	audio.call("set_combat_intensity", 0.0)
	var floor_start: int = Time.get_ticks_msec()
	while Time.get_ticks_msec() - floor_start < 1800:
		await process_frame
	var floored: float = float(audio.get("_combat_intensity"))
	if floored < 0.35:  # 0.4 target, allow small lerp gap
		printerr("FAIL: with floor=0.4 + target=0.0, _combat_intensity = %.3f, expected ≥ 0.35" % floored)
		quit(1)
		return
	# Reset floor so we don't leak state to other tests.
	audio.call("set_intensity_floor", 0.0)
	print("[iter258music] D OK — set_intensity_floor(0.4) holds intensity at %.3f even with target=0.0" % floored)

	# ── E. audio.gd source references AudioEffectLowPassFilter ──────
	var audio_script: Script = load("res://scripts/audio.gd") as Script
	if audio_script == null:
		printerr("FAIL: audio.gd failed to load as Script")
		quit(1)
		return
	var audio_src: String = audio_script.source_code
	if audio_src.find("AudioEffectLowPassFilter") < 0:
		printerr("FAIL: audio.gd does not reference AudioEffectLowPassFilter")
		quit(1)
		return
	if audio_src.find("cutoff_hz") < 0:
		printerr("FAIL: audio.gd does not modulate cutoff_hz")
		quit(1)
		return
	print("[iter258music] E OK — audio.gd references AudioEffectLowPassFilter + cutoff_hz")

	# ── F. main.gd wires intensity at wave start + wave clear ──────
	var main_script: Script = load("res://scripts/main.gd") as Script
	if main_script == null:
		printerr("FAIL: main.gd failed to load as Script")
		quit(1)
		return
	var main_src: String = main_script.source_code
	# Find _start_wave block and look for set_combat_intensity within
	# the next ~30 lines (block boundary).
	var sw_idx: int = main_src.find("func _start_wave")
	if sw_idx < 0:
		printerr("FAIL: main.gd missing _start_wave function")
		quit(1)
		return
	var sw_next: int = main_src.find("\nfunc ", sw_idx + 5)
	var sw_body: String = main_src.substr(sw_idx, max(0, sw_next - sw_idx)) if sw_next >= 0 else main_src.substr(sw_idx)
	if sw_body.find("set_combat_intensity") < 0:
		printerr("FAIL: _start_wave does not call set_combat_intensity")
		quit(1)
		return
	var wc_idx: int = main_src.find("func _on_wave_cleared")
	if wc_idx < 0:
		printerr("FAIL: main.gd missing _on_wave_cleared function")
		quit(1)
		return
	var wc_next: int = main_src.find("\nfunc ", wc_idx + 5)
	var wc_body: String = main_src.substr(wc_idx, max(0, wc_next - wc_idx)) if wc_next >= 0 else main_src.substr(wc_idx)
	if wc_body.find("set_combat_intensity") < 0:
		printerr("FAIL: _on_wave_cleared does not call set_combat_intensity")
		quit(1)
		return
	# Boss-room floor wire-up in _ready.
	if main_src.find("set_intensity_floor") < 0:
		printerr("FAIL: main.gd does not call set_intensity_floor (boss-room floor wiring missing)")
		quit(1)
		return
	print("[iter258music] F OK — main.gd wires set_combat_intensity at _start_wave + _on_wave_cleared + set_intensity_floor")

	print("[iter258music] PASS — music dynamics wired end to end")
	quit(0)
