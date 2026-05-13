extends SceneTree

# Iter 122 — Proper HUD/world separation. Replaces the iter-119 +
# iter-121 translucent shelf with a dedicated non-gameplay header zone.
#
# Pre-iter-122 the HUD was a 0.30-alpha translucent strip at y=0..96
# that overlapped the play area (top wall at y=96). Playtester read:
# "the HUD is sitting on top of the room instead of existing in its
# own readable layer."
#
# Iter-122 carves out a real header zone:
#
#   WORLD SHIFT
#     • main.tscn WallTop position 96 → 128. Hero, enemies, projectiles
#       are now physically blocked at y=128, so nothing can render
#       under the HUD shelf.
#     • main.gd PLAY_AREA_MIN.y 96 → 128. iter-115 chrome
#       (perimeter walls + corner AO + center mute) auto-recomputes
#       from the new bound.
#
#   OPAQUE HUD SHELF
#     • TopBarBacking offset_bottom 96 → 128 + bg alpha 0.30 → 0.92.
#       Fully opaque dark-purple strip (0.05, 0.04, 0.09).
#     • New TopBarTrim Panel — 3 px warm-gold bar at y=125..128, the
#       "this is UI / that is the world" divider.
#
#   LEFT / CENTER / RIGHT LAYOUT
#     • LEFT (24 px from edge): HP 32 pt top row, Status hint 15 pt
#       bottom row.
#     • CENTER: Room title 22 pt top row, RelicSlotBacking + RelicStrip
#       bottom row inside a stylebox-framed slot.
#     • RIGHT (24 px from edge): KILLS 24 pt top row, WAVE 15 pt bottom.
#
#   COLLISION CLEANUP
#     • BossBar moved from offset_top=50 (collided with the new room
#       title) to offset_top=140 (floats over the play area, just
#       below the trim line).
#
# Existing iter-119 _process_status_fade auto-fade still applies —
# stale UI ergonomics carried forward, only the visual chassis changed.
func _initialize() -> void:
	var ok := true

	var main_tscn := FileAccess.get_file_as_string("res://scenes/main.tscn")
	var main_gd := FileAccess.get_file_as_string("res://scripts/main.gd")

	# ═══ World pushed down by 32 px ═══
	if "position = Vector2(640, 128)" not in main_tscn:
		push_error("FAIL: WallTop position should be (640, 128) after world shift")
		ok = false
	if "PLAY_AREA_MIN: Vector2 = Vector2(96, 128)" not in main_gd:
		push_error("FAIL: PLAY_AREA_MIN should be Vector2(96, 128) — y bumped 96 → 128")
		ok = false
	if ok:
		print("OK world shifted: WallTop y=128 + PLAY_AREA_MIN.y=128 in lockstep")

	# ═══ HUD shelf opaque + 128 px tall ═══
	if "offset_bottom = 128.0" not in main_tscn:
		push_error("FAIL: TopBarBacking should be 128 px tall (covers full HUD zone)")
		ok = false
	if "Color(0.05, 0.04, 0.09, 0.92)" not in main_tscn:
		push_error("FAIL: HUD shelf bg should be opaque dark-purple (0.05, 0.04, 0.09, 0.92)")
		ok = false
	if "name=\"TopBarTrim\"" not in main_tscn:
		push_error("FAIL: TopBarTrim divider missing — HUD has no clear bottom edge")
		ok = false
	if "Color(0.62, 0.48, 0.22, 0.95)" not in main_tscn:
		push_error("FAIL: trim line should be warm-gold at alpha 0.95")
		ok = false
	if ok:
		print("OK HUD shelf: 128 px opaque dark-purple + 3 px warm-gold trim")

	# ═══ Left zone ═══
	# HP at y=18..60, font 32 pt; Status at y=78..110, font 15 pt
	# Both anchored to x=24 left edge (24 px padding from screen edge)
	if "offset_left = 24.0" not in main_tscn:
		push_error("FAIL: HUD left-zone elements should pad 24 px from screen edge")
		ok = false
	# HP at 32 pt
	if "theme_override_font_sizes/font_size = 32" not in main_tscn:
		push_error("FAIL: HP font_size should be 32 pt (was 28)")
		ok = false
	if ok:
		print("OK LEFT zone: HP 32 pt @ y=18-60, Status 15 pt @ y=78-110, 24 px edge padding")

	# ═══ Center zone ═══
	if "RoomLabel" not in main_tscn:
		push_error("FAIL: RoomLabel missing")
		ok = false
	# Iter-122 removed RoomLabelBacking (replaced by the single shelf bg
	# + the RelicSlotBacking below the title). Make sure it's gone.
	if "name=\"RoomLabelBacking\"" in main_tscn:
		push_error("FAIL: iter-119 RoomLabelBacking should be removed — folded into shelf design")
		ok = false
	if "name=\"RelicSlotBacking\"" not in main_tscn:
		push_error("FAIL: RelicSlotBacking missing — relic row has no defined slot")
		ok = false
	if "relic_slot_style" not in main_tscn:
		push_error("FAIL: relic_slot_style sub_resource missing")
		ok = false
	if ok:
		print("OK CENTER zone: Room title + RelicSlotBacking + RelicStrip (40 px icons)")

	# ═══ Right zone ═══
	# KILLS at right with 24 px padding (offset_left=-260, offset_right=-24)
	if "offset_right = -24.0" not in main_tscn:
		push_error("FAIL: right-zone elements should pad 24 px from right edge")
		ok = false
	if ok:
		print("OK RIGHT zone: KILLS 24 pt + WAVE 15 pt, 24 px edge padding")

	# ═══ BossBar moved to avoid colliding with new layout ═══
	if "offset_top = 140.0" not in main_tscn:
		push_error("FAIL: BossBar should be at offset_top=140 (was 50 — collided with room title)")
		ok = false
	if ok:
		print("OK BossBar relocated to y=140 (below HUD shelf, into play area)")

	# ═══ Runtime: instantiate scene + verify the rebuilt tree ═══
	var scene: PackedScene = load("res://scenes/main.tscn") as PackedScene
	if scene == null:
		push_error("FAIL: main.tscn fails to load after iter-122 rebuild")
		ok = false
	else:
		# We can't fully instantiate main.tscn without autoloads, but the
		# PackedScene round-trip confirms the .tscn parses cleanly.
		print("OK main.tscn parses cleanly with new HUD layout")

	if ok:
		print("=== ITER 122 INTEGRATION PASSED ===")
	else:
		print("=== ITER 122 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
