extends SceneTree

# Iter 224 / Bug Team — Defensive Node2D-guard regression test.
#
# The architectural audit flagged 47 `as Node2D` casts across hero.gd,
# enemy.gd, and main.gd. Many of the group-walk loops iterating
# "enemies" did `is_instance_valid(e)` but NOT `e is Node2D` before
# coercing with `as Node2D` and accessing `.global_position`. If a
# non-Node2D node ever joined the group (mocked test enemy, breakable
# bookkeeping object, future debug helper), the cast would coerce to
# null and the `.global_position` access would crash the per-physics
# frame loop.
#
# Iter 224 adds explicit `is Node2D` guards at the high-traffic sites:
#   • enemy.gd::_compute_separation_vector       (per-physics-frame)
#   • hero.gd::_resolve_melee_strike loop        (per-swing)
#   • hero.gd::_resolve_dash_strike_hit          (per-dash final AoE)
#   • hero.gd::_apply_soul_burst_aoe / kill_explosion / shadow_shockwave
#
# This test stages a synthetic "non-Node2D enemy" — a bare Node added
# to the "enemies" group — alongside a real Enemy. It then runs the
# separation vector compute via the real Enemy's physics frame and
# verifies:
#   1. No crash / push_error from `.global_position` on the synthetic.
#   2. Real enemies still detected & separation vector returns a
#      sensible nonzero result when they're inside SEPARATION_RADIUS.

func _initialize() -> void:
	print("[guard224] init")
	await process_frame
	var SlimeType: Resource = load("res://scenes/enemies/slime.tres")
	var EnemyScene: PackedScene = load("res://scenes/enemy.tscn")
	if SlimeType == null or EnemyScene == null:
		printerr("FAIL: missing slime.tres or enemy.tscn")
		quit(1)
		return
	# Build a holder + a real Enemy that will run _compute_separation_vector.
	var holder: Node2D = Node2D.new()
	holder.name = "GuardHolder"
	root.add_child(holder)
	# Synthetic non-Node2D added to the "enemies" group. Plain Node has
	# no .global_position; pre-iter-224 this would crash the separation
	# loop. Post-fix, the `is Node2D` guard skips it cleanly.
	var bogus: Node = Node.new()
	bogus.name = "BogusNonNode2DInEnemiesGroup"
	bogus.add_to_group("enemies")
	holder.add_child(bogus)
	# A real Enemy near another Enemy so the separation vector has
	# something legitimate to compute against.
	var e_a: Node = EnemyScene.instantiate()
	e_a.set("enemy_type", SlimeType)
	e_a.position = Vector2(200, 200)
	e_a.add_to_group("enemies")
	holder.add_child(e_a)
	var e_b: Node = EnemyScene.instantiate()
	e_b.set("enemy_type", SlimeType)
	e_b.position = Vector2(220, 200)  # 20 px away — well within SEPARATION_RADIUS
	e_b.add_to_group("enemies")
	holder.add_child(e_b)
	await process_frame
	e_a.set("_spawn_in_time", 0.0)
	e_b.set("_spawn_in_time", 0.0)
	# Call separation vector explicitly. If the Node2D guard is missing,
	# this will crash with "Invalid get index 'global_position' on base
	# Node" when it hits the bogus member of the group.
	if not e_a.has_method("_compute_separation_vector"):
		printerr("FAIL: e_a missing _compute_separation_vector (refactor regression?)")
		quit(1)
		return
	var v: Vector2 = e_a.call("_compute_separation_vector")
	# Separation must push AWAY from e_b. e_b is to the right of e_a
	# (e_b.x > e_a.x), so the vector should point LEFT (v.x < 0).
	if v.length() < 0.001:
		printerr("FAIL: separation vector zero — real neighbor not detected (guard too aggressive?)")
		quit(1)
		return
	if v.x >= 0.0:
		printerr(
			"FAIL: separation vector points wrong direction — expected x<0, got %s" % str(v)
		)
		quit(1)
		return
	print("[guard224] separation vector OK — v=%s (points left, away from neighbor)" % str(v))
	# Sanity — bogus is still in the group. The guard skipped it, not
	# deleted it. Confirms we're testing the right path (graceful skip,
	# not group cleanup).
	if not bogus.is_in_group("enemies"):
		printerr("FAIL: bogus removed from group (unexpected mutation)")
		quit(1)
		return
	print("[guard224] PASS — non-Node2D in 'enemies' group skipped without crash; real neighbors still detected")
	quit(0)
