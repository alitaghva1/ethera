extends SceneTree

# Iter 72 integration test — three parallel teams + polish.
#
# Team A: UI/UX bug hunt (8 fixes across pedestal/relic_icon/floor_clear_burst/
#         pickup_banner/chest/shrine/lore_stone)
# Team B: NEW Glyph Warden enemy — persistent ground-hazard placer
# Team C: 4 stat-stick relic redesigns + 4 new FX scenes
func _initialize() -> void:
	var ok := true

	# ═══ TEAM A — UI/UX bug fixes ═══
	# pedestal.gd added is_inside_tree() guards in _sync_offer_panel_height
	var ped_src := FileAccess.get_file_as_string("res://scripts/pedestal.gd")
	if not ped_src.contains("is_inside_tree()"):
		push_error("FAIL: pedestal.gd missing is_inside_tree guards")
		ok = false
	else:
		print("OK pedestal.gd has is_inside_tree guards after await")

	# relic_icon.gd added guard in _show_tooltip after await
	var ri_src := FileAccess.get_file_as_string("res://scripts/relic_icon.gd")
	if not ri_src.contains("is_inside_tree()"):
		push_error("FAIL: relic_icon.gd missing is_inside_tree guard")
		ok = false
	else:
		print("OK relic_icon.gd has is_inside_tree guard in tooltip")

	# floor_clear_burst.gd uses viewport size (not hardcoded 384)
	var fcb_src := FileAccess.get_file_as_string("res://scripts/floor_clear_burst.gd")
	if not fcb_src.contains("get_visible_rect()"):
		push_error("FAIL: floor_clear_burst.gd still hardcoding viewport size")
		ok = false
	else:
		print("OK floor_clear_burst.gd reads viewport size dynamically")

	# pickup_banner.gd has double-spawn guard
	var pb_src := FileAccess.get_file_as_string("res://scripts/pickup_banner.gd")
	if not (pb_src.contains("get_children()") and pb_src.contains("PickupBanner")):
		push_error("FAIL: pickup_banner.gd missing double-spawn guard")
		ok = false
	else:
		print("OK pickup_banner.gd guards against double spawn")

	# Pickup-spawning hosts (chest/shrine/lore_stone/pedestal) null-guard parent
	for f in ["chest", "shrine", "lore_stone", "pedestal"]:
		var src := FileAccess.get_file_as_string("res://scripts/%s.gd" % f)
		# Match either "parent_node != null" or "parent != null" (Team A may have chosen either name)
		if not (src.contains("parent_node != null") or src.contains("parent != null") or src.contains("if parent")):
			push_error("FAIL: %s.gd doesn't null-guard DamageNumber parent" % f)
			ok = false
		else:
			print("OK %s.gd null-guards damage_number parent" % f)

	# ═══ TEAM B — Glyph Warden ═══
	var warden_res: Resource = load("res://scenes/enemies/glyph_warden.tres")
	if warden_res == null:
		push_error("FAIL: glyph_warden.tres failed to load")
		ok = false
	else:
		var beh: String = warden_res.get("behavior")
		var hp: int = warden_res.get("max_hp")
		if beh != "glyph_warden":
			push_error("FAIL: glyph_warden behavior=%s, expected glyph_warden" % beh)
			ok = false
		else:
			print("OK glyph_warden behavior=%s hp=%d" % [beh, hp])

	var trap := load("res://scenes/fx/glyph_trap.tscn")
	if trap == null:
		push_error("FAIL: glyph_trap.tscn failed to load")
		ok = false
	else:
		print("OK glyph_trap.tscn loads")

	var enemy_src := FileAccess.get_file_as_string("res://scripts/enemy.gd")
	if not enemy_src.contains("WardenState"):
		push_error("FAIL: enemy.gd missing WardenState enum")
		ok = false
	elif not enemy_src.contains("_tick_glyph_warden") and not enemy_src.contains("_tick_warden"):
		push_error("FAIL: enemy.gd missing warden tick function")
		ok = false
	else:
		print("OK enemy.gd has WardenState + tick function")

	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")
	if not main_src.contains("glyph_warden"):
		push_error("FAIL: main.gd doesn't register glyph_warden")
		ok = false
	else:
		print("OK main.gd registers glyph_warden")

	# Wired into room_04
	var room04: Resource = load("res://scenes/rooms/room_04.tres")
	if room04 == null:
		push_error("FAIL: room_04.tres failed to load")
		ok = false
	else:
		var has_warden := false
		for wave in room04.get("waves"):
			for entry in wave:
				if typeof(entry) == TYPE_ARRAY and entry.size() >= 1 and str(entry[0]) == "glyph_warden":
					has_warden = true
		if not has_warden:
			push_error("FAIL: room_04 doesn't include glyph_warden")
			ok = false
		else:
			print("OK room_04 includes glyph_warden")

	# ═══ TEAM C — Relic redesigns + new FX ═══
	# Four new FX scenes
	for fx in ["ember_burst", "arcane_bolt", "stone_pulse", "stone_shard_burst"]:
		var scn := load("res://scenes/fx/%s.tscn" % fx)
		if scn == null:
			push_error("FAIL: %s.tscn failed to load" % fx)
			ok = false
		else:
			print("OK %s.tscn loads" % fx)

	# hero.gd has handlers for the 4 redesigned relics
	var hero_src := FileAccess.get_file_as_string("res://scripts/hero.gd")
	if not hero_src.contains("_iron_fang"):
		push_error("FAIL: hero.gd missing iron_fang handler")
		ok = false
	elif not hero_src.contains("_arcane_pulse"):
		push_error("FAIL: hero.gd missing arcane_pulse handler")
		ok = false
	elif not (hero_src.contains("_stoneheart") or hero_src.contains("stoneheart_first_kill")):
		push_error("FAIL: hero.gd missing stoneheart handler")
		ok = false
	elif not (hero_src.contains("_iron_skin") or hero_src.contains("StoneShardBurst")):
		push_error("FAIL: hero.gd missing iron_skin handler")
		ok = false
	else:
		print("OK hero.gd has all 4 redesigned-relic handlers")

	# game_state.gd has the 4 relic ids
	var gs_src := FileAccess.get_file_as_string("res://scripts/game_state.gd")
	for rid in ["iron_fang", "arcane_pulse", "stoneheart", "iron_skin"]:
		if not gs_src.contains(rid):
			push_error("FAIL: game_state.gd missing relic id %s" % rid)
			ok = false
			break
	if ok:
		print("OK game_state.gd has all 4 redesigned relic ids")

	if ok:
		print("=== ITER 72 INTEGRATION PASSED ===")
	else:
		print("=== ITER 72 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
