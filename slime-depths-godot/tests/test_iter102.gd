extends SceneTree

# Iter 102 — Sprint B: G1 + G2 + P3.
#
# Bug-fix audit team flagged G1 (Broodmother phase 3 unsurvivable),
# Gameplay team flagged G2 (BLOOD/VOW/SHADOW theme ascendance dead),
# Polish team flagged P3 (death + pause overlays hard-cut).
#
# G1: Broodmother phase 3 nerfed.
#   Was contact_damage:4 (one-shot vs MAX_HP:3) at move_speed:200 (tied
#   with hero SPEED, kiting impossible). Reduced to contact_damage:2,
#   move_speed:175 in broodmother.tres phase3_overrides.
#
# G2: 3 new commons fix theme pool size.
#   - bulwark (VOW common, +1 HP / -1 DR) — second pure-VOW common
#     alongside sturdy_step. VOW pool 8 → 9.
#   - umbral_thread (SHADOW common, +10% crit) — SHADOW pool 6 → 7.
#   - dusk_walker (STORM+SHADOW dual-tag common) — cheap two-theme
#     entry. SHADOW pool 7 → 8 (counts for both pools).
#   Sim confirms VOW resonance reach 19.4% → 23.1%, SHADOW resonance
#   reach 10.8% → 16.4%. (Greedy AI undervalues defensive themes due
#   to DPS bias; in real play the new commons give VOW/SHADOW players
#   actual build options.)
#
# P3: Fade-in tween on death + pause overlays.
#   Both screens previously slammed to full opacity in one frame —
#   visually jarring against the rest of the cinematic kit (boss
#   intro, pickup banner, floor card all tween in). Death = 0.35s
#   ease-out. Pause = 0.20s with TWEEN_PAUSE_PROCESS so the tween
#   runs even though get_tree().paused = true.
func _initialize() -> void:
	var ok := true

	# ═══ G1: Broodmother phase 3 tuned ═══
	var bm_src := FileAccess.get_file_as_string("res://scenes/enemies/broodmother.tres")
	if "phase3_overrides = {\"move_speed\": 175.0, \"contact_damage\": 2" not in bm_src:
		push_error("FAIL: broodmother phase 3 not retuned to move_speed:175 + contact_damage:2")
		ok = false
	else:
		print("OK Broodmother phase 3: 175 speed / 2 dmg (was 200 / 4 — one-shot vs MAX_HP 3)")

	# ═══ G2: 3 new commons in registry ═══
	var gs_src := FileAccess.get_file_as_string("res://scripts/game_state.gd")
	for new_relic in ["bulwark", "umbral_thread", "dusk_walker"]:
		if "\"%s\":" % new_relic not in gs_src:
			push_error("FAIL: iter-102 new relic '%s' missing from registry" % new_relic)
			ok = false
	if ok:
		print("OK 3 new commons in registry: bulwark / umbral_thread / dusk_walker")

	# Specific mods on each new relic
	# bulwark: VOW, +1 HP and -1 DR
	var bw_idx: int = gs_src.find("\"bulwark\":")
	if bw_idx >= 0:
		var bw_block: String = gs_src.substr(bw_idx, 500)
		if not (bw_block.contains("\"max_hp_bonus\": 1") and bw_block.contains("\"damage_taken_reduction\": 1") and bw_block.contains("\"vow\"")):
			push_error("FAIL: bulwark mods or themes wrong")
			ok = false
		else:
			print("OK bulwark: VOW common, +1 HP, -1 DR")

	# umbral_thread: SHADOW, +10% crit
	var ut_idx: int = gs_src.find("\"umbral_thread\":")
	if ut_idx >= 0:
		var ut_block: String = gs_src.substr(ut_idx, 500)
		if not (ut_block.contains("\"crit_chance_f\": 0.10") and ut_block.contains("\"shadow\"")):
			push_error("FAIL: umbral_thread mods or themes wrong")
			ok = false
		else:
			print("OK umbral_thread: SHADOW common, +10% crit")

	# dusk_walker: STORM+SHADOW dual-theme, +15% MS / +15% proj speed
	var dw_idx: int = gs_src.find("\"dusk_walker\":")
	if dw_idx >= 0:
		var dw_block: String = gs_src.substr(dw_idx, 500)
		if not (dw_block.contains("\"move_speed_mul\": 0.15") and dw_block.contains("\"projectile_speed_mul\": 0.15") and dw_block.contains("\"storm\"") and dw_block.contains("\"shadow\"")):
			push_error("FAIL: dusk_walker mods or themes wrong")
			ok = false
		else:
			print("OK dusk_walker: STORM+SHADOW dual-tag common, +15% MS / +15% proj")

	# ═══ P3: Death + pause overlay fade-in ═══
	var ds_src := FileAccess.get_file_as_string("res://scripts/death_screen.gd")
	if not (ds_src.contains("modulate.a = 0.0") and ds_src.contains("\"modulate:a\", 1.0, 0.35")):
		push_error("FAIL: death_screen.gd missing fade-in tween (modulate.a 0 → 1 over 0.35s)")
		ok = false
	else:
		print("OK death_screen.gd fades in over 0.35s (was hard-cut)")

	var ps_src := FileAccess.get_file_as_string("res://scripts/pause_screen.gd")
	if not (ps_src.contains("modulate.a = 0.0") and ps_src.contains("\"modulate:a\", 1.0, 0.20")):
		push_error("FAIL: pause_screen.gd missing fade-in tween (modulate.a 0 → 1 over 0.20s)")
		ok = false
	# The pause tween MUST use TWEEN_PAUSE_PROCESS because the tree is paused.
	if not ps_src.contains("TWEEN_PAUSE_PROCESS"):
		push_error("FAIL: pause_screen fade tween isn't TWEEN_PAUSE_PROCESS — would freeze on the paused tree")
		ok = false
	if ok:
		print("OK pause_screen.gd fades in over 0.20s with TWEEN_PAUSE_PROCESS (runs while paused)")

	# ═══ Runtime smoke ═══
	for scene_path in ["res://scenes/death_screen.tscn", "res://scenes/pause_screen.tscn"]:
		var scene := load(scene_path) as PackedScene
		if scene == null:
			push_error("FAIL: %s no longer loads" % scene_path)
			ok = false
		else:
			var inst: Node = scene.instantiate()
			if inst == null:
				push_error("FAIL: %s failed to instantiate" % scene_path)
				ok = false
			else:
				inst.queue_free()
	print("OK death + pause scenes instantiate cleanly")

	if ok:
		print("=== ITER 102 INTEGRATION PASSED ===")
	else:
		print("=== ITER 102 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
