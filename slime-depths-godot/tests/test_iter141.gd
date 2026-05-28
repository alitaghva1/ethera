extends SceneTree

# Iter 141 — Kill-burst polish: controlled chunkiness on enemy death.
#
# Pre-iter-141 every enemy death routed through:
#   enemy._die() → Events.enemy_died.emit(pos)
#   fx._on_enemy_died(pos) → shake(6.0, 0.12) + spawn(DEATH_BURST_SCENE)
# That fired identical visuals for every enemy — a 1-HP slime and a
# boss popped with the same 16-particle red-ember spray and the same
# camera shake. In a 4-enemy room clear that's a uniform blur of
# generic puffs.
#
# Hades / Isaac scale kill bursts by enemy size + significance: trash
# pops are restrained, elite/boss kills get a white flash core + more
# screen-shake + a larger burst. The visual grammar tells the player
# "that mattered" without text.
#
# Iter-141 architecture:
#
#   • New FX.spawn_enemy_kill_burst(pos, scale_factor, is_heavy) method
#     - clamps scale_factor to 0.85..1.4 (so a max-scale boss can't
#       eat the screen and a min-scale slime still reads chunky)
#     - spawns DEATH_BURST_SCENE, sets the instance scale to clamped
#     - is_heavy = true: 9.0/0.16 shake + 3 white "flash core" sparks
#       in an 8 px radius at the burst origin (HDR-white modulate so
#       it pulses on bright floors). Reads as "ka-POP" instead of
#       "puff."
#     - is_heavy = false: 6.0/0.12 shake (existing baseline) + just
#       the size-scaled burst
#
#   • enemy.gd._die() calls FX.spawn_enemy_kill_burst directly with
#     enemy_type.sprite_scale + (is_boss or max_hp >= 8). Bypasses the
#     Events.enemy_died signal so the existing 4 subscribers don't need
#     widened arity (3 of them are gameplay logic that doesn't care
#     about sprite_scale anyway).
#
#   • fx._on_enemy_died becomes a stub — the VFX work moved to
#     spawn_enemy_kill_burst. Kept as a no-op so the existing connect
#     still binds.
#
#   • Baseline burst tuning: amount 16 → 20, scale 2-3 → 2.2-3.4,
#     velocity_max 160 → 180. A hair chunkier even on normal kills;
#     compounds with the per-spawn scale factor.
func _initialize() -> void:
	var ok := true

	var fx_gd     := FileAccess.get_file_as_string("res://scripts/fx.gd")
	var enemy_gd  := FileAccess.get_file_as_string("res://scripts/enemy.gd")
	var burst_tscn := FileAccess.get_file_as_string("res://scenes/fx/death_burst.tscn")

	# ═══ FX.spawn_enemy_kill_burst exists with the right shape ═══
	if "func spawn_enemy_kill_burst(world_pos: Vector2, scale_factor: float, is_heavy: bool)" not in fx_gd:
		push_error("FAIL: fx.gd missing spawn_enemy_kill_burst(world_pos, scale_factor, is_heavy)")
		ok = false
	# Clamp range present
	if "clampf(scale_factor, 0.85, 1.4)" not in fx_gd:
		push_error("FAIL: spawn_enemy_kill_burst should clamp scale_factor to 0.85..1.4")
		ok = false
	# Heavy-kill branch shakes harder
	if "_shake(9.0, 0.16)" not in fx_gd:
		push_error("FAIL: heavy kill should shake 9.0/0.16 (was 6.0/0.12 uniform)")
		ok = false
	# Heavy-kill branch spawns 3 white-core sparks
	if "for i in range(3):" not in fx_gd:
		push_error("FAIL: heavy kill should spawn 3 white-core sparks")
		ok = false
	if "Color(1.4, 1.35, 1.05, 1.0)" not in fx_gd:
		push_error("FAIL: white-core sparks should use HDR white Color(1.4, 1.35, 1.05, 1.0)")
		ok = false
	# Normal-kill branch keeps the legacy shake
	if "_shake(6.0, 0.12)" not in fx_gd:
		push_error("FAIL: normal kill should still shake 6.0/0.12 baseline")
		ok = false

	# ═══ _on_enemy_died no longer spawns the burst (moved to direct call) ═══
	# The function still exists (existing connect) but is now a stub.
	# Look for an explicit `pass` after a comment block; we don't want
	# the old `_spawn(DEATH_BURST_SCENE, world_pos)` line in this handler.
	# Note: spawn_enemy_kill_burst DOES contain DEATH_BURST_SCENE — so we
	# specifically check the _on_enemy_died function body, not the file.
	var died_func_idx: int = fx_gd.find("func _on_enemy_died(world_pos: Vector2)")
	if died_func_idx < 0:
		push_error("FAIL: _on_enemy_died handler should still exist (kept for the connect)")
		ok = false
	else:
		# Read until the next `func ` declaration to bound the body
		var next_func_idx: int = fx_gd.find("\nfunc ", died_func_idx + 1)
		if next_func_idx < 0:
			next_func_idx = fx_gd.length()
		var body: String = fx_gd.substr(died_func_idx, next_func_idx - died_func_idx)
		if "_spawn(DEATH_BURST_SCENE" in body:
			push_error("FAIL: _on_enemy_died still spawns DEATH_BURST_SCENE — should have moved to spawn_enemy_kill_burst")
			ok = false
		if "_shake(6.0, 0.12)" in body:
			push_error("FAIL: _on_enemy_died still shakes 6.0/0.12 — should have moved to spawn_enemy_kill_burst")
			ok = false

	# ═══ enemy.gd._die calls FX.spawn_enemy_kill_burst ═══
	if "FX.spawn_enemy_kill_burst(global_position, s_factor, is_heavy_kill)" not in enemy_gd:
		push_error("FAIL: enemy._die should call FX.spawn_enemy_kill_burst with (pos, s_factor, is_heavy_kill)")
		ok = false
	# Heavy gate logic present
	if "enemy_type.is_boss or enemy_type.max_hp >= 8" not in enemy_gd:
		push_error("FAIL: is_heavy_kill should be (is_boss or max_hp >= 8)")
		ok = false

	# ═══ death_burst.tscn baseline tune ═══
	if "amount = 20" not in burst_tscn:
		push_error("FAIL: death_burst amount should be 20 (was 16)")
		ok = false
	if "scale_amount_min = 2.2" not in burst_tscn:
		push_error("FAIL: death_burst scale_amount_min should be 2.2 (was 2.0)")
		ok = false
	if "scale_amount_max = 3.4" not in burst_tscn:
		push_error("FAIL: death_burst scale_amount_max should be 3.4 (was 3.0)")
		ok = false
	if "initial_velocity_max = 180.0" not in burst_tscn:
		push_error("FAIL: death_burst initial_velocity_max should be 180 (was 160)")
		ok = false
	# Old values must be gone
	if "amount = 16" in burst_tscn:
		push_error("FAIL: leftover amount = 16 in death_burst.tscn")
		ok = false

	if ok:
		print("OK kill-burst: scaled to enemy size, heavy kills get white-core flash + 9.0/0.16 shake")
		print("=== ITER 141 INTEGRATION PASSED ===")
	else:
		print("=== ITER 141 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
