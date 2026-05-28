extends SceneTree

# Iter 148 — Boss death savor beat.
#
# Pre-iter-148 a boss kill resolved exactly like any other enemy kill:
#   enemy._die() → enemy_died signal → _on_wave_cleared (the room) →
#   FloorClearBurst BIG variant celebration.
# The killing-blow MOMENT itself had no special punctuation. A 200-HP
# boss dying triggered the same death_burst + same tier-shake (handled
# in iter-141) as a 1-HP slime. The BIG-variant FloorClearBurst lands
# ~0.5s LATER (after wave-cleared resolves) — there was a dead ~1 s
# gap between the killing blow and the celebration banner where the
# player was supposed to FEEL the boss kill, but nothing visually
# acknowledged it.
#
# Genre cue: Hades' boss-death sequence is slow-mo + screen freeze on
# the killing hit, THEN the celebration banner. Isaac uses a screen
# white-out + slow-mo on big enemy kills. Both make the killing blow
# itself a punctuation moment, separate from the post-kill rewards.
#
# Iter-148 fills that gap with three layered cues:
#
#   1. New `Events.boss_died(pos, boss_name)` signal — emitted from
#      enemy._die() AFTER the generic enemy_died, only when
#      enemy_type.is_boss. Distinct signal so non-boss-aware
#      subscribers don't have to filter.
#
#   2. main.gd._on_boss_died — installs:
#        Engine.time_scale = 0.35      (vs 0.05 crit hit-stop — slow-mo,
#                                       not deep freeze)
#        _hit_stop_timer  = 0.6 s      (vs 0.10 s for crit — sustained
#                                       savor)
#        FX.shake(14.0, 0.45)          (vs 11.0/0.22 crushing kill — boss
#                                       deaths shake harder + longer)
#      The hit-stop uses the existing _process timer machinery — no
#      new state needed. Override is unconditional (no `if timer > 0`
#      gate) so a crit-swing stop in progress gets replaced by the
#      louder boss-death stop.
#
#   3. screen_flash.gd._on_boss_died — saturated warm gold wash
#      (1.0, 0.78, 0.32, 0.32) over 0.55s. Matches the iter-71
#      FloorClearBurst BIG palette so the boss-clear reads as a
#      unified sequence: gold flash → slow-mo + shake → flash fades →
#      celebration banner.
func _initialize() -> void:
	var ok := true

	var events_gd := FileAccess.get_file_as_string("res://scripts/events.gd")
	var enemy_gd  := FileAccess.get_file_as_string("res://scripts/enemy.gd")
	var main_gd   := FileAccess.get_file_as_string("res://scripts/main.gd")
	var sf_gd     := FileAccess.get_file_as_string("res://scripts/screen_flash.gd")

	# ═══ Signal added ═══
	if "signal boss_died(world_pos: Vector2, boss_name: String)" not in events_gd:
		push_error("FAIL: missing signal boss_died(world_pos: Vector2, boss_name: String) in events.gd")
		ok = false

	# ═══ enemy._die emits boss_died after enemy_died, gated by is_boss ═══
	if "Events.boss_died.emit(global_position, enemy_type.display_name)" not in enemy_gd:
		push_error("FAIL: enemy._die should emit Events.boss_died(pos, display_name) on boss kills")
		ok = false
	if "if enemy_type != null and enemy_type.is_boss:" not in enemy_gd:
		push_error("FAIL: boss_died emit should be gated by enemy_type.is_boss")
		ok = false

	# ═══ main.gd constants ═══
	if "BOSS_DEATH_TIME_SCALE: float = 0.35" not in main_gd:
		push_error("FAIL: missing BOSS_DEATH_TIME_SCALE = 0.35")
		ok = false
	if "BOSS_DEATH_HIT_STOP_TIME: float = 0.6" not in main_gd:
		push_error("FAIL: missing BOSS_DEATH_HIT_STOP_TIME = 0.6")
		ok = false
	if "BOSS_DEATH_SHAKE_AMP: float = 14.0" not in main_gd:
		push_error("FAIL: missing BOSS_DEATH_SHAKE_AMP = 14.0")
		ok = false
	if "BOSS_DEATH_SHAKE_TIME: float = 0.45" not in main_gd:
		push_error("FAIL: missing BOSS_DEATH_SHAKE_TIME = 0.45")
		ok = false

	# ═══ main.gd subscribes + handler ═══
	if "Events.boss_died.connect(_on_boss_died)" not in main_gd:
		push_error("FAIL: main.gd should subscribe to Events.boss_died")
		ok = false
	if "func _on_boss_died(_world_pos: Vector2, _boss_name: String) -> void:" not in main_gd:
		push_error("FAIL: main.gd should define _on_boss_died handler")
		ok = false
	if "Engine.time_scale = BOSS_DEATH_TIME_SCALE" not in main_gd:
		push_error("FAIL: handler should set Engine.time_scale = BOSS_DEATH_TIME_SCALE")
		ok = false
	if "_hit_stop_timer = BOSS_DEATH_HIT_STOP_TIME" not in main_gd:
		push_error("FAIL: handler should set _hit_stop_timer = BOSS_DEATH_HIT_STOP_TIME")
		ok = false
	if "FX.shake(BOSS_DEATH_SHAKE_AMP, BOSS_DEATH_SHAKE_TIME)" not in main_gd:
		push_error("FAIL: handler should fire FX.shake with boss-death amp + time")
		ok = false

	# ═══ screen_flash.gd subscribes + handler ═══
	if "Events.boss_died.connect(_on_boss_died)" not in sf_gd:
		push_error("FAIL: screen_flash.gd should subscribe to Events.boss_died")
		ok = false
	if "func _on_boss_died(_world_pos: Vector2, _boss_name: String) -> void:" not in sf_gd:
		push_error("FAIL: screen_flash.gd should define _on_boss_died handler")
		ok = false
	if "_flash(Color(1.0, 0.78, 0.32, 0.32), 0.55)" not in sf_gd:
		push_error("FAIL: screen_flash should fire saturated warm-gold wash @ 0.55s")
		ok = false

	if ok:
		print("OK boss death savor: slow-mo 0.35x for 0.6s + 14.0/0.45 shake + gold wash")
		print("=== ITER 148 INTEGRATION PASSED ===")
	else:
		print("=== ITER 148 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
