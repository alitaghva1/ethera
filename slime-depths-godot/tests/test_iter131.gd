extends SceneTree

# Iter 131 — Room shape variety: plus-shape and L-shape wall geometry.
#
# User feedback axis: "Rooms — variety, shape, size, feel"
#   "if rooms are mostly rectangles today, add L-shapes, plus-shapes,
#   central pillars/holes, narrow corridors. Pure geometry — no art cost."
#
# Prior state: all 6 combat rooms used simple rectangular wall_rects —
# horizontal bars, vertical bars, corner boxes. Every layout was axis-
# aligned boxes that didn't create interesting negative space.
#
# Iter-131 retrofits room_04 (CRYPT GATE) with:
#
#   PLUS-SHAPED CENTRAL OBSTACLE
#     Two perpendicular rectangles intersecting at room center (640, 384):
#       • Horizontal arm: Rect2(520, 370, 240, 28) — spans x 520-760
#       • Vertical arm: Rect2(626, 284, 28, 200) — spans y 284-484
#     Creates 4 quadrants that enemies and hero must navigate around.
#     Forces multi-axis movement instead of simple left-right kiting.
#
#   L-SHAPED CORNER WALLS (2 instances)
#     Top-left L (inverted):
#       • Horizontal: Rect2(260, 200, 120, 28)
#       • Vertical: Rect2(352, 200, 28, 100)
#       Corner at (352, 200) — forces hero around the corner.
#     Bottom-right L:
#       • Horizontal: Rect2(880, 528, 100, 28)
#       • Vertical: Rect2(880, 440, 28, 116)
#       Corner at (880, 440) — asymmetric cover in opposite quadrant.
#
#   HAZARD REPOSITIONING
#     Slow zones moved from center (conflicted with plus) to open quadrants:
#       • (500, 384) → (380, 320) — top-left quadrant
#       • (780, 384) → (900, 448) — bottom-right quadrant
#
#   SPAWN POINT ADJUSTMENT
#     Spawn at (380, 200) moved to (300, 160) — old position now inside
#     the top-left L-shape wall.
#
# Design rationale: the plus + L combo creates ASYMMETRIC cover.
#   • Plus divides the room into predictable quadrants (pattern)
#   • L-shapes break the symmetry (surprise element)
#   • Enemies spawning from different sides now have different cover
#     relationships to the hero
#
# Genre reference: Gungeon's room variety comes from exactly this —
# hand-placed geometry that creates distinct combat puzzles. Adding
# L-shapes and plus-shapes is the minimum vocabulary for interesting
# negative space without requiring new art.

func _initialize() -> void:
	var ok := true

	# Load room_04.tres as text to inspect structure
	var tres := FileAccess.get_file_as_string("res://scenes/rooms/room_04.tres")

	# ═══ Wall count increased ═══
	# Old layout had 4 wall_rects (grid of horizontal bars)
	# New layout has 6 wall_rects (plus + 2 L-shapes)
	var rect_count := tres.count("Rect2(")
	if rect_count < 6:
		push_error("FAIL: room_04 only has %d Rect2 entries, expected 6+ (plus + L-shapes)" % rect_count)
		ok = false
	if ok:
		print("OK room_04 wall count: %d Rect2 entries (was 4, now 6+)" % rect_count)

	# ═══ Plus-shape signature: horizontal + vertical at center ═══
	# Horizontal arm around y=370: Rect2(520, 370, 240, 28)
	# Vertical arm around x=626: Rect2(626, 284, 28, 200)
	var has_horiz_center := "Rect2(520, 370, 240, 28)" in tres
	var has_vert_center := "Rect2(626, 284, 28, 200)" in tres
	if not has_horiz_center:
		push_error("FAIL: plus horizontal arm Rect2(520, 370, 240, 28) missing")
		ok = false
	if not has_vert_center:
		push_error("FAIL: plus vertical arm Rect2(626, 284, 28, 200) missing")
		ok = false
	if has_horiz_center and has_vert_center:
		print("OK plus-shape central obstacle present (horizontal + vertical arms)")

	# ═══ L-shape signature: corner walls ═══
	# Top-left L: Rect2(260, 200, ...) + Rect2(352, 200, ...)
	# Bottom-right L: Rect2(880, 528, ...) + Rect2(880, 440, ...)
	var has_tl_l := "Rect2(260, 200," in tres and "Rect2(352, 200," in tres
	var has_br_l := "Rect2(880, 528," in tres and "Rect2(880, 440," in tres
	if not has_tl_l:
		push_error("FAIL: top-left L-shape walls missing (Rect2 at 260,200 + 352,200)")
		ok = false
	if not has_br_l:
		push_error("FAIL: bottom-right L-shape walls missing (Rect2 at 880,528 + 880,440)")
		ok = false
	if has_tl_l and has_br_l:
		print("OK L-shaped corner walls present (top-left + bottom-right)")

	# ═══ Hazards repositioned ═══
	# Old: slow_zone at (500, 384) and (780, 384) — center, conflicts with plus
	# New: slow_zone at (380, 320) and (900, 448) — open quadrants
	var has_old_hazards := "Vector2(500, 384)" in tres or "Vector2(780, 384)" in tres
	var has_new_hazards := "Vector2(380, 320)" in tres and "Vector2(900, 448)" in tres
	if has_old_hazards:
		push_error("FAIL: old hazard positions (500,384 or 780,384) still present — conflict with plus")
		ok = false
	if not has_new_hazards:
		push_error("FAIL: new hazard positions (380,320) and (900,448) missing")
		ok = false
	if not has_old_hazards and has_new_hazards:
		print("OK hazards repositioned to open quadrants (380,320) + (900,448)")

	# ═══ Spawn point adjusted ═══
	# Old: (380, 200) inside top-left L-shape
	# New: (300, 160) clear of walls
	var has_old_spawn := "Vector2(380, 200)" in tres
	var has_new_spawn := "Vector2(300, 160)" in tres
	if has_old_spawn:
		push_error("FAIL: old spawn point (380, 200) still present — inside L-shape wall")
		ok = false
	if not has_new_spawn:
		push_error("FAIL: adjusted spawn point (300, 160) missing")
		ok = false
	if not has_old_spawn and has_new_spawn:
		print("OK spawn point adjusted (380,200 → 300,160) to clear L-shape wall")

	# ═══ Runtime load ═══
	var cfg: Resource = load("res://scenes/rooms/room_04.tres")
	if cfg == null:
		push_error("FAIL: room_04.tres no longer loads after iter-131 changes")
		ok = false
	else:
		print("OK room_04.tres loads successfully")

	if ok:
		print("=== ITER 131 INTEGRATION PASSED ===")
	else:
		print("=== ITER 131 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
