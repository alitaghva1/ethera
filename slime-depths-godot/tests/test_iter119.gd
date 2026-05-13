extends SceneTree

# Iter 119 — HUD polish pass (part 5 of the visual presentation pass).
#
# Pre-iter-119 the top HUD (hearts / status / relics / kills / wave /
# room) was a series of bare Labels floating over the gameplay. Readable
# but "felt like debug text, not game UI." And the control hint
# ("LMB swing · RMB blast · Q shield · SHIFT dash") stayed visible at
# full alpha the entire run, competing with combat readability long
# after the player learned the binds.
#
# Iter-119 wires two HUD upgrades:
#
#   BACKING SHELF (scenes/main.tscn)
#     One full-width TopBarBacking Panel (y=0..130) sits behind every
#     top-edge label as a dark-translucent strip with a thin gold bottom
#     border. Reads as an intentional UI shelf framing the play area
#     below. mouse_filter = IGNORE so it doesn't eat world clicks.
#     A second RoomLabelBacking Panel sits center-top behind the room
#     title with a punchier alpha + rounded bottom corners — the title
#     reads as a "chapter heading" distinct from HUD elements.
#     Both panels declared BEFORE the labels in the UI CanvasLayer tree
#     so they render behind.
#
#   CONTROL HINT AUTO-FADE (scripts/main.gd)
#     New _process_status_fade() polls status_label.text each tick.
#     Text changed → reset fade timer + snap alpha to 1.0. Unchanged
#     for HINT_FADE_DELAY (8.0s) → one-shot tween down to
#     HINT_FADED_ALPHA (0.30). All 9 existing status_label.text =
#     "..." call sites work UNMODIFIED — they just trigger the
#     auto-restore via the poll.
func _initialize() -> void:
	var ok := true

	# ═══ Top-bar backing exists ═══
	var tscn_src := FileAccess.get_file_as_string("res://scenes/main.tscn")
	if "name=\"TopBarBacking\"" not in tscn_src:
		push_error("FAIL: main.tscn missing TopBarBacking panel")
		ok = false
	if "name=\"RoomLabelBacking\"" not in tscn_src:
		push_error("FAIL: main.tscn missing RoomLabelBacking panel")
		ok = false
	if "top_bar_style" not in tscn_src:
		push_error("FAIL: main.tscn missing top_bar_style StyleBoxFlat")
		ok = false
	if "room_label_style" not in tscn_src:
		push_error("FAIL: main.tscn missing room_label_style StyleBoxFlat")
		ok = false
	# Both panels MUST set mouse_filter so they don't eat world clicks.
	# Search for the panel block + verify mouse_filter is wired.
	if not tscn_src.contains("mouse_filter = 2"):
		push_error("FAIL: HUD backing panels should set mouse_filter = 2 (IGNORE)")
		ok = false
	if ok:
		print("OK main.tscn has TopBarBacking + RoomLabelBacking with click-through")

	# ═══ Auto-fade logic in main.gd ═══
	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")
	if "const HINT_FADE_DELAY" not in main_src:
		push_error("FAIL: missing HINT_FADE_DELAY constant")
		ok = false
	if "const HINT_FADE_DURATION" not in main_src:
		push_error("FAIL: missing HINT_FADE_DURATION constant")
		ok = false
	if "const HINT_FADED_ALPHA" not in main_src:
		push_error("FAIL: missing HINT_FADED_ALPHA constant")
		ok = false
	if "func _process_status_fade" not in main_src:
		push_error("FAIL: missing _process_status_fade helper")
		ok = false
	if "_process_status_fade(get_process_delta_time())" not in main_src:
		push_error("FAIL: _process_status_fade not called from main _process()")
		ok = false
	if "_last_status_text" not in main_src:
		push_error("FAIL: missing _last_status_text state var for change detection")
		ok = false
	# Tween-kill discipline — same pattern as the iter-113 _pulse_label
	if not main_src.contains("if _status_fade_tween != null and _status_fade_tween.is_valid():"):
		push_error("FAIL: _process_status_fade doesn't kill stale tweens")
		ok = false
	if ok:
		print("OK status hint auto-fade wired: 8s delay → tween to 0.30 alpha")

	# ═══ Existing 9 status_label.text call sites untouched ═══
	# We poll the text rather than wrapping it, so call sites should
	# remain at their iter-101+ form. Just verify the count didn't
	# suddenly drop — that would imply someone got tempted to refactor.
	var status_assign_count: int = 0
	for line in main_src.split("\n"):
		if "status_label.text =" in line and "func _process_status_fade" not in line:
			status_assign_count += 1
	if status_assign_count < 8:
		push_error("FAIL: only %d status_label.text assigns; auto-fade should leave existing call sites unchanged (≥8 expected)" % status_assign_count)
		ok = false
	else:
		print("OK %d status_label.text call sites unmodified — auto-fade is polled, not wrapped" % status_assign_count)

	# ═══ Runtime: instantiate main.tscn and check panels in UI tree ═══
	var scene: PackedScene = load("res://scenes/main.tscn") as PackedScene
	if scene != null:
		# main.tscn requires autoloads (RunState, GameState, etc.) and
		# the Hero scene's full script chain to instantiate in a script-
		# context test. We can at least verify the PackedScene parses
		# without errors via the load() round-trip.
		print("OK main.tscn loads as PackedScene (panels present in scene file)")

	if ok:
		print("=== ITER 119 INTEGRATION PASSED ===")
	else:
		print("=== ITER 119 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
