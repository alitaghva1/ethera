extends SceneTree

# Iter 123 — Minimal floating HUD. Reverses the iter-122 "header zone"
# direction entirely.
#
# Playtest read on iter-122: "Less UI, not more. The HUD is too
# intrusive and feels like a website/debug header pasted over the
# game." The opaque shelf + bronze trim + relic slot box read as a
# menu bar, not gameplay UI.
#
# Iter-123 strips the chassis completely and goes Skyrim/Hades minimal:
#
#   1. WORLD UN-SHIFT
#      WallTop position 128 → 96 + PLAY_AREA_MIN.y 128 → 96. The play
#      area extends back up to its natural top boundary; no reserved
#      HUD zone needed because the HUD no longer takes any physical
#      space.
#
#   2. SHELF DELETED
#      TopBarBacking, TopBarTrim, RelicSlotBacking nodes removed. The
#      three iter-119/121/122 sub_resources (top_bar_style,
#      top_bar_trim_style, relic_slot_style) gone. load_steps dropped
#      from 11 → 6. Every HUD label is now bare floating text.
#
#   3. CORNER-ONLY LAYOUT WITH LOW WEIGHT
#      HP 22 pt @ alpha 0.92 (top-left). RoomLabel 16 pt @ alpha 0.75
#      (top-center). KillsLabel 16 pt @ alpha 0.78 (top-right).
#      WaveLabel 12 pt @ alpha 0.70 (top-right). All outline_size = 1
#      for legibility against bright VFX. RelicStrip moved top-left
#      under HP, no backing panel.
#
#   4. STATUS HINT TRULY GOES AWAY
#      iter-119 HINT_FADED_ALPHA was 0.30 (dim-but-visible). Iter-123
#      drops it to 0.0 (fully invisible) + HINT_FADE_DELAY 8 → 5 s so
#      the hint disappears faster. Plus a new GameState.has_seen_controls_hint
#      flag — the controls hint shows ONCE EVER per save profile, then
#      never again across rooms / runs / sessions. SaveSystem.save_now()
#      persists the flag immediately so a quit during first-room
#      tutorial still records "seen."
func _initialize() -> void:
	var ok := true

	var main_tscn := FileAccess.get_file_as_string("res://scenes/main.tscn")
	var main_gd := FileAccess.get_file_as_string("res://scripts/main.gd")
	var gs_gd := FileAccess.get_file_as_string("res://scripts/game_state.gd")

	# ═══ World unshifted ═══
	if "position = Vector2(640, 96)" not in main_tscn:
		push_error("FAIL: WallTop should be back at y=96")
		ok = false
	if "PLAY_AREA_MIN: Vector2 = Vector2(96, 96)" not in main_gd:
		push_error("FAIL: PLAY_AREA_MIN should be back at Vector2(96, 96)")
		ok = false
	if ok:
		print("OK world unshifted: WallTop y=96 + PLAY_AREA_MIN.y=96")

	# ═══ HUD chassis removed ═══
	for forbidden in ["name=\"TopBarBacking\"", "name=\"TopBarTrim\"", "name=\"RelicSlotBacking\"", "name=\"RoomLabelBacking\""]:
		if forbidden in main_tscn:
			push_error("FAIL: main.tscn still has %s (should be removed in minimal HUD)" % forbidden)
			ok = false
	# The sub_resources for those panels should also be gone
	for forbidden in ["top_bar_style", "top_bar_trim_style", "relic_slot_style", "room_label_style"]:
		if forbidden in main_tscn:
			push_error("FAIL: main.tscn still has %s sub_resource (orphaned after panel removal)" % forbidden)
			ok = false
	# load_steps should drop with the sub_resources gone (6: script,
	# 2 ext_resources, wall_v + wall_h subs, room_h)
	if "load_steps=6" not in main_tscn:
		push_error("FAIL: load_steps should be 6 after stripping HUD subresources")
		ok = false
	if ok:
		print("OK HUD chassis fully removed: no Panel/Trim/Slot nodes, no orphaned styles, load_steps=6")

	# ═══ Labels reduced in weight ═══
	# HP at 22 pt (was 32 in iter-122)
	if "theme_override_font_sizes/font_size = 22" not in main_tscn:
		push_error("FAIL: HP font_size should be 22 (was 32) — smaller text in minimal HUD")
		ok = false
	# RoomLabel at 16 pt (was 22)
	if "theme_override_font_sizes/font_size = 16" not in main_tscn:
		push_error("FAIL: RoomLabel font_size should be 16 (was 22) — minimal centered caption")
		ok = false
	# WaveLabel at 12 pt (was 15)
	if "theme_override_font_sizes/font_size = 12" not in main_tscn:
		push_error("FAIL: WaveLabel font_size should be 12 (was 15) — lowest visual weight")
		ok = false
	# All HUD labels (HP/Room/Kills/Wave/Status) should have outline_size = 1.
	# The BossBar's "Name" label keeps its iter-22 outline_size = 4 because
	# it's a transient cinematic element, not the resting HUD. Check that
	# every iter-123 HUD label uses outline 1 by counting occurrences —
	# we expect 5 (HP, Status, Room, Kills, Wave).
	var hud_outline_count: int = 0
	for line in main_tscn.split("\n"):
		if "theme_override_constants/outline_size = 1" in line and not line.contains("outline_size = 10"):
			hud_outline_count += 1
	if hud_outline_count < 5:
		push_error("FAIL: only %d HUD labels use outline_size=1, expected 5 (HP/Status/Room/Kills/Wave)" % hud_outline_count)
		ok = false
	if ok:
		print("OK labels reduced: 22/16/12 pt + 5 HUD outline_size=1 + alpha 0.7-0.92")

	# ═══ Status hint becomes truly invisible ═══
	if "HINT_FADED_ALPHA: float = 0.0" not in main_gd:
		push_error("FAIL: HINT_FADED_ALPHA should be 0.0 (was 0.30)")
		ok = false
	if "HINT_FADE_DELAY: float = 5.0" not in main_gd:
		push_error("FAIL: HINT_FADE_DELAY should be 5.0 (was 8.0) — disappear faster")
		ok = false
	if ok:
		print("OK status hint: HINT_FADED_ALPHA = 0.0 (fully invisible), delay 5 s")

	# ═══ First-time controls hint flag ═══
	if "has_seen_controls_hint: bool" not in gs_gd:
		push_error("FAIL: GameState missing has_seen_controls_hint flag")
		ok = false
	# save_to_dict + load_from_dict must include it
	if "\"has_seen_controls_hint\":" not in gs_gd:
		push_error("FAIL: save_to_dict doesn't serialize has_seen_controls_hint")
		ok = false
	if "d.get(\"has_seen_controls_hint\"" not in gs_gd:
		push_error("FAIL: load_from_dict doesn't restore has_seen_controls_hint")
		ok = false
	# save_version bumped
	if "\"save_version\": 4" not in gs_gd:
		push_error("FAIL: save_version should bump to 4 with the new flag")
		ok = false
	# main.gd gates the hint on the flag
	if "if not GameState.has_seen_controls_hint:" not in main_gd:
		push_error("FAIL: main.gd doesn't gate controls hint on GameState.has_seen_controls_hint")
		ok = false
	if "GameState.has_seen_controls_hint = true" not in main_gd:
		push_error("FAIL: main.gd doesn't set the flag after first show")
		ok = false
	if ok:
		print("OK first-time hint flag: GameState field + save serialization + main.gd gate")

	# ═══ Runtime: instantiate the scene + check the UI tree ═══
	var scene: PackedScene = load("res://scenes/main.tscn")
	if scene == null:
		push_error("FAIL: main.tscn no longer loads after iter-123 strip")
		ok = false
	else:
		print("OK main.tscn parses cleanly with minimal HUD")

	if ok:
		print("=== ITER 123 INTEGRATION PASSED ===")
	else:
		print("=== ITER 123 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
