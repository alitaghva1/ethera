extends SceneTree

# Iter 133 — Death/reset FPS bug fix: cleanup before scene reload.
#
# BUG: After dying and clicking RETRY, the game would run at ~2 FPS.
# Each retry compounded the issue until the game became unplayable.
#
# ROOT CAUSE (identified by bug investigation team):
#
#   1. AMBIENT PARTICLES NEVER STOPPED
#      _spawn_ambient_motes() creates CPUParticles2D with emitting=true.
#      When reload_current_scene() is called, particles survive the
#      transition and keep processing. Each retry adds 60+ particles.
#
#   2. DEATH TWEENS NEVER KILLED
#      _on_hero_death_started() creates 5 tweens with TWEEN_PAUSE_PROCESS
#      (time_scale slowmo, camera zoom, veil fade, banner, restore).
#      These tweens survive scene reload because PAUSE_PROCESS mode
#      keeps them alive even when the scene tree is rebuilding.
#      Each death adds 5 orphaned tweens.
#
#   3. DEATH VEIL LAYER NEVER FREED
#      The dynamically-created CanvasLayer (veil + banner) isn't tracked
#      and survives reload. Each death stacks another overlay.
#
# CASCADE EFFECT:
#   Death 1: 60 particles + 5 tweens
#   Death 2: 120 particles + 10 tweens
#   Death 3: 180 particles + 15 tweens
#   → Frame budget exceeded → 2 FPS
#
# FIX (iter-133):
#
#   1. Added _death_tweens: Array[Tween] and _death_veil_layer: CanvasLayer
#      member variables to track death cinematic resources.
#
#   2. Modified _on_hero_death_started() to append all created tweens to
#      _death_tweens and store veil_layer in _death_veil_layer.
#
#   3. Added _cleanup_before_scene_change() function that:
#      - Kills all tracked death tweens
#      - Frees the death veil layer
#      - Stops all CPUParticles2D in the scene
#      - Resets Engine.time_scale
#
#   4. Call _cleanup_before_scene_change() at the start of _on_death_retry()
#      and _on_death_to_menu() BEFORE any scene change.
#
# SECONDARY FIX:
#   Added _is_dying early-return guard to _on_enemy_died_for_relics() in
#   hero.gd. Prevents VFX spam (soul_burst, fire_pool, kill_explosion)
#   during death cinematic when enemies are still dying from DoT.

func _initialize() -> void:
	var ok := true

	var main_gd := FileAccess.get_file_as_string("res://scripts/main.gd")
	var hero_gd := FileAccess.get_file_as_string("res://scripts/hero.gd")

	# ═══ Death resource tracking variables ═══
	if "var _death_tweens: Array[Tween]" not in main_gd:
		push_error("FAIL: _death_tweens tracking variable missing from main.gd")
		ok = false
	if "var _death_veil_layer: CanvasLayer" not in main_gd:
		push_error("FAIL: _death_veil_layer tracking variable missing from main.gd")
		ok = false
	if ok:
		print("OK death resource tracking variables present (_death_tweens, _death_veil_layer)")

	# ═══ Tweens stored during death cinematic ═══
	if "_death_tweens.append(t_time)" not in main_gd:
		push_error("FAIL: t_time tween not tracked in _death_tweens")
		ok = false
	if "_death_tweens.append(t_veil)" not in main_gd:
		push_error("FAIL: t_veil tween not tracked in _death_tweens")
		ok = false
	if "_death_tweens.append(t_banner)" not in main_gd:
		push_error("FAIL: t_banner tween not tracked in _death_tweens")
		ok = false
	if "_death_tweens.append(t_end)" not in main_gd:
		push_error("FAIL: t_end tween not tracked in _death_tweens")
		ok = false
	if "_death_veil_layer = veil_layer" not in main_gd:
		push_error("FAIL: veil_layer not stored in _death_veil_layer")
		ok = false
	if ok:
		print("OK death cinematic resources tracked for cleanup")

	# ═══ Cleanup function exists ═══
	if "func _cleanup_before_scene_change()" not in main_gd:
		push_error("FAIL: _cleanup_before_scene_change() function missing")
		ok = false
	# Check it kills tweens
	if "tween.kill()" not in main_gd:
		push_error("FAIL: _cleanup_before_scene_change doesn't kill tweens")
		ok = false
	# Check it clears the tween array
	if "_death_tweens.clear()" not in main_gd:
		push_error("FAIL: _cleanup_before_scene_change doesn't clear _death_tweens")
		ok = false
	# Check it frees veil layer
	if "_death_veil_layer.queue_free()" not in main_gd:
		push_error("FAIL: _cleanup_before_scene_change doesn't free veil layer")
		ok = false
	# Check it stops particles
	if "emitting = false" not in main_gd:
		push_error("FAIL: _cleanup_before_scene_change doesn't stop particles")
		ok = false
	if ok:
		print("OK _cleanup_before_scene_change() properly cleans up resources")

	# ═══ Cleanup called before retry ═══
	# Find _on_death_retry and check it calls cleanup BEFORE reload
	var retry_idx := main_gd.find("func _on_death_retry()")
	var reload_idx := main_gd.find("reload_current_scene()", retry_idx)
	var cleanup_in_retry := main_gd.find("_cleanup_before_scene_change()", retry_idx)
	if cleanup_in_retry == -1 or cleanup_in_retry > reload_idx:
		push_error("FAIL: _cleanup_before_scene_change() not called before reload_current_scene()")
		ok = false
	if ok:
		print("OK _cleanup_before_scene_change() called in _on_death_retry() before reload")

	# ═══ Cleanup called before menu ═══
	var menu_idx := main_gd.find("func _on_death_to_menu()")
	var change_idx := main_gd.find("change_scene_to_file(", menu_idx)
	var cleanup_in_menu := main_gd.find("_cleanup_before_scene_change()", menu_idx)
	if cleanup_in_menu == -1 or cleanup_in_menu > change_idx:
		push_error("FAIL: _cleanup_before_scene_change() not called before change_scene_to_file()")
		ok = false
	if ok:
		print("OK _cleanup_before_scene_change() called in _on_death_to_menu() before scene change")

	# ═══ Hero relic callback death guard ═══
	var relic_callback_idx := hero_gd.find("func _on_enemy_died_for_relics(")
	var kill_counter_idx := hero_gd.find("_kill_counter += 1", relic_callback_idx)
	var dying_guard_idx := hero_gd.find("if _is_dying:", relic_callback_idx)
	if dying_guard_idx == -1 or dying_guard_idx > kill_counter_idx:
		push_error("FAIL: _is_dying guard missing at start of _on_enemy_died_for_relics()")
		ok = false
	# Check it returns early
	var return_idx := hero_gd.find("return", dying_guard_idx)
	if return_idx == -1 or return_idx > kill_counter_idx:
		push_error("FAIL: _is_dying guard doesn't return early")
		ok = false
	if ok:
		print("OK _on_enemy_died_for_relics() guards against _is_dying")

	# ═══ Runtime load ═══
	var main_scene: PackedScene = load("res://scenes/main.tscn")
	if main_scene == null:
		push_error("FAIL: main.tscn no longer loads after iter-133 changes")
		ok = false
	var hero_scene: PackedScene = load("res://scenes/hero.tscn")
	if hero_scene == null:
		push_error("FAIL: hero.tscn no longer loads after iter-133 changes")
		ok = false
	if ok:
		print("OK main.tscn and hero.tscn load successfully")

	if ok:
		print("=== ITER 133 INTEGRATION PASSED ===")
	else:
		print("=== ITER 133 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
