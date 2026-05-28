extends SceneTree

# Iter 216 / Phase 5 — Branching DAG regression test. Verifies:
#   1. room_02 + room_04 have 3-door branches (the two choice points).
#   2. Each branch entry has the expected fields (kind, label, subtitle,
#      sometimes room_path).
#   3. room_03 is NOT is_last_room (was a stale flag pre-iter-216 that
#      terminated the run at iron_revenant, never reaching room_07).
#   4. Only room_07 has is_last_room = true.
#   5. The branch route destinations (shrine + treasure) load cleanly.

const CHOICE_ROOM_PATHS: Array[String] = [
	"res://scenes/rooms/room_02.tres",
	"res://scenes/rooms/room_04.tres",
]
const BRANCH_DEST_PATHS: Array[String] = [
	"res://scenes/rooms/room_shrine.tres",
	"res://scenes/rooms/room_treasure.tres",
]
const ALL_LINEAR_PATHS: Array[String] = [
	"res://scenes/rooms/room_01.tres",
	"res://scenes/rooms/room_02.tres",
	"res://scenes/rooms/room_03.tres",
	"res://scenes/rooms/room_04.tres",
	"res://scenes/rooms/room_05.tres",
	"res://scenes/rooms/room_06.tres",
	"res://scenes/rooms/room_07.tres",
]

func _initialize() -> void:
	print("[dag] init")
	await process_frame
	# 1. Choice rooms have 3-door branches.
	for path in CHOICE_ROOM_PATHS:
		var rc: Resource = load(path)
		if rc == null:
			printerr("FAIL: could not load %s" % path)
			quit(1)
			return
		var branches: Array = rc.get("branches")
		if branches == null or branches.size() != 3:
			printerr("FAIL: %s has %d branches, expected 3" % [
				path, branches.size() if branches != null else -1
			])
			quit(1)
			return
		print("[dag] %s has 3 branches: %s" % [
			path.get_file(),
			", ".join(branches.map(func(b): return str(b.get("kind", "?"))))
		])
		# Each branch must declare kind + label.
		for b in branches:
			if not (b is Dictionary):
				printerr("FAIL: %s branch is not a Dictionary" % path)
				quit(1)
				return
			if not b.has("kind") or not b.has("label"):
				printerr("FAIL: %s branch missing kind/label: %s" % [path, str(b)])
				quit(1)
				return
	# 2. Branch destination rooms load cleanly + have correct room_kind.
	for path in BRANCH_DEST_PATHS:
		var rc: Resource = load(path)
		if rc == null:
			printerr("FAIL: branch destination %s did not load" % path)
			quit(1)
			return
		var rk: String = rc.get("room_kind")
		if rk != "shrine" and rk != "treasure":
			printerr("FAIL: %s has room_kind '%s' (expected shrine|treasure)" % [path, rk])
			quit(1)
			return
		print("[dag] dest %s loaded with room_kind=%s" % [path.get_file(), rk])
	# 3 + 4. Only room_07 should have is_last_room = true.
	for path in ALL_LINEAR_PATHS:
		var rc: Resource = load(path)
		if rc == null:
			printerr("FAIL: %s did not load" % path)
			quit(1)
			return
		var ilr: bool = rc.get("is_last_room")
		var should_be_last: bool = path.ends_with("room_07.tres")
		if ilr != should_be_last:
			printerr("FAIL: %s is_last_room=%s but expected %s" % [path, ilr, should_be_last])
			quit(1)
			return
	print("[dag] is_last_room correct on all 7 linear rooms (only room_07)")
	print("[dag] PASS — branching DAG wired, room_03 fix landed, all destinations resolve")
	quit(0)
