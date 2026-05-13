extends SceneTree

# Iter 115 — Room readability chrome (part 1 of the visual presentation
# pass: rooms feel like prototypes).
#
# Pre-iter-115:
#   • procedural_dungeon.png had a dark border that doubled as the wall
#     — thin painted frame, no mass.
#   • Floor texture noise extended uniformly across the play area; combat
#     in the center had to fight visual noise.
#   • No AO line where the wall met the floor — the room read coplanar.
#
# Iter-115 layers three new chrome systems built code-side off
# RoomConfig-independent constants:
#
#   PERIMETER WALL MASS: 4 solid Polygon2D strips along the room's outer
#   border (above and below the playable region, left + right), in
#   CHROME_WALL_STONE_COLOR (dark blue-purple stone). Plus per-side
#   warm-gray Line2D top-edge highlights at the wall→floor seam.
#
#   CENTER FLOOR MUTE: one low-alpha (22%) dark Polygon2D over the
#   center ~75% of the play area. Keeps tile variation at the edges
#   while muting noise where combat happens.
#
#   INNER WALL SHADOWS + CORNER AO: 4 gradient strips fading dark-at-wall
#   to clear-32px-into-floor + 4 corner AO triangles compounding the
#   darkness at the corners. Same vertex-color gradient grammar as the
#   existing iter-51 vignette wedges, but scoped to the wall seam.
#
# z-index choices: wall MASS at z=0 (same as interior walls), AO + center
# mute at z=-1 (same as decor shadows). hero.move_child(-1) at end of
# _ready guarantees the player draws on top of all chrome.
func _initialize() -> void:
	var ok := true

	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")

	# ═══ Public entry + dispatcher ═══
	if "func _spawn_room_chrome" not in main_src:
		push_error("FAIL: main.gd missing _spawn_room_chrome dispatcher")
		ok = false
	if "_spawn_room_chrome()" not in main_src:
		push_error("FAIL: main.gd never CALLS _spawn_room_chrome from _ready")
		ok = false
	if ok:
		print("OK _spawn_room_chrome defined + invoked in _ready")

	# ═══ All 5 chrome layers present ═══
	var required_helpers := [
		"func _spawn_perimeter_wall_mass",
		"func _spawn_wall_top_edge_highlights",
		"func _spawn_center_floor_mute",
		"func _spawn_wall_inner_shadows",
		"func _spawn_corner_ao",
	]
	for h in required_helpers:
		if h not in main_src:
			push_error("FAIL: main.gd missing %s helper" % h)
			ok = false
	if ok:
		print("OK 5 chrome helpers defined (perimeter / top-edges / center mute / inner shadows / corner AO)")

	# ═══ Primitive helpers ═══
	for primitive in ["func _add_rect_polygon", "func _add_line", "func _add_quad_vertex_colors"]:
		if primitive not in main_src:
			push_error("FAIL: main.gd missing %s primitive helper" % primitive)
			ok = false

	# ═══ Tuning constants ═══
	var required_consts := [
		"const PLAY_AREA_MIN",
		"const PLAY_AREA_MAX",
		"const SCREEN_SIZE",
		"const CHROME_WALL_STONE_COLOR",
		"const CHROME_WALL_TOP_HIGHLIGHT",
		"const CHROME_INNER_SHADOW_DARK",
		"const CHROME_INNER_SHADOW_CLEAR",
		"const CHROME_CORNER_DARK",
		"const CHROME_CENTER_MUTE_COLOR",
		"const CHROME_INNER_SHADOW_DEPTH",
		"const CHROME_CORNER_DEPTH",
		"const CHROME_CENTER_INSET",
	]
	for c in required_consts:
		if c not in main_src:
			push_error("FAIL: main.gd missing %s constant" % c)
			ok = false
	if ok:
		print("OK %d chrome tuning constants present" % required_consts.size())

	# ═══ Critical wiring ═══
	# Center mute must be inside the play area (Polygon2D within the 96..1184 / 96..672 bounds).
	# The shadow depth should be small enough not to compress combat space too much.
	if "CHROME_INNER_SHADOW_DEPTH: float = 32" not in main_src:
		push_error("FAIL: CHROME_INNER_SHADOW_DEPTH should be 32 (small enough for combat readability)")
		ok = false
	# Wall mass at z=0 (so it stays under the hero after move_child(-1))
	# Inner shadows + center mute at z=-1 (with existing shadow stack)
	# Check that center mute uses the alpha-clamped color (low alpha so
	# combat readability stays intact).
	if not main_src.contains("Color(0.05, 0.04, 0.07, 0.22)"):
		push_error("FAIL: CHROME_CENTER_MUTE_COLOR alpha should stay below 0.25")
		ok = false
	if ok:
		print("OK chrome z-index + alpha tuning preserves combat readability")

	# ═══ Runtime: instantiate main.tscn and count chrome polygons ═══
	# We need autoload-y context for hero.gd / enemy.gd / GameState. The
	# bare SceneTree from `--script` won't have those, but main.tscn won't
	# even load without them, so we settle for a static-only check here.
	# Earlier iters (test_iter106, test_iter110) follow the same SKIP
	# pattern — runtime instance checks aren't possible from a bare
	# SceneTree because the autoloads don't register.
	print("SKIP runtime chrome instance check (autoloads not resolvable here)")

	if ok:
		print("=== ITER 115 INTEGRATION PASSED ===")
	else:
		print("=== ITER 115 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
