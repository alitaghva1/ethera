extends SceneTree

# Iter 120 — Atmosphere pass (final part of the visual presentation pass).
#
# Iter-115 added the room-chrome structure (perimeter walls + center
# mute + inner shadows + corner AO). Iters 116-119 layered lighting,
# entity readability, portal cleanup, and HUD polish on top. The
# perimeter wall MASS that iter-115 introduced read as uniformly flat —
# the chrome was structural, not atmospheric.
#
# Iter-120 dirties up the perimeter without crowding the center:
#
#   WALL SCRATCHES — 24 short dark Line2Ds drawn into the perimeter wall
#   strips (6 per wall). Random offset along each wall, perpendicular-ish
#   rotation with ±25° jitter. Reads as weathered etchings on the stone.
#
#   EDGE STAINS — 18 irregular dark Polygon2D blots in the 16-60 px
#   band inside the wall→floor seam (4-5 per side). Generated each spawn
#   with random vertex jitter so silhouettes don't repeat. Distinct from
#   the iter-115 AO gradient (uniform falloff) — these are wear marks.
#
#   CORNER RUBBLE — 3 small pebble Polygon2Ds at each of the 4 inside
#   corners. Tight ±12 px scatter. Anchors the AO with physical detail.
#
# Critical design constraint: ALL atmosphere lives in the OUTER 80 px
# of the room. The iter-115 center mute keeps the play area calm; this
# iter strictly avoids crossing into that zone.
#
# Called from _spawn_room_chrome() at the very end so atmosphere layers
# render on top of perimeter + inner shadows + corner AO.
func _initialize() -> void:
	var ok := true

	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")

	# ═══ Atmosphere wired into the chrome dispatcher ═══
	if "func _spawn_wall_atmosphere" not in main_src:
		push_error("FAIL: missing _spawn_wall_atmosphere helper")
		ok = false
	if "_spawn_wall_atmosphere()" not in main_src:
		push_error("FAIL: _spawn_room_chrome never calls _spawn_wall_atmosphere")
		ok = false
	if ok:
		print("OK _spawn_wall_atmosphere defined + invoked from _spawn_room_chrome")

	# ═══ Three sub-layers present ═══
	var required_subs := [
		"func _spawn_wall_scratches",
		"func _spawn_edge_stains",
		"func _spawn_corner_rubble",
		"func _atmosphere_wall_strips",
	]
	for s in required_subs:
		if s not in main_src:
			push_error("FAIL: main.gd missing %s helper" % s)
			ok = false
	if ok:
		print("OK 3 atmosphere sub-layers + wall-strip dispatcher present")

	# ═══ Density constants ═══
	if "ATMOSPHERE_SCRATCH_COUNT" not in main_src:
		push_error("FAIL: missing ATMOSPHERE_SCRATCH_COUNT")
		ok = false
	if "ATMOSPHERE_STAIN_COUNT" not in main_src:
		push_error("FAIL: missing ATMOSPHERE_STAIN_COUNT")
		ok = false
	if "ATMOSPHERE_CORNER_RUBBLE_PER_CORNER" not in main_src:
		push_error("FAIL: missing ATMOSPHERE_CORNER_RUBBLE_PER_CORNER")
		ok = false
	# Restraint check: scratch count + stain count shouldn't be huge —
	# the user's design rule is "decoration should support atmosphere
	# without hurting combat readability." More than 50 per category
	# would start to crowd the rim.
	if "ATMOSPHERE_SCRATCH_COUNT: int = 24" not in main_src:
		push_error("FAIL: ATMOSPHERE_SCRATCH_COUNT should be 24 (6 per wall)")
		ok = false
	if "ATMOSPHERE_STAIN_COUNT: int = 18" not in main_src:
		push_error("FAIL: ATMOSPHERE_STAIN_COUNT should be 18 (~5 per side)")
		ok = false
	if ok:
		print("OK density constants: 24 scratches + 18 stains + 3×4 rubble (restrained)")

	# ═══ Atmosphere stays in OUTER 80 px (center mute preserved) ═══
	# _spawn_edge_stains constrains into_floor to randf_range(16, 60).
	# 60 is well inside CHROME_CENTER_INSET = 60 (just on the boundary).
	# Scratches go INTO the wall mass (perp direction), not into the
	# floor — they don't risk the center.
	if not main_src.contains("randf_range(16.0, 60.0)"):
		push_error("FAIL: edge stains should stay within 16-60 px of walls (center mute preservation)")
		ok = false
	if ok:
		print("OK stains capped at 60 px from wall (preserves iter-115 center mute)")

	# ═══ Reuses existing primitive helpers (no dup code) ═══
	# The new spawners build Polygon2D + Line2D inline rather than
	# adding new primitive helpers — appropriate since each has its
	# own irregular-vertex generation.

	if ok:
		print("=== ITER 120 INTEGRATION PASSED ===")
	else:
		print("=== ITER 120 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
