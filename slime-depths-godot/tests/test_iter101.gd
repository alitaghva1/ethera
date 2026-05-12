extends SceneTree

# Iter 101 — Sprint A: 4 bug fixes + 3 polish items.
#
# Bug-fix + polish audit teams returned 12 findings; reviewer kept all
# 12 as legit. Sprint A bundles the quickest 7 (≤30 min each) as a
# single iter so they ship together. Sprint B (theme rebalance,
# Broodmother nerf, fade transitions) and Sprint C (elite affixes,
# altars) deferred to follow-ups.
#
# Bug fixes (B1-B4):
#   B1. chest.gd:48 take_hit signature was 1-arg (damage). All primary
#       damage paths pass 2 args (damage, is_crit) since iter-43 crit
#       pass. Chests join "enemies" group → 2-arg dispatch → Godot 4
#       errors → chest takes no damage from sword / dash / blast.
#       Added defaulted `_is_crit` param.
#   B2. phoenix_feather description claimed "Once per run" but the
#       `_phoenix_feather_used` flag is hero-instance and resets per
#       room (same mechanism iter-96 caught for second_wind). Updated
#       description to "Each room, a killing blow…". Promoting to
#       GameState for true once-per-run deferred to a balance pass.
#   B3. Familiar bolts auto-targeted chests (chests in both "enemies"
#       and "breakables" groups; familiar.gd had no breakables filter).
#       Same gap in _apply_aim_assist (blast aim-snap). Added skip in
#       both call sites.
#   B4. Burn DoT had no sprite tint — slow-tick code referenced a
#       burn tint that was never applied. Added warm-orange modulate
#       in the burn-tick block + baseline restore on burn end.
#
# Polish (P1, P2, P4):
#   P1. boss_phase_3 signal had no audio subscriber while boss_enraged
#       (phase 2) did. Added SOUND_CONFIGS entry + handler.
#   P2. achievement_unlocked popup was silent. Added a chime entry +
#       handler (non-positional, played at world origin).
#   P4. Settings R9 row said "ESC = return to main menu" but mid-run
#       ESC actually pauses. Updated to "pause / menu".
#
# Deferred for a focused fade iter (P3): death + pause overlays
# hard-cut visible (no fade-in). Bigger change than 30 min; needs
# careful timing for the pause case so tweens run with PAUSE_ALWAYS.
func _initialize() -> void:
	var ok := true

	# ═══ B1: chest.gd take_hit signature ═══
	var chest_src := FileAccess.get_file_as_string("res://scripts/chest.gd")
	if not chest_src.contains("func take_hit(damage: int, _is_crit: bool = false)"):
		push_error("FAIL: chest.gd take_hit signature not updated (still 1-arg, will silently fail on 2-arg dispatch)")
		ok = false
	else:
		print("OK chest.gd take_hit accepts (damage, _is_crit) — 2-arg dispatch works")

	# ═══ B2: phoenix_feather description honest ═══
	var gs_src := FileAccess.get_file_as_string("res://scripts/game_state.gd")
	if "Once per run, a killing blow restores you to FULL HP" in gs_src:
		push_error("FAIL: phoenix_feather still claims 'Once per run' but actually resets per-room")
		ok = false
	if not gs_src.contains("Each room, a killing blow restores you to FULL HP"):
		push_error("FAIL: phoenix_feather description doesn't match per-room reality")
		ok = false
	if ok:
		print("OK phoenix_feather description matches per-room behavior")

	# ═══ B3: familiar + aim_assist filter chests ═══
	var familiar_src := FileAccess.get_file_as_string("res://scripts/familiar.gd")
	if not familiar_src.contains("is_in_group(\"breakables\")"):
		push_error("FAIL: familiar.gd doesn't filter breakables — bolts will target chests")
		ok = false
	else:
		print("OK familiar.gd filters breakables out of target scan")
	var hero_src := FileAccess.get_file_as_string("res://scripts/hero.gd")
	# _apply_aim_assist sits at ~line 1367. Grab a 600-char window and
	# assert the breakables filter is there.
	var aa_idx: int = hero_src.find("func _apply_aim_assist")
	if aa_idx < 0:
		push_error("FAIL: _apply_aim_assist function missing")
		ok = false
	else:
		var aa_body: String = hero_src.substr(aa_idx, 1200)
		if not aa_body.contains("is_in_group(\"breakables\")"):
			push_error("FAIL: _apply_aim_assist doesn't skip breakables — blast aim will snap to chests")
			ok = false
		else:
			print("OK _apply_aim_assist skips breakables in aim-snap candidates")

	# ═══ B4: burn tint paints sprite ═══
	var enemy_src := FileAccess.get_file_as_string("res://scripts/enemy.gd")
	# Locate the burn-tick block (`if _burn_active and _spawn_in_time <= 0.0:`)
	# and assert a sprite.modulate paint is inside it.
	var burn_idx: int = enemy_src.find("if _burn_active and _spawn_in_time")
	if burn_idx < 0:
		push_error("FAIL: burn-tick block missing")
		ok = false
	else:
		var burn_body: String = enemy_src.substr(burn_idx, 1500)
		# Look for a warm-orange modulate (1.35, 0.75, 0.40) — the iter-101 value
		if "Color(1.35, 0.75, 0.40" not in burn_body:
			push_error("FAIL: burn-tick block doesn't paint the warm-orange tint")
			ok = false
		else:
			print("OK burn-tick block paints the warm-orange tint on the sprite")

	# ═══ P1: boss_phase_3 audio wired ═══
	var audio_src := FileAccess.get_file_as_string("res://scripts/audio.gd")
	if "\"boss_phase_3\"" not in audio_src:
		push_error("FAIL: audio.gd missing boss_phase_3 SOUND_CONFIG entry")
		ok = false
	if not audio_src.contains("Events.boss_phase_3.connect(_on_boss_phase_3)"):
		push_error("FAIL: audio.gd doesn't subscribe to boss_phase_3 signal")
		ok = false
	if "func _on_boss_phase_3" not in audio_src:
		push_error("FAIL: audio.gd missing _on_boss_phase_3 handler")
		ok = false
	if ok:
		print("OK boss_phase_3 has SOUND_CONFIG + subscriber + handler")

	# ═══ P2: achievement audio wired ═══
	if "\"achievement\"" not in audio_src:
		push_error("FAIL: audio.gd missing achievement SOUND_CONFIG entry")
		ok = false
	if not audio_src.contains("Events.achievement_unlocked.connect(_on_achievement_unlocked)"):
		push_error("FAIL: audio.gd doesn't subscribe to achievement_unlocked signal")
		ok = false
	if "func _on_achievement_unlocked" not in audio_src:
		push_error("FAIL: audio.gd missing _on_achievement_unlocked handler")
		ok = false
	if ok:
		print("OK achievement_unlocked has SOUND_CONFIG + subscriber + handler")

	# ═══ P4: settings ESC label honest ═══
	var ss_tscn := FileAccess.get_file_as_string("res://scenes/settings_screen.tscn")
	if "text = \"return to main menu\"" in ss_tscn:
		push_error("FAIL: settings_screen.tscn still says ESC = 'return to main menu' (misleading — actually pauses mid-run)")
		ok = false
	if not ss_tscn.contains("text = \"pause / menu\""):
		push_error("FAIL: settings_screen.tscn R9 action label not updated to truthful text")
		ok = false
	if ok:
		print("OK settings_screen.tscn R9 ESC label is honest ('pause / menu')")

	# ═══ Runtime smoke: chest scene loads + take_hit accepts 2-arg call ═══
	var chest_scene := load("res://scenes/chest.tscn") as PackedScene
	if chest_scene == null:
		push_error("FAIL: chest.tscn won't load")
		ok = false
	else:
		var ch: Node = chest_scene.instantiate()
		root.add_child(ch)
		if ch.has_method("take_hit"):
			# Try the 2-arg dispatch — should work without error now.
			ch.take_hit(1, false)
			print("OK chest.take_hit(damage, is_crit) accepts 2-arg dispatch")
		else:
			push_error("FAIL: chest missing take_hit method entirely")
			ok = false
		ch.queue_free()

	if ok:
		print("=== ITER 101 INTEGRATION PASSED ===")
	else:
		print("=== ITER 101 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
