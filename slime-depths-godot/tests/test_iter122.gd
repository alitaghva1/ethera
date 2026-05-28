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

	# iter-122 designed an opaque-shelf HUD with a 32-px world shift +
	# bronze trim + relic slot box. iter-123 reversed the whole direction
	# in response to playtest feedback ("less UI, not more"): world un-
	# shifted to y=96, shelf removed, labels stripped to minimal floating
	# text. The iter-122 assertions are therefore historical and retired
	# rather than load-bearing — test_iter123.gd documents the current
	# HUD contract end-to-end.
	print("OK iter-122 shelf design superseded by iter-123 minimal HUD")

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
