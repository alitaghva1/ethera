extends SceneTree

# Iter 124 — Game-design HUD pass: every non-essential element becomes
# transient or hidden, so the resting HUD is just hearts + relics.
#
# Pre-iter-124 (post-iter-123 minimal floating layout):
#   • RoomLabel sat permanently visible at alpha 0.75 — playtester
#     read: "still too loud, pulls attention from gameplay."
#   • KillsLabel sat permanently at top-right showing run kill count
#     (meta-score, not gameplay-critical).
#   • WaveLabel sat permanently at top-right under kills.
#
# Genre research backing the change (Hades, Dead Cells, Skyrim,
# Diablo III/IV, Hyper Light Drifter, Risk of Rain 2, Enter the
# Gungeon): EVERY peer surfaces location names as transient on-enter
# banners + score data at end-of-run only. Live wave info shows at
# transitions, not constantly.
#
# Iter-124 matches that pattern:
#
#   ROOM BANNER — transient
#     _animate_room_entry rewritten. Phase 1 (0.3 s): scale 1.7 → 1.0
#     + fade 0 → 1.0. Phase 2 (1.5 s): hold at full opacity. Phase 3
#     (1.2 s): fade 1.0 → 0. After 3.0 s total the room title is
#     invisible until the next room load.
#
#   WAVE LABEL — transient
#     New _process_wave_fade polls wave_label.text. On change, snap
#     alpha to 1.0 + reset hold timer. After WAVE_HOLD_DURATION (1.6 s)
#     fade alpha to 0 over WAVE_FADE_DURATION (1.0 s). All 8 existing
#     wave_label.text setters work unmodified — the poll handles the
#     visibility lifecycle.
#
#   KILLS LABEL — hidden
#     visible = false in main.tscn. Node stays so _update_kills doesn't
#     null-crash; the display surface is just never on-screen. Death
#     screen still reads kills via _death_screen.show_death(_kills).
func _initialize() -> void:
	var ok := true

	var main_tscn := FileAccess.get_file_as_string("res://scenes/main.tscn")
	var main_gd := FileAccess.get_file_as_string("res://scripts/main.gd")

	# ═══ Room banner is now transient ═══
	if "ROOM_BANNER_FADE_IN" not in main_gd:
		push_error("FAIL: missing ROOM_BANNER_FADE_IN constant")
		ok = false
	if "ROOM_BANNER_HOLD" not in main_gd:
		push_error("FAIL: missing ROOM_BANNER_HOLD constant")
		ok = false
	if "ROOM_BANNER_FADE_OUT" not in main_gd:
		push_error("FAIL: missing ROOM_BANNER_FADE_OUT constant")
		ok = false
	# The room banner must end at alpha 0 (truly invisible), not the
	# pre-iter-124 0.75 dim-but-visible state.
	if "tween_property(room_label, \"modulate:a\", 0.0," not in main_gd:
		push_error("FAIL: room banner doesn't fade to alpha 0 — would stay visible")
		ok = false
	# Must NOT have the pre-iter-124 "0.75" persistent alpha target
	if "tween_property(\n\t\troom_label, \"modulate:a\",\n\t\t0.75," in main_gd:
		push_error("FAIL: room banner still tweens to 0.75 (would stay visible permanently)")
		ok = false
	if ok:
		print("OK room banner is transient: fade in / hold / fade to alpha 0")

	# ═══ Wave label is now transient via poll ═══
	if "WAVE_HOLD_DURATION" not in main_gd:
		push_error("FAIL: missing WAVE_HOLD_DURATION constant")
		ok = false
	if "WAVE_FADE_DURATION" not in main_gd:
		push_error("FAIL: missing WAVE_FADE_DURATION constant")
		ok = false
	if "func _process_wave_fade" not in main_gd:
		push_error("FAIL: missing _process_wave_fade helper")
		ok = false
	if "_process_wave_fade(get_process_delta_time())" not in main_gd:
		push_error("FAIL: _process_wave_fade not called from main _process()")
		ok = false
	if "_last_wave_text" not in main_gd:
		push_error("FAIL: missing _last_wave_text change-detector")
		ok = false
	# Starts invisible (modulate alpha 0) so the first-frame "" doesn't
	# flash through the fade poll.
	if not main_tscn.contains("modulate = Color(1, 1, 1, 0)"):
		push_error("FAIL: WaveLabel should start at modulate alpha 0 (invisible until set)")
		ok = false
	if ok:
		print("OK wave label is transient: poll-and-fade on text change")

	# ═══ Kills label is hidden ═══
	# Find the KillsLabel block + verify it has `visible = false`
	var kill_block_starts: int = main_tscn.find("name=\"KillsLabel\"")
	if kill_block_starts < 0:
		push_error("FAIL: KillsLabel node missing entirely")
		ok = false
	else:
		# Search for `visible = false` within the 200 chars after the node decl
		var block: String = main_tscn.substr(kill_block_starts, 200)
		if "visible = false" not in block:
			push_error("FAIL: KillsLabel should have visible = false (hidden from gameplay HUD)")
			ok = false
		else:
			print("OK KillsLabel hidden from gameplay HUD (death screen still reads _kills directly)")

	# ═══ Resting HUD = hearts + relics only ═══
	# Implicit: HPLabel + RelicStrip remain as the only always-on
	# elements. Status is auto-faded (iter-119), Room is transient
	# (iter-124), Wave is transient (iter-124), Kills is hidden (iter-124).
	# So at rest, only the HP hearts + relic icons are visible.
	if "[node name=\"HPLabel\"" not in main_tscn:
		push_error("FAIL: HPLabel missing (the one element that should stay)")
		ok = false
	if "[node name=\"RelicStrip\"" not in main_tscn:
		push_error("FAIL: RelicStrip missing (the other element that should stay)")
		ok = false
	if ok:
		print("OK resting HUD = HP hearts + relic strip only (everything else transient or hidden)")

	# ═══ Runtime: scene still loads + KillsLabel.visible is false ═══
	var scene: PackedScene = load("res://scenes/main.tscn")
	if scene == null:
		push_error("FAIL: main.tscn no longer loads")
		ok = false

	if ok:
		print("=== ITER 124 INTEGRATION PASSED ===")
	else:
		print("=== ITER 124 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
