extends SceneTree

# Iter 142 — Low-HP heartbeat tell.
#
# Pre-iter-142 the heart row pulsed on HP CHANGES (damage punch + heal
# pulse via iter-113's _pulse_label), but had no LOW-HP STATE tell.
# A 1-HP hero who took no damage this beat looked exactly like a
# full-HP hero — just fewer filled pips. The genre baseline (Hades /
# Isaac) surfaces "you're in trouble" continuously while in danger:
#
#   • Isaac: heartbeat sound + red overlay when on half hearts
#   • Hades: red vignette pulse + audio sting at low health
#
# Iter-142 adds a HUD-local breathing pulse on the heart row that
# loops while hp ≤ max(2, max_hp / 3) and stops when hp recovers or
# the hero dies. Localized to the HUD (doesn't fight with combat
# visuals), uses the existing pulse helpers' tween machinery, and is
# instantly visible in peripheral vision.
#
# Threshold floor of 2 means a 6-HP hero pulses at ≤2 (canonical "two
# heart" danger zone) and a 9-HP boosted hero pulses at ≤3. The HDR
# red boost (1.45, 0.55, 0.55) brightens on torch-lit floors. 0.9s
# full cycle with SINE ease is peripheral-vision pace.
#
# Coordination with the existing damage flash: if a damage pulse fires
# AND hp is now in the danger zone, the loop start is deferred via
# CONNECT_ONE_SHOT on the damage tween's `finished` so the flash plays
# out cleanly before the breathing starts. _start_hp_low_pulse
# re-checks hp at fire time to handle race conditions (heal between
# scheduling and firing).
func _initialize() -> void:
	var ok := true

	var gd := FileAccess.get_file_as_string("res://scripts/main.gd")

	# ═══ Constants present ═══
	if "HP_LOW_PULSE_MODULATE: Color = Color(1.45, 0.55, 0.55, 1.0)" not in gd:
		push_error("FAIL: missing HP_LOW_PULSE_MODULATE = Color(1.45, 0.55, 0.55, 1.0)")
		ok = false
	if "HP_LOW_PULSE_DUR: float = 0.9" not in gd:
		push_error("FAIL: missing HP_LOW_PULSE_DUR = 0.9 (full breathe cycle)")
		ok = false
	if "HP_LOW_PULSE_SCALE: float = 1.08" not in gd:
		push_error("FAIL: missing HP_LOW_PULSE_SCALE = 1.08")
		ok = false

	# ═══ Tracking vars present ═══
	if "var _hp_low_pulse_tween: Tween = null" not in gd:
		push_error("FAIL: missing _hp_low_pulse_tween cache var")
		ok = false
	if "var _hp_low_pulse_active: bool = false" not in gd:
		push_error("FAIL: missing _hp_low_pulse_active gate var")
		ok = false

	# ═══ Threshold function ═══
	if "func _hp_low_threshold() -> int:" not in gd:
		push_error("FAIL: missing _hp_low_threshold() helper")
		ok = false
	if "maxi(2, max_hp / 3)" not in gd:
		push_error("FAIL: threshold should be maxi(2, max_hp / 3) — floor at 2, scales with max_hp")
		ok = false

	# ═══ Start / stop helpers ═══
	if "func _start_hp_low_pulse() -> void:" not in gd:
		push_error("FAIL: missing _start_hp_low_pulse helper")
		ok = false
	if "func _stop_hp_low_pulse() -> void:" not in gd:
		push_error("FAIL: missing _stop_hp_low_pulse helper")
		ok = false

	# ═══ Start function uses set_loops + SINE ease ═══
	if "create_tween().set_loops()" not in gd:
		push_error("FAIL: low-pulse tween should use set_loops() for indefinite breathing")
		ok = false
	if "Tween.TRANS_SINE" not in gd:
		push_error("FAIL: low-pulse should use TRANS_SINE for organic breathe")
		ok = false
	if "Tween.EASE_IN_OUT" not in gd:
		push_error("FAIL: low-pulse should use EASE_IN_OUT (no sharp triangle wave)")
		ok = false

	# ═══ Start function has safety re-check (deferred call race guard) ═══
	if "if hero.hp > _hp_low_threshold():" not in gd:
		push_error("FAIL: _start_hp_low_pulse should re-check threshold at fire time")
		ok = false

	# ═══ _update_hp wires the start/stop branch ═══
	if "if v > 0 and v <= low_th:" not in gd:
		push_error("FAIL: _update_hp should branch on v > 0 and v <= low_th to start the pulse")
		ok = false
	if "_stop_hp_low_pulse()" not in gd:
		push_error("FAIL: _update_hp should call _stop_hp_low_pulse when out of danger zone")
		ok = false

	# ═══ Damage-pulse coordination via CONNECT_ONE_SHOT ═══
	if "CONNECT_ONE_SHOT" not in gd:
		push_error("FAIL: damage-pulse → low-pulse handoff should use CONNECT_ONE_SHOT")
		ok = false
	if "_hp_pulse_tween.finished.connect(_start_hp_low_pulse" not in gd:
		push_error("FAIL: damage pulse should defer low-pulse start via finished signal")
		ok = false

	# ═══ Stop helper resets visuals to neutral ═══
	if "heart_row.scale = Vector2.ONE" not in gd:
		push_error("FAIL: _stop_hp_low_pulse should reset heart_row.scale to ONE")
		ok = false
	if "heart_row.modulate = HUD_NEUTRAL_MODULATE" not in gd:
		push_error("FAIL: _stop_hp_low_pulse should reset heart_row.modulate to neutral")
		ok = false

	if ok:
		print("OK low-HP heartbeat: heart row breathes warm red @ 0.9s SINE cycle when hp ≤ max(2, max_hp/3)")
		print("=== ITER 142 INTEGRATION PASSED ===")
	else:
		print("=== ITER 142 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
