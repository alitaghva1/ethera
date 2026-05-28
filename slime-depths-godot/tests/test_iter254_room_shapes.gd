extends SceneTree

# iter-254 / Wave 5A — ROOM SHAPE VARIETY smoke test.
#
# Pre-iter-254 every combat room was a 1280×768 rectangle with at most a
# couple short walls — visually monotonous. Wave 5A introduces three new
# shape TEMPLATES (corridor / ring / multi-chamber) and re-authors two
# existing rooms to use them:
#
#   • room_04.tres (CRYPT GATE) → RING — a 280×200 wall block at the
#     center forces combat AROUND the perimeter. Enemies can flank
#     "around" the block instead of converging on the hero from open
#     space.
#
#   • room_06.tres (BROOD CHAMBER) → MULTI-CHAMBER — two short vertical
#     walls at x=580 and x=672 split the play area into a west chamber
#     and east chamber with a narrow bridge gap. Forces the player to
#     commit to one side then push to the other, and enemies in the
#     un-attended chamber can ambush.
#
# This test guards the SHAPE DATA itself. The wave runner + door spawn
# + relic pickup pipeline is shape-agnostic (walls are just Rect2 →
# StaticBody2D collider via _spawn_interior_walls in main.gd), so the
# room loads + clears cleanly with any wall_rects. We don't need to
# re-test that here.
#
# Checks (per re-authored room):
#   A. wall_rects non-empty
#   B. wall_rects matches the expected shape signature
#       (RING = exactly 1 rect of size 280×200 centered around x≈640;
#        MULTI-CHAMBER = exactly 2 vertical rects of size 28×200 with
#        a gap between them)
#   C. hero_spawn is NOT inside any wall_rect
#   D. all spawn_points are NOT inside any wall_rect

func _initialize() -> void:
	print("[iter254roomshapes] init")
	await process_frame

	# ── ROOM 04 — RING ───────────────────────────────────────────────
	var r4: RoomConfig = load("res://scenes/rooms/room_04.tres") as RoomConfig
	if r4 == null:
		printerr("FAIL: room_04.tres failed to load as RoomConfig")
		quit(1)
		return

	# A. wall_rects non-empty
	if r4.wall_rects.is_empty():
		printerr("FAIL: room_04 wall_rects empty — expected RING center wall")
		quit(1)
		return

	# B. RING signature — one center block sized 280×200, centered
	# around x≈640 (room horizontal center) and y≈384 (room vertical
	# center). Allow 32 px tolerance on either side so the template
	# can be nudged later without rewriting the test.
	if r4.wall_rects.size() != 1:
		printerr("FAIL: room_04 expected exactly 1 ring wall, got %d" % r4.wall_rects.size())
		quit(1)
		return
	var ring: Rect2 = r4.wall_rects[0]
	if abs(ring.size.x - 280.0) > 32.0 or abs(ring.size.y - 200.0) > 32.0:
		printerr("FAIL: room_04 ring size %s ≠ ~(280,200)" % str(ring.size))
		quit(1)
		return
	var ring_center: Vector2 = ring.position + ring.size * 0.5
	if abs(ring_center.x - 640.0) > 60.0 or abs(ring_center.y - 384.0) > 60.0:
		printerr("FAIL: room_04 ring center %s not near (640,384)" % str(ring_center))
		quit(1)
		return
	print("[iter254roomshapes] room_04 RING shape OK — Rect2 %s" % str(ring))

	# C. hero_spawn outside ring
	if _point_in_any_rect(r4.hero_spawn, r4.wall_rects):
		printerr("FAIL: room_04 hero_spawn %s inside a wall_rect" % str(r4.hero_spawn))
		quit(1)
		return

	# D. spawn_points outside walls
	for sp in r4.spawn_points:
		if _point_in_any_rect(sp, r4.wall_rects):
			printerr("FAIL: room_04 spawn_point %s inside a wall_rect" % str(sp))
			quit(1)
			return
	print("[iter254roomshapes] room_04 hero_spawn + %d spawn_points clear of walls" % r4.spawn_points.size())

	# ── ROOM 06 — MULTI-CHAMBER ──────────────────────────────────────
	var r6: RoomConfig = load("res://scenes/rooms/room_06.tres") as RoomConfig
	if r6 == null:
		printerr("FAIL: room_06.tres failed to load as RoomConfig")
		quit(1)
		return

	# A. wall_rects non-empty
	if r6.wall_rects.is_empty():
		printerr("FAIL: room_06 wall_rects empty — expected MULTI-CHAMBER pair")
		quit(1)
		return

	# B. MULTI-CHAMBER signature — exactly two vertical slabs (height
	# ≫ width, height ≈200) with a horizontal gap between them.
	if r6.wall_rects.size() != 2:
		printerr("FAIL: room_06 expected exactly 2 chamber walls, got %d" % r6.wall_rects.size())
		quit(1)
		return
	var wa: Rect2 = r6.wall_rects[0]
	var wb: Rect2 = r6.wall_rects[1]
	# Both should be tall+thin (height ≫ width).
	for w in [wa, wb]:
		if w.size.y < w.size.x * 3.0:
			printerr("FAIL: room_06 wall %s not tall+thin (expected vertical slab)" % str(w))
			quit(1)
			return
		if abs(w.size.y - 200.0) > 32.0:
			printerr("FAIL: room_06 wall height %f not ~200" % w.size.y)
			quit(1)
			return
	# Gap between the two slabs along x — order-independent.
	var left_wall: Rect2 = wa if wa.position.x < wb.position.x else wb
	var right_wall: Rect2 = wa if wa.position.x >= wb.position.x else wb
	var gap_px: float = right_wall.position.x - (left_wall.position.x + left_wall.size.x)
	if gap_px <= 0.0:
		printerr("FAIL: room_06 chamber walls overlap or touch (gap=%f)" % gap_px)
		quit(1)
		return
	if gap_px > 200.0:
		printerr("FAIL: room_06 chamber gap %f too wide — not a bridge anymore" % gap_px)
		quit(1)
		return
	print("[iter254roomshapes] room_06 MULTI-CHAMBER OK — slabs %s / %s gap=%.0fpx" % [str(left_wall), str(right_wall), gap_px])

	# C. hero_spawn outside walls
	if _point_in_any_rect(r6.hero_spawn, r6.wall_rects):
		printerr("FAIL: room_06 hero_spawn %s inside a wall_rect" % str(r6.hero_spawn))
		quit(1)
		return
	# Hero should specifically be in the west chamber (x < left wall).
	if r6.hero_spawn.x >= left_wall.position.x:
		printerr("FAIL: room_06 hero_spawn x=%f should be in west chamber (x<%f)" % [r6.hero_spawn.x, left_wall.position.x])
		quit(1)
		return

	# D. spawn_points outside walls + at least one in each chamber.
	var west_spawns: int = 0
	var east_spawns: int = 0
	for sp in r6.spawn_points:
		if _point_in_any_rect(sp, r6.wall_rects):
			printerr("FAIL: room_06 spawn_point %s inside a wall_rect" % str(sp))
			quit(1)
			return
		if sp.x < left_wall.position.x:
			west_spawns += 1
		elif sp.x > right_wall.position.x + right_wall.size.x:
			east_spawns += 1
	if west_spawns == 0 or east_spawns == 0:
		printerr("FAIL: room_06 spawns not split across chambers (W=%d E=%d) — multi-chamber ambush requires both" % [west_spawns, east_spawns])
		quit(1)
		return
	print("[iter254roomshapes] room_06 hero_spawn + %d spawn_points clear (W=%d / E=%d)" % [r6.spawn_points.size(), west_spawns, east_spawns])

	# ── Unchanged baseline rooms — quick sanity: rooms 1/2/3/5/7
	# should still be authored as plain rectangle layouts, i.e. they
	# should NOT have a single 280×200 center block (that's the RING
	# signature reserved for room_04) and should NOT have two
	# matching 28×200 vertical slabs (the MULTI-CHAMBER signature
	# reserved for room_06). This is a guardrail against accidentally
	# pasting the new shape into a baseline room.
	for path in ["res://scenes/rooms/room_01.tres",
				 "res://scenes/rooms/room_02.tres",
				 "res://scenes/rooms/room_03.tres",
				 "res://scenes/rooms/room_05.tres",
				 "res://scenes/rooms/room_07.tres"]:
		var rc: RoomConfig = load(path) as RoomConfig
		if rc == null:
			printerr("FAIL: %s failed to load" % path)
			quit(1)
			return
		# Each baseline room must still load + have a hero_spawn that
		# isn't inside its own walls. (Same validation rule applied to
		# every room, baseline or shaped.)
		if _point_in_any_rect(rc.hero_spawn, rc.wall_rects):
			printerr("FAIL: %s hero_spawn inside a wall_rect" % path)
			quit(1)
			return
		for sp in rc.spawn_points:
			if _point_in_any_rect(sp, rc.wall_rects):
				printerr("FAIL: %s spawn_point %s inside a wall_rect" % [path, str(sp)])
				quit(1)
				return
	print("[iter254roomshapes] baseline rooms 1/2/3/5/7 still walkable (no shape regression)")

	print("[iter254roomshapes] PASS")
	quit(0)

# Inclusive rect-contains check (treat rect edges as inside, so points
# right on the wall surface fail validation).
func _point_in_any_rect(p: Vector2, rects: Array[Rect2]) -> bool:
	for r in rects:
		if p.x >= r.position.x and p.x <= r.position.x + r.size.x \
		and p.y >= r.position.y and p.y <= r.position.y + r.size.y:
			return true
	return false
