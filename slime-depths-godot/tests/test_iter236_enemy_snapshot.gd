extends SceneTree

# Iter 236 / Bug Team R4 — shared enemy snapshot regression test.
#
# Background: the architectural audit (risk #3) flagged dozens of per-
# physics-frame `get_tree().get_nodes_in_group("enemies")` walks
# compounding across `enemy.gd::_compute_separation_vector`, hero AoE
# scans, projectile ricochet, etc. At 30+ enemies in a phase-3 Tyrant
# wave + summons, the walks compounded into dozens per frame.
#
# Iter 236 introduces a single per-frame snapshot on main.gd refreshed
# at the top of `_process`, exposed via `get_enemy_snapshot()`. This
# sprint migrates ONLY `_compute_separation_vector` to consume it — the
# rest of the call sites can move incrementally.
#
# This test verifies:
#   1. main.gd loads with the snapshot field + `get_enemy_snapshot()`
#      accessor present.
#   2. After one process frame, the snapshot is a non-null Array[Node]
#      whose contents match `get_tree().get_nodes_in_group("enemies")`
#      one-for-one.
#   3. When an enemy is added to the "enemies" group, the snapshot
#      catches it on the NEXT frame (the contract is "once per frame",
#      not "real-time").

func _initialize() -> void:
	print("[snap236] init")
	await process_frame
	# Load main scene so the autoload + scene-graph snapshot path is live.
	var main_scene: PackedScene = load("res://scenes/main.tscn")
	if main_scene == null:
		printerr("FAIL: scenes/main.tscn failed to load")
		quit(1)
		return
	var main_root: Node = main_scene.instantiate()
	root.add_child(main_root)
	await process_frame
	# 1) Accessor + field exist.
	if not main_root.has_method("get_enemy_snapshot"):
		printerr("FAIL: main.gd missing get_enemy_snapshot() accessor")
		quit(1)
		return
	# 2) Snapshot is a non-null Array[Node] and matches the group.
	var snap: Array = main_root.call("get_enemy_snapshot")
	if snap == null:
		printerr("FAIL: get_enemy_snapshot() returned null")
		quit(1)
		return
	var grp_nodes: Array = main_root.get_tree().get_nodes_in_group("enemies")
	if snap.size() != grp_nodes.size():
		printerr(
			"FAIL: snapshot size %d != group size %d (one-frame stale tolerance ok, but should match after process_frame)" %
			[snap.size(), grp_nodes.size()]
		)
		quit(1)
		return
	# Order-independent set compare — group walks aren't ordering-guaranteed.
	for g in grp_nodes:
		if not (g in snap):
			printerr("FAIL: enemy %s in group but missing from snapshot" % str(g))
			quit(1)
			return
	print("[snap236] snapshot matches group (size=%d)" % snap.size())
	# 3) Newly-added enemy is reflected on the next frame. Stage a bare
	# Node2D into the group, advance one frame, recheck.
	var fake: Node2D = Node2D.new()
	fake.name = "FakeEnemyForSnapshotTest"
	fake.add_to_group("enemies")
	root.add_child(fake)
	await process_frame
	var snap2: Array = main_root.call("get_enemy_snapshot")
	if not (fake in snap2):
		printerr("FAIL: snapshot didn't pick up newly-added enemy after one frame")
		quit(1)
		return
	print("[snap236] snapshot refreshed with new group member (size=%d)" % snap2.size())
	# Cleanup so we don't pollute other tests in the batch.
	fake.queue_free()
	main_root.queue_free()
	await process_frame
	print("[snap236] PASS — shared per-frame enemy snapshot working")
	quit(0)
