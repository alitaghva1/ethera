extends SceneTree

# Iter 228 / Bug Team R2 — Boss phase-transition regression test.
#
# Iron Revenant, Broodmother, and Ember Tyrant all author non-empty
# `phase2_overrides` and `phase3_overrides` dictionaries on their
# EnemyType resources. At runtime, enemy.gd::take_hit watches the
# hp/max_hp ratio after each hit and triggers `_trigger_phase_2` or
# `_trigger_phase_3` when ratio crosses the configured threshold.
# Each transition duplicates the EnemyType (so other instances of
# the same boss don't share the mutation), applies the override
# dict onto the local copy, fires a red tint flash, and emits
# `phase_changed(N)` + `Events.boss_enraged` / `Events.boss_phase_3`.
#
# This test guards the architecture-audit risk #2 ("no boss-phase
# transition test"). It spawns an ember_tyrant instance, drains its
# HP across both thresholds, and verifies:
#   1. `_phase` advances 1 → 2 → 3 as the ratio crosses each gate.
#   2. The override dict is actually APPLIED (the live `enemy_type`
#      duplicate has the override field values, NOT the .tres
#      defaults — this catches "transition fires but overrides
#      never apply" silent regressions).
#   3. The .tres on disk has not lost its override fields (catches
#      "phase2_overrides cleared during editor session" gotchas).
#
# Pattern derives from iter-224's enemy instantiation + spawn-in
# bypass — we add the enemy to a Node2D holder, zero `_spawn_in_time`
# so take_hit doesn't no-op, then call take_hit() directly with
# damage values calibrated to land at known hp / max_hp ratios.

func _initialize() -> void:
	print("[boss228] init")
	await process_frame
	# ── 1. Load resources ──────────────────────────────────────────────
	var TyrantType: EnemyType = load("res://scenes/enemies/ember_tyrant.tres") as EnemyType
	var EnemyScene: PackedScene = load("res://scenes/enemy.tscn") as PackedScene
	if TyrantType == null:
		printerr("FAIL: ember_tyrant.tres failed to load as EnemyType")
		quit(1)
		return
	if EnemyScene == null:
		printerr("FAIL: enemy.tscn failed to load as PackedScene")
		quit(1)
		return
	# ── 2. Static .tres sanity — override dicts present + non-trivial ─
	# Catches the "editor accidentally cleared phase overrides" failure
	# mode independent of the runtime transition logic.
	if TyrantType.phase2_overrides.is_empty():
		printerr("FAIL: ember_tyrant.tres has empty phase2_overrides — boss won't enrage")
		quit(1)
		return
	if TyrantType.phase3_overrides.is_empty():
		printerr("FAIL: ember_tyrant.tres has empty phase3_overrides — boss won't desperate-rage")
		quit(1)
		return
	if TyrantType.phase2_hp_threshold <= 0.0:
		printerr("FAIL: ember_tyrant.tres phase2_hp_threshold disabled (must be > 0)")
		quit(1)
		return
	if TyrantType.phase3_hp_threshold <= 0.0:
		printerr("FAIL: ember_tyrant.tres phase3_hp_threshold disabled (must be > 0)")
		quit(1)
		return
	print("[boss228] .tres has phase2(thr=%.2f, %d overrides) + phase3(thr=%.2f, %d overrides)" % [
		TyrantType.phase2_hp_threshold,
		TyrantType.phase2_overrides.size(),
		TyrantType.phase3_hp_threshold,
		TyrantType.phase3_overrides.size(),
	])
	# Capture baseline override values for the post-transition diff.
	# These are the values phase2_overrides / phase3_overrides should
	# leak onto the live enemy_type after each transition.
	var p1_windup: float = TyrantType.melee_windup
	var p2_windup_expected: float = float(TyrantType.phase2_overrides.get("melee_windup", p1_windup))
	var p3_windup_expected: float = float(TyrantType.phase3_overrides.get("melee_windup", p2_windup_expected))
	if absf(p1_windup - p2_windup_expected) < 0.001:
		printerr("FAIL: phase2 melee_windup override equals phase1 — no observable change")
		quit(1)
		return
	if absf(p2_windup_expected - p3_windup_expected) < 0.001:
		printerr("FAIL: phase3 melee_windup override equals phase2 — no observable change")
		quit(1)
		return
	# ── 3. Spawn live enemy and prep ──────────────────────────────────
	var holder: Node2D = Node2D.new()
	holder.name = "PhaseHolder"
	root.add_child(holder)
	var e: Node = EnemyScene.instantiate()
	e.set("enemy_type", TyrantType)
	e.position = Vector2(400, 300)
	holder.add_child(e)
	await process_frame
	# Bypass spawn-in fade so take_hit isn't a no-op.
	e.set("_spawn_in_time", 0.0)
	# Force max-hp baseline. enemy.gd reads `max_hp` off enemy_type on
	# init; the live `hp` field should already mirror that. Belt-and-
	# suspenders: set it explicitly so a future _ready change doesn't
	# silently break this test.
	e.set("hp", TyrantType.max_hp)
	var phase_before: int = int(e.get("_phase"))
	if phase_before != 1:
		printerr("FAIL: enemy starts at _phase=%d, expected 1" % phase_before)
		quit(1)
		return
	# ── 4. Drive to phase 2 ────────────────────────────────────────────
	# Ember Tyrant: max_hp 16, phase2_hp_threshold 0.65. Drain 6 → hp 10
	# → 10/16 = 0.625 ≤ 0.65 → phase 2 fires.
	var p2_target_hp: int = int(floor(float(TyrantType.max_hp) * TyrantType.phase2_hp_threshold))
	var dmg_to_p2: int = TyrantType.max_hp - p2_target_hp
	if dmg_to_p2 <= 0:
		dmg_to_p2 = 1
	if dmg_to_p2 >= TyrantType.max_hp:
		dmg_to_p2 = TyrantType.max_hp - 1
	e.call("take_hit", dmg_to_p2, false)
	var phase_after_p2: int = int(e.get("_phase"))
	if phase_after_p2 != 2:
		printerr(
			"FAIL: after %d damage (hp now %d/%d, ratio %.2f, thr %.2f) _phase=%d, expected 2" % [
				dmg_to_p2,
				int(e.get("hp")),
				TyrantType.max_hp,
				float(int(e.get("hp"))) / float(TyrantType.max_hp),
				TyrantType.phase2_hp_threshold,
				phase_after_p2,
			]
		)
		quit(1)
		return
	# After phase 2 the enemy's `enemy_type` is replaced by a duplicate
	# with overrides applied. Verify melee_windup matches the override
	# value, NOT the resource's authored phase-1 value.
	var live_type_p2: EnemyType = e.get("enemy_type") as EnemyType
	if live_type_p2 == null:
		printerr("FAIL: phase 2 transition cleared enemy_type")
		quit(1)
		return
	if absf(live_type_p2.melee_windup - p2_windup_expected) > 0.001:
		printerr(
			"FAIL: phase 2 melee_windup not applied — live=%.3f, expected override=%.3f" % [
				live_type_p2.melee_windup, p2_windup_expected
			]
		)
		quit(1)
		return
	# Crucial: the SHARED .tres on disk must be untouched (duplicate
	# protects siblings). Re-read it and compare to the captured baseline.
	var TyrantTypeReread: EnemyType = load("res://scenes/enemies/ember_tyrant.tres") as EnemyType
	if absf(TyrantTypeReread.melee_windup - p1_windup) > 0.001:
		printerr(
			"FAIL: phase 2 transition leaked into shared .tres — %.3f != baseline %.3f" % [
				TyrantTypeReread.melee_windup, p1_windup
			]
		)
		quit(1)
		return
	print(
		"[boss228] phase 2 OK — _phase=2, live melee_windup %.2f → %.2f, shared .tres intact" % [
			p1_windup, live_type_p2.melee_windup
		]
	)
	# ── 5. Drive to phase 3 ────────────────────────────────────────────
	# Now at hp=10 (Tyrant). Phase3 threshold 0.30 of original 16 = 4.8,
	# so floor(4.8) = 4. Drain 6 more → hp 4 → 4/16 = 0.25 ≤ 0.30.
	var p3_target_hp: int = int(floor(float(TyrantType.max_hp) * TyrantType.phase3_hp_threshold))
	var dmg_to_p3: int = int(e.get("hp")) - p3_target_hp
	if dmg_to_p3 <= 0:
		dmg_to_p3 = 1
	# Clamp so we don't accidentally kill the enemy (death triggers _die,
	# different state machine). Leave at LEAST 1 hp post-hit.
	if dmg_to_p3 >= int(e.get("hp")):
		dmg_to_p3 = int(e.get("hp")) - 1
	e.call("take_hit", dmg_to_p3, false)
	var phase_after_p3: int = int(e.get("_phase"))
	if phase_after_p3 != 3:
		printerr(
			"FAIL: after %d further damage (hp now %d/%d, ratio %.2f, thr %.2f) _phase=%d, expected 3" % [
				dmg_to_p3,
				int(e.get("hp")),
				TyrantType.max_hp,
				float(int(e.get("hp"))) / float(TyrantType.max_hp),
				TyrantType.phase3_hp_threshold,
				phase_after_p3,
			]
		)
		quit(1)
		return
	var live_type_p3: EnemyType = e.get("enemy_type") as EnemyType
	if live_type_p3 == null:
		printerr("FAIL: phase 3 transition cleared enemy_type")
		quit(1)
		return
	if absf(live_type_p3.melee_windup - p3_windup_expected) > 0.001:
		printerr(
			"FAIL: phase 3 melee_windup not applied — live=%.3f, expected override=%.3f" % [
				live_type_p3.melee_windup, p3_windup_expected
			]
		)
		quit(1)
		return
	print(
		"[boss228] phase 3 OK — _phase=3, live melee_windup %.2f → %.2f" % [
			p2_windup_expected, live_type_p3.melee_windup
		]
	)
	# ── 6. Idempotence — a further hit must NOT regress phase or
	# re-apply the overrides. _phase is the gate; re-hitting at phase 3
	# should leave _phase == 3.
	if int(e.get("hp")) > 1:
		e.call("take_hit", 1, false)
	if int(e.get("_phase")) != 3:
		printerr("FAIL: a further hit regressed _phase from 3 to %d" % int(e.get("_phase")))
		quit(1)
		return
	# ── 7. Other bosses author their phases too (sanity grep on the
	# other two boss .tres files, defensive against accidental clears
	# in a sweeping edit).
	var iron_rev: EnemyType = load("res://scenes/enemies/iron_revenant.tres") as EnemyType
	if iron_rev == null:
		print("[boss228] note: iron_revenant.tres not found, skipping sanity")
	else:
		if iron_rev.is_boss and iron_rev.phase2_overrides.is_empty():
			printerr("FAIL: iron_revenant.tres is_boss but phase2_overrides empty")
			quit(1)
			return
	var brood: EnemyType = load("res://scenes/enemies/broodmother.tres") as EnemyType
	if brood == null:
		print("[boss228] note: broodmother.tres not found, skipping sanity")
	else:
		if brood.is_boss and brood.phase2_overrides.is_empty():
			printerr("FAIL: broodmother.tres is_boss but phase2_overrides empty")
			quit(1)
			return
	print("[boss228] PASS — Ember Tyrant phase 1→2→3 with override fields applied; .tres intact")
	quit(0)
