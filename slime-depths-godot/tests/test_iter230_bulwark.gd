extends SceneTree

# Iter 230 / Expansion Team R2 — Bulwark shield-walker regression test.
#
# Guards the new shield_walker behavior + take_hit's optional source_pos
# arg + the directional damage filter `_apply_shield_damage_filter`.
#
# Coverage:
#   1. bulwark.tres loads as EnemyType with behavior="shield_walker"
#      and is registered in main.gd's ENEMY_TYPES.
#   2. Damage from the FRONT (source pos within the 90° cone of the
#      enemy's facing direction) is reduced 75% (1 - SHIELD_REDUCTION).
#      Verified by spawning a Bulwark with a known facing, then hitting
#      it with a known damage value from a source position directly in
#      front. Expected hp delta = round(damage * 0.25), floored at 0.
#   3. Damage from BEHIND (source pos opposite the facing direction)
#      applies at full value AND breaks the shield. After the flank hit:
#        * hp dropped by the full damage value
#        * is_shield_broken_for_test() returns true
#   4. After the shield breaks, a SECOND hit from any direction
#      (front or back) applies at FULL damage — the shield is down.
#   5. Force-restoring the shield (test helper) returns subsequent
#      front hits to reduced damage — verifies the broken-time gate
#      is the only switch between reduced and full damage.
#   6. The "source_pos unknown" fallback returns full damage even on
#      an intact shield enemy — legacy callers that don't plumb the
#      arg yet stay safe.

func _initialize() -> void:
	print("[bulwark230] init")
	await process_frame
	# ── 1. .tres + registry sanity ────────────────────────────────────
	var BulwarkType: EnemyType = load("res://scenes/enemies/bulwark.tres") as EnemyType
	if BulwarkType == null:
		printerr("FAIL: bulwark.tres failed to load as EnemyType")
		quit(1)
		return
	if BulwarkType.behavior != "shield_walker":
		printerr("FAIL: bulwark.tres behavior=%s, expected 'shield_walker'" % BulwarkType.behavior)
		quit(1)
		return
	if BulwarkType.max_hp < 3:
		printerr("FAIL: bulwark.tres max_hp=%d, expected ≥ 3" % BulwarkType.max_hp)
		quit(1)
		return
	print("[bulwark230] .tres OK — behavior=shield_walker, max_hp=%d" % BulwarkType.max_hp)
	# ENEMY_TYPES registry check via source inspection. We don't load
	# main.gd as an autoload (would require the full main.tscn boot);
	# parsing the source for the "bulwark" key entry is enough to gate
	# accidental removal.
	var main_script: Script = load("res://scripts/main.gd") as Script
	if main_script == null:
		printerr("FAIL: main.gd failed to load")
		quit(1)
		return
	if main_script.source_code.find("\"bulwark\"") < 0:
		printerr("FAIL: main.gd ENEMY_TYPES missing 'bulwark' key")
		quit(1)
		return
	print("[bulwark230] ENEMY_TYPES registers bulwark")
	# ── 2. Spawn a live enemy and prep ────────────────────────────────
	var EnemyScene: PackedScene = load("res://scenes/enemy.tscn") as PackedScene
	if EnemyScene == null:
		printerr("FAIL: enemy.tscn failed to load")
		quit(1)
		return
	var holder: Node2D = Node2D.new()
	holder.name = "BulwarkHolder"
	root.add_child(holder)
	var e: Node = EnemyScene.instantiate()
	e.set("enemy_type", BulwarkType)
	e.position = Vector2(400, 300)
	holder.add_child(e)
	await process_frame
	# Bypass spawn-in fade so take_hit isn't a no-op.
	e.set("_spawn_in_time", 0.0)
	e.set("hp", BulwarkType.max_hp)
	# Force a known facing — to the RIGHT (positive X). The shield is
	# now a 90° cone from -45° to +45° around the +X axis.
	e.call("set_shield_facing_for_test", Vector2(1, 0))
	# Sanity — shield starts intact.
	if bool(e.call("is_shield_broken_for_test")):
		printerr("FAIL: fresh Bulwark spawned with shield already broken")
		quit(1)
		return
	# ── 3. FRONT hit (source east of enemy, within cone) → reduced ───
	# Hit with damage=4 from a position at (500, 300) — east of enemy,
	# within ±45° of facing. Expected new hp = 4 - round(4 * 0.25) = 4 - 1 = 3.
	var hp_before: int = int(e.get("hp"))
	e.call("take_hit", 4, false, Vector2(500, 300))
	var hp_after_front: int = int(e.get("hp"))
	var expected_front_delta: int = int(round(4.0 * 0.25))
	if hp_before - hp_after_front != expected_front_delta:
		printerr(
			"FAIL: FRONT hit delta=%d, expected %d (damage=4 × 0.25 reduction)" % [
				hp_before - hp_after_front, expected_front_delta
			]
		)
		quit(1)
		return
	if bool(e.call("is_shield_broken_for_test")):
		printerr("FAIL: FRONT hit broke shield — shield should still be intact")
		quit(1)
		return
	print(
		"[bulwark230] FRONT hit OK — hp %d → %d (damage 4 reduced to %d)" % [
			hp_before, hp_after_front, expected_front_delta
		]
	)
	# Reset hp for the back-hit test so we have headroom to observe.
	e.set("hp", BulwarkType.max_hp)
	# ── 4. BACK hit (source west of enemy, outside cone) → full + break ─
	# Hit with damage=2 from (300, 300) — directly west, opposite the
	# +X facing. Expected new hp = max_hp - 2, full damage applied, AND
	# shield broken.
	var hp_pre_back: int = int(e.get("hp"))
	e.call("take_hit", 2, false, Vector2(300, 300))
	var hp_after_back: int = int(e.get("hp"))
	if hp_pre_back - hp_after_back != 2:
		printerr(
			"FAIL: BACK hit delta=%d, expected 2 (full damage)" % [hp_pre_back - hp_after_back]
		)
		quit(1)
		return
	if not bool(e.call("is_shield_broken_for_test")):
		printerr("FAIL: BACK hit did not break shield")
		quit(1)
		return
	var broken_t: float = float(e.call("get_shield_broken_time_for_test"))
	if broken_t <= 0.0 or broken_t > 1.5001:
		printerr("FAIL: shield broken time = %.3f, expected 0 < t ≤ 1.5" % broken_t)
		quit(1)
		return
	print(
		"[bulwark230] BACK hit OK — hp %d → %d (full damage 2), shield broken (t=%.2f)" % [
			hp_pre_back, hp_after_back, broken_t
		]
	)
	# ── 5. Subsequent hits during broken window → full damage ────────
	# A front hit DURING the broken window should NOT be reduced (the
	# shield is down — the cone is moot until it restores).
	e.set("hp", BulwarkType.max_hp)
	var hp_pre_broken_front: int = int(e.get("hp"))
	e.call("take_hit", 3, false, Vector2(500, 300))
	var hp_after_broken_front: int = int(e.get("hp"))
	if hp_pre_broken_front - hp_after_broken_front != 3:
		printerr(
			"FAIL: FRONT hit during broken window delta=%d, expected 3 (no reduction)" % [
				hp_pre_broken_front - hp_after_broken_front
			]
		)
		quit(1)
		return
	print(
		"[bulwark230] FRONT hit while broken OK — hp %d → %d (no reduction, damage 3 applied)" % [
			hp_pre_broken_front, hp_after_broken_front
		]
	)
	# ── 6. Force-restore the shield → front hit re-reduces ────────────
	# Test the "shield restores after 1.5s" contract by force-restoring
	# (rather than waiting 1.5 s in physics_process). The reduction
	# math is gated solely by `_shield_broken_time > 0.0`; setting it
	# to 0 should immediately resume the cone behavior.
	e.call("force_shield_restore_for_test")
	if bool(e.call("is_shield_broken_for_test")):
		printerr("FAIL: force_shield_restore_for_test did not clear broken flag")
		quit(1)
		return
	e.set("hp", BulwarkType.max_hp)
	var hp_pre_restored: int = int(e.get("hp"))
	e.call("take_hit", 4, false, Vector2(500, 300))
	var hp_after_restored: int = int(e.get("hp"))
	if hp_pre_restored - hp_after_restored != expected_front_delta:
		printerr(
			"FAIL: FRONT hit after shield restore delta=%d, expected %d (reduced)" % [
				hp_pre_restored - hp_after_restored, expected_front_delta
			]
		)
		quit(1)
		return
	print("[bulwark230] shield restore OK — front hit re-reduced after restore")
	# ── 7. "Source pos unknown" fallback → full damage on intact ────
	# Pass `null` (or omit the 3rd arg) — the filter should fall through
	# to "always full damage" rather than guessing direction. This
	# preserves backward compatibility for any damage path that hasn't
	# plumbed the source position yet.
	e.set("hp", BulwarkType.max_hp)
	# Re-arm intact shield.
	e.call("force_shield_restore_for_test")
	var hp_pre_unknown: int = int(e.get("hp"))
	e.call("take_hit", 2, false)  # NO 3rd arg
	var hp_after_unknown: int = int(e.get("hp"))
	if hp_pre_unknown - hp_after_unknown != 2:
		printerr(
			"FAIL: unknown-source hit delta=%d, expected 2 (fallback to full damage)" % [
				hp_pre_unknown - hp_after_unknown
			]
		)
		quit(1)
		return
	# Shield should NOT break from an unknown-source hit (we don't
	# know the direction — we shouldn't trigger the flank break).
	if bool(e.call("is_shield_broken_for_test")):
		printerr("FAIL: unknown-source hit broke shield — should not (direction unknown)")
		quit(1)
		return
	print("[bulwark230] unknown-source fallback OK — full damage applied, shield intact")
	# ── 8. Wave config registration ───────────────────────────────────
	# Verify a room.tres actually spawns Bulwark so it appears in
	# combat (architecture-audit "21 enemies → 8 AI patterns" was a
	# REGISTRY-only gap until the new archetype showed up in a wave).
	var room5: Resource = load("res://scenes/rooms/room_05.tres")
	if room5 == null:
		printerr("FAIL: room_05.tres failed to load")
		quit(1)
		return
	var room5_text: String = FileAccess.get_file_as_string("res://scenes/rooms/room_05.tres")
	if room5_text.find("\"bulwark\"") < 0:
		printerr("FAIL: room_05.tres waves do not include 'bulwark'")
		quit(1)
		return
	print("[bulwark230] room_05.tres includes bulwark in a wave")
	# ── Done ─────────────────────────────────────────────────────────
	print("[bulwark230] PASS — shield_walker filter math + break/restore + registry OK")
	quit(0)
